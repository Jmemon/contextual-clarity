/**
 * SessionTable Component
 *
 * Displays a table of study sessions with key metrics and actions.
 * Designed for the session history page to show completed and abandoned sessions.
 *
 * Columns displayed:
 * - Date/Time: When the session started (formatted nicely)
 * - Recall Set: Name with link to the recall set
 * - Duration: How long the session lasted (e.g., "5m 32s")
 * - Points Covered: Number of recall points attempted
 * - Success Rate: Percentage with color coding
 * - Status: Badge showing completed/abandoned/in-progress
 * - Actions: Link to view session replay
 *
 * Features:
 * - Responsive table with horizontal scroll on small screens
 * - Empty state when no sessions match filters
 * - Loading skeleton support via parent component
 * - Color-coded success rates for quick visual assessment
 *
 * @example
 * ```tsx
 * <SessionTable
 *   sessions={sessionsData}
 *   recallSets={recallSetsData}
 * />
 * ```
 */

import { Link } from 'react-router-dom';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Badge,
  EmptyState,
  DefaultEmptyIcon,
} from '@/components/ui';
import type { SessionWithMetrics, RecallSetWithSummary } from '@/types/api';

// ============================================================================
// Types
// ============================================================================

export interface SessionTableProps {
  /** Array of sessions to display */
  sessions: SessionWithMetrics[];
  /** Map of recall set IDs to recall set data (for displaying names and links) */
  recallSets?: RecallSetWithSummary[];
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Formats a duration in milliseconds to a human-readable string.
 * Examples: "5m 32s", "1h 15m", "45s"
 *
 * @param durationMs - Duration in milliseconds
 * @returns Formatted duration string
 */
function formatDuration(durationMs: number | undefined): string {
  // Handle missing or zero duration
  if (!durationMs || durationMs <= 0) {
    return '-';
  }

  // Convert to seconds for easier calculation
  const totalSeconds = Math.floor(durationMs / 1000);

  // Calculate hours, minutes, and seconds components
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  // Build the formatted string based on which components are present
  const parts: string[] = [];

  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }
  // Always show seconds if under a minute, or if there are remaining seconds
  if (seconds > 0 || parts.length === 0) {
    parts.push(`${seconds}s`);
  }

  return parts.join(' ');
}

/**
 * Formats an ISO date string to a user-friendly format.
 * Example: "Jan 15, 2024 at 3:45 PM"
 *
 * @param isoString - ISO 8601 date string
 * @returns Formatted date/time string
 */
function formatDateTime(isoString: string): string {
  const date = new Date(isoString);

  // Use Intl.DateTimeFormat for locale-aware formatting
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Formats a recall rate (0.0-1.0) as a percentage string.
 *
 * @param rate - Recall rate between 0 and 1
 * @returns Formatted percentage string (e.g., "85%")
 */
function formatSuccessRate(rate: number | undefined): string {
  if (rate === undefined || rate === null) {
    return '-';
  }
  // Convert from decimal to percentage and round to whole number
  return `${Math.round(rate * 100)}%`;
}

/**
 * Determines the color class for a success rate based on performance thresholds.
 * - >= 80%: Green (good performance)
 * - >= 60%: Amber (moderate performance)
 * - < 60%: Red (needs improvement)
 *
 * @param rate - Recall rate between 0 and 1
 * @returns Tailwind color class for the text
 */
function getSuccessRateColor(rate: number | undefined): string {
  if (rate === undefined || rate === null) {
    return 'text-gray-500';
  }

  const percentage = rate * 100;

  if (percentage >= 80) {
    return 'text-green-600 font-medium';
  }
  if (percentage >= 60) {
    return 'text-amber-600 font-medium';
  }
  return 'text-red-600 font-medium';
}

/**
 * Maps session status to Badge status variant.
 *
 * @param status - Session status string
 * @returns Badge status prop value
 */
function getStatusBadge(
  status: 'completed' | 'abandoned' | 'in_progress'
): { status: 'success' | 'warning' | 'info' | 'error'; label: string } {
  switch (status) {
    case 'completed':
      return { status: 'success', label: 'Completed' };
    case 'abandoned':
      return { status: 'warning', label: 'Abandoned' };
    case 'in_progress':
      return { status: 'info', label: 'In Progress' };
    default:
      return { status: 'info', label: status };
  }
}

// ============================================================================
// Component
// ============================================================================

/**
 * Table component displaying session history with metrics.
 *
 * Renders a responsive table showing session details with links
 * to both the recall set and the session replay page.
 */
export function SessionTable({ sessions, recallSets = [] }: SessionTableProps) {
  // Build a map of recall set IDs to names for quick lookup
  const recallSetMap = new Map(recallSets.map((set) => [set.id, set]));

  // Handle empty state - no sessions to display
  if (sessions.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200">
        <EmptyState
          icon={<DefaultEmptyIcon />}
          title="No sessions found"
          description="No study sessions match your current filters. Try adjusting your filters or start a new study session."
        />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <Table>
        {/* Table Header with column labels */}
        <TableHeader>
          <TableRow hoverable={false}>
            <TableHead>Date & Time</TableHead>
            <TableHead>Recall Set</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Points</TableHead>
            <TableHead>Success Rate</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>

        {/* Table Body with session rows */}
        <TableBody>
          {sessions.map((session) => {
            // Look up the recall set for this session to get its name
            const recallSet = recallSetMap.get(session.recallSetId);
            const statusBadge = getStatusBadge(session.status);

            return (
              <TableRow key={session.id}>
                {/* Date/Time Column - formatted start time */}
                <TableCell>
                  <span className="text-gray-900">
                    {formatDateTime(session.startedAt)}
                  </span>
                </TableCell>

                {/* Recall Set Column - name with link to recall set page */}
                <TableCell>
                  {recallSet ? (
                    <Link
                      to={`/recall-sets/${session.recallSetId}`}
                      className="text-clarity-600 hover:text-clarity-800 hover:underline"
                    >
                      {recallSet.name}
                    </Link>
                  ) : (
                    <span className="text-gray-500">Unknown Set</span>
                  )}
                </TableCell>

                {/* Duration Column - formatted duration */}
                <TableCell>
                  <span className="text-gray-600">
                    {formatDuration(session.metrics?.durationMs)}
                  </span>
                </TableCell>

                {/* Points Covered Column - number of recall points attempted */}
                <TableCell>
                  <span className="text-gray-600">
                    {session.metrics?.recallPointsAttempted ?? '-'}
                  </span>
                </TableCell>

                {/* Success Rate Column - percentage with color coding */}
                <TableCell>
                  <span className={getSuccessRateColor(session.metrics?.recallRate)}>
                    {formatSuccessRate(session.metrics?.recallRate)}
                  </span>
                </TableCell>

                {/* Status Column - badge showing session status */}
                <TableCell>
                  <Badge status={statusBadge.status}>{statusBadge.label}</Badge>
                </TableCell>

                {/* Actions Column - link to session replay */}
                <TableCell>
                  <Link
                    to={`/sessions/${session.id}`}
                    className="text-clarity-600 hover:text-clarity-800 text-sm font-medium"
                  >
                    View &rarr;
                  </Link>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
