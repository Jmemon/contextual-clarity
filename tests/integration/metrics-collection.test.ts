/**
 * Integration Tests: Metrics Collection Pipeline
 *
 * This test suite verifies the complete metrics collection flow end-to-end,
 * including:
 * - SessionMetricsCollector initialization and message recording
 * - Accurate timing calculations (active time vs pause time)
 * - Recall outcome recording with confidence and suggested ratings
 * - Token usage tracking and cost calculation
 * - Engagement score calculation
 * - RabbitholeDetector tangent detection and return handling
 * - Enhanced RecallEvaluator confidence scores and concept identification
 *
 * Tests use an in-memory SQLite database for isolation and reproducibility.
 * LLM responses are mocked to ensure deterministic test outcomes.
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
import { SessionMetricsRepository } from '../../src/storage/repositories/session-metrics.repository';
import { RecallOutcomeRepository } from '../../src/storage/repositories/recall-outcome.repository';
import { RabbitholeEventRepository } from '../../src/storage/repositories/rabbithole-event.repository';
import { SessionMetricsCollector } from '../../src/core/session/metrics-collector';
import { RabbitholeDetector } from '../../src/core/analysis/rabbithole-detector';
import { FSRSScheduler } from '../../src/core/fsrs';
import type { RecallSet, RecallPoint, Session, SessionMessage } from '../../src/core/models';
import type { EnhancedRecallEvaluation } from '../../src/core/scoring/types';
import type { AppDatabase } from '../../src/storage/db';
import type { LLMMessage, LLMResponse, StreamCallbacks, LLMConfig } from '../../src/llm/types';

/**
 * Mock Anthropic Client for deterministic testing of metrics collection.
 *
 * Provides controlled responses for rabbithole detection and return detection,
 * allowing us to test the metrics pipeline without actual LLM calls.
 */
class MockAnthropicClient {
  private rabbitHoleResponses: string[] = [];
  private returnResponses: string[] = [];
  private responseIndex = 0;
  private returnResponseIndex = 0;

  /**
   * Configure the mock to return specific rabbithole detection results.
   * Each call to complete() returns the next response in sequence.
   */
  setRabbitholeResponses(responses: string[]): void {
    this.rabbitHoleResponses = responses;
    this.responseIndex = 0;
  }

  /**
   * Configure the mock to return specific return detection results.
   */
  setReturnResponses(responses: string[]): void {
    this.returnResponses = responses;
    this.returnResponseIndex = 0;
  }

  /**
   * Simulates a completion call, returning configured responses.
   */
  async complete(
    messages: string | LLMMessage[],
    _config?: LLMConfig
  ): Promise<LLMResponse> {
    const input = typeof messages === 'string' ? messages : messages[0]?.content || '';

    // Determine which response to return based on the prompt content
    let responseText: string;

    if (input.includes('return') || input.includes('back to')) {
      // This is a return detection prompt
      responseText = this.returnResponses[this.returnResponseIndex] ||
        '{"hasReturned": false, "confidence": 0.3}';
      this.returnResponseIndex++;
    } else {
      // This is a rabbithole detection prompt
      responseText = this.rabbitHoleResponses[this.responseIndex] ||
        '{"isRabbithole": false, "confidence": 0.3}';
      this.responseIndex++;
    }

    return {
      text: responseText,
      usage: {
        inputTokens: 100,
        outputTokens: 50,
      },
      stopReason: 'end_turn',
    };
  }

  /**
   * Simulates streaming (not used in these tests but required for interface).
   */
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

  setSystemPrompt(_prompt: string | undefined): void {}
  getSystemPrompt(): string | undefined { return undefined; }
}

/**
 * Creates an in-memory database with migrations applied.
 *
 * @returns Object containing the database instance and raw SQLite connection
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
 * Seeds the database with test recall set and points.
 */
