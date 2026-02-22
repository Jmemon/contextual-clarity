/**
 * Session Progress Component — T11: Visual Progress
 *
 * Replaces the old "X / Y points" progress bar with an anonymous, event-driven
 * progress display. Design goals:
 *  - Show HOW MANY points recalled but NOT WHICH topics remain (anonymity)
 *  - Animate each newly-recalled circle (scale-up 1.5× for 300ms)
 *  - Play a pleasant Web Audio API chime on each recall
 *  - Show elapsed time in MM:SS (monospace, tabular-nums)
 *  - Show explored rabbit hole labels as amber pills
 *  - Smooth hide/show animation during rabbit hole mode (slide-up + fade)
 *  - Mute toggle persisted in localStorage
 *
 * Layout (left → right):
 *   [○ ○ ● ● ○]   03:42   [Adenosine] [Tolerance]   🔊
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

  /** Labels of rabbit holes that have been explored (entered and exited) */
  rabbitholeLabels: string[];

  /** Whether the user is currently inside a rabbit hole */
  isInRabbithole: boolean;

  /** Whether audio is muted (controlled by parent, persisted in localStorage) */
  isMuted: boolean;

  /** Callback when mute toggle is clicked */
  onToggleMute: () => void;
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
 * Renders a row of anonymous circles representing recall points.
 * Filled circles = recalled. Unfilled = pending.
 * Circles fill LEFT to RIGHT regardless of which actual point was recalled,
 * preserving anonymity about which specific topics remain.
 */
function PointIcons({
  totalPoints,
  recalledCount,
  animatingIndex,
}: {
  totalPoints: number;
  recalledCount: number;
  animatingIndex: number | null;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: totalPoints }, (_, i) => {
        const isRecalled = i < recalledCount;
        const isAnimating = i === animatingIndex;

        return (
          <div
            key={i}
            className={[
              'w-2.5 h-2.5 rounded-full transition-all duration-300',
              isRecalled
                ? 'bg-green-400 shadow-sm shadow-green-400/30'
                : 'bg-clarity-600 border border-clarity-500',
              isAnimating ? 'scale-150' : 'scale-100',
            ].join(' ')}
            aria-label={isRecalled ? 'Point recalled' : 'Point pending'}
          />
        );
      })}
    </div>
  );
}

/**
 * Renders a list of explored rabbit hole labels as small amber-colored pills.
 * Only shows rabbit holes that have been fully explored (entered and exited).
 * Returns null if no rabbit holes have been explored.
 */
function RabbitholeLabels({ labels }: { labels: string[] }) {
  if (labels.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {labels.map((label, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-amber-500/15 text-amber-300 border border-amber-500/20 rounded-full"
        >
          {label}
        </span>
      ))}
    </div>
  );
}

/**
 * Small mute/unmute toggle button with SVG speaker icons.
 * Speaker-with-waves = unmuted; speaker-with-X = muted.
 */
function MuteToggle({ isMuted, onToggle }: { isMuted: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="text-clarity-400 hover:text-clarity-200 transition-colors p-1"
      aria-label={isMuted ? 'Unmute recall sounds' : 'Mute recall sounds'}
      title={isMuted ? 'Unmute' : 'Mute'}
    >
      {isMuted ? (
        /* Speaker with X icon (muted) */
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <line x1="23" y1="9" x2="17" y2="15" />
          <line x1="17" y1="9" x2="23" y2="15" />
        </svg>
      ) : (
        /* Speaker with waves icon (unmuted) */
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
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
 * Hides automatically during rabbit hole mode (slide up + fade) and shows
 * again when the rabbit hole exits. Points recalled during a rabbit hole are
 * buffered in the hook and arrive as a bulk recalledCount increment; the
 * animation effect here plays N sequential circle fills 150ms apart.
 */
export function SessionProgress({
  totalPoints,
  recalledCount,
  elapsedSeconds,
  rabbitholeLabels,
  isInRabbithole,
  isMuted,
  onToggleMute,
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
   * Play a short, pleasant chime using the Web Audio API.
   * Generates a sine-wave tone (A5→E6) with quick exponential decay (~300ms).
   * Uses isMutedRef (not isMuted) to avoid stale closure in setTimeout callbacks.
   *
   * TODO: Replace with a real MP3 file at /sounds/recall-chime.mp3 for a more
   * polished sound. The Audio element approach is commented below for reference.
   */
  const playRecallChime = useCallback(() => {
    if (isMutedRef.current) return;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      const audioCtx = new AudioCtx();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      // A5 → E6 rising arpeggio feel, quick decay
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(1320, audioCtx.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);

      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.3);
    } catch {
      // Audio not available — fail silently
    }
  }, []);

  /**
   * Animate newly-recalled circles left-to-right.
   * When recalledCount increases by N (e.g. after a rabbit hole exits and buffered
   * recalls are flushed), animate each circle 150ms apart with a chime per circle.
   */
  useEffect(() => {
    if (recalledCount > prevRecalledCount.current) {
      const oldCount = prevRecalledCount.current;
      const newCount = recalledCount;
      prevRecalledCount.current = recalledCount;

      for (let i = oldCount; i < newCount; i++) {
        const delay = (i - oldCount) * 150;
        setTimeout(() => {
          setAnimatingIndex(i);
          // Use isMutedRef to avoid stale closure from the time the effect ran
          playRecallChime();
          // Clear the scale-up after 300ms so the circle settles back
          setTimeout(() => setAnimatingIndex(null), 300);
        }, delay);
      }
    }
  }, [recalledCount, playRecallChime]);

  return (
    <div
      data-testid="session-progress"
      className={className}
      {...props}
    >
      {/*
       * Slide-up + fade animation when entering/exiting rabbit hole mode.
       * max-h trick: animate between max-h-0 (hidden) and max-h-20 (visible)
       * so the surrounding layout collapses cleanly.
       */}
      <div
        className={[
          'transition-all duration-500 ease-in-out overflow-hidden',
          isInRabbithole
            ? 'max-h-0 opacity-0 -translate-y-2'
            : 'max-h-20 opacity-100 translate-y-0',
        ].join(' ')}
      >
        <div className="flex items-center justify-between gap-4 px-4 py-2 bg-clarity-800/50 rounded-lg">
          {/* Left: Anonymous point circles */}
          <PointIcons
            totalPoints={totalPoints}
            recalledCount={recalledCount}
            animatingIndex={animatingIndex}
          />

          {/* Center: Elapsed time — monospace tabular-nums prevents width shifts */}
          <span className="text-clarity-300 text-sm font-mono tabular-nums">
            {formatElapsedTime(elapsedSeconds)}
          </span>

          {/* Right: Explored rabbit hole labels + mute toggle */}
          <div className="flex items-center gap-3">
            <RabbitholeLabels labels={rabbitholeLabels} />
            <MuteToggle isMuted={isMuted} onToggle={onToggleMute} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default SessionProgress;
