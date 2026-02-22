/**
 * RabbitholePrompt Component
 *
 * Inline prompt shown in the chat area when the server detects a rabbit hole.
 * The user must explicitly opt in — the system never auto-enters a rabbit hole.
 *
 * Shows the detected topic and two actions:
 * - "Explore" (primary) — sends enter_rabbithole to the server
 * - "Stay on track" (secondary) — sends decline_rabbithole and dismisses the prompt
 */

import type { HTMLAttributes } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface RabbitholePromptProps extends HTMLAttributes<HTMLDivElement> {
  /** The tangent topic the detector identified */
  topic: string;
  /** Called when the user clicks "Explore" — parent sends enter_rabbithole */
  onExplore: () => void;
  /** Called when the user clicks "Stay on track" — parent sends decline_rabbithole */
  onDecline: () => void;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Inline opt-in prompt for rabbit hole exploration.
 *
 * @example
 * ```tsx
 * <RabbitholePrompt
 *   topic="etymology of photosynthesis"
 *   onExplore={() => enterRabbithole(eventId, topic)}
 *   onDecline={() => declineRabbithole()}
 * />
 * ```
 */
export function RabbitholePrompt({
  topic,
  onExplore,
  onDecline,
  className = '',
  ...props
}: RabbitholePromptProps) {
  return (
    <div
      className={`flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 ${className}`}
      role="status"
      aria-label="Rabbit hole detected"
      {...props}
    >
      {/* Icon */}
      <span className="text-amber-400 text-lg mt-0.5 flex-shrink-0" aria-hidden="true">
        &#x1F407;
      </span>

      {/* Message and actions */}
      <div className="flex-1 min-w-0">
        <p className="text-amber-200 text-sm">
          Looks like you&apos;re curious about{' '}
          <span className="font-medium text-amber-100">{topic}</span>
          {'. '}Want to explore?
        </p>

        <div className="flex gap-2 mt-2">
          {/* Primary: Explore */}
          <button
            onClick={onExplore}
            className="px-3 py-1.5 text-xs font-medium bg-amber-500 text-black rounded-lg hover:bg-amber-400 transition-colors"
          >
            Explore
          </button>

          {/* Secondary: Stay on track */}
          <button
            onClick={onDecline}
            className="px-3 py-1.5 text-xs font-medium bg-clarity-700 text-clarity-200 rounded-lg hover:bg-clarity-600 transition-colors"
          >
            Stay on track
          </button>
        </div>
      </div>
    </div>
  );
}

export default RabbitholePrompt;
