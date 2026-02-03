/**
 * Session Analytics Calculator
 *
 * This service calculates aggregate analytics across sessions, providing
 * recall trends, engagement patterns, and performance insights for
 * individual recall sets and overall usage.
 *
 * The calculator uses repository aggregate methods for efficient queries,
 * avoiding loading full session data when possible. It computes:
 *
 * 1. Recall Set Analytics - Comprehensive metrics for a single recall set
 * 2. Point Analytics - Granular performance data for individual recall points
 * 3. Global Analytics - System-wide overview across all recall sets
 *
 * Analytics are computed on-demand from stored session data. For frequently
 * accessed dashboards, consider caching the results.
 *
 * @example
 * ```typescript
 * const calculator = new AnalyticsCalculator(
 *   sessionMetricsRepo,
 *   recallOutcomeRepo,
 *   rabbitholeRepo,
 *   recallSetRepo,
 *   recallPointRepo
 * );
 *
 * // Get comprehensive analytics for a recall set
 * const analytics = await calculator.calculateRecallSetAnalytics('rs_spanish_vocab');
 * console.log(`Recall rate: ${(analytics.overallRecallRate * 100).toFixed(1)}%`);
 *
 * // Identify struggling points
 * const struggling = analytics.pointAnalytics.filter(p => p.isStruggling);
 * console.log(`${struggling.length} points need extra attention`);
 * ```
 */

import type { SessionMetricsRepository } from '../../storage/repositories/session-metrics.repository';
import type { RecallOutcomeRepository } from '../../storage/repositories/recall-outcome.repository';
import type { RabbitholeEventRepository } from '../../storage/repositories/rabbithole-event.repository';
import type { RecallSetRepository } from '../../storage/repositories/recall-set.repository';
import type { RecallPointRepository } from '../../storage/repositories/recall-point.repository';
import type {
  RecallSetAnalytics,
  RecallPointAnalytics,
  GlobalAnalytics,
  TrendData,
} from './types';

/**
 * Service for calculating aggregate analytics across sessions.
 *
 * AnalyticsCalculator provides methods to compute comprehensive
 * analytics at three levels:
 * - Global (all recall sets)
 * - Recall set (single set with all its points)
 * - Recall point (individual knowledge item)
 *
 * The calculator relies on repository methods that perform efficient
 * SQL aggregations rather than loading full records into memory.
 */
export class AnalyticsCalculator {
  /**
   * Creates a new AnalyticsCalculator instance.
   *
   * @param sessionMetricsRepo - Repository for session metrics data
   * @param recallOutcomeRepo - Repository for recall outcome data
   * @param rabbitholeRepo - Repository for rabbithole event data
   * @param recallSetRepo - Repository for recall set data
   * @param recallPointRepo - Repository for recall point data
   */
  constructor(
    private readonly sessionMetricsRepo: SessionMetricsRepository,
    private readonly recallOutcomeRepo: RecallOutcomeRepository,
    private readonly rabbitholeRepo: RabbitholeEventRepository,
    private readonly recallSetRepo: RecallSetRepository,
    private readonly recallPointRepo: RecallPointRepository
  ) {}

