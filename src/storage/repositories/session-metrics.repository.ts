/**
 * Session Metrics Repository Implementation
 *
 * This module provides data access operations for SessionMetrics entities,
 * abstracting Drizzle ORM queries from business logic. It handles storing,
 * querying, and aggregating comprehensive session analytics data.
 *
 * Session metrics capture everything needed to analyze recall session performance:
 * - Time metrics (duration, active time, response latencies)
 * - Recall metrics (success rates, confidence scores)
 * - Conversation metrics (message counts, lengths)
 * - Rabbithole summaries (tangent tracking)
 * - Token/cost metrics (API usage tracking)
 * - Engagement scores (composite performance indicator)
 *
 * Each session can have exactly one metrics record, calculated when the session ends.
 */

import { eq, and, gte, lte, desc, avg, sum, count } from 'drizzle-orm';
import type { AppDatabase } from '../db';
import { sessionMetrics, sessions } from '../schema';
import type {
  SessionMetrics as DbSessionMetrics,
  NewSessionMetrics,
} from '../schema';

/**
 * Summary of session metrics for list views and dashboards.
 * Contains essential metrics without full detail, suitable for
 * displaying session history or aggregate analytics.
 */
export interface SessionMetricsSummary {
  /** ID of the session this summary describes */
  sessionId: string;
  /** Total session duration in milliseconds */
  durationMs: number;
  /** Overall recall success rate (0.0 to 1.0) */
  recallRate: number;
  /** Computed engagement score (0-100) */
  engagementScore: number;
  /** Number of recall points attempted */
  recallPointsAttempted: number;
  /** Number of recall points successfully recalled */
  recallPointsSuccessful: number;
  /** Estimated API cost in USD */
  costUsd: number;
  /** Number of rabbithole tangents */
  rabbitholeCount: number;
  /** When the metrics were calculated */
  calculatedAt: Date;
}

/**
 * Aggregate statistics for all sessions in a recall set.
 * Provides high-level performance indicators across multiple sessions.
 */
export interface RecallSetAggregateStats {
  /** Total number of sessions with metrics */
  totalSessions: number;
  /** Average recall success rate across all sessions (0.0 to 1.0) */
  avgRecallRate: number;
  /** Average engagement score across all sessions (0-100) */
  avgEngagement: number;
  /** Average session duration in milliseconds */
  avgDurationMs: number;
  /** Total time spent across all sessions in milliseconds */
  totalTimeMs: number;
  /** Total number of recall attempts across all sessions */
  totalRecallAttempts: number;
  /** Total number of successful recalls across all sessions */
  totalRecallSuccesses: number;
}

/**
 * Maps a database row to a SessionMetricsSummary.
 *
 * Extracts the essential fields needed for list views without
 * the full detail of complete metrics records.
 *
 * @param row - Raw database row from Drizzle query
 * @returns SessionMetricsSummary with essential metrics
 */
function mapToSummary(row: DbSessionMetrics): SessionMetricsSummary {
  return {
    sessionId: row.sessionId,
    durationMs: row.durationMs,
    recallRate: row.overallRecallRate,
    engagementScore: row.engagementScore,
    recallPointsAttempted: row.recallPointsAttempted,
    recallPointsSuccessful: row.recallPointsSuccessful,
    costUsd: row.estimatedCostUsd,
    rabbitholeCount: row.rabbitholeCount,
    calculatedAt: row.calculatedAt,
  };
}

/**
 * Repository for SessionMetrics entity data access operations.
 *
 * Provides methods for storing, querying, and aggregating session
 * analytics data. Supports both individual session lookups and
 * aggregate statistics across recall sets.
 *
 * @example
 * ```typescript
 * const repo = new SessionMetricsRepository(db);
 *
 * // Store metrics for a completed session
 * const metrics = await repo.create({
 *   id: 'sm_' + crypto.randomUUID(),
 *   sessionId: 'sess_abc123',
 *   durationMs: 180000,
 *   // ... other fields
 * });
 *
 * // Get aggregate stats for a recall set
 * const stats = await repo.getAggregateStats('rs_abc123');
 * console.log(`Average recall rate: ${stats.avgRecallRate * 100}%`);
 * ```
 */
