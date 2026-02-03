/**
 * Analytics Types for Session Analytics Calculator
 *
 * This module defines types for aggregate analytics across sessions.
 * These types support recall trends, engagement patterns, and performance
 * insights for individual recall sets and overall usage.
 *
 * The analytics module provides three levels of insights:
 * 1. GlobalAnalytics - System-wide overview of all recall activity
 * 2. RecallSetAnalytics - Detailed analytics for a specific recall set
 * 3. RecallPointAnalytics - Granular analytics for individual recall points
 *
 * All analytics types are designed to be computed from stored session data
 * and cached or recomputed as needed for dashboard displays.
 */

/**
 * A single data point in a time series trend.
 *
 * TrendData is used to track how metrics change over time,
 * enabling visualization of progress charts and identifying patterns.
 * Each data point represents an aggregated value for a specific date.
 *
 * @example
 * ```typescript
 * const dailyRecallRates: TrendData[] = [
 *   { date: new Date('2024-01-15'), value: 0.75 },
 *   { date: new Date('2024-01-16'), value: 0.82 },
 *   { date: new Date('2024-01-17'), value: 0.78 },
 * ];
 * ```
 */
export interface TrendData {
  /**
   * The date this data point represents.
   * Typically represents a day, but could be used for weekly/monthly aggregations.
   */
  date: Date;

  /**
   * The aggregated value for this date.
   * Interpretation depends on context (e.g., recall rate 0-1, engagement 0-100).
   */
  value: number;
}

/**
 * Comprehensive analytics for a single recall set.
 *
 * RecallSetAnalytics provides a complete picture of performance for
 * a recall set, including aggregate statistics, trend data, and
 * detailed per-point analytics. This is the primary analytics type
 * used for recall set dashboards and progress reports.
 *
 * @example
 * ```typescript
 * const analytics: RecallSetAnalytics = {
 *   recallSetId: 'rs_spanish_vocab',
 *   recallSetName: 'Spanish Vocabulary',
 *   totalSessions: 45,
 *   totalTimeSpentMs: 5400000, // 90 minutes
 *   overallRecallRate: 0.78,
 *   avgEngagementScore: 82,
 *   recallRateTrend: [...],
 *   engagementTrend: [...],
 *   pointAnalytics: [...],
 *   topRabbitholeTopics: [
 *     { topic: 'Regional dialects', count: 5, avgDepth: 1.5 }
 *   ],
 *   totalCostUsd: 2.35,
 * };
 * ```
 */
export interface RecallSetAnalytics {
  /**
   * Unique identifier of the recall set being analyzed.
   */
  recallSetId: string;

  /**
   * Human-readable name of the recall set.
   * Included for display convenience.
   */
  recallSetName: string;

  /**
   * Total number of sessions completed for this recall set.
   * Counts all sessions regardless of status (completed/abandoned).
   */
  totalSessions: number;

  /**
   * Total time spent across all sessions in milliseconds.
   * Useful for tracking study time investment.
   */
  totalTimeSpentMs: number;

  /**
   * Aggregate recall success rate across all sessions (0.0 to 1.0).
   * Calculated as total successful recalls / total recall attempts.
   */
  overallRecallRate: number;

  /**
   * Average engagement score across all sessions (0-100).
   * Higher scores indicate more focused, productive sessions.
   */
  avgEngagementScore: number;

  /**
   * Daily/weekly trend of recall rates over time.
   * Each point represents the average recall rate for that date.
   * Useful for visualizing learning progress.
   */
  recallRateTrend: TrendData[];

  /**
   * Daily/weekly trend of engagement scores over time.
   * Each point represents the average engagement for that date.
   * Helps identify patterns in study quality.
   */
  engagementTrend: TrendData[];

  /**
   * Detailed analytics for each recall point in the set.
   * Enables identification of struggling points and mastery.
   */
  pointAnalytics: RecallPointAnalytics[];

  /**
   * Most frequent rabbithole topics with their occurrence counts.
   * Helps identify common areas of curiosity or confusion.
   */
  topRabbitholeTopics: {
    /** The tangent topic that occurred */
    topic: string;
    /** Number of times this topic appeared as a rabbithole */
    count: number;
    /** Average depth of rabbitholes for this topic (1-3 scale) */
    avgDepth: number;
  }[];

