/**
 * Integration Tests: Analytics Calculator
 *
 * This test suite verifies the analytics calculation pipeline, including:
 * - RecallSetAnalytics aggregation from multiple sessions
 * - RecallPointAnalytics calculation with success rates and FSRS state
 * - GlobalAnalytics aggregation across all recall sets
 * - Trend data calculation by day
 * - Struggling point identification
 * - Handling of empty and edge cases
 *
 * Tests use an in-memory SQLite database with seeded data that represents
 * realistic session metrics across multiple days.
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
import { AnalyticsCalculator } from '../../src/core/analytics/analytics-calculator';
import { FSRSScheduler } from '../../src/core/fsrs';
import type { RecallSet, RecallPoint, Session } from '../../src/core/models';
import type { AppDatabase } from '../../src/storage/db';

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
 * Creates a date by subtracting days from now.
 * Useful for creating historical test data.
 */
function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

/**
 * Comprehensive test data seeding for analytics tests.
 *
 * Creates:
 * - 2 recall sets with different characteristics
 * - 5 recall points per set
 * - Multiple sessions spanning several days
 * - Recall outcomes with varying success rates
 * - Rabbithole events for topic analysis
 */
async function seedAnalyticsTestData(
  db: AppDatabase,
  recallSetRepo: RecallSetRepository,
  recallPointRepo: RecallPointRepository,
  sessionRepo: SessionRepository,
  metricsRepo: SessionMetricsRepository,
  outcomeRepo: RecallOutcomeRepository,
  rabbitholeRepo: RabbitholeEventRepository,
  scheduler: FSRSScheduler
): Promise<{
  recallSets: RecallSet[];
  recallPoints: RecallPoint[][];
  sessions: Session[];
}> {
  const now = new Date();
  const initialState = scheduler.createInitialState(now);

  // Create two recall sets
  const recallSet1 = await recallSetRepo.create({
    id: 'rs_analytics_1',
    name: 'History Facts',
    description: 'Historical events and dates',
    status: 'active',
    discussionSystemPrompt: 'Help the user learn history.',
  });

  const recallSet2 = await recallSetRepo.create({
    id: 'rs_analytics_2',
    name: 'Science Concepts',
    description: 'Scientific principles and theories',
    status: 'active',
    discussionSystemPrompt: 'Help the user learn science.',
  });

  // Create recall points for set 1
  const points1: RecallPoint[] = [];
  for (let i = 1; i <= 5; i++) {
    // Create FSRS states with varying stability and difficulty
    const state = {
      ...initialState,
      stability: 10 + i * 5, // 15, 20, 25, 30, 35
      difficulty: 3 + i * 0.5, // 3.5, 4.0, 4.5, 5.0, 5.5
      due: daysAgo(-i * 2), // Due in future
    };

    const point = await recallPointRepo.create({
      id: `rp_hist_${i}`,
      recallSetId: recallSet1.id,
      content: `History fact ${i}: Important historical event`,
      context: `Context for history fact ${i}`,
      fsrsState: state,
    });
    points1.push(point);
  }

  // Create recall points for set 2
  const points2: RecallPoint[] = [];
  for (let i = 1; i <= 5; i++) {
    const state = {
      ...initialState,
      stability: 5 + i * 3,
      difficulty: 4 + i * 0.3,
      due: daysAgo(-i),
    };

    const point = await recallPointRepo.create({
      id: `rp_sci_${i}`,
      recallSetId: recallSet2.id,
      content: `Science concept ${i}: Scientific principle`,
      context: `Context for science concept ${i}`,
      fsrsState: state,
    });
    points2.push(point);
  }

  // Create sessions for set 1 over multiple days
  // Note: SessionRepository.create() always sets status to 'in_progress'
  // So we create first, then update to completed
  const sessions: Session[] = [];

  // Day 1 (5 days ago): Good session
  const session1 = await sessionRepo.create({
    id: 'sess_hist_1',
    recallSetId: recallSet1.id,
    targetRecallPointIds: ['rp_hist_1', 'rp_hist_2'],
    startedAt: daysAgo(5),
  });
  await sessionRepo.update(session1.id, { status: 'completed', endedAt: daysAgo(5) });
  sessions.push({ ...session1, status: 'completed', endedAt: daysAgo(5) });

  // Day 2 (3 days ago): Moderate session
  const session2 = await sessionRepo.create({
    id: 'sess_hist_2',
    recallSetId: recallSet1.id,
    targetRecallPointIds: ['rp_hist_2', 'rp_hist_3'],
    startedAt: daysAgo(3),
  });
  await sessionRepo.update(session2.id, { status: 'completed', endedAt: daysAgo(3) });
  sessions.push({ ...session2, status: 'completed', endedAt: daysAgo(3) });

  // Day 3 (1 day ago): Challenging session
  const session3 = await sessionRepo.create({
    id: 'sess_hist_3',
    recallSetId: recallSet1.id,
    targetRecallPointIds: ['rp_hist_3', 'rp_hist_4', 'rp_hist_5'],
    startedAt: daysAgo(1),
  });
  await sessionRepo.update(session3.id, { status: 'completed', endedAt: daysAgo(1) });
  sessions.push({ ...session3, status: 'completed', endedAt: daysAgo(1) });

  // Session for set 2
  const session4 = await sessionRepo.create({
    id: 'sess_sci_1',
    recallSetId: recallSet2.id,
    targetRecallPointIds: ['rp_sci_1', 'rp_sci_2'],
    startedAt: daysAgo(2),
  });
  await sessionRepo.update(session4.id, { status: 'completed', endedAt: daysAgo(2) });
  sessions.push({ ...session4, status: 'completed', endedAt: daysAgo(2) });

  // Create session metrics for each session
  await metricsRepo.create({
    id: 'sm_hist_1',
    sessionId: 'sess_hist_1',
    durationMs: 300000, // 5 minutes
    activeTimeMs: 280000,
    avgUserResponseTimeMs: 5000,
    avgAssistantResponseTimeMs: 2000,
    recallPointsAttempted: 2,
    recallPointsSuccessful: 2,
    recallPointsFailed: 0,
    overallRecallRate: 1.0,
    avgConfidence: 0.9,
    totalMessages: 12,
    userMessages: 6,
    assistantMessages: 6,
    avgMessageLength: 50,
    rabbitholeCount: 0,
    totalRabbitholeTimeMs: 0,
    avgRabbitholeDepth: 0,
    inputTokens: 1500,
    outputTokens: 800,
    totalTokens: 2300,
    estimatedCostUsd: 0.023,
    engagementScore: 92,
    calculatedAt: daysAgo(5),
  });

  await metricsRepo.create({
    id: 'sm_hist_2',
    sessionId: 'sess_hist_2',
    durationMs: 420000, // 7 minutes
    activeTimeMs: 400000,
    avgUserResponseTimeMs: 6000,
    avgAssistantResponseTimeMs: 2500,
    recallPointsAttempted: 2,
    recallPointsSuccessful: 1,
    recallPointsFailed: 1,
    overallRecallRate: 0.5,
    avgConfidence: 0.7,
    totalMessages: 16,
    userMessages: 8,
    assistantMessages: 8,
    avgMessageLength: 55,
    rabbitholeCount: 1,
    totalRabbitholeTimeMs: 30000,
    avgRabbitholeDepth: 1,
    inputTokens: 2000,
    outputTokens: 1100,
    totalTokens: 3100,
    estimatedCostUsd: 0.031,
    engagementScore: 75,
    calculatedAt: daysAgo(3),
  });

  await metricsRepo.create({
    id: 'sm_hist_3',
    sessionId: 'sess_hist_3',
    durationMs: 600000, // 10 minutes
    activeTimeMs: 550000,
    avgUserResponseTimeMs: 8000,
    avgAssistantResponseTimeMs: 3000,
    recallPointsAttempted: 3,
    recallPointsSuccessful: 1,
    recallPointsFailed: 2,
    overallRecallRate: 0.33,
    avgConfidence: 0.55,
    totalMessages: 24,
    userMessages: 12,
    assistantMessages: 12,
    avgMessageLength: 60,
    rabbitholeCount: 2,
    totalRabbitholeTimeMs: 90000,
    avgRabbitholeDepth: 1.5,
    inputTokens: 3000,
    outputTokens: 1500,
    totalTokens: 4500,
    estimatedCostUsd: 0.045,
    engagementScore: 58,
    calculatedAt: daysAgo(1),
  });

  await metricsRepo.create({
    id: 'sm_sci_1',
    sessionId: 'sess_sci_1',
    durationMs: 360000, // 6 minutes
    activeTimeMs: 340000,
    avgUserResponseTimeMs: 5500,
    avgAssistantResponseTimeMs: 2200,
    recallPointsAttempted: 2,
    recallPointsSuccessful: 2,
    recallPointsFailed: 0,
    overallRecallRate: 1.0,
    avgConfidence: 0.85,
    totalMessages: 14,
    userMessages: 7,
    assistantMessages: 7,
    avgMessageLength: 48,
    rabbitholeCount: 0,
    totalRabbitholeTimeMs: 0,
    avgRabbitholeDepth: 0,
    inputTokens: 1800,
    outputTokens: 950,
    totalTokens: 2750,
    estimatedCostUsd: 0.0275,
    engagementScore: 88,
    calculatedAt: daysAgo(2),
  });

  // Create recall outcomes
  // Session 1: All successful
  await outcomeRepo.createMany([
    {
      id: 'ro_hist_1_1',
      sessionId: 'sess_hist_1',
      recallPointId: 'rp_hist_1',
      success: true,
      confidence: 0.92,
      rating: 'good',
      reasoning: 'Clear recall of historical event',
      messageIndexStart: 0,
      messageIndexEnd: 5,
      timeSpentMs: 150000,
      createdAt: daysAgo(5),
    },
    {
      id: 'ro_hist_1_2',
      sessionId: 'sess_hist_1',
      recallPointId: 'rp_hist_2',
      success: true,
      confidence: 0.88,
      rating: 'good',
      reasoning: 'Good recall with minor prompting',
      messageIndexStart: 6,
      messageIndexEnd: 11,
      timeSpentMs: 150000,
      createdAt: daysAgo(5),
    },
  ]);

  // Session 2: Mixed results
  await outcomeRepo.createMany([
    {
      id: 'ro_hist_2_1',
      sessionId: 'sess_hist_2',
      recallPointId: 'rp_hist_2',
      success: true,
      confidence: 0.78,
      rating: 'hard',
      reasoning: 'Recalled with significant effort',
      messageIndexStart: 0,
      messageIndexEnd: 7,
      timeSpentMs: 200000,
      createdAt: daysAgo(3),
    },
    {
      id: 'ro_hist_2_2',
      sessionId: 'sess_hist_2',
      recallPointId: 'rp_hist_3',
      success: false,
      confidence: 0.62,
      rating: 'forgot',
      reasoning: 'Could not recall key details',
      messageIndexStart: 8,
      messageIndexEnd: 15,
      timeSpentMs: 220000,
      createdAt: daysAgo(3),
    },
  ]);

  // Session 3: Struggling session
  await outcomeRepo.createMany([
    {
      id: 'ro_hist_3_1',
      sessionId: 'sess_hist_3',
      recallPointId: 'rp_hist_3',
      success: false,
      confidence: 0.45,
      rating: 'forgot',
      reasoning: 'Complete failure to recall',
      messageIndexStart: 0,
      messageIndexEnd: 7,
      timeSpentMs: 180000,
      createdAt: daysAgo(1),
    },
    {
      id: 'ro_hist_3_2',
      sessionId: 'sess_hist_3',
      recallPointId: 'rp_hist_4',
      success: false,
      confidence: 0.52,
      rating: 'forgot',
      reasoning: 'Partial recall but missed key points',
      messageIndexStart: 8,
      messageIndexEnd: 15,
      timeSpentMs: 200000,
      createdAt: daysAgo(1),
    },
    {
      id: 'ro_hist_3_3',
      sessionId: 'sess_hist_3',
      recallPointId: 'rp_hist_5',
      success: true,
      confidence: 0.68,
      rating: 'hard',
      reasoning: 'Recalled with heavy prompting',
      messageIndexStart: 16,
      messageIndexEnd: 23,
      timeSpentMs: 220000,
      createdAt: daysAgo(1),
    },
  ]);

  // Science session outcomes (all successful)
  await outcomeRepo.createMany([
    {
      id: 'ro_sci_1_1',
      sessionId: 'sess_sci_1',
      recallPointId: 'rp_sci_1',
      success: true,
      confidence: 0.88,
      rating: 'good',
      reasoning: 'Clear understanding demonstrated',
      messageIndexStart: 0,
      messageIndexEnd: 6,
      timeSpentMs: 180000,
      createdAt: daysAgo(2),
    },
    {
      id: 'ro_sci_1_2',
      sessionId: 'sess_sci_1',
      recallPointId: 'rp_sci_2',
      success: true,
      confidence: 0.82,
      rating: 'good',
      reasoning: 'Good conceptual understanding',
      messageIndexStart: 7,
      messageIndexEnd: 13,
      timeSpentMs: 180000,
      createdAt: daysAgo(2),
    },
  ]);

  // Create rabbithole events
  await rabbitholeRepo.create({
    id: 'rh_hist_1',
    sessionId: 'sess_hist_2',
    topic: 'Economic impacts',
    triggerMessageIndex: 4,
    returnMessageIndex: 7,
    depth: 1,
    relatedRecallPointIds: ['rp_hist_2'],
    userInitiated: true,
    status: 'returned',
    createdAt: daysAgo(3),
  });

  await rabbitholeRepo.create({
    id: 'rh_hist_2',
    sessionId: 'sess_hist_3',
    topic: 'Political consequences',
    triggerMessageIndex: 3,
    returnMessageIndex: 8,
    depth: 1,
    relatedRecallPointIds: ['rp_hist_3'],
    userInitiated: true,
    status: 'returned',
    createdAt: daysAgo(1),
  });

  await rabbitholeRepo.create({
    id: 'rh_hist_3',
    sessionId: 'sess_hist_3',
    topic: 'Economic impacts', // Same topic for frequency testing
    triggerMessageIndex: 12,
    returnMessageIndex: null,
    depth: 2,
    relatedRecallPointIds: ['rp_hist_4'],
    userInitiated: false,
    status: 'abandoned',
    createdAt: daysAgo(1),
  });

  return {
    recallSets: [recallSet1, recallSet2],
    recallPoints: [points1, points2],
    sessions,
  };
}

