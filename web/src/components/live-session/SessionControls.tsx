/**
 * Session Controls Component for Live Sessions (T08 update)
 *
 * Provides control buttons for managing the live session:
 * - "Leave Session" button to pause the session (T08 — replaces "End Session")
 *
 * T08 changes:
 * - "End Session" renamed to "Leave Session"
 * - Removed confirmation dialog — pausing is non-destructive so no confirmation needed
 * - Prop renamed: onEndSession -> onLeaveSession
 *
 * The "I've got it!" button has been removed (T06) — recall evaluation
 * now happens continuously after every user message.
 *
 * @example
 * ```tsx
 * <SessionControls
 *   onLeaveSession={leaveSession}
 *   disabled={isWaitingForResponse}
 * />
 * ```
 */

import { type HTMLAttributes } from 'react';
import { Button } from '@/components/ui/Button';

// ============================================================================
// Types
// ============================================================================

export interface SessionControlsProps extends HTMLAttributes<HTMLDivElement> {
  /** Callback when "Leave Session" is clicked — pauses session non-destructively */
  onLeaveSession: () => void;
  /** Whether controls are disabled (e.g., waiting for response) */
  disabled?: boolean;
  /** Whether the session has completed */
  isSessionComplete?: boolean;
  /** Whether the session is in rabbit hole mode — shifts accent to emerald */
  isInRabbithole?: boolean;
}

// ============================================================================
// Component Implementation
// ============================================================================

/**
 * Control buttons for live session actions.
 * T08: "Leave Session" pauses the session preserving progress — no confirmation needed.
 * Recall evaluation is continuous (T06).
 */
export function SessionControls({
  onLeaveSession,
  disabled = false,
  isSessionComplete = false,
  isInRabbithole = false,
  className = '',
  ...props
}: SessionControlsProps) {
  // Don't show controls if session is complete
  if (isSessionComplete) {
    return null;
  }

  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`} {...props}>
      {/* Leave Session button — pauses session non-destructively (no confirmation dialog) */}
      <Button
        variant="secondary"
        size="md"
        onClick={onLeaveSession}
        disabled={disabled}
        className={isInRabbithole
          ? 'bg-emerald-900/40 border-emerald-700/40 text-emerald-200 hover:bg-emerald-800/40 hover:text-white'
          : 'bg-slate-700 border-slate-600 text-clarity-200 hover:bg-slate-600 hover:text-white'
        }
      >
        Leave Session
      </Button>
    </div>
  );
}

export default SessionControls;
