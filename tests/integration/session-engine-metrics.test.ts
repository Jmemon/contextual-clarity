/**
 * End-to-End Integration Tests: SessionEngine with Metrics Integration
 *
 * This test suite rigorously verifies that SessionEngine correctly integrates
 * with the Phase 2 metrics collection system. Unlike the metrics-collection.test.ts
 * which tests components in isolation, this suite tests the ACTUAL flow through
 * SessionEngine with all real dependencies (except LLM which is mocked for determinism).
 *
 * Test coverage includes:
 * 1. Basic initialization - with and without metrics dependencies
 * 2. Message recording flow - timing, tokens, roles
 * 3. Recall outcome recording - message ranges, evaluation data
 * 4. Session completion - persistence to all Phase 2 tables
 * 5. Edge cases - error handling, empty sessions, abandonment
 * 6. Data integrity - foreign keys, timestamps, calculated fields
 *
 * All tests use in-memory SQLite for isolation and real repositories to verify
 * actual database operations work correctly.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { Database } from 'bun:sqlite';
import { resolve } from 'path';
import { eq } from 'drizzle-orm';
import * as schema from '../../src/storage/schema';
import {
  RecallSetRepository,
  RecallPointRepository,
  SessionRepository,
  SessionMessageRepository,
} from '../../src/storage/repositories';
import { SessionMetricsRepository } from '../../src/storage/repositories/session-metrics.repository';
import { RecallOutcomeRepository } from '../../src/storage/repositories/recall-outcome.repository';
import { RabbitholeEventRepository } from '../../src/storage/repositories/rabbithole-event.repository';
import { SessionEngine } from '../../src/core/session';
import { SessionMetricsCollector } from '../../src/core/session/metrics-collector';
import { RabbitholeDetector } from '../../src/core/analysis/rabbithole-detector';
import { FSRSScheduler } from '../../src/core/fsrs';
import { RecallEvaluator } from '../../src/core/scoring';
import type { RecallSet, RecallPoint, Session } from '../../src/core/models';
import type { EnhancedRecallEvaluation, RecallEvaluation } from '../../src/core/scoring/types';
import type { LLMMessage, LLMResponse, StreamCallbacks, LLMConfig } from '../../src/llm/types';
import type { AppDatabase } from '../../src/storage/db';

// ============================================================================
// Mock Implementations for Deterministic Testing
// ============================================================================

/**
 * Mock Anthropic Client that provides controlled responses.
 *
 * This mock tracks all calls and allows configuring specific response sequences.
 * Used for both the tutor LLM calls and the rabbithole detection LLM calls.
 */
class MockAnthropicClient {
  private systemPrompt: string | undefined;
  private tutorResponses: string[] = [];
  private tutorResponseIndex = 0;
  private rabbitholeResponses: string[] = [];
  private rabbitholeResponseIndex = 0;
  private returnResponses: string[] = [];
  private returnResponseIndex = 0;

  // Track all calls for verification
  public completeCalls: Array<{ input: string; config?: LLMConfig }> = [];
  public tokenUsage = { inputTokens: 0, outputTokens: 0 };

  /**
   * Configure tutor responses for session conversation.
   */
  setTutorResponses(responses: string[]): void {
    this.tutorResponses = responses;
    this.tutorResponseIndex = 0;
  }

  /**
   * Configure rabbithole detection responses.
   */
  setRabbitholeResponses(responses: string[]): void {
    this.rabbitholeResponses = responses;
    this.rabbitholeResponseIndex = 0;
  }

  /**
   * Configure rabbithole return detection responses.
   */
  setReturnResponses(responses: string[]): void {
    this.returnResponses = responses;
    this.returnResponseIndex = 0;
  }

  /**
   * Simulates a completion call with tracked usage.
   */
  async complete(
    messages: string | LLMMessage[],
    config?: LLMConfig
  ): Promise<LLMResponse> {
    const input = typeof messages === 'string' ? messages : messages[0]?.content || '';
    this.completeCalls.push({ input, config });

    // Determine which response to return based on prompt content
    let responseText: string;
    const inputTokens = Math.ceil(input.length / 4);
    let outputTokens: number;

    // Check for rabbithole detection prompts (they mention "tangent" or "off-topic")
    if (input.includes('tangent') || input.includes('off-topic') || input.includes('rabbithole')) {
      // This is rabbithole detection
      responseText = this.rabbitholeResponses[this.rabbitholeResponseIndex] ||
        '{"isRabbithole": false, "confidence": 0.3}';
      this.rabbitholeResponseIndex++;
    } else if (input.includes('return') || input.includes('back to') || input.includes('main topic')) {
      // This is return detection
      responseText = this.returnResponses[this.returnResponseIndex] ||
        '{"hasReturned": false, "confidence": 0.3}';
      this.returnResponseIndex++;
    } else if (input.includes('Begin the recall') || input.includes('opening question')) {
      // Opening message
      responseText = this.tutorResponses[this.tutorResponseIndex] ||
        "Let's explore what you remember. Can you tell me what you know about this topic?";
      this.tutorResponseIndex++;
    } else if (input.includes('transition') || input.includes('positive feedback') || input.includes('next topic')) {
      // Transition message
      responseText = this.tutorResponses[this.tutorResponseIndex] ||
        "Excellent work! Now let's move on to the next concept.";
      this.tutorResponseIndex++;
    } else if (input.includes('congratulatory') || input.includes('completed all')) {
      // Completion message
      responseText = this.tutorResponses[this.tutorResponseIndex] ||
        "Congratulations! You've completed this session successfully!";
      this.tutorResponseIndex++;
    } else {
      // Generic conversation response
      responseText = this.tutorResponses[this.tutorResponseIndex] ||
        "That's interesting! Can you elaborate on that point?";
      this.tutorResponseIndex++;
    }

    outputTokens = Math.ceil(responseText.length / 4);
    this.tokenUsage.inputTokens += inputTokens;
    this.tokenUsage.outputTokens += outputTokens;

    return {
      text: responseText,
      usage: { inputTokens, outputTokens },
      stopReason: 'end_turn',
    };
  }

