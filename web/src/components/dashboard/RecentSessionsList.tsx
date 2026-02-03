/**
 * RecentSessionsList Component
 *
 * Displays a list of recent study sessions with key metrics and navigation links.
 * Each session shows the recall set name, date, duration, recall rate, and status.
 * Users can click on a session to view its detailed replay.
 *
 * Features:
 * - Chronologically sorted sessions (most recent first)
 * - Visual indicators for session status and recall rate
 * - Empty state when no sessions exist
 * - Links to session details and recall set pages
 *
 * @example
 * ```tsx
 * <RecentSessionsList
 *   sessions={recentSessions}
 *   isLoading={false}
 *   onRetry={() => refetch()}
 * />
 * ```
 */

import { Link } from 'react-router-dom';
import { Card, CardHeader, CardBody, Badge, EmptyState, Spinner, Button } from '@/components/ui';
import type { SessionSummary } from '@/types/api';

// ============================================================================
// Type Definitions
// ============================================================================

export interface RecentSessionsListProps {
  /** Array of recent session summaries to display */
  sessions: SessionSummary[];
  /** Whether the data is currently loading */
  isLoading?: boolean;
  /** Error that occurred while fetching (if any) */
  error?: Error | null;
  /** Callback to retry fetching on error */
  onRetry?: () => void;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Formats milliseconds into a concise duration string.
 *
 * @param ms - Duration in milliseconds
 * @returns Formatted duration like "15m" or "1h 30m"
 */
function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / (1000 * 60));
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (minutes < 1) {
    return '< 1m';
  }

  if (hours > 0) {
    return remainingMinutes > 0
      ? `${hours}h ${remainingMinutes}m`
      : `${hours}h`;
  }

  return `${minutes}m`;
}

/**
 * Formats an ISO date string into a relative or absolute date display.
 * Shows "Today", "Yesterday", or the formatted date.
 *
 * @param dateString - ISO 8601 date string
 * @returns Human-readable date string
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  // Check if the date is today
  if (date >= today) {
    return `Today at ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  }

  // Check if the date is yesterday
  if (date >= yesterday && date < today) {
    return `Yesterday at ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  }

  // Otherwise show the full date
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Returns the appropriate Badge status based on session status.
 */
function getStatusBadge(status: SessionSummary['status']): { status: 'success' | 'warning' | 'error' | 'info'; label: string } {
  switch (status) {
    case 'completed':
      return { status: 'success', label: 'Completed' };
    case 'abandoned':
      return { status: 'error', label: 'Abandoned' };
    case 'in_progress':
      return { status: 'info', label: 'In Progress' };
    default:
      return { status: 'info', label: status };
  }
}

/**
 * Returns a color class based on the recall rate.
 * Higher rates get green, lower rates get amber/red.
 */
function getRecallRateColor(rate: number): string {
  if (rate >= 0.8) return 'text-green-600';
  if (rate >= 0.6) return 'text-amber-600';
  return 'text-red-600';
}

// ============================================================================
// Sub-Components
// ============================================================================

/**
 * Single session item in the list.
 * Shows session details and provides navigation to the session replay.
 */
function SessionItem({ session }: { session: SessionSummary }) {
  const statusBadge = getStatusBadge(session.status);
  const recallPercentage = Math.round(session.recallRate * 100);

  return (
    <Link
      to={`/sessions/${session.id}/replay`}
      className="block p-4 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0"
    >
      <div className="flex items-start justify-between">
        {/* Session info - left side */}
        <div className="flex-1 min-w-0">
          {/* Recall set name with link */}
          <p className="font-medium text-gray-900 truncate">
            {session.recallSetName}
          </p>
          {/* Date and duration */}
          <p className="text-sm text-gray-500 mt-1">
            {formatDate(session.startedAt)} - {formatDuration(session.durationMs)}
          </p>
        </div>

        {/* Metrics - right side */}
        <div className="flex items-center gap-4 ml-4">
          {/* Recall rate percentage */}
          <div className="text-right">
            <p className={`text-lg font-semibold ${getRecallRateColor(session.recallRate)}`}>
              {recallPercentage}%
            </p>
            <p className="text-xs text-gray-500">recall</p>
          </div>
          {/* Status badge */}
          <Badge status={statusBadge.status}>
            {statusBadge.label}
          </Badge>
        </div>
      </div>
    </Link>
  );
}

/**
 * Empty state icon - clipboard with checkmark
 */
function EmptySessionsIcon() {
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
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
      />
    </svg>
  );
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * RecentSessionsList displays a list of recent study sessions.
 * Handles loading, error, and empty states gracefully.
 */
export function RecentSessionsList({
  sessions,
  isLoading = false,
  error,
  onRetry,
}: RecentSessionsListProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <span>Recent Sessions</span>
          {/* Link to view all sessions */}
          <Link
            to="/sessions"
            className="text-sm text-clarity-600 hover:text-clarity-700 font-medium"
          >
            View All
          </Link>
        </div>
      </CardHeader>
      <CardBody className="p-0">
        {/* Loading state */}
        {isLoading && (
          <div className="flex justify-center items-center py-12">
            <Spinner size="lg" label="Loading sessions..." />
          </div>
        )}

        {/* Error state */}
        {!isLoading && error && (
          <div className="p-6 text-center">
            <p className="text-red-600 mb-4">Failed to load sessions</p>
            {onRetry && (
              <Button variant="secondary" onClick={onRetry}>
                Try Again
              </Button>
            )}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && sessions.length === 0 && (
          <EmptyState
            icon={<EmptySessionsIcon />}
            title="No sessions yet"
            description="Start a study session from one of your recall sets to begin tracking your progress."
            action={
              <Link to="/recall-sets">
                <Button variant="primary">
                  View Recall Sets
                </Button>
              </Link>
            }
          />
        )}

        {/* Sessions list */}
        {!isLoading && !error && sessions.length > 0 && (
          <div>
            {sessions.map((session) => (
              <SessionItem key={session.id} session={session} />
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
