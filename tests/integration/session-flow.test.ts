/**
 * End-to-End Integration Test for Session Flow
 *
 * This test suite verifies the complete session flow from start to finish:
 * 1. Start with a seeded in-memory database
 * 2. Start a recall session
 * 3. Process a conversation (with mocked LLM)
 * 4. Complete the session
 * 5. Verify FSRS state was correctly updated
 *
 * T06 update: The evaluator now runs continuously after every user message
 * against ALL unchecked points. Tests use a configurable mock evaluator to
 * control which points are "recalled" on each call.
 *
 * The tests use mocked LLM responses for determinism and fast execution.
 * The focus is on verifying the integration between all system components:
 * - Database layer (repositories)
 * - Session engine
 * - FSRS scheduler
 * - Recall evaluator (mocked)
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
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
import type { RecallEvaluation } from '../../src/core/scoring/types';
import type { LLMMessage, LLMResponse, StreamCallbacks, LLMConfig } from '../../src/llm/types';
import type { AppDatabase } from '../../src/storage/db';

/**
 * Mock Anthropic Client for deterministic testing.
 *
 * This mock provides predictable responses without making actual API calls.
 * It simulates the behavior of the real AnthropicClient but returns
 * controlled responses for testing the session flow.
 */
class MockAnthropicClient {
  private systemPrompt: string | undefined;

  /**
   * Simulates a non-streaming completion call.
   * Returns a mock response based on the input prompt.
   */
  async complete(
    messages: string | LLMMessage[],
    _config?: LLMConfig
  ): Promise<LLMResponse> {
    // Convert string to message array for consistent handling
    const input = typeof messages === 'string' ? messages : messages[0]?.content || '';

    // Determine response based on input context
    let responseText: string;

    if (input.includes('Begin the recall discussion') || input.includes('opening question')) {
      // Opening message for a recall session
      responseText =
        "Let's explore what you know about motivation. Can you tell me what comes first - action or motivation?";
    } else if (input.includes('positive feedback') || input.includes('transition to the next topic')) {
      // Transition message after successful recall
      responseText =
        "Excellent understanding! You've correctly identified that action creates motivation. Now, let's move on to explore internal vs external motivation.";
    } else if (input.includes('completed all recall points') || input.includes('congratulatory')) {
      // Session completion message
      responseText =
        "Congratulations! You've successfully completed this recall session, reviewing all the key concepts about motivation. Keep up the great work!";
    } else if (input.includes('struggled') || input.includes('encouraging feedback')) {
      // Message when user struggled with recall
      responseText =
        "That's okay! Remember, action actually precedes motivation. Starting is the hardest part, and once you begin, motivation follows. Let's continue to the next topic.";
    } else {
      // Generic follow-up response during conversation
      responseText =
        "That's an interesting perspective! Can you tell me more about how this relates to what we've discussed?";
    }

    return {
      text: responseText,
      usage: {
        inputTokens: this.estimateTokens(input),
        outputTokens: this.estimateTokens(responseText),
      },
      stopReason: 'end_turn',
    };
  }

  /**
   * Simulates a streaming completion call.
   * Immediately returns the complete response via callbacks.
   */
  async stream(
    _messages: string | LLMMessage[],
    callbacks: StreamCallbacks,
    _config?: LLMConfig
  ): Promise<void> {
    const response =
      "Great question! Let's explore this concept together. What do you already know about motivation?";

    // Simulate streaming by calling callbacks
    callbacks.onText?.(response);
    callbacks.onComplete?.(response);
  }

  /**
   * Estimates the number of tokens in a string.
   * Uses a simple character-based approximation.
   */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Sets the system prompt for subsequent calls.
   */
  setSystemPrompt(prompt: string | undefined): void {
    this.systemPrompt = prompt;
  }

  /**
   * Gets the current system prompt.
   */
  getSystemPrompt(): string | undefined {
    return this.systemPrompt;
  }
}

/**
 * Mock RecallEvaluator for deterministic testing.
 *
 * Supports per-point result sequences so tests can control exactly which points
 * get recalled and when. Each call to evaluate() pops the next result for that
 * point ID from the configured queue.
 */
class MockRecallEvaluator {
  private defaultSuccess: boolean = true;
  private defaultConfidence: number = 0.85;
  private defaultReasoning: string = 'User demonstrated clear understanding of the concept';

  // Per-point result queue: keyed by point ID
  private pointResultQueues: Map<string, RecallEvaluation[]> = new Map();
  // Global result queue (used when no per-point queue is set)
  private globalResultQueue: RecallEvaluation[] = [];

