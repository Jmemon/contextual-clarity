/**
 * Test Setup Module
 *
 * Provides utilities for creating isolated test environments with in-memory
 * databases, running migrations, and cleaning up after tests. This module
 * is used across all integration and E2E tests to ensure test isolation.
 *
 * Features:
 * - In-memory SQLite database creation with migrations
 * - Test database cleanup utilities
 * - Hono app creation with test database injection
 * - Test isolation helpers
 */

import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { Database } from 'bun:sqlite';
import { resolve } from 'path';
import { Hono } from 'hono';
import * as schema from '../src/storage/schema';
import {
  RecallSetRepository,
  RecallPointRepository,
  SessionRepository,
  SessionMessageRepository,
} from '../src/storage/repositories';
import { SessionMetricsRepository } from '../src/storage/repositories/session-metrics.repository';
import { RecallOutcomeRepository } from '../src/storage/repositories/recall-outcome.repository';
import { RabbitholeEventRepository } from '../src/storage/repositories/rabbithole-event.repository';
import { AnalyticsCalculator } from '../src/core/analytics/analytics-calculator';
import { DashboardDataAggregator } from '../src/core/dashboard/dashboard-data';
import { FSRSScheduler } from '../src/core/fsrs';
import { success, notFound, badRequest, internalError } from '../src/api/utils/response';
import type { AppDatabase } from '../src/storage/db';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Container for test database resources.
 * Includes the Drizzle ORM instance and raw SQLite connection for cleanup.
 */
export interface TestDatabaseContext {
  /** Drizzle ORM database instance */
  db: AppDatabase;
  /** Raw SQLite database connection for cleanup */
  sqlite: Database;
}

/**
 * Container for all test repositories.
 * Provides typed access to all repositories with a test database.
 */
export interface TestRepositories {
  recallSetRepo: RecallSetRepository;
  recallPointRepo: RecallPointRepository;
  sessionRepo: SessionRepository;
  messageRepo: SessionMessageRepository;
  metricsRepo: SessionMetricsRepository;
  outcomeRepo: RecallOutcomeRepository;
  rabbitholeRepo: RabbitholeEventRepository;
}

/**
 * Complete test context including database, repositories, and services.
 */
export interface TestContext {
  db: AppDatabase;
  sqlite: Database;
  repos: TestRepositories;
  scheduler: FSRSScheduler;
  analyticsCalc: AnalyticsCalculator;
  dashboardAggregator: DashboardDataAggregator;
}

// ============================================================================
// Database Setup Functions
// ============================================================================

/**
 * Creates a fresh in-memory SQLite database with all migrations applied.
 *
 * This function:
 * 1. Creates a new in-memory SQLite database
 * 2. Enables foreign key constraints
 * 3. Applies all Drizzle migrations
 *
 * @returns TestDatabaseContext with db and sqlite connection
 *
 * @example
 * ```typescript
 * const { db, sqlite } = createTestDatabase();
 * // Use db for test operations
 * sqlite.close(); // Cleanup when done
 * ```
 */
export function createTestDatabase(): TestDatabaseContext {
  // Create in-memory SQLite database
  const sqlite = new Database(':memory:');

  // Enable foreign key constraints (disabled by default in SQLite)
  sqlite.run('PRAGMA foreign_keys = ON');

  // Create Drizzle ORM wrapper with schema
  const db = drizzle(sqlite, { schema });

  // Apply migrations from the drizzle folder
  const migrationsFolder = resolve(import.meta.dir, '../drizzle');
  migrate(db, { migrationsFolder });

  return { db, sqlite };
}

/**
 * Creates all repository instances with a test database.
 *
 * @param db - The test database instance
 * @returns Object containing all repository instances
 */
export function createTestRepositories(db: AppDatabase): TestRepositories {
  return {
    recallSetRepo: new RecallSetRepository(db),
    recallPointRepo: new RecallPointRepository(db),
    sessionRepo: new SessionRepository(db),
    messageRepo: new SessionMessageRepository(db),
    metricsRepo: new SessionMetricsRepository(db),
    outcomeRepo: new RecallOutcomeRepository(db),
    rabbitholeRepo: new RabbitholeEventRepository(db),
  };
}

/**
 * Creates a complete test context with database, repositories, and services.
 *
 * @returns Complete TestContext ready for testing
 */