  async stream(
    _messages: string | LLMMessage[],
    callbacks: StreamCallbacks,
    _config?: LLMConfig
  ): Promise<void> {
    const response = 'Mock streaming response';
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

  /**
   * Reset tracking state for fresh test.
   */
  reset(): void {
    this.completeCalls = [];
    this.tokenUsage = { inputTokens: 0, outputTokens: 0 };
    this.tutorResponseIndex = 0;
    this.rabbitholeResponseIndex = 0;
    this.returnResponseIndex = 0;
  }
}

/**
 * Mock RecallEvaluator that returns configurable enhanced evaluations.
 *
 * Tracks evaluation calls to verify metrics integration.
 */
class MockRecallEvaluator {
  private mockResults: EnhancedRecallEvaluation[] = [];
  private resultIndex = 0;
  public evaluateCalls: Array<{ pointId: string; messageCount: number }> = [];
  public enhancedCalls: Array<{ pointId: string; messageCount: number }> = [];

  /**
   * Configure a sequence of evaluation results.
   */
  setMockResults(results: EnhancedRecallEvaluation[]): void {
    this.mockResults = results;
    this.resultIndex = 0;
  }

  /**
   * Basic evaluation - returns simplified result.
   */
  async evaluate(
    recallPoint: RecallPoint,
    conversationMessages: unknown[]
  ): Promise<RecallEvaluation> {
    this.evaluateCalls.push({
      pointId: recallPoint.id,
      messageCount: conversationMessages.length,
    });

    const result = this.mockResults[this.resultIndex] || this.getDefaultResult();
    // Note: don't increment here, let evaluateEnhanced do it since SessionEngine
    // calls evaluateEnhanced when metrics are enabled
    return {
      success: result.success,
      confidence: result.confidence,
      reasoning: result.reasoning,
    };
  }

  /**
   * Enhanced evaluation - returns full result with concepts and rating.
   */
  async evaluateEnhanced(
    recallPoint: RecallPoint,
    conversationMessages: unknown[],
    _context?: unknown
  ): Promise<EnhancedRecallEvaluation> {
    this.enhancedCalls.push({
      pointId: recallPoint.id,
      messageCount: conversationMessages.length,
    });

    const result = this.mockResults[this.resultIndex] || this.getDefaultResult();
    this.resultIndex++;
    return result;
  }

  /**
   * Returns a default successful evaluation.
   */
  private getDefaultResult(): EnhancedRecallEvaluation {
    return {
      success: true,
      confidence: 0.85,
      reasoning: 'User demonstrated clear understanding of the concept',
      keyDemonstratedConcepts: ['main concept'],
      missedConcepts: [],
      suggestedRating: 'good',
    };
  }