  /**
   * Calculate comprehensive analytics for a single recall set.
   *
   * This method aggregates data from multiple sources to provide
   * a complete picture of performance for a recall set, including:
   * - Aggregate statistics (sessions, time, rates)
   * - Trend data over time
   * - Per-point analytics
   * - Rabbithole topic analysis
   *
   * @param recallSetId - The ID of the recall set to analyze
   * @returns Comprehensive analytics for the recall set
   * @throws Error if the recall set is not found
   *
   * @example
   * ```typescript
   * const analytics = await calculator.calculateRecallSetAnalytics('rs_spanish_vocab');
   * console.log(`Total sessions: ${analytics.totalSessions}`);
   * console.log(`Overall recall rate: ${(analytics.overallRecallRate * 100).toFixed(1)}%`);
   * console.log(`Struggling points: ${analytics.pointAnalytics.filter(p => p.isStruggling).length}`);
   * ```
   */
  async calculateRecallSetAnalytics(
    recallSetId: string
  ): Promise<RecallSetAnalytics> {
    // Fetch the recall set to get its name and verify it exists
    const recallSet = await this.recallSetRepo.findById(recallSetId);
    if (!recallSet) {
      throw new Error(`RecallSet with id '${recallSetId}' not found`);
    }

    // Get aggregate statistics from session metrics using efficient SQL aggregation
    const aggregateStats =
      await this.sessionMetricsRepo.getAggregateStats(recallSetId);

    // Get all recall points for this set to calculate per-point analytics
    const recallPoints =
      await this.recallPointRepo.findByRecallSetId(recallSetId);

    // Calculate analytics for each recall point in parallel for efficiency
    const pointAnalyticsPromises = recallPoints.map((point) =>
      this.calculatePointAnalytics(point.id)
    );
    const pointAnalytics = await Promise.all(pointAnalyticsPromises);

    // Get session metrics summaries for calculating total cost
    // We need this since aggregate stats don't include cost
    const sessionSummaries =
      await this.sessionMetricsRepo.findSummariesByRecallSet(recallSetId);
    const totalCostUsd = sessionSummaries.reduce(
      (sum, s) => sum + s.costUsd,
      0
    );

    // Calculate trend data for the last 30 days
    const recallRateTrend = await this.calculateRecallRateTrend(
      recallSetId,
      30
    );
    const engagementTrend = await this.calculateEngagementTrend(recallSetId, 30);

    // Get top rabbithole topics for insight into common tangents
    const topRabbitholeTopics = await this.rabbitholeRepo.getTopTopics(
      recallSetId,
      10
    );

    return {
      recallSetId,
      recallSetName: recallSet.name,
      totalSessions: aggregateStats.totalSessions,
      totalTimeSpentMs: aggregateStats.totalTimeMs,
      overallRecallRate: aggregateStats.avgRecallRate,
      avgEngagementScore: aggregateStats.avgEngagement,
      recallRateTrend,
      engagementTrend,
      pointAnalytics,
      topRabbitholeTopics,
      totalCostUsd,
    };
  }

  /**
   * Calculate analytics for a specific recall point.
   *
   * This method aggregates outcome data across all sessions to provide
   * detailed performance metrics for an individual recall point. It
   * combines outcome statistics with current FSRS state to give a
   * complete picture of the point's learning status.
   *
   * @param recallPointId - The ID of the recall point to analyze
   * @returns Analytics for the recall point
   * @throws Error if the recall point is not found
   *
   * @example
   * ```typescript
   * const analytics = await calculator.calculatePointAnalytics('rp_hola');
   * if (analytics.isStruggling) {
   *   console.log(`${analytics.content} needs more practice`);
   *   console.log(`Success rate: ${(analytics.successRate * 100).toFixed(1)}%`);
   * }
   * ```
   */
  async calculatePointAnalytics(
    recallPointId: string
  ): Promise<RecallPointAnalytics> {
    // Fetch the recall point to get content and FSRS state
    const recallPoint = await this.recallPointRepo.findById(recallPointId);
    if (!recallPoint) {
      throw new Error(`RecallPoint with id '${recallPointId}' not found`);
    }

    // Get aggregate statistics for this recall point using efficient SQL
    const stats =
      await this.recallOutcomeRepo.getStatsForRecallPoint(recallPointId);

    // Get all outcomes to calculate average time to recall
    // This is less efficient but necessary for time calculation
    const outcomes =
      await this.recallOutcomeRepo.findByRecallPointId(recallPointId);

    // Calculate average time to recall from outcomes
    const avgTimeToRecallMs =
      outcomes.length > 0
        ? outcomes.reduce((sum, o) => sum + o.timeSpentMs, 0) / outcomes.length
        : 0;

    // Calculate success rate (guard against division by zero)
    const successRate =
      stats.totalAttempts > 0 ? stats.successCount / stats.totalAttempts : 0;

    // Determine if this point is struggling using defined criteria:
    // - At least 3 attempts (enough data to judge)
    // - Success rate below 50%
    const isStruggling = this.isStruggling(successRate, stats.totalAttempts);

    // Calculate days until due from FSRS state
    const daysUntilDue = this.calculateDaysUntilDue(recallPoint.fsrsState.due);

    return {
      recallPointId,
      content: recallPoint.content,
      successRate,
      avgConfidence: stats.avgConfidence,
      avgTimeToRecallMs,
      currentStability: recallPoint.fsrsState.stability,
      currentDifficulty: recallPoint.fsrsState.difficulty,
      daysUntilDue,
      isStruggling,
    };
  }

