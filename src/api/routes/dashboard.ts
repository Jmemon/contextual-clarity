/**
 * Dashboard API Routes
 *
 * This module provides REST API endpoints for the dashboard feature,
 * exposing aggregated analytics and session data through the
 * DashboardDataAggregator service. These endpoints power the Phase 3
 * web dashboard UI.
 *
 * Endpoints:
 * - GET /api/dashboard/overview - Global stats, due points, and streaks
 * - GET /api/dashboard/recent-sessions - Last N sessions (default 5)
 * - GET /api/dashboard/upcoming-reviews - Points due in next N days (default 7)
 *
 * All endpoints return data in the standardized API response format
 * using the success/error helpers from the response utility module.
 *
 * @example
 * ```typescript
 * import { dashboardRoutes } from '@/api/routes/dashboard';
 *
 * // Mount in the API router
 * app.route('/dashboard', dashboardRoutes());
 *
 * // Access via:
 * // GET /api/dashboard/overview
 * // GET /api/dashboard/recent-sessions?limit=10
 * // GET /api/dashboard/upcoming-reviews?days=14
 * ```
 */

import { Hono } from 'hono';
import { DashboardDataAggregator } from '../../core/dashboard';
import { AnalyticsCalculator } from '../../core/analytics';
import {
  RecallSetRepository,
  RecallPointRepository,
  SessionRepository,
  SessionMetricsRepository,
  RecallOutcomeRepository,
  RabbitholeEventRepository,
} from '../../storage/repositories';
import { db } from '../../storage/db';
import { success, badRequest, internalError } from '../utils/response';

// ============================================================================
// Configuration Constants
// ============================================================================

/**
 * Default number of recent sessions to return when no limit is specified.
 */
const DEFAULT_RECENT_SESSIONS_LIMIT = 5;

/**
 * Maximum number of recent sessions that can be requested.
 * Prevents excessive data loading from unbounded queries.
 */
const MAX_RECENT_SESSIONS_LIMIT = 50;

/**
 * Default number of days ahead to look for upcoming reviews.
 */
const DEFAULT_UPCOMING_REVIEW_DAYS = 7;

/**
 * Maximum days ahead that can be requested for upcoming reviews.
 * Prevents loading excessively distant future reviews.
 */
const MAX_UPCOMING_REVIEW_DAYS = 90;

// ============================================================================
// Dashboard Data Aggregator Factory
// ============================================================================

/**
 * Creates a configured DashboardDataAggregator instance with all dependencies.
 *
 * This factory function instantiates all required repositories and the
 * analytics calculator, wiring them together into a ready-to-use aggregator.
 * Uses the default database connection from the storage module.
 *
 * @returns A fully configured DashboardDataAggregator instance
 */
function createDashboardAggregator(): DashboardDataAggregator {
  // Create repository instances with the database connection
  const recallSetRepo = new RecallSetRepository(db);
  const recallPointRepo = new RecallPointRepository(db);
  const sessionRepo = new SessionRepository(db);
  const metricsRepo = new SessionMetricsRepository(db);
  const recallOutcomeRepo = new RecallOutcomeRepository(db);
  const rabbitholeRepo = new RabbitholeEventRepository(db);

  // Create the analytics calculator with its required repositories
  const analyticsCalc = new AnalyticsCalculator(
    metricsRepo,
    recallOutcomeRepo,
    rabbitholeRepo,
    recallSetRepo,
    recallPointRepo
  );

  // Create and return the dashboard aggregator
  return new DashboardDataAggregator(
    recallSetRepo,
    recallPointRepo,
    sessionRepo,
    metricsRepo,
    analyticsCalc
  );
}

// ============================================================================
// Query Parameter Parsers
// ============================================================================

/**
 * Parses and validates the 'limit' query parameter for recent sessions.
 *
 * @param limitParam - The raw query parameter value (may be undefined)
 * @returns The validated limit value, or an error object if invalid
 */
