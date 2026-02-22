/**
 * RabbitholeIndicator Component
 *
 * Banner displayed during rabbit hole mode to indicate the user is in an
 * exploration tangent. Provides the topic label and a "Return to session"
 * button that sends exit_rabbithole to the server.
 *
 * This component replaces the SessionProgress bar while in rabbit hole mode
 * so the user knows they're in a different context.
 */

import type { HTMLAttributes } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface RabbitholeIndicatorProps extends HTMLAttributes<HTMLDivElement> {
  /** The topic currently being explored */
  topic: string;
  /** Called when the user clicks "Return to session" — parent sends exit_rabbithole */
  onReturn: () => void;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Banner shown during active rabbit hole exploration.
 *
 * @example
 * ```tsx
 * <RabbitholeIndicator
 *   topic="etymology of photosynthesis"
 *   onReturn={() => exitRabbithole()}
 * />
 * ```
 */
export function RabbitholeIndicator({
  topic,
  onReturn,
  className = '',
  ...props
}: RabbitholeIndicatorProps) {
  return (
    <div
      className={`flex items-center justify-between px-6 py-2 bg-amber-500/15 border-b border-amber-500/25 ${className}`}
      role="banner"
      aria-label="Rabbit hole mode active"
      {...props}
    >
      {/* Left: icon + label */}
      <div className="flex items-center gap-2">
        <span className="text-amber-400 text-base" aria-hidden="true">
          &#x1F407;
        </span>
        <span className="text-amber-200 text-sm">
          Exploring:{' '}
          <span className="font-medium text-amber-100">{topic}</span>
        </span>
      </div>

      {/* Right: return button */}
      <button
        onClick={onReturn}
        className="px-3 py-1.5 text-xs font-medium bg-clarity-700 text-clarity-200 rounded-lg hover:bg-clarity-600 transition-colors"
        aria-label="Return to recall session"
      >
        Return to session
      </button>
    </div>
  );
}

export default RabbitholeIndicator;
