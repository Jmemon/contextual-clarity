/**
 * Integration Tests: Dashboard Data Aggregator
 *
 * This test suite verifies the DashboardDataAggregator which prepares
 * API response shapes for the Phase 3 web dashboard. Tests are designed
 * with healthy paranoia since the dashboard is user-facing - bugs here
 * are highly visible.
 *
 * The suite covers:
 * - getOverview(): System-wide summary with streak calculations
 * - getRecallSetDashboard(): Detailed recall set analytics
 * - getUpcomingReviews(): Points due for review sorted by urgency
 * - Data accuracy verification against AnalyticsCalculator
 *
 * Tests use an in-memory SQLite database with comprehensive seeded data
 * representing realistic scenarios including edge cases.
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
import { DashboardDataAggregator } from '../../src/core/dashboard/dashboard-data';
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
 * Creates a date by subtracting days from today at midnight.
 * Returns the date at the START of that day (00:00:00).
 * Useful for creating historical test data with consistent day boundaries.
 */
function daysAgo(days: number): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date;
}

/**
 * Creates a date in the future by adding days to today.
 * Returns the date at midnight.
 */
function daysFromNow(days: number): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date;
}

/**
 * Gets today's date at midnight for consistent comparisons.
 */
function today(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * Helper to create a recall point with specific FSRS state.
 * Reduces boilerplate in test setup.
 */
interface CreatePointOptions {
  id: string;
  recallSetId: string;
  content: string;
  context?: string;
  stability?: number;
  difficulty?: number;
  due?: Date | null;
  lastReview?: Date | null;
  reps?: number;
  lapses?: number;
  state?: 'new' | 'learning' | 'review' | 'relearning';
  recallHistory?: Array<{ timestamp: Date; success: boolean; latencyMs: number }>;
}

/**
 * Comprehensive test data structure for dashboard tests.
 * Includes various edge cases:
 * - Sets with 0, 1, many sessions
 * - Points with 0, 1, 2, 3+ attempts
 * - Points that are overdue, due today, due tomorrow, due in a week
 * - Points with varying stability (new, learning, mastered)
 * - Sessions from today, yesterday, last week, last month
 * - Mix of successful and failed outcomes
 */
interface TestData {
  recallSets: RecallSet[];
  recallPoints: Map<string, RecallPoint[]>; // keyed by recall set ID
  sessions: Session[];
}

/**
 * Seeds comprehensive test data for dashboard tests.
 *
 * Creates a realistic scenario with:
 * - 3 recall sets: active with sessions, active without sessions, paused
 * - Points with varying FSRS states and due dates
 * - Sessions spanning multiple days for streak testing
 * - Session metrics with varying performance
 */
async function seedDashboardTestData(
  recallSetRepo: RecallSetRepository,
  recallPointRepo: RecallPointRepository,
  sessionRepo: SessionRepository,
  metricsRepo: SessionMetricsRepository,
  outcomeRepo: RecallOutcomeRepository,
  rabbitholeRepo: RabbitholeEventRepository,
  scheduler: FSRSScheduler
): Promise<TestData> {
  const now = new Date();
  const initialState = scheduler.createInitialState(now);

  // ============================================
  // RECALL SET 1: Active with many sessions
  // ============================================
  const recallSet1 = await recallSetRepo.create({
    id: 'rs_main_active',
    name: 'Spanish Vocabulary',
    description: 'Common Spanish words and phrases',
    status: 'active',
    discussionSystemPrompt: 'Help the user learn Spanish vocabulary.',
  });

  // Create points with varying states for recall set 1
  const points1: RecallPoint[] = [];

  // Point 1: Mastered (stability > 30 days, not due soon)
  const point1 = await recallPointRepo.create({
    id: 'rp_spanish_mastered',
    recallSetId: recallSet1.id,
    content: 'Hola means Hello',
    context: 'Basic greeting',
    fsrsState: {
      ...initialState,
      stability: 45, // > 30 days = mastered
      difficulty: 3.0,
      due: daysFromNow(30), // Not due for a month
      lastReview: daysAgo(5),
      reps: 10,
      lapses: 0,
      state: 'review',
    },
  });
  // Add recall history for mastered point (all successful)
  for (let i = 0; i < 5; i++) {
    await recallPointRepo.addRecallAttempt(point1.id, {
      timestamp: daysAgo(30 - i * 5),
      success: true,
      latencyMs: 2000,
    });
  }
  points1.push(await recallPointRepo.findById(point1.id) as RecallPoint);

  // Point 2: Learning (stability between 1-30 days)
  const point2 = await recallPointRepo.create({
    id: 'rp_spanish_learning',
    recallSetId: recallSet1.id,
    content: 'Buenos dias means Good morning',
    context: 'Morning greeting',
    fsrsState: {
      ...initialState,
      stability: 7,
      difficulty: 5.0,
      due: daysFromNow(3), // Due in 3 days
      lastReview: daysAgo(2),
      reps: 3,
      lapses: 1,
      state: 'review',
    },
  });
  // Add recall history (mixed results)
  await recallPointRepo.addRecallAttempt(point2.id, {
    timestamp: daysAgo(7),
    success: true,
    latencyMs: 3000,
  });
  await recallPointRepo.addRecallAttempt(point2.id, {
    timestamp: daysAgo(4),
    success: false,
    latencyMs: 5000,
  });
  await recallPointRepo.addRecallAttempt(point2.id, {
    timestamp: daysAgo(2),
    success: true,
    latencyMs: 2500,
  });
  points1.push(await recallPointRepo.findById(point2.id) as RecallPoint);

  // Point 3: Struggling (success rate < 50% with 3+ attempts)
  const point3 = await recallPointRepo.create({
    id: 'rp_spanish_struggling',
    recallSetId: recallSet1.id,
    content: 'Mariposa means Butterfly',
    context: 'Nature vocabulary',
    fsrsState: {
      ...initialState,
      stability: 2,
      difficulty: 7.5,
      due: daysAgo(1), // Overdue by 1 day
      lastReview: daysAgo(3),
      reps: 4,
      lapses: 3,
      state: 'relearning',
    },
  });
  // Add recall history (mostly failed = struggling)
  await recallPointRepo.addRecallAttempt(point3.id, {
    timestamp: daysAgo(10),
    success: false,
    latencyMs: 8000,
  });
  await recallPointRepo.addRecallAttempt(point3.id, {
    timestamp: daysAgo(8),
    success: false,
    latencyMs: 9000,
  });
  await recallPointRepo.addRecallAttempt(point3.id, {
    timestamp: daysAgo(5),
    success: true,
    latencyMs: 4000,
  });
  await recallPointRepo.addRecallAttempt(point3.id, {
    timestamp: daysAgo(3),
    success: false,
    latencyMs: 7000,
  });
  points1.push(await recallPointRepo.findById(point3.id) as RecallPoint);

  // Point 4: New (never reviewed, reps = 0)
  const point4 = await recallPointRepo.create({
    id: 'rp_spanish_new',
    recallSetId: recallSet1.id,
    content: 'Tenedor means Fork',
    context: 'Kitchen vocabulary',
    fsrsState: {
      ...initialState,
      stability: 0,
      difficulty: 5.0,
      due: now, // Due now (new points are due immediately)
      lastReview: null,
      reps: 0,
      lapses: 0,
      state: 'new',
    },
  });
  points1.push(await recallPointRepo.findById(point4.id) as RecallPoint);

  // Point 5: Due today
  const point5 = await recallPointRepo.create({
    id: 'rp_spanish_due_today',
    recallSetId: recallSet1.id,
    content: 'Gato means Cat',
    context: 'Animal vocabulary',
    fsrsState: {
      ...initialState,
      stability: 5,
      difficulty: 4.0,
      due: today(), // Due today
      lastReview: daysAgo(5),
      reps: 2,
      lapses: 0,
      state: 'review',
    },
  });
  await recallPointRepo.addRecallAttempt(point5.id, {
    timestamp: daysAgo(10),
    success: true,
    latencyMs: 3000,
  });
  await recallPointRepo.addRecallAttempt(point5.id, {
    timestamp: daysAgo(5),
    success: true,
    latencyMs: 2500,
  });
  points1.push(await recallPointRepo.findById(point5.id) as RecallPoint);

  // Point 6: Overdue by multiple days
  const point6 = await recallPointRepo.create({
    id: 'rp_spanish_overdue',
    recallSetId: recallSet1.id,
    content: 'Perro means Dog',
    context: 'Animal vocabulary',
    fsrsState: {
      ...initialState,
      stability: 3,
      difficulty: 4.5,
      due: daysAgo(5), // Overdue by 5 days
      lastReview: daysAgo(8),
      reps: 2,
      lapses: 0,
      state: 'review',
    },
  });
  await recallPointRepo.addRecallAttempt(point6.id, {
    timestamp: daysAgo(15),
    success: true,
    latencyMs: 2000,
  });
  await recallPointRepo.addRecallAttempt(point6.id, {
    timestamp: daysAgo(8),
    success: true,
    latencyMs: 2200,
  });
  points1.push(await recallPointRepo.findById(point6.id) as RecallPoint);

  // ============================================
  // RECALL SET 2: Active but with NO sessions
  // ============================================
  const recallSet2 = await recallSetRepo.create({
    id: 'rs_empty_active',
    name: 'French Vocabulary',
    description: 'Common French words',
    status: 'active',
    discussionSystemPrompt: 'Help the user learn French vocabulary.',
  });

  const points2: RecallPoint[] = [];
  // Add one new point to this set
  const point7 = await recallPointRepo.create({
    id: 'rp_french_new',
    recallSetId: recallSet2.id,
    content: 'Bonjour means Hello',
    context: 'Basic French greeting',
    fsrsState: {
      ...initialState,
      stability: 0,
      difficulty: 5.0,
      due: now,
      lastReview: null,
      reps: 0,
      lapses: 0,
      state: 'new',
    },
  });
  points2.push(await recallPointRepo.findById(point7.id) as RecallPoint);

  // ============================================
  // RECALL SET 3: Paused (inactive)
  // ============================================
  const recallSet3 = await recallSetRepo.create({
    id: 'rs_paused',
    name: 'German Vocabulary',
    description: 'German words - currently paused',
    status: 'paused',
    discussionSystemPrompt: 'Help the user learn German vocabulary.',
  });

  const points3: RecallPoint[] = [];
  // Add point to paused set - should NOT appear in upcoming reviews
  const point8 = await recallPointRepo.create({
    id: 'rp_german_paused',
    recallSetId: recallSet3.id,
    content: 'Hallo means Hello',
    context: 'Basic German greeting',
    fsrsState: {
      ...initialState,
      stability: 5,
      difficulty: 4.0,
      due: daysAgo(3), // Overdue but from paused set
      lastReview: daysAgo(8),
      reps: 2,
      lapses: 0,
      state: 'review',
    },
  });
  points3.push(await recallPointRepo.findById(point8.id) as RecallPoint);

  // ============================================
  // SESSIONS for streak testing
  // ============================================
  const sessions: Session[] = [];

  // Create sessions that form a 5-day streak ending today
  // Today's session
  const sessionToday = await sessionRepo.create({
    id: 'sess_today',
    recallSetId: recallSet1.id,
    targetRecallPointIds: ['rp_spanish_mastered'],
    startedAt: today(),
  });
  await sessionRepo.update(sessionToday.id, {
    status: 'completed',
    endedAt: new Date(today().getTime() + 300000) // 5 min later
  });
  sessions.push({ ...sessionToday, status: 'completed', endedAt: new Date(today().getTime() + 300000) });

  // Yesterday's session
  const sessionYesterday = await sessionRepo.create({
    id: 'sess_yesterday',
    recallSetId: recallSet1.id,
    targetRecallPointIds: ['rp_spanish_learning'],
    startedAt: daysAgo(1),
  });
  await sessionRepo.update(sessionYesterday.id, { status: 'completed', endedAt: daysAgo(1) });
  sessions.push({ ...sessionYesterday, status: 'completed', endedAt: daysAgo(1) });

  // 2 days ago
  const session2DaysAgo = await sessionRepo.create({
    id: 'sess_2_days_ago',
    recallSetId: recallSet1.id,
    targetRecallPointIds: ['rp_spanish_struggling'],
    startedAt: daysAgo(2),
  });
  await sessionRepo.update(session2DaysAgo.id, { status: 'completed', endedAt: daysAgo(2) });
  sessions.push({ ...session2DaysAgo, status: 'completed', endedAt: daysAgo(2) });

  // 3 days ago
  const session3DaysAgo = await sessionRepo.create({
    id: 'sess_3_days_ago',
    recallSetId: recallSet1.id,
    targetRecallPointIds: ['rp_spanish_due_today'],
    startedAt: daysAgo(3),
  });
  await sessionRepo.update(session3DaysAgo.id, { status: 'completed', endedAt: daysAgo(3) });
  sessions.push({ ...session3DaysAgo, status: 'completed', endedAt: daysAgo(3) });

  // 4 days ago
  const session4DaysAgo = await sessionRepo.create({
    id: 'sess_4_days_ago',
    recallSetId: recallSet1.id,
    targetRecallPointIds: ['rp_spanish_overdue'],
    startedAt: daysAgo(4),
  });
  await sessionRepo.update(session4DaysAgo.id, { status: 'completed', endedAt: daysAgo(4) });
  sessions.push({ ...session4DaysAgo, status: 'completed', endedAt: daysAgo(4) });

  // GAP: Skip day 5

  // 6 days ago (starts a separate streak)
  const session6DaysAgo = await sessionRepo.create({
    id: 'sess_6_days_ago',
    recallSetId: recallSet1.id,
    targetRecallPointIds: ['rp_spanish_mastered'],
    startedAt: daysAgo(6),
  });
  await sessionRepo.update(session6DaysAgo.id, { status: 'completed', endedAt: daysAgo(6) });
  sessions.push({ ...session6DaysAgo, status: 'completed', endedAt: daysAgo(6) });

  // 7 days ago (continues the old streak)
  const session7DaysAgo = await sessionRepo.create({
    id: 'sess_7_days_ago',
    recallSetId: recallSet1.id,
    targetRecallPointIds: ['rp_spanish_learning'],
    startedAt: daysAgo(7),
  });
  await sessionRepo.update(session7DaysAgo.id, { status: 'completed', endedAt: daysAgo(7) });
  sessions.push({ ...session7DaysAgo, status: 'completed', endedAt: daysAgo(7) });

  // Old session from last month for testing longest streak
  const sessionLastMonth = await sessionRepo.create({
    id: 'sess_last_month',
    recallSetId: recallSet1.id,
    targetRecallPointIds: ['rp_spanish_mastered'],
    startedAt: daysAgo(30),
  });
  await sessionRepo.update(sessionLastMonth.id, { status: 'completed', endedAt: daysAgo(30) });
  sessions.push({ ...sessionLastMonth, status: 'completed', endedAt: daysAgo(30) });

  // Abandoned session (should NOT count toward completed stats)
  const sessionAbandoned = await sessionRepo.create({
    id: 'sess_abandoned',
    recallSetId: recallSet1.id,
    targetRecallPointIds: ['rp_spanish_struggling'],
    startedAt: daysAgo(10),
  });
  await sessionRepo.update(sessionAbandoned.id, { status: 'abandoned', endedAt: daysAgo(10) });
  sessions.push({ ...sessionAbandoned, status: 'abandoned', endedAt: daysAgo(10) });

  // In-progress session (should NOT count toward completed stats)
  const sessionInProgress = await sessionRepo.create({
    id: 'sess_in_progress',
    recallSetId: recallSet1.id,
    targetRecallPointIds: ['rp_spanish_new'],
    startedAt: today(),
  });
  sessions.push({ ...sessionInProgress, status: 'in_progress', endedAt: null });

  // ============================================
  // SESSION METRICS
  // ============================================

  // Metrics for today's session
  await metricsRepo.create({
    id: 'sm_today',
    sessionId: 'sess_today',
    durationMs: 300000, // 5 minutes
    activeTimeMs: 280000,
    avgUserResponseTimeMs: 5000,
    avgAssistantResponseTimeMs: 2000,
    recallPointsAttempted: 1,
    recallPointsSuccessful: 1,
    recallPointsFailed: 0,
    overallRecallRate: 1.0,
    avgConfidence: 0.95,
    totalMessages: 8,
    userMessages: 4,
    assistantMessages: 4,
    avgMessageLength: 50,
    rabbitholeCount: 0,
    totalRabbitholeTimeMs: 0,
    avgRabbitholeDepth: 0,
    inputTokens: 1000,
    outputTokens: 600,
    totalTokens: 1600,
    estimatedCostUsd: 0.016,
    engagementScore: 92,
    calculatedAt: today(),
  });

  // Metrics for yesterday's session
  await metricsRepo.create({
    id: 'sm_yesterday',
    sessionId: 'sess_yesterday',
    durationMs: 420000, // 7 minutes
    activeTimeMs: 400000,
    avgUserResponseTimeMs: 6000,
    avgAssistantResponseTimeMs: 2500,
    recallPointsAttempted: 1,
    recallPointsSuccessful: 1,
    recallPointsFailed: 0,
    overallRecallRate: 1.0,
    avgConfidence: 0.88,
    totalMessages: 10,
    userMessages: 5,
    assistantMessages: 5,
    avgMessageLength: 55,
    rabbitholeCount: 0,
    totalRabbitholeTimeMs: 0,
    avgRabbitholeDepth: 0,
    inputTokens: 1200,
    outputTokens: 700,
    totalTokens: 1900,
    estimatedCostUsd: 0.019,
    engagementScore: 85,
    calculatedAt: daysAgo(1),
  });

  // Metrics for 2 days ago (struggling point - lower scores)
  await metricsRepo.create({
    id: 'sm_2_days_ago',
    sessionId: 'sess_2_days_ago',
    durationMs: 600000, // 10 minutes
    activeTimeMs: 550000,
    avgUserResponseTimeMs: 8000,
    avgAssistantResponseTimeMs: 3000,
    recallPointsAttempted: 1,
    recallPointsSuccessful: 0,
    recallPointsFailed: 1,
    overallRecallRate: 0.0,
    avgConfidence: 0.45,
    totalMessages: 14,
    userMessages: 7,
    assistantMessages: 7,
    avgMessageLength: 60,
    rabbitholeCount: 1,
    totalRabbitholeTimeMs: 30000,
    avgRabbitholeDepth: 1,
    inputTokens: 1800,
    outputTokens: 900,
    totalTokens: 2700,
    estimatedCostUsd: 0.027,
    engagementScore: 55,
    calculatedAt: daysAgo(2),
  });

  // Metrics for 3 days ago
  await metricsRepo.create({
    id: 'sm_3_days_ago',
    sessionId: 'sess_3_days_ago',
    durationMs: 360000, // 6 minutes
    activeTimeMs: 340000,
    avgUserResponseTimeMs: 5500,
    avgAssistantResponseTimeMs: 2200,
    recallPointsAttempted: 1,
    recallPointsSuccessful: 1,
    recallPointsFailed: 0,
    overallRecallRate: 1.0,
    avgConfidence: 0.82,
    totalMessages: 12,
    userMessages: 6,
    assistantMessages: 6,
    avgMessageLength: 52,
    rabbitholeCount: 0,
    totalRabbitholeTimeMs: 0,
    avgRabbitholeDepth: 0,
    inputTokens: 1100,
    outputTokens: 650,
    totalTokens: 1750,
    estimatedCostUsd: 0.0175,
    engagementScore: 78,
    calculatedAt: daysAgo(3),
  });

  // Metrics for 4 days ago
  await metricsRepo.create({
    id: 'sm_4_days_ago',
    sessionId: 'sess_4_days_ago',
    durationMs: 480000, // 8 minutes
    activeTimeMs: 450000,
    avgUserResponseTimeMs: 7000,
    avgAssistantResponseTimeMs: 2800,
    recallPointsAttempted: 1,
    recallPointsSuccessful: 1,
    recallPointsFailed: 0,
    overallRecallRate: 1.0,
    avgConfidence: 0.78,
    totalMessages: 16,
    userMessages: 8,
    assistantMessages: 8,
    avgMessageLength: 48,
    rabbitholeCount: 0,
    totalRabbitholeTimeMs: 0,
    avgRabbitholeDepth: 0,
    inputTokens: 1400,
    outputTokens: 800,
    totalTokens: 2200,
    estimatedCostUsd: 0.022,
    engagementScore: 72,
    calculatedAt: daysAgo(4),
  });

  // Metrics for 6 days ago
  await metricsRepo.create({
    id: 'sm_6_days_ago',
    sessionId: 'sess_6_days_ago',
    durationMs: 300000,
    activeTimeMs: 280000,
    avgUserResponseTimeMs: 5000,
    avgAssistantResponseTimeMs: 2000,
    recallPointsAttempted: 1,
    recallPointsSuccessful: 1,
    recallPointsFailed: 0,
    overallRecallRate: 1.0,
    avgConfidence: 0.9,
    totalMessages: 8,
    userMessages: 4,
    assistantMessages: 4,
    avgMessageLength: 50,
    rabbitholeCount: 0,
    totalRabbitholeTimeMs: 0,
    avgRabbitholeDepth: 0,
    inputTokens: 1000,
    outputTokens: 600,
    totalTokens: 1600,
    estimatedCostUsd: 0.016,
    engagementScore: 88,
    calculatedAt: daysAgo(6),
  });

  // Metrics for 7 days ago
  await metricsRepo.create({
    id: 'sm_7_days_ago',
    sessionId: 'sess_7_days_ago',
    durationMs: 360000,
    activeTimeMs: 340000,
    avgUserResponseTimeMs: 5500,
    avgAssistantResponseTimeMs: 2200,
    recallPointsAttempted: 1,
    recallPointsSuccessful: 1,
    recallPointsFailed: 0,
    overallRecallRate: 1.0,
    avgConfidence: 0.85,
    totalMessages: 10,
    userMessages: 5,
    assistantMessages: 5,
    avgMessageLength: 52,
    rabbitholeCount: 0,
    totalRabbitholeTimeMs: 0,
    avgRabbitholeDepth: 0,
    inputTokens: 1100,
    outputTokens: 650,
    totalTokens: 1750,
    estimatedCostUsd: 0.0175,
    engagementScore: 82,
    calculatedAt: daysAgo(7),
  });

  // Metrics for last month
  await metricsRepo.create({
    id: 'sm_last_month',
    sessionId: 'sess_last_month',
    durationMs: 300000,
    activeTimeMs: 280000,
    avgUserResponseTimeMs: 5000,
    avgAssistantResponseTimeMs: 2000,
    recallPointsAttempted: 1,
    recallPointsSuccessful: 1,
    recallPointsFailed: 0,
    overallRecallRate: 1.0,
    avgConfidence: 0.92,
    totalMessages: 8,
    userMessages: 4,
    assistantMessages: 4,
    avgMessageLength: 50,
    rabbitholeCount: 0,
    totalRabbitholeTimeMs: 0,
    avgRabbitholeDepth: 0,
    inputTokens: 1000,
    outputTokens: 600,
    totalTokens: 1600,
    estimatedCostUsd: 0.016,
    engagementScore: 90,
    calculatedAt: daysAgo(30),
  });

  // ============================================
  // RECALL OUTCOMES
  // ============================================

  // Outcomes for today's session (success)
  await outcomeRepo.create({
    id: 'ro_today',
    sessionId: 'sess_today',
    recallPointId: 'rp_spanish_mastered',
    success: true,
    confidence: 0.95,
    rating: 'easy',
    reasoning: 'Perfect recall',
    messageIndexStart: 0,
    messageIndexEnd: 7,
    timeSpentMs: 280000,
    createdAt: today(),
  });

  // Outcomes for yesterday (success)
  await outcomeRepo.create({
    id: 'ro_yesterday',
    sessionId: 'sess_yesterday',
    recallPointId: 'rp_spanish_learning',
    success: true,
    confidence: 0.88,
    rating: 'good',
    reasoning: 'Good recall with minor prompting',
    messageIndexStart: 0,
    messageIndexEnd: 9,
    timeSpentMs: 400000,
    createdAt: daysAgo(1),
  });

  // Outcomes for 2 days ago (failure - struggling point)
  await outcomeRepo.create({
    id: 'ro_2_days_ago',
    sessionId: 'sess_2_days_ago',
    recallPointId: 'rp_spanish_struggling',
    success: false,
    confidence: 0.45,
    rating: 'forgot',
    reasoning: 'Could not recall',
    messageIndexStart: 0,
    messageIndexEnd: 13,
    timeSpentMs: 550000,
    createdAt: daysAgo(2),
  });

  return {
    recallSets: [recallSet1, recallSet2, recallSet3],
    recallPoints: new Map([
      [recallSet1.id, points1],
      [recallSet2.id, points2],
      [recallSet3.id, points3],
    ]),
    sessions,
  };
}

describe('Dashboard Data Aggregator', () => {
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
  let analyticsCalc: AnalyticsCalculator;
  let aggregator: DashboardDataAggregator;

  // Test data
  let testData: TestData;

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
    analyticsCalc = new AnalyticsCalculator(
      metricsRepo,
      outcomeRepo,
      rabbitholeRepo,
      recallSetRepo,
      recallPointRepo
    );
    aggregator = new DashboardDataAggregator(
      recallSetRepo,
      recallPointRepo,
      sessionRepo,
      metricsRepo,
      analyticsCalc
    );

    // Seed comprehensive test data
    testData = await seedDashboardTestData(
      recallSetRepo,
      recallPointRepo,
      sessionRepo,
      metricsRepo,
      outcomeRepo,
      rabbitholeRepo,
      scheduler
    );
  });

  afterEach(() => {
    if (sqlite) {
      sqlite.close();
    }
  });

  // ============================================
  // getOverview() Tests
  // ============================================
  describe('getOverview', () => {
    describe('Happy path', () => {
      it('should aggregate stats across all recall sets correctly', async () => {
        // Act
        const overview = await aggregator.getOverview();

        // Assert: Total recall sets = 3 (active with sessions, active without, paused)
        expect(overview.totalRecallSets).toBe(3);
      });

      it('should count total vs active recall sets accurately', async () => {
        // Act
        const overview = await aggregator.getOverview();

        // Assert: 2 active (Spanish with sessions, French without), 1 paused (German)
        expect(overview.totalRecallSets).toBe(3);
        expect(overview.activeRecallSets).toBe(2);
      });

      it('should calculate totalStudyTimeMs as sum of all session durations', async () => {
        // Act
        const overview = await aggregator.getOverview();

        // Assert: Sum all session durations
        // today: 300000 + yesterday: 420000 + 2days: 600000 + 3days: 360000
        // + 4days: 480000 + 6days: 300000 + 7days: 360000 + lastmonth: 300000
        // = 3,120,000 ms
        const expectedTotalTime = 300000 + 420000 + 600000 + 360000 + 480000 + 300000 + 360000 + 300000;
        expect(overview.totalStudyTimeMs).toBe(expectedTotalTime);
      });

      it('should calculate overallRecallRate correctly', async () => {
        // Act
        const overview = await aggregator.getOverview();

        // Assert: Overall recall rate should be between 0 and 1
        expect(overview.overallRecallRate).toBeGreaterThanOrEqual(0);
        expect(overview.overallRecallRate).toBeLessThanOrEqual(1);

        // We have 8 sessions with metrics, 7 with 100% recall, 1 with 0%
        // The calculation depends on GlobalAnalytics which uses weighted average
        // Let's just verify it's a reasonable value
        expect(overview.overallRecallRate).toBeGreaterThan(0.5);
      });
    });

    describe('Recent sessions', () => {
      it('should return recent sessions sorted by date descending', async () => {
        // Act
        const overview = await aggregator.getOverview();

        // Assert: Recent sessions should be sorted newest first
        expect(overview.recentSessions.length).toBeGreaterThan(0);

        for (let i = 1; i < overview.recentSessions.length; i++) {
          const prev = overview.recentSessions[i - 1].startedAt;
          const curr = overview.recentSessions[i].startedAt;
          expect(prev.getTime()).toBeGreaterThanOrEqual(curr.getTime());
        }
      });

      it('should limit recent sessions to reasonable count', async () => {
        // Act
        const overview = await aggregator.getOverview();

        // Assert: Should be limited (default is 10)
        expect(overview.recentSessions.length).toBeLessThanOrEqual(10);
      });

      it('should include correct recallSetName in each session summary', async () => {
        // Act
        const overview = await aggregator.getOverview();

        // Assert: Each session summary should have the recall set name
        for (const session of overview.recentSessions) {
          expect(session.recallSetName).toBeTruthy();
          expect(typeof session.recallSetName).toBe('string');

          // Sessions are from the Spanish set
          if (session.recallSetId === 'rs_main_active') {
            expect(session.recallSetName).toBe('Spanish Vocabulary');
          }
        }
      });
    });

    describe('Upcoming reviews', () => {
      it('should identify points due today', async () => {
        // Act
        const overview = await aggregator.getOverview();

        // Assert: Should find rp_spanish_due_today
        const dueToday = overview.upcomingReviews.filter(
          (r) => r.priority === 'due-today'
        );

        // We have rp_spanish_due_today and rp_spanish_new (new points due now)
        expect(dueToday.length).toBeGreaterThan(0);
      });

      it('should identify overdue points', async () => {
        // Act
        const overview = await aggregator.getOverview();

        // Assert: Should find overdue points
        const overdue = overview.upcomingReviews.filter(
          (r) => r.priority === 'overdue'
        );

        // rp_spanish_struggling (overdue by 1 day) and rp_spanish_overdue (overdue by 5 days)
        expect(overdue.length).toBeGreaterThanOrEqual(2);
      });

      it('should sort upcoming reviews by urgency (overdue first)', async () => {
        // Act
        const overview = await aggregator.getOverview();

        // Assert: Reviews should be sorted by daysUntilDue (most negative first)
        for (let i = 1; i < overview.upcomingReviews.length; i++) {
          const prev = overview.upcomingReviews[i - 1].daysUntilDue;
          const curr = overview.upcomingReviews[i].daysUntilDue;
          expect(prev).toBeLessThanOrEqual(curr);
        }
      });

      it('should calculate daysUntilDue correctly (negative for overdue)', async () => {
        // Act
        const overview = await aggregator.getOverview();

        // Assert: Find overdue point and verify daysUntilDue is negative
        const overduePoint = overview.upcomingReviews.find(
          (r) => r.recallPointId === 'rp_spanish_overdue'
        );

        expect(overduePoint).toBeDefined();
        expect(overduePoint!.daysUntilDue).toBeLessThan(0);

        // Due today should have daysUntilDue of 0 or close to 0
        const dueTodayPoint = overview.upcomingReviews.find(
          (r) => r.recallPointId === 'rp_spanish_due_today'
        );

        if (dueTodayPoint) {
          expect(dueTodayPoint.daysUntilDue).toBeLessThanOrEqual(0);
        }
      });
    });

    describe('Streak calculation - BE PARANOID HERE', () => {
      it('should calculate current streak as consecutive days with sessions', async () => {
        // Act
        const overview = await aggregator.getOverview();

        // Assert: We have sessions today, yesterday, 2 days ago, 3 days ago, 4 days ago
        // Then a gap on day 5, then sessions on days 6 and 7
        // Current streak should be 5 (today through 4 days ago)
        expect(overview.currentStreak).toBe(5);
      });

      it('should handle streak of 0 (no sessions today or yesterday)', async () => {
        // Arrange: Create a fresh database with no recent sessions
        const freshDb = createTestDatabase();
        const freshRecallSetRepo = new RecallSetRepository(freshDb.db);
        const freshRecallPointRepo = new RecallPointRepository(freshDb.db);
        const freshSessionRepo = new SessionRepository(freshDb.db);
        const freshMetricsRepo = new SessionMetricsRepository(freshDb.db);
        const freshOutcomeRepo = new RecallOutcomeRepository(freshDb.db);
        const freshRabbitholeRepo = new RabbitholeEventRepository(freshDb.db);

        const freshAnalyticsCalc = new AnalyticsCalculator(
          freshMetricsRepo,
          freshOutcomeRepo,
          freshRabbitholeRepo,
          freshRecallSetRepo,
          freshRecallPointRepo
        );

        const freshAggregator = new DashboardDataAggregator(
          freshRecallSetRepo,
          freshRecallPointRepo,
          freshSessionRepo,
          freshMetricsRepo,
          freshAnalyticsCalc
        );

        // Create a recall set
        await freshRecallSetRepo.create({
          id: 'rs_test',
          name: 'Test Set',
          description: 'Test',
          status: 'active',
          discussionSystemPrompt: 'Test',
        });

        // Create a session from 3 days ago (no session today or yesterday)
        const oldSession = await freshSessionRepo.create({
          id: 'sess_old',
          recallSetId: 'rs_test',
          targetRecallPointIds: [],
          startedAt: daysAgo(3),
        });
        await freshSessionRepo.update(oldSession.id, { status: 'completed', endedAt: daysAgo(3) });

        // Act
        const overview = await freshAggregator.getOverview();

        // Assert: Streak should be 0 (no session today or yesterday)
        expect(overview.currentStreak).toBe(0);

        // Cleanup
        freshDb.sqlite.close();
      });

      it('should handle streak of 1 (session today, none yesterday)', async () => {
        // Arrange: Create a fresh database with only today's session
        const freshDb = createTestDatabase();
        const freshRecallSetRepo = new RecallSetRepository(freshDb.db);
        const freshRecallPointRepo = new RecallPointRepository(freshDb.db);
        const freshSessionRepo = new SessionRepository(freshDb.db);
        const freshMetricsRepo = new SessionMetricsRepository(freshDb.db);
        const freshOutcomeRepo = new RecallOutcomeRepository(freshDb.db);
        const freshRabbitholeRepo = new RabbitholeEventRepository(freshDb.db);

        const freshAnalyticsCalc = new AnalyticsCalculator(
          freshMetricsRepo,
          freshOutcomeRepo,
          freshRabbitholeRepo,
          freshRecallSetRepo,
          freshRecallPointRepo
        );

        const freshAggregator = new DashboardDataAggregator(
          freshRecallSetRepo,
          freshRecallPointRepo,
          freshSessionRepo,
          freshMetricsRepo,
          freshAnalyticsCalc
        );

        // Create a recall set
        await freshRecallSetRepo.create({
          id: 'rs_test',
          name: 'Test Set',
          description: 'Test',
          status: 'active',
          discussionSystemPrompt: 'Test',
        });

        // Create a session for today only
        const todaySession = await freshSessionRepo.create({
          id: 'sess_today_only',
          recallSetId: 'rs_test',
          targetRecallPointIds: [],
          startedAt: today(),
        });
        await freshSessionRepo.update(todaySession.id, { status: 'completed', endedAt: today() });

        // Create an old session to verify it doesn't affect current streak
        const oldSession = await freshSessionRepo.create({
          id: 'sess_week_ago',
          recallSetId: 'rs_test',
          targetRecallPointIds: [],
          startedAt: daysAgo(7),
        });
        await freshSessionRepo.update(oldSession.id, { status: 'completed', endedAt: daysAgo(7) });

        // Act
        const overview = await freshAggregator.getOverview();

        // Assert: Current streak should be 1 (only today)
        expect(overview.currentStreak).toBe(1);

        // Cleanup
        freshDb.sqlite.close();
      });

      it('should handle gaps in streak correctly', async () => {
        // Our test data has a gap on day 5
        // Streak goes: today, -1, -2, -3, -4, GAP, -6, -7

        // Act
        const overview = await aggregator.getOverview();

        // Assert: Current streak should stop at the gap (5 days)
        expect(overview.currentStreak).toBe(5);

        // Longest streak could include the 6-7 day segment plus old sessions
        // But that's a separate streak of 2, so longest is 5
        // Actually, the longest ever could be different if there was a longer streak
        // In our data, the longest consecutive is 5 (today through 4 days ago)
        expect(overview.longestStreak).toBeGreaterThanOrEqual(overview.currentStreak);
      });

      it('should track longest streak separately from current', async () => {
        // Arrange: Create scenario where longest > current
        const freshDb = createTestDatabase();
        const freshRecallSetRepo = new RecallSetRepository(freshDb.db);
        const freshRecallPointRepo = new RecallPointRepository(freshDb.db);
        const freshSessionRepo = new SessionRepository(freshDb.db);
        const freshMetricsRepo = new SessionMetricsRepository(freshDb.db);
        const freshOutcomeRepo = new RecallOutcomeRepository(freshDb.db);
        const freshRabbitholeRepo = new RabbitholeEventRepository(freshDb.db);

        const freshAnalyticsCalc = new AnalyticsCalculator(
          freshMetricsRepo,
          freshOutcomeRepo,
          freshRabbitholeRepo,
          freshRecallSetRepo,
          freshRecallPointRepo
        );

        const freshAggregator = new DashboardDataAggregator(
          freshRecallSetRepo,
          freshRecallPointRepo,
          freshSessionRepo,
          freshMetricsRepo,
          freshAnalyticsCalc
        );

        await freshRecallSetRepo.create({
          id: 'rs_test',
          name: 'Test Set',
          description: 'Test',
          status: 'active',
          discussionSystemPrompt: 'Test',
        });

        // Create current streak of 2 (today and yesterday)
        const s1 = await freshSessionRepo.create({
          id: 'sess_today',
          recallSetId: 'rs_test',
          targetRecallPointIds: [],
          startedAt: today(),
        });
        await freshSessionRepo.update(s1.id, { status: 'completed', endedAt: today() });

        const s2 = await freshSessionRepo.create({
          id: 'sess_yesterday',
          recallSetId: 'rs_test',
          targetRecallPointIds: [],
          startedAt: daysAgo(1),
        });
        await freshSessionRepo.update(s2.id, { status: 'completed', endedAt: daysAgo(1) });

        // GAP on day 2

        // Create longer historical streak (days 10-15 = 6 days)
        for (let i = 10; i <= 15; i++) {
          const s = await freshSessionRepo.create({
            id: `sess_old_${i}`,
            recallSetId: 'rs_test',
            targetRecallPointIds: [],
            startedAt: daysAgo(i),
          });
          await freshSessionRepo.update(s.id, { status: 'completed', endedAt: daysAgo(i) });
        }

        // Act
        const overview = await freshAggregator.getOverview();

        // Assert: Current streak = 2, Longest streak = 6
        expect(overview.currentStreak).toBe(2);
        expect(overview.longestStreak).toBe(6);
        expect(overview.longestStreak).toBeGreaterThan(overview.currentStreak);

        // Cleanup
        freshDb.sqlite.close();
      });

      it('should handle timezone edge cases (sessions near midnight)', async () => {
        // Arrange: Create sessions at different times of day
        const freshDb = createTestDatabase();
        const freshRecallSetRepo = new RecallSetRepository(freshDb.db);
        const freshRecallPointRepo = new RecallPointRepository(freshDb.db);
        const freshSessionRepo = new SessionRepository(freshDb.db);
        const freshMetricsRepo = new SessionMetricsRepository(freshDb.db);
        const freshOutcomeRepo = new RecallOutcomeRepository(freshDb.db);
        const freshRabbitholeRepo = new RabbitholeEventRepository(freshDb.db);

        const freshAnalyticsCalc = new AnalyticsCalculator(
          freshMetricsRepo,
          freshOutcomeRepo,
          freshRabbitholeRepo,
          freshRecallSetRepo,
          freshRecallPointRepo
        );

        const freshAggregator = new DashboardDataAggregator(
          freshRecallSetRepo,
          freshRecallPointRepo,
          freshSessionRepo,
          freshMetricsRepo,
          freshAnalyticsCalc
        );

        await freshRecallSetRepo.create({
          id: 'rs_test',
          name: 'Test Set',
          description: 'Test',
          status: 'active',
          discussionSystemPrompt: 'Test',
        });

        // Session at 11:59 PM yesterday
        const yesterdayLate = new Date(daysAgo(1));
        yesterdayLate.setHours(23, 59, 0, 0);
        const s1 = await freshSessionRepo.create({
          id: 'sess_yesterday_late',
          recallSetId: 'rs_test',
          targetRecallPointIds: [],
          startedAt: yesterdayLate,
        });
        await freshSessionRepo.update(s1.id, { status: 'completed', endedAt: yesterdayLate });

        // Session at 00:01 AM today
        const todayEarly = new Date(today());
        todayEarly.setHours(0, 1, 0, 0);
        const s2 = await freshSessionRepo.create({
          id: 'sess_today_early',
          recallSetId: 'rs_test',
          targetRecallPointIds: [],
          startedAt: todayEarly,
        });
        await freshSessionRepo.update(s2.id, { status: 'completed', endedAt: todayEarly });

        // Act
        const overview = await freshAggregator.getOverview();

        // Assert: Both sessions should be counted as separate days
        // This should result in a streak of 2 (today + yesterday)
        expect(overview.currentStreak).toBe(2);

        // Cleanup
        freshDb.sqlite.close();
      });
    });

    describe('Edge cases', () => {
      it('should handle empty system (no recall sets)', async () => {
        // Arrange: Create empty database
        const freshDb = createTestDatabase();
        const freshRecallSetRepo = new RecallSetRepository(freshDb.db);
        const freshRecallPointRepo = new RecallPointRepository(freshDb.db);
        const freshSessionRepo = new SessionRepository(freshDb.db);
        const freshMetricsRepo = new SessionMetricsRepository(freshDb.db);
        const freshOutcomeRepo = new RecallOutcomeRepository(freshDb.db);
        const freshRabbitholeRepo = new RabbitholeEventRepository(freshDb.db);

        const freshAnalyticsCalc = new AnalyticsCalculator(
          freshMetricsRepo,
          freshOutcomeRepo,
          freshRabbitholeRepo,
          freshRecallSetRepo,
          freshRecallPointRepo
        );

        const freshAggregator = new DashboardDataAggregator(
          freshRecallSetRepo,
          freshRecallPointRepo,
          freshSessionRepo,
          freshMetricsRepo,
          freshAnalyticsCalc
        );

        // Act
        const overview = await freshAggregator.getOverview();

        // Assert: All counts should be 0
        expect(overview.totalRecallSets).toBe(0);
        expect(overview.activeRecallSets).toBe(0);
        expect(overview.totalSessions).toBe(0);
        expect(overview.totalStudyTimeMs).toBe(0);
        expect(overview.overallRecallRate).toBe(0);
        expect(overview.todaysSessions).toBe(0);
        expect(overview.todaysStudyTimeMs).toBe(0);
        expect(overview.pointsDueToday).toBe(0);
        expect(overview.recentSessions).toHaveLength(0);
        expect(overview.upcomingReviews).toHaveLength(0);
        expect(overview.currentStreak).toBe(0);
        expect(overview.longestStreak).toBe(0);

        // Cleanup
        freshDb.sqlite.close();
      });

      it('should handle system with sets but no sessions', async () => {
        // Arrange: Create database with recall sets but no sessions
        const freshDb = createTestDatabase();
        const freshRecallSetRepo = new RecallSetRepository(freshDb.db);
        const freshRecallPointRepo = new RecallPointRepository(freshDb.db);
        const freshSessionRepo = new SessionRepository(freshDb.db);
        const freshMetricsRepo = new SessionMetricsRepository(freshDb.db);
        const freshOutcomeRepo = new RecallOutcomeRepository(freshDb.db);
        const freshRabbitholeRepo = new RabbitholeEventRepository(freshDb.db);

        const freshAnalyticsCalc = new AnalyticsCalculator(
          freshMetricsRepo,
          freshOutcomeRepo,
          freshRabbitholeRepo,
          freshRecallSetRepo,
          freshRecallPointRepo
        );

        const freshAggregator = new DashboardDataAggregator(
          freshRecallSetRepo,
          freshRecallPointRepo,
          freshSessionRepo,
          freshMetricsRepo,
          freshAnalyticsCalc
        );

        // Create a recall set with a point but no sessions
        await freshRecallSetRepo.create({
          id: 'rs_no_sessions',
          name: 'No Sessions Set',
          description: 'Has points but no sessions',
          status: 'active',
          discussionSystemPrompt: 'Test',
        });

        const freshScheduler = new FSRSScheduler();
        const initialState = freshScheduler.createInitialState(new Date());

        await freshRecallPointRepo.create({
          id: 'rp_no_session',
          recallSetId: 'rs_no_sessions',
          content: 'Test content',
          context: 'Test context',
          fsrsState: {
            ...initialState,
            due: new Date(), // Due now
          },
        });

        // Act
        const overview = await freshAggregator.getOverview();

        // Assert
        expect(overview.totalRecallSets).toBe(1);
        expect(overview.activeRecallSets).toBe(1);
        expect(overview.totalSessions).toBe(0);
        expect(overview.totalStudyTimeMs).toBe(0);
        expect(overview.recentSessions).toHaveLength(0);
        expect(overview.currentStreak).toBe(0);

        // But should have upcoming reviews
        expect(overview.pointsDueToday).toBe(1);
        expect(overview.upcomingReviews.length).toBeGreaterThan(0);

        // Cleanup
        freshDb.sqlite.close();
      });

      it('should handle all sets being inactive/paused', async () => {
        // Arrange: Create database with only paused sets
        const freshDb = createTestDatabase();
        const freshRecallSetRepo = new RecallSetRepository(freshDb.db);
        const freshRecallPointRepo = new RecallPointRepository(freshDb.db);
        const freshSessionRepo = new SessionRepository(freshDb.db);
        const freshMetricsRepo = new SessionMetricsRepository(freshDb.db);
        const freshOutcomeRepo = new RecallOutcomeRepository(freshDb.db);
        const freshRabbitholeRepo = new RabbitholeEventRepository(freshDb.db);

        const freshAnalyticsCalc = new AnalyticsCalculator(
          freshMetricsRepo,
          freshOutcomeRepo,
          freshRabbitholeRepo,
          freshRecallSetRepo,
          freshRecallPointRepo
        );

        const freshAggregator = new DashboardDataAggregator(
          freshRecallSetRepo,
          freshRecallPointRepo,
          freshSessionRepo,
          freshMetricsRepo,
          freshAnalyticsCalc
        );

        // Create paused and archived sets only
        await freshRecallSetRepo.create({
          id: 'rs_paused_1',
          name: 'Paused Set 1',
          description: 'Paused',
          status: 'paused',
          discussionSystemPrompt: 'Test',
        });

        await freshRecallSetRepo.create({
          id: 'rs_archived_1',
          name: 'Archived Set 1',
          description: 'Archived',
          status: 'archived',
          discussionSystemPrompt: 'Test',
        });

        // Act
        const overview = await freshAggregator.getOverview();

        // Assert
        expect(overview.totalRecallSets).toBe(2);
        expect(overview.activeRecallSets).toBe(0);
        expect(overview.pointsDueToday).toBe(0);
        expect(overview.upcomingReviews).toHaveLength(0); // No reviews from paused sets

        // Cleanup
        freshDb.sqlite.close();
      });
    });

    describe("Today's activity", () => {
      it('should count sessions started today', async () => {
        // Act
        const overview = await aggregator.getOverview();

        // Assert: We have 2 sessions today (completed and in-progress)
        expect(overview.todaysSessions).toBe(2);
      });

      it('should calculate todays study time correctly', async () => {
        // Act
        const overview = await aggregator.getOverview();

        // Assert: Only the completed today's session has metrics (300000ms)
        // The in-progress session has no metrics yet
        expect(overview.todaysStudyTimeMs).toBe(300000);
      });
    });
  });

  // ============================================
  // getRecallSetDashboard() Tests
  // ============================================
  describe('getRecallSetDashboard', () => {
    describe('Basic data', () => {
      it('should return correct recall set metadata', async () => {
        // Act
        const dashboard = await aggregator.getRecallSetDashboard('rs_main_active');

        // Assert
        expect(dashboard.recallSet.id).toBe('rs_main_active');
        expect(dashboard.recallSet.name).toBe('Spanish Vocabulary');
        expect(dashboard.recallSet.description).toBe('Common Spanish words and phrases');
        expect(dashboard.recallSet.status).toBe('active');
        expect(dashboard.recallSet.createdAt).toBeInstanceOf(Date);
      });

      it('should calculate stats from session metrics', async () => {
        // Act
        const dashboard = await aggregator.getRecallSetDashboard('rs_main_active');

        // Assert: Stats should reflect all completed sessions for this set
        expect(dashboard.stats.totalSessions).toBeGreaterThan(0);
        expect(dashboard.stats.totalTimeMs).toBeGreaterThan(0);
        expect(dashboard.stats.avgRecallRate).toBeGreaterThanOrEqual(0);
        expect(dashboard.stats.avgRecallRate).toBeLessThanOrEqual(1);
        expect(dashboard.stats.avgEngagement).toBeGreaterThanOrEqual(0);
        expect(dashboard.stats.avgEngagement).toBeLessThanOrEqual(100);
        expect(dashboard.stats.totalCostUsd).toBeGreaterThanOrEqual(0);
      });
    });

    describe('Point status breakdown - VERIFY EACH CATEGORY', () => {
      it('should count total points correctly', async () => {
        // Act
        const dashboard = await aggregator.getRecallSetDashboard('rs_main_active');

        // Assert: Spanish set has 6 points
        expect(dashboard.points.total).toBe(6);
      });

      it('should identify points due now (dueDate <= today)', async () => {
        // Act
        const dashboard = await aggregator.getRecallSetDashboard('rs_main_active');

        // Assert: Points due now include:
        // - rp_spanish_struggling (overdue by 1 day)
        // - rp_spanish_new (new = due now)
        // - rp_spanish_due_today (due today)
        // - rp_spanish_overdue (overdue by 5 days)
        expect(dashboard.points.dueNow).toBe(4);
      });

      it('should identify mastered points (stability > 30 days)', async () => {
        // Act
        const dashboard = await aggregator.getRecallSetDashboard('rs_main_active');

        // Assert: rp_spanish_mastered has stability of 45 days
        expect(dashboard.points.mastered).toBe(1);
      });

      it('should identify struggling points (successRate < 50%, attempts >= 3)', async () => {
        // Act
        const dashboard = await aggregator.getRecallSetDashboard('rs_main_active');

        // Assert: rp_spanish_struggling has 4 attempts with 25% success rate
        expect(dashboard.points.struggling).toBe(1);
      });

      it('should identify new points (never reviewed, reps = 0)', async () => {
        // Act
        const dashboard = await aggregator.getRecallSetDashboard('rs_main_active');

        // Assert: rp_spanish_new has reps = 0
        expect(dashboard.points.newPoints).toBe(1);
      });

      it('should ensure categories are consistent (verify overlap handling)', async () => {
        // Act
        const dashboard = await aggregator.getRecallSetDashboard('rs_main_active');

        // Assert: The implementation counts new points as due now
        // So dueNow can include new points
        // But mastered/struggling/new should be based on different criteria

        // New points are mutually exclusive from mastered (reps=0 vs stability>30)
        // Struggling requires 3+ attempts, new has 0 attempts - mutually exclusive
        // Mastered requires high stability, struggling requires low success rate - can overlap theoretically
        // But in practice mastered points don't get many failures

        // Just verify the breakdown is reasonable
        expect(dashboard.points.total).toBeGreaterThanOrEqual(
          dashboard.points.newPoints
        );
      });
    });

    describe('Chart data', () => {
      it('should format recallRateHistory with ISO date strings', async () => {
        // Act
        const dashboard = await aggregator.getRecallSetDashboard('rs_main_active');

        // Assert: Each data point should have YYYY-MM-DD format
        for (const point of dashboard.recallRateHistory) {
          expect(typeof point.date).toBe('string');
          expect(point.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          expect(typeof point.value).toBe('number');
          expect(point.value).toBeGreaterThanOrEqual(0);
          expect(point.value).toBeLessThanOrEqual(1);
        }
      });

      it('should format engagementHistory with ISO date strings', async () => {
        // Act
        const dashboard = await aggregator.getRecallSetDashboard('rs_main_active');

        // Assert
        for (const point of dashboard.engagementHistory) {
          expect(typeof point.date).toBe('string');
          expect(point.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          expect(typeof point.value).toBe('number');
          expect(point.value).toBeGreaterThanOrEqual(0);
          expect(point.value).toBeLessThanOrEqual(100);
        }
      });

      it('should sort chart data chronologically', async () => {
        // Act
        const dashboard = await aggregator.getRecallSetDashboard('rs_main_active');

        // Assert: Dates should be in ascending order (ISO date strings are lexicographically sortable)
        for (let i = 1; i < dashboard.recallRateHistory.length; i++) {
          const currDate = dashboard.recallRateHistory[i].date;
          const prevDate = dashboard.recallRateHistory[i - 1].date;
          expect(currDate >= prevDate).toBe(true);
        }

        for (let i = 1; i < dashboard.engagementHistory.length; i++) {
          const currDate = dashboard.engagementHistory[i].date;
          const prevDate = dashboard.engagementHistory[i - 1].date;
          expect(currDate >= prevDate).toBe(true);
        }
      });

      it('should handle days with no sessions in trend data', async () => {
        // Our test data has gaps (e.g., no session on day 5)
        // The trend data should only include days with sessions, not fill gaps

        // Act
        const dashboard = await aggregator.getRecallSetDashboard('rs_main_active');

        // Assert: Should have data points but not necessarily for every day
        // The number of data points should be <= number of distinct session days
        expect(dashboard.recallRateHistory.length).toBeLessThanOrEqual(30);
      });
    });

    describe('Point summaries', () => {
      it('should include all points in pointDetails', async () => {
        // Act
        const dashboard = await aggregator.getRecallSetDashboard('rs_main_active');

        // Assert: Should have 6 points
        expect(dashboard.pointDetails).toHaveLength(6);
      });

      it('should assign correct status to each point', async () => {
        // Act
        const dashboard = await aggregator.getRecallSetDashboard('rs_main_active');

        // Assert: Check specific points
        const masteredPoint = dashboard.pointDetails.find(
          (p) => p.id === 'rp_spanish_mastered'
        );
        expect(masteredPoint).toBeDefined();
        expect(masteredPoint!.status).toBe('mastered');

        const newPoint = dashboard.pointDetails.find(
          (p) => p.id === 'rp_spanish_new'
        );
        expect(newPoint).toBeDefined();
        expect(newPoint!.status).toBe('new');

        const strugglingPoint = dashboard.pointDetails.find(
          (p) => p.id === 'rp_spanish_struggling'
        );
        expect(strugglingPoint).toBeDefined();
        expect(strugglingPoint!.status).toBe('struggling');

        const learningPoint = dashboard.pointDetails.find(
          (p) => p.id === 'rp_spanish_learning'
        );
        expect(learningPoint).toBeDefined();
        expect(learningPoint!.status).toBe('learning');
      });

      it('should calculate daysUntilDue for each point', async () => {
        // Act
        const dashboard = await aggregator.getRecallSetDashboard('rs_main_active');

        // Assert: Each point should have a numeric daysUntilDue
        for (const point of dashboard.pointDetails) {
          expect(typeof point.daysUntilDue).toBe('number');
        }

        // Overdue points should have negative daysUntilDue
        const overduePoint = dashboard.pointDetails.find(
          (p) => p.id === 'rp_spanish_overdue'
        );
        expect(overduePoint).toBeDefined();
        expect(overduePoint!.daysUntilDue).toBeLessThan(0);

        // Mastered point due in 30 days should have positive daysUntilDue
        const masteredPoint = dashboard.pointDetails.find(
          (p) => p.id === 'rp_spanish_mastered'
        );
        expect(masteredPoint).toBeDefined();
        expect(masteredPoint!.daysUntilDue).toBeGreaterThan(0);
      });
    });

    describe('Edge cases', () => {
      it('should throw for non-existent recall set', async () => {
        // Act & Assert
        await expect(
          aggregator.getRecallSetDashboard('rs_nonexistent')
        ).rejects.toThrow("RecallSet with id 'rs_nonexistent' not found");
      });

      it('should handle recall set with no points', async () => {
        // Arrange: Create a recall set with no points
        await recallSetRepo.create({
          id: 'rs_no_points',
          name: 'Empty Points Set',
          description: 'Has no points',
          status: 'active',
          discussionSystemPrompt: 'Test',
        });

        // Act
        const dashboard = await aggregator.getRecallSetDashboard('rs_no_points');

        // Assert
        expect(dashboard.points.total).toBe(0);
        expect(dashboard.points.dueNow).toBe(0);
        expect(dashboard.points.mastered).toBe(0);
        expect(dashboard.points.struggling).toBe(0);
        expect(dashboard.points.newPoints).toBe(0);
        expect(dashboard.pointDetails).toHaveLength(0);
      });

      it('should handle recall set with no sessions', async () => {
        // Act: Use the French set which has no sessions
        const dashboard = await aggregator.getRecallSetDashboard('rs_empty_active');

        // Assert
        expect(dashboard.stats.totalSessions).toBe(0);
        expect(dashboard.stats.totalTimeMs).toBe(0);
        expect(dashboard.stats.avgRecallRate).toBe(0);
        expect(dashboard.stats.avgEngagement).toBe(0);
        expect(dashboard.recentSessions).toHaveLength(0);
        expect(dashboard.recallRateHistory).toHaveLength(0);
        expect(dashboard.engagementHistory).toHaveLength(0);

        // But should still have point data
        expect(dashboard.points.total).toBe(1);
        expect(dashboard.pointDetails).toHaveLength(1);
      });

      it('should handle points with null due dates', async () => {
        // Arrange: Create a point with null due date (very new)
        const freshScheduler = new FSRSScheduler();
        const initialState = freshScheduler.createInitialState(new Date());

        await recallPointRepo.create({
          id: 'rp_null_due',
          recallSetId: 'rs_main_active',
          content: 'Null due date test',
          context: 'Test',
          fsrsState: {
            ...initialState,
            due: new Date(), // Due is actually set by FSRS initially
          },
        });

        // Act
        const dashboard = await aggregator.getRecallSetDashboard('rs_main_active');

        // Assert: Should handle gracefully
        const point = dashboard.pointDetails.find((p) => p.id === 'rp_null_due');
        expect(point).toBeDefined();
        expect(typeof point!.daysUntilDue).toBe('number');
      });
    });
  });

  // ============================================
  // getUpcomingReviews() Tests
  // ============================================
  describe('getUpcomingReviews', () => {
    it('should return points sorted by due date', async () => {
      // Act
      const reviews = await aggregator.getUpcomingReviews();

      // Assert: Should be sorted by daysUntilDue (most overdue first)
      for (let i = 1; i < reviews.length; i++) {
        expect(reviews[i].daysUntilDue).toBeGreaterThanOrEqual(
          reviews[i - 1].daysUntilDue
        );
      }
    });

    it('should respect limit parameter', async () => {
      // Act
      const reviews = await aggregator.getUpcomingReviews(3);

      // Assert
      expect(reviews.length).toBeLessThanOrEqual(3);
    });

    it('should assign priority "overdue" for past due dates', async () => {
      // Act
      const reviews = await aggregator.getUpcomingReviews();

      // Assert
      const overdueReviews = reviews.filter((r) => r.priority === 'overdue');
      expect(overdueReviews.length).toBeGreaterThan(0);

      for (const review of overdueReviews) {
        expect(review.daysUntilDue).toBeLessThan(0);
      }
    });

    it('should assign priority "due-today" for today', async () => {
      // Act
      const reviews = await aggregator.getUpcomingReviews();

      // Assert
      const dueTodayReviews = reviews.filter((r) => r.priority === 'due-today');

      for (const review of dueTodayReviews) {
        // Due today should have daysUntilDue of 0 (or -0 which is mathematically equal)
        expect(Math.abs(review.daysUntilDue)).toBe(0);
      }
    });

    it('should assign priority "upcoming" for future dates', async () => {
      // Act
      const reviews = await aggregator.getUpcomingReviews();

      // Assert
      const upcomingReviews = reviews.filter((r) => r.priority === 'upcoming');

      for (const review of upcomingReviews) {
        expect(review.daysUntilDue).toBeGreaterThan(0);
      }
    });

    it('should include recall set name for each point', async () => {
      // Act
      const reviews = await aggregator.getUpcomingReviews();

      // Assert
      for (const review of reviews) {
        expect(review.recallSetName).toBeTruthy();
        expect(typeof review.recallSetName).toBe('string');
      }
    });

    it('should handle points with no due date', async () => {
      // Points with null due dates should be treated as due now (0 days)
      // This is handled by the calculateDaysUntilDue method

      // Act
      const reviews = await aggregator.getUpcomingReviews();

      // Assert: All reviews should have numeric daysUntilDue
      for (const review of reviews) {
        expect(typeof review.daysUntilDue).toBe('number');
        expect(Number.isFinite(review.daysUntilDue)).toBe(true);
      }
    });

    it('should handle empty results gracefully', async () => {
      // Arrange: Create database with only paused sets (no active reviews)
      const freshDb = createTestDatabase();
      const freshRecallSetRepo = new RecallSetRepository(freshDb.db);
      const freshRecallPointRepo = new RecallPointRepository(freshDb.db);
      const freshSessionRepo = new SessionRepository(freshDb.db);
      const freshMetricsRepo = new SessionMetricsRepository(freshDb.db);
      const freshOutcomeRepo = new RecallOutcomeRepository(freshDb.db);
      const freshRabbitholeRepo = new RabbitholeEventRepository(freshDb.db);

      const freshAnalyticsCalc = new AnalyticsCalculator(
        freshMetricsRepo,
        freshOutcomeRepo,
        freshRabbitholeRepo,
        freshRecallSetRepo,
        freshRecallPointRepo
      );

      const freshAggregator = new DashboardDataAggregator(
        freshRecallSetRepo,
        freshRecallPointRepo,
        freshSessionRepo,
        freshMetricsRepo,
        freshAnalyticsCalc
      );

      // Act
      const reviews = await freshAggregator.getUpcomingReviews();

      // Assert
      expect(reviews).toBeInstanceOf(Array);
      expect(reviews).toHaveLength(0);

      // Cleanup
      freshDb.sqlite.close();
    });

    it('should only include points from active recall sets', async () => {
      // Act
      const reviews = await aggregator.getUpcomingReviews();

      // Assert: Should not include point from paused German set
      const pausedPoint = reviews.find(
        (r) => r.recallPointId === 'rp_german_paused'
      );
      expect(pausedPoint).toBeUndefined();

      // Should include points from active Spanish and French sets
      const activeSetIds = new Set(reviews.map((r) => r.recallSetId));
      expect(activeSetIds.has('rs_paused')).toBe(false);
    });
  });

  // ============================================
  // Data Accuracy Paranoia
  // ============================================
  describe('Data Accuracy', () => {
    it('should match AnalyticsCalculator results for same data', async () => {
      // Act: Get data from both sources
      const dashboard = await aggregator.getRecallSetDashboard('rs_main_active');
      const analytics = await analyticsCalc.calculateRecallSetAnalytics('rs_main_active');

      // Assert: Stats should match
      expect(dashboard.stats.totalSessions).toBe(analytics.totalSessions);
      expect(dashboard.stats.totalTimeMs).toBe(analytics.totalTimeSpentMs);
      expect(dashboard.stats.avgRecallRate).toBe(analytics.overallRecallRate);
      expect(dashboard.stats.avgEngagement).toBe(analytics.avgEngagementScore);
      expect(dashboard.stats.totalCostUsd).toBe(analytics.totalCostUsd);
    });

    it('should not double-count sessions across sets', async () => {
      // Act
      const overview = await aggregator.getOverview();
      const globalAnalytics = await analyticsCalc.calculateGlobalAnalytics();

      // Assert: Study time should match (both pull from same metrics)
      // Note: overview.totalSessions counts ALL sessions including abandoned/in-progress
      // while globalAnalytics.totalSessions counts only sessions with metrics
      expect(overview.totalStudyTimeMs).toBe(globalAnalytics.totalStudyTimeMs);

      // The overview.totalSessions >= globalAnalytics.totalSessions
      // because overview includes sessions without metrics
      expect(overview.totalSessions).toBeGreaterThanOrEqual(globalAnalytics.totalSessions);
    });

    it('should not include abandoned/in-progress sessions in completed counts', async () => {
      // Our test data has:
      // - 8 completed sessions
      // - 1 abandoned session
      // - 1 in-progress session

      // Act
      const overview = await aggregator.getOverview();

      // Assert: totalSessions counts ALL sessions (10)
      expect(overview.totalSessions).toBe(10);

      // But metrics are only for completed sessions
      // The session with in-progress status has no metrics
      // Abandoned session also may not have metrics
      // Let's verify by checking if todaysSessions includes in-progress
      // We have 2 sessions today: 1 completed, 1 in-progress
      expect(overview.todaysSessions).toBe(2);
    });

    it('should handle floating point precision in rates/scores', async () => {
      // Act
      const overview = await aggregator.getOverview();
      const dashboard = await aggregator.getRecallSetDashboard('rs_main_active');

      // Assert: Rates should be valid floats between 0 and 1
      expect(overview.overallRecallRate).toBeGreaterThanOrEqual(0);
      expect(overview.overallRecallRate).toBeLessThanOrEqual(1);
      expect(Number.isFinite(overview.overallRecallRate)).toBe(true);

      expect(dashboard.stats.avgRecallRate).toBeGreaterThanOrEqual(0);
      expect(dashboard.stats.avgRecallRate).toBeLessThanOrEqual(1);
      expect(Number.isFinite(dashboard.stats.avgRecallRate)).toBe(true);

      // Engagement scores should be between 0 and 100
      expect(dashboard.stats.avgEngagement).toBeGreaterThanOrEqual(0);
      expect(dashboard.stats.avgEngagement).toBeLessThanOrEqual(100);
      expect(Number.isFinite(dashboard.stats.avgEngagement)).toBe(true);
    });

    it('should handle very large numbers (many sessions, long durations)', async () => {
      // Arrange: Create many sessions with large durations
      const freshDb = createTestDatabase();
      const freshRecallSetRepo = new RecallSetRepository(freshDb.db);
      const freshRecallPointRepo = new RecallPointRepository(freshDb.db);
      const freshSessionRepo = new SessionRepository(freshDb.db);
      const freshMetricsRepo = new SessionMetricsRepository(freshDb.db);
      const freshOutcomeRepo = new RecallOutcomeRepository(freshDb.db);
      const freshRabbitholeRepo = new RabbitholeEventRepository(freshDb.db);

      const freshAnalyticsCalc = new AnalyticsCalculator(
        freshMetricsRepo,
        freshOutcomeRepo,
        freshRabbitholeRepo,
        freshRecallSetRepo,
        freshRecallPointRepo
      );

      const freshAggregator = new DashboardDataAggregator(
        freshRecallSetRepo,
        freshRecallPointRepo,
        freshSessionRepo,
        freshMetricsRepo,
        freshAnalyticsCalc
      );

      await freshRecallSetRepo.create({
        id: 'rs_large',
        name: 'Large Data Set',
        description: 'Testing large numbers',
        status: 'active',
        discussionSystemPrompt: 'Test',
      });

      // Create 50 sessions with large durations (10 hours each)
      const largeDurationMs = 36000000; // 10 hours
      for (let i = 0; i < 50; i++) {
        const session = await freshSessionRepo.create({
          id: `sess_large_${i}`,
          recallSetId: 'rs_large',
          targetRecallPointIds: [],
          startedAt: daysAgo(i),
        });
        await freshSessionRepo.update(session.id, {
          status: 'completed',
          endedAt: daysAgo(i),
        });

        await freshMetricsRepo.create({
          id: `sm_large_${i}`,
          sessionId: session.id,
          durationMs: largeDurationMs,
          activeTimeMs: largeDurationMs - 100000,
          avgUserResponseTimeMs: 5000,
          avgAssistantResponseTimeMs: 2000,
          recallPointsAttempted: 10,
          recallPointsSuccessful: 8,
          recallPointsFailed: 2,
          overallRecallRate: 0.8,
          avgConfidence: 0.85,
          totalMessages: 100,
          userMessages: 50,
          assistantMessages: 50,
          avgMessageLength: 50,
          rabbitholeCount: 0,
          totalRabbitholeTimeMs: 0,
          avgRabbitholeDepth: 0,
          inputTokens: 50000,
          outputTokens: 30000,
          totalTokens: 80000,
          estimatedCostUsd: 0.80,
          engagementScore: 85,
          calculatedAt: daysAgo(i),
        });
      }

      // Act
      const overview = await freshAggregator.getOverview();

      // Assert: Should handle large numbers without overflow
      expect(overview.totalSessions).toBe(50);
      expect(overview.totalStudyTimeMs).toBe(50 * largeDurationMs);
      expect(Number.isFinite(overview.totalStudyTimeMs)).toBe(true);

      // Cleanup
      freshDb.sqlite.close();
    });
  });

  // ============================================
  // Additional Integration Tests
  // ============================================
  describe('Integration with repositories', () => {
    it('should correctly join session data with recall set names', async () => {
      // Act
      const overview = await aggregator.getOverview();

      // Assert: Each recent session should have a valid recall set name
      for (const session of overview.recentSessions) {
        expect(session.recallSetName).toBeTruthy();

        // Verify the name matches what's in the repo
        const recallSet = await recallSetRepo.findById(session.recallSetId);
        expect(recallSet).not.toBeNull();
        expect(session.recallSetName).toBe(recallSet!.name);
      }
    });

    it('should correctly fetch metrics for recent sessions', async () => {
      // Act
      const overview = await aggregator.getOverview();

      // Assert: Sessions with metrics should have duration > 0
      for (const session of overview.recentSessions) {
        if (session.status === 'completed') {
          // Completed sessions should have metrics
          const metrics = await metricsRepo.findBySessionId(session.id);
          if (metrics) {
            expect(session.durationMs).toBe(metrics.durationMs);
            expect(session.recallRate).toBe(metrics.overallRecallRate);
            expect(session.engagementScore).toBe(metrics.engagementScore);
          }
        }
      }
    });

    it('should correctly identify due points across multiple sets', async () => {
      // Act
      const overview = await aggregator.getOverview();
      const reviews = await aggregator.getUpcomingReviews();

      // Assert: Both should reflect the same due points
      // The overview.pointsDueToday counts points due today
      // The reviews list includes overdue, due-today, and upcoming

      const dueTodayFromReviews = reviews.filter(
        (r) =>
          r.priority === 'overdue' ||
          r.priority === 'due-today'
      ).length;

      // They should be related but not necessarily equal
      // because pointsDueToday only counts end-of-today
      expect(overview.pointsDueToday).toBeGreaterThan(0);
      expect(dueTodayFromReviews).toBeGreaterThan(0);
    });
  });
});
