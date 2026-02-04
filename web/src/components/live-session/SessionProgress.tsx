/**
 * Session Progress Component for Live Sessions
 *
 * Displays progress through recall points in a live session.
 * Shows current point number, total points, and a visual progress bar.
 *
 * Features:
 * - Current point / total points counter
 * - Visual progress bar
 * - Compact design for header placement
 *
 * @example
 * ```tsx
 * <SessionProgress
 *   currentPoint={2}
 *   totalPoints={5}
 * />
 * ```
 */

import type { HTMLAttributes } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface SessionProgressProps extends HTMLAttributes<HTMLDivElement> {
  /** Current point index (1-based) */
  currentPoint: number;
  /** Total number of points in the session */
  totalPoints: number;
  /** Whether to show the progress bar */
  showBar?: boolean;
}

// ============================================================================
// Component Implementation
// ============================================================================

/**
 * Progress indicator showing how far through the session the user is.
 * Includes both a text counter and an optional visual progress bar.
 */
export function SessionProgress({
  currentPoint,
  totalPoints,
  showBar = true,
  className = '',
  ...props
}: SessionProgressProps) {
  // Calculate progress percentage (handle edge cases)
  const progress = totalPoints > 0 ? (currentPoint / totalPoints) * 100 : 0;

  // Determine if session is complete
  const isComplete = currentPoint >= totalPoints && totalPoints > 0;

  return (
    <div className={`${className}`} {...props}>
      {/* Progress counter */}
      <div className="flex items-center gap-2">
        <span className="text-clarity-300 text-sm font-medium">
          {totalPoints > 0 ? (
            <>
              <span className="text-white">{Math.min(currentPoint, totalPoints)}</span>
              <span className="mx-1">/</span>
              <span>{totalPoints}</span>
              <span className="ml-1">points</span>
            </>
          ) : (
            <span>Loading...</span>
          )}
        </span>

        {/* Completion badge */}
        {isComplete && (
          <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full font-medium">
            Complete
          </span>
        )}
      </div>

      {/* Progress bar */}
      {showBar && totalPoints > 0 && (
        <div className="mt-2 w-full">
          <div className="h-1.5 bg-clarity-700 rounded-full overflow-hidden">
            <div
              className={`
                h-full
                rounded-full
                transition-all duration-500 ease-out
                ${isComplete ? 'bg-green-500' : 'bg-clarity-500'}
              `}
              style={{ width: `${Math.min(progress, 100)}%` }}
              role="progressbar"
              aria-valuenow={currentPoint}
              aria-valuemin={0}
              aria-valuemax={totalPoints}
              aria-label={`Progress: ${currentPoint} of ${totalPoints} points`}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default SessionProgress;
