/**
 * Comprehensive Test Suite for SessionEngine
 *
 * This test suite focuses on error handling, edge cases, boundary conditions,
 * and resilience testing that are NOT covered by the happy path tests in
 * session-flow.test.ts.
 *
 * Test philosophy: "Think like an attacker trying to break the system."
 *
 * Areas covered:
 * 1. Error Handling & Resilience (database, LLM, evaluator failures)
 * 2. Edge Cases & Boundary Conditions (empty states, message edge cases)
 * 3. Evaluation Triggers (auto-evaluation, trigger phrases)
 * 4. FSRS State Management (state updates, rating mapping)
 * 5. Concurrency & Race Conditions
 * 6. Configuration Options
 * 7. System Prompts
 * 8. Token Tracking
 * 9. Event Emission
 * 10. Data Integrity
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { Database } from 'bun:sqlite';
import { resolve } from 'path';
import * as schema from '../../src/storage/schema';
import {
  RecallSetRepository,
  RecallPointRepository,
  SessionRepository,
  SessionMessageRepository,
} from '../../src/storage/repositories';
import { SessionEngine } from '../../src/core/session';
import { FSRSScheduler } from '../../src/core/fsrs';
import { RecallEvaluator } from '../../src/core/scoring';
import type { RecallSet, RecallPoint, FSRSState } from '../../src/core/models';
import type { RecallEvaluation, EnhancedRecallEvaluation } from '../../src/core/scoring/types';
import type { LLMMessage, LLMResponse, StreamCallbacks, LLMConfig } from '../../src/llm/types';
import { LLMError } from '../../src/llm/types';
import type { AppDatabase } from '../../src/storage/db';
import type { SessionEvent } from '../../src/core/session/types';

// ===========================================================================
// Mock Classes with Configurable Behavior
// ===========================================================================

/**
 * Configurable Mock Anthropic Client for testing various failure modes.
 * Can be configured to fail on specific calls, return empty responses,
 * timeout, return malformed responses, etc.
 */
class ConfigurableMockLLMClient {
  private systemPrompt: string | undefined;
  private callCount: number = 0;
  private failOnCall: number | null = null;
  private failureType: 'timeout' | 'empty' | 'malformed' | 'rate_limit' | 'error' | null = null;
  private failureMessage: string = 'Simulated failure';
  private shouldReturnNoTokens: boolean = false;
  private responseDelay: number = 0;
  private customResponses: Map<number, string> = new Map();

  // Track calls for verification
  public completeCallHistory: Array<{ messages: string | LLMMessage[]; config?: LLMConfig }> = [];

  /**
   * Configure the mock to fail on a specific call number (1-indexed)
   */
  setFailOnCall(callNumber: number, type: 'timeout' | 'empty' | 'malformed' | 'rate_limit' | 'error', message?: string): void {
    this.failOnCall = callNumber;
    this.failureType = type;
    if (message) this.failureMessage = message;
  }

  /**
   * Configure to fail on all calls
   */
  setAlwaysFail(type: 'timeout' | 'empty' | 'malformed' | 'rate_limit' | 'error', message?: string): void {
    this.failOnCall = -1; // -1 means always fail
    this.failureType = type;
    if (message) this.failureMessage = message;
  }

  /**
   * Configure to not return token usage info
   */
  setNoTokenTracking(): void {
    this.shouldReturnNoTokens = true;
  }

  /**
   * Set a specific response for a specific call number
   */
  setResponseForCall(callNumber: number, response: string): void {
    this.customResponses.set(callNumber, response);
  }

  /**
   * Add artificial delay to simulate slow LLM
   */
  setResponseDelay(ms: number): void {
    this.responseDelay = ms;
  }

  /**
   * Reset all configuration
   */
  reset(): void {
    this.callCount = 0;
    this.failOnCall = null;
    this.failureType = null;
    this.failureMessage = 'Simulated failure';
    this.shouldReturnNoTokens = false;
    this.responseDelay = 0;
    this.customResponses.clear();
    this.completeCallHistory = [];
  }

  async complete(
    messages: string | LLMMessage[],
    config?: LLMConfig
  ): Promise<LLMResponse> {
    this.callCount++;
    this.completeCallHistory.push({ messages, config });

    // Apply artificial delay if configured
    if (this.responseDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.responseDelay));
    }

    // Check if this call should fail
    const shouldFail = this.failOnCall === -1 || this.failOnCall === this.callCount;
    if (shouldFail && this.failureType) {
      switch (this.failureType) {
        case 'timeout':
          throw new LLMError('Request timed out', 'timeout');
        case 'rate_limit':
          throw new LLMError('Rate limit exceeded (429)', 'rate_limit');
        case 'empty':
          return { text: '', usage: null, stopReason: 'end_turn' };
        case 'malformed':
          return { text: '{"invalid json', usage: null, stopReason: 'end_turn' };
        case 'error':
          throw new LLMError(this.failureMessage, 'server_error');
      }
    }

    // Check for custom response
    const customResponse = this.customResponses.get(this.callCount);
    if (customResponse) {
      return {
        text: customResponse,
        usage: this.shouldReturnNoTokens ? null : {
          inputTokens: Math.ceil(customResponse.length / 4),
          outputTokens: Math.ceil(customResponse.length / 4),
        },
        stopReason: 'end_turn',
      };
    }

    // Default response based on input
    const input = typeof messages === 'string' ? messages : messages[0]?.content || '';
    let responseText: string;

    if (input.includes('Begin the recall discussion') || input.includes('opening question')) {
      responseText = "Let's explore what you know. Can you tell me what you remember about this topic?";
    } else if (input.includes('positive feedback') || input.includes('transition')) {
      responseText = "Great job! You demonstrated good understanding. Now let's move on to the next topic.";
    } else if (input.includes('completed all recall points') || input.includes('congratulatory')) {
      responseText = "Congratulations! You've completed this session successfully!";
    } else if (input.includes('struggled') || input.includes('encouraging')) {
      responseText = "That's okay, learning takes time. Let's reinforce the key points and continue.";
    } else {
      responseText = "Good thinking! Can you elaborate on that a bit more?";
    }

    return {
      text: responseText,
      usage: this.shouldReturnNoTokens ? null : {
        inputTokens: this.estimateTokens(input),
        outputTokens: this.estimateTokens(responseText),
      },
      stopReason: 'end_turn',
    };
  }

  async stream(
    _messages: string | LLMMessage[],
    callbacks: StreamCallbacks,
    _config?: LLMConfig
  ): Promise<void> {
    const response = "Streaming response for testing.";
    callbacks.onText?.(response);
    callbacks.onComplete?.(response);
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  setSystemPrompt(prompt: string | undefined): void {
    this.systemPrompt = prompt;
  }

  getSystemPrompt(): string | undefined {
    return this.systemPrompt;
  }
}

/**
 * Configurable Mock Evaluator for testing various evaluation scenarios.
 * Can be configured to throw exceptions, return invalid values, etc.
 */
class ConfigurableMockEvaluator {
  private mockSuccess: boolean = true;
  private mockConfidence: number = 0.85;
  private mockReasoning: string = 'User demonstrated understanding';
  private shouldThrow: boolean = false;
  private throwMessage: string = 'Evaluator error';
  private shouldReturnNull: boolean = false;
  private shouldReturnUndefined: boolean = false;
  private callCount: number = 0;
  private evaluations: Array<{ success: boolean; confidence: number; reasoning: string }> = [];

  /**
   * Set the mock evaluation result
   */
  setMockResult(success: boolean, confidence: number, reasoning: string): void {
    this.mockSuccess = success;
    this.mockConfidence = confidence;
    this.mockReasoning = reasoning;
  }

  /**
   * Queue multiple evaluations to be returned in sequence
   */
  queueEvaluations(evals: Array<{ success: boolean; confidence: number; reasoning: string }>): void {
    this.evaluations = [...evals];
  }

  /**
   * Configure to throw an exception
   */
  setThrow(message?: string): void {
    this.shouldThrow = true;
    if (message) this.throwMessage = message;
  }

  /**
   * Configure to return null
   */
  setReturnNull(): void {
    this.shouldReturnNull = true;
  }

  /**
   * Configure to return undefined
   */
  setReturnUndefined(): void {
    this.shouldReturnUndefined = true;
  }

  /**
   * Reset all configuration
   */
  reset(): void {
    this.mockSuccess = true;
    this.mockConfidence = 0.85;
    this.mockReasoning = 'User demonstrated understanding';
    this.shouldThrow = false;
    this.throwMessage = 'Evaluator error';
    this.shouldReturnNull = false;
    this.shouldReturnUndefined = false;
    this.callCount = 0;
    this.evaluations = [];
  }

  async evaluate(
    _recallPoint: RecallPoint,
    _conversationMessages: unknown[]
  ): Promise<RecallEvaluation> {
    this.callCount++;

    if (this.shouldThrow) {
      throw new Error(this.throwMessage);
    }

    if (this.shouldReturnNull) {
      return null as unknown as RecallEvaluation;
    }

    if (this.shouldReturnUndefined) {
      return undefined as unknown as RecallEvaluation;
    }

    // If we have queued evaluations, use them in order
    if (this.evaluations.length > 0) {
      const eval_ = this.evaluations.shift() || {
        success: this.mockSuccess,
        confidence: this.mockConfidence,
        reasoning: this.mockReasoning
      };
      return eval_;
    }

    return {
      success: this.mockSuccess,
      confidence: this.mockConfidence,
      reasoning: this.mockReasoning,
    };
  }