  /**
   * Sets the default mock evaluation result for subsequent calls.
   */
  setMockResult(success: boolean, confidence: number, reasoning: string): void {
    this.defaultSuccess = success;
    this.defaultConfidence = confidence;
    this.defaultReasoning = reasoning;
  }

  /**
   * Sets a queue of results for a specific point ID.
   * Each evaluate() call for this point pops the next result.
   */
  setPointResults(pointId: string, results: RecallEvaluation[]): void {
    this.pointResultQueues.set(pointId, [...results]);
  }

  /**
   * Sets a global result queue (used when per-point queue is empty/unset).
   */
  setGlobalResults(results: RecallEvaluation[]): void {
    this.globalResultQueue = [...results];
  }

  /**
   * Returns a mock evaluation based on configured values.
   * T06: Called for each unchecked point on every processUserMessage().
   */
  async evaluate(
    recallPoint: RecallPoint,
    _conversationMessages: unknown[]
  ): Promise<RecallEvaluation> {
    // Check per-point queue first
    const pointQueue = this.pointResultQueues.get(recallPoint.id);
    if (pointQueue && pointQueue.length > 0) {
      return pointQueue.shift()!;
    }

    // Then check global queue
    if (this.globalResultQueue.length > 0) {
      return this.globalResultQueue.shift()!;
    }

    // Fall back to default
    return {
      success: this.defaultSuccess,
      confidence: this.defaultConfidence,
      reasoning: this.defaultReasoning,
    };
  }
}

/**
 * Creates an in-memory database with migrations applied.
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
 * Seeds the database with test data.
 */
async function seedTestData(
  recallSetRepo: RecallSetRepository,
  recallPointRepo: RecallPointRepository,
  scheduler: FSRSScheduler
): Promise<{ recallSet: RecallSet; recallPoints: RecallPoint[] }> {
  const recallSet = await recallSetRepo.create({
    id: 'rs_test_motivation',
    name: 'Test Motivation Set',
    description: 'Test recall set for motivation concepts',
    status: 'active',
    discussionSystemPrompt:
      'You are helping the user internalize concepts about motivation and action.',
  });

  const now = new Date();
  const initialState = scheduler.createInitialState(now);

  const recallPointsData = [
    {
      id: 'rp_test_action_motivation',
      recallSetId: recallSet.id,
      content: 'Action creates motivation, not the other way around.',
      context: 'Understanding that starting is often harder than continuing.',
      fsrsState: initialState,
    },
    {
      id: 'rp_test_internal_motivation',
      recallSetId: recallSet.id,
      content: 'Internal motivation (autonomy, mastery, purpose) is more sustainable than external motivation.',
      context: 'Self-Determination Theory concepts.',
      fsrsState: initialState,
    },
  ];

  const createdPoints: RecallPoint[] = [];
  for (const pointData of recallPointsData) {
    const point = await recallPointRepo.create(pointData);
    createdPoints.push(point);
  }

  return { recallSet, recallPoints: createdPoints };
}