  /**
   * Total estimated API cost in USD for all sessions.
   * Useful for budgeting and cost monitoring.
   */
  totalCostUsd: number;
}

/**
 * Granular analytics for a single recall point.
 *
 * RecallPointAnalytics provides detailed performance data for an
 * individual recall point, including success rates, FSRS state,
 * and indicators of whether the point is struggling.
 *
 * This data helps identify which specific pieces of knowledge
 * need more practice or different learning approaches.
 *
 * @example
 * ```typescript
 * const pointAnalytics: RecallPointAnalytics = {
 *   recallPointId: 'rp_spanish_hola',
 *   content: 'Hola means "Hello" in Spanish',
 *   successRate: 0.92,
 *   avgConfidence: 0.88,
 *   avgTimeToRecallMs: 3500,
 *   currentStability: 25.5,
 *   currentDifficulty: 4.2,
 *   daysUntilDue: 12,
 *   isStruggling: false,
 * };
 * ```
 */
export interface RecallPointAnalytics {
  /**
   * Unique identifier of the recall point.
   */
  recallPointId: string;

  /**
   * The content/knowledge being tested.
   * Included for display convenience.
   */
  content: string;

  /**
   * Success rate across all attempts for this point (0.0 to 1.0).
   * Calculated as successful recalls / total attempts.
   */
  successRate: number;

  /**
   * Average confidence score across all attempts (0.0 to 1.0).
   * Reflects how certain the system was in recall assessments.
   */
  avgConfidence: number;

  /**
   * Average time taken to recall this point in milliseconds.
   * Longer times may indicate difficulty even with successful recalls.
   */
  avgTimeToRecallMs: number;

  /**
   * Current FSRS stability value.
   * Represents the estimated interval (in days) where retention
   * probability is 90%. Higher stability = better retention.
   */
  currentStability: number;

  /**
   * Current FSRS difficulty value (1.0 to 10.0 scale).
   * Higher values indicate the point is harder to remember.
   * This affects how intervals are calculated by FSRS.
   */
  currentDifficulty: number;

  /**
   * Days until this recall point is due for review.
   * Positive values = due in the future.
   * Zero or negative = currently due or overdue.
   */
  daysUntilDue: number;

  /**
   * Whether this recall point is identified as struggling.
   * True when success rate < 50% with at least 3 attempts.
   * These points may need additional attention or restructuring.
   */
  isStruggling: boolean;
}

/**
 * System-wide analytics across all recall sets.
 *
 * GlobalAnalytics provides a high-level overview of the entire
 * learning system, including total activity counts, aggregate
 * performance metrics, and recent activity trends.
 *
 * This is typically displayed on the main dashboard for
 * overall progress tracking and system health monitoring.
 *
 * @example
 * ```typescript
 * const globalStats: GlobalAnalytics = {
 *   totalRecallSets: 5,
 *   activeRecallSets: 3,
 *   totalSessions: 127,
 *   totalStudyTimeMs: 9600000, // 160 minutes
 *   overallRecallRate: 0.76,
 *   totalCostUsd: 8.45,
 *   recentActivity: [
 *     { date: new Date('2024-01-18'), value: 3 },
 *     { date: new Date('2024-01-19'), value: 5 },
 *     { date: new Date('2024-01-20'), value: 2 },
 *   ],
 * };
 * ```
 */
export interface GlobalAnalytics {
  /**
   * Total number of recall sets in the system.
   * Includes all statuses (active, paused, archived).
   */
  totalRecallSets: number;

  /**
   * Number of recall sets with 'active' status.
   * These are the sets available for recall sessions.
   */
  activeRecallSets: number;

  /**
   * Total number of sessions across all recall sets.
   * Counts all sessions regardless of status.
   */
  totalSessions: number;

  /**
   * Total study time across all sessions in milliseconds.
   * Sum of duration from all session metrics.
   */
  totalStudyTimeMs: number;

  /**
   * Aggregate recall success rate across all sessions (0.0 to 1.0).
   * Weighted average across all recall attempts.
   */
  overallRecallRate: number;

  /**
   * Total estimated API cost in USD across all sessions.
   * Cumulative spending for cost tracking.
   */
  totalCostUsd: number;

  /**
   * Recent activity trend showing sessions per day.
   * Typically covers the last 30 days.
   * Each point's value represents the number of sessions that day.
   */
  recentActivity: TrendData[];
}