export function createTestContext(): TestContext {
  const { db, sqlite } = createTestDatabase();
  const repos = createTestRepositories(db);
  const scheduler = new FSRSScheduler();

  const analyticsCalc = new AnalyticsCalculator(
    repos.metricsRepo,
    repos.outcomeRepo,
    repos.rabbitholeRepo,
    repos.recallSetRepo,
    repos.recallPointRepo
  );

  const dashboardAggregator = new DashboardDataAggregator(
    repos.recallSetRepo,
    repos.recallPointRepo,
    repos.sessionRepo,
    repos.metricsRepo,
    analyticsCalc
  );

  return {
    db,
    sqlite,
    repos,
    scheduler,
    analyticsCalc,
    dashboardAggregator,
  };
}

/**
 * Cleans up a test database context.
 *
 * @param context - The test database context to clean up
 */
export function cleanupTestDatabase(context: TestDatabaseContext): void {
  if (context.sqlite) {
    context.sqlite.close();
  }
}

// ============================================================================
// Test App Creation
// ============================================================================

/**
 * Creates a test Hono app with API routes using the provided test context.
 * This allows testing the API layer with an isolated test database.
 *
 * @param context - The test context with database and repositories
 * @returns Configured Hono app for testing
 */
export function createTestApp(context: TestContext): Hono {
  const app = new Hono();
  const { repos, dashboardAggregator, analyticsCalc } = context;

  // =========================================================================
  // Dashboard Routes
  // =========================================================================

  app.get('/api/dashboard/overview', async (c) => {
    try {
      const overview = await dashboardAggregator.getOverview();
      return success(c, overview);
    } catch (err) {
      console.error('[Dashboard] Error fetching overview:', err);
      return internalError(
        c,
        'Failed to fetch dashboard overview',
        err instanceof Error ? err.message : undefined
      );
    }
  });

  app.get('/api/dashboard/recent-sessions', async (c) => {
    const limitParam = c.req.query('limit');
    let limit = 5;

    if (limitParam) {
      const parsed = parseInt(limitParam, 10);
      if (isNaN(parsed)) {
        return badRequest(c, `Invalid limit parameter: '${limitParam}' is not a number`);
      }
      if (parsed <= 0) {
        return badRequest(c, 'Limit must be a positive number');
      }
      limit = Math.min(parsed, 50);
    }

    try {
      const overview = await dashboardAggregator.getOverview();
      const recentSessions = overview.recentSessions.slice(0, limit);

      return success(c, {
        sessions: recentSessions,
        total: overview.totalSessions,
        limit,
      });
    } catch (err) {
      console.error('[Dashboard] Error fetching recent sessions:', err);
      return internalError(
        c,
        'Failed to fetch recent sessions',
        err instanceof Error ? err.message : undefined
      );
    }
  });

  app.get('/api/dashboard/upcoming-reviews', async (c) => {
    const daysParam = c.req.query('days');
    let days = 7;

    if (daysParam) {
      const parsed = parseInt(daysParam, 10);
      if (isNaN(parsed)) {
        return badRequest(c, `Invalid days parameter: '${daysParam}' is not a number`);
      }
      if (parsed <= 0) {
        return badRequest(c, 'Days must be a positive number');
      }
      days = Math.min(parsed, 90);
    }

    try {
      const allUpcomingReviews = await dashboardAggregator.getUpcomingReviews();
      const filteredReviews = allUpcomingReviews.filter(
        (review) => review.daysUntilDue <= days
      );

      const overdue = filteredReviews.filter((r) => r.priority === 'overdue');
      const dueToday = filteredReviews.filter((r) => r.priority === 'due-today');
      const upcoming = filteredReviews.filter((r) => r.priority === 'upcoming');

      return success(c, {
        reviews: filteredReviews,
        summary: {
          total: filteredReviews.length,
          overdue: overdue.length,
          dueToday: dueToday.length,
          upcoming: upcoming.length,
        },
        days,
      });
    } catch (err) {
      console.error('[Dashboard] Error fetching upcoming reviews:', err);
      return internalError(
        c,
        'Failed to fetch upcoming reviews',
        err instanceof Error ? err.message : undefined
      );
    }
  });

  // =========================================================================
  // Recall Sets Routes
  // =========================================================================

  app.get('/api/recall-sets', async (c) => {
    const sets = await repos.recallSetRepo.findAll();

    const setsWithSummary = await Promise.all(
      sets.map(async (set) => {
        const points = await repos.recallPointRepo.findByRecallSetId(set.id);
        const duePoints = await repos.recallPointRepo.findDuePoints(set.id);
        const newPoints = points.filter((p) => p.fsrsState.state === 'new');

        return {
          ...set,
          summary: {
            totalPoints: points.length,
            duePoints: duePoints.length,
            newPoints: newPoints.length,
          },
        };
      })
    );

    return success(c, setsWithSummary);
  });

  app.post('/api/recall-sets', async (c) => {
    const body = await c.req.json();

    // Basic validation
    if (!body.name || typeof body.name !== 'string' || body.name.length === 0) {
      return badRequest(c, 'Name is required');
    }
    if (body.name.length > 100) {
      return badRequest(c, 'Name must be 100 characters or less');
    }
    if (!body.discussionSystemPrompt || body.discussionSystemPrompt.length < 10) {
      return badRequest(c, 'System prompt must be at least 10 characters');
    }

    const newSet = await repos.recallSetRepo.create({
      id: `rs_${crypto.randomUUID()}`,
      name: body.name,
      description: body.description || '',
      discussionSystemPrompt: body.discussionSystemPrompt,
      status: 'active',
    });

    return success(c, newSet, 201);
  });

  app.get('/api/recall-sets/:id', async (c) => {
    const id = c.req.param('id');
    const set = await repos.recallSetRepo.findById(id);

    if (!set) {
      return notFound(c, 'RecallSet', id);
    }

    const points = await repos.recallPointRepo.findByRecallSetId(set.id);
    const duePoints = await repos.recallPointRepo.findDuePoints(set.id);
    const newPoints = points.filter((p) => p.fsrsState.state === 'new');

    return success(c, {
      ...set,
      summary: {
        totalPoints: points.length,
        duePoints: duePoints.length,
        newPoints: newPoints.length,
      },
    });
  });

  app.patch('/api/recall-sets/:id', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json();

    const existing = await repos.recallSetRepo.findById(id);
    if (!existing) {
      return notFound(c, 'RecallSet', id);
    }

    if (
      body.name === undefined &&
      body.description === undefined &&
      body.discussionSystemPrompt === undefined &&
      body.status === undefined
    ) {
      return badRequest(c, 'No fields provided for update');
    }

    const updatedSet = await repos.recallSetRepo.update(id, body);
    return success(c, updatedSet);
  });

  app.delete('/api/recall-sets/:id', async (c) => {
    const id = c.req.param('id');

    const existing = await repos.recallSetRepo.findById(id);
    if (!existing) {
      return notFound(c, 'RecallSet', id);
    }

    const archivedSet = await repos.recallSetRepo.update(id, { status: 'archived' });
    return success(c, archivedSet);
  });

  // Points routes
  app.get('/api/recall-sets/:id/points', async (c) => {
    const setId = c.req.param('id');

    const set = await repos.recallSetRepo.findById(setId);
    if (!set) {
      return notFound(c, 'RecallSet', setId);
    }

    const points = await repos.recallPointRepo.findByRecallSetId(setId);
    return success(c, points);
  });

  app.post('/api/recall-sets/:id/points', async (c) => {
    const setId = c.req.param('id');
    const body = await c.req.json();

    const set = await repos.recallSetRepo.findById(setId);
    if (!set) {
      return notFound(c, 'RecallSet', setId);
    }

    // Basic validation
    if (!body.content || body.content.length < 10) {
      return badRequest(c, 'Content must be at least 10 characters');
    }
    if (!body.context || body.context.length < 10) {
      return badRequest(c, 'Context must be at least 10 characters');
    }

    const scheduler = new FSRSScheduler();
    const initialFsrsState = scheduler.createInitialState();

    const newPoint = await repos.recallPointRepo.create({
      id: `rp_${crypto.randomUUID()}`,
      recallSetId: setId,
      content: body.content,
      context: body.context,
      fsrsState: initialFsrsState,
    });

    return success(c, newPoint, 201);
  });

  app.patch('/api/recall-sets/:id/points/:pointId', async (c) => {
    const setId = c.req.param('id');
    const pointId = c.req.param('pointId');
    const body = await c.req.json();

    const set = await repos.recallSetRepo.findById(setId);
    if (!set) {
      return notFound(c, 'RecallSet', setId);
    }

    const existingPoint = await repos.recallPointRepo.findById(pointId);
    if (!existingPoint || existingPoint.recallSetId !== setId) {
      return notFound(c, 'RecallPoint', pointId);
    }

    if (body.content === undefined && body.context === undefined) {
      return badRequest(c, 'No fields provided for update');
    }

    const updatedPoint = await repos.recallPointRepo.update(pointId, body);
    return success(c, updatedPoint);
  });

  app.delete('/api/recall-sets/:id/points/:pointId', async (c) => {
    const setId = c.req.param('id');
    const pointId = c.req.param('pointId');

    const set = await repos.recallSetRepo.findById(setId);
    if (!set) {
      return notFound(c, 'RecallSet', setId);
    }

    const existingPoint = await repos.recallPointRepo.findById(pointId);
    if (!existingPoint || existingPoint.recallSetId !== setId) {
      return notFound(c, 'RecallPoint', pointId);
    }

    await repos.recallPointRepo.delete(pointId);
    return success(c, { message: 'Recall point deleted successfully', id: pointId });
  });

  // =========================================================================
  // Sessions Routes
  // =========================================================================

  app.get('/api/sessions', async (c) => {
    const query = c.req.query();
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10)));
    const offset = Math.max(0, parseInt(query.offset || '0', 10));

    let allSessions = await repos.sessionRepo.findAll();

    // Apply filters
    if (query.recallSetId) {
      allSessions = allSessions.filter((s) => s.recallSetId === query.recallSetId);
    }
    if (query.status) {
      const validStatuses = ['completed', 'abandoned', 'in_progress'];
      if (!validStatuses.includes(query.status)) {
        return badRequest(c, `Invalid status. Must be one of: ${validStatuses.join(', ')}`);
      }
      allSessions = allSessions.filter((s) => s.status === query.status);
    }

    // Sort by startedAt descending
    allSessions.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

    const total = allSessions.length;
    const paginatedSessions = allSessions.slice(offset, offset + limit);
    const hasMore = offset + limit < total;

    const sessionsWithMetrics = await Promise.all(
      paginatedSessions.map(async (session) => {
        const metrics = await repos.metricsRepo.findBySessionId(session.id);
        return {
          id: session.id,
          recallSetId: session.recallSetId,
          status: session.status,
          targetRecallPointIds: session.targetRecallPointIds,
          startedAt: session.startedAt,
          endedAt: session.endedAt,
          metrics: metrics
            ? {
                durationMs: metrics.durationMs,
                recallRate: metrics.overallRecallRate,
                engagementScore: metrics.engagementScore,
                recallPointsAttempted: metrics.recallPointsAttempted,
                recallPointsSuccessful: metrics.recallPointsSuccessful,
              }
            : null,
        };
      })
    );

    return success(c, {
      sessions: sessionsWithMetrics,
      pagination: { limit, offset, total, hasMore },
    });
  });

  app.get('/api/sessions/:id', async (c) => {
    const id = c.req.param('id');
    const session = await repos.sessionRepo.findById(id);

    if (!session) {
      return notFound(c, 'Session', id);
    }

    const recallSet = await repos.recallSetRepo.findById(session.recallSetId);
    const recallSetName = recallSet?.name || 'Unknown Recall Set';
    const metrics = await repos.metricsRepo.findBySessionId(id);

    return success(c, {
      session: {
        id: session.id,
        recallSetId: session.recallSetId,
        recallSetName,
        status: session.status,
        targetRecallPointIds: session.targetRecallPointIds,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
      },
      metrics: metrics
        ? {
            durationMs: metrics.durationMs,
            activeTimeMs: metrics.activeTimeMs,
            recallRate: metrics.overallRecallRate,
            engagementScore: metrics.engagementScore,
            recallPointsAttempted: metrics.recallPointsAttempted,
            recallPointsSuccessful: metrics.recallPointsSuccessful,
            recallPointsFailed: metrics.recallPointsFailed,
            avgConfidence: metrics.avgConfidence,
            totalMessages: metrics.totalMessages,
            rabbitholeCount: metrics.rabbitholeCount,
            estimatedCostUsd: metrics.estimatedCostUsd,
          }
        : null,
    });
  });

  app.get('/api/sessions/:id/transcript', async (c) => {
    const id = c.req.param('id');
    const session = await repos.sessionRepo.findById(id);

    if (!session) {
      return notFound(c, 'Session', id);
    }

    const messages = await repos.messageRepo.findBySessionId(id);
    const recallOutcomes = await repos.outcomeRepo.findBySessionId(id);
    const rabbitholeEvents = await repos.rabbitholeRepo.findBySessionId(id);

    const transcriptMessages = messages.map((msg, index) => {
      let evaluationMarker = null;
      for (const outcome of recallOutcomes) {
        if (index >= outcome.messageIndexStart && index <= outcome.messageIndexEnd) {
          evaluationMarker = {
            recallPointId: outcome.recallPointId,
            isStart: index === outcome.messageIndexStart,
            isEnd: index === outcome.messageIndexEnd,
            ...(index === outcome.messageIndexEnd && {
              success: outcome.success,
              confidence: outcome.confidence,
            }),
          };
          break;
        }
      }

      let rabbitholeMarker = null;
      for (const event of rabbitholeEvents) {
        const returnIndex = event.returnMessageIndex ?? Infinity;
        if (index >= event.triggerMessageIndex && index <= returnIndex) {
          rabbitholeMarker = {
            eventId: event.id,
            topic: event.topic,
            isTrigger: index === event.triggerMessageIndex,
            isReturn: event.returnMessageIndex !== null && index === event.returnMessageIndex,
            depth: event.depth,
          };
          break;
        }
      }

      return {
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        tokenCount: msg.tokenCount,
        messageIndex: index,
        evaluationMarker,
        rabbitholeMarker,
      };
    });

    return success(c, {
      sessionId: id,
      messages: transcriptMessages,
      totalMessages: messages.length,
    });
  });

  app.post('/api/sessions/start', async (c) => {
    const body = await c.req.json();

    if (!body.recallSetId || typeof body.recallSetId !== 'string') {
      return badRequest(c, 'recallSetId is required');
    }

    const recallSet = await repos.recallSetRepo.findById(body.recallSetId);
    if (!recallSet) {
      return notFound(c, 'RecallSet', body.recallSetId);
    }

    if (recallSet.status !== 'active') {
      return badRequest(c, `Cannot start session: recall set is ${recallSet.status}`);
    }

    const existingSession = await repos.sessionRepo.findInProgress(body.recallSetId);
    if (existingSession) {
      return success(
        c,
        {
          sessionId: existingSession.id,
          message: 'Resuming existing in-progress session',
          isResume: true,
        },
        200
      );
    }

    let duePoints = await repos.recallPointRepo.findDuePoints(body.recallSetId);
    if (duePoints.length === 0) {
      duePoints = await repos.recallPointRepo.findByRecallSetId(body.recallSetId);
    }

    if (duePoints.length === 0) {
      return badRequest(c, 'No recall points available in this recall set');
    }

    const sessionId = `sess_${crypto.randomUUID()}`;
    const targetRecallPointIds = duePoints.map((p) => p.id);

    await repos.sessionRepo.create({
      id: sessionId,
      recallSetId: body.recallSetId,
      targetRecallPointIds,
      startedAt: new Date(),
    });

    return success(
      c,
      {
        sessionId,
        message: 'Session started successfully',
        targetRecallPointCount: targetRecallPointIds.length,
        isResume: false,
      },
      201
    );
  });

  app.post('/api/sessions/:id/abandon', async (c) => {
    const id = c.req.param('id');
    const session = await repos.sessionRepo.findById(id);

    if (!session) {
      return notFound(c, 'Session', id);
    }

    if (session.status !== 'in_progress') {
      return badRequest(c, `Cannot abandon session: session is already ${session.status}`);
    }

    await repos.rabbitholeRepo.markActiveAsAbandoned(id);
    await repos.sessionRepo.abandon(id);

    return success(c, {
      sessionId: id,
      message: 'Session abandoned successfully',
      status: 'abandoned',
    });
  });

  return app;
}
