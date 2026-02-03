/**
 * OverviewStats Component
 *
 * Displays a responsive grid of StatCard components showing key metrics
 * from the dashboard overview. Shows total recall sets, active sets,
 * total points, total sessions, overall recall rate, and total study time.
 *
 * This component is designed to be the primary "at a glance" section
 * at the top of the dashboard, giving users immediate visibility into
 * their learning progress.
 *
 * @example
 * ```tsx
 * <OverviewStats
 *   totalSets={10}
 *   activeSets={8}
 *   totalPoints={150}
 *   totalSessions={25}
 *   overallRecallRate={0.82}
 *   totalStudyTimeMs={3600000}
 * />
 * ```
 */

import { StatCard } from '@/components/ui';

// ============================================================================
// Type Definitions
// ============================================================================

export interface OverviewStatsProps {
  /** Total number of recall sets created by the user */
  totalSets: number;
  /** Number of recall sets that are currently active (not paused/archived) */
  activeSets: number;
  /** Total number of recall points across all sets */
  totalPoints: number;
  /** Total number of completed study sessions */
  totalSessions: number;
  /** Overall recall success rate as a decimal (0.0 to 1.0) */
  overallRecallRate: number;
  /** Total study time in milliseconds */
  totalStudyTimeMs: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Formats milliseconds into a human-readable duration string.
 * Returns format like "2h 30m" or "45m" or "< 1m".
 *
 * @param ms - Duration in milliseconds
 * @returns Formatted duration string
 */
function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / (1000 * 60));
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  // Handle case where duration is less than a minute
  if (minutes < 1) {
    return '< 1m';
  }

  // Format with hours and minutes if applicable
  if (hours > 0) {
    return remainingMinutes > 0
      ? `${hours}h ${remainingMinutes}m`
      : `${hours}h`;
  }

  return `${minutes}m`;
}

/**
 * Formats a decimal percentage (0.0 to 1.0) as a display string.
 * Returns "N/A" if no data is available (indicated by 0 or NaN).
 *
 * @param rate - Recall rate as a decimal
 * @returns Formatted percentage string like "82%"
 */
function formatRecallRate(rate: number): string {
  // Handle edge cases where rate might be NaN or there's no data
  if (isNaN(rate) || rate === 0) {
    return 'N/A';
  }
  return `${Math.round(rate * 100)}%`;
}

// ============================================================================
// Icons for StatCards
// ============================================================================

/**
 * Book/library icon for recall sets statistic
 */
function SetsIcon() {
  return (
    <svg
      className="w-6 h-6"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
      />
    </svg>
  );
}

/**
 * Lightbulb icon for recall points statistic
 */
function PointsIcon() {
  return (
    <svg
      className="w-6 h-6"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
      />
    </svg>
  );
}

/**
 * Clock icon for sessions statistic
 */
function SessionsIcon() {
  return (
    <svg
      className="w-6 h-6"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

/**
 * Chart/trending icon for recall rate statistic
 */
function RecallRateIcon() {
  return (
    <svg
      className="w-6 h-6"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
      />
    </svg>
  );
}

/**
 * Timer icon for study time statistic
 */
function StudyTimeIcon() {
  return (
    <svg
      className="w-6 h-6"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

/**
 * Checkmark/active icon for active sets statistic
 */
function ActiveIcon() {
  return (
    <svg
      className="w-6 h-6"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * OverviewStats renders a responsive grid of key metrics.
 * Uses a 1-column layout on mobile, 2 columns on tablet, and 3 columns on desktop.
 */
export function OverviewStats({
  totalSets,
  activeSets,
  totalPoints,
  totalSessions,
  overallRecallRate,
  totalStudyTimeMs,
}: OverviewStatsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {/* Total Recall Sets - primary count of all sets */}
      <StatCard
        label="Total Recall Sets"
        value={totalSets}
        icon={<SetsIcon />}
      />

      {/* Active Sets - shows how many sets are currently in use */}
      <StatCard
        label="Active Sets"
        value={activeSets}
        icon={<ActiveIcon />}
      />

      {/* Total Points - sum of all recall points across sets */}
      <StatCard
        label="Total Points"
        value={totalPoints}
        icon={<PointsIcon />}
      />

      {/* Total Sessions - completed study sessions count */}
      <StatCard
        label="Total Sessions"
        value={totalSessions}
        icon={<SessionsIcon />}
      />

      {/* Overall Recall Rate - average success rate */}
      <StatCard
        label="Recall Rate"
        value={formatRecallRate(overallRecallRate)}
        icon={<RecallRateIcon />}
      />

      {/* Total Study Time - formatted duration */}
      <StatCard
        label="Study Time"
        value={formatDuration(totalStudyTimeMs)}
        icon={<StudyTimeIcon />}
      />
    </div>
  );
}
