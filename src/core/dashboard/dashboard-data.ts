/**
 * Dashboard Data Aggregator
 *
 * This service aggregates data from multiple repositories to prepare
 * API response shapes for the Phase 3 web dashboard. It consolidates
 * recall set analytics, session metrics, and recall point status into
 * dashboard-ready data structures.
 *
 * The aggregator provides two main views:
 * 1. Overview - System-wide summary across all recall sets
 * 2. RecallSetDashboard - Detailed analytics for a single recall set
 *
 * All data is computed on-demand from stored session and analytics data.
 * For frequently accessed dashboards, consider caching the results.
 *
 * @example
 * ```typescript
 * const aggregator = new DashboardDataAggregator(
 *   recallSetRepo,
 *   recallPointRepo,
 *   sessionRepo,
 *   metricsRepo,
 *   analyticsCalc
 * );
 *
 * // Get main dashboard overview
 * const overview = await aggregator.getOverview();
 * console.log(`Total sessions: ${overview.totalSessions}`);
 * console.log(`Current streak: ${overview.currentStreak} days`);
 *
 * // Get detailed analytics for a specific recall set
 * const setDashboard = await aggregator.getRecallSetDashboard('rs_spanish_vocab');
 * console.log(`Mastered points: ${setDashboard.points.mastered}`);
 * ```
 */

import type { RecallSetRepository } from '../../storage/repositories/recall-set.repository';
import type { RecallPointRepository } from '../../storage/repositories/recall-point.repository';
import type { SessionRepository } from '../../storage/repositories/session.repository';
import type { SessionMetricsRepository } from '../../storage/repositories/session-metrics.repository';
import type { AnalyticsCalculator } from '../analytics';
import type { RecallSet } from '../models/recall-set';
import type { Session } from '../models/session';
import type {
  DashboardOverview,
  RecallSetDashboard,
  SessionSummary,
  UpcomingReview,
  PointStatusBreakdown,
  RecallPointSummary,
  ChartDataPoint,
} from './types';

/**
 * Threshold values for point status categorization.
 * These constants define the criteria for mastered, struggling, and new points.
 */
const MASTERED_STABILITY_THRESHOLD = 30; // days - points with stability > 30 days are mastered
const STRUGGLING_SUCCESS_RATE_THRESHOLD = 0.5; // 50% - points below this are struggling
const STRUGGLING_MIN_ATTEMPTS = 3; // minimum attempts to be considered struggling
const UPCOMING_REVIEW_DAYS = 7; // days ahead to consider for upcoming reviews
const RECENT_SESSIONS_LIMIT = 10; // max recent sessions to include
const UPCOMING_REVIEWS_LIMIT = 20; // max upcoming reviews to include

/**
 * Aggregates data for dashboard views.
 * Designed to prepare API response shapes for Phase 3 web dashboard.
 *
 * This class coordinates between multiple repositories and the analytics
 * calculator to produce comprehensive dashboard data. It handles:
 * - Aggregating metrics across recall sets
 * - Calculating streak data from session history
 * - Categorizing recall points by learning status
 * - Preparing chart-friendly data formats
 */
export class DashboardDataAggregator {
  /**
   * Creates a new DashboardDataAggregator instance.
   *
   * @param recallSetRepo - Repository for recall set data
   * @param recallPointRepo - Repository for recall point data
   * @param sessionRepo - Repository for session data
   * @param metricsRepo - Repository for session metrics data
   * @param analyticsCalc - Calculator for recall set analytics
   */
  constructor(
    private recallSetRepo: RecallSetRepository,
    private recallPointRepo: RecallPointRepository,
    private sessionRepo: SessionRepository,
    private metricsRepo: SessionMetricsRepository,
    private analyticsCalc: AnalyticsCalculator
  ) {}