function parseSessionLimit(
  limitParam: string | undefined
): { value: number } | { error: string } {
  // Use default if not provided
  if (!limitParam) {
    return { value: DEFAULT_RECENT_SESSIONS_LIMIT };
  }

  // Parse as integer
  const limit = parseInt(limitParam, 10);

  // Validate it's a valid number
  if (isNaN(limit)) {
    return { error: `Invalid limit parameter: '${limitParam}' is not a number` };
  }

  // Validate it's positive
  if (limit <= 0) {
    return { error: 'Limit must be a positive number' };
  }

  // Cap at maximum to prevent excessive queries
  if (limit > MAX_RECENT_SESSIONS_LIMIT) {
    return { value: MAX_RECENT_SESSIONS_LIMIT };
  }

  return { value: limit };
}

/**
 * Parses and validates the 'days' query parameter for upcoming reviews.
 *
 * @param daysParam - The raw query parameter value (may be undefined)
 * @returns The validated days value, or an error object if invalid
 */
function parseReviewDays(
  daysParam: string | undefined
): { value: number } | { error: string } {
  // Use default if not provided
  if (!daysParam) {
    return { value: DEFAULT_UPCOMING_REVIEW_DAYS };
  }

  // Parse as integer
  const days = parseInt(daysParam, 10);

  // Validate it's a valid number
  if (isNaN(days)) {
    return { error: `Invalid days parameter: '${daysParam}' is not a number` };
  }

  // Validate it's positive
  if (days <= 0) {
    return { error: 'Days must be a positive number' };
  }

  // Cap at maximum to prevent excessive queries
  if (days > MAX_UPCOMING_REVIEW_DAYS) {
    return { value: MAX_UPCOMING_REVIEW_DAYS };
  }

  return { value: days };
}

// ============================================================================
// Route Definitions
// ============================================================================

/**
 * Creates the dashboard routes router.
 *
 * Provides three endpoints for dashboard data:
 * 1. Overview - Complete dashboard summary
 * 2. Recent Sessions - List of recent study sessions
 * 3. Upcoming Reviews - Points due for review soon
 *
 * @returns Hono router instance with dashboard routes
 *
 * @example
 * ```typescript
 * import { createApiRouter } from '@/api/routes';
 * import { dashboardRoutes } from '@/api/routes/dashboard';
 *
 * const router = createApiRouter();
 * router.route('/dashboard', dashboardRoutes());
 * ```
 */
