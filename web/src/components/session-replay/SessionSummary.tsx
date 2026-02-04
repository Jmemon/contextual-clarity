/**
 * SessionSummary Component
 *
 * Displays a summary card at the top of the session replay page.
 * Shows key statistics and metadata about the study session including:
 * - Date and time of the session
 * - Total duration
 * - Recall set name (with link)
 * - Number of points covered
 * - Success rate
 * - Session status
 *
 * @example
 * ```tsx
 * <SessionSummary
 *   sessionId="session-123"
 *   recallSetId="set-456"
 *   recallSetName="React Fundamentals"
 *   startedAt="2024-01-15T10:30:00Z"
 *   endedAt="2024-01-15T11:00:00Z"
 *   status="completed"
 *   metrics={metrics}
 * />
 * ```
 */

import { Link } from 'react-router-dom';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

// ============================================================================
// Types
// ============================================================================

/** Session metrics for display in summary */
export interface SessionMetrics {
  /** Total session duration in milliseconds */
  durationMs: number;
  /** Active time (excluding idle) in milliseconds */
  activeTimeMs?: number;
  /** Success rate from 0 to 1 */
  recallRate: number;
  /** Engagement score from 0 to 100 */
  engagementScore?: number;
  /** Total number of recall points attempted */
  recallPointsAttempted: number;
  /** Number of successful recalls */
  recallPointsSuccessful: number;
  /** Number of failed recalls */
  recallPointsFailed?: number;
  /** Average confidence score */
  avgConfidence?: number;
  /** Total messages in transcript */
  totalMessages?: number;
  /** Number of rabbithole/tangent events */
  rabbitholeCount?: number;
}

export interface SessionSummaryProps {
  /** Unique session identifier */
  sessionId: string;
  /** ID of the recall set studied */
  recallSetId: string;
  /** Human-readable name of the recall set */
  recallSetName: string;
  /** When the session started (ISO 8601 string) */
  startedAt: string;
  /** When the session ended (ISO 8601 string, null if in progress) */
  endedAt: string | null;
  /** Current session status */
  status: string;
  /** Session metrics (optional, null if not available) */
  metrics?: SessionMetrics | null;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Formats a duration in milliseconds to a human-readable string.
 *
 * @param ms - Duration in milliseconds
 * @returns Formatted string like "15 min" or "1h 30m"
 */
function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes} min`;
}

/**
 * Formats a timestamp to a localized date and time string.
 *
 * @param timestamp - ISO 8601 timestamp string
 * @returns Formatted string like "Jan 15, 2024 at 10:30 AM"
 */
function formatDateTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Formats a success rate (0-1) as a percentage.
 *
 * @param rate - Success rate from 0 to 1
 * @returns Formatted percentage string like "85%"
 */
function formatPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

/**
 * Maps session status to badge configuration.
 *
 * @param status - Session status string
 * @returns Badge status and display label
 */
function getStatusConfig(status: string): {
  badgeStatus: 'success' | 'warning' | 'info' | 'error';
  label: string;
} {
  switch (status) {
    case 'completed':
      return { badgeStatus: 'success', label: 'Completed' };
    case 'in_progress':
      return { badgeStatus: 'info', label: 'In Progress' };
    case 'abandoned':
      return { badgeStatus: 'warning', label: 'Abandoned' };
    default:
      return { badgeStatus: 'info', label: status };
  }
}

// ============================================================================
// SessionSummary Component
// ============================================================================

/**
 * Renders a summary card with key session statistics.
 *
 * Displays date/time, duration, recall set (with link), points covered,
 * success rate, and status badge. Metrics are optional and gracefully
 * handled when not available.
 */
export function SessionSummary({
  recallSetId,
  recallSetName,
  startedAt,
  endedAt,
  status,
  metrics,
}: SessionSummaryProps) {
  const statusConfig = getStatusConfig(status);

  // Calculate duration from timestamps if metrics not available
  const durationMs =
    metrics?.durationMs ??
    (endedAt ? new Date(endedAt).getTime() - new Date(startedAt).getTime() : 0);

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-800">Session Summary</h2>
          <Badge status={statusConfig.badgeStatus}>{statusConfig.label}</Badge>
        </div>
      </CardHeader>

      <CardBody>
        {/* Primary stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {/* Date/Time */}
          <div>
            <p className="text-sm text-gray-500 mb-1">Date &amp; Time</p>
            <p className="text-lg font-medium text-gray-800">{formatDateTime(startedAt)}</p>
          </div>

          {/* Duration */}
          <div>
            <p className="text-sm text-gray-500 mb-1">Duration</p>
            <p className="text-lg font-medium text-gray-800">
              {durationMs > 0 ? formatDuration(durationMs) : '--'}
            </p>
          </div>

          {/* Recall Set (with link) */}
          <div>
            <p className="text-sm text-gray-500 mb-1">Recall Set</p>
            <Link
              to={`/recall-sets/${recallSetId}`}
              className="text-lg font-medium text-clarity-600 hover:text-clarity-800 hover:underline transition-colors"
            >
              {recallSetName}
            </Link>
          </div>

          {/* Success Rate */}
          <div>
            <p className="text-sm text-gray-500 mb-1">Success Rate</p>
            <p
              className={`text-lg font-medium ${
                metrics?.recallRate !== undefined
                  ? metrics.recallRate >= 0.7
                    ? 'text-green-600'
                    : metrics.recallRate >= 0.4
                    ? 'text-yellow-600'
                    : 'text-red-600'
                  : 'text-gray-800'
              }`}
            >
              {metrics?.recallRate !== undefined ? formatPercent(metrics.recallRate) : '--'}
            </p>
          </div>
        </div>

        {/* Secondary stats (only shown if metrics available) */}
        {metrics && (
          <div className="mt-6 pt-6 border-t border-gray-200">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {/* Points Covered */}
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                  Points Covered
                </p>
                <p className="text-base font-semibold text-gray-700">
                  {metrics.recallPointsAttempted}
                </p>
              </div>

              {/* Successful */}
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Successful</p>
                <p className="text-base font-semibold text-green-600">
                  {metrics.recallPointsSuccessful}
                </p>
              </div>

              {/* Failed (if available) */}
              {metrics.recallPointsFailed !== undefined && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Failed</p>
                  <p className="text-base font-semibold text-red-600">
                    {metrics.recallPointsFailed}
                  </p>
                </div>
              )}

              {/* Avg Confidence (if available) */}
              {metrics.avgConfidence !== undefined && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                    Avg Confidence
                  </p>
                  <p className="text-base font-semibold text-gray-700">
                    {formatPercent(metrics.avgConfidence)}
                  </p>
                </div>
              )}

              {/* Rabbitholes (if available) */}
              {metrics.rabbitholeCount !== undefined && metrics.rabbitholeCount > 0 && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Tangents</p>
                  <p className="text-base font-semibold text-orange-600">
                    {metrics.rabbitholeCount}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export default SessionSummary;
