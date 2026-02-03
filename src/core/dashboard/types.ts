/**
 * Dashboard Types for Web Dashboard Data Aggregation
 *
 * This module defines the data structures used by the dashboard data aggregator
 * to prepare API response shapes for the Phase 3 web dashboard. These types are
 * designed to be JSON-serializable and ready for frontend consumption.
 *
 * The dashboard module provides data at multiple levels:
 * 1. DashboardOverview - System-wide summary for the main dashboard view
 * 2. RecallSetDashboard - Detailed analytics for a single recall set
 * 3. UpcomingReview - Points that need review, prioritized by urgency
 *
 * All date fields use ISO strings (YYYY-MM-DD) for chart compatibility,
 * while timestamps remain as Date objects for full precision where needed.
 */

/**
 * Summary of a single session for list views.
 *
 * SessionSummary provides a lightweight representation of a session's
 * key metrics, suitable for displaying in session history lists or
 * recent activity sections of the dashboard.
 *
 * @example
 * ```typescript
 * const session: SessionSummary = {
 *   id: 'sess_abc123',
 *   recallSetId: 'rs_spanish_vocab',
 *   recallSetName: 'Spanish Vocabulary',
 *   startedAt: new Date('2024-01-20T10:30:00Z'),
 *   durationMs: 180000,
 *   recallRate: 0.75,
 *   engagementScore: 82,
 *   status: 'completed',
 * };
 * ```
 */
export interface SessionSummary {
  /** Unique identifier for the session */
  id: string;

  /** ID of the recall set this session belongs to */
  recallSetId: string;

  /** Human-readable name of the recall set (for display convenience) */
  recallSetName: string;

  /** When the session started */
  startedAt: Date;

  /** Total session duration in milliseconds */
  durationMs: number;

  /** Recall success rate for this session (0.0 to 1.0) */
  recallRate: number;

  /** Computed engagement score for this session (0-100) */
  engagementScore: number;

  /** Session lifecycle status ('completed', 'abandoned', 'in_progress') */
  status: string;
}

/**
 * Upcoming review information for a recall point.
 *
 * UpcomingReview represents a recall point that needs review, with
 * priority information to help users focus on the most urgent items.
 * The priority field categorizes items by urgency for visual indicators.
 *
 * @example
 * ```typescript
 * const review: UpcomingReview = {
 *   recallPointId: 'rp_hola',
 *   recallPointContent: 'Hola means "Hello" in Spanish',
 *   recallSetId: 'rs_spanish_vocab',
 *   recallSetName: 'Spanish Vocabulary',
 *   dueDate: new Date('2024-01-20'),
 *   daysUntilDue: -2,
 *   priority: 'overdue',
 * };
 * ```
 */
export interface UpcomingReview {
  /** Unique identifier of the recall point */
  recallPointId: string;

  /** The content/knowledge to be recalled (for display) */
  recallPointContent: string;

  /** ID of the recall set containing this point */
  recallSetId: string;

  /** Human-readable name of the recall set */
  recallSetName: string;

  /** When this recall point is due for review */
  dueDate: Date;

  /**
   * Days until this point is due.
   * - Negative values: overdue
   * - Zero: due today
   * - Positive values: due in the future
   */
  daysUntilDue: number;

  /**
   * Priority category for visual indicators and sorting.
   * - 'overdue': Past due date, needs immediate attention
   * - 'due-today': Due within the current day
   * - 'upcoming': Due in the near future (typically within 7 days)
   */
  priority: 'overdue' | 'due-today' | 'upcoming';
}

/**
 * Chart data point for time-series visualizations.
 *
 * ChartDataPoint uses ISO date strings (YYYY-MM-DD) for compatibility
 * with charting libraries. The optional label field can provide
 * additional context for tooltips or annotations.
 *
 * @example
 * ```typescript
 * const dataPoints: ChartDataPoint[] = [
 *   { date: '2024-01-15', value: 0.72 },
 *   { date: '2024-01-16', value: 0.78, label: '3 sessions' },
 *   { date: '2024-01-17', value: 0.85 },
 * ];
 * ```
 */
export interface ChartDataPoint {
  /** ISO date string in YYYY-MM-DD format */
  date: string;

  /** Numeric value for this data point */
  value: number;

  /** Optional label for tooltips or annotations */
  label?: string;
}

/**
 * Overview data for the main dashboard view.
 *
 * DashboardOverview aggregates key metrics across all recall sets,
 * providing a comprehensive snapshot of the user's learning activity.
 * This is the primary data structure for the main dashboard page.
 *
 * @example
 * ```typescript
 * const overview: DashboardOverview = {
 *   totalRecallSets: 5,
 *   activeRecallSets: 3,
 *   totalSessions: 127,
 *   totalStudyTimeMs: 9600000,
 *   overallRecallRate: 0.76,
 *   todaysSessions: 2,
 *   todaysStudyTimeMs: 360000,
 *   pointsDueToday: 15,
 *   recentSessions: [...],
 *   upcomingReviews: [...],
 *   currentStreak: 7,
 *   longestStreak: 14,
 * };
 * ```
 */
export interface DashboardOverview {
  /** Total number of recall sets in the system (all statuses) */
  totalRecallSets: number;