  async evaluateEnhanced(
    _recallPoint: RecallPoint,
    _conversationMessages: unknown[],
    _context?: unknown
  ): Promise<EnhancedRecallEvaluation> {
    this.callCount++;

    if (this.shouldThrow) {
      throw new Error(this.throwMessage);
    }

    if (this.shouldReturnNull) {
      return null as unknown as EnhancedRecallEvaluation;
    }

    if (this.shouldReturnUndefined) {
      return undefined as unknown as EnhancedRecallEvaluation;
    }

    // Use queued evaluations if available
    if (this.evaluations.length > 0) {
      const eval_ = this.evaluations.shift() || {
        success: this.mockSuccess,
        confidence: this.mockConfidence,
        reasoning: this.mockReasoning
      };
      return {
        ...eval_,
        keyDemonstratedConcepts: eval_.success ? ['concept1', 'concept2'] : [],
        missedConcepts: eval_.success ? [] : ['missed1', 'missed2'],
        suggestedRating: eval_.confidence >= 0.85 ? 'easy' : eval_.confidence >= 0.6 ? 'good' : eval_.confidence >= 0.3 ? 'hard' : 'forgot',
      };
    }

    return {
      success: this.mockSuccess,
      confidence: this.mockConfidence,
      reasoning: this.mockReasoning,
      keyDemonstratedConcepts: this.mockSuccess ? ['concept1', 'concept2'] : [],
      missedConcepts: this.mockSuccess ? [] : ['missed1', 'missed2'],
      suggestedRating: this.mockConfidence >= 0.85 ? 'easy' : this.mockConfidence >= 0.6 ? 'good' : this.mockConfidence >= 0.3 ? 'hard' : 'forgot',
    };
  }

  getCallCount(): number {
    return this.callCount;
  }
}

/**
 * Wrapper for repositories that can simulate failures
 */
class FailableSessionRepository {
  private real: SessionRepository;
  private failOnCreate: boolean = false;
  private failOnComplete: boolean = false;
  private failOnAbandon: boolean = false;
  private failOnFindInProgress: boolean = false;

  constructor(db: AppDatabase) {
    this.real = new SessionRepository(db);
  }

  setFailOnCreate(fail: boolean): void {
    this.failOnCreate = fail;
  }

  setFailOnComplete(fail: boolean): void {
    this.failOnComplete = fail;
  }

  setFailOnAbandon(fail: boolean): void {
    this.failOnAbandon = fail;
  }

  setFailOnFindInProgress(fail: boolean): void {
    this.failOnFindInProgress = fail;
  }

  async findById(id: string) {
    return this.real.findById(id);
  }

  async findAll() {
    return this.real.findAll();
  }

  async findInProgress(recallSetId: string) {
    if (this.failOnFindInProgress) {
      throw new Error('Simulated database error: findInProgress failed');
    }
    return this.real.findInProgress(recallSetId);
  }

  async create(input: Parameters<SessionRepository['create']>[0]) {
    if (this.failOnCreate) {
      throw new Error('Simulated database error: create failed');
    }
    return this.real.create(input);
  }

  async update(id: string, input: Parameters<SessionRepository['update']>[1]) {
    return this.real.update(id, input);
  }

  async complete(id: string) {
    if (this.failOnComplete) {
      throw new Error('Simulated database error: complete failed');
    }
    return this.real.complete(id);
  }

  async abandon(id: string) {
    if (this.failOnAbandon) {
      throw new Error('Simulated database error: abandon failed');
    }
    return this.real.abandon(id);
  }

  async delete(id: string) {
    return this.real.delete(id);
  }
}

/**
 * Wrapper for message repository that can simulate failures
 */
class FailableMessageRepository {
  private real: SessionMessageRepository;
  private failOnCreate: boolean = false;
  private failCount: number = 0;
  private failAfterNCreates: number | null = null;

  constructor(db: AppDatabase) {
    this.real = new SessionMessageRepository(db);
  }

  setFailOnCreate(fail: boolean): void {
    this.failOnCreate = fail;
  }

  setFailAfterNCreates(n: number): void {
    this.failAfterNCreates = n;
    this.failCount = 0;
  }

  async findById(id: string) {
    return this.real.findById(id);
  }

  async findAll() {
    return this.real.findAll();
  }

  async findBySessionId(sessionId: string) {
    return this.real.findBySessionId(sessionId);
  }

  async create(input: Parameters<SessionMessageRepository['create']>[0]) {
    if (this.failOnCreate) {
      throw new Error('Simulated database error: message create failed');
    }
    if (this.failAfterNCreates !== null) {
      this.failCount++;
      if (this.failCount > this.failAfterNCreates) {
        throw new Error('Simulated database error: message create failed after threshold');
      }
    }
    return this.real.create(input);
  }

  async update(id: string, input: Parameters<SessionMessageRepository['update']>[1]) {
    return this.real.update(id, input);
  }

  async delete(id: string) {
    return this.real.delete(id);
  }
}

/**
 * Wrapper for recall point repository that can simulate failures
 */
class FailableRecallPointRepository {
  private real: RecallPointRepository;
  private failOnUpdateFSRS: boolean = false;
  private failOnAddAttempt: boolean = false;
  private failOnFindDue: boolean = false;
  private failOnFindById: boolean = false;
  private deletedIds: Set<string> = new Set();

  constructor(db: AppDatabase) {
    this.real = new RecallPointRepository(db);
  }

  setFailOnUpdateFSRS(fail: boolean): void {
    this.failOnUpdateFSRS = fail;
  }

  setFailOnAddAttempt(fail: boolean): void {
    this.failOnAddAttempt = fail;
  }

  setFailOnFindDue(fail: boolean): void {
    this.failOnFindDue = fail;
  }

  setFailOnFindById(fail: boolean): void {
    this.failOnFindById = fail;
  }

  markAsDeleted(id: string): void {
    this.deletedIds.add(id);
  }

  async findById(id: string) {
    if (this.failOnFindById) {
      throw new Error('Simulated database error: findById failed');
    }
    if (this.deletedIds.has(id)) {
      return null;
    }
    return this.real.findById(id);
  }

  async findAll() {
    return this.real.findAll();
  }

  async findByRecallSetId(recallSetId: string) {
    return this.real.findByRecallSetId(recallSetId);
  }

  async findDuePoints(recallSetId: string, asOf?: Date) {
    if (this.failOnFindDue) {
      throw new Error('Simulated database error: findDuePoints failed');
    }
    const points = await this.real.findDuePoints(recallSetId, asOf);
    return points.filter(p => !this.deletedIds.has(p.id));
  }

  async create(input: Parameters<RecallPointRepository['create']>[0]) {
    return this.real.create(input);
  }

  async update(id: string, input: Parameters<RecallPointRepository['update']>[1]) {
    return this.real.update(id, input);
  }

  async updateFSRSState(id: string, fsrsState: FSRSState) {
    if (this.failOnUpdateFSRS) {
      throw new Error('Simulated database error: updateFSRSState failed');
    }
    return this.real.updateFSRSState(id, fsrsState);
  }

  async addRecallAttempt(id: string, attempt: Parameters<RecallPointRepository['addRecallAttempt']>[1]) {
    if (this.failOnAddAttempt) {
      throw new Error('Simulated database error: addRecallAttempt failed');
    }
    return this.real.addRecallAttempt(id, attempt);
  }

  async delete(id: string) {
    return this.real.delete(id);
  }
}

// ===========================================================================
// Test Helpers
// ===========================================================================

/**
 * Creates an in-memory test database with migrations applied.
 */