describe('Session Flow E2E', () => {
  let db: AppDatabase;
  let sqlite: Database;
  let recallSetRepo: RecallSetRepository;
  let recallPointRepo: RecallPointRepository;
  let sessionRepo: SessionRepository;
  let messageRepo: SessionMessageRepository;

  let scheduler: FSRSScheduler;
  let mockLlmClient: MockAnthropicClient;
  let mockEvaluator: MockRecallEvaluator;
  let engine: SessionEngine;

  let testRecallSet: RecallSet;
  let testRecallPoints: RecallPoint[];

  beforeEach(async () => {
    const testDb = createTestDatabase();
    db = testDb.db;
    sqlite = testDb.sqlite;

    recallSetRepo = new RecallSetRepository(db);
    recallPointRepo = new RecallPointRepository(db);
    sessionRepo = new SessionRepository(db);
    messageRepo = new SessionMessageRepository(db);

    scheduler = new FSRSScheduler();
    mockLlmClient = new MockAnthropicClient();
    mockEvaluator = new MockRecallEvaluator();

    const seedData = await seedTestData(recallSetRepo, recallPointRepo, scheduler);
    testRecallSet = seedData.recallSet;
    testRecallPoints = seedData.recallPoints;

    engine = new SessionEngine(
      {
        scheduler,
        evaluator: mockEvaluator as unknown as RecallEvaluator,
        llmClient: mockLlmClient as any,
        recallSetRepo,
        recallPointRepo,
        sessionRepo,
        messageRepo,
      },
      {
        tutorTemperature: 0.7,
        tutorMaxTokens: 512,
      }
    );
  });

  afterEach(() => {
    if (sqlite) {
      sqlite.close();
    }
  });

  it('should complete a full session flow with FSRS state updates', async () => {
    // Step 1: Verify initial state of recall points
    const initialPoint = await recallPointRepo.findById(testRecallPoints[0].id);
    expect(initialPoint).not.toBeNull();
    expect(initialPoint!.fsrsState.reps).toBe(0);
    expect(initialPoint!.fsrsState.state).toBe('new');

    // Step 2: Start the session
    const session = await engine.startSession(testRecallSet);
    expect(session).not.toBeNull();
    expect(session.status).toBe('in_progress');
    expect(session.targetRecallPointIds).toHaveLength(2);

    // Verify session was persisted
    const persistedSession = await sessionRepo.findById(session.id);
    expect(persistedSession).not.toBeNull();
    expect(persistedSession!.status).toBe('in_progress');

    // Step 3: Get opening message
    const openingMessage = await engine.getOpeningMessage();
    expect(openingMessage).toContain('motivation');

    // Verify message was persisted
    const messagesAfterOpening = await messageRepo.findBySessionId(session.id);
    expect(messagesAfterOpening).toHaveLength(1);
    expect(messagesAfterOpening[0].role).toBe('assistant');

    // Step 4: Configure evaluator to recall one point at a time.
    // First call: point 1 succeeds, point 2 fails
    // Second call: point 2 succeeds
    mockEvaluator.setPointResults(testRecallPoints[0].id, [
      { success: true, confidence: 0.85, reasoning: 'Recalled action creates motivation' },
    ]);
    mockEvaluator.setPointResults(testRecallPoints[1].id, [
      { success: false, confidence: 0.2, reasoning: 'Not yet recalled' },
      { success: true, confidence: 0.85, reasoning: 'Now recalled internal motivation' },
    ]);

    // Step 5: First user message — continuous evaluation recalls point 1 only
    const result1 = await engine.processUserMessage('Action creates motivation, not the other way around.');
    expect(result1.pointsRecalledThisTurn).toContain(testRecallPoints[0].id);
    expect(result1.completed).toBe(false);
    expect(result1.recalledCount).toBe(1);

    // Step 6: Verify FSRS state was updated for the first point
    const updatedPoint1 = await recallPointRepo.findById(testRecallPoints[0].id);
    expect(updatedPoint1).not.toBeNull();
    expect(updatedPoint1!.fsrsState.reps).toBe(1);
    expect(updatedPoint1!.fsrsState.state).not.toBe('new');
    expect(updatedPoint1!.fsrsState.lastReview).not.toBeNull();
    expect(updatedPoint1!.recallHistory).toHaveLength(1);
    expect(updatedPoint1!.recallHistory[0].success).toBe(true);

    // Step 7: Second user message — continuous evaluation now recalls point 2
    const result2 = await engine.processUserMessage('Internal motivation is about autonomy, mastery, and purpose.');
    expect(result2.completed).toBe(true);
    expect(result2.recalledCount).toBe(2);

    // Step 8: Verify final session state
    const finalSession = await sessionRepo.findById(session.id);
    expect(finalSession).not.toBeNull();
    expect(finalSession!.status).toBe('completed');
    expect(finalSession!.endedAt).not.toBeNull();

    // Step 9: Verify FSRS state for the second point
    const updatedPoint2 = await recallPointRepo.findById(testRecallPoints[1].id);
    expect(updatedPoint2).not.toBeNull();
    expect(updatedPoint2!.fsrsState.reps).toBe(1);
    expect(updatedPoint2!.fsrsState.state).not.toBe('new');
    expect(updatedPoint2!.recallHistory).toHaveLength(1);
  });

  it('should mark session as completed when all points are recalled', async () => {
    const session = await engine.startSession(testRecallSet);
    expect(session.status).toBe('in_progress');

    await engine.getOpeningMessage();

    // Default evaluator returns success with 0.85 confidence, which means
    // both points get recalled on the first processUserMessage call.
    const result = await engine.processUserMessage('I remember everything!');

    // Both points should be recalled in a single turn
    expect(result.pointsRecalledThisTurn).toHaveLength(2);
    expect(result.completed).toBe(true);
    expect(result.recalledCount).toBe(2);
    expect(result.totalPoints).toBe(2);

    // Verify session status in database
    const completedSession = await sessionRepo.findById(session.id);
    expect(completedSession).not.toBeNull();
    expect(completedSession!.status).toBe('completed');
  });

  it('should handle session abandonment correctly', async () => {
    const session = await engine.startSession(testRecallSet);
    expect(session.status).toBe('in_progress');

    await engine.getOpeningMessage();

    // Configure evaluator to not recall anything (below 0.6 threshold)
    mockEvaluator.setMockResult(false, 0.2, 'User has not recalled');
    await engine.processUserMessage('Hmm, I need to think about this...');

    // Abandon the session
    await engine.abandonSession();

    // Verify session status
    const abandonedSession = await sessionRepo.findById(session.id);
    expect(abandonedSession).not.toBeNull();
    expect(abandonedSession!.status).toBe('abandoned');
    expect(abandonedSession!.endedAt).not.toBeNull();

    // FSRS state should NOT be updated for abandoned sessions
    const point1 = await recallPointRepo.findById(testRecallPoints[0].id);
    expect(point1!.fsrsState.reps).toBe(0);
    expect(point1!.fsrsState.state).toBe('new');
  });

  it('should resume an existing in-progress session', async () => {
    // Configure evaluator to not recall anything so session stays in-progress
    mockEvaluator.setMockResult(false, 0.2, 'Not recalled yet');

    const session1 = await engine.startSession(testRecallSet);
    await engine.getOpeningMessage();
    await engine.processUserMessage('Some initial thoughts...');

    // Create a new engine instance (simulating app restart)
    const engine2 = new SessionEngine(
      {
        scheduler,
        evaluator: mockEvaluator as unknown as RecallEvaluator,
        llmClient: mockLlmClient as any,
        recallSetRepo,
        recallPointRepo,
        sessionRepo,
        messageRepo,
      },
      {
        tutorTemperature: 0.7,
        tutorMaxTokens: 512,
      }
    );

    // Starting a session should resume the existing one
    const session2 = await engine2.startSession(testRecallSet);

    // Should be the same session
    expect(session2.id).toBe(session1.id);

    // Should have the existing messages loaded
    const messages = await messageRepo.findBySessionId(session2.id);
    expect(messages.length).toBeGreaterThan(0);
  });

  it('should correctly map evaluation results to FSRS ratings', async () => {
    // Start session
    await engine.startSession(testRecallSet);
    await engine.getOpeningMessage();

    // Test high confidence success -> should result in longer interval
    mockEvaluator.setMockResult(true, 0.95, 'Excellent recall with high confidence');
    await engine.processUserMessage('Action creates motivation!');

    const pointAfterEasy = await recallPointRepo.findById(testRecallPoints[0].id);
    const intervalAfterHighConfidence = pointAfterEasy!.fsrsState.due.getTime() - Date.now();

    // Reset and test with lower confidence (but still >= 0.6 threshold)
    const { db: newDb, sqlite: newSqlite } = createTestDatabase();
    const newRecallSetRepo = new RecallSetRepository(newDb);
    const newRecallPointRepo = new RecallPointRepository(newDb);
    const newSessionRepo = new SessionRepository(newDb);
    const newMessageRepo = new SessionMessageRepository(newDb);

    const newSeedData = await seedTestData(newRecallSetRepo, newRecallPointRepo, scheduler);

    const newMockEvaluator = new MockRecallEvaluator();
    const newEngine = new SessionEngine(
      {
        scheduler,
        evaluator: newMockEvaluator as unknown as RecallEvaluator,
        llmClient: mockLlmClient as any,
        recallSetRepo: newRecallSetRepo,
        recallPointRepo: newRecallPointRepo,
        sessionRepo: newSessionRepo,
        messageRepo: newMessageRepo,
      },
      {
        tutorTemperature: 0.7,
        tutorMaxTokens: 512,
      }
    );

    await newEngine.startSession(newSeedData.recallSet);
    await newEngine.getOpeningMessage();

    // Test lower confidence success (0.65 is >= 0.6 threshold, maps to 'hard' rating)
    newMockEvaluator.setMockResult(true, 0.65, 'Recalled with difficulty');
    await newEngine.processUserMessage('I think action creates motivation?');

    const pointAfterHard = await newRecallPointRepo.findById(newSeedData.recallPoints[0].id);
    const intervalAfterLowConfidence = pointAfterHard!.fsrsState.due.getTime() - Date.now();

    // High confidence should result in equal or longer interval than low confidence
    expect(intervalAfterHighConfidence).toBeGreaterThanOrEqual(intervalAfterLowConfidence);

    newSqlite.close();
  });

  it('should persist all session messages correctly', async () => {
    const session = await engine.startSession(testRecallSet);
    await engine.getOpeningMessage();

    // Configure evaluator to not recall so we get multiple conversation turns
    mockEvaluator.setMockResult(false, 0.2, 'Not yet recalled');

    // Exchange several messages
    await engine.processUserMessage('First user message');
    await engine.processUserMessage('Second user message');
    await engine.processUserMessage('Third user message');

    // Get all messages
    const messages = await messageRepo.findBySessionId(session.id);

    // Should have: opening (1 assistant) + 3 * (1 user + 1 assistant) = 7
    expect(messages.length).toBeGreaterThan(4);

    // Verify message structure
    const userMessages = messages.filter((m) => m.role === 'user');
    const assistantMessages = messages.filter((m) => m.role === 'assistant');

    expect(userMessages.length).toBeGreaterThanOrEqual(3);
    expect(assistantMessages.length).toBeGreaterThanOrEqual(1);

    // Messages should be ordered by timestamp
    for (let i = 1; i < messages.length; i++) {
      expect(messages[i].timestamp.getTime()).toBeGreaterThanOrEqual(
        messages[i - 1].timestamp.getTime()
      );
    }
  });

  it('should handle failure evaluations correctly', async () => {
    // Configure evaluator to return failure (below 0.6 threshold)
    mockEvaluator.setMockResult(false, 0.4, 'User did not recall the information');

    await engine.startSession(testRecallSet);
    await engine.getOpeningMessage();

    // Process messages — continuous evaluator runs but nothing is recalled
    const result1 = await engine.processUserMessage('I think motivation comes first?');
    expect(result1.pointsRecalledThisTurn).toHaveLength(0);
    expect(result1.completed).toBe(false);

    const result2 = await engine.processUserMessage('I think I understand now');
    expect(result2.pointsRecalledThisTurn).toHaveLength(0);
    expect(result2.completed).toBe(false);

    // FSRS should NOT be updated since no points were recalled
    const point = await recallPointRepo.findById(testRecallPoints[0].id);
    expect(point!.recallHistory).toHaveLength(0);
    expect(point!.fsrsState.reps).toBe(0);
  });

  it('should emit session events to registered listeners', async () => {
    const events: Array<{ type: string; data: unknown }> = [];

    engine.setEventListener((event) => {
      events.push({ type: event.type, data: event.data });
    });

    await engine.startSession(testRecallSet);
    await engine.getOpeningMessage();

    // Default evaluator succeeds, so both points recalled on first message
    await engine.processUserMessage('Action creates motivation!');

    // Verify events were emitted
    const eventTypes = events.map((e) => e.type);
    expect(eventTypes).toContain('session_started');
    expect(eventTypes).toContain('point_started');
    expect(eventTypes).toContain('assistant_message');
    expect(eventTypes).toContain('user_message');
    expect(eventTypes).toContain('point_evaluated');
    expect(eventTypes).toContain('point_recalled');
    expect(eventTypes).toContain('point_completed');
  });

  it('should correctly get session state for UI display', async () => {
    // Before session starts, state should be null
    expect(engine.getSessionState()).toBeNull();

    await engine.startSession(testRecallSet);
    await engine.getOpeningMessage();

    // Get session state
    const state = engine.getSessionState();
    expect(state).not.toBeNull();
    expect(state!.session).not.toBeNull();
    expect(state!.recallSet.id).toBe(testRecallSet.id);
    expect(state!.recalledCount).toBe(0);
    expect(state!.totalPoints).toBe(2);
    expect(state!.currentProbePoint!.id).toBe(testRecallPoints[0].id);
    expect(state!.messageCount).toBeGreaterThan(0);
  });

  it('should find due points correctly', async () => {
    const duePoints = await recallPointRepo.findDuePoints(testRecallSet.id);
    expect(duePoints).toHaveLength(2);

    // Update one point to be due in the future
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const futureState: FSRSState = {
      ...testRecallPoints[0].fsrsState,
      due: futureDate,
    };
    await recallPointRepo.updateFSRSState(testRecallPoints[0].id, futureState);

    const duePointsAfterUpdate = await recallPointRepo.findDuePoints(testRecallSet.id);
    expect(duePointsAfterUpdate).toHaveLength(1);
    expect(duePointsAfterUpdate[0].id).toBe(testRecallPoints[1].id);
  });

  it('should detect multi-point recall in a single message', async () => {
    // Default evaluator returns success for all points
    await engine.startSession(testRecallSet);
    await engine.getOpeningMessage();

    // A single user message should recall both points at once
    const result = await engine.processUserMessage(
      'Action creates motivation, and internal motivation (autonomy, mastery, purpose) is more sustainable.'
    );

    expect(result.pointsRecalledThisTurn).toHaveLength(2);
    expect(result.pointsRecalledThisTurn).toContain(testRecallPoints[0].id);
    expect(result.pointsRecalledThisTurn).toContain(testRecallPoints[1].id);
    expect(result.completed).toBe(true);
    expect(result.recalledCount).toBe(2);
  });
});