export class SessionMetricsRepository {
  /**
   * Creates a new SessionMetricsRepository instance.
   *
   * @param db - The Drizzle database instance to use for queries
   */
  constructor(private readonly db: AppDatabase) {}

  /**
   * Stores complete metrics for a session.
   *
   * This should be called when a session completes to persist
   * the calculated analytics. Each session can have only one
   * metrics record due to the unique constraint on sessionId.
   *
   * @param metrics - The complete metrics data to store
   * @returns The created metrics record with all fields
   * @throws Error if metrics already exist for this session
   *
   * @example
   * ```typescript
   * const metrics = await repo.create({
   *   id: 'sm_' + crypto.randomUUID(),
   *   sessionId: 'sess_abc123',
   *   durationMs: 180000,
   *   activeTimeMs: 150000,
   *   avgUserResponseTimeMs: 5000,
   *   avgAssistantResponseTimeMs: 2000,
   *   recallPointsAttempted: 4,
   *   recallPointsSuccessful: 3,
   *   recallPointsFailed: 1,
   *   overallRecallRate: 0.75,
   *   avgConfidence: 0.85,
   *   totalMessages: 24,
   *   userMessages: 12,
   *   assistantMessages: 12,
   *   avgMessageLength: 150.5,
   *   rabbitholeCount: 1,
   *   totalRabbitholeTimeMs: 15000,
   *   avgRabbitholeDepth: 1.0,
   *   inputTokens: 2500,
   *   outputTokens: 1800,
   *   totalTokens: 4300,
   *   estimatedCostUsd: 0.042,
   *   engagementScore: 78,
   *   calculatedAt: new Date(),
   * });
   * ```
   */
  async create(metrics: NewSessionMetrics): Promise<DbSessionMetrics> {
    const result = await this.db
      .insert(sessionMetrics)
      .values(metrics)
      .returning();

    return result[0];
  }

  /**
   * Retrieves metrics for a single session by session ID.
   *
   * @param sessionId - The ID of the session to get metrics for
   * @returns The complete metrics record if found, or null if not found
   *
   * @example
   * ```typescript
   * const metrics = await repo.findBySessionId('sess_abc123');
   * if (metrics) {
   *   console.log(`Session duration: ${metrics.durationMs}ms`);
   *   console.log(`Recall rate: ${metrics.overallRecallRate * 100}%`);
   * }
   * ```
   */
  async findBySessionId(sessionId: string): Promise<DbSessionMetrics | null> {
    const result = await this.db
      .select()
      .from(sessionMetrics)
      .where(eq(sessionMetrics.sessionId, sessionId))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return result[0];
  }

