/**
 * Session Progress Component — T11: Visual Progress
 *
 * Replaces the old "X / Y points" progress bar with an anonymous, event-driven
 * progress display. Design goals:
 *  - Show HOW MANY points recalled but NOT WHICH topics remain (anonymity)
 *  - Animate each newly-recalled circle (scale-up 1.5x for 300ms)
 *  - Trigger haptic vibration on each recall (mobile)
 *  - Show elapsed time in MM:SS (monospace, tabular-nums)
 *  - Show explored branch summaries as clarity-colored pills (topic + tooltip)
 *  - Vibration toggle persisted in localStorage
 *
 * Layout (left -> right):
 *   [o o * * o]   03:42   [Adenosine] [Tolerance]   mute-toggle
 */

import { useState, useEffect, useRef, useCallback, type HTMLAttributes } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface SessionProgressProps extends HTMLAttributes<HTMLDivElement> {
  /** Total number of recall points in the session */
  totalPoints: number;

  /** Number of recall points that have been recalled so far (from T01 checklist state) */
  recalledCount: number;

  /** Elapsed time in seconds since session started */
  elapsedSeconds: number;

  /** Summaries of branches that have been explored and closed */
  branchSummaries: Array<{ topic: string; summary: string }>;

  /** Whether audio is muted (controlled by parent, persisted in localStorage) */
  isMuted: boolean;

  /** Callback when mute toggle is clicked */
  onToggleMute: () => void;

  /** Labels of recalled points in recall order, for tappable display */
  recalledLabels: string[];
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Formats elapsed seconds as a MM:SS string.
 */
function formatElapsedTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// ============================================================================
// Sub-Components
// ============================================================================

/**
 * Popover shown above a recalled point circle when tapped.
 * Displays the topic keyword label. Clicking outside dismisses it.
 */
function PointPopover({
  label,
  onDismiss,
}: {
  label: string;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-point-popover]')) {
        onDismiss();
      }
    };
    document.addEventListener('click', handler, { capture: true });
    return () => document.removeEventListener('click', handler, { capture: true });
  }, [onDismiss]);

  return (
    <div
      data-point-popover
      className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-slate-700 text-white text-xs rounded-lg shadow-lg whitespace-nowrap z-50"
    >
      {label}
      <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-700 rotate-45 -mt-1" />
    </div>
  );
}

/**
 * Renders a row of recall point indicators as tappable buttons.
 * Filled (recalled) circles can be tapped to show a popover with the topic keyword.
 * Unfilled circles are disabled. Tapping outside any popover dismisses it.
 */
