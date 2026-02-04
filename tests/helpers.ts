/**
 * Test Helpers Module
 *
 * Provides utility functions for creating test data, fixtures, and
 * common test patterns. These helpers reduce boilerplate in tests and
 * ensure consistent test data across the test suite.
 */

import type { TestRepositories } from './setup';
import { FSRSScheduler } from '../src/core/fsrs';
import type { RecallSet, RecallPoint, Session, FSRSState } from '../src/core/models';

// ============================================================================
// Date Utilities
// ============================================================================

/**
 * Returns today's date at midnight (00:00:00).
 * Useful for consistent date comparisons in tests.
 */
export function today(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * Creates a date by subtracting days from today at midnight.
 *
 * @param days - Number of days ago
 * @returns Date at midnight N days ago
 */
export function daysAgo(days: number): Date {
  const date = today();
  date.setDate(date.getDate() - days);
  return date;
}

/**
 * Creates a date by adding days to today at midnight.
 *
 * @param days - Number of days in the future
 * @returns Date at midnight N days from now
 */
export function daysFromNow(days: number): Date {
  const date = today();
  date.setDate(date.getDate() + days);
  return date;
}

// ============================================================================
// ID Generators
// ============================================================================

/**
 * Generates a unique recall set ID with prefix.
 */
export function generateRecallSetId(): string {
  return `rs_${crypto.randomUUID()}`;
}

/**
 * Generates a unique recall point ID with prefix.
 */
export function generateRecallPointId(): string {
  return `rp_${crypto.randomUUID()}`;
}

/**
 * Generates a unique session ID with prefix.
 */
export function generateSessionId(): string {
  return `sess_${crypto.randomUUID()}`;
}

/**
 * Generates a unique session metrics ID with prefix.
 */
export function generateMetricsId(): string {
  return `sm_${crypto.randomUUID()}`;
}

/**
 * Generates a unique recall outcome ID with prefix.
 */
export function generateOutcomeId(): string {
  return `ro_${crypto.randomUUID()}`;
}

// ============================================================================
// Test Data Factories
// ============================================================================

/**
 * Options for creating a test recall set.
 */
export interface CreateRecallSetOptions {
  id?: string;
  name?: string;
  description?: string;
  discussionSystemPrompt?: string;
  status?: 'active' | 'paused' | 'archived';
}

/**
 * Creates a test recall set with sensible defaults.
 *
 * @param repos - Test repositories
 * @param options - Optional overrides for default values
 * @returns The created recall set
 */
export async function createTestRecallSet(
  repos: TestRepositories,
  options: CreateRecallSetOptions = {}
): Promise<RecallSet> {
  const defaults = {
    id: generateRecallSetId(),
    name: 'Test Recall Set',
    description: 'A test recall set for unit/integration testing',
    discussionSystemPrompt: 'You are a helpful tutor for testing purposes.',
    status: 'active' as const,
  };

  return repos.recallSetRepo.create({ ...defaults, ...options });
}

/**
 * Options for creating a test recall point.
 */
export interface CreateRecallPointOptions {
  id?: string;
  recallSetId: string;
  content?: string;
  context?: string;
  fsrsState?: Partial<FSRSState>;
}

/**
 * Creates a test recall point with sensible defaults.
 *
 * @param repos - Test repositories
 * @param options - Configuration including required recallSetId
 * @returns The created recall point
 */
export async function createTestRecallPoint(
  repos: TestRepositories,
  options: CreateRecallPointOptions
): Promise<RecallPoint> {
  const scheduler = new FSRSScheduler();
  const defaultFsrsState = scheduler.createInitialState(new Date());

  const defaults = {
    id: generateRecallPointId(),
    content: 'Test content for recall point that is long enough',
    context: 'Test context providing background for the recall point',
  };

  const fsrsState = options.fsrsState
    ? { ...defaultFsrsState, ...options.fsrsState }
    : defaultFsrsState;

  return repos.recallPointRepo.create({
    ...defaults,
    ...options,
    fsrsState,
  });
}

/**
 * Options for creating a test session.
 */
export interface CreateSessionOptions {
  id?: string;
  recallSetId: string;
  targetRecallPointIds?: string[];
  status?: 'in_progress' | 'completed' | 'abandoned';
  startedAt?: Date;
  endedAt?: Date | null;
}

/**
 * Creates a test session with sensible defaults.
 *
 * @param repos - Test repositories
 * @param options - Configuration including required recallSetId
 * @returns The created session
 */
export async function createTestSession(
  repos: TestRepositories,
  options: CreateSessionOptions
): Promise<Session> {
  const defaults = {
    id: generateSessionId(),
    targetRecallPointIds: [] as string[],
    startedAt: new Date(),
  };

  const session = await repos.sessionRepo.create({
    ...defaults,
    ...options,
  });

  // Update status if not in_progress (default)
  if (options.status && options.status !== 'in_progress') {
    await repos.sessionRepo.update(session.id, {
      status: options.status,
      endedAt: options.endedAt ?? new Date(),
    });
    return { ...session, status: options.status, endedAt: options.endedAt ?? new Date() };
  }

  return session;
}

/**
 * Options for creating test session metrics.
 */
export interface CreateSessionMetricsOptions {
  sessionId: string;
  durationMs?: number;
  activeTimeMs?: number;
  recallPointsAttempted?: number;
  recallPointsSuccessful?: number;
  recallPointsFailed?: number;
  overallRecallRate?: number;
  avgConfidence?: number;
  totalMessages?: number;
  engagementScore?: number;
  estimatedCostUsd?: number;
}

/**
 * Creates test session metrics with sensible defaults.
 *
 * @param repos - Test repositories
 * @param options - Configuration including required sessionId
 * @returns The created session metrics
 */
export async function createTestSessionMetrics(
  repos: TestRepositories,
  options: CreateSessionMetricsOptions
): Promise<void> {
  const defaults = {
    id: generateMetricsId(),
    durationMs: 300000, // 5 minutes
    activeTimeMs: 280000,
    avgUserResponseTimeMs: 5000,
    avgAssistantResponseTimeMs: 2000,
    recallPointsAttempted: 3,
    recallPointsSuccessful: 2,
    recallPointsFailed: 1,
    overallRecallRate: 0.67,
    avgConfidence: 0.75,
    totalMessages: 12,
    userMessages: 6,
    assistantMessages: 6,
    avgMessageLength: 50,
    rabbitholeCount: 0,
    totalRabbitholeTimeMs: 0,
    avgRabbitholeDepth: 0,
    inputTokens: 1000,
    outputTokens: 600,
    totalTokens: 1600,
    estimatedCostUsd: 0.016,
    engagementScore: 75,
    calculatedAt: new Date(),
  };

  await repos.metricsRepo.create({
    ...defaults,
    ...options,
  });
}

/**
 * Creates a test recall outcome.
 *
 * @param repos - Test repositories
 * @param options - Configuration including sessionId and recallPointId
 * @returns The created recall outcome
 */
export async function createTestRecallOutcome(
  repos: TestRepositories,
  options: {
    sessionId: string;
    recallPointId: string;
    success?: boolean;
    confidence?: number;
    rating?: 'forgot' | 'hard' | 'good' | 'easy';
    messageIndexStart?: number;
    messageIndexEnd?: number;
  }
): Promise<void> {
  const defaults = {
    id: generateOutcomeId(),
    success: true,
    confidence: 0.85,
    rating: 'good' as const,
    reasoning: 'Test evaluation result',
    messageIndexStart: 0,
    messageIndexEnd: 5,
    timeSpentMs: 60000,
    createdAt: new Date(),
  };

  await repos.outcomeRepo.create({
    ...defaults,
    ...options,
  });
}

// ============================================================================
// Complex Test Data Fixtures
// ============================================================================

/**
 * Result from seeding comprehensive test data.
 */
export interface TestDataFixture {
  recallSets: RecallSet[];
  recallPoints: Map<string, RecallPoint[]>;
  sessions: Session[];
}

/**
 * Seeds comprehensive test data for dashboard and analytics tests.
 * Creates:
 * - 2 active recall sets with points
 * - 1 paused recall set
 * - Multiple sessions with varying statuses and dates
 * - Session metrics for completed sessions
 *
 * @param repos - Test repositories
 * @returns Seeded test data fixture
 */
export async function seedDashboardTestData(
  repos: TestRepositories
): Promise<TestDataFixture> {
  const scheduler = new FSRSScheduler();
  const now = new Date();
  const initialState = scheduler.createInitialState(now);

  // =========================================================================
  // Recall Set 1: Active with sessions
  // =========================================================================
  const recallSet1 = await repos.recallSetRepo.create({
    id: 'rs_test_active_1',
    name: 'JavaScript Fundamentals',
    description: 'Core JavaScript concepts',
    status: 'active',
    discussionSystemPrompt: 'Help the user learn JavaScript concepts.',
  });

  const points1: RecallPoint[] = [];

  // Point 1: Due today
  points1.push(
    await repos.recallPointRepo.create({
      id: 'rp_js_due_today',
      recallSetId: recallSet1.id,
      content: 'Closures capture variables from outer scope',
      context: 'Understanding JavaScript closures',
      fsrsState: { ...initialState, due: today(), state: 'review', reps: 2 },
    })
  );

  // Point 2: Overdue
  points1.push(
    await repos.recallPointRepo.create({
      id: 'rp_js_overdue',
      recallSetId: recallSet1.id,
      content: 'Promises handle async operations',
      context: 'Asynchronous JavaScript programming',
      fsrsState: { ...initialState, due: daysAgo(3), state: 'review', reps: 1 },
    })
  );

  // Point 3: New (never reviewed)
  points1.push(
    await repos.recallPointRepo.create({
      id: 'rp_js_new',
      recallSetId: recallSet1.id,
      content: 'Arrow functions have lexical this binding',
      context: 'ES6 arrow function syntax and behavior',
      fsrsState: { ...initialState, due: now, state: 'new', reps: 0 },
    })
  );

  // Point 4: Upcoming (due in future)
  points1.push(
    await repos.recallPointRepo.create({
      id: 'rp_js_upcoming',
      recallSetId: recallSet1.id,
      content: 'Event loop manages async execution',
      context: 'JavaScript runtime and event loop',
      fsrsState: { ...initialState, due: daysFromNow(5), state: 'review', reps: 5 },
    })
  );

  // =========================================================================
  // Recall Set 2: Active without sessions
  // =========================================================================
  const recallSet2 = await repos.recallSetRepo.create({
    id: 'rs_test_active_2',
    name: 'Python Basics',
    description: 'Basic Python programming',
    status: 'active',
    discussionSystemPrompt: 'Help the user learn Python basics.',
  });

  const points2: RecallPoint[] = [];
  points2.push(
    await repos.recallPointRepo.create({
      id: 'rp_python_new',
      recallSetId: recallSet2.id,
      content: 'Python uses indentation for code blocks',
      context: 'Python syntax fundamentals',
      fsrsState: { ...initialState, due: now, state: 'new', reps: 0 },
    })
  );

  // =========================================================================
  // Recall Set 3: Paused
  // =========================================================================
  const recallSet3 = await repos.recallSetRepo.create({
    id: 'rs_test_paused',
    name: 'Rust Programming',
    description: 'Rust language concepts',
    status: 'paused',
    discussionSystemPrompt: 'Help the user learn Rust.',
  });

  const points3: RecallPoint[] = [];
  points3.push(
    await repos.recallPointRepo.create({
      id: 'rp_rust_paused',
      recallSetId: recallSet3.id,
      content: 'Rust ownership ensures memory safety',
      context: 'Rust memory management',
      fsrsState: { ...initialState, due: daysAgo(2), state: 'review', reps: 1 },
    })
  );

  // =========================================================================
  // Sessions for recall set 1
  // =========================================================================
  const sessions: Session[] = [];

  // Session 1: Completed today
  const session1 = await repos.sessionRepo.create({
    id: 'sess_test_today',
    recallSetId: recallSet1.id,
    targetRecallPointIds: ['rp_js_due_today'],
    startedAt: today(),
  });
  await repos.sessionRepo.update(session1.id, {
    status: 'completed',
    endedAt: new Date(today().getTime() + 300000),
  });
  sessions.push({ ...session1, status: 'completed', endedAt: new Date(today().getTime() + 300000) });

  // Add metrics for completed session
  await repos.metricsRepo.create({
    id: 'sm_test_today',
    sessionId: session1.id,
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
    engagementScore: 85,
    calculatedAt: today(),
  });

  // Session 2: Completed yesterday
  const session2 = await repos.sessionRepo.create({
    id: 'sess_test_yesterday',
    recallSetId: recallSet1.id,
    targetRecallPointIds: ['rp_js_overdue'],
    startedAt: daysAgo(1),
  });
  await repos.sessionRepo.update(session2.id, {
    status: 'completed',
    endedAt: daysAgo(1),
  });
  sessions.push({ ...session2, status: 'completed', endedAt: daysAgo(1) });

  await repos.metricsRepo.create({
    id: 'sm_test_yesterday',
    sessionId: session2.id,
    durationMs: 420000,
    activeTimeMs: 400000,
    avgUserResponseTimeMs: 6000,
    avgAssistantResponseTimeMs: 2500,
    recallPointsAttempted: 1,
    recallPointsSuccessful: 1,
    recallPointsFailed: 0,
    overallRecallRate: 1.0,
    avgConfidence: 0.85,
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
    engagementScore: 80,
    calculatedAt: daysAgo(1),
  });

  // Session 3: Abandoned
  const session3 = await repos.sessionRepo.create({
    id: 'sess_test_abandoned',
    recallSetId: recallSet1.id,
    targetRecallPointIds: ['rp_js_new'],
    startedAt: daysAgo(2),
  });
  await repos.sessionRepo.update(session3.id, {
    status: 'abandoned',
    endedAt: daysAgo(2),
  });
  sessions.push({ ...session3, status: 'abandoned', endedAt: daysAgo(2) });

  // Session 4: In progress
  const session4 = await repos.sessionRepo.create({
    id: 'sess_test_in_progress',
    recallSetId: recallSet1.id,
    targetRecallPointIds: ['rp_js_due_today'],
    startedAt: today(),
  });
  sessions.push({ ...session4, status: 'in_progress', endedAt: null });

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

// ============================================================================
// Response Assertion Helpers
// ============================================================================

/**
 * Extracts JSON response from a Hono Response object.
 *
 * @param response - Hono Response object
 * @returns Parsed JSON body
 */
export async function getJsonResponse<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

/**
 * Asserts that a response is a success response.
 *
 * @param response - API response object
 * @throws Error if response is not successful
 */
export function assertSuccess(response: { success: boolean }): void {
  if (!response.success) {
    throw new Error(`Expected success response but got: ${JSON.stringify(response)}`);
  }
}

/**
 * Asserts that a response is an error response with specific code.
 *
 * @param response - API response object
 * @param expectedCode - Expected error code
 * @throws Error if response doesn't match
 */
export function assertError(
  response: { success: boolean; error?: { code: string } },
  expectedCode: string
): void {
  if (response.success) {
    throw new Error(`Expected error response but got success: ${JSON.stringify(response)}`);
  }
  if (response.error?.code !== expectedCode) {
    throw new Error(
      `Expected error code '${expectedCode}' but got '${response.error?.code}': ${JSON.stringify(response)}`
    );
  }
}
