/**
 * Session Complete Overlay Component (T08)
 *
 * Shown as a modal overlay when all recall points have been recalled.
 * The session is NOT finalized yet at this point — the user can:
 * - "Continue Discussion" (dismiss the overlay, keep talking to the tutor)
 * - "Done" (sends leave_session to the server, navigates to dashboard)
 *
 * The overlay uses an animated entrance: fade in with the card scaling
 * from 0.95 to 1.0 so it feels polished without being distracting.
 *
 * @example
 * ```tsx
 * <SessionCompleteOverlay
 *   recalledCount={5}
 *   totalPoints={5}
 *   onContinue={() => setShowOverlay(false)}
 *   onDone={() => { sendLeaveSession(); navigate('/'); }}
 * />
 * ```
 */

import { useEffect, useState, type HTMLAttributes } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface SessionCompleteOverlayProps extends HTMLAttributes<HTMLDivElement> {
  /** Number of recall points successfully recalled */
  recalledCount: number;
  /** Total number of recall points in the session */
  totalPoints: number;
  /** Called when user clicks "Continue Discussion" — dismisses overlay only */
  onContinue: () => void;
  /** Called when user clicks "Done" — triggers leave_session and navigation */
  onDone: () => void;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Modal overlay displayed when all recall points are recalled.
 *
 * Provides two paths:
 * - "Continue Discussion": dismiss overlay, keep talking (no WS message sent)
 * - "Done": pause session via leave_session, go to dashboard
 */
export function SessionCompleteOverlay({
  recalledCount,
  totalPoints,
  onContinue,
  onDone,
  className = '',
  ...props
}: SessionCompleteOverlayProps) {
  // Animate entrance: start at opacity 0 / scale 0.95, transition to 1 / 1.0
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Trigger animation on mount via a tiny delay so the transition runs
    const timer = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  const recallPercentage = totalPoints > 0 ? Math.round((recalledCount / totalPoints) * 100) : 100;

  return (
    // Semi-transparent backdrop
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-6 ${className}`}
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        opacity: visible ? 1 : 0,
        transition: 'opacity 200ms ease-out',
      }}
      {...props}
    >
      {/* Card panel */}
      <div
        className="bg-clarity-800 border border-clarity-600 rounded-2xl p-8 w-full max-w-md shadow-2xl text-center"
        style={{
          transform: visible ? 'scale(1)' : 'scale(0.95)',
          transition: 'transform 200ms ease-out',
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Session complete"
      >
        {/* Success icon */}
        <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-5">
          <svg
            className="w-8 h-8 text-green-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        {/* Title */}
        <h2 className="text-2xl font-bold text-white mb-2">All Points Recalled!</h2>
        <p className="text-clarity-300 mb-6">
          You recalled {recalledCount} of {totalPoints} points ({recallPercentage}%).
        </p>

        {/* Stats row */}
        <div className="flex justify-center gap-6 mb-8">
          <div className="text-center">
            <p className="text-3xl font-bold text-green-400">{recalledCount}</p>
            <p className="text-clarity-400 text-sm mt-1">Recalled</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-white">{totalPoints}</p>
            <p className="text-clarity-400 text-sm mt-1">Total</p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-3">
          {/* Done — pauses session and navigates away */}
          <button
            onClick={onDone}
            className="w-full px-6 py-3 bg-clarity-600 text-white rounded-xl font-medium hover:bg-clarity-500 transition-colors focus:outline-none focus:ring-2 focus:ring-clarity-400"
          >
            Done
          </button>

          {/* Continue Discussion — dismisses overlay only, session remains active */}
          <button
            onClick={onContinue}
            className="w-full px-6 py-3 bg-clarity-700/50 text-clarity-200 rounded-xl font-medium hover:bg-clarity-700 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-clarity-500"
          >
            Continue Discussion
          </button>
        </div>
      </div>
    </div>
  );
}

export default SessionCompleteOverlay;