function PointIcons({
  totalPoints,
  recalledCount,
  animatingIndex,
  recalledLabels,
}: {
  totalPoints: number;
  recalledCount: number;
  animatingIndex: number | null;
  recalledLabels: string[];
}) {
  const [activePopover, setActivePopover] = useState<number | null>(null);

  const handleClick = useCallback((index: number, isRecalled: boolean) => {
    if (!isRecalled) return;
    setActivePopover(prev => prev === index ? null : index);
  }, []);

  const dismissPopover = useCallback(() => setActivePopover(null), []);

  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: totalPoints }, (_, i) => {
        const isRecalled = i < recalledCount;
        const isAnimating = i === animatingIndex;
        const label = isRecalled ? recalledLabels[i] : undefined;

        return (
          <div key={i} className="relative">
            <button
              type="button"
              onClick={() => handleClick(i, isRecalled)}
              className={[
                'w-2.5 h-2.5 rounded-full transition-all duration-300',
                isRecalled
                  ? 'bg-green-400 shadow-sm shadow-green-400/30 cursor-pointer'
                  : 'bg-clarity-600 border border-clarity-500 cursor-default',
                isAnimating ? 'scale-150 shadow-[0_0_8px_rgba(74,222,128,0.6)]' : 'scale-100',
              ].join(' ')}
              aria-label={isRecalled ? `Point recalled: ${label ?? 'tap to view'}` : 'Point pending'}
              disabled={!isRecalled}
            />
            {activePopover === i && label && (
              <PointPopover label={label} onDismiss={dismissPopover} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Renders a list of explored branch summaries as small clarity-colored pills.
 * Each pill shows the branch topic, with the full summary available as a tooltip.
 * Returns null if no branches have been explored.
 */
function BranchSummaryPills({ summaries }: { summaries: Array<{ topic: string; summary: string }> }) {
  if (summaries.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {summaries.map((item, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-clarity-500/15 text-clarity-300 border border-clarity-500/20 rounded-full"
          title={item.summary}
        >
          {item.topic}
        </span>
      ))}
    </div>
  );
}

/**
 * Toggle button for haptic vibration feedback.
 * Vibrating-phone icon = enabled; phone-with-slash icon = disabled.
 */
function MuteToggle({ isMuted, onToggle }: { isMuted: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="text-clarity-400 hover:text-clarity-200 transition-colors p-1"
      aria-label={isMuted ? 'Enable vibration' : 'Disable vibration'}
      title={isMuted ? 'Vibration off' : 'Vibration on'}
    >
      {isMuted ? (
        /* Vibration off icon — phone with slash */
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="7" y="4" width="10" height="16" rx="1" />
          <line x1="2" y1="2" x2="22" y2="22" />
        </svg>
      ) : (
        /* Vibration on icon — phone with vibration lines */
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="7" y="4" width="10" height="16" rx="1" />
          <path d="M4 10v4" />
          <path d="M20 10v4" />
          <path d="M1 8v8" />
          <path d="M23 8v8" />
        </svg>
      )}
    </button>
  );
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * SessionProgress — anonymous, event-driven progress bar for live sessions.
 *
 * Displays point circles, elapsed time, explored branch summary pills, and
 * a mute toggle. When recalledCount increases by N, animates each newly-recalled
 * circle 150ms apart with a haptic pulse per circle.
 */
export function SessionProgress({
  totalPoints,
  recalledCount,
  elapsedSeconds,
  branchSummaries,
  isMuted,
  onToggleMute,
  recalledLabels,
  className = '',
  ...props
}: SessionProgressProps) {
  // Index of the circle currently playing its scale-up animation (null = none).
  const [animatingIndex, setAnimatingIndex] = useState<number | null>(null);

  // Track previous recalledCount to detect new recalls and trigger animations.
  const prevRecalledCount = useRef(recalledCount);

  // Ref that always reflects the current isMuted prop — used inside setTimeout
  // callbacks to avoid stale closures when mute is toggled mid-animation.
  const isMutedRef = useRef(isMuted);
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  /**
   * Trigger haptic feedback for a recall event.
   * Uses the Vibration API on supported devices (mobile).
   * Falls back to a no-op on desktop.
   */
  const triggerRecallFeedback = useCallback(() => {
    if (isMutedRef.current) return;
    try {
      navigator?.vibrate?.(50);
    } catch {
      // Vibration API not available — fail silently
    }
  }, []);

  /**
   * Animate newly-recalled circles left-to-right.
   * When recalledCount increases by N (e.g. after a rabbit hole exits and buffered
   * recalls are flushed), animate each circle 150ms apart with a haptic pulse per circle.
   *
   * FIX 1: All spawned timers are tracked in `timerIds` and cancelled in the
   * cleanup function so no timer fires against an unmounted component or a
   * stale recalledCount value.
   *
   * FIX 5: A single null-clear fires after ALL circles have finished animating
   * (last circle start + 300ms) instead of one per circle. The per-circle
   * approach caused circle N's 300ms clear to interrupt circle N+1's animation
   * window when multiple circles animated 150ms apart.
   */
  useEffect(() => {
    if (recalledCount <= prevRecalledCount.current) return;

    const oldCount = prevRecalledCount.current;
    prevRecalledCount.current = recalledCount;
    const timerIds: ReturnType<typeof setTimeout>[] = [];

    for (let i = oldCount; i < recalledCount; i++) {
      const delay = (i - oldCount) * 150;
      const outerTimer = setTimeout(() => {
        setAnimatingIndex(i);
        // Use isMutedRef to avoid stale closure from the time the effect ran
        triggerRecallFeedback();
      }, delay);
      timerIds.push(outerTimer);
    }

    // One final clear after all circles have had their full 300ms animation window.
    const totalDuration = (recalledCount - oldCount - 1) * 150 + 300;
    const clearTimer = setTimeout(() => setAnimatingIndex(null), totalDuration);
    timerIds.push(clearTimer);

    return () => {
      timerIds.forEach(clearTimeout);
      setAnimatingIndex(null);
    };
  }, [recalledCount, triggerRecallFeedback]);

  return (
    <div
      data-testid="session-progress"
      className={className}
      {...props}
    >
      <div className="flex items-center justify-between gap-4 px-4 py-2 bg-slate-800/50 rounded-lg">
        {/* Left: Anonymous point circles */}
        <PointIcons
          totalPoints={totalPoints}
          recalledCount={recalledCount}
          animatingIndex={animatingIndex}
          recalledLabels={recalledLabels}
        />

        {/* Center: Elapsed time — monospace tabular-nums prevents width shifts */}
        <span className="text-clarity-300 text-sm font-mono tabular-nums">
          {formatElapsedTime(elapsedSeconds)}
        </span>

        {/* Right: Explored branch summary pills + mute toggle */}
        <div className="flex items-center gap-3">
          <BranchSummaryPills summaries={branchSummaries} />
          <MuteToggle isMuted={isMuted} onToggle={onToggleMute} />
        </div>
      </div>
    </div>
  );
}

export default SessionProgress;