  /**
   * Gets summary metrics for all sessions in a recall set.
   *
   * Returns lightweight summaries ordered by most recent first,
   * suitable for displaying session history lists or dashboards.
   * Uses a join with the sessions table to filter by recall set.
   *
   * @param recallSetId - The ID of the recall set to get summaries for
   * @returns Array of session metric summaries, ordered by calculatedAt descending
   *
   * @example
   * ```typescript
   * const summaries = await repo.findSummariesByRecallSet('rs_abc123');
   * for (const summary of summaries) {
   *   console.log(`Session ${summary.sessionId}: ${summary.recallRate * 100}% success`);
   * }
   * ```
   */
  async findSummariesByRecallSet(
    recallSetId: string
  ): Promise<SessionMetricsSummary[]> {
    // Join session_metrics with sessions to filter by recall set
    const results = await this.db
      .select({
        // Select all fields from sessionMetrics that we need for the summary
        id: sessionMetrics.id,
        sessionId: sessionMetrics.sessionId,
        durationMs: sessionMetrics.durationMs,
        activeTimeMs: sessionMetrics.activeTimeMs,
        avgUserResponseTimeMs: sessionMetrics.avgUserResponseTimeMs,
        avgAssistantResponseTimeMs: sessionMetrics.avgAssistantResponseTimeMs,
        recallPointsAttempted: sessionMetrics.recallPointsAttempted,
        recallPointsSuccessful: sessionMetrics.recallPointsSuccessful,
        recallPointsFailed: sessionMetrics.recallPointsFailed,
        overallRecallRate: sessionMetrics.overallRecallRate,
        avgConfidence: sessionMetrics.avgConfidence,
        totalMessages: sessionMetrics.totalMessages,
        userMessages: sessionMetrics.userMessages,
        assistantMessages: sessionMetrics.assistantMessages,
        avgMessageLength: sessionMetrics.avgMessageLength,
        rabbitholeCount: sessionMetrics.rabbitholeCount,
        totalRabbitholeTimeMs: sessionMetrics.totalRabbitholeTimeMs,
        avgRabbitholeDepth: sessionMetrics.avgRabbitholeDepth,
        inputTokens: sessionMetrics.inputTokens,
        outputTokens: sessionMetrics.outputTokens,
        totalTokens: sessionMetrics.totalTokens,
        estimatedCostUsd: sessionMetrics.estimatedCostUsd,
        engagementScore: sessionMetrics.engagementScore,
        calculatedAt: sessionMetrics.calculatedAt,
      })
      .from(sessionMetrics)
      .innerJoin(sessions, eq(sessionMetrics.sessionId, sessions.id))
      .where(eq(sessions.recallSetId, recallSetId))
      .orderBy(desc(sessionMetrics.calculatedAt));

    return results.map(mapToSummary);
  }

  /**
   * Gets aggregate statistics for all sessions in a recall set.
   *
   * Calculates high-level performance indicators by aggregating
   * metrics across all sessions. Useful for dashboards and progress reports.
   *
   * @param recallSetId - The ID of the recall set to aggregate stats for
   * @returns Aggregate statistics across all sessions in the recall set
   *
   * @example
   * ```typescript
   * const stats = await repo.getAggregateStats('rs_abc123');
   * console.log(`Total sessions: ${stats.totalSessions}`);
   * console.log(`Average recall rate: ${(stats.avgRecallRate * 100).toFixed(1)}%`);
   * console.log(`Total study time: ${stats.totalTimeMs / 60000} minutes`);
   * ```
   */
  async getAggregateStats(recallSetId: string): Promise<RecallSetAggregateStats> {
    // Use SQL aggregation functions for efficient statistics calculation
    const result = await this.db
      .select({
        totalSessions: count(sessionMetrics.id),
        avgRecallRate: avg(sessionMetrics.overallRecallRate),
        avgEngagement: avg(sessionMetrics.engagementScore),
        avgDurationMs: avg(sessionMetrics.durationMs),
        totalTimeMs: sum(sessionMetrics.durationMs),
        totalRecallAttempts: sum(sessionMetrics.recallPointsAttempted),
        totalRecallSuccesses: sum(sessionMetrics.recallPointsSuccessful),
      })
      .from(sessionMetrics)
      .innerJoin(sessions, eq(sessionMetrics.sessionId, sessions.id))
      .where(eq(sessions.recallSetId, recallSetId));

    const row = result[0];

    // Handle case where no sessions exist yet (all aggregates will be null)
    // Convert null/undefined to sensible defaults
    return {
      totalSessions: Number(row.totalSessions) || 0,
      avgRecallRate: Number(row.avgRecallRate) || 0,
      avgEngagement: Number(row.avgEngagement) || 0,
      avgDurationMs: Number(row.avgDurationMs) || 0,
      totalTimeMs: Number(row.totalTimeMs) || 0,
      totalRecallAttempts: Number(row.totalRecallAttempts) || 0,
      totalRecallSuccesses: Number(row.totalRecallSuccesses) || 0,
    };
  }

