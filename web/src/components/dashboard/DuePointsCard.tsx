/**
 * DuePointsCard Component
 *
 * A prominent card displaying the number of recall points due for review today.
 * This is designed to be one of the first things a user sees on the dashboard,
 * encouraging them to start a study session if they have pending reviews.
 *
 * Features:
 * - Large, attention-grabbing number display
 * - Visual indicator when points are due (amber highlight)
 * - Call-to-action button to start studying
 * - Graceful empty state when nothing is due
 *
 * @example
 * ```tsx
 * <DuePointsCard
 *   duePoints={15}
 *   todaysSessions={2}
 *   todaysStudyTimeMs={1800000}
 * />
 * ```
 */

import { Link } from 'react-router-dom';
import { Card, CardHeader, CardBody, Button, Badge } from '@/components/ui';

// ============================================================================
// Type Definitions
// ============================================================================

export interface DuePointsCardProps {
  /** Number of recall points due for review today */
  duePoints: number;
  /** Number of sessions completed today (for context) */
  todaysSessions: number;
  /** Study time today in milliseconds (for context) */
  todaysStudyTimeMs: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Formats milliseconds into a human-readable duration string.
 *
 * @param ms - Duration in milliseconds
 * @returns Formatted duration string
 */
function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / (1000 * 60));
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (minutes < 1) {
    return '0m';
  }

  if (hours > 0) {
    return remainingMinutes > 0
      ? `${hours}h ${remainingMinutes}m`
      : `${hours}h`;
  }

  return `${minutes}m`;
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * DuePointsCard displays today's review status prominently.
 * Shows points due, today's activity summary, and a link to start studying.
 */
export function DuePointsCard({
  duePoints,
  todaysSessions,
  todaysStudyTimeMs,
}: DuePointsCardProps) {
  // Determine if user has pending reviews
  const hasDuePoints = duePoints > 0;

  return (
    <Card data-testid="due-points-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <span>Today&apos;s Reviews</span>
          {/* Show a badge indicating urgency when points are due */}
          {hasDuePoints && (
            <Badge status="warning">Action Needed</Badge>
          )}
        </div>
      </CardHeader>
      <CardBody>
        {/* Main due points display - large and prominent, responsive text sizing */}
        <div className="text-center py-3 sm:py-4">
          <p className={`text-4xl sm:text-5xl font-bold ${hasDuePoints ? 'text-amber-600' : 'text-green-600'}`}>
            {duePoints}
          </p>
          <p className="text-sm sm:text-base text-gray-500 mt-1">
            {hasDuePoints
              ? `point${duePoints === 1 ? '' : 's'} due for review`
              : 'All caught up!'}
          </p>
        </div>

        {/* Today's activity summary - responsive text */}
        <div className="flex justify-around border-t border-gray-200 pt-3 sm:pt-4 mt-3 sm:mt-4">
          <div className="text-center">
            <p className="text-xl sm:text-2xl font-semibold text-gray-700">{todaysSessions}</p>
            <p className="text-xs sm:text-sm text-gray-500">
              session{todaysSessions === 1 ? '' : 's'} today
            </p>
          </div>
          <div className="text-center">
            <p className="text-xl sm:text-2xl font-semibold text-gray-700">
              {formatDuration(todaysStudyTimeMs)}
            </p>
            <p className="text-xs sm:text-sm text-gray-500">studied today</p>
          </div>
        </div>

        {/* Call-to-action button - links to recall sets to start a session */}
        {/* Full width on mobile for larger touch target */}
        {hasDuePoints && (
          <div className="mt-4 sm:mt-6 text-center">
            <Link to="/recall-sets" className="block sm:inline-block">
              <Button variant="primary" className="w-full sm:w-auto min-h-[44px]">
                Start Studying
              </Button>
            </Link>
          </div>
        )}

        {/* Encouraging message when all caught up */}
        {!hasDuePoints && (
          <div className="mt-4 sm:mt-6 text-center">
            <p className="text-xs sm:text-sm text-gray-500">
              Great job staying on top of your reviews!
            </p>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