  /**
   * Calculate global analytics across all recall sets.
   *
   * This method provides a system-wide overview of learning activity,
   * including total counts, aggregate performance, and recent activity
   * trends. It aggregates data from all recall sets for dashboard display.
   *
   * @returns Global analytics across all recall sets
   *
   * @example
   * ```typescript
   * const global = await calculator.calculateGlobalAnalytics();
   * console.log(`Total study time: ${(global.totalStudyTimeMs / 60000).toFixed(0)} minutes`);
   * console.log(`Total cost: $${global.totalCostUsd.toFixed(2)}`);
   * console.log(`Active sets: ${global.activeRecallSets}/${global.totalRecallSets}`);
   * ```
   */
  async calculateGlobalAnalytics(): Promise<GlobalAnalytics> {
    // Get all recall sets to count totals and active sets
    const allRecallSets = await this.recallSetRepo.findAll();
    const totalRecallSets = allRecallSets.length;
    const activeRecallSets = allRecallSets.filter(
      (rs) => rs.status === 'active'
    ).length;

    // Aggregate metrics across all recall sets
    // We need to get aggregate stats for each set and combine them
    let totalSessions = 0;
    let totalStudyTimeMs = 0;
    let totalRecallAttempts = 0;
    let totalRecallSuccesses = 0;
    let totalCostUsd = 0;

    // Process each recall set in parallel for efficiency
    const statsPromises = allRecallSets.map(async (recallSet) => {
      const stats = await this.sessionMetricsRepo.getAggregateStats(
        recallSet.id
      );
      const summaries = await this.sessionMetricsRepo.findSummariesByRecallSet(
        recallSet.id
      );
      const cost = summaries.reduce((sum, s) => sum + s.costUsd, 0);

      return {
        sessions: stats.totalSessions,
        timeMs: stats.totalTimeMs,
        attempts: stats.totalRecallAttempts,
        successes: stats.totalRecallSuccesses,
        cost,
      };
    });

    const allStats = await Promise.all(statsPromises);

    // Sum up all the statistics
    for (const stats of allStats) {
      totalSessions += stats.sessions;
      totalStudyTimeMs += stats.timeMs;
      totalRecallAttempts += stats.attempts;
      totalRecallSuccesses += stats.successes;
      totalCostUsd += stats.cost;
    }

    // Calculate overall recall rate (guard against division by zero)
    const overallRecallRate =
      totalRecallAttempts > 0 ? totalRecallSuccesses / totalRecallAttempts : 0;

    // Calculate recent activity trend for the last 30 days
    // We need to aggregate sessions per day across all recall sets
    const recentActivity = await this.calculateGlobalRecentActivity(30);

    return {
      totalRecallSets,
      activeRecallSets,
      totalSessions,
      totalStudyTimeMs,
      overallRecallRate,
      totalCostUsd,
      recentActivity,
    };
  }

