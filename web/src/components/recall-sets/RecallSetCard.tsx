/**
 * RecallSetCard Component
 *
 * A card component displaying a single recall set with summary statistics.
 * Shows the set's name, description, status badge, and key metrics.
 *
 * Features:
 * - Clickable card that navigates to the recall set detail page
 * - Status badge with color coding (active=green, paused=yellow, archived=gray)
 * - Stats display: total points, due points, new points
 * - "Start Session" button that initiates a study session
 *
 * The card uses the existing Card UI component for consistent styling
 * and provides visual feedback on hover for better UX.
 */

import { Link, useNavigate } from 'react-router-dom';
import { Card, CardBody, Badge, Button } from '@/components/ui';
import { useStartSession } from '@/hooks/api/use-sessions';
import type { RecallSetWithSummary, RecallSetStatus } from '@/types/api';

// ============================================================================
// Types
// ============================================================================

export interface RecallSetCardProps {
  /** The recall set data to display */
  recallSet: RecallSetWithSummary;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Maps recall set status to Badge status variant.
 * - active: success (green) - set is being actively studied
 * - paused: warning (yellow) - temporarily on hold
 * - archived: info (gray-ish blue) - no longer active
 */
function getStatusBadgeVariant(
  status: RecallSetStatus
): 'success' | 'warning' | 'info' {
  switch (status) {
    case 'active':
      return 'success';
    case 'paused':
      return 'warning';
    case 'archived':
      return 'info';
    default:
      return 'info';
  }
}

/**
 * Truncates text to a maximum length with ellipsis.
 * Useful for preventing long descriptions from breaking the card layout.
 *
 * @param text - The text to truncate
 * @param maxLength - Maximum character length before truncation
 * @returns Truncated text with ellipsis if needed
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength).trim() + '...';
}

// ============================================================================
// RecallSetCard Component
// ============================================================================

/**
 * Card component for displaying a single recall set.
 *
 * The entire card is clickable and navigates to the set's detail page.
 * A separate "Start Session" button triggers a new study session.
 *
 * @param recallSet - The recall set data to display
 */
export function RecallSetCard({ recallSet }: RecallSetCardProps) {
  const navigate = useNavigate();
  const startSessionMutation = useStartSession();

  // Destructure for cleaner access
  const { id, name, description, status, summary } = recallSet;
  const { totalPoints, duePoints, newPoints } = summary;

  /**
   * Handles starting a new study session for this recall set.
   * Navigates to the live session page on success.
   * Stops event propagation to prevent card click navigation.
   */
  const handleStartSession = (event: React.MouseEvent) => {
    // Prevent the click from bubbling up to the card link
    event.preventDefault();
    event.stopPropagation();

    startSessionMutation.mutate(id, {
      onSuccess: (data) => {
        // Navigate to the live session page with the new session ID
        navigate(`/session/${data.sessionId}`);
      },
    });
  };

  return (
    <Link
      to={`/recall-sets/${id}`}
      className="block group focus:outline-none focus:ring-2 focus:ring-clarity-500 focus:ring-offset-2 rounded-lg"
      aria-label={`View ${name} recall set`}
    >
      <Card className="h-full transition-all duration-200 group-hover:border-clarity-400 group-hover:shadow-lg group-hover:-translate-y-0.5">
        <CardBody className="flex flex-col h-full p-4 sm:p-6">
          {/* Header row: Name and Status badge */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 group-hover:text-clarity-700 transition-colors line-clamp-1">
              {name}
            </h3>
            <Badge status={getStatusBadgeVariant(status)}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </Badge>
          </div>

          {/* Description - truncated to prevent overflow */}
          <p className="text-xs sm:text-sm text-gray-600 mb-3 sm:mb-4 line-clamp-2">
            {description ? truncateText(description, 100) : 'No description'}
          </p>

          {/* Stats row: Total, Due, and New points - responsive spacing */}
          <div className="flex gap-3 sm:gap-4 text-xs sm:text-sm mb-3 sm:mb-4">
            {/* Total points in the set */}
            <div className="flex flex-col">
              <span className="text-gray-500">Total</span>
              <span className="font-medium text-gray-900">{totalPoints}</span>
            </div>

            {/* Due points - highlighted if any are due */}
            <div className="flex flex-col">
              <span className="text-gray-500">Due</span>
              <span
                className={`font-medium ${
                  duePoints > 0 ? 'text-amber-600' : 'text-gray-900'
                }`}
              >
                {duePoints}
              </span>
            </div>

            {/* New points - highlighted if any are new */}
            <div className="flex flex-col">
              <span className="text-gray-500">New</span>
              <span
                className={`font-medium ${
                  newPoints > 0 ? 'text-blue-600' : 'text-gray-900'
                }`}
              >
                {newPoints}
              </span>
            </div>
          </div>

          {/* Spacer to push button to bottom */}
          <div className="flex-grow" />

          {/* Start Session button - only shown for non-archived sets */}
          {/* Minimum 44px height for touch targets */}
          {status !== 'archived' && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleStartSession}
              isLoading={startSessionMutation.isPending}
              disabled={totalPoints === 0}
              className="w-full min-h-[44px]"
            >
              {startSessionMutation.isPending ? 'Starting...' : 'Start Session'}
            </Button>
          )}

          {/* Archived sets show a disabled state indicator */}
          {status === 'archived' && (
            <Button
              variant="secondary"
              size="sm"
              disabled
              className="w-full min-h-[44px]"
            >
              Archived
            </Button>
          )}
        </CardBody>
      </Card>
    </Link>
  );
}

export default RecallSetCard;
