/**
 * SessionHistoryTable Component
 *
 * Displays a table of recent study sessions for a recall set.
 * Shows session history with key metrics:
 * - Date and time of session
 * - Duration
 * - Recall rate
 * - Engagement score
 * - Session status (completed, abandoned, in_progress)
 *
 * Includes a link to view full session details and replay.
 *
 * @example
 * ```tsx
 * <SessionHistoryTable
 *   sessions={sessions}
 *   isLoading={isLoading}
 * />
 * ```
 */

import { Link } from 'react-router-dom';
import {
  Card,
  CardHeader,
  CardBody,
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Spinner,
  EmptyState,
} from '@/components/ui';
import type { SessionWithMetrics } from '@/types/api';

export interface SessionHistoryTableProps {
  /** Array of sessions to display */
  sessions: SessionWithMetrics[];
  /** Whether the data is currently loading */
  isLoading?: boolean;
}

/**
 * Maps session status to badge status for semantic coloring.
 * - completed: success (green)
 * - in_progress: info (blue)
 * - abandoned: warning (amber)
 */
const statusToBadge: Record<string, 'success' | 'info' | 'warning'> = {
  completed: 'success',
  in_progress: 'info',
  abandoned: 'warning',
};

/**
 * Human-readable labels for session statuses.
 */
const statusLabels: Record<string, string> = {
  completed: 'Completed',
  in_progress: 'In Progress',
  abandoned: 'Abandoned',
};

/**
 * Formats duration in milliseconds to a human-readable string.
 * Examples: "5m", "1h 23m", "45m"
 */
function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/**
 * Formats a date string to a readable format.
 * Shows relative time for recent dates.
 */
function formatSessionDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    // Today - show time
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  } else {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  }
}

/**
 * Formats recall rate as a percentage string.
 */
function formatRecallRate(rate: number): string {
  return `${(rate * 100).toFixed(0)}%`;
}

/**
 * Session history table component.
 * Shows recent sessions with metrics and links to details.
 */
export function SessionHistoryTable({
  sessions,
  isLoading = false,
}: SessionHistoryTableProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <span>Session History</span>
          <span className="text-sm font-normal text-gray-500">
            {sessions.length} session{sessions.length !== 1 ? 's' : ''}
          </span>
        </div>
      </CardHeader>
      <CardBody className="p-0">
        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Spinner size="lg" label="Loading session history..." />
          </div>
        )}

        {/* Empty state when no sessions exist */}
        {!isLoading && sessions.length === 0 && (
          <div className="py-12">
            <EmptyState
              title="No sessions yet"
              description="Start a study session to begin tracking your progress."
            />
          </div>
        )}

        {/* Sessions table */}
        {!isLoading && sessions.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow hoverable={false}>
                <TableHead>Date</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Recall Rate</TableHead>
                <TableHead>Engagement</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((session) => (
                <TableRow key={session.id}>
                  {/* Date cell */}
                  <TableCell>
                    <span className="text-sm text-gray-900">
                      {formatSessionDate(session.startedAt)}
                    </span>
                  </TableCell>

                  {/* Duration cell */}
                  <TableCell>
                    <span className="text-sm text-gray-600">
                      {session.metrics
                        ? formatDuration(session.metrics.durationMs)
                        : '--'}
                    </span>
                  </TableCell>

                  {/* Recall rate cell with color coding */}
                  <TableCell>
                    {session.metrics ? (
                      <span
                        className={`text-sm font-medium ${
                          session.metrics.recallRate >= 0.8
                            ? 'text-green-600'
                            : session.metrics.recallRate >= 0.6
                            ? 'text-amber-600'
                            : 'text-red-600'
                        }`}
                      >
                        {formatRecallRate(session.metrics.recallRate)}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">--</span>
                    )}
                  </TableCell>

                  {/* Engagement score cell */}
                  <TableCell>
                    {session.metrics ? (
                      <span className="text-sm text-gray-600">
                        {session.metrics.engagementScore}/100
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">--</span>
                    )}
                  </TableCell>

                  {/* Status badge cell */}
                  <TableCell>
                    <Badge status={statusToBadge[session.status] || 'info'}>
                      {statusLabels[session.status] || session.status}
                    </Badge>
                  </TableCell>

                  {/* View details link cell */}
                  <TableCell className="text-right">
                    <Link
                      to={`/sessions/${session.id}`}
                      className="text-sm text-clarity-600 hover:text-clarity-700 hover:underline"
                    >
                      View
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardBody>
    </Card>
  );
}

// Display name for React DevTools
SessionHistoryTable.displayName = 'SessionHistoryTable';