export function dashboardRoutes(): Hono {
  const router = new Hono();

  // Create the aggregator instance once for all routes
  // In a production system, this might be injected via middleware for better testability
  const aggregator = createDashboardAggregator();

  // ---------------------------------------------------------------------------
  // GET /overview - Dashboard Overview
  // ---------------------------------------------------------------------------

  /**
   * GET /overview
   *
   * Returns the complete dashboard overview including:
   * - Global statistics (total sets, sessions, study time)
   * - Today's activity summary
   * - Points due for review
   * - Recent session history
   * - Upcoming reviews
   * - Current and longest study streaks
   *
   * Response: DashboardOverview
   *
   * @example
   * ```bash
   * curl http://localhost:3001/api/dashboard/overview
   * ```
   */
  router.get('/overview', async (c) => {
    try {
      // Fetch the complete dashboard overview from the aggregator
      const overview = await aggregator.getOverview();

      return success(c, overview);
    } catch (err) {
      // Log the error for debugging/monitoring
      console.error('[Dashboard] Error fetching overview:', err);

      // Return a generic error to the client
      return internalError(
        c,
        'Failed to fetch dashboard overview',
        err instanceof Error ? err.message : undefined
      );
    }
  });

  // ---------------------------------------------------------------------------
  // GET /recent-sessions - Recent Sessions List
  // ---------------------------------------------------------------------------

  /**
   * GET /recent-sessions
   *
   * Returns a list of recent study sessions with their metrics.
   * Sessions are sorted by start time (most recent first).
   *
   * Query Parameters:
   * - limit (optional): Number of sessions to return (default: 5, max: 50)
   *
   * Response: Array of SessionSummary objects
   *
   * @example
   * ```bash
   * # Get default 5 recent sessions
   * curl http://localhost:3001/api/dashboard/recent-sessions
   *
   * # Get 10 recent sessions
   * curl http://localhost:3001/api/dashboard/recent-sessions?limit=10
   * ```
   */
  router.get('/recent-sessions', async (c) => {
    // Parse and validate the limit query parameter
    const limitParam = c.req.query('limit');
    const limitResult = parseSessionLimit(limitParam);

    // Return error if limit is invalid
    if ('error' in limitResult) {
      return badRequest(c, limitResult.error, { parameter: 'limit' });
    }

    const limit = limitResult.value;

    try {
      // Fetch the overview which contains recent sessions
      // Note: The aggregator's getOverview returns recent sessions,
      // but we want to respect the custom limit parameter.
      // For now, we'll fetch the overview and slice the sessions.
      // A future optimization could add a dedicated method for this.
      const overview = await aggregator.getOverview();

      // Apply the requested limit to the recent sessions
      const recentSessions = overview.recentSessions.slice(0, limit);

      return success(c, {
        sessions: recentSessions,
        total: overview.totalSessions,
        limit,
      });
    } catch (err) {
      // Log the error for debugging/monitoring
      console.error('[Dashboard] Error fetching recent sessions:', err);

      // Return a generic error to the client
      return internalError(
        c,
        'Failed to fetch recent sessions',
        err instanceof Error ? err.message : undefined
      );
    }
  });

  // ---------------------------------------------------------------------------
  // GET /upcoming-reviews - Upcoming Reviews List
  // ---------------------------------------------------------------------------

  /**
   * GET /upcoming-reviews
   *
   * Returns a list of recall points that are due or will be due soon.
   * Points are sorted by urgency (overdue first, then soonest due date).
   *
   * Query Parameters:
   * - days (optional): How many days ahead to look (default: 7, max: 90)
   *
   * Response: Array of UpcomingReview objects with priority categorization
   *
   * @example
   * ```bash
   * # Get reviews due in the next 7 days (default)
   * curl http://localhost:3001/api/dashboard/upcoming-reviews
   *
   * # Get reviews due in the next 14 days
   * curl http://localhost:3001/api/dashboard/upcoming-reviews?days=14
   * ```
   */
  router.get('/upcoming-reviews', async (c) => {
    // Parse and validate the days query parameter
    const daysParam = c.req.query('days');
    const daysResult = parseReviewDays(daysParam);

    // Return error if days is invalid
    if ('error' in daysResult) {
      return badRequest(c, daysResult.error, { parameter: 'days' });
    }

    const days = daysResult.value;

    try {
      // Fetch upcoming reviews using the aggregator
      // The aggregator has a dedicated method for this with a configurable limit
      // We'll fetch more than the user might display and filter by days
      const allUpcomingReviews = await aggregator.getUpcomingReviews();

      // Filter to only include reviews within the requested number of days
      // daysUntilDue can be negative (overdue), so we include those too
      const filteredReviews = allUpcomingReviews.filter(
        (review) => review.daysUntilDue <= days
      );

      // Group reviews by priority for summary statistics
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
      // Log the error for debugging/monitoring
      console.error('[Dashboard] Error fetching upcoming reviews:', err);

      // Return a generic error to the client
      return internalError(
        c,
        'Failed to fetch upcoming reviews',
        err instanceof Error ? err.message : undefined
      );
    }
  });

  return router;
}

// ============================================================================
// Default Export
// ============================================================================

/**
 * Default export provides the dashboard routes factory.
 */
export default dashboardRoutes;