  /**
   * Gets metrics for sessions within a specific date range.
   *
   * Filters sessions by their calculatedAt timestamp, returning
   * summaries for sessions completed within the specified range.
   * Useful for time-based analytics and progress reports.
   *
   * @param recallSetId - The ID of the recall set to filter by
   * @param startDate - Start of the date range (inclusive)
   * @param endDate - End of the date range (inclusive)
   * @returns Array of session metric summaries within the date range
   *
   * @example
   * ```typescript
   * // Get metrics for the past week
   * const weekAgo = new Date();
   * weekAgo.setDate(weekAgo.getDate() - 7);
   * const summaries = await repo.findByDateRange('rs_abc123', weekAgo, new Date());
   * ```
   */
  async findByDateRange(
    recallSetId: string,
    startDate: Date,
    endDate: Date
  ): Promise<SessionMetricsSummary[]> {
    // Join with sessions to filter by recall set and date range
    const results = await this.db
      .select({
        // Select all fields from sessionMetrics needed for summary
        id: sessionMetrics.id,
        sessionId: sessionMetrics.sessionId,
        durationMs: sessionMetrics.durationMs,
        activeTimeMs: sessionMetrics.activeTimeMs,
        avgUserResponseTimeMs: sessionMetrics.avgUserResponseTimeMs,
        avgAssistantResponseTimeMs: sessionMetrics.avgAssistantResponseTimeMs,
        recallPointsAttempted: sessionMetrics.recallPointsAttempted,
        recallPointsSuccessful: sessionMetrics.recallPointsSuccessful,
        recallPointsFailed: sessionMetrics.recallPointsFailed,
        overallRecallRate: sessionMetrics.overallRecallRate,
        avgConfidence: sessionMetrics.avgConfidence,
        totalMessages: sessionMetrics.totalMessages,
        userMessages: sessionMetrics.userMessages,
        assistantMessages: sessionMetrics.assistantMessages,
        avgMessageLength: sessionMetrics.avgMessageLength,
        rabbitholeCount: sessionMetrics.rabbitholeCount,
        totalRabbitholeTimeMs: sessionMetrics.totalRabbitholeTimeMs,
        avgRabbitholeDepth: sessionMetrics.avgRabbitholeDepth,
        inputTokens: sessionMetrics.inputTokens,
        outputTokens: sessionMetrics.outputTokens,
        totalTokens: sessionMetrics.totalTokens,
        estimatedCostUsd: sessionMetrics.estimatedCostUsd,
        engagementScore: sessionMetrics.engagementScore,
        calculatedAt: sessionMetrics.calculatedAt,
      })
      .from(sessionMetrics)
      .innerJoin(sessions, eq(sessionMetrics.sessionId, sessions.id))
      .where(
        and(
          eq(sessions.recallSetId, recallSetId),
          gte(sessionMetrics.calculatedAt, startDate),
          lte(sessionMetrics.calculatedAt, endDate)
        )
      )
      .orderBy(desc(sessionMetrics.calculatedAt));

    return results.map(mapToSummary);
  }

  /**
   * Deletes metrics for a session.
   *
   * WARNING: This permanently removes analytics data. Use with caution.
   *
   * @param sessionId - The ID of the session whose metrics to delete
   * @throws Error if no metrics exist for the given session
   */
  async deleteBySessionId(sessionId: string): Promise<void> {
    const result = await this.db
      .delete(sessionMetrics)
      .where(eq(sessionMetrics.sessionId, sessionId))
      .returning({ id: sessionMetrics.id });

    if (result.length === 0) {
      throw new Error(`SessionMetrics for session '${sessionId}' not found`);
    }
  }
}
