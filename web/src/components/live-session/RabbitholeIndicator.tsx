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
      className={`flex items-center justify-between px-6 py-2 bg-emerald-950/40 border-b border-[#1e2e26] ${className}`}
      role="banner"
      aria-label="Rabbit hole mode active"
      {...props}
    >
      {/* Left: icon + label */}
      <div className="flex items-center gap-2">
        <svg className="w-4 h-4 text-emerald-600/60 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
        </svg>
        <span className="text-stone-400 text-sm">
          Exploring:{' '}
          <span className="font-medium text-stone-200">{topic}</span>
        </span>
      </div>

      {/* Right: return button */}
      <button
        onClick={onReturn}
        className="px-3 py-1.5 text-xs font-medium bg-[#1a2a22] text-stone-300 border border-[#2a3a32] rounded-lg hover:bg-[#243830] hover:text-white transition-colors"
        aria-label="Return to recall session"
      >
        Return to session
      </button>
    </div>
  );
}

export default RabbitholeIndicator;
