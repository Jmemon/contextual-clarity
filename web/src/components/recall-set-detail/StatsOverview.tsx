/**
 * StatsOverview Component
 *
 * Displays a row of summary statistics for a recall set.
 * Shows key metrics in a responsive grid layout using StatCard components.
 *
 * Metrics displayed:
 * - Total Points: Number of recall points in the set
 * - Due Now: Points currently due for review
 * - New Points: Points that have never been reviewed
 * - Sessions: Total study sessions for this set
 *
 * @example
 * ```tsx
 * <StatsOverview
 *   totalPoints={25}
 *   duePoints={8}
 *   newPoints={5}
 *   totalSessions={12}
 * />
 * ```
 */

import { StatCard, Spinner } from '@/components/ui';

export interface StatsOverviewProps {
  /** Total number of recall points in the set */
  totalPoints: number;
  /** Number of points due for review */
  duePoints: number;
  /** Number of new (never reviewed) points */
  newPoints: number;
  /** Total number of sessions for this set */
  totalSessions: number;
  /** Whether the data is currently loading */
  isLoading?: boolean;
}

/**
 * Statistics overview component showing key metrics.
 * Renders a responsive grid of stat cards.
 */
export function StatsOverview({
  totalPoints,
  duePoints,
  newPoints,
  totalSessions,
  isLoading = false,
}: StatsOverviewProps) {
  // Show loading state with spinner centered
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size="lg" label="Loading statistics..." />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Total Points stat card with icon */}
      <StatCard
        label="Total Points"
        value={totalPoints}
        icon={
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
              d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
            />
          </svg>
        }
      />

      {/* Due Now stat card - shows points ready for review */}
      <StatCard
        label="Due Now"
        value={duePoints}
        icon={
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
        }
        // Show up trend if there are due points (needs attention)
        trend={duePoints > 0 ? 'up' : 'neutral'}
        change={duePoints > 0 ? 'Ready to review' : 'All caught up'}
      />

      {/* New Points stat card - never reviewed items */}
      <StatCard
        label="New Points"
        value={newPoints}
        icon={
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
              d="M12 6v6m0 0v6m0-6h6m-6 0H6"
            />
          </svg>
        }
      />

      {/* Total Sessions stat card */}
      <StatCard
        label="Sessions"
        value={totalSessions}
        icon={
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
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
        }
      />
    </div>
  );
}

// Display name for React DevTools
StatsOverview.displayName = 'StatsOverview';
