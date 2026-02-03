/**
 * UpcomingReviewsCard Component
 *
 * Displays a summary and list of recall points that are due for review
 * in the coming days. Groups reviews by priority (overdue, due today, upcoming)
 * and provides navigation to the relevant recall sets.
 *
 * Features:
 * - Summary counts by priority category
 * - Color-coded priority indicators
 * - Truncated list with "see more" capability
 * - Links to recall sets for studying
 *
 * @example
 * ```tsx
 * <UpcomingReviewsCard
 *   reviews={upcomingReviews}
 *   summary={{ total: 25, overdue: 5, dueToday: 10, upcoming: 10 }}
 *   isLoading={false}
 * />
 * ```
 */

import { Link } from 'react-router-dom';
import { Card, CardHeader, CardBody, Badge, EmptyState, Spinner, Button } from '@/components/ui';
import type { UpcomingReview } from '@/types/api';

// ============================================================================
// Type Definitions
// ============================================================================

export interface UpcomingReviewsCardProps {
  /** Array of upcoming review items */
  reviews: UpcomingReview[];
  /** Summary counts by priority */
  summary: {
    total: number;
    overdue: number;
    dueToday: number;
    upcoming: number;
  };
  /** Whether the data is currently loading */
  isLoading?: boolean;
  /** Error that occurred while fetching (if any) */
  error?: Error | null;
  /** Callback to retry fetching on error */
  onRetry?: () => void;
  /** Maximum number of reviews to display (default: 5) */
  maxDisplay?: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Returns the Badge status and label based on review priority.
 */
function getPriorityBadge(priority: UpcomingReview['priority']): {
  status: 'error' | 'warning' | 'info';
  label: string;
} {
  switch (priority) {
    case 'overdue':
      return { status: 'error', label: 'Overdue' };
    case 'due-today':
      return { status: 'warning', label: 'Due Today' };
    case 'upcoming':
      return { status: 'info', label: 'Upcoming' };
    default:
      return { status: 'info', label: priority };
  }
}

/**
 * Formats the due date relative to today.
 *
 * @param daysUntilDue - Number of days until due (negative = overdue)
 * @returns Human-readable due date string
 */
function formatDueDate(daysUntilDue: number): string {
  if (daysUntilDue < 0) {
    const days = Math.abs(daysUntilDue);
    return days === 1 ? '1 day overdue' : `${days} days overdue`;
  }
  if (daysUntilDue === 0) {
    return 'Due today';
  }
  if (daysUntilDue === 1) {
    return 'Due tomorrow';
  }
  return `Due in ${daysUntilDue} days`;
}

// ============================================================================
// Sub-Components
// ============================================================================

/**
 * Summary section showing counts by priority category.
 */
function SummarySection({
  summary,
}: {
  summary: UpcomingReviewsCardProps['summary'];
}) {
  return (
    <div className="flex justify-around py-4 border-b border-gray-200">
      {/* Overdue count - red emphasis */}
      <div className="text-center">
        <p className={`text-2xl font-bold ${summary.overdue > 0 ? 'text-red-600' : 'text-gray-400'}`}>
          {summary.overdue}
        </p>
        <p className="text-xs text-gray-500">Overdue</p>
      </div>

      {/* Due today count - amber emphasis */}
      <div className="text-center">
        <p className={`text-2xl font-bold ${summary.dueToday > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
          {summary.dueToday}
        </p>
        <p className="text-xs text-gray-500">Due Today</p>
      </div>

      {/* Upcoming count - blue/neutral */}
      <div className="text-center">
        <p className={`text-2xl font-bold ${summary.upcoming > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
          {summary.upcoming}
        </p>
        <p className="text-xs text-gray-500">Upcoming</p>
      </div>
    </div>
  );
}

/**
 * Single review item in the list.
 */
function ReviewItem({ review }: { review: UpcomingReview }) {
  const priorityBadge = getPriorityBadge(review.priority);

  return (
    <Link
      to={`/recall-sets/${review.recallSetId}`}
      className="block p-3 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0"
    >
      <div className="flex items-start justify-between gap-3">
        {/* Review content - left side */}
        <div className="flex-1 min-w-0">
          {/* Truncated recall point content */}
          <p className="text-sm font-medium text-gray-900 truncate">
            {review.recallPointContent}
          </p>
          {/* Recall set name */}
          <p className="text-xs text-gray-500 mt-0.5">
            {review.recallSetName}
          </p>
        </div>

        {/* Priority and due date - right side */}
        <div className="flex flex-col items-end gap-1">
          <Badge status={priorityBadge.status}>
            {priorityBadge.label}
          </Badge>
          <p className="text-xs text-gray-400">
            {formatDueDate(review.daysUntilDue)}
          </p>
        </div>
      </div>
    </Link>
  );
}

/**
 * Empty state icon - calendar with checkmark
 */
function EmptyReviewsIcon() {
  return (
    <svg
      className="w-12 h-12"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  );
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * UpcomingReviewsCard displays reviews due in the coming days.
 * Shows a summary, list of items, and handles loading/error/empty states.
 */
export function UpcomingReviewsCard({
  reviews,
  summary,
  isLoading = false,
  error,
  onRetry,
  maxDisplay = 5,
}: UpcomingReviewsCardProps) {
  // Limit the number of reviews displayed
  const displayedReviews = reviews.slice(0, maxDisplay);
  const hasMore = reviews.length > maxDisplay;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <span>Upcoming Reviews</span>
          {/* Total count badge */}
          {summary.total > 0 && (
            <Badge status="info">{summary.total} total</Badge>
          )}
        </div>
      </CardHeader>
      <CardBody className="p-0">
        {/* Loading state */}
        {isLoading && (
          <div className="flex justify-center items-center py-12">
            <Spinner size="lg" label="Loading reviews..." />
          </div>
        )}

        {/* Error state */}
        {!isLoading && error && (
          <div className="p-6 text-center">
            <p className="text-red-600 mb-4">Failed to load reviews</p>
            {onRetry && (
              <Button variant="secondary" onClick={onRetry}>
                Try Again
              </Button>
            )}
          </div>
        )}

        {/* Content when loaded */}
        {!isLoading && !error && (
          <>
            {/* Summary section - always shown */}
            <SummarySection summary={summary} />

            {/* Empty state */}
            {reviews.length === 0 && (
              <EmptyState
                icon={<EmptyReviewsIcon />}
                title="No upcoming reviews"
                description="Add some recall points to your sets to start building your review schedule."
                action={
                  <Link to="/recall-sets">
                    <Button variant="primary">
                      View Recall Sets
                    </Button>
                  </Link>
                }
              />
            )}

            {/* Reviews list */}
            {reviews.length > 0 && (
              <>
                <div>
                  {displayedReviews.map((review) => (
                    <ReviewItem key={review.recallPointId} review={review} />
                  ))}
                </div>

                {/* "See more" link if there are more reviews */}
                {hasMore && (
                  <div className="p-4 text-center border-t border-gray-200">
                    <Link
                      to="/recall-sets"
                      className="text-sm text-clarity-600 hover:text-clarity-700 font-medium"
                    >
                      View all {summary.total} reviews
                    </Link>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}