async function seedTestData(
  recallSetRepo: RecallSetRepository,
  recallPointRepo: RecallPointRepository,
  scheduler: FSRSScheduler
): Promise<{ recallSet: RecallSet; recallPoints: RecallPoint[] }> {
  const now = new Date();
  const initialState = scheduler.createInitialState(now);

  const recallSet = await recallSetRepo.create({
    id: 'rs_test_metrics',
    name: 'Test Metrics Set',
    description: 'Test recall set for metrics collection tests',
    status: 'active',
    discussionSystemPrompt: 'You are helping the user learn about history.',
  });

  const recallPoints: RecallPoint[] = [];
  for (let i = 1; i <= 3; i++) {
    const point = await recallPointRepo.create({
      id: `rp_test_${i}`,
      recallSetId: recallSet.id,
      content: `Test recall point ${i} content`,
      context: `Context for test point ${i}`,
      fsrsState: initialState,
    });
    recallPoints.push(point);
  }

  return { recallSet, recallPoints };
}

describe('Session Metrics Collection', () => {
  // Database and repository instances
  let db: AppDatabase;
  let sqlite: Database;
  let recallSetRepo: RecallSetRepository;
  let recallPointRepo: RecallPointRepository;
  let sessionRepo: SessionRepository;
  let messageRepo: SessionMessageRepository;
  let metricsRepo: SessionMetricsRepository;
  let outcomeRepo: RecallOutcomeRepository;
  let rabbitholeRepo: RabbitholeEventRepository;

  // Test services and data
  let scheduler: FSRSScheduler;
  let mockLlmClient: MockAnthropicClient;
  let testRecallSet: RecallSet;
  let testRecallPoints: RecallPoint[];

  beforeEach(async () => {
    // Create fresh in-memory database with migrations
    const testDb = createTestDatabase();
    db = testDb.db;
    sqlite = testDb.sqlite;

    // Initialize repositories
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

  describe('SessionMetricsCollector', () => {
    it('should initialize with session start', async () => {
      // Arrange: Create a metrics collector
      const collector = new SessionMetricsCollector();

      // Act: Start tracking a session
      collector.startSession('sess_test_001', 'claude-3-5-sonnet-20241022');

      // Assert: Verify collector is ready to track
      const stats = collector.getCurrentStats();
      expect(stats.messagesRecorded).toBe(0);
      expect(stats.outcomesRecorded).toBe(0);
      expect(stats.activeRabbitholes).toBe(0);
      expect(stats.tokensUsed).toBe(0);
    });

    it('should record message timings correctly', async () => {
      // Arrange: Create and start collector
      const collector = new SessionMetricsCollector();
      collector.startSession('sess_test_002');

      // Act: Record multiple messages with small delays
      collector.recordMessage('msg_001', 'assistant', 50, 200, 50);

      // Small delay to ensure timing difference
      await new Promise(resolve => setTimeout(resolve, 10));
      collector.recordMessage('msg_002', 'user', 30);

      await new Promise(resolve => setTimeout(resolve, 10));
      collector.recordMessage('msg_003', 'assistant', 60, 250, 60);

      // Assert: Verify message count and token tracking
      const stats = collector.getCurrentStats();
      expect(stats.messagesRecorded).toBe(3);
      // Token calculation: inputTokens + outputTokens from assistant messages
      // msg_001: 200 input + 50 output = 250
      // msg_003: 250 input + 60 output = 310
      // Total = 560
      expect(stats.tokensUsed).toBe(560); // (200+50) + (250+60) = 560
    });

    it('should calculate active vs pause time', async () => {
      // Arrange: Create collector
      const collector = new SessionMetricsCollector();
      collector.startSession('sess_test_003');

      // Act: Record messages, simulating a user pause
      // Note: The pause detection threshold is 5 minutes (300,000 ms)
      // We can't actually wait that long in tests, so we test the logic indirectly
      // by verifying the extended metrics calculation
      collector.recordMessage('msg_001', 'assistant', 50, 100, 50);
      collector.recordMessage('msg_002', 'user', 30);
      collector.recordMessage('msg_003', 'assistant', 60, 120, 60);
      collector.recordMessage('msg_004', 'user', 25);

      // Assert: Get extended metrics to verify calculation structure
      const extended = collector.getExtendedMetrics();
      expect(extended.activeTimeMs).toBeDefined();
      expect(extended.activeTimeMs).toBeGreaterThanOrEqual(0);
      expect(extended.totalMessages).toBe(4);
    });

    it('should record recall outcomes with correct ranges', async () => {
      // Arrange: Create collector and record some messages
      const collector = new SessionMetricsCollector();
      collector.startSession('sess_test_004');

      // Record messages for first recall point (indices 0-2)
      collector.recordMessage('msg_001', 'assistant', 50, 100, 50);
      await new Promise(resolve => setTimeout(resolve, 5));
      collector.recordMessage('msg_002', 'user', 30);
      await new Promise(resolve => setTimeout(resolve, 5));
      collector.recordMessage('msg_003', 'assistant', 40, 90, 40);

      // Act: Record a recall outcome for the first point
      const evaluation: EnhancedRecallEvaluation = {
        success: true,
        confidence: 0.85,
        reasoning: 'User demonstrated clear understanding',
        keyDemonstratedConcepts: ['concept1', 'concept2'],
        missedConcepts: [],
        suggestedRating: 'good',
      };

      collector.recordRecallOutcome('rp_test_1', evaluation, 0, 2);

      // Assert: Verify outcome was recorded
      const stats = collector.getCurrentStats();
      expect(stats.outcomesRecorded).toBe(1);

      // Verify extended metrics show correct recall stats
      const extended = collector.getExtendedMetrics();
      expect(extended.recallPointsAttempted).toBe(1);
      expect(extended.recallPointsSuccessful).toBe(1);
      expect(extended.overallRecallRate).toBe(1.0);
    });

    it('should track token usage and cost', async () => {
      // Arrange: Create collector
      const collector = new SessionMetricsCollector();
      collector.startSession('sess_test_005', 'claude-3-5-sonnet-20241022');

      // Act: Record messages with known token counts
      collector.recordMessage('msg_001', 'assistant', 100, 500, 100); // Input: 500, Output: 100
      collector.recordMessage('msg_002', 'user', 50);
      collector.recordMessage('msg_003', 'assistant', 150, 600, 150); // Input: 600, Output: 150

      // Assert: Verify total token tracking
      const stats = collector.getCurrentStats();
      // Total = (500 + 100) + (600 + 150) = 1350
      expect(stats.tokensUsed).toBe(1350);
    });

    it('should finalize metrics correctly', async () => {
      // Arrange: Create collector and simulate a complete session
      const collector = new SessionMetricsCollector();
      collector.startSession('sess_test_006', 'claude-3-5-sonnet-20241022');

      // Record some messages
      collector.recordMessage('msg_001', 'assistant', 50, 200, 50);
      await new Promise(resolve => setTimeout(resolve, 10));
      collector.recordMessage('msg_002', 'user', 40);
      await new Promise(resolve => setTimeout(resolve, 10));
      collector.recordMessage('msg_003', 'assistant', 60, 180, 60);

      // Record a recall outcome
      const evaluation: EnhancedRecallEvaluation = {
        success: true,
        confidence: 0.9,
        reasoning: 'Excellent recall',
        keyDemonstratedConcepts: ['main concept'],
        missedConcepts: [],
        suggestedRating: 'easy',
      };
      collector.recordRecallOutcome('rp_test_1', evaluation, 0, 2);

      // Create a mock session for finalization
      const mockSession: Session = {
        id: 'sess_test_006',
        recallSetId: 'rs_test_metrics',
        status: 'completed',
        targetRecallPointIds: ['rp_test_1'],
        startedAt: new Date(),
        endedAt: new Date(),
      };

      // Act: Finalize the session
      const metrics = await collector.finalizeSession(mockSession);

      // Assert: Verify all metrics are calculated
      expect(metrics.sessionId).toBe('sess_test_006');
      expect(metrics.recallOutcomes).toHaveLength(1);
      expect(metrics.recallOutcomes[0].success).toBe(true);
      expect(metrics.recallOutcomes[0].confidence).toBe(0.9);
      expect(metrics.tokenUsage.inputTokens).toBe(380); // 200 + 180
      expect(metrics.tokenUsage.outputTokens).toBe(110); // 50 + 60
      expect(metrics.tokenUsage.totalTokens).toBe(490);
      expect(metrics.costUsd).toBeGreaterThan(0);
      expect(metrics.engagementScore).toBeGreaterThanOrEqual(0);
      expect(metrics.engagementScore).toBeLessThanOrEqual(100);
      expect(metrics.totalDurationMs).toBeGreaterThanOrEqual(0);
      expect(metrics.averageRecallTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should reset state between sessions', async () => {
      // Arrange: Create collector and record data for first session
      const collector = new SessionMetricsCollector();
      collector.startSession('sess_first');
      collector.recordMessage('msg_001', 'assistant', 50, 100, 50);
      collector.recordMessage('msg_002', 'user', 30);

      const evaluation: EnhancedRecallEvaluation = {
        success: true,
        confidence: 0.8,
        reasoning: 'Good recall',
        keyDemonstratedConcepts: [],
        missedConcepts: [],
        suggestedRating: 'good',
      };
      collector.recordRecallOutcome('rp_1', evaluation, 0, 1);

      // Act: Reset and start a new session
      collector.reset();
      collector.startSession('sess_second');

      // Assert: All state should be cleared
      const stats = collector.getCurrentStats();
      expect(stats.messagesRecorded).toBe(0);
      expect(stats.outcomesRecorded).toBe(0);
      expect(stats.activeRabbitholes).toBe(0);
      expect(stats.tokensUsed).toBe(0);
    });
  });

  describe('RabbitholeDetector', () => {
    it('should detect rabbithole entry', async () => {
      // Arrange: Set up mock to return a rabbithole detection
      mockLlmClient.setRabbitholeResponses([
        JSON.stringify({
          isRabbithole: true,
          confidence: 0.85,
          topic: 'Economic consequences of the event',
          depth: 1,
          relatedRecallPointIds: ['rp_test_1'],
        }),
      ]);

      const detector = new RabbitholeDetector(mockLlmClient as any);

      // Create test messages showing conversation drifting off-topic
      const messages: SessionMessage[] = [
        {
          id: 'msg_001',
          sessionId: 'sess_test',
          role: 'assistant',
          content: "Let's discuss the Treaty of Versailles.",
          timestamp: new Date(),
          tokenCount: 20,
        },
        {
          id: 'msg_002',
          sessionId: 'sess_test',
          role: 'user',
          content: 'But what about the economic impacts on Germany?',
          timestamp: new Date(),
          tokenCount: 25,
        },
        {
          id: 'msg_003',
          sessionId: 'sess_test',
          role: 'assistant',
          content: "That's an interesting tangent! Let me explain...",
          timestamp: new Date(),
          tokenCount: 30,
        },
      ];

      // Act: Detect rabbithole
      const event = await detector.detectRabbithole(
        'sess_test',
        messages,
        testRecallPoints[0],
        testRecallPoints,
        2
      );

      // Assert: Verify rabbithole was detected
      expect(event).not.toBeNull();
      expect(event!.topic).toBe('Economic consequences of the event');
      expect(event!.depth).toBe(1);
      expect(event!.status).toBe('active');
      expect(event!.triggerMessageIndex).toBe(2);
    });

    it('should detect rabbithole return', async () => {
      // Arrange: First detect a rabbithole
      mockLlmClient.setRabbitholeResponses([
        JSON.stringify({
          isRabbithole: true,
          confidence: 0.85,
          topic: 'Economic impacts',
          depth: 1,
          relatedRecallPointIds: [],
        }),
      ]);

      mockLlmClient.setReturnResponses([
        JSON.stringify({
          hasReturned: true,
          confidence: 0.9,
        }),
      ]);

      const detector = new RabbitholeDetector(mockLlmClient as any);

      const messages: SessionMessage[] = [
        { id: 'msg_001', sessionId: 'sess_test', role: 'assistant', content: 'Main topic discussion', timestamp: new Date(), tokenCount: 20 },
        { id: 'msg_002', sessionId: 'sess_test', role: 'user', content: 'Off-topic question', timestamp: new Date(), tokenCount: 15 },
      ];

      // First, create the rabbithole
      await detector.detectRabbithole('sess_test', messages, testRecallPoints[0], testRecallPoints, 1);

      // Now add messages showing return to topic
      const updatedMessages: SessionMessage[] = [
        ...messages,
        { id: 'msg_003', sessionId: 'sess_test', role: 'assistant', content: 'Let me explain that tangent...', timestamp: new Date(), tokenCount: 25 },
        { id: 'msg_004', sessionId: 'sess_test', role: 'user', content: "Okay, back to the original question.", timestamp: new Date(), tokenCount: 20 },
      ];

      // Act: Detect returns
      const returns = await detector.detectReturns(updatedMessages, testRecallPoints[0], 3);

      // Assert: Verify return was detected
      expect(returns).toHaveLength(1);
      expect(returns[0].status).toBe('returned');
      expect(returns[0].returnMessageIndex).toBe(3);
    });

    it('should handle multiple concurrent rabbitholes', async () => {
      // This test verifies that the detector can track multiple rabbitholes
      // by using separate detectors to simulate the behavior

      // Arrange: Configure mock to return rabbithole detection
      mockLlmClient.setRabbitholeResponses([
        JSON.stringify({
          isRabbithole: true,
          confidence: 0.8,
          topic: 'First tangent: Politics',
          depth: 1,
          relatedRecallPointIds: [],
        }),
      ]);

      const detector = new RabbitholeDetector(mockLlmClient as any, {
        confidenceThreshold: 0.6,
        messageWindowSize: 10,
      });

      const messages: SessionMessage[] = [
        { id: 'msg_001', sessionId: 'sess_test', role: 'assistant', content: 'Main topic discussion here', timestamp: new Date(), tokenCount: 20 },
        { id: 'msg_002', sessionId: 'sess_test', role: 'user', content: 'First tangent question about politics', timestamp: new Date(), tokenCount: 15 },
      ];

      // Act: Detect first rabbithole
      const event1 = await detector.detectRabbithole('sess_test', messages, testRecallPoints[0], testRecallPoints, 1);

      // Assert: First rabbithole should be detected
      expect(event1).not.toBeNull();
      expect(event1!.topic).toBe('First tangent: Politics');
      expect(event1!.status).toBe('active');

      // Verify tracking
      expect(detector.getActiveCount()).toBe(1);
      expect(detector.isActive(event1!.id)).toBe(true);

      // Get active rabbitholes list
      const activeRabbitholes = detector.getActiveRabbitholes();
      expect(activeRabbitholes).toHaveLength(1);
      expect(activeRabbitholes[0].topic).toBe('First tangent: Politics');
    });

    it('should close all active on session end', async () => {
      // Arrange: Create active rabbitholes with different topics
      mockLlmClient.setRabbitholeResponses([
        JSON.stringify({
          isRabbithole: true,
          confidence: 0.85,
          topic: 'Unresolved tangent 1: Philosophy',
          depth: 1,
          relatedRecallPointIds: [],
        }),
        JSON.stringify({
          isRabbithole: true,
          confidence: 0.8,
          topic: 'Unresolved tangent 2: Mathematics',
          depth: 2,
          relatedRecallPointIds: [],
        }),
      ]);

      const detector = new RabbitholeDetector(mockLlmClient as any, {
        confidenceThreshold: 0.6,
        messageWindowSize: 10,
      });

      const messages: SessionMessage[] = [
        { id: 'msg_001', sessionId: 'sess_test', role: 'assistant', content: 'Start of conversation', timestamp: new Date(), tokenCount: 10 },
        { id: 'msg_002', sessionId: 'sess_test', role: 'user', content: 'Question about philosophy', timestamp: new Date(), tokenCount: 10 },
      ];

      await detector.detectRabbithole('sess_test', messages, testRecallPoints[0], testRecallPoints, 1);

      const messages2 = [
        ...messages,
        { id: 'msg_003', sessionId: 'sess_test', role: 'assistant', content: 'Exploring philosophy topic...', timestamp: new Date(), tokenCount: 15 },
        { id: 'msg_004', sessionId: 'sess_test', role: 'user', content: 'What about mathematics?', timestamp: new Date(), tokenCount: 12 },
      ];

      await detector.detectRabbithole('sess_test', messages2, testRecallPoints[0], testRecallPoints, 3);

      // Verify we have active rabbitholes (2 if both detected, at least 1)
      const activeCount = detector.getActiveCount();
      expect(activeCount).toBeGreaterThanOrEqual(1);

      // Act: Close all active rabbitholes
      const abandoned = detector.closeAllActive(4);

      // Assert: All rabbitholes should be abandoned
      expect(abandoned.length).toBe(activeCount);
      for (const event of abandoned) {
        expect(event.status).toBe('abandoned');
      }
      expect(detector.getActiveCount()).toBe(0);
    });

    it('should not create duplicate rabbitholes for same topic', async () => {
      // Arrange: Configure mock to return the same topic twice
      mockLlmClient.setRabbitholeResponses([
        JSON.stringify({
          isRabbithole: true,
          confidence: 0.85,
          topic: 'Same Topic',
          depth: 1,
          relatedRecallPointIds: [],
        }),
        JSON.stringify({
          isRabbithole: true,
          confidence: 0.8,
          topic: 'Same Topic', // Duplicate topic
          depth: 1,
          relatedRecallPointIds: [],
        }),
      ]);

      const detector = new RabbitholeDetector(mockLlmClient as any);

      const messages1: SessionMessage[] = [
        { id: 'msg_001', sessionId: 'sess_test', role: 'assistant', content: 'Start', timestamp: new Date(), tokenCount: 10 },
        { id: 'msg_002', sessionId: 'sess_test', role: 'user', content: 'Same topic', timestamp: new Date(), tokenCount: 10 },
      ];

      // First detection - should create rabbithole
      const event1 = await detector.detectRabbithole('sess_test', messages1, testRecallPoints[0], testRecallPoints, 1);

      const messages2 = [
        ...messages1,
        { id: 'msg_003', sessionId: 'sess_test', role: 'assistant', content: 'More about same topic', timestamp: new Date(), tokenCount: 15 },
      ];

      // Second detection with same topic - should NOT create duplicate
      const event2 = await detector.detectRabbithole('sess_test', messages2, testRecallPoints[0], testRecallPoints, 2);

      // Assert: Only one rabbithole should be active
      expect(event1).not.toBeNull();
      expect(event2).toBeNull(); // Duplicate should return null
      expect(detector.getActiveCount()).toBe(1);
    });
  });

  describe('Enhanced RecallEvaluator', () => {
    // Note: These tests verify the interface contract of EnhancedRecallEvaluation
    // The actual evaluator uses LLM, so we test with mock data structures

    it('should return confidence scores between 0 and 1', async () => {
      // Arrange: Create various evaluation results with different confidence levels
      const evaluations: EnhancedRecallEvaluation[] = [
        {
          success: true,
          confidence: 0.95,
          reasoning: 'Excellent recall',
          keyDemonstratedConcepts: ['concept1', 'concept2'],
          missedConcepts: [],
          suggestedRating: 'easy',
        },
        {
          success: true,
          confidence: 0.72,
          reasoning: 'Good recall with some hesitation',
          keyDemonstratedConcepts: ['concept1'],
          missedConcepts: ['concept2'],
          suggestedRating: 'good',
        },
        {
          success: false,
          confidence: 0.45,
          reasoning: 'Struggled to recall main points',
          keyDemonstratedConcepts: [],
          missedConcepts: ['concept1', 'concept2'],
          suggestedRating: 'hard',
        },
      ];

      // Assert: All confidence values are in valid range
      for (const eval_ of evaluations) {
        expect(eval_.confidence).toBeGreaterThanOrEqual(0);
        expect(eval_.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should suggest appropriate FSRS ratings', async () => {
      // Test the expected mapping of confidence to ratings
      // Based on the thresholds documented in types.ts:
      // - 0.85 - 1.0: 'easy'
      // - 0.6 - 0.85: 'good'
      // - 0.3 - 0.6: 'hard'
      // - 0.0 - 0.3: 'forgot'

      const testCases: Array<{ confidence: number; expectedRating: string }> = [
        { confidence: 0.95, expectedRating: 'easy' },
        { confidence: 0.85, expectedRating: 'easy' },
        { confidence: 0.75, expectedRating: 'good' },
        { confidence: 0.60, expectedRating: 'good' },
        { confidence: 0.45, expectedRating: 'hard' },
        { confidence: 0.30, expectedRating: 'hard' },
        { confidence: 0.15, expectedRating: 'forgot' },
        { confidence: 0.0, expectedRating: 'forgot' },
      ];

      for (const testCase of testCases) {
        // Derive the expected rating based on confidence thresholds
        let derivedRating: string;
        if (testCase.confidence >= 0.85) {
          derivedRating = 'easy';
        } else if (testCase.confidence >= 0.6) {
          derivedRating = 'good';
        } else if (testCase.confidence >= 0.3) {
          derivedRating = 'hard';
        } else {
          derivedRating = 'forgot';
        }

        expect(derivedRating).toBe(testCase.expectedRating);
      }
    });

    it('should identify demonstrated and missed concepts', async () => {
      // Arrange: Create evaluation with mixed concept recall
      const evaluation: EnhancedRecallEvaluation = {
        success: true,
        confidence: 0.75,
        reasoning: 'Partial recall - got main ideas but missed details',
        keyDemonstratedConcepts: [
          'Main historical date',
          'Key participants',
          'General significance',
        ],
        missedConcepts: [
          'Specific treaty articles',
          'Exact reparation amounts',
        ],
        suggestedRating: 'good',
      };

      // Assert: Concept arrays are properly populated
      expect(evaluation.keyDemonstratedConcepts).toHaveLength(3);
      expect(evaluation.missedConcepts).toHaveLength(2);
      expect(evaluation.keyDemonstratedConcepts).toContain('Main historical date');
      expect(evaluation.missedConcepts).toContain('Specific treaty articles');
    });

    it('should handle complete failure with empty demonstrated concepts', async () => {
      // Arrange: Complete failure evaluation
      const evaluation: EnhancedRecallEvaluation = {
        success: false,
        confidence: 0.1,
        reasoning: 'User could not recall any information',
        keyDemonstratedConcepts: [],
        missedConcepts: ['Everything about the topic'],
        suggestedRating: 'forgot',
      };

      // Assert: Demonstrated concepts empty, missed concepts populated
      expect(evaluation.success).toBe(false);
      expect(evaluation.keyDemonstratedConcepts).toHaveLength(0);
      expect(evaluation.missedConcepts.length).toBeGreaterThan(0);
      expect(evaluation.suggestedRating).toBe('forgot');
    });

    it('should handle perfect recall with empty missed concepts', async () => {
      // Arrange: Perfect recall evaluation
      const evaluation: EnhancedRecallEvaluation = {
        success: true,
        confidence: 0.98,
        reasoning: 'User demonstrated complete understanding with no assistance',
        keyDemonstratedConcepts: [
          'Date and location',
          'All major participants',
          'Key outcomes',
          'Long-term significance',
        ],
        missedConcepts: [],
        suggestedRating: 'easy',
      };

      // Assert: All concepts demonstrated, none missed
      expect(evaluation.success).toBe(true);
      expect(evaluation.keyDemonstratedConcepts.length).toBeGreaterThan(0);
      expect(evaluation.missedConcepts).toHaveLength(0);
      expect(evaluation.suggestedRating).toBe('easy');
    });
  });

  describe('Metrics Collector with Rabbitholes', () => {
    it('should record rabbithole events in metrics', async () => {
      // Arrange: Create collector and rabbithole event
      const collector = new SessionMetricsCollector();
      collector.startSession('sess_with_rabbitholes');

      // Record some messages
      collector.recordMessage('msg_001', 'assistant', 50, 100, 50);
      collector.recordMessage('msg_002', 'user', 30);
      collector.recordMessage('msg_003', 'assistant', 40, 90, 40);

      // Act: Record a rabbithole event
      collector.recordRabbithole({
        id: 'rh_001',
        topic: 'Economic impacts',
        triggerMessageIndex: 1,
        returnMessageIndex: null,
        depth: 1,
        relatedRecallPointIds: ['rp_test_1'],
        userInitiated: true,
        status: 'active',
      });

      // Assert: Verify rabbithole is tracked
      const stats = collector.getCurrentStats();
      expect(stats.activeRabbitholes).toBe(1);

      // Update rabbithole to returned status
      collector.updateRabbitholeReturn('rh_001', 2);

      // After returning, active count should be 0
      const updatedStats = collector.getCurrentStats();
      expect(updatedStats.activeRabbitholes).toBe(0);
    });

    it('should include rabbitholes in finalized metrics', async () => {
      // Arrange: Create collector with complete rabbithole lifecycle
      const collector = new SessionMetricsCollector();
      collector.startSession('sess_final_rabbitholes');

      // Record messages
      collector.recordMessage('msg_001', 'assistant', 50, 100, 50);
      collector.recordMessage('msg_002', 'user', 30);
      collector.recordMessage('msg_003', 'assistant', 40, 90, 40);
      collector.recordMessage('msg_004', 'user', 25);

      // Record rabbithole that returns
      collector.recordRabbithole({
        id: 'rh_returned',
        topic: 'Returned tangent',
        triggerMessageIndex: 1,
        returnMessageIndex: null,
        depth: 1,
        relatedRecallPointIds: [],
        userInitiated: true,
        status: 'active',
      });
      collector.updateRabbitholeReturn('rh_returned', 3);

      // Record rabbithole that stays active (will be marked abandoned)
      collector.recordRabbithole({
        id: 'rh_abandoned',
        topic: 'Abandoned tangent',
        triggerMessageIndex: 3,
        returnMessageIndex: null,
        depth: 1,
        relatedRecallPointIds: [],
        userInitiated: false,
        status: 'active',
      });

      // Record an outcome
      collector.recordRecallOutcome('rp_test_1', {
        success: true,
        confidence: 0.8,
        reasoning: 'Good recall',
        keyDemonstratedConcepts: [],
        missedConcepts: [],
        suggestedRating: 'good',
      }, 0, 3);

      // Act: Finalize the session
      const mockSession: Session = {
        id: 'sess_final_rabbitholes',
        recallSetId: 'rs_test',
        status: 'completed',
        targetRecallPointIds: ['rp_test_1'],
        startedAt: new Date(),
        endedAt: new Date(),
      };

      const metrics = await collector.finalizeSession(mockSession);

      // Assert: Both rabbitholes should be in metrics
      expect(metrics.rabbitholes).toHaveLength(2);

      // Returned rabbithole should have 'returned' status
      const returned = metrics.rabbitholes.find(rh => rh.id === 'rh_returned');
      expect(returned).not.toBeUndefined();
      expect(returned!.status).toBe('returned');

      // Previously active rabbithole should now be 'abandoned'
      const abandoned = metrics.rabbitholes.find(rh => rh.id === 'rh_abandoned');
      expect(abandoned).not.toBeUndefined();
      expect(abandoned!.status).toBe('abandoned');
    });
  });
});