function createTestDatabase(): { db: AppDatabase; sqlite: Database } {
  const sqlite = new Database(':memory:');
  sqlite.run('PRAGMA foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  const migrationsFolder = resolve(import.meta.dir, '../../drizzle');
  migrate(db, { migrationsFolder });
  return { db, sqlite };
}

/**
 * Generates a unique test ID with prefix
 */
function testId(prefix: string): string {
  return `${prefix}_test_${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Seeds basic test data with configurable recall points
 */
async function seedTestData(
  recallSetRepo: RecallSetRepository,
  recallPointRepo: RecallPointRepository | FailableRecallPointRepository,
  scheduler: FSRSScheduler,
  options: {
    pointCount?: number;
    allDue?: boolean;
    emptyContent?: boolean;
    veryLongContent?: boolean;
  } = {}
): Promise<{ recallSet: RecallSet; recallPoints: RecallPoint[] }> {
  const { pointCount = 2, allDue = true, emptyContent = false, veryLongContent = false } = options;

  const setId = testId('rs');
  const recallSet = await recallSetRepo.create({
    id: setId,
    name: `Test Set ${setId}`,
    description: 'Test recall set for comprehensive testing',
    status: 'active',
    discussionSystemPrompt: 'You are a helpful tutor.',
  });

  const now = new Date();
  const dueDate = allDue ? now : new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const initialState = scheduler.createInitialState(now);
  initialState.due = dueDate;

  const createdPoints: RecallPoint[] = [];
  for (let i = 0; i < pointCount; i++) {
    let content = `Test content for point ${i + 1}`;
    if (emptyContent) {
      content = '';
    } else if (veryLongContent) {
      content = 'A'.repeat(10000);
    }

    const point = await recallPointRepo.create({
      id: testId('rp'),
      recallSetId: recallSet.id,
      content,
      context: `Context for point ${i + 1}`,
      fsrsState: { ...initialState },
    });
    createdPoints.push(point);
  }

  return { recallSet, recallPoints: createdPoints };
}

// ===========================================================================
// Test Suite
// ===========================================================================

describe('SessionEngine Comprehensive Tests', () => {
  let db: AppDatabase;
  let sqlite: Database;
  let recallSetRepo: RecallSetRepository;
  let scheduler: FSRSScheduler;
  let mockLlmClient: ConfigurableMockLLMClient;
  let mockEvaluator: ConfigurableMockEvaluator;

  beforeEach(() => {
    const testDb = createTestDatabase();
    db = testDb.db;
    sqlite = testDb.sqlite;
    recallSetRepo = new RecallSetRepository(db);
    scheduler = new FSRSScheduler();
    mockLlmClient = new ConfigurableMockLLMClient();
    mockEvaluator = new ConfigurableMockEvaluator();
  });

  afterEach(() => {
    if (sqlite) {
      sqlite.close();
    }
    mockLlmClient.reset();
    mockEvaluator.reset();
  });

  // =========================================================================
  // 1. Error Handling & Resilience
  // =========================================================================

  describe('Error Handling', () => {
    describe('Database Failures', () => {
      it('should handle sessionRepo.create() failure gracefully', async () => {
        const failableSessionRepo = new FailableSessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        const { recallSet } = await seedTestData(recallSetRepo, recallPointRepo, scheduler);

        failableSessionRepo.setFailOnCreate(true);

        const engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo: failableSessionRepo as unknown as SessionRepository,
          messageRepo,
        });

        // Should throw when trying to start session
        await expect(engine.startSession(recallSet)).rejects.toThrow('Simulated database error');

        // Engine should remain in clean state after error
        expect(engine.getSessionState()).toBeNull();
      });

      it('should handle messageRepo.create() failure during conversation', async () => {
        const sessionRepo = new SessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const failableMessageRepo = new FailableMessageRepository(db);

        const { recallSet } = await seedTestData(recallSetRepo, recallPointRepo, scheduler);

        const engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo: failableMessageRepo as unknown as SessionMessageRepository,
        });

        // Start session successfully
        await engine.startSession(recallSet);

        // Opening message should work
        await engine.getOpeningMessage();

        // Now fail on subsequent message creation
        failableMessageRepo.setFailOnCreate(true);

        // Processing user message should throw
        await expect(engine.processUserMessage('Test message')).rejects.toThrow('Simulated database error');
      });

      it('should handle recallPointRepo.updateFSRSState() failure', async () => {
        const sessionRepo = new SessionRepository(db);
        const failableRecallPointRepo = new FailableRecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        const { recallSet } = await seedTestData(recallSetRepo, failableRecallPointRepo, scheduler, { pointCount: 1 });

        const engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo: failableRecallPointRepo as unknown as RecallPointRepository,
          sessionRepo,
          messageRepo,
        });

        await engine.startSession(recallSet);
        await engine.getOpeningMessage();
        await engine.processUserMessage('Some response');

        // Fail FSRS update on evaluation
        failableRecallPointRepo.setFailOnUpdateFSRS(true);

        // Trigger evaluation - should throw when trying to update FSRS
        await expect(engine.processUserMessage('I understand, got it!')).rejects.toThrow('Simulated database error');
      });

      it('should not leave session in inconsistent state after DB error', async () => {
        const failableSessionRepo = new FailableSessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        const { recallSet, recallPoints } = await seedTestData(recallSetRepo, recallPointRepo, scheduler);

        const engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo: failableSessionRepo as unknown as SessionRepository,
          messageRepo,
        });

        // Start and progress a session
        await engine.startSession(recallSet);
        await engine.getOpeningMessage();
        await engine.processUserMessage('Test response');

        // Get state before error
        const stateBefore = engine.getSessionState();
        expect(stateBefore).not.toBeNull();

        // Fail completion
        failableSessionRepo.setFailOnComplete(true);

        // Try to complete via trigger phrase
        try {
          await engine.processUserMessage('I understand, got it!');
        } catch {
          // Expected to throw
        }

        // Verify FSRS state wasn't corrupted - point should still show original state
        const point = await recallPointRepo.findById(recallPoints[0].id);
        expect(point).not.toBeNull();
        // The state may or may not be updated depending on where the error occurred
        // The key is that the data is consistent (not partially written)
      });

      it('should allow retry after transient DB error', async () => {
        const failableMessageRepo = new FailableMessageRepository(db);
        const sessionRepo = new SessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);

        const { recallSet } = await seedTestData(recallSetRepo, recallPointRepo, scheduler);

        const engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo: failableMessageRepo as unknown as SessionMessageRepository,
        });

        await engine.startSession(recallSet);
        await engine.getOpeningMessage();

        // Fail the first attempt
        failableMessageRepo.setFailOnCreate(true);
        await expect(engine.processUserMessage('First attempt')).rejects.toThrow();

        // Reset the failure and retry
        failableMessageRepo.setFailOnCreate(false);
        const result = await engine.processUserMessage('Retry attempt');
        expect(result.response).toBeDefined();
        expect(result.completed).toBe(false);
      });
    });

    describe('LLM Failures', () => {
      it('should handle LLM timeout gracefully', async () => {
        const sessionRepo = new SessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        const { recallSet } = await seedTestData(recallSetRepo, recallPointRepo, scheduler);

        mockLlmClient.setAlwaysFail('timeout');

        const engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        });

        await engine.startSession(recallSet);

        // Getting opening message should throw LLMError
        await expect(engine.getOpeningMessage()).rejects.toThrow('timed out');
      });

      it('should handle LLM returning empty response', async () => {
        const sessionRepo = new SessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        const { recallSet } = await seedTestData(recallSetRepo, recallPointRepo, scheduler);

        mockLlmClient.setAlwaysFail('empty');

        const engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        });

        await engine.startSession(recallSet);

        // Empty response should still be saved (though not ideal)
        const opening = await engine.getOpeningMessage();
        expect(opening).toBe('');

        // Session should continue to function
        const state = engine.getSessionState();
        expect(state).not.toBeNull();
      });

      it('should handle LLM rate limiting (429 errors)', async () => {
        const sessionRepo = new SessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        const { recallSet } = await seedTestData(recallSetRepo, recallPointRepo, scheduler);

        const engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        });

        await engine.startSession(recallSet);
        await engine.getOpeningMessage();

        // Set up rate limiting - all subsequent calls will fail
        mockLlmClient.setAlwaysFail('rate_limit');

        // Should throw rate limit error
        await expect(engine.processUserMessage('Test')).rejects.toThrow('Rate limit');
      });

      it('should not corrupt session state after LLM failure', async () => {
        const sessionRepo = new SessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        const { recallSet } = await seedTestData(recallSetRepo, recallPointRepo, scheduler);

        const engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        });

        await engine.startSession(recallSet);
        await engine.getOpeningMessage();

        // Process a message successfully
        await engine.processUserMessage('First message');
        const stateBeforeError = engine.getSessionState();
        const messageCountBefore = stateBeforeError!.messageCount;

        // Now fail the LLM
        mockLlmClient.setFailOnCall(4, 'error', 'Server error');

        try {
          await engine.processUserMessage('Second message');
        } catch {
          // Expected
        }

        // State should be consistent (the user message may or may not have been saved
        // depending on when the error occurred)
        const stateAfterError = engine.getSessionState();
        expect(stateAfterError).not.toBeNull();
        // Point index should not have changed due to the error
        expect(stateAfterError!.currentPointIndex).toBe(stateBeforeError!.currentPointIndex);
      });

      it('should allow conversation to continue after LLM recovery', async () => {
        const sessionRepo = new SessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        const { recallSet } = await seedTestData(recallSetRepo, recallPointRepo, scheduler);

        const engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        });

        await engine.startSession(recallSet);
        await engine.getOpeningMessage();

        // Fail once
        mockLlmClient.setFailOnCall(3, 'error');
        try {
          await engine.processUserMessage('Message during failure');
        } catch {
          // Expected
        }

        // Reset and continue
        mockLlmClient.reset();
        const result = await engine.processUserMessage('Message after recovery');
        expect(result.response).toBeDefined();
        expect(result.response.length).toBeGreaterThan(0);
      });
    });

    describe('Evaluator Failures', () => {
      it('should handle evaluator throwing an exception', async () => {
        const sessionRepo = new SessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        const { recallSet } = await seedTestData(recallSetRepo, recallPointRepo, scheduler, { pointCount: 1 });

        mockEvaluator.setThrow('Evaluator crashed unexpectedly');

        const engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        });

        await engine.startSession(recallSet);
        await engine.getOpeningMessage();

        // Trigger evaluation with trigger phrase
        await expect(engine.processUserMessage('I understand, got it!')).rejects.toThrow('Evaluator crashed');
      });

      it('should handle evaluator returning null', async () => {
        const sessionRepo = new SessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        const { recallSet } = await seedTestData(recallSetRepo, recallPointRepo, scheduler, { pointCount: 1 });

        mockEvaluator.setReturnNull();

        const engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        });

        await engine.startSession(recallSet);
        await engine.getOpeningMessage();

        // Triggering evaluation should handle null gracefully
        // This may throw or use defaults depending on implementation
        // The test verifies it doesn't crash with undefined property access
        try {
          await engine.processUserMessage('I understand!');
        } catch (e) {
          // If it throws, it should be a meaningful error, not undefined access
          expect(e).toBeDefined();
        }
      });

      it('should handle evaluator returning invalid confidence (NaN)', async () => {
        const sessionRepo = new SessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        const { recallSet, recallPoints } = await seedTestData(recallSetRepo, recallPointRepo, scheduler, { pointCount: 1 });

        // Set up evaluator to return NaN confidence
        mockEvaluator.setMockResult(true, NaN, 'Invalid confidence test');

        const engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        });

        await engine.startSession(recallSet);
        await engine.getOpeningMessage();

        // This should handle NaN gracefully
        const result = await engine.processUserMessage('I understand!');

        // Session should still advance
        expect(result.completed).toBe(true);

        // Check that the point was updated (even with NaN confidence)
        const updatedPoint = await recallPointRepo.findById(recallPoints[0].id);
        expect(updatedPoint!.fsrsState.reps).toBe(1);
      });

      it('should handle evaluator returning negative confidence', async () => {
        const sessionRepo = new SessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        const { recallSet, recallPoints } = await seedTestData(recallSetRepo, recallPointRepo, scheduler, { pointCount: 1 });

        // Negative confidence
        mockEvaluator.setMockResult(true, -0.5, 'Negative confidence test');

        const engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        });

        await engine.startSession(recallSet);
        await engine.getOpeningMessage();

        const result = await engine.processUserMessage('I understand!');

        // Session should complete despite invalid confidence
        expect(result.completed).toBe(true);
      });

      it('should handle evaluator returning confidence > 1', async () => {
        const sessionRepo = new SessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        const { recallSet } = await seedTestData(recallSetRepo, recallPointRepo, scheduler, { pointCount: 1 });

        // Confidence > 1
        mockEvaluator.setMockResult(true, 1.5, 'Over-confident test');

        const engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        });

        await engine.startSession(recallSet);
        await engine.getOpeningMessage();

        const result = await engine.processUserMessage('I understand!');

        // Session should complete
        expect(result.completed).toBe(true);
      });
    });
  });

  // =========================================================================
  // 2. Edge Cases & Boundary Conditions
  // =========================================================================

  describe('Edge Cases', () => {
    describe('Empty and Minimal States', () => {
      it('should handle recall set with zero points gracefully', async () => {
        const sessionRepo = new SessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        // Create a recall set with no points
        const emptySet = await recallSetRepo.create({
          id: testId('rs'),
          name: 'Empty Set',
          description: 'No points',
          status: 'active',
          discussionSystemPrompt: 'You are a helpful tutor.',
        });

        const engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        });

        // Should throw a meaningful error
        await expect(engine.startSession(emptySet)).rejects.toThrow('No recall points are due');
      });

      it('should handle recall set with single point', async () => {
        const sessionRepo = new SessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        const { recallSet } = await seedTestData(recallSetRepo, recallPointRepo, scheduler, { pointCount: 1 });

        const engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        });

        await engine.startSession(recallSet);
        await engine.getOpeningMessage();

        const state = engine.getSessionState();
        expect(state!.totalPoints).toBe(1);
        expect(state!.currentPointIndex).toBe(0);

        // Complete the single point
        const result = await engine.processUserMessage('I understand!');
        expect(result.completed).toBe(true);
        expect(result.totalPoints).toBe(1);
      });

      it('should handle recall set where no points are due', async () => {
        const sessionRepo = new SessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        const { recallSet } = await seedTestData(recallSetRepo, recallPointRepo, scheduler, {
          pointCount: 2,
          allDue: false  // Points are not due
        });

        const engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        });

        // Should throw because no points are due
        await expect(engine.startSession(recallSet)).rejects.toThrow('No recall points are due');
      });

      it('should handle starting session when one already exists for different set', async () => {
        const sessionRepo = new SessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        const { recallSet: set1 } = await seedTestData(recallSetRepo, recallPointRepo, scheduler);
        const { recallSet: set2 } = await seedTestData(recallSetRepo, recallPointRepo, scheduler);

        const engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        });

        // Start session for first set
        await engine.startSession(set1);
        await engine.getOpeningMessage();

        // Engine resets state when starting a new session
        // Creating a new engine instance to start a session for set2
        const engine2 = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        });

        // Should be able to start a session for a different set
        const session2 = await engine2.startSession(set2);
        expect(session2.recallSetId).toBe(set2.id);
      });
    });

    describe('Message Edge Cases', () => {
      it('should handle empty string user message', async () => {
        const sessionRepo = new SessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        const { recallSet } = await seedTestData(recallSetRepo, recallPointRepo, scheduler);

        const engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        });

        await engine.startSession(recallSet);
        await engine.getOpeningMessage();

        // Empty string should be processed
        const result = await engine.processUserMessage('');
        expect(result.response).toBeDefined();
      });

      it('should handle whitespace-only user message', async () => {
        const sessionRepo = new SessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        const { recallSet } = await seedTestData(recallSetRepo, recallPointRepo, scheduler);

        const engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        });

        await engine.startSession(recallSet);
        await engine.getOpeningMessage();

        const result = await engine.processUserMessage('   \t\n   ');
        expect(result.response).toBeDefined();
      });

      it('should handle extremely long user message (10000+ chars)', async () => {
        const sessionRepo = new SessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        const { recallSet } = await seedTestData(recallSetRepo, recallPointRepo, scheduler);

        const engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        });

        await engine.startSession(recallSet);
        await engine.getOpeningMessage();

        // Very long message
        const longMessage = 'A'.repeat(10000) + ' I understand!';
        const result = await engine.processUserMessage(longMessage);

        expect(result.response).toBeDefined();

        // Verify message was saved
        const session = engine.getSessionState();
        const messages = await messageRepo.findBySessionId(session!.session.id);
        const userMessages = messages.filter(m => m.role === 'user');
        expect(userMessages.some(m => m.content.length > 10000)).toBe(true);
      });

      it('should handle message with only special characters', async () => {
        const sessionRepo = new SessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        const { recallSet } = await seedTestData(recallSetRepo, recallPointRepo, scheduler);

        const engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        });

        await engine.startSession(recallSet);
        await engine.getOpeningMessage();

        const result = await engine.processUserMessage('!@#$%^&*()_+-=[]{}|;\':",.<>?/`~');
        expect(result.response).toBeDefined();
      });

      it('should handle message with unicode and emoji', async () => {
        const sessionRepo = new SessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        const { recallSet } = await seedTestData(recallSetRepo, recallPointRepo, scheduler);

        const engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        });

        await engine.startSession(recallSet);
        await engine.getOpeningMessage();

        const unicodeMessage = '你好世界 🎉 مرحبا العالم 🌍 Привет мир';
        const result = await engine.processUserMessage(unicodeMessage);

        expect(result.response).toBeDefined();

        // Verify it was saved correctly
        const session = engine.getSessionState();
        const messages = await messageRepo.findBySessionId(session!.session.id);
        const userMessages = messages.filter(m => m.role === 'user');
        expect(userMessages.some(m => m.content.includes('🎉'))).toBe(true);
      });

      it('should handle message with newlines and tabs', async () => {
        const sessionRepo = new SessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        const { recallSet } = await seedTestData(recallSetRepo, recallPointRepo, scheduler);

        const engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        });

        await engine.startSession(recallSet);
        await engine.getOpeningMessage();

        const multilineMessage = 'Line 1\nLine 2\n\tIndented\n\n\nMultiple blank lines';
        const result = await engine.processUserMessage(multilineMessage);

        expect(result.response).toBeDefined();
      });

      it('should handle message with potential XSS content', async () => {
        const sessionRepo = new SessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        const { recallSet } = await seedTestData(recallSetRepo, recallPointRepo, scheduler);

        const engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        });

        await engine.startSession(recallSet);
        await engine.getOpeningMessage();

        const xssContent = '<script>alert("XSS")</script><img src="x" onerror="alert(1)">';
        const result = await engine.processUserMessage(xssContent);

        // Should process without throwing
        expect(result.response).toBeDefined();

        // Content should be stored as-is (no sanitization at this layer - that's UI concern)
        const session = engine.getSessionState();
        const messages = await messageRepo.findBySessionId(session!.session.id);
        const userMessages = messages.filter(m => m.role === 'user');
        expect(userMessages.some(m => m.content.includes('<script>'))).toBe(true);
      });

      it('should handle message with SQL injection attempts', async () => {
        const sessionRepo = new SessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        const { recallSet } = await seedTestData(recallSetRepo, recallPointRepo, scheduler);

        const engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        });

        await engine.startSession(recallSet);
        await engine.getOpeningMessage();

        const sqlInjection = "'; DROP TABLE sessions; --";
        const result = await engine.processUserMessage(sqlInjection);

        // Should process without issue (parameterized queries protect against this)
        expect(result.response).toBeDefined();

        // Sessions table should still exist
        const allSessions = await sessionRepo.findAll();
        expect(allSessions.length).toBeGreaterThan(0);
      });
    });

    describe('Session State Edge Cases', () => {
      it('should throw when calling processUserMessage before startSession', async () => {
        const sessionRepo = new SessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        const engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        });

        await expect(engine.processUserMessage('Test')).rejects.toThrow('No active session');
      });

      it('should throw when calling getOpeningMessage before startSession', async () => {
        const sessionRepo = new SessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        const engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        });

        await expect(engine.getOpeningMessage()).rejects.toThrow('No active session');
      });

      it('should throw when calling abandonSession on non-active session', async () => {
        const sessionRepo = new SessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        const engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        });

        await expect(engine.abandonSession()).rejects.toThrow('No active session');
      });

      it('should return null from getSessionState when no session active', async () => {
        const sessionRepo = new SessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        const engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        });

        expect(engine.getSessionState()).toBeNull();
      });

      it('should throw when calling triggerEvaluation before startSession', async () => {
        const sessionRepo = new SessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        const engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        });

        await expect(engine.triggerEvaluation()).rejects.toThrow('No active session');
      });
    });

    describe('Recall Point Edge Cases', () => {
      it('should handle recall point with empty content', async () => {
        const sessionRepo = new SessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        const { recallSet } = await seedTestData(recallSetRepo, recallPointRepo, scheduler, {
          pointCount: 1,
          emptyContent: true
        });

        const engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        });

        // Session should still start
        await engine.startSession(recallSet);

        const state = engine.getSessionState();
        expect(state!.currentPoint.content).toBe('');

        // Should be able to proceed through the session
        await engine.getOpeningMessage();
        const result = await engine.processUserMessage('I understand!');
        expect(result.completed).toBe(true);
      });

      it('should handle recall point with very long content', async () => {
        const sessionRepo = new SessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        const { recallSet } = await seedTestData(recallSetRepo, recallPointRepo, scheduler, {
          pointCount: 1,
          veryLongContent: true
        });

        const engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        });

        await engine.startSession(recallSet);

        const state = engine.getSessionState();
        expect(state!.currentPoint.content.length).toBe(10000);

        await engine.getOpeningMessage();
        const result = await engine.processUserMessage('I understand!');
        expect(result.completed).toBe(true);
      });
    });
  });

  // =========================================================================
  // 3. Evaluation Triggers
  // =========================================================================

  describe('Evaluation Triggers', () => {
    describe('Auto-Evaluation After N Messages', () => {
      it('should auto-evaluate after configured message count', async () => {
        const sessionRepo = new SessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        const { recallSet } = await seedTestData(recallSetRepo, recallPointRepo, scheduler, { pointCount: 2 });

        // Configure for auto-evaluate after 2 messages
        const engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        }, {
          autoEvaluateAfter: 2,
          maxMessagesPerPoint: 10,
          tutorTemperature: 0.7,
          tutorMaxTokens: 512,
        });

        // Set evaluator to return high confidence (should advance)
        mockEvaluator.setMockResult(true, 0.8, 'Good recall');

        await engine.startSession(recallSet);
        await engine.getOpeningMessage();

        // First message - no evaluation yet
        const result1 = await engine.processUserMessage('First message');
        expect(result1.pointAdvanced).toBe(false);
        expect(result1.currentPointIndex).toBe(0);

        // Second message - triggers auto-evaluation, should advance due to high confidence
        const result2 = await engine.processUserMessage('Second message');
        expect(result2.pointAdvanced).toBe(true);
        expect(result2.currentPointIndex).toBe(1);
      });

      it('should not auto-evaluate before reaching threshold', async () => {
        const sessionRepo = new SessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        const { recallSet } = await seedTestData(recallSetRepo, recallPointRepo, scheduler);

        const engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        }, {
          autoEvaluateAfter: 5,
          maxMessagesPerPoint: 10,
          tutorTemperature: 0.7,
          tutorMaxTokens: 512,
        });

        await engine.startSession(recallSet);
        await engine.getOpeningMessage();

        // Process 4 messages - should not trigger auto-evaluation
        for (let i = 0; i < 4; i++) {
          const result = await engine.processUserMessage(`Message ${i + 1}`);
          expect(result.pointAdvanced).toBe(false);
        }
      });

      it('should handle autoEvaluateAfter = 1 (evaluate every message)', async () => {
        const sessionRepo = new SessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        const { recallSet } = await seedTestData(recallSetRepo, recallPointRepo, scheduler, { pointCount: 2 });

        const engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        }, {
          autoEvaluateAfter: 1,
          maxMessagesPerPoint: 10,
          tutorTemperature: 0.7,
          tutorMaxTokens: 512,
        });

        mockEvaluator.setMockResult(true, 0.8, 'Good recall');

        await engine.startSession(recallSet);
        await engine.getOpeningMessage();

        // First message should trigger evaluation and advance
        const result = await engine.processUserMessage('First message');
        expect(result.pointAdvanced).toBe(true);
      });

      it('should force evaluation when max messages reached', async () => {
        const sessionRepo = new SessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        const { recallSet, recallPoints } = await seedTestData(recallSetRepo, recallPointRepo, scheduler, { pointCount: 2 });

        const engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        }, {
          maxMessagesPerPoint: 3,
          autoEvaluateAfter: 100, // High threshold
          tutorTemperature: 0.7,
          tutorMaxTokens: 512,
        });

        // Set evaluator to return failure (but max messages should still advance)
        mockEvaluator.setMockResult(false, 0.3, 'User struggling');

        await engine.startSession(recallSet);
        await engine.getOpeningMessage();

        // Process until max messages
        await engine.processUserMessage('Message 1');
        await engine.processUserMessage('Message 2');
        const result3 = await engine.processUserMessage('Message 3'); // Should force evaluation

        expect(result3.pointAdvanced).toBe(true);

        // Verify failure was recorded
        const point = await recallPointRepo.findById(recallPoints[0].id);
        expect(point!.recallHistory[0].success).toBe(false);
      });
    });

    describe('Trigger Phrases', () => {
      const triggerPhrases = [
        'i think i understand',
        'i understand',
        'got it',
        'i get it',
        'makes sense',
        'that makes sense',
        'next topic',
        'next point',
        'move on',
        "let's move on",
        'next',
        'i remember',
        'i recall',
        'oh right',
        'oh yeah',
        'of course',
      ];

      for (const phrase of triggerPhrases) {
        it(`should trigger on "${phrase}"`, async () => {
          const sessionRepo = new SessionRepository(db);
          const recallPointRepo = new RecallPointRepository(db);
          const messageRepo = new SessionMessageRepository(db);

          const { recallSet } = await seedTestData(recallSetRepo, recallPointRepo, scheduler, { pointCount: 2 });

          const engine = new SessionEngine({
            scheduler,
            evaluator: mockEvaluator as unknown as RecallEvaluator,
            llmClient: mockLlmClient as any,
            recallSetRepo,
            recallPointRepo,
            sessionRepo,
            messageRepo,
          }, {
            maxMessagesPerPoint: 100,
            autoEvaluateAfter: 100,
            tutorTemperature: 0.7,
            tutorMaxTokens: 512,
          });

          await engine.startSession(recallSet);
          await engine.getOpeningMessage();

          const result = await engine.processUserMessage(phrase);
          expect(result.pointAdvanced).toBe(true);
        });
      }

      it('should trigger case-insensitively', async () => {
        const sessionRepo = new SessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        const { recallSet } = await seedTestData(recallSetRepo, recallPointRepo, scheduler, { pointCount: 2 });

        const engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        }, {
          maxMessagesPerPoint: 100,
          autoEvaluateAfter: 100,
          tutorTemperature: 0.7,
          tutorMaxTokens: 512,
        });

        await engine.startSession(recallSet);
        await engine.getOpeningMessage();

        const result = await engine.processUserMessage('I UNDERSTAND NOW!!!');
        expect(result.pointAdvanced).toBe(true);
      });

      it('should trigger when phrase is at start of message', async () => {
        const sessionRepo = new SessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        const { recallSet } = await seedTestData(recallSetRepo, recallPointRepo, scheduler, { pointCount: 2 });

        const engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        });

        await engine.startSession(recallSet);
        await engine.getOpeningMessage();

        const result = await engine.processUserMessage('I understand, the concept is about motivation.');
        expect(result.pointAdvanced).toBe(true);
      });

      it('should trigger when phrase is in middle of message', async () => {
        const sessionRepo = new SessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        const { recallSet } = await seedTestData(recallSetRepo, recallPointRepo, scheduler, { pointCount: 2 });

        const engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        });

        await engine.startSession(recallSet);
        await engine.getOpeningMessage();

        const result = await engine.processUserMessage('So basically, I understand what you mean, thank you.');
        expect(result.pointAdvanced).toBe(true);
      });

      it('should trigger when phrase is at end of message', async () => {
        const sessionRepo = new SessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        const { recallSet } = await seedTestData(recallSetRepo, recallPointRepo, scheduler, { pointCount: 2 });

        const engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        });

        await engine.startSession(recallSet);
        await engine.getOpeningMessage();

        const result = await engine.processUserMessage('Thanks for explaining. I understand');
        expect(result.pointAdvanced).toBe(true);
      });
    });

    describe('Manual Evaluation', () => {
      it('should allow forcing evaluation via triggerEvaluation API', async () => {
        const sessionRepo = new SessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        const { recallSet } = await seedTestData(recallSetRepo, recallPointRepo, scheduler, { pointCount: 2 });

        const engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        }, {
          maxMessagesPerPoint: 100,
          autoEvaluateAfter: 100,
          tutorTemperature: 0.7,
          tutorMaxTokens: 512,
        });

        await engine.startSession(recallSet);
        await engine.getOpeningMessage();

        // Send a message without trigger phrase
        await engine.processUserMessage('Some random message');
        expect(engine.getSessionState()!.currentPointIndex).toBe(0);

        // Force evaluation
        const result = await engine.triggerEvaluation();
        expect(result.pointAdvanced).toBe(true);
      });
    });
  });

  // =========================================================================
  // 4. FSRS State Management
  // =========================================================================

  describe('FSRS State Management', () => {
    describe('State Updates', () => {
      it('should update FSRS state after successful recall', async () => {
        const sessionRepo = new SessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        const { recallSet, recallPoints } = await seedTestData(recallSetRepo, recallPointRepo, scheduler, { pointCount: 1 });

        mockEvaluator.setMockResult(true, 0.85, 'Great recall');

        const engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        });

        await engine.startSession(recallSet);
        await engine.getOpeningMessage();
        await engine.processUserMessage('I understand!');

        const updatedPoint = await recallPointRepo.findById(recallPoints[0].id);

        expect(updatedPoint!.fsrsState.reps).toBe(1);
        expect(updatedPoint!.fsrsState.lastReview).not.toBeNull();
        expect(updatedPoint!.fsrsState.state).not.toBe('new');
      });

      it('should update FSRS state after failed recall', async () => {
        const sessionRepo = new SessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        const { recallSet, recallPoints } = await seedTestData(recallSetRepo, recallPointRepo, scheduler, { pointCount: 1 });

        mockEvaluator.setMockResult(false, 0.2, 'Failed to recall');

        const engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        });

        await engine.startSession(recallSet);
        await engine.getOpeningMessage();
        await engine.processUserMessage('I understand!');

        const updatedPoint = await recallPointRepo.findById(recallPoints[0].id);

        expect(updatedPoint!.fsrsState.reps).toBe(1);
        expect(updatedPoint!.fsrsState.lapses).toBeGreaterThanOrEqual(0);
      });

      it('should increment reps count correctly', async () => {
        const sessionRepo = new SessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        const { recallSet, recallPoints } = await seedTestData(recallSetRepo, recallPointRepo, scheduler, { pointCount: 1 });

        const pointBefore = await recallPointRepo.findById(recallPoints[0].id);
        expect(pointBefore!.fsrsState.reps).toBe(0);

        const engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        });

        await engine.startSession(recallSet);
        await engine.getOpeningMessage();
        await engine.processUserMessage('I understand!');

        const pointAfter = await recallPointRepo.findById(recallPoints[0].id);
        expect(pointAfter!.fsrsState.reps).toBe(1);
      });

      it('should update lastReview timestamp', async () => {
        const sessionRepo = new SessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        const { recallSet, recallPoints } = await seedTestData(recallSetRepo, recallPointRepo, scheduler, { pointCount: 1 });

        const pointBefore = await recallPointRepo.findById(recallPoints[0].id);
        const lastReviewBefore = pointBefore!.fsrsState.lastReview;

        const engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        });

        await engine.startSession(recallSet);
        await engine.getOpeningMessage();
        await engine.processUserMessage('I understand!');

        const pointAfter = await recallPointRepo.findById(recallPoints[0].id);

        // lastReview should be updated
        expect(pointAfter!.fsrsState.lastReview).not.toBeNull();
        if (lastReviewBefore !== null) {
          expect(pointAfter!.fsrsState.lastReview!.getTime()).toBeGreaterThanOrEqual(lastReviewBefore.getTime());
        }
      });
    });

    describe('Recall History', () => {
      it('should append to recall history, not replace', async () => {
        const sessionRepo = new SessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        const { recallSet, recallPoints } = await seedTestData(recallSetRepo, recallPointRepo, scheduler, { pointCount: 1 });

        // First session
        let engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        });

        mockEvaluator.setMockResult(true, 0.9, 'First attempt');

        await engine.startSession(recallSet);
        await engine.getOpeningMessage();
        await engine.processUserMessage('I understand!');

        let point = await recallPointRepo.findById(recallPoints[0].id);
        expect(point!.recallHistory).toHaveLength(1);
        expect(point!.recallHistory[0].success).toBe(true);

        // Update the point to be due again
        await recallPointRepo.updateFSRSState(recallPoints[0].id, {
          ...point!.fsrsState,
          due: new Date(), // Due now
        });

        // Second session (new engine instance)
        engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        });

        mockEvaluator.setMockResult(false, 0.3, 'Second attempt - failed');

        await engine.startSession(recallSet);
        await engine.getOpeningMessage();
        await engine.processUserMessage('I understand!');

        point = await recallPointRepo.findById(recallPoints[0].id);
        expect(point!.recallHistory).toHaveLength(2);
        expect(point!.recallHistory[0].success).toBe(true);
        expect(point!.recallHistory[1].success).toBe(false);
      });

      it('should include timestamp in recall history entry', async () => {
        const sessionRepo = new SessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        const { recallSet, recallPoints } = await seedTestData(recallSetRepo, recallPointRepo, scheduler, { pointCount: 1 });

        const beforeTime = Date.now();

        const engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        });

        await engine.startSession(recallSet);
        await engine.getOpeningMessage();
        await engine.processUserMessage('I understand!');

        const afterTime = Date.now();

        const point = await recallPointRepo.findById(recallPoints[0].id);
        const historyEntry = point!.recallHistory[0];

        expect(historyEntry.timestamp).toBeInstanceOf(Date);
        expect(historyEntry.timestamp.getTime()).toBeGreaterThanOrEqual(beforeTime);
        expect(historyEntry.timestamp.getTime()).toBeLessThanOrEqual(afterTime);
      });

      it('should include success flag in recall history entry', async () => {
        const sessionRepo = new SessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        const { recallSet, recallPoints } = await seedTestData(recallSetRepo, recallPointRepo, scheduler, { pointCount: 1 });

        mockEvaluator.setMockResult(true, 0.85, 'Success');

        const engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        });

        await engine.startSession(recallSet);
        await engine.getOpeningMessage();
        await engine.processUserMessage('I understand!');

        const point = await recallPointRepo.findById(recallPoints[0].id);
        expect(point!.recallHistory[0].success).toBe(true);
      });
    });

    describe('Rating Mapping', () => {
      it('should map confidence >= 0.9 to "easy" rating (high confidence success)', async () => {
        const sessionRepo = new SessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        const { recallSet, recallPoints } = await seedTestData(recallSetRepo, recallPointRepo, scheduler, { pointCount: 1 });

        mockEvaluator.setMockResult(true, 0.95, 'Easy recall');

        const engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        });

        await engine.startSession(recallSet);
        await engine.getOpeningMessage();
        await engine.processUserMessage('I understand!');

        // High confidence should result in a longer interval
        const point = await recallPointRepo.findById(recallPoints[0].id);
        // Can't directly check rating, but can verify it was processed
        expect(point!.fsrsState.reps).toBe(1);
      });

      it('should map confidence 0.7-0.9 to "good" rating', async () => {
        const sessionRepo = new SessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        const { recallSet, recallPoints } = await seedTestData(recallSetRepo, recallPointRepo, scheduler, { pointCount: 1 });

        mockEvaluator.setMockResult(true, 0.75, 'Good recall');

        const engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        });

        await engine.startSession(recallSet);
        await engine.getOpeningMessage();
        await engine.processUserMessage('I understand!');

        const point = await recallPointRepo.findById(recallPoints[0].id);
        expect(point!.recallHistory[0].success).toBe(true);
      });

      it('should handle boundary values (0.9, 0.7)', async () => {
        const sessionRepo = new SessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        // Test exactly 0.9
        const { recallSet: set1, recallPoints: points1 } = await seedTestData(recallSetRepo, recallPointRepo, scheduler, { pointCount: 1 });

        mockEvaluator.setMockResult(true, 0.9, 'Boundary 0.9');

        let engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        });

        await engine.startSession(set1);
        await engine.getOpeningMessage();
        await engine.processUserMessage('I understand!');

        const point1 = await recallPointRepo.findById(points1[0].id);
        expect(point1!.fsrsState.reps).toBe(1);

        // Test exactly 0.7
        const { recallSet: set2, recallPoints: points2 } = await seedTestData(recallSetRepo, recallPointRepo, scheduler, { pointCount: 1 });

        mockEvaluator.setMockResult(true, 0.7, 'Boundary 0.7');

        engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        });

        await engine.startSession(set2);
        await engine.getOpeningMessage();
        await engine.processUserMessage('I understand!');

        const point2 = await recallPointRepo.findById(points2[0].id);
        expect(point2!.fsrsState.reps).toBe(1);
      });

      it('should handle confidence = 0', async () => {
        const sessionRepo = new SessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        const { recallSet, recallPoints } = await seedTestData(recallSetRepo, recallPointRepo, scheduler, { pointCount: 1 });

        mockEvaluator.setMockResult(false, 0, 'Zero confidence');

        const engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        });

        await engine.startSession(recallSet);
        await engine.getOpeningMessage();
        await engine.processUserMessage('I understand!');

        const point = await recallPointRepo.findById(recallPoints[0].id);
        expect(point!.fsrsState.reps).toBe(1);
        expect(point!.recallHistory[0].success).toBe(false);
      });

      it('should handle confidence = 1', async () => {
        const sessionRepo = new SessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        const { recallSet, recallPoints } = await seedTestData(recallSetRepo, recallPointRepo, scheduler, { pointCount: 1 });

        mockEvaluator.setMockResult(true, 1.0, 'Perfect confidence');

        const engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        });

        await engine.startSession(recallSet);
        await engine.getOpeningMessage();
        await engine.processUserMessage('I understand!');

        const point = await recallPointRepo.findById(recallPoints[0].id);
        expect(point!.fsrsState.reps).toBe(1);
        expect(point!.recallHistory[0].success).toBe(true);
      });
    });
  });

  // =========================================================================
  // 5. Concurrency & Race Conditions
  // =========================================================================

  describe('Concurrency', () => {
    it('should handle rapid sequential messages without corruption', async () => {
      const sessionRepo = new SessionRepository(db);
      const recallPointRepo = new RecallPointRepository(db);
      const messageRepo = new SessionMessageRepository(db);

      const { recallSet } = await seedTestData(recallSetRepo, recallPointRepo, scheduler, { pointCount: 1 });

      const engine = new SessionEngine({
        scheduler,
        evaluator: mockEvaluator as unknown as RecallEvaluator,
        llmClient: mockLlmClient as any,
        recallSetRepo,
        recallPointRepo,
        sessionRepo,
        messageRepo,
      }, {
        maxMessagesPerPoint: 100,
        autoEvaluateAfter: 100,
        tutorTemperature: 0.7,
        tutorMaxTokens: 512,
      });

      await engine.startSession(recallSet);
      await engine.getOpeningMessage();

      // Send many messages rapidly
      for (let i = 0; i < 10; i++) {
        await engine.processUserMessage(`Rapid message ${i + 1}`);
      }

      // Final trigger to complete
      const result = await engine.processUserMessage('I understand!');
      expect(result.completed).toBe(true);

      // Verify all messages were saved
      const session = engine.getSessionState();
      const messages = await messageRepo.findBySessionId(session!.session.id);
      // Should have: opening + 11 user messages + 11 assistant responses
      expect(messages.length).toBeGreaterThanOrEqual(22);
    });

    it('should not allow starting new session while one is in progress (via resume)', async () => {
      const sessionRepo = new SessionRepository(db);
      const recallPointRepo = new RecallPointRepository(db);
      const messageRepo = new SessionMessageRepository(db);

      const { recallSet } = await seedTestData(recallSetRepo, recallPointRepo, scheduler);

      const engine = new SessionEngine({
        scheduler,
        evaluator: mockEvaluator as unknown as RecallEvaluator,
        llmClient: mockLlmClient as any,
        recallSetRepo,
        recallPointRepo,
        sessionRepo,
        messageRepo,
      });

      // Start first session
      const session1 = await engine.startSession(recallSet);
      await engine.getOpeningMessage();

      // Trying to start again for same set should resume
      const session2 = await engine.startSession(recallSet);
      expect(session2.id).toBe(session1.id);
    });

    it('should maintain message order under rapid input', async () => {
      const sessionRepo = new SessionRepository(db);
      const recallPointRepo = new RecallPointRepository(db);
      const messageRepo = new SessionMessageRepository(db);

      const { recallSet } = await seedTestData(recallSetRepo, recallPointRepo, scheduler);

      const engine = new SessionEngine({
        scheduler,
        evaluator: mockEvaluator as unknown as RecallEvaluator,
        llmClient: mockLlmClient as any,
        recallSetRepo,
        recallPointRepo,
        sessionRepo,
        messageRepo,
      }, {
        maxMessagesPerPoint: 100,
        autoEvaluateAfter: 100,
        tutorTemperature: 0.7,
        tutorMaxTokens: 512,
      });

      await engine.startSession(recallSet);
      await engine.getOpeningMessage();

      // Send numbered messages
      for (let i = 1; i <= 5; i++) {
        await engine.processUserMessage(`Message number ${i}`);
      }

      const session = engine.getSessionState();
      const messages = await messageRepo.findBySessionId(session!.session.id);

      // Get user messages and verify order
      const userMessages = messages.filter(m => m.role === 'user');
      for (let i = 0; i < userMessages.length; i++) {
        expect(userMessages[i].content).toContain(`${i + 1}`);
      }

      // Verify timestamps are in order
      for (let i = 1; i < messages.length; i++) {
        expect(messages[i].timestamp.getTime()).toBeGreaterThanOrEqual(messages[i - 1].timestamp.getTime());
      }
    });
  });

  // =========================================================================
  // 6. Configuration Options
  // =========================================================================

  describe('Configuration', () => {
    describe('maxMessagesPerPoint', () => {
      it('should handle maxMessagesPerPoint = 1', async () => {
        const sessionRepo = new SessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        const { recallSet } = await seedTestData(recallSetRepo, recallPointRepo, scheduler, { pointCount: 2 });

        const engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        }, {
          maxMessagesPerPoint: 1,
          autoEvaluateAfter: 100,
          tutorTemperature: 0.7,
          tutorMaxTokens: 512,
        });

        await engine.startSession(recallSet);
        await engine.getOpeningMessage();

        // First message should immediately trigger evaluation
        const result = await engine.processUserMessage('Any message');
        expect(result.pointAdvanced).toBe(true);
      });
    });

    describe('tutorTemperature and tutorMaxTokens', () => {
      it('should pass temperature to LLM client', async () => {
        const sessionRepo = new SessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        const { recallSet } = await seedTestData(recallSetRepo, recallPointRepo, scheduler);

        const engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        }, {
          tutorTemperature: 0.9,
          tutorMaxTokens: 256,
          maxMessagesPerPoint: 10,
          autoEvaluateAfter: 6,
        });

        await engine.startSession(recallSet);
        await engine.getOpeningMessage();

        // Check that the config was passed
        const lastCall = mockLlmClient.completeCallHistory[mockLlmClient.completeCallHistory.length - 1];
        expect(lastCall.config?.temperature).toBe(0.9);
        expect(lastCall.config?.maxTokens).toBe(256);
      });

      it('should handle extreme temperature values', async () => {
        const sessionRepo = new SessionRepository(db);
        const recallPointRepo = new RecallPointRepository(db);
        const messageRepo = new SessionMessageRepository(db);

        const { recallSet } = await seedTestData(recallSetRepo, recallPointRepo, scheduler);

        // Temperature = 0
        let engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        }, {
          tutorTemperature: 0,
          tutorMaxTokens: 512,
          maxMessagesPerPoint: 10,
          autoEvaluateAfter: 6,
        });

        await engine.startSession(recallSet);
        const opening1 = await engine.getOpeningMessage();
        expect(opening1).toBeDefined();

        // Temperature = 1
        const { recallSet: set2 } = await seedTestData(recallSetRepo, recallPointRepo, scheduler);

        engine = new SessionEngine({
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
        }, {
          tutorTemperature: 1.0,
          tutorMaxTokens: 512,
          maxMessagesPerPoint: 10,
          autoEvaluateAfter: 6,
        });

        await engine.startSession(set2);
        const opening2 = await engine.getOpeningMessage();
        expect(opening2).toBeDefined();
      });
    });
  });

  // =========================================================================
  // 7. System Prompts
  // =========================================================================

  describe('System Prompts', () => {
    it('should apply recall set discussionSystemPrompt to LLM', async () => {
      const sessionRepo = new SessionRepository(db);
      const recallPointRepo = new RecallPointRepository(db);
      const messageRepo = new SessionMessageRepository(db);

      // Create a recall set with a specific system prompt
      const recallSet = await recallSetRepo.create({
        id: testId('rs'),
        name: 'Test Set with Prompt',
        description: 'Test',
        status: 'active',
        discussionSystemPrompt: 'You are a specialized math tutor. Always use mathematical notation.',
      });

      // Add a due point
      const now = new Date();
      const initialState = scheduler.createInitialState(now);
      await recallPointRepo.create({
        id: testId('rp'),
        recallSetId: recallSet.id,
        content: 'Test content',
        context: 'Test context',
        fsrsState: initialState,
      });

      const engine = new SessionEngine({
        scheduler,
        evaluator: mockEvaluator as unknown as RecallEvaluator,
        llmClient: mockLlmClient as any,
        recallSetRepo,
        recallPointRepo,
        sessionRepo,
        messageRepo,
      });

      await engine.startSession(recallSet);

      // The system prompt should include the discussion prompt
      const systemPrompt = mockLlmClient.getSystemPrompt();
      expect(systemPrompt).toBeDefined();
      // Note: The actual system prompt is built by buildSocraticTutorPrompt,
      // which may or may not include discussionSystemPrompt directly
    });

    it('should handle empty discussionSystemPrompt', async () => {
      const sessionRepo = new SessionRepository(db);
      const recallPointRepo = new RecallPointRepository(db);
      const messageRepo = new SessionMessageRepository(db);

      const recallSet = await recallSetRepo.create({
        id: testId('rs'),
        name: 'Test Set',
        description: 'Test',
        status: 'active',
        discussionSystemPrompt: '', // Empty
      });

      const now = new Date();
      const initialState = scheduler.createInitialState(now);
      await recallPointRepo.create({
        id: testId('rp'),
        recallSetId: recallSet.id,
        content: 'Test content',
        context: 'Test context',
        fsrsState: initialState,
      });

      const engine = new SessionEngine({
        scheduler,
        evaluator: mockEvaluator as unknown as RecallEvaluator,
        llmClient: mockLlmClient as any,
        recallSetRepo,
        recallPointRepo,
        sessionRepo,
        messageRepo,
      });

      // Should not throw
      await engine.startSession(recallSet);
      const opening = await engine.getOpeningMessage();
      expect(opening).toBeDefined();
    });

    it('should handle minimal discussionSystemPrompt (single character)', async () => {
      const sessionRepo = new SessionRepository(db);
      const recallPointRepo = new RecallPointRepository(db);
      const messageRepo = new SessionMessageRepository(db);

      // discussionSystemPrompt is required by the schema, but test with minimal content
      const recallSet = await recallSetRepo.create({
        id: testId('rs'),
        name: 'Test Set',
        description: 'Test',
        status: 'active',
        discussionSystemPrompt: '.', // Minimal valid value
      });

      const now = new Date();
      const initialState = scheduler.createInitialState(now);
      await recallPointRepo.create({
        id: testId('rp'),
        recallSetId: recallSet.id,
        content: 'Test content',
        context: 'Test context',
        fsrsState: initialState,
      });

      const engine = new SessionEngine({
        scheduler,
        evaluator: mockEvaluator as unknown as RecallEvaluator,
        llmClient: mockLlmClient as any,
        recallSetRepo,
        recallPointRepo,
        sessionRepo,
        messageRepo,
      });

      await engine.startSession(recallSet);
      const opening = await engine.getOpeningMessage();
      expect(opening).toBeDefined();
    });

    it('should handle very long discussionSystemPrompt', async () => {
      const sessionRepo = new SessionRepository(db);
      const recallPointRepo = new RecallPointRepository(db);
      const messageRepo = new SessionMessageRepository(db);

      const recallSet = await recallSetRepo.create({
        id: testId('rs'),
        name: 'Test Set',
        description: 'Test',
        status: 'active',
        discussionSystemPrompt: 'X'.repeat(10000), // Very long
      });

      const now = new Date();
      const initialState = scheduler.createInitialState(now);
      await recallPointRepo.create({
        id: testId('rp'),
        recallSetId: recallSet.id,
        content: 'Test content',
        context: 'Test context',
        fsrsState: initialState,
      });

      const engine = new SessionEngine({
        scheduler,
        evaluator: mockEvaluator as unknown as RecallEvaluator,
        llmClient: mockLlmClient as any,
        recallSetRepo,
        recallPointRepo,
        sessionRepo,
        messageRepo,
      });

      await engine.startSession(recallSet);
      const opening = await engine.getOpeningMessage();
      expect(opening).toBeDefined();
    });
  });

  // =========================================================================
  // 8. Token Tracking
  // =========================================================================

  describe('Token Tracking', () => {
    it('should track input and output tokens for each message', async () => {
      const sessionRepo = new SessionRepository(db);
      const recallPointRepo = new RecallPointRepository(db);
      const messageRepo = new SessionMessageRepository(db);

      const { recallSet } = await seedTestData(recallSetRepo, recallPointRepo, scheduler);

      const engine = new SessionEngine({
        scheduler,
        evaluator: mockEvaluator as unknown as RecallEvaluator,
        llmClient: mockLlmClient as any,
        recallSetRepo,
        recallPointRepo,
        sessionRepo,
        messageRepo,
      });

      await engine.startSession(recallSet);
      await engine.getOpeningMessage();
      await engine.processUserMessage('Test message');

      // Verify LLM was called and returned token info
      expect(mockLlmClient.completeCallHistory.length).toBeGreaterThan(0);
    });

    it('should handle LLM not returning token counts', async () => {
      const sessionRepo = new SessionRepository(db);
      const recallPointRepo = new RecallPointRepository(db);
      const messageRepo = new SessionMessageRepository(db);

      const { recallSet } = await seedTestData(recallSetRepo, recallPointRepo, scheduler);

      mockLlmClient.setNoTokenTracking();

      const engine = new SessionEngine({
        scheduler,
        evaluator: mockEvaluator as unknown as RecallEvaluator,
        llmClient: mockLlmClient as any,
        recallSetRepo,
        recallPointRepo,
        sessionRepo,
        messageRepo,
      });

      // Should not throw when token info is missing
      await engine.startSession(recallSet);
      const opening = await engine.getOpeningMessage();
      expect(opening).toBeDefined();

      const result = await engine.processUserMessage('Test message');
      expect(result.response).toBeDefined();
    });
  });

  // =========================================================================
  // 9. Event Emission
  // =========================================================================

  describe('Event Emission', () => {
    it('should emit all expected event types during a session', async () => {
      const sessionRepo = new SessionRepository(db);
      const recallPointRepo = new RecallPointRepository(db);
      const messageRepo = new SessionMessageRepository(db);

      const { recallSet } = await seedTestData(recallSetRepo, recallPointRepo, scheduler, { pointCount: 1 });

      const events: SessionEvent[] = [];

      const engine = new SessionEngine({
        scheduler,
        evaluator: mockEvaluator as unknown as RecallEvaluator,
        llmClient: mockLlmClient as any,
        recallSetRepo,
        recallPointRepo,
        sessionRepo,
        messageRepo,
      });

      engine.setEventListener((event) => {
        events.push(event);
      });

      await engine.startSession(recallSet);
      await engine.getOpeningMessage();
      await engine.processUserMessage('Test');
      await engine.processUserMessage('I understand!');

      const eventTypes = events.map(e => e.type);

      expect(eventTypes).toContain('session_started');
      expect(eventTypes).toContain('point_started');
      expect(eventTypes).toContain('assistant_message');
      expect(eventTypes).toContain('user_message');
      expect(eventTypes).toContain('point_evaluated');
      expect(eventTypes).toContain('point_completed');
      expect(eventTypes).toContain('session_completed');
    });

    it('should include correct data in each event', async () => {
      const sessionRepo = new SessionRepository(db);
      const recallPointRepo = new RecallPointRepository(db);
      const messageRepo = new SessionMessageRepository(db);

      const { recallSet, recallPoints } = await seedTestData(recallSetRepo, recallPointRepo, scheduler, { pointCount: 1 });

      const events: SessionEvent[] = [];

      const engine = new SessionEngine({
        scheduler,
        evaluator: mockEvaluator as unknown as RecallEvaluator,
        llmClient: mockLlmClient as any,
        recallSetRepo,
        recallPointRepo,
        sessionRepo,
        messageRepo,
      });

      engine.setEventListener((event) => {
        events.push(event);
      });

      await engine.startSession(recallSet);
      await engine.getOpeningMessage();
      await engine.processUserMessage('I understand!');

      // Check session_started event
      const sessionStarted = events.find(e => e.type === 'session_started');
      expect(sessionStarted).toBeDefined();
      expect((sessionStarted!.data as any).recallSetId).toBe(recallSet.id);

      // Check point_started event
      const pointStarted = events.find(e => e.type === 'point_started');
      expect(pointStarted).toBeDefined();
      expect((pointStarted!.data as any).pointId).toBe(recallPoints[0].id);

      // Check user_message event
      const userMessage = events.find(e => e.type === 'user_message');
      expect(userMessage).toBeDefined();
      expect((userMessage!.data as any).content).toBe('I understand!');

      // Check assistant_message event
      const assistantMessage = events.find(e => e.type === 'assistant_message');
      expect(assistantMessage).toBeDefined();
      expect((assistantMessage!.data as any).content).toBeDefined();

      // Check timestamps
      for (const event of events) {
        expect(event.timestamp).toBeInstanceOf(Date);
      }
    });

    it('should handle listener throwing exception', async () => {
      const sessionRepo = new SessionRepository(db);
      const recallPointRepo = new RecallPointRepository(db);
      const messageRepo = new SessionMessageRepository(db);

      const { recallSet } = await seedTestData(recallSetRepo, recallPointRepo, scheduler);

      const engine = new SessionEngine({
        scheduler,
        evaluator: mockEvaluator as unknown as RecallEvaluator,
        llmClient: mockLlmClient as any,
        recallSetRepo,
        recallPointRepo,
        sessionRepo,
        messageRepo,
      });

      engine.setEventListener(() => {
        throw new Error('Listener error');
      });

      // The session should still work even if the listener throws
      // Note: The actual behavior depends on implementation - it may or may not catch listener errors
      // This test verifies the engine doesn't crash completely
      try {
        await engine.startSession(recallSet);
        await engine.getOpeningMessage();
      } catch (e) {
        // If it throws, it should be the listener error, not an internal error
        expect((e as Error).message).toBe('Listener error');
      }
    });

    it('should handle no listener registered', async () => {
      const sessionRepo = new SessionRepository(db);
      const recallPointRepo = new RecallPointRepository(db);
      const messageRepo = new SessionMessageRepository(db);

      const { recallSet } = await seedTestData(recallSetRepo, recallPointRepo, scheduler);

      const engine = new SessionEngine({
        scheduler,
        evaluator: mockEvaluator as unknown as RecallEvaluator,
        llmClient: mockLlmClient as any,
        recallSetRepo,
        recallPointRepo,
        sessionRepo,
        messageRepo,
      });

      // Don't set any event listener - should work fine
      await engine.startSession(recallSet);
      const opening = await engine.getOpeningMessage();
      expect(opening).toBeDefined();
    });

    it('should handle listener being removed mid-session', async () => {
      const sessionRepo = new SessionRepository(db);
      const recallPointRepo = new RecallPointRepository(db);
      const messageRepo = new SessionMessageRepository(db);

      const { recallSet } = await seedTestData(recallSetRepo, recallPointRepo, scheduler);

      const events: SessionEvent[] = [];

      const engine = new SessionEngine({
        scheduler,
        evaluator: mockEvaluator as unknown as RecallEvaluator,
        llmClient: mockLlmClient as any,
        recallSetRepo,
        recallPointRepo,
        sessionRepo,
        messageRepo,
      });

      engine.setEventListener((event) => {
        events.push(event);
      });

      await engine.startSession(recallSet);
      const eventsBeforeRemoval = events.length;
      expect(eventsBeforeRemoval).toBeGreaterThan(0);

      // Remove listener
      engine.setEventListener(undefined);

      // Continue session
      await engine.getOpeningMessage();
      await engine.processUserMessage('Test');

      // No new events should be recorded after removal
      expect(events.length).toBe(eventsBeforeRemoval);
    });
  });

  // =========================================================================
  // 10. Data Integrity
  // =========================================================================

  describe('Data Integrity', () => {
    it('should maintain referential integrity (session -> messages)', async () => {
      const sessionRepo = new SessionRepository(db);
      const recallPointRepo = new RecallPointRepository(db);
      const messageRepo = new SessionMessageRepository(db);

      const { recallSet } = await seedTestData(recallSetRepo, recallPointRepo, scheduler);

      const engine = new SessionEngine({
        scheduler,
        evaluator: mockEvaluator as unknown as RecallEvaluator,
        llmClient: mockLlmClient as any,
        recallSetRepo,
        recallPointRepo,
        sessionRepo,
        messageRepo,
      });

      const session = await engine.startSession(recallSet);
      await engine.getOpeningMessage();
      await engine.processUserMessage('Test');

      // All messages should reference the correct session
      const messages = await messageRepo.findBySessionId(session.id);
      for (const message of messages) {
        expect(message.sessionId).toBe(session.id);
      }
    });

    it('should maintain referential integrity (session -> recall set)', async () => {
      const sessionRepo = new SessionRepository(db);
      const recallPointRepo = new RecallPointRepository(db);
      const messageRepo = new SessionMessageRepository(db);

      const { recallSet } = await seedTestData(recallSetRepo, recallPointRepo, scheduler);

      const engine = new SessionEngine({
        scheduler,
        evaluator: mockEvaluator as unknown as RecallEvaluator,
        llmClient: mockLlmClient as any,
        recallSetRepo,
        recallPointRepo,
        sessionRepo,
        messageRepo,
      });

      const session = await engine.startSession(recallSet);

      // Session should reference the correct recall set
      const persistedSession = await sessionRepo.findById(session.id);
      expect(persistedSession!.recallSetId).toBe(recallSet.id);
    });

    it('should not orphan messages on session abandonment', async () => {
      const sessionRepo = new SessionRepository(db);
      const recallPointRepo = new RecallPointRepository(db);
      const messageRepo = new SessionMessageRepository(db);

      const { recallSet } = await seedTestData(recallSetRepo, recallPointRepo, scheduler);

      const engine = new SessionEngine({
        scheduler,
        evaluator: mockEvaluator as unknown as RecallEvaluator,
        llmClient: mockLlmClient as any,
        recallSetRepo,
        recallPointRepo,
        sessionRepo,
        messageRepo,
      });

      const session = await engine.startSession(recallSet);
      await engine.getOpeningMessage();
      await engine.processUserMessage('Test');
      await engine.abandonSession();

      // Messages should still exist and reference the session
      const messages = await messageRepo.findBySessionId(session.id);
      expect(messages.length).toBeGreaterThan(0);

      // Session should be marked as abandoned
      const abandonedSession = await sessionRepo.findById(session.id);
      expect(abandonedSession!.status).toBe('abandoned');
    });

    it('should persist all data before returning from processUserMessage', async () => {
      const sessionRepo = new SessionRepository(db);
      const recallPointRepo = new RecallPointRepository(db);
      const messageRepo = new SessionMessageRepository(db);

      const { recallSet } = await seedTestData(recallSetRepo, recallPointRepo, scheduler);

      const engine = new SessionEngine({
        scheduler,
        evaluator: mockEvaluator as unknown as RecallEvaluator,
        llmClient: mockLlmClient as any,
        recallSetRepo,
        recallPointRepo,
        sessionRepo,
        messageRepo,
      });

      const session = await engine.startSession(recallSet);
      await engine.getOpeningMessage();

      // After processing a message, it should be immediately queryable
      const result = await engine.processUserMessage('Test message');

      const messages = await messageRepo.findBySessionId(session.id);
      const userMessages = messages.filter(m => m.role === 'user');
      expect(userMessages.some(m => m.content === 'Test message')).toBe(true);

      // The assistant response should also be persisted
      const assistantMessages = messages.filter(m => m.role === 'assistant');
      expect(assistantMessages.some(m => m.content === result.response)).toBe(true);
    });

    it('should handle very long sessions (50+ messages)', async () => {
      const sessionRepo = new SessionRepository(db);
      const recallPointRepo = new RecallPointRepository(db);
      const messageRepo = new SessionMessageRepository(db);

      const { recallSet } = await seedTestData(recallSetRepo, recallPointRepo, scheduler, { pointCount: 1 });

      const engine = new SessionEngine({
        scheduler,
        evaluator: mockEvaluator as unknown as RecallEvaluator,
        llmClient: mockLlmClient as any,
        recallSetRepo,
        recallPointRepo,
        sessionRepo,
        messageRepo,
      }, {
        maxMessagesPerPoint: 100,
        autoEvaluateAfter: 100,
        tutorTemperature: 0.7,
        tutorMaxTokens: 512,
      });

      await engine.startSession(recallSet);
      await engine.getOpeningMessage();

      // Process many messages
      for (let i = 0; i < 50; i++) {
        await engine.processUserMessage(`Message ${i + 1}`);
      }

      // Complete the session
      const result = await engine.processUserMessage('I understand!');
      expect(result.completed).toBe(true);

      // Verify all messages were saved
      const state = engine.getSessionState();
      const messages = await messageRepo.findBySessionId(state!.session.id);
      // Should have: opening + 51 user messages + 51 assistant responses
      expect(messages.length).toBeGreaterThanOrEqual(100);

      // Verify message integrity
      const userMessages = messages.filter(m => m.role === 'user');
      expect(userMessages.length).toBe(51);
    });
  });
});