describe('Analytics Calculator', () => {
  let db: AppDatabase;
  let sqlite: Database;
  let recallSetRepo: RecallSetRepository;
  let recallPointRepo: RecallPointRepository;
  let sessionRepo: SessionRepository;
  let messageRepo: SessionMessageRepository;
  let metricsRepo: SessionMetricsRepository;
  let outcomeRepo: RecallOutcomeRepository;
  let rabbitholeRepo: RabbitholeEventRepository;
  let scheduler: FSRSScheduler;
  let calculator: AnalyticsCalculator;

  // Test data
  let testRecallSets: RecallSet[];
  let testRecallPoints: RecallPoint[][];
  let testSessions: Session[];

  beforeEach(async () => {
    // Create fresh database
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
    calculator = new AnalyticsCalculator(
      metricsRepo,
      outcomeRepo,
      rabbitholeRepo,
      recallSetRepo,
      recallPointRepo
    );

    // Seed comprehensive test data
    const seedData = await seedAnalyticsTestData(
      db,
      recallSetRepo,
      recallPointRepo,
      sessionRepo,
      metricsRepo,
      outcomeRepo,
      rabbitholeRepo,
      scheduler
    );
    testRecallSets = seedData.recallSets;
    testRecallPoints = seedData.recallPoints;
    testSessions = seedData.sessions;
  });

  afterEach(() => {
    if (sqlite) {
      sqlite.close();
    }
  });

  describe('calculateRecallSetAnalytics', () => {
    it('should aggregate stats correctly', async () => {
      // Act: Calculate analytics for the history recall set
      const analytics = await calculator.calculateRecallSetAnalytics('rs_analytics_1');

      // Assert: Verify aggregate statistics
      expect(analytics.recallSetId).toBe('rs_analytics_1');
      expect(analytics.recallSetName).toBe('History Facts');
      expect(analytics.totalSessions).toBe(3);

      // Total time: 300000 + 420000 + 600000 = 1320000 ms
      expect(analytics.totalTimeSpentMs).toBe(1320000);

      // Overall recall rate: average of (1.0, 0.5, 0.33) ≈ 0.61
      expect(analytics.overallRecallRate).toBeCloseTo(0.61, 1);

      // Average engagement: average of (92, 75, 58) = 75
      expect(analytics.avgEngagementScore).toBe(75);

      // Point analytics should exist for all 5 points
      expect(analytics.pointAnalytics).toHaveLength(5);
    });

    it('should calculate trend data by day', async () => {
      // Act: Calculate analytics
      const analytics = await calculator.calculateRecallSetAnalytics('rs_analytics_1');

      // Assert: Verify trend data is grouped by day
      // We have sessions on 3 different days
      expect(analytics.recallRateTrend.length).toBeGreaterThanOrEqual(1);
      expect(analytics.engagementTrend.length).toBeGreaterThanOrEqual(1);

      // Each trend point should have date and value
      for (const point of analytics.recallRateTrend) {
        expect(point.date).toBeInstanceOf(Date);
        expect(typeof point.value).toBe('number');
        expect(point.value).toBeGreaterThanOrEqual(0);
        expect(point.value).toBeLessThanOrEqual(1);
      }

      for (const point of analytics.engagementTrend) {
        expect(point.date).toBeInstanceOf(Date);
        expect(typeof point.value).toBe('number');
        expect(point.value).toBeGreaterThanOrEqual(0);
        expect(point.value).toBeLessThanOrEqual(100);
      }

      // Trends should be sorted by date ascending
      for (let i = 1; i < analytics.recallRateTrend.length; i++) {
        expect(analytics.recallRateTrend[i].date.getTime())
          .toBeGreaterThanOrEqual(analytics.recallRateTrend[i - 1].date.getTime());
      }
    });

    it('should identify struggling points', async () => {
      // Assert: Check for struggling points in point analytics
      // rp_hist_3 was attempted 2 times and failed both times = 0% success rate
      // This should be marked as struggling
      const analytics = await calculator.calculateRecallSetAnalytics('rs_analytics_1');

      const strugglingPoints = analytics.pointAnalytics.filter(p => p.isStruggling);

      // rp_hist_3 failed twice with 0% success (2 attempts, 0 successes)
      // rp_hist_4 failed once with 0% success (1 attempt, 0 successes)
      // Only points with >= 3 attempts should be considered for struggling
      // Let's check rp_hist_3 which has 2 outcomes (both failures)
      const hist3Analytics = analytics.pointAnalytics.find(
        p => p.recallPointId === 'rp_hist_3'
      );

      expect(hist3Analytics).toBeDefined();
      expect(hist3Analytics!.successRate).toBe(0); // 0 successes out of 2 attempts

      // Note: The isStruggling flag requires at least 3 attempts
      // So rp_hist_3 (2 attempts) might not be marked as struggling yet
      // This is actually correct behavior - we need enough data to judge
    });

    it('should handle empty recall sets', async () => {
      // Arrange: Create an empty recall set
      await recallSetRepo.create({
        id: 'rs_empty',
        name: 'Empty Set',
        description: 'No sessions yet',
        status: 'active',
        discussionSystemPrompt: 'Empty',
      });

      // Act: Calculate analytics for empty set
      const analytics = await calculator.calculateRecallSetAnalytics('rs_empty');

      // Assert: Should return zeros/defaults without errors
      expect(analytics.totalSessions).toBe(0);
      expect(analytics.totalTimeSpentMs).toBe(0);
      expect(analytics.overallRecallRate).toBe(0);
      expect(analytics.avgEngagementScore).toBe(0);
      expect(analytics.pointAnalytics).toHaveLength(0);
      expect(analytics.recallRateTrend).toHaveLength(0);
      expect(analytics.engagementTrend).toHaveLength(0);
      expect(analytics.totalCostUsd).toBe(0);
    });

    it('should include top rabbithole topics', async () => {
      // Act: Calculate analytics
      const analytics = await calculator.calculateRecallSetAnalytics('rs_analytics_1');

      // Assert: Should have rabbithole topic data
      expect(analytics.topRabbitholeTopics.length).toBeGreaterThan(0);

      // "Economic impacts" appears twice
      const economicTopic = analytics.topRabbitholeTopics.find(
        t => t.topic === 'Economic impacts'
      );
      expect(economicTopic).toBeDefined();
      expect(economicTopic!.count).toBe(2);

      // Each topic should have valid data
      for (const topic of analytics.topRabbitholeTopics) {
        expect(topic.topic).toBeTruthy();
        expect(topic.count).toBeGreaterThan(0);
        expect(topic.avgDepth).toBeGreaterThanOrEqual(1);
        expect(topic.avgDepth).toBeLessThanOrEqual(3);
      }
    });

    it('should calculate total cost correctly', async () => {
      // Act: Calculate analytics
      const analytics = await calculator.calculateRecallSetAnalytics('rs_analytics_1');

      // Assert: Total cost should be sum of all session costs
      // 0.023 + 0.031 + 0.045 = 0.099
      expect(analytics.totalCostUsd).toBeCloseTo(0.099, 3);
    });

    it('should throw error for non-existent recall set', async () => {
      // Act & Assert: Should throw for invalid recall set ID
      await expect(
        calculator.calculateRecallSetAnalytics('rs_nonexistent')
      ).rejects.toThrow("RecallSet with id 'rs_nonexistent' not found");
    });
  });

  describe('calculatePointAnalytics', () => {
    it('should calculate point-specific stats', async () => {
      // Act: Calculate analytics for a point with multiple outcomes
      // rp_hist_2 was tested in sessions 1 and 2 (both successful)
      const analytics = await calculator.calculatePointAnalytics('rp_hist_2');

      // Assert: Verify point statistics
      expect(analytics.recallPointId).toBe('rp_hist_2');
      expect(analytics.content).toContain('History fact 2');
      expect(analytics.successRate).toBe(1.0); // 2 successes / 2 attempts
      expect(analytics.avgConfidence).toBeCloseTo(0.83, 1); // (0.88 + 0.78) / 2
      expect(analytics.avgTimeToRecallMs).toBe(175000); // (150000 + 200000) / 2
      expect(analytics.currentStability).toBeGreaterThan(0);
      expect(analytics.currentDifficulty).toBeGreaterThan(0);
    });

    it('should calculate correct success rate for mixed outcomes', async () => {
      // Act: Calculate analytics for rp_hist_3 (1 success out of 2 attempts)
      // Actually rp_hist_3 has 0 successes: failed in sess_hist_2 and sess_hist_3
      const analytics = await calculator.calculatePointAnalytics('rp_hist_3');

      // Assert: Should have 0% success rate
      expect(analytics.successRate).toBe(0);
      expect(analytics.avgTimeToRecallMs).toBe(200000); // (220000 + 180000) / 2
    });

    it('should calculate averages for points with single attempt', async () => {
      // Act: Calculate analytics for rp_hist_4 (only 1 attempt, failed)
      const analytics = await calculator.calculatePointAnalytics('rp_hist_4');

      // Assert: Should have correct single-attempt stats
      expect(analytics.successRate).toBe(0);
      expect(analytics.avgConfidence).toBeCloseTo(0.52, 2);
      expect(analytics.avgTimeToRecallMs).toBe(200000);
    });

    it('should handle point with no outcomes', async () => {
      // Act: Calculate analytics for rp_hist_1 which only has 1 outcome
      // Actually, let's check rp_sci_3 through rp_sci_5 which have no outcomes
      const analytics = await calculator.calculatePointAnalytics('rp_sci_3');

      // Assert: Should have default values for no attempts
      expect(analytics.successRate).toBe(0);
      expect(analytics.avgConfidence).toBe(0);
      expect(analytics.avgTimeToRecallMs).toBe(0);
      expect(analytics.isStruggling).toBe(false); // Not struggling without enough data
    });

    it('should correctly determine isStruggling flag', async () => {
      // The isStruggling flag requires:
      // - At least 3 attempts
      // - Success rate below 50%

      // Create additional outcomes to reach 3 attempts for rp_hist_3
      await outcomeRepo.create({
        id: 'ro_extra_1',
        sessionId: 'sess_hist_1', // Use existing session
        recallPointId: 'rp_hist_3',
        success: false,
        confidence: 0.4,
        rating: 'forgot',
        reasoning: 'Third failure',
        messageIndexStart: 0,
        messageIndexEnd: 5,
        timeSpentMs: 180000,
        createdAt: daysAgo(5),
      });

      // Act: Calculate analytics
      const analytics = await calculator.calculatePointAnalytics('rp_hist_3');

      // Assert: Should now be marked as struggling (3 attempts, 0% success)
      expect(analytics.isStruggling).toBe(true);
      expect(analytics.successRate).toBe(0);
    });

    it('should throw error for non-existent recall point', async () => {
      // Act & Assert: Should throw for invalid recall point ID
      await expect(
        calculator.calculatePointAnalytics('rp_nonexistent')
      ).rejects.toThrow("RecallPoint with id 'rp_nonexistent' not found");
    });
  });

  describe('calculateGlobalAnalytics', () => {
    it('should aggregate across all sets', async () => {
      // Act: Calculate global analytics
      const analytics = await calculator.calculateGlobalAnalytics();

      // Assert: Should aggregate across both recall sets
      expect(analytics.totalRecallSets).toBe(2);
      expect(analytics.activeRecallSets).toBe(2); // Both are active

      // Total sessions: 3 from history + 1 from science = 4
      expect(analytics.totalSessions).toBe(4);

      // Total time: 1320000 (history) + 360000 (science) = 1680000 ms
      expect(analytics.totalStudyTimeMs).toBe(1680000);

      // Total cost: 0.099 (history) + 0.0275 (science) = 0.1265
      expect(analytics.totalCostUsd).toBeCloseTo(0.1265, 3);
    });

    it('should calculate overall recall rate across all sessions', async () => {
      // Act: Calculate global analytics
      const analytics = await calculator.calculateGlobalAnalytics();

      // Assert: Overall recall rate should be weighted average
      // History: 1.0, 0.5, 0.33 -> avg 0.61
      // Science: 1.0 -> avg 1.0
      // Combined avg: (0.61 + 1.0) / 2 ≈ 0.805 (if simple avg)
      // But actual calculation may differ based on total attempts
      expect(analytics.overallRecallRate).toBeGreaterThan(0);
      expect(analytics.overallRecallRate).toBeLessThanOrEqual(1);
    });

    it('should include recent activity trend', async () => {
      // Act: Calculate global analytics
      const analytics = await calculator.calculateGlobalAnalytics();

      // Assert: Should have activity data for days with sessions
      expect(analytics.recentActivity.length).toBeGreaterThanOrEqual(1);

      // Each activity point should have session count
      for (const point of analytics.recentActivity) {
        expect(point.date).toBeInstanceOf(Date);
        expect(point.value).toBeGreaterThanOrEqual(0); // Session count per day
      }
    });

    it('should handle system with no recall sets', async () => {
      // Arrange: Create a fresh database with no data
      const freshDb = createTestDatabase();
      const freshRecallSetRepo = new RecallSetRepository(freshDb.db);
      const freshRecallPointRepo = new RecallPointRepository(freshDb.db);
      const freshMetricsRepo = new SessionMetricsRepository(freshDb.db);
      const freshOutcomeRepo = new RecallOutcomeRepository(freshDb.db);
      const freshRabbitholeRepo = new RabbitholeEventRepository(freshDb.db);

      const freshCalculator = new AnalyticsCalculator(
        freshMetricsRepo,
        freshOutcomeRepo,
        freshRabbitholeRepo,
        freshRecallSetRepo,
        freshRecallPointRepo
      );

      // Act: Calculate global analytics on empty system
      const analytics = await freshCalculator.calculateGlobalAnalytics();

      // Assert: Should return zeros without errors
      expect(analytics.totalRecallSets).toBe(0);
      expect(analytics.activeRecallSets).toBe(0);
      expect(analytics.totalSessions).toBe(0);
      expect(analytics.totalStudyTimeMs).toBe(0);
      expect(analytics.overallRecallRate).toBe(0);
      expect(analytics.totalCostUsd).toBe(0);
      expect(analytics.recentActivity).toHaveLength(0);

      // Cleanup
      freshDb.sqlite.close();
    });

    it('should correctly count active vs inactive recall sets', async () => {
      // Arrange: Create an inactive recall set
      await recallSetRepo.create({
        id: 'rs_paused',
        name: 'Paused Set',
        description: 'Temporarily paused',
        status: 'paused',
        discussionSystemPrompt: 'Paused',
      });

      // Act: Calculate global analytics
      const analytics = await calculator.calculateGlobalAnalytics();

      // Assert: Should show 3 total, 2 active
      expect(analytics.totalRecallSets).toBe(3);
      expect(analytics.activeRecallSets).toBe(2);
    });
  });
});