  /**
   * Get recall rate trend data for a recall set over time.
   *
   * Groups sessions by day and calculates the average recall rate
   * for each day. This enables visualization of learning progress
   * over the specified time period.
   *
   * @param recallSetId - The ID of the recall set to analyze
   * @param days - Number of days to include in the trend (default 30)
   * @returns Array of trend data points, one per day with sessions
   */
  private async calculateRecallRateTrend(
    recallSetId: string,
    days: number = 30
  ): Promise<TrendData[]> {
    // Calculate the date range for the trend
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get all session summaries within the date range
    const summaries = await this.sessionMetricsRepo.findByDateRange(
      recallSetId,
      startDate,
      endDate
    );

    // Group summaries by date and calculate average recall rate per day
    const dailyData = this.groupByDate(summaries, (s) => s.calculatedAt);

    // Calculate average recall rate for each day
    const trendData: TrendData[] = [];
    for (const [dateKey, daySummaries] of dailyData) {
      const avgRecallRate =
        daySummaries.reduce((sum, s) => sum + s.recallRate, 0) /
        daySummaries.length;

      trendData.push({
        date: new Date(dateKey),
        value: avgRecallRate,
      });
    }

    // Sort by date ascending
    return trendData.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  /**
   * Get engagement score trend data for a recall set.
   *
   * Groups sessions by day and calculates the average engagement
   * score for each day. Helps identify patterns in study quality
   * over time.
   *
   * @param recallSetId - The ID of the recall set to analyze
   * @param days - Number of days to include in the trend (default 30)
   * @returns Array of trend data points, one per day with sessions
   */
  private async calculateEngagementTrend(
    recallSetId: string,
    days: number = 30
  ): Promise<TrendData[]> {
    // Calculate the date range for the trend
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get all session summaries within the date range
    const summaries = await this.sessionMetricsRepo.findByDateRange(
      recallSetId,
      startDate,
      endDate
    );

    // Group summaries by date and calculate average engagement per day
    const dailyData = this.groupByDate(summaries, (s) => s.calculatedAt);

    // Calculate average engagement for each day
    const trendData: TrendData[] = [];
    for (const [dateKey, daySummaries] of dailyData) {
      const avgEngagement =
        daySummaries.reduce((sum, s) => sum + s.engagementScore, 0) /
        daySummaries.length;

      trendData.push({
        date: new Date(dateKey),
        value: avgEngagement,
      });
    }

    // Sort by date ascending
    return trendData.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  /**
   * Calculate recent activity trend across all recall sets.
   *
   * Counts the number of sessions per day over the specified period.
   * This shows study frequency patterns at the system level.
   *
   * @param days - Number of days to include in the trend
   * @returns Array of trend data points with session counts per day
   */
  private async calculateGlobalRecentActivity(
    days: number
  ): Promise<TrendData[]> {
    // Calculate the date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get all recall sets and their session summaries
    const allRecallSets = await this.recallSetRepo.findAll();

    // Collect all session summaries from all recall sets
    const allSummariesPromises = allRecallSets.map((rs) =>
      this.sessionMetricsRepo.findByDateRange(rs.id, startDate, endDate)
    );
    const allSummariesArrays = await Promise.all(allSummariesPromises);
    const allSummaries = allSummariesArrays.flat();

    // Group by date and count sessions per day
    const dailyData = this.groupByDate(allSummaries, (s) => s.calculatedAt);

    // Count sessions for each day
    const trendData: TrendData[] = [];
    for (const [dateKey, daySummaries] of dailyData) {
      trendData.push({
        date: new Date(dateKey),
        value: daySummaries.length, // Count of sessions
      });
    }

    // Sort by date ascending
    return trendData.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  /**
   * Identify struggling points based on success rate and attempt count.
   *
   * A recall point is considered "struggling" when:
   * - It has at least 3 attempts (enough data to be meaningful)
   * - Its success rate is below 50%
   *
   * This threshold balances identifying genuine difficulties while
   * avoiding false positives from insufficient data.
   *
   * @param successRate - The success rate (0.0 to 1.0)
   * @param attempts - Total number of recall attempts
   * @returns True if the point is struggling, false otherwise
   */
  private isStruggling(successRate: number, attempts: number): boolean {
    // Require minimum attempts for reliable assessment
    const MIN_ATTEMPTS = 3;
    // Define struggling threshold at 50% success rate
    const STRUGGLING_THRESHOLD = 0.5;

    return attempts >= MIN_ATTEMPTS && successRate < STRUGGLING_THRESHOLD;
  }

  /**
   * Calculate days until a recall point is due.
   *
   * Computes the difference between the due date and now in days.
   * - Positive values indicate the point is due in the future
   * - Zero indicates the point is due today
   * - Negative values indicate the point is overdue
   *
   * @param dueDate - The FSRS-calculated due date, or null if never reviewed
   * @returns Number of days until due (negative if overdue)
   */
  private calculateDaysUntilDue(dueDate: Date | null): number {
    // If no due date, treat as due now (day 0)
    if (!dueDate) {
      return 0;
    }

    const now = new Date();
    const diffMs = dueDate.getTime() - now.getTime();

    // Convert milliseconds to days, rounding up
    // Use ceil so "less than 1 day" still shows as 1 day remaining
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }

  /**
   * Group items by their date (ignoring time).
   *
   * Helper function that groups an array of items by the date portion
   * of a specified timestamp field. The date key uses YYYY-MM-DD format
   * for consistent grouping.
   *
   * @param items - Array of items to group
   * @param getDate - Function to extract the Date from each item
   * @returns Map of date strings to arrays of items on that date
   */
  private groupByDate<T>(
    items: T[],
    getDate: (item: T) => Date
  ): Map<string, T[]> {
    const groups = new Map<string, T[]>();

    for (const item of items) {
      const date = getDate(item);
      // Create date key in YYYY-MM-DD format for consistent grouping
      const dateKey = date.toISOString().split('T')[0];

      const group = groups.get(dateKey);
      if (group) {
        group.push(item);
      } else {
        groups.set(dateKey, [item]);
      }
    }

    return groups;
  }
}