  /**
   * Get overview data for the main dashboard.
   * Shows aggregate stats, recent sessions, and upcoming reviews.
   *
   * This method aggregates data across all recall sets to provide
   * a comprehensive snapshot of the user's learning activity. It includes:
   * - Total counts (sets, sessions, study time)
   * - Today's activity summary
   * - Points due for review
   * - Recent session history
   * - Study streak information
   *
   * @returns Dashboard overview data ready for API response
   *
   * @example
   * ```typescript
   * const overview = await aggregator.getOverview();
   * console.log(`Total study time: ${overview.totalStudyTimeMs / 60000} minutes`);
   * console.log(`Points due today: ${overview.pointsDueToday}`);
   * console.log(`Current streak: ${overview.currentStreak} days`);
   * ```
   */
  async getOverview(): Promise<DashboardOverview> {
    // Fetch all recall sets to calculate totals and filter by status
    const allRecallSets = await this.recallSetRepo.findAll();
    const totalRecallSets = allRecallSets.length;
    const activeRecallSets = allRecallSets.filter(
      (rs) => rs.status === 'active'
    ).length;

    // Fetch all sessions for aggregate calculations
    const allSessions = await this.sessionRepo.findAll();
    const totalSessions = allSessions.length;

    // Calculate aggregate metrics across all recall sets
    // We use the analytics calculator for efficient aggregation
    const globalAnalytics = await this.analyticsCalc.calculateGlobalAnalytics();
    const totalStudyTimeMs = globalAnalytics.totalStudyTimeMs;
    const overallRecallRate = globalAnalytics.overallRecallRate;

    // Calculate today's activity by filtering sessions started today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todaysSessions = allSessions.filter(
      (s) => s.startedAt >= today
    ).length;

    // Get today's study time from metrics for sessions that started today
    const todaysStudyTimeMs = await this.calculateTodaysStudyTime(
      allSessions,
      today
    );

    // Count points due today across all active recall sets
    const pointsDueToday = await this.countPointsDueToday(allRecallSets);

    // Get recent sessions with their metrics for the activity feed
    const recentSessions = await this.getRecentSessions(
      allSessions,
      allRecallSets,
      RECENT_SESSIONS_LIMIT
    );

    // Get upcoming reviews prioritized by urgency
    const upcomingReviews = await this.getUpcomingReviews(UPCOMING_REVIEWS_LIMIT);

    // Calculate study streaks from session history
    const { current: currentStreak, longest: longestStreak } =
      await this.calculateStreak(allSessions);