  /** Number of recall sets with 'active' status */
  activeRecallSets: number;

  /** Total number of sessions across all recall sets */
  totalSessions: number;

  /** Total study time across all sessions in milliseconds */
  totalStudyTimeMs: number;

  /** Aggregate recall success rate across all sessions (0.0 to 1.0) */
  overallRecallRate: number;

  /** Number of sessions completed today */
  todaysSessions: number;

  /** Study time for today's sessions in milliseconds */
  todaysStudyTimeMs: number;

  /** Number of recall points due for review today */
  pointsDueToday: number;

  /** Recent sessions for activity display (typically last 5-10) */
  recentSessions: SessionSummary[];

  /** Upcoming reviews prioritized by urgency */
  upcomingReviews: UpcomingReview[];

  /**
   * Current study streak in consecutive days.
   * Resets to 0 if no session was completed yesterday.
   */
  currentStreak: number;

  /** Longest study streak ever achieved in consecutive days */
  longestStreak: number;
}

/**
 * Point status breakdown for a recall set.
 *
 * PointStatusBreakdown categorizes recall points by their current
 * learning status, helping users understand their progress at a glance.
 *
 * @example
 * ```typescript
 * const breakdown: PointStatusBreakdown = {
 *   total: 50,
 *   dueNow: 8,
 *   mastered: 20,
 *   struggling: 3,
 *   newPoints: 12,
 * };
 * ```
 */
export interface PointStatusBreakdown {
  /** Total number of recall points in the set */
  total: number;

  /** Points currently due for review (due date <= today) */
  dueNow: number;

  /** Points considered mastered (stability > 30 days) */
  mastered: number;

  /** Points the user is struggling with (success rate < 50% with 3+ attempts) */
  struggling: number;

  /** Points never reviewed (no FSRS state/history) */
  newPoints: number;
}

/**
 * Summary of a recall point for list views.
 *
 * RecallPointSummary provides essential information about a recall point
 * for display in point lists or detailed breakdowns within the dashboard.
 *
 * @example
 * ```typescript
 * const point: RecallPointSummary = {
 *   id: 'rp_hola',
 *   content: 'Hola means "Hello" in Spanish',
 *   successRate: 0.92,
 *   daysUntilDue: 12,
 *   status: 'mastered',
 * };
 * ```
 */
export interface RecallPointSummary {
  /** Unique identifier of the recall point */
  id: string;

  /** The content/knowledge being tested */
  content: string;

  /** Success rate across all attempts (0.0 to 1.0) */
  successRate: number;

  /** Days until due (negative if overdue, 0 if due today) */
  daysUntilDue: number;

  /**
   * Current learning status of this point.
   * - 'mastered': High stability (> 30 days), well-retained
   * - 'learning': Actively being learned, moderate retention
   * - 'struggling': Low success rate (< 50%) with sufficient attempts
   * - 'new': Never reviewed, no FSRS state
   */
  status: 'mastered' | 'learning' | 'struggling' | 'new';
}

/**
 * Detailed dashboard data for a single recall set.
 *
 * RecallSetDashboard provides comprehensive analytics and status
 * information for a specific recall set, suitable for a dedicated
 * recall set detail page in the dashboard.
 *
 * @example
 * ```typescript
 * const dashboard: RecallSetDashboard = {
 *   recallSet: {
 *     id: 'rs_spanish_vocab',
 *     name: 'Spanish Vocabulary',
 *     description: 'Common Spanish words and phrases',
 *     status: 'active',
 *     createdAt: new Date('2024-01-01'),
 *   },
 *   stats: {
 *     totalSessions: 45,
 *     totalTimeMs: 5400000,
 *     avgRecallRate: 0.78,
 *     avgEngagement: 82,
 *     totalCostUsd: 2.35,
 *   },
 *   points: { total: 50, dueNow: 8, mastered: 20, struggling: 3, newPoints: 12 },
 *   recallRateHistory: [...],
 *   engagementHistory: [...],
 *   recentSessions: [...],
 *   pointDetails: [...],
 * };
 * ```
 */
export interface RecallSetDashboard {
  /** Basic information about the recall set */
  recallSet: {
    /** Unique identifier of the recall set */
    id: string;
    /** Human-readable name */
    name: string;
    /** Detailed description */
    description: string;
    /** Current lifecycle status */
    status: string;
    /** When the recall set was created */
    createdAt: Date;
  };

  /** Aggregate statistics for this recall set */
  stats: {
    /** Total number of sessions completed */
    totalSessions: number;
    /** Total study time in milliseconds */
    totalTimeMs: number;
    /** Average recall success rate (0.0 to 1.0) */
    avgRecallRate: number;
    /** Average engagement score (0-100) */
    avgEngagement: number;
    /** Total estimated API cost in USD */
    totalCostUsd: number;
  };

  /** Breakdown of recall points by learning status */
  points: PointStatusBreakdown;

  /** Historical recall rate data for charting (last 30 days) */
  recallRateHistory: ChartDataPoint[];

  /** Historical engagement data for charting (last 30 days) */
  engagementHistory: ChartDataPoint[];

  /** Recent sessions for this recall set (last 5-10) */
  recentSessions: SessionSummary[];

  /** Summary of all recall points with their current status */
  pointDetails: RecallPointSummary[];
}