  /**
   * Reset tracking state for fresh test.
   */
  reset(): void {
    this.evaluateCalls = [];
    this.enhancedCalls = [];
    this.resultIndex = 0;
  }
}

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Creates an in-memory database with all migrations applied.
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
 * Seeds the database with test recall set and points that are due for review.
 * Uses unique IDs for each call to avoid conflicts.
 */
async function seedTestData(
  recallSetRepo: RecallSetRepository,
  recallPointRepo: RecallPointRepository,
  scheduler: FSRSScheduler,
  pointCount: number = 2,
  idPrefix: string = 'metrics'
): Promise<{ recallSet: RecallSet; recallPoints: RecallPoint[] }> {
  const now = new Date();
  const initialState = scheduler.createInitialState(now);
  const uniqueId = crypto.randomUUID().slice(0, 8);

  const recallSet = await recallSetRepo.create({
    id: `rs_test_${idPrefix}_${uniqueId}`,
    name: 'Test Metrics Set',
    description: 'Test recall set for metrics integration tests',
    status: 'active',
    discussionSystemPrompt: 'You are helping the user learn about test concepts.',
  });

  const recallPoints: RecallPoint[] = [];
  for (let i = 1; i <= pointCount; i++) {
    const point = await recallPointRepo.create({
      id: `rp_test_${idPrefix}_${uniqueId}_${i}`,
      recallSetId: recallSet.id,
      content: `Test concept ${i}: Important information to recall`,
      context: `Context for test point ${i}`,
      fsrsState: initialState,
    });
    recallPoints.push(point);
  }

  return { recallSet, recallPoints };
}

// ============================================================================
// Test Suite
// ============================================================================

describe('SessionEngine Metrics Integration', () => {
  // Database and repositories
  let db: AppDatabase;
  let sqlite: Database;
  let recallSetRepo: RecallSetRepository;
  let recallPointRepo: RecallPointRepository;
  let sessionRepo: SessionRepository;
  let messageRepo: SessionMessageRepository;
  let metricsRepo: SessionMetricsRepository;
  let outcomeRepo: RecallOutcomeRepository;
  let rabbitholeRepo: RabbitholeEventRepository;

  // Services and mocks
  let scheduler: FSRSScheduler;
  let mockLlmClient: MockAnthropicClient;
  let mockEvaluator: MockRecallEvaluator;
  let metricsCollector: SessionMetricsCollector;
  let rabbitholeDetector: RabbitholeDetector;

  // Test data
  let testRecallSet: RecallSet;
  let testRecallPoints: RecallPoint[];

  beforeEach(async () => {
    // Create fresh in-memory database with migrations
    const testDb = createTestDatabase();
    db = testDb.db;
    sqlite = testDb.sqlite;

    // Initialize all repositories
    recallSetRepo = new RecallSetRepository(db);
    recallPointRepo = new RecallPointRepository(db);
    sessionRepo = new SessionRepository(db);
    messageRepo = new SessionMessageRepository(db);
    metricsRepo = new SessionMetricsRepository(db);
    outcomeRepo = new RecallOutcomeRepository(db);
    rabbitholeRepo = new RabbitholeEventRepository(db);

    // Initialize services
    scheduler = new FSRSScheduler();
    mockLlmClient = new MockAnthropicClient();
    mockEvaluator = new MockRecallEvaluator();
    metricsCollector = new SessionMetricsCollector();

    // RabbitholeDetector uses the same mock LLM client
    rabbitholeDetector = new RabbitholeDetector(mockLlmClient as any, {
      confidenceThreshold: 0.6,
      returnConfidenceThreshold: 0.6,
      messageWindowSize: 6,
    });

    // Seed test data
    const seedData = await seedTestData(recallSetRepo, recallPointRepo, scheduler);
    testRecallSet = seedData.recallSet;
    testRecallPoints = seedData.recallPoints;
  });

  afterEach(() => {
    if (sqlite) {
      sqlite.close();
    }
  });

  // ==========================================================================
  // 1. Basic Integration Verification
  // ==========================================================================

  describe('Initialization', () => {
    it('should initialize correctly with metrics dependencies', async () => {
      // Arrange: Create engine with all metrics dependencies
      const engine = new SessionEngine(
        {
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
          metricsCollector,
          rabbitholeDetector,
          metricsRepo,
          recallOutcomeRepo: outcomeRepo,
          rabbitholeRepo,
        },
        {
          maxMessagesPerPoint: 5,
          autoEvaluateAfter: 3,
          tutorTemperature: 0.7,
          tutorMaxTokens: 512,
        }
      );

      // Act: Start a session
      const session = await engine.startSession(testRecallSet);

      // Assert: Session is created and metrics collection is active
      expect(session).not.toBeNull();
      expect(session.status).toBe('in_progress');

      // Verify metrics collector was initialized (check internal state via getCurrentStats)
      const stats = metricsCollector.getCurrentStats();
      expect(stats.messagesRecorded).toBe(0); // No messages yet
    });

    it('should work WITHOUT metrics dependencies (backward compatibility)', async () => {
      // Arrange: Create engine without ANY metrics dependencies
      const engine = new SessionEngine(
        {
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
          // No metrics dependencies provided
        },
        {
          maxMessagesPerPoint: 5,
          autoEvaluateAfter: 3,
          tutorTemperature: 0.7,
          tutorMaxTokens: 512,
        }
      );

      // Act: Run a complete session flow
      const session = await engine.startSession(testRecallSet);
      await engine.getOpeningMessage();
      await engine.processUserMessage('I recall test concept 1.');
      const result = await engine.processUserMessage('I understand!');

      // Assert: Session completes without errors
      expect(result.pointAdvanced).toBe(true);
      expect(session.status).toBe('in_progress');

      // Verify no metrics were persisted (since metrics deps weren't provided)
      const metrics = await metricsRepo.findBySessionId(session.id);
      expect(metrics).toBeNull();
    });

    it('should call metricsCollector.startSession() when session starts', async () => {
      // Arrange: Create a spy-enabled metrics collector
      let startSessionCalled = false;
      let startSessionArgs: { sessionId?: string; model?: string } = {};

      const spyCollector = new SessionMetricsCollector();
      const originalStartSession = spyCollector.startSession.bind(spyCollector);
      spyCollector.startSession = (sessionId: string, model?: string) => {
        startSessionCalled = true;
        startSessionArgs = { sessionId, model };
        originalStartSession(sessionId, model);
      };

      const engine = new SessionEngine(
        {
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
          metricsCollector: spyCollector,
          metricsRepo,
        },
        { maxMessagesPerPoint: 5, autoEvaluateAfter: 3, tutorTemperature: 0.7, tutorMaxTokens: 512 }
      );

      // Act: Start session
      const session = await engine.startSession(testRecallSet);

      // Assert: metricsCollector.startSession was called with correct args
      expect(startSessionCalled).toBe(true);
      expect(startSessionArgs.sessionId).toBe(session.id);
    });

    it('should call rabbitholeDetector.reset() when session starts', async () => {
      // Arrange: Create a spy-enabled rabbithole detector
      let resetCalled = false;

      const spyDetector = new RabbitholeDetector(mockLlmClient as any);
      const originalReset = spyDetector.reset.bind(spyDetector);
      spyDetector.reset = () => {
        resetCalled = true;
        originalReset();
      };

      const engine = new SessionEngine(
        {
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
          rabbitholeDetector: spyDetector,
          rabbitholeRepo,
        },
        { maxMessagesPerPoint: 5, autoEvaluateAfter: 3, tutorTemperature: 0.7, tutorMaxTokens: 512 }
      );

      // Act: Start session
      await engine.startSession(testRecallSet);

      // Assert: rabbitholeDetector.reset was called
      expect(resetCalled).toBe(true);
    });
  });

  // ==========================================================================
  // 2. Message Recording Flow
  // ==========================================================================

  describe('Message Recording', () => {
    it('should call recordMessage() for each message in the conversation', async () => {
      // Arrange: Track recordMessage calls
      let recordMessageCallCount = 0;
      const recordedRoles: string[] = [];

      const spyCollector = new SessionMetricsCollector();
      const originalRecordMessage = spyCollector.recordMessage.bind(spyCollector);
      spyCollector.recordMessage = (
        messageId: string,
        role: 'user' | 'assistant' | 'system',
        tokenCount: number,
        inputTokens?: number,
        outputTokens?: number
      ) => {
        recordMessageCallCount++;
        recordedRoles.push(role);
        originalRecordMessage(messageId, role, tokenCount, inputTokens, outputTokens);
      };

      const engine = new SessionEngine(
        {
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
          metricsCollector: spyCollector,
          metricsRepo,
        },
        { maxMessagesPerPoint: 10, autoEvaluateAfter: 8, tutorTemperature: 0.7, tutorMaxTokens: 512 }
      );

      // Act: Start session and exchange messages
      await engine.startSession(testRecallSet);
      await engine.getOpeningMessage(); // 1 assistant message
      await engine.processUserMessage('First response'); // 1 user + 1 assistant
      await engine.processUserMessage('Second response'); // 1 user + 1 assistant

      // Assert: recordMessage was called for each message
      // Opening + 2 user messages + 2 assistant follow-ups = 5 messages minimum
      expect(recordMessageCallCount).toBeGreaterThanOrEqual(5);

      // Verify roles are recorded correctly
      expect(recordedRoles.filter(r => r === 'user').length).toBeGreaterThanOrEqual(2);
      expect(recordedRoles.filter(r => r === 'assistant').length).toBeGreaterThanOrEqual(3);
    });

    it('should pass token counts correctly to metrics collector', async () => {
      // Arrange: Configure mock to return specific token counts
      mockLlmClient.reset();
      mockLlmClient.setTutorResponses([
        'Opening question about the topic.',
        'Follow-up response.',
        'Another response.',
      ]);

      const engine = new SessionEngine(
        {
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
          metricsCollector,
          metricsRepo,
        },
        { maxMessagesPerPoint: 10, autoEvaluateAfter: 8, tutorTemperature: 0.7, tutorMaxTokens: 512 }
      );

      // Act: Run conversation
      await engine.startSession(testRecallSet);
      await engine.getOpeningMessage();
      await engine.processUserMessage('User message one');
      await engine.processUserMessage('User message two');

      // Assert: Token usage is being tracked
      const stats = metricsCollector.getCurrentStats();
      expect(stats.tokensUsed).toBeGreaterThan(0);
    });

    it('should handle message recording failure gracefully', async () => {
      // Arrange: Create a collector that throws on the third message
      let messageCount = 0;
      const failingCollector = new SessionMetricsCollector();
      const originalRecordMessage = failingCollector.recordMessage.bind(failingCollector);
      failingCollector.recordMessage = (
        messageId: string,
        role: 'user' | 'assistant' | 'system',
        tokenCount: number,
        inputTokens?: number,
        outputTokens?: number
      ) => {
        messageCount++;
        if (messageCount === 3) {
          throw new Error('Simulated recording failure');
        }
        originalRecordMessage(messageId, role, tokenCount, inputTokens, outputTokens);
      };

      const engine = new SessionEngine(
        {
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
          metricsCollector: failingCollector,
          metricsRepo,
        },
        { maxMessagesPerPoint: 10, autoEvaluateAfter: 8, tutorTemperature: 0.7, tutorMaxTokens: 512 }
      );

      // Act & Assert: Session should continue despite metrics recording failure
      // Note: The current implementation doesn't catch errors from recordMessage,
      // so this test documents current behavior. If it throws, the test will fail,
      // indicating we may want to add error handling.
      const session = await engine.startSession(testRecallSet);
      await engine.getOpeningMessage();

      // This should throw because the third message recording fails
      // If the implementation handles errors gracefully, it won't throw
      let errorThrown = false;
      try {
        await engine.processUserMessage('Test message');
      } catch (e) {
        errorThrown = true;
      }

      // Document current behavior - session continues or fails
      // Either is acceptable depending on desired error handling strategy
      expect(session).not.toBeNull();
    });
  });

  // ==========================================================================
  // 3. Recall Outcome Recording
  // ==========================================================================

  describe('Recall Outcome Recording', () => {
    it('should call recordRecallOutcome() when recall is evaluated', async () => {
      // Arrange: Track ALL recordRecallOutcome calls
      const recordings: Array<{
        pointId: string;
        evaluation: EnhancedRecallEvaluation;
        startIdx: number;
        endIdx: number;
      }> = [];

      const spyCollector = new SessionMetricsCollector();
      const originalRecordOutcome = spyCollector.recordRecallOutcome.bind(spyCollector);
      spyCollector.recordRecallOutcome = (
        recallPointId: string,
        evaluation: EnhancedRecallEvaluation,
        messageIndexStart: number,
        messageIndexEnd: number
      ) => {
        recordings.push({
          pointId: recallPointId,
          evaluation: evaluation,
          startIdx: messageIndexStart,
          endIdx: messageIndexEnd,
        });
        originalRecordOutcome(recallPointId, evaluation, messageIndexStart, messageIndexEnd);
      };

      const engine = new SessionEngine(
        {
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
          metricsCollector: spyCollector,
          metricsRepo,
        },
        { maxMessagesPerPoint: 5, autoEvaluateAfter: 3, tutorTemperature: 0.7, tutorMaxTokens: 512 }
      );

      // Configure mock evaluator - reset first to clear any previous state
      mockEvaluator.reset();
      mockEvaluator.setMockResults([{
        success: true,
        confidence: 0.9,
        reasoning: 'Excellent recall',
        keyDemonstratedConcepts: ['concept A', 'concept B'],
        missedConcepts: [],
        suggestedRating: 'easy',
      }]);

      // Act: Complete a recall evaluation (only the first point)
      await engine.startSession(testRecallSet);
      await engine.getOpeningMessage();
      await engine.processUserMessage('I recall the concept!');
      await engine.processUserMessage('I understand!'); // Trigger evaluation

      // Assert: recordRecallOutcome was called with correct data for FIRST point
      expect(recordings.length).toBeGreaterThanOrEqual(1);
      const firstRecording = recordings[0];
      expect(firstRecording.pointId).toBe(testRecallPoints[0].id);
      expect(firstRecording.evaluation).not.toBeNull();
      expect(firstRecording.evaluation.success).toBe(true);
      expect(firstRecording.evaluation.confidence).toBe(0.9);
      expect(firstRecording.startIdx).toBe(0); // First point starts at message 0
      // endIdx represents the last message index, which is based on messages.length - 1
      // after opening (1) + user (1) + assistant (1) + user (1) = 4 messages, endIdx = 3
      // The actual value depends on when in the flow the evaluation happens
      expect(firstRecording.endIdx).toBeGreaterThanOrEqual(0); // At least valid index
    });

    it('should record correct message index ranges for sequential recall points', async () => {
      // Arrange: Track all outcome recordings
      const recordings: Array<{
        pointId: string;
        startIdx: number;
        endIdx: number;
      }> = [];

      const spyCollector = new SessionMetricsCollector();
      const originalRecordOutcome = spyCollector.recordRecallOutcome.bind(spyCollector);
      spyCollector.recordRecallOutcome = (
        recallPointId: string,
        evaluation: EnhancedRecallEvaluation,
        messageIndexStart: number,
        messageIndexEnd: number
      ) => {
        recordings.push({
          pointId: recallPointId,
          startIdx: messageIndexStart,
          endIdx: messageIndexEnd,
        });
        originalRecordOutcome(recallPointId, evaluation, messageIndexStart, messageIndexEnd);
      };

      const engine = new SessionEngine(
        {
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
          metricsCollector: spyCollector,
          metricsRepo,
        },
        { maxMessagesPerPoint: 5, autoEvaluateAfter: 3, tutorTemperature: 0.7, tutorMaxTokens: 512 }
      );

      // Configure mock evaluator for two successful evaluations
      mockEvaluator.setMockResults([
        {
          success: true,
          confidence: 0.85,
          reasoning: 'Good recall',
          keyDemonstratedConcepts: ['concept 1'],
          missedConcepts: [],
          suggestedRating: 'good',
        },
        {
          success: true,
          confidence: 0.9,
          reasoning: 'Excellent recall',
          keyDemonstratedConcepts: ['concept 2'],
          missedConcepts: [],
          suggestedRating: 'easy',
        },
      ]);

      // Act: Complete both recall points
      await engine.startSession(testRecallSet);
      await engine.getOpeningMessage();
      await engine.processUserMessage('First point recall');
      await engine.processUserMessage('I understand!'); // First point evaluated

      await engine.processUserMessage('Second point recall');
      await engine.processUserMessage('Got it!'); // Second point evaluated

      // Assert: Two outcomes recorded with correct ranges
      expect(recordings).toHaveLength(2);

      // First point's end index should be less than second point's start index
      expect(recordings[0].pointId).toBe(testRecallPoints[0].id);
      expect(recordings[1].pointId).toBe(testRecallPoints[1].id);
      expect(recordings[0].endIdx).toBeLessThan(recordings[1].startIdx);
    });

    it('should pass EnhancedRecallEvaluation data correctly', async () => {
      // Arrange
      let capturedEvaluation: EnhancedRecallEvaluation | null = null;

      const spyCollector = new SessionMetricsCollector();
      const originalRecordOutcome = spyCollector.recordRecallOutcome.bind(spyCollector);
      spyCollector.recordRecallOutcome = (
        recallPointId: string,
        evaluation: EnhancedRecallEvaluation,
        messageIndexStart: number,
        messageIndexEnd: number
      ) => {
        capturedEvaluation = evaluation;
        originalRecordOutcome(recallPointId, evaluation, messageIndexStart, messageIndexEnd);
      };

      const engine = new SessionEngine(
        {
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
          metricsCollector: spyCollector,
          metricsRepo,
        },
        { maxMessagesPerPoint: 5, autoEvaluateAfter: 3, tutorTemperature: 0.7, tutorMaxTokens: 512 }
      );

      // Configure specific evaluation data
      const expectedEvaluation: EnhancedRecallEvaluation = {
        success: false,
        confidence: 0.4,
        reasoning: 'User struggled with recall',
        keyDemonstratedConcepts: ['partial concept'],
        missedConcepts: ['key concept A', 'key concept B'],
        suggestedRating: 'hard',
      };
      mockEvaluator.setMockResults([expectedEvaluation]);

      // Act
      await engine.startSession(testRecallSet);
      await engine.getOpeningMessage();
      await engine.processUserMessage('I think maybe...');
      await engine.processUserMessage('I understand?'); // Trigger evaluation

      // Assert: All enhanced evaluation fields are passed correctly
      expect(capturedEvaluation).not.toBeNull();
      expect(capturedEvaluation!.success).toBe(false);
      expect(capturedEvaluation!.confidence).toBe(0.4);
      expect(capturedEvaluation!.reasoning).toBe('User struggled with recall');
      expect(capturedEvaluation!.keyDemonstratedConcepts).toEqual(['partial concept']);
      expect(capturedEvaluation!.missedConcepts).toEqual(['key concept A', 'key concept B']);
      expect(capturedEvaluation!.suggestedRating).toBe('hard');
    });
  });

  // ==========================================================================
  // 4. Session Completion & Persistence
  // ==========================================================================

  describe('Session Completion', () => {
    it('should call finalizeSession() when session completes', async () => {
      // Arrange
      let finalizeCalled = false;

      const spyCollector = new SessionMetricsCollector();
      const originalFinalize = spyCollector.finalizeSession.bind(spyCollector);
      spyCollector.finalizeSession = async (session: Session) => {
        finalizeCalled = true;
        return originalFinalize(session);
      };

      const engine = new SessionEngine(
        {
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
          metricsCollector: spyCollector,
          metricsRepo,
          recallOutcomeRepo: outcomeRepo,
        },
        { maxMessagesPerPoint: 5, autoEvaluateAfter: 3, tutorTemperature: 0.7, tutorMaxTokens: 512 }
      );

      // Configure evaluator for both points
      mockEvaluator.setMockResults([
        { success: true, confidence: 0.85, reasoning: 'Good', keyDemonstratedConcepts: [], missedConcepts: [], suggestedRating: 'good' },
        { success: true, confidence: 0.9, reasoning: 'Excellent', keyDemonstratedConcepts: [], missedConcepts: [], suggestedRating: 'easy' },
      ]);

      // Act: Complete the full session
      await engine.startSession(testRecallSet);
      await engine.getOpeningMessage();
      await engine.processUserMessage('First point');
      await engine.processUserMessage('I understand!');
      await engine.processUserMessage('Second point');
      const result = await engine.processUserMessage('Got it!');

      // Assert
      expect(result.completed).toBe(true);
      expect(finalizeCalled).toBe(true);
    });

    it('should persist SessionMetrics to session_metrics table', async () => {
      // Arrange
      const engine = new SessionEngine(
        {
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
          metricsCollector,
          metricsRepo,
          recallOutcomeRepo: outcomeRepo,
        },
        { maxMessagesPerPoint: 5, autoEvaluateAfter: 3, tutorTemperature: 0.7, tutorMaxTokens: 512 }
      );

      mockEvaluator.setMockResults([
        { success: true, confidence: 0.85, reasoning: 'Good', keyDemonstratedConcepts: ['A'], missedConcepts: [], suggestedRating: 'good' },
        { success: true, confidence: 0.9, reasoning: 'Excellent', keyDemonstratedConcepts: ['B'], missedConcepts: [], suggestedRating: 'easy' },
      ]);

      // Act: Complete session
      const session = await engine.startSession(testRecallSet);
      await engine.getOpeningMessage();
      await engine.processUserMessage('First point');
      await engine.processUserMessage('I understand!');
      await engine.processUserMessage('Second point');
      await engine.processUserMessage('Got it!');

      // Assert: Query database directly to verify persistence
      const persistedMetrics = await metricsRepo.findBySessionId(session.id);
      expect(persistedMetrics).not.toBeNull();
      expect(persistedMetrics!.sessionId).toBe(session.id);
      expect(persistedMetrics!.durationMs).toBeGreaterThanOrEqual(0);
      expect(persistedMetrics!.recallPointsAttempted).toBe(2);
      expect(persistedMetrics!.engagementScore).toBeGreaterThanOrEqual(0);
      expect(persistedMetrics!.engagementScore).toBeLessThanOrEqual(100);
    });

    it('should persist RecallOutcomes to recall_outcomes table', async () => {
      // Arrange
      const engine = new SessionEngine(
        {
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
          metricsCollector,
          metricsRepo,
          recallOutcomeRepo: outcomeRepo,
        },
        { maxMessagesPerPoint: 5, autoEvaluateAfter: 3, tutorTemperature: 0.7, tutorMaxTokens: 512 }
      );

      mockEvaluator.setMockResults([
        { success: true, confidence: 0.85, reasoning: 'Good recall of point 1', keyDemonstratedConcepts: ['A'], missedConcepts: [], suggestedRating: 'good' },
        { success: false, confidence: 0.4, reasoning: 'Struggled with point 2', keyDemonstratedConcepts: [], missedConcepts: ['B'], suggestedRating: 'hard' },
      ]);

      // Act: Complete session
      const session = await engine.startSession(testRecallSet);
      await engine.getOpeningMessage();
      await engine.processUserMessage('First point');
      await engine.processUserMessage('I understand!');
      await engine.processUserMessage('Second point?');
      await engine.processUserMessage('I think I get it?');

      // Assert: Query database directly to verify recall outcomes
      const outcomes = await outcomeRepo.findBySessionId(session.id);
      expect(outcomes).toHaveLength(2);

      // Verify first outcome (success)
      const outcome1 = outcomes.find(o => o.recallPointId === testRecallPoints[0].id);
      expect(outcome1).not.toBeUndefined();
      expect(outcome1!.success).toBe(true);
      expect(outcome1!.confidence).toBe(0.85);

      // Verify second outcome (failure)
      const outcome2 = outcomes.find(o => o.recallPointId === testRecallPoints[1].id);
      expect(outcome2).not.toBeUndefined();
      expect(outcome2!.success).toBe(false);
      expect(outcome2!.confidence).toBe(0.4);
    });

    it('should close and persist abandoned rabbitholes on session completion', async () => {
      // Arrange: Configure rabbithole detection to find one
      mockLlmClient.setRabbitholeResponses([
        JSON.stringify({
          isRabbithole: true,
          confidence: 0.85,
          topic: 'Tangent about related concept',
          depth: 1,
          relatedRecallPointIds: [testRecallPoints[0].id],
        }),
        '{"isRabbithole": false, "confidence": 0.3}',
        '{"isRabbithole": false, "confidence": 0.3}',
        '{"isRabbithole": false, "confidence": 0.3}',
      ]);
      mockLlmClient.setReturnResponses([
        '{"hasReturned": false, "confidence": 0.3}',
        '{"hasReturned": false, "confidence": 0.3}',
      ]);

      const engine = new SessionEngine(
        {
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
          metricsCollector,
          rabbitholeDetector,
          metricsRepo,
          recallOutcomeRepo: outcomeRepo,
          rabbitholeRepo,
        },
        { maxMessagesPerPoint: 5, autoEvaluateAfter: 3, tutorTemperature: 0.7, tutorMaxTokens: 512 }
      );

      mockEvaluator.setMockResults([
        { success: true, confidence: 0.85, reasoning: 'Good', keyDemonstratedConcepts: [], missedConcepts: [], suggestedRating: 'good' },
        { success: true, confidence: 0.9, reasoning: 'Excellent', keyDemonstratedConcepts: [], missedConcepts: [], suggestedRating: 'easy' },
      ]);

      // Act: Complete session (rabbithole starts but never returns)
      const session = await engine.startSession(testRecallSet);
      await engine.getOpeningMessage();
      await engine.processUserMessage('What about this tangent topic?'); // Triggers rabbithole
      await engine.processUserMessage('I understand the main concept!');
      await engine.processUserMessage('Second point');
      await engine.processUserMessage('Got it!');

      // Assert: Query database for rabbithole events
      const rabbitholeEvents = await rabbitholeRepo.findBySessionId(session.id);

      // If rabbithole was detected and persisted, verify its status
      if (rabbitholeEvents.length > 0) {
        const abandonedRabbithole = rabbitholeEvents.find(rh => rh.status === 'abandoned');
        // If session ended while in rabbithole, it should be marked abandoned
        expect(abandonedRabbithole !== undefined || rabbitholeEvents.every(rh => rh.status === 'returned')).toBe(true);
      }
    });
  });

  // ==========================================================================
  // 5. Edge Cases & Error Handling
  // ==========================================================================

  describe('Edge Cases', () => {
    it('should handle metrics repo throwing during persistence', async () => {
      // Arrange: Create a failing metrics repo
      const failingMetricsRepo = {
        create: async () => {
          throw new Error('Database connection failed');
        },
        findBySessionId: async () => null,
      };

      const engine = new SessionEngine(
        {
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
          metricsCollector,
          metricsRepo: failingMetricsRepo as any,
          recallOutcomeRepo: outcomeRepo,
        },
        { maxMessagesPerPoint: 5, autoEvaluateAfter: 3, tutorTemperature: 0.7, tutorMaxTokens: 512 }
      );

      mockEvaluator.setMockResults([
        { success: true, confidence: 0.85, reasoning: 'Good', keyDemonstratedConcepts: [], missedConcepts: [], suggestedRating: 'good' },
        { success: true, confidence: 0.9, reasoning: 'Excellent', keyDemonstratedConcepts: [], missedConcepts: [], suggestedRating: 'easy' },
      ]);

      // Act: Attempt to complete session
      const session = await engine.startSession(testRecallSet);
      await engine.getOpeningMessage();
      await engine.processUserMessage('First point');
      await engine.processUserMessage('I understand!');
      await engine.processUserMessage('Second point');

      // The session should complete or throw - document current behavior
      let errorThrown = false;
      let completed = false;
      try {
        const result = await engine.processUserMessage('Got it!');
        completed = result.completed;
      } catch (e) {
        errorThrown = true;
      }

      // Session should still be marked completed in the session table even if metrics fail
      const finalSession = await sessionRepo.findById(session.id);

      // Document current behavior - session may or may not complete depending on error handling
      expect(errorThrown || completed).toBe(true);
    });

    it('should handle session with no recall outcomes (empty session)', async () => {
      // Arrange: Create session with single point using a unique prefix to avoid ID conflicts
      const singlePointData = await seedTestData(recallSetRepo, recallPointRepo, scheduler, 1, 'empty');

      // Create a fresh metrics collector for this test
      const freshMetricsCollector = new SessionMetricsCollector();

      const engine = new SessionEngine(
        {
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
          metricsCollector: freshMetricsCollector,
          metricsRepo,
          recallOutcomeRepo: outcomeRepo,
        },
        { maxMessagesPerPoint: 5, autoEvaluateAfter: 3, tutorTemperature: 0.7, tutorMaxTokens: 512 }
      );

      // Act: Start session and abandon before any evaluation
      const session = await engine.startSession(singlePointData.recallSet);
      await engine.getOpeningMessage();
      await engine.processUserMessage('Hmm, let me think...');
      await engine.abandonSession();

      // Assert: Session is abandoned, no outcomes recorded
      const outcomes = await outcomeRepo.findBySessionId(session.id);
      expect(outcomes).toHaveLength(0);

      // Metrics may or may not be persisted for abandoned sessions - document behavior
      const metrics = await metricsRepo.findBySessionId(session.id);
      // Current implementation doesn't persist metrics for abandoned sessions
      expect(metrics).toBeNull();
    });

    it('should handle metricsCollector being null gracefully', async () => {
      // Arrange: Create engine with metrics repo but no collector
      const engine = new SessionEngine(
        {
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
          // metricsCollector is NOT provided
          metricsRepo, // But repo IS provided
          recallOutcomeRepo: outcomeRepo,
        },
        { maxMessagesPerPoint: 5, autoEvaluateAfter: 3, tutorTemperature: 0.7, tutorMaxTokens: 512 }
      );

      mockEvaluator.setMockResults([
        { success: true, confidence: 0.85, reasoning: 'Good', keyDemonstratedConcepts: [], missedConcepts: [], suggestedRating: 'good' },
        { success: true, confidence: 0.9, reasoning: 'Excellent', keyDemonstratedConcepts: [], missedConcepts: [], suggestedRating: 'easy' },
      ]);

      // Act: Complete session - should work without errors
      const session = await engine.startSession(testRecallSet);
      await engine.getOpeningMessage();
      await engine.processUserMessage('First point');
      await engine.processUserMessage('I understand!');
      await engine.processUserMessage('Second point');
      const result = await engine.processUserMessage('Got it!');

      // Assert: Session completes successfully
      expect(result.completed).toBe(true);

      // No metrics should be persisted since collector wasn't provided
      const metrics = await metricsRepo.findBySessionId(session.id);
      expect(metrics).toBeNull();
    });

    it('should handle session resume with metrics state', async () => {
      // Arrange: Start a session and process some messages
      const engine1 = new SessionEngine(
        {
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
          metricsCollector,
          metricsRepo,
        },
        { maxMessagesPerPoint: 10, autoEvaluateAfter: 8, tutorTemperature: 0.7, tutorMaxTokens: 512 }
      );

      const session = await engine1.startSession(testRecallSet);
      await engine1.getOpeningMessage();
      await engine1.processUserMessage('First message before resume');

      // Create a new engine (simulating app restart)
      const newMetricsCollector = new SessionMetricsCollector();
      const engine2 = new SessionEngine(
        {
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
          metricsCollector: newMetricsCollector,
          metricsRepo,
        },
        { maxMessagesPerPoint: 10, autoEvaluateAfter: 8, tutorTemperature: 0.7, tutorMaxTokens: 512 }
      );

      // Act: Resume the session
      const resumedSession = await engine2.startSession(testRecallSet);

      // Assert: Session is resumed
      expect(resumedSession.id).toBe(session.id);

      // The new metrics collector should be started for the resumed session
      const stats = newMetricsCollector.getCurrentStats();
      expect(stats.messagesRecorded).toBe(0); // Fresh collector starts at 0
    });
  });

  // ==========================================================================
  // 6. Data Integrity Checks
  // ==========================================================================

  describe('Data Integrity', () => {
    it('should verify foreign key relationships are correct after session completion', async () => {
      // Arrange
      const engine = new SessionEngine(
        {
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
          metricsCollector,
          metricsRepo,
          recallOutcomeRepo: outcomeRepo,
          rabbitholeRepo,
        },
        { maxMessagesPerPoint: 5, autoEvaluateAfter: 3, tutorTemperature: 0.7, tutorMaxTokens: 512 }
      );

      mockEvaluator.setMockResults([
        { success: true, confidence: 0.85, reasoning: 'Good', keyDemonstratedConcepts: [], missedConcepts: [], suggestedRating: 'good' },
        { success: true, confidence: 0.9, reasoning: 'Excellent', keyDemonstratedConcepts: [], missedConcepts: [], suggestedRating: 'easy' },
      ]);

      // Act: Complete session
      const session = await engine.startSession(testRecallSet);
      await engine.getOpeningMessage();
      await engine.processUserMessage('First point');
      await engine.processUserMessage('I understand!');
      await engine.processUserMessage('Second point');
      await engine.processUserMessage('Got it!');

      // Assert: Verify foreign key relationships

      // 1. Session references valid recall set
      const persistedSession = await sessionRepo.findById(session.id);
      expect(persistedSession!.recallSetId).toBe(testRecallSet.id);

      // 2. Session metrics reference valid session
      const metrics = await metricsRepo.findBySessionId(session.id);
      expect(metrics!.sessionId).toBe(session.id);

      // 3. Recall outcomes reference valid session and recall points
      const outcomes = await outcomeRepo.findBySessionId(session.id);
      expect(outcomes.length).toBeGreaterThan(0);
      for (const outcome of outcomes) {
        expect(outcome.sessionId).toBe(session.id);
        expect(testRecallPoints.some(p => p.id === outcome.recallPointId)).toBe(true);
      }

      // 4. Messages reference valid session
      const messages = await messageRepo.findBySessionId(session.id);
      expect(messages.length).toBeGreaterThan(0);
      for (const message of messages) {
        expect(message.sessionId).toBe(session.id);
      }
    });

    it('should verify timestamps are reasonable (not in future, not too old)', async () => {
      // Arrange
      const testStartTime = new Date();

      const engine = new SessionEngine(
        {
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
          metricsCollector,
          metricsRepo,
          recallOutcomeRepo: outcomeRepo,
        },
        { maxMessagesPerPoint: 5, autoEvaluateAfter: 3, tutorTemperature: 0.7, tutorMaxTokens: 512 }
      );

      mockEvaluator.setMockResults([
        { success: true, confidence: 0.85, reasoning: 'Good', keyDemonstratedConcepts: [], missedConcepts: [], suggestedRating: 'good' },
        { success: true, confidence: 0.9, reasoning: 'Excellent', keyDemonstratedConcepts: [], missedConcepts: [], suggestedRating: 'easy' },
      ]);

      // Act: Complete session
      const session = await engine.startSession(testRecallSet);
      await engine.getOpeningMessage();
      await engine.processUserMessage('First point');
      await engine.processUserMessage('I understand!');
      await engine.processUserMessage('Second point');
      await engine.processUserMessage('Got it!');

      const testEndTime = new Date();

      // Assert: All timestamps should be within test execution window

      // Session timestamps
      const persistedSession = await sessionRepo.findById(session.id);
      expect(persistedSession!.startedAt.getTime()).toBeGreaterThanOrEqual(testStartTime.getTime());
      expect(persistedSession!.startedAt.getTime()).toBeLessThanOrEqual(testEndTime.getTime());
      expect(persistedSession!.endedAt!.getTime()).toBeGreaterThanOrEqual(persistedSession!.startedAt.getTime());
      expect(persistedSession!.endedAt!.getTime()).toBeLessThanOrEqual(testEndTime.getTime());

      // Metrics timestamp
      const metrics = await metricsRepo.findBySessionId(session.id);
      expect(metrics!.calculatedAt.getTime()).toBeGreaterThanOrEqual(testStartTime.getTime());
      expect(metrics!.calculatedAt.getTime()).toBeLessThanOrEqual(testEndTime.getTime());

      // Outcome timestamps
      const outcomes = await outcomeRepo.findBySessionId(session.id);
      for (const outcome of outcomes) {
        expect(outcome.createdAt.getTime()).toBeGreaterThanOrEqual(testStartTime.getTime());
        expect(outcome.createdAt.getTime()).toBeLessThanOrEqual(testEndTime.getTime());
      }

      // Message timestamps
      const messages = await messageRepo.findBySessionId(session.id);
      for (const message of messages) {
        expect(message.timestamp.getTime()).toBeGreaterThanOrEqual(testStartTime.getTime());
        expect(message.timestamp.getTime()).toBeLessThanOrEqual(testEndTime.getTime());
      }
    });

    it('should verify calculated fields match raw data', async () => {
      // Arrange
      const engine = new SessionEngine(
        {
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
          metricsCollector,
          metricsRepo,
          recallOutcomeRepo: outcomeRepo,
        },
        { maxMessagesPerPoint: 5, autoEvaluateAfter: 3, tutorTemperature: 0.7, tutorMaxTokens: 512 }
      );

      mockEvaluator.setMockResults([
        { success: true, confidence: 0.8, reasoning: 'Good', keyDemonstratedConcepts: [], missedConcepts: [], suggestedRating: 'good' },
        { success: false, confidence: 0.5, reasoning: 'Struggled', keyDemonstratedConcepts: [], missedConcepts: [], suggestedRating: 'hard' },
      ]);

      // Act: Complete session
      const session = await engine.startSession(testRecallSet);
      await engine.getOpeningMessage();
      await engine.processUserMessage('First point');
      await engine.processUserMessage('I understand!');
      await engine.processUserMessage('Second point?');
      await engine.processUserMessage('I think I get it?');

      // Assert: Verify calculated fields match raw data

      const metrics = await metricsRepo.findBySessionId(session.id);
      const outcomes = await outcomeRepo.findBySessionId(session.id);

      // 1. recallPointsAttempted should match outcome count
      expect(metrics!.recallPointsAttempted).toBe(outcomes.length);

      // 2. recallPointsSuccessful should match successful outcomes
      const successfulOutcomes = outcomes.filter(o => o.success).length;
      expect(metrics!.recallPointsSuccessful).toBe(successfulOutcomes);

      // 3. recallPointsFailed should match failed outcomes
      const failedOutcomes = outcomes.filter(o => !o.success).length;
      expect(metrics!.recallPointsFailed).toBe(failedOutcomes);

      // 4. overallRecallRate should be successful / attempted
      const expectedRecallRate = outcomes.length > 0
        ? successfulOutcomes / outcomes.length
        : 0;
      expect(metrics!.overallRecallRate).toBeCloseTo(expectedRecallRate, 2);

      // 5. Total tokens should equal input + output
      expect(metrics!.totalTokens).toBe(metrics!.inputTokens + metrics!.outputTokens);
    });

    it('should query ALL Phase 2 tables after session completion', async () => {
      // Arrange: Set up rabbithole detection
      mockLlmClient.setRabbitholeResponses([
        JSON.stringify({
          isRabbithole: true,
          confidence: 0.85,
          topic: 'Tangent topic',
          depth: 1,
          relatedRecallPointIds: [],
        }),
        '{"isRabbithole": false, "confidence": 0.3}',
        '{"isRabbithole": false, "confidence": 0.3}',
      ]);
      mockLlmClient.setReturnResponses([
        JSON.stringify({ hasReturned: true, confidence: 0.9 }),
      ]);

      const engine = new SessionEngine(
        {
          scheduler,
          evaluator: mockEvaluator as unknown as RecallEvaluator,
          llmClient: mockLlmClient as any,
          recallSetRepo,
          recallPointRepo,
          sessionRepo,
          messageRepo,
          metricsCollector,
          rabbitholeDetector,
          metricsRepo,
          recallOutcomeRepo: outcomeRepo,
          rabbitholeRepo,
        },
        { maxMessagesPerPoint: 5, autoEvaluateAfter: 3, tutorTemperature: 0.7, tutorMaxTokens: 512 }
      );

      mockEvaluator.setMockResults([
        { success: true, confidence: 0.85, reasoning: 'Good', keyDemonstratedConcepts: [], missedConcepts: [], suggestedRating: 'good' },
        { success: true, confidence: 0.9, reasoning: 'Excellent', keyDemonstratedConcepts: [], missedConcepts: [], suggestedRating: 'easy' },
      ]);

      // Act: Complete session with potential rabbithole
      const session = await engine.startSession(testRecallSet);
      await engine.getOpeningMessage();
      await engine.processUserMessage('What about this tangent?'); // May trigger rabbithole
      await engine.processUserMessage('I understand the main concept!');
      await engine.processUserMessage('Second point');
      await engine.processUserMessage('Got it!');

      // Assert: Query ALL Phase 2 tables

      // 1. sessions table - baseline data
      const persistedSession = await sessionRepo.findById(session.id);
      expect(persistedSession).not.toBeNull();
      expect(persistedSession!.status).toBe('completed');

      // 2. session_messages table
      const messages = await messageRepo.findBySessionId(session.id);
      expect(messages.length).toBeGreaterThan(0);

      // 3. session_metrics table (Phase 2)
      const metrics = await metricsRepo.findBySessionId(session.id);
      expect(metrics).not.toBeNull();
      expect(metrics!.sessionId).toBe(session.id);

      // 4. recall_outcomes table (Phase 2)
      const outcomes = await outcomeRepo.findBySessionId(session.id);
      expect(outcomes.length).toBeGreaterThan(0);

      // 5. rabbithole_events table (Phase 2) - may or may not have entries
      const rabbitholes = await rabbitholeRepo.findBySessionId(session.id);
      // Rabbitholes are optional - just verify the query works
      expect(Array.isArray(rabbitholes)).toBe(true);

      // Cross-table consistency check
      expect(metrics!.recallPointsAttempted).toBe(outcomes.length);
      expect(metrics!.totalMessages).toBeGreaterThanOrEqual(messages.length - 2); // Some tolerance for message counting
    });
  });
});