    return {
      totalRecallSets,
      activeRecallSets,
      totalSessions,
      totalStudyTimeMs,
      overallRecallRate,
      todaysSessions,
      todaysStudyTimeMs,
      pointsDueToday,
      recentSessions,
      upcomingReviews,
      currentStreak,
      longestStreak,
    };
  }

  /**
   * Get detailed dashboard data for a single recall set.
   *
   * This method provides comprehensive analytics for a specific recall set,
   * including aggregate stats, point status breakdown, historical trends,
   * and detailed point information. Suitable for a dedicated recall set
   * detail page in the dashboard.
   *
   * @param recallSetId - The ID of the recall set to analyze
   * @returns Detailed dashboard data for the recall set
   * @throws Error if the recall set is not found
   *
   * @example
   * ```typescript
   * const dashboard = await aggregator.getRecallSetDashboard('rs_spanish_vocab');
   * console.log(`Total sessions: ${dashboard.stats.totalSessions}`);
   * console.log(`Mastered points: ${dashboard.points.mastered}`);
   * console.log(`Struggling points: ${dashboard.points.struggling}`);
   * ```
   */
  async getRecallSetDashboard(recallSetId: string): Promise<RecallSetDashboard> {
    // Fetch the recall set to verify it exists and get basic info
    const recallSet = await this.recallSetRepo.findById(recallSetId);
    if (!recallSet) {
      throw new Error(`RecallSet with id '${recallSetId}' not found`);
    }

    // Get comprehensive analytics from the analytics calculator
    // This includes aggregate stats, trends, and per-point analytics
    const analytics = await this.analyticsCalc.calculateRecallSetAnalytics(
      recallSetId
    );

    // Build point status breakdown by categorizing all points
    const points = await this.calculatePointStatusBreakdown(recallSetId);

    // Convert trend data to chart-friendly format (ISO date strings)
    const recallRateHistory = this.toChartData(analytics.recallRateTrend);
    const engagementHistory = this.toChartData(analytics.engagementTrend);

    // Get recent sessions for this specific recall set
    const allSessions = await this.sessionRepo.findAll();
    const setSessions = allSessions.filter(
      (s) => s.recallSetId === recallSetId
    );
    const recentSessions = await this.getRecentSessions(
      setSessions,
      [recallSet],
      RECENT_SESSIONS_LIMIT
    );

    // Build point summaries with status for the point list view
    const pointDetails = await this.buildPointSummaries(recallSetId);

    return {
      recallSet: {
        id: recallSet.id,
        name: recallSet.name,
        description: recallSet.description,
        status: recallSet.status,
        createdAt: recallSet.createdAt,
      },
      stats: {
        totalSessions: analytics.totalSessions,
        totalTimeMs: analytics.totalTimeSpentMs,
        avgRecallRate: analytics.overallRecallRate,
        avgEngagement: analytics.avgEngagementScore,
        totalCostUsd: analytics.totalCostUsd,
      },
      points,
      recallRateHistory,
      engagementHistory,
      recentSessions,
      pointDetails,
    };
  }

  /**
   * Get all upcoming reviews across all sets.
   *
   * Retrieves recall points that are due or will be due soon,
   * sorted by urgency (overdue first, then soonest due date).
   * Points are categorized by priority for visual indicators.
   *
   * @param limit - Maximum number of reviews to return (default: all)
   * @returns Array of upcoming reviews sorted by priority
   *
   * @example
   * ```typescript
   * const reviews = await aggregator.getUpcomingReviews(10);
   * const overdue = reviews.filter(r => r.priority === 'overdue');
   * console.log(`${overdue.length} points are overdue!`);
   * ```
   */
  async getUpcomingReviews(limit?: number): Promise<UpcomingReview[]> {
    // Get all recall sets to map point IDs to set names
    const allRecallSets = await this.recallSetRepo.findAll();
    const activeRecallSets = allRecallSets.filter((rs) => rs.status === 'active');

    // Build a map for efficient recall set lookup
    const recallSetMap = new Map<string, RecallSet>();
    for (const rs of allRecallSets) {
      recallSetMap.set(rs.id, rs);
    }

    // Collect all recall points from active sets
    const upcomingReviews: UpcomingReview[] = [];

    // Calculate the cutoff date for "upcoming" reviews (7 days from now)
    const upcomingCutoff = new Date();
    upcomingCutoff.setDate(upcomingCutoff.getDate() + UPCOMING_REVIEW_DAYS);

    // Process each active recall set to find due/upcoming points
    for (const recallSet of activeRecallSets) {
      const points = await this.recallPointRepo.findByRecallSetId(recallSet.id);

      for (const point of points) {
        // Skip points that are due far in the future
        const dueDate = point.fsrsState.due;
        if (dueDate && dueDate > upcomingCutoff) {
          continue;
        }

        // Calculate days until due
        const daysUntilDue = this.calculateDaysUntilDue(dueDate);

        // Determine priority based on due date
        const priority = this.determinePriority(daysUntilDue);

        upcomingReviews.push({
          recallPointId: point.id,
          recallPointContent: point.content,
          recallSetId: recallSet.id,
          recallSetName: recallSet.name,
          dueDate: dueDate ?? new Date(), // null means due now
          daysUntilDue,
          priority,
        });
      }
    }

    // Sort by priority: overdue first (most negative days), then soonest
    upcomingReviews.sort((a, b) => a.daysUntilDue - b.daysUntilDue);

    // Apply limit if specified
    if (limit !== undefined && limit > 0) {
      return upcomingReviews.slice(0, limit);
    }

    return upcomingReviews;
  }

  /**
   * Calculate point status breakdown for a recall set.
   *
   * Categorizes all recall points in a set by their current learning status:
   * - mastered: stability > 30 days (well-retained)
   * - struggling: success rate < 50% with at least 3 attempts
   * - new: never reviewed (no FSRS history)
   * - dueNow: due date is today or earlier
   *
   * @param recallSetId - The ID of the recall set to analyze
   * @returns Breakdown of points by status
   */
  private async calculatePointStatusBreakdown(
    recallSetId: string
  ): Promise<PointStatusBreakdown> {
    // Get all points for the recall set
    const points = await this.recallPointRepo.findByRecallSetId(recallSetId);

    // Initialize counters
    let total = 0;
    let dueNow = 0;
    let mastered = 0;
    let struggling = 0;
    let newPoints = 0;

    // Get analytics for each point to access success rates
    const pointAnalyticsPromises = points.map((point) =>
      this.analyticsCalc.calculatePointAnalytics(point.id)
    );
    const pointAnalytics = await Promise.all(pointAnalyticsPromises);

    // Build a map for efficient lookup
    const analyticsMap = new Map(
      pointAnalytics.map((pa) => [pa.recallPointId, pa])
    );

    const now = new Date();

    for (const point of points) {
      total++;

      // Check if point is new (never reviewed)
      // A point is new if it has no review history (reps === 0)
      if (point.fsrsState.reps === 0) {
        newPoints++;
        // New points are also due now since they haven't been reviewed
        dueNow++;
        continue;
      }

      // Get analytics for this point
      const analytics = analyticsMap.get(point.id);

      // Check if due now (due date <= today)
      const dueDate = point.fsrsState.due;
      if (dueDate && dueDate <= now) {
        dueNow++;
      }

      // Check if mastered (stability > 30 days)
      if (point.fsrsState.stability > MASTERED_STABILITY_THRESHOLD) {
        mastered++;
        continue;
      }

      // Check if struggling (success rate < 50% with 3+ attempts)
      if (analytics) {
        const attempts = point.recallHistory.length;
        if (
          analytics.successRate < STRUGGLING_SUCCESS_RATE_THRESHOLD &&
          attempts >= STRUGGLING_MIN_ATTEMPTS
        ) {
          struggling++;
        }
      }
    }

    return {
      total,
      dueNow,
      mastered,
      struggling,
      newPoints,
    };
  }

  /**
   * Calculate current study streak (consecutive days with sessions).
   *
   * A streak is counted as consecutive days where at least one session
   * was started. The streak is maintained if a session was completed today
   * or yesterday. Returns both the current streak and the longest streak
   * ever achieved.
   *
   * @param sessions - Array of all sessions to analyze
   * @returns Object with current and longest streak values
   */
  private async calculateStreak(
    sessions: Session[]
  ): Promise<{ current: number; longest: number }> {
    // Handle empty state - no sessions means no streak
    if (sessions.length === 0) {
      return { current: 0, longest: 0 };
    }

    // Extract unique dates (ignoring time) from session start times
    // Use a Set to ensure each date is only counted once
    const sessionDates = new Set<string>();
    for (const session of sessions) {
      const dateKey = session.startedAt.toISOString().split('T')[0];
      sessionDates.add(dateKey);
    }

    // Calculate current streak by counting consecutive days from today/yesterday
    let currentStreak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if there's a session today or yesterday to start the streak
    const todayKey = today.toISOString().split('T')[0];
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = yesterday.toISOString().split('T')[0];

    // The streak is only active if there was a session today or yesterday
    const streakIsActive =
      sessionDates.has(todayKey) || sessionDates.has(yesterdayKey);

    if (streakIsActive) {
      // Start counting from the most recent session date
      let checkDate = sessionDates.has(todayKey) ? today : yesterday;

      // Count consecutive days backwards
      while (true) {
        const checkKey = checkDate.toISOString().split('T')[0];
        if (sessionDates.has(checkKey)) {
          currentStreak++;
          // Move to the previous day
          checkDate = new Date(checkDate);
          checkDate.setDate(checkDate.getDate() - 1);
        } else {
          // Streak broken - no session on this day
          break;
        }
      }
    }

    // Calculate longest streak ever by finding the maximum consecutive sequence
    let longestStreak = 0;
    let tempStreak = 0;
    let prevDate: Date | null = null;

    // Process dates in chronological order for longest streak calculation
    const chronologicalDates = Array.from(sessionDates).sort();

    for (const dateKey of chronologicalDates) {
      const currentDate = new Date(dateKey);

      if (prevDate === null) {
        // First date - start counting
        tempStreak = 1;
      } else {
        // Check if this date is consecutive (exactly 1 day after previous)
        const dayDiff = Math.round(
          (currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (dayDiff === 1) {
          // Consecutive - extend the streak
          tempStreak++;
        } else {
          // Not consecutive - start new streak
          tempStreak = 1;
        }
      }

      // Update longest if current streak is longer
      if (tempStreak > longestStreak) {
        longestStreak = tempStreak;
      }

      prevDate = currentDate;
    }

    return { current: currentStreak, longest: longestStreak };
  }

  /**
   * Convert analytics trend data to chart-friendly format.
   *
   * Transforms TrendData (with Date objects) to ChartDataPoint format
   * (with ISO date strings) for compatibility with charting libraries.
   *
   * @param data - Array of trend data with Date objects
   * @returns Array of chart data points with ISO date strings
   */
  private toChartData(
    data: Array<{ date: Date; value: number }>
  ): ChartDataPoint[] {
    return data.map((d) => ({
      date: d.date.toISOString().split('T')[0],
      value: d.value,
    }));
  }

  /**
   * Determine status label for a recall point.
   *
   * Categorizes a recall point based on its learning metrics:
   * - 'new': Never reviewed (0 attempts)
   * - 'struggling': Low success rate (< 50%) with sufficient attempts (3+)
   * - 'mastered': High stability (> 30 days)
   * - 'learning': Everything else - actively being learned
   *
   * @param successRate - Success rate across all attempts (0.0 to 1.0)
   * @param attempts - Total number of recall attempts
   * @param stability - Current FSRS stability value in days
   * @returns Status category for the point
   */
  private getPointStatus(
    successRate: number,
    attempts: number,
    stability: number
  ): 'mastered' | 'learning' | 'struggling' | 'new' {
    // Check for new points first (no attempts)
    if (attempts === 0) {
      return 'new';
    }

    // Check for struggling points (low success with enough data)
    if (
      successRate < STRUGGLING_SUCCESS_RATE_THRESHOLD &&
      attempts >= STRUGGLING_MIN_ATTEMPTS
    ) {
      return 'struggling';
    }

    // Check for mastered points (high stability)
    if (stability > MASTERED_STABILITY_THRESHOLD) {
      return 'mastered';
    }

    // Default to learning for everything else
    return 'learning';
  }

  /**
   * Calculate days until a recall point is due.
   *
   * @param dueDate - The FSRS-calculated due date, or null if never reviewed
   * @returns Days until due (negative if overdue, 0 if due today)
   */
  private calculateDaysUntilDue(dueDate: Date | null): number {
    // Null due date means never reviewed - treat as due now (0 days)
    if (!dueDate) {
      return 0;
    }

    const now = new Date();
    const diffMs = dueDate.getTime() - now.getTime();

    // Convert to days, rounding toward zero for accurate day count
    // Use floor for positive (future) and ceil for negative (overdue)
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }

  /**
   * Determine review priority based on days until due.
   *
   * @param daysUntilDue - Days until the point is due
   * @returns Priority category for visual indicators
   */
  private determinePriority(
    daysUntilDue: number
  ): 'overdue' | 'due-today' | 'upcoming' {
    if (daysUntilDue < 0) {
      return 'overdue';
    } else if (daysUntilDue === 0) {
      return 'due-today';
    } else {
      return 'upcoming';
    }
  }

  /**
   * Calculate today's total study time from session metrics.
   *
   * @param sessions - All sessions to filter
   * @param today - Today's date at midnight
   * @returns Total study time for today in milliseconds
   */
  private async calculateTodaysStudyTime(
    sessions: Session[],
    today: Date
  ): Promise<number> {
    // Filter sessions that started today
    const todaysSessions = sessions.filter((s) => s.startedAt >= today);

    // Sum up the duration from metrics for each session
    let totalTimeMs = 0;

    for (const session of todaysSessions) {
      const metrics = await this.metricsRepo.findBySessionId(session.id);
      if (metrics) {
        totalTimeMs += metrics.durationMs;
      }
    }

    return totalTimeMs;
  }

  /**
   * Count recall points due today across all active recall sets.
   *
   * @param recallSets - All recall sets to check
   * @returns Number of points due today
   */
  private async countPointsDueToday(recallSets: RecallSet[]): Promise<number> {
    const activeRecallSets = recallSets.filter((rs) => rs.status === 'active');

    // Get end of today for the due date check
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    let count = 0;

    for (const recallSet of activeRecallSets) {
      // findDuePoints returns points where due date <= the specified time
      const duePoints = await this.recallPointRepo.findDuePoints(
        recallSet.id,
        endOfToday
      );
      count += duePoints.length;
    }

    return count;
  }

  /**
   * Get recent sessions with their metrics as SessionSummary objects.
   *
   * @param sessions - Sessions to process
   * @param recallSets - Recall sets for name lookup
   * @param limit - Maximum number of sessions to return
   * @returns Array of session summaries sorted by start time (most recent first)
   */
  private async getRecentSessions(
    sessions: Session[],
    recallSets: RecallSet[],
    limit: number
  ): Promise<SessionSummary[]> {
    // Build a map for efficient recall set lookup
    const recallSetMap = new Map<string, RecallSet>();
    for (const rs of recallSets) {
      recallSetMap.set(rs.id, rs);
    }

    // Sort sessions by start time (most recent first) and take the limit
    const sortedSessions = [...sessions]
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, limit);

    // Build session summaries with metrics
    const summaries: SessionSummary[] = [];

    for (const session of sortedSessions) {
      // Get the metrics for this session
      const metrics = await this.metricsRepo.findBySessionId(session.id);

      // Get the recall set name
      const recallSet = recallSetMap.get(session.recallSetId);
      const recallSetName = recallSet?.name ?? 'Unknown';

      summaries.push({
        id: session.id,
        recallSetId: session.recallSetId,
        recallSetName,
        startedAt: session.startedAt,
        durationMs: metrics?.durationMs ?? 0,
        recallRate: metrics?.overallRecallRate ?? 0,
        engagementScore: metrics?.engagementScore ?? 0,
        status: session.status,
      });
    }

    return summaries;
  }

  /**
   * Build point summaries with status for a recall set.
   *
   * @param recallSetId - The ID of the recall set
   * @returns Array of point summaries with their current status
   */
  private async buildPointSummaries(
    recallSetId: string
  ): Promise<RecallPointSummary[]> {
    // Get all points for the recall set
    const points = await this.recallPointRepo.findByRecallSetId(recallSetId);

    // Get analytics for each point
    const analyticsPromises = points.map((point) =>
      this.analyticsCalc.calculatePointAnalytics(point.id)
    );
    const pointAnalytics = await Promise.all(analyticsPromises);

    // Build a map for efficient lookup
    const analyticsMap = new Map(
      pointAnalytics.map((pa) => [pa.recallPointId, pa])
    );

    // Build summaries
    const summaries: RecallPointSummary[] = [];

    for (const point of points) {
      const analytics = analyticsMap.get(point.id);
      const attempts = point.recallHistory.length;
      const successRate = analytics?.successRate ?? 0;
      const stability = point.fsrsState.stability;
      const daysUntilDue = this.calculateDaysUntilDue(point.fsrsState.due);

      // Determine status based on metrics
      const status = this.getPointStatus(successRate, attempts, stability);

      summaries.push({
        id: point.id,
        content: point.content,
        successRate,
        daysUntilDue,
        status,
      });
    }

    return summaries;
  }
}
