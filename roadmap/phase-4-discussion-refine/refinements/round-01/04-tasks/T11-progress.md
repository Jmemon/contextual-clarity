# T11 — Visual Progress

| Field | Value |
|-------|-------|
| **name** | Visual Progress |
| **parallel-group** | D (wave 4) |
| **depends-on** | T01 (Per-Session Recall Point Checklist), T09 (Rabbit Holes as Separate UX Mode) |

---

## Description

Completely rewrite `SessionProgress.tsx` to replace the current "X / Y points" progress bar with an anonymous, event-driven progress display. The new design shows: anonymous point icons (circles that fill left-to-right as points are recalled, hiding WHICH topics remain), a running elapsed timer, a sound effect on each recall, a running list of rabbit hole labels as small pills, and automatic hiding of progress during rabbit hole mode. Points recalled during a rabbit hole are buffered and animated after exiting.

This task depends on T01 because it reads `recalledCount` and `totalPoints` from the checklist state. It depends on T09 because it reacts to `rabbithole_entered` / `rabbithole_exited` events and displays rabbit hole labels.

**Critical dependency note**: The WebSocket event types `recall_point_recalled`, `rabbithole_entered`, and `rabbithole_exited` do NOT currently exist in `SessionEventType` (in `src/core/session/types.ts`) or in the `ServerMessage` union (in `use-session-websocket.ts`). T01 must add `recall_point_recalled` and T09 must add `rabbithole_entered`/`rabbithole_exited` to the protocol types before T11's WebSocket handler code can compile. T11's implementation should be written assuming these types exist (they will after T01 and T09 complete), but the developer must verify the exact event names match what T01/T09 actually emit.

---

## Detailed Implementation

### 1. Fix `useSessionTimer` Bug in `SessionContainer.tsx`

**Pre-existing bug**: `SessionContainer.tsx` lines 53-58 use `useState` instead of `useEffect` for the timer interval. The cleanup function returned by the `useState` initializer is silently ignored — `useState` discards return values from initializers. The interval leaks and is never cleared on unmount. T11 must fix this since it directly uses the timer output.

**Fix**: Convert the broken `useState` call to a proper `useEffect`:

```typescript
function useSessionTimer() {
  const [startTime] = useState(() => Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // BUG FIX: The original code used useState() to set up the interval,
  // which silently discards the cleanup function. useEffect is correct.
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  // Format as MM:SS
  const formatTime = () => {
    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = elapsedSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  return { elapsedSeconds, formattedTime: formatTime() };
}
```

### 2. Add `elapsedSeconds` to `useSessionTimer` Destructure in `SessionContainer.tsx`

**Current code** at line 236:
```typescript
const { formattedTime } = useSessionTimer();
```

**Replace with**:
```typescript
const { formattedTime, elapsedSeconds } = useSessionTimer();
```

`elapsedSeconds` must be passed to the new `SessionProgress` component. The old code only used `formattedTime` for the header display; the new component needs the raw seconds value.

### 3. Create `web/public/sounds/` Directory

The `web/public/` directory does not currently exist. Vite serves static assets from `public/` by default.

**Step**: Create the directory `web/public/sounds/` before placing the sound file.

### 4. Complete Rewrite of `SessionProgress.tsx` (`web/src/components/live-session/SessionProgress.tsx`)

**Delete the entire current implementation.** The current component (107 lines) shows "X / Y points" with a linear progress bar. The new component is fundamentally different.

**New visual design:**
```
+---------------------------------------------------------+
|  O O * * O O O    03:42    rabbit Adenosine    mute     |
|                              Tolerance                   |
+---------------------------------------------------------+
```

Layout: A single horizontal bar containing (left to right):
1. Anonymous point icons (circles)
2. Elapsed time (center or right-of-center)
3. Rabbit hole labels (small pills, right side)
4. Mute toggle (far right)

### 5. New Props Interface

```typescript
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

  /** Whether audio is muted (controlled by parent or persisted in localStorage) */
  isMuted: boolean;

  /** Callback when mute toggle is clicked */
  onToggleMute: () => void;
}
```

Note: The parent component (`SessionContainer.tsx`) is responsible for tracking `recalledCount`, `elapsedSeconds`, `rabbitholeLabels`, and `isInRabbithole` from WebSocket events. `SessionProgress` is a pure presentational component.

### 6. Anonymous Point Icons

Render one small circle per recall point. Circles represent anonymous progress — the user sees HOW MANY points they have recalled but NOT WHICH TOPICS remain.

```tsx
/**
 * Renders a row of anonymous circles representing recall points.
 * Filled circles = recalled. Unfilled = pending.
 * Circles fill LEFT to RIGHT regardless of which actual point was recalled,
 * preserving anonymity about which specific topics remain.
 */
function PointIcons({ totalPoints, recalledCount, animatingIndex }: {
  totalPoints: number;
  recalledCount: number;
  animatingIndex: number | null;  // index of circle currently animating (scale-up)
}) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: totalPoints }, (_, i) => {
        const isRecalled = i < recalledCount;
        const isAnimating = i === animatingIndex;

        return (
          <div
            key={i}
            className={`
              w-2.5 h-2.5 rounded-full transition-all duration-300
              ${isRecalled
                ? 'bg-green-400 shadow-sm shadow-green-400/30'
                : 'bg-clarity-600 border border-clarity-500'
              }
              ${isAnimating ? 'scale-150' : 'scale-100'}
            `}
            aria-label={isRecalled ? 'Point recalled' : 'Point pending'}
          />
        );
      })}
    </div>
  );
}
```

**Key behavior**: Circles fill LEFT to RIGHT. If the user recalls point 3 before point 1, the leftmost unfilled circle fills. The mapping is: "the first N circles are filled, where N = recalledCount". This means the user sees "I've recalled 3 out of 7" but cannot deduce which specific topics are left.

**Animation on recall**: When `recalledCount` increases, the newly-filled circle briefly scales up (1.5x) for 300ms, then settles back. Use a `useEffect` that watches `recalledCount` and sets `animatingIndex` to `recalledCount - 1` for 300ms.

```typescript
// Inside SessionProgress component:
const [animatingIndex, setAnimatingIndex] = useState<number | null>(null);
const prevRecalledCount = useRef(recalledCount);

useEffect(() => {
  if (recalledCount > prevRecalledCount.current) {
    // One or more points were just recalled. Animate the newly filled circles.
    const newCount = recalledCount;
    const oldCount = prevRecalledCount.current;

    // Animate each newly filled circle in sequence (150ms apart)
    for (let i = oldCount; i < newCount; i++) {
      setTimeout(() => {
        setAnimatingIndex(i);
        // Play the recall chime, using isMutedRef to avoid stale closure
        if (!isMutedRef.current) playRecallChime();
        // Clear animation after 300ms
        setTimeout(() => setAnimatingIndex(null), 300);
      }, (i - oldCount) * 150);
    }

    prevRecalledCount.current = recalledCount;
  }
}, [recalledCount]);
```

### 7. Sound Effect on Recall — With Stale Closure Fix

**Sound file**: Include a short (< 1 second), pleasant chime/pop sound at `web/public/sounds/recall-chime.mp3`.

Finding the sound: Use a royalty-free sound from sites like:
- freesound.org (CC0 license)
- mixkit.co (free license)
- pixabay.com/sound-effects (Pixabay license)

Download a short, pleasant notification/chime sound. Must be:
- Less than 1 second duration
- Less than 50KB file size
- MP3 format
- Not jarring or loud — soft, satisfying chime

**Playing the sound with stale-closure-safe mute check**:

The `useEffect` that triggers animations uses `setTimeout` callbacks. These callbacks capture `isMuted` from the render when the effect ran, which may be stale by the time the timeout fires (e.g., if the user toggles mute during a rapid animation sequence). Fix: use a ref that syncs with the `isMuted` prop.

```typescript
// Ref that always reflects current isMuted prop value — avoids stale closure in setTimeout
const isMutedRef = useRef(isMuted);
useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

// Audio utility at the top of SessionProgress component
const recallChimeRef = useRef<HTMLAudioElement | null>(null);

useEffect(() => {
  // Pre-load the audio element on mount for instant playback
  recallChimeRef.current = new Audio('/sounds/recall-chime.mp3');
  recallChimeRef.current.volume = 0.5;  // 50% volume — not startling
}, []);

/**
 * Play the recall chime sound. Uses isMutedRef (not isMuted prop) to
 * avoid stale closure when called from setTimeout callbacks.
 * Clones the audio node if a previous chime is still playing
 * (handles rapid successive recalls after rabbit hole exit).
 */
function playRecallChime() {
  if (isMutedRef.current || !recallChimeRef.current) return;

  // Clone the audio node for overlapping playback
  const chime = recallChimeRef.current.cloneNode() as HTMLAudioElement;
  chime.volume = 0.5;
  chime.play().catch(() => {
    // Browser may block autoplay — fail silently
  });
}
```

**Trigger**: Play the chime inside the same `useEffect` that triggers the circle animation (shown in section 6 above). The call uses `isMutedRef.current` inside the `setTimeout`, not the `isMuted` prop directly.

### 8. Mute Toggle

A small speaker icon in the far right of the progress bar:

```tsx
/**
 * Small mute/unmute toggle button.
 * Uses a simple SVG icon: speaker with waves (unmuted) or speaker with X (muted).
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
        // Speaker with X icon (muted) — use a simple SVG or Lucide icon
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <line x1="23" y1="9" x2="17" y2="15" />
          <line x1="17" y1="9" x2="23" y2="15" />
        </svg>
      ) : (
        // Speaker with waves icon (unmuted)
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </svg>
      )}
    </button>
  );
}
```

**Mute state persistence**: The parent component (`SessionContainer.tsx`) should store mute state in `localStorage` so it persists across sessions:

```typescript
// In SessionContainer.tsx:
const [isMuted, setIsMuted] = useState(() => {
  return localStorage.getItem('recall-sound-muted') === 'true';
});

const handleToggleMute = useCallback(() => {
  setIsMuted(prev => {
    const newValue = !prev;
    localStorage.setItem('recall-sound-muted', String(newValue));
    return newValue;
  });
}, []);
```

### 9. Elapsed Time Display

Show a running timer in MM:SS format:

```tsx
/**
 * Formats seconds into MM:SS display string.
 */
function formatElapsedTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// In the JSX:
<span className="text-clarity-300 text-sm font-mono tabular-nums">
  {formatElapsedTime(elapsedSeconds)}
</span>
```

The `elapsedSeconds` prop is provided by `SessionContainer.tsx` via the fixed `useSessionTimer` hook (see section 1). The destructure in `SessionContainer.tsx` must include `elapsedSeconds` (see section 2).

### 10. Rabbit Hole Labels Display

After a rabbit hole is explored (entered AND exited), its label appears as a small pill/tag:

```tsx
/**
 * Renders a list of explored rabbit hole labels as small colored pills.
 * Only shows rabbit holes that have been fully explored (entered and exited).
 * Hidden if no rabbit holes have been explored.
 */
function RabbitholeLabels({ labels }: { labels: string[] }) {
  if (labels.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {labels.map((label, i) => (
        <span
          key={i}
          className="
            inline-flex items-center gap-1
            px-2 py-0.5
            text-xs font-medium
            bg-amber-500/15 text-amber-300 border border-amber-500/20
            rounded-full
          "
        >
          {label}
        </span>
      ))}
    </div>
  );
}
```

**Label source**: The `rabbitholeLabels` prop is populated from `rabbithole_exited` WebSocket events (handled in `use-session-websocket.ts`). Per the canonical payload shape (cross-task issue #12), `rabbithole_exited` includes a `label` field. Use `msg.label` to populate this array.

### 11. Rabbit Hole Mode: Hide Progress

When `isInRabbithole` is `true`, the entire progress bar should smoothly animate out (slide up + fade). When it becomes `false`, it slides back in.

```tsx
// Wrapper around the entire progress component content:
<div
  className={`
    transition-all duration-500 ease-in-out overflow-hidden
    ${isInRabbithole
      ? 'max-h-0 opacity-0 -translate-y-2'
      : 'max-h-20 opacity-100 translate-y-0'
    }
  `}
>
  {/* ... all progress content: icons, timer, labels, mute toggle ... */}
</div>
```

**Buffered recall animations**: Points that are recalled DURING a rabbit hole (because the silent evaluator from T06 is still running) are NOT animated immediately. Instead, the WebSocket hook (`use-session-websocket.ts`) maintains a buffer via `pendingRecallAnimations` (see section 14). When the rabbit hole exits, the buffered count is flushed into `recalledCount`, which triggers the animation effect in `SessionProgress` to play N sequential circle fills with N chimes (150ms apart).

### 12. Complete Component Assembly

The final `SessionProgress` component layout:

```tsx
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
  // Ref to track isMuted without stale closures in setTimeout callbacks
  const isMutedRef = useRef(isMuted);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

  // ... animation state, audio ref, effects ...

  return (
    <div
      data-testid="session-progress"
      className={`${className}`}
      {...props}
    >
      <div
        className={`
          transition-all duration-500 ease-in-out overflow-hidden
          ${isInRabbithole
            ? 'max-h-0 opacity-0 -translate-y-2'
            : 'max-h-20 opacity-100 translate-y-0'
          }
        `}
      >
        <div className="flex items-center justify-between gap-4 px-4 py-2 bg-clarity-800/50 rounded-lg">
          {/* Left: Anonymous point icons */}
          <PointIcons
            totalPoints={totalPoints}
            recalledCount={recalledCount}
            animatingIndex={animatingIndex}
          />

          {/* Center: Elapsed time */}
          <span className="text-clarity-300 text-sm font-mono tabular-nums">
            {formatElapsedTime(elapsedSeconds)}
          </span>

          {/* Right: Rabbit hole labels + mute toggle */}
          <div className="flex items-center gap-3">
            <RabbitholeLabels labels={rabbitholeLabels} />
            <MuteToggle isMuted={isMuted} onToggle={onToggleMute} />
          </div>
        </div>
      </div>
    </div>
  );
}
```

### 13. SessionContainer.tsx Integration — Remove BOTH Old `SessionProgress` Calls

**Two existing `SessionProgress` usages must both be removed.** The current `SessionContainer.tsx` renders `SessionProgress` in two places:

1. **Lines 344-349** — Inside the header, with `showBar={false}`:
   ```tsx
   <SessionProgress
     currentPoint={currentPointIndex}
     totalPoints={totalPoints}
     showBar={false}
     className="min-w-[100px]"
   />
   ```

2. **Lines 362-370** — Below the header, inside a `{totalPoints > 0 && (...)}` conditional, with `showBar={true}`:
   ```tsx
   {totalPoints > 0 && (
     <div className="px-6 py-2 bg-clarity-900/30">
       <SessionProgress
         currentPoint={currentPointIndex}
         totalPoints={totalPoints}
         showBar={true}
       />
     </div>
   )}
   ```

**Remove BOTH of these.** The new single-bar design replaces them with ONE call. Also remove the old header timer display at line 339 (`{formattedTime}`) since elapsed time is now shown inside the new `SessionProgress` component.

**Replace with one new call**, placed in the header area (replacing both the old timer and the old progress display):

```tsx
<SessionProgress
  totalPoints={totalPoints}
  recalledCount={recalledCount}
  elapsedSeconds={elapsedSeconds}
  rabbitholeLabels={rabbitholeLabels}
  isInRabbithole={isInRabbithole}
  isMuted={isMuted}
  onToggleMute={handleToggleMute}
/>
```

**Additional SessionContainer.tsx changes:**

1. Add `elapsedSeconds` to the `useSessionTimer()` destructure (see section 2).
2. Add `isMuted` state with `localStorage` persistence (see section 8).
3. Add `handleToggleMute` callback (see section 8).
4. Destructure the new state values from `useSessionWebSocket` (see section 14 for what the hook returns).

### 14. WebSocket Hook Updates (`web/src/hooks/use-session-websocket.ts`)

Add the following new state variables to the hook. These are NEW state additions — `recalledCount` is NOT the same as the existing `currentPointIndex`. The existing `currentPointIndex` will have been replaced by T01's checklist changes. `recalledCount` is a new semantic concept: the count of recall points successfully recalled, driven by `recall_point_recalled` events.

**New state variables:**

```typescript
// New state for progress tracking
const [recalledCount, setRecalledCount] = useState(0);
const [isInRabbithole, setIsInRabbithole] = useState(false);
const [rabbitholeLabels, setRabbitholeLabels] = useState<string[]>([]);
const [pendingRecallAnimations, setPendingRecallAnimations] = useState(0);

// Ref to avoid stale closure when reading pendingRecallAnimations inside handleMessage
const pendingRef = useRef(0);
```

**Add to `UseSessionWebSocketReturn` interface:**

```typescript
export interface UseSessionWebSocketReturn {
  // ... existing fields ...
  /** Number of recall points successfully recalled */
  recalledCount: number;
  /** Whether the user is currently inside a rabbit hole */
  isInRabbithole: boolean;
  /** Labels of rabbit holes that have been explored (entered and exited) */
  rabbitholeLabels: string[];
  /** Number of recall animations buffered during rabbit hole */
  pendingRecallAnimations: number;
}
```

**Handler additions in the `handleMessage` switch** (inside the `useCallback`):

```typescript
// NOTE: These event types do NOT exist in the current ServerMessage union.
// T01 must add 'recall_point_recalled' and T09 must add 'rabbithole_entered'
// and 'rabbithole_exited' to the ServerMessage type before this code compiles.

case 'recall_point_recalled':
  if (isInRabbithole) {
    // Buffer the animation — don't update recalledCount visually yet.
    // Use ref to track pending count to avoid stale closure.
    pendingRef.current += 1;
    setPendingRecallAnimations(pendingRef.current);
  } else {
    setRecalledCount(prev => prev + 1);
  }
  break;

case 'rabbithole_entered':
  setIsInRabbithole(true);
  break;

// The canonical rabbithole_exited payload (per cross-task issue #12) is:
// { type: 'rabbithole_exited'; label: string; pointsRecalledDuring: number; completionPending: boolean; }
// Use msg.label for the label pill and msg.pointsRecalledDuring for the buffer flush.
case 'rabbithole_exited':
  setIsInRabbithole(false);
  // Flush buffered recalls using ref to get current value (avoids stale closure)
  if (pendingRef.current > 0) {
    setRecalledCount(prev => prev + pendingRef.current);
    pendingRef.current = 0;
    setPendingRecallAnimations(0);
  }
  // Add the rabbit hole label from the canonical payload
  if (msg.label) {
    setRabbitholeLabels(prev => [...prev, msg.label]);
  }
  break;
```

**Return these values from the hook** so `SessionContainer` can pass them to `SessionProgress`:

```typescript
return {
  // ... existing fields ...
  recalledCount,
  isInRabbithole,
  rabbitholeLabels,
  pendingRecallAnimations,
};
```

### 15. Sound File

Create or download a sound file at `web/public/sounds/recall-chime.mp3`.

If no suitable royalty-free MP3 can be found during implementation, create a placeholder:
- Use the Web Audio API to generate a simple sine wave chime programmatically as a fallback
- Add a TODO comment to replace with a proper sound file

Fallback programmatic chime:
```typescript
/**
 * Fallback chime using Web Audio API if no MP3 file is available.
 * Uses isMutedRef (not isMuted prop) to avoid stale closure.
 */
function playProgrammaticChime() {
  if (isMutedRef.current) return;
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);  // A5 note
    oscillator.frequency.exponentialRampToValueAtTime(1320, audioCtx.currentTime + 0.1);  // E6
    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);

    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.3);
  } catch {
    // Audio not available — fail silently
  }
}
```

---

## Relevant Files

| Action | File | What Changes |
|--------|------|-------------|
| REWRITE | `web/src/components/live-session/SessionProgress.tsx` | Complete rewrite: anonymous circles, timer, rabbit hole labels, mute toggle, hide-during-rabbithole, stale-closure-safe chime playback via `isMutedRef` |
| CREATE | `web/public/sounds/` | Create directory (does not exist yet). Vite serves static assets from `public/` by default. |
| CREATE | `web/public/sounds/recall-chime.mp3` | Short royalty-free chime sound (or programmatic fallback) |
| MODIFY | `web/src/components/live-session/SessionContainer.tsx` | Fix `useSessionTimer` bug (convert `useState` to `useEffect` for interval). Add `elapsedSeconds` to timer destructure. Remove BOTH old `SessionProgress` calls (lines 344-349 and lines 362-370). Remove old header timer display (line 339). Replace with one new `SessionProgress` call. Add mute state with localStorage persistence. Destructure new values from WebSocket hook. |
| MODIFY | `web/src/hooks/use-session-websocket.ts` | Add new state: `recalledCount`, `isInRabbithole`, `rabbitholeLabels`, `pendingRecallAnimations`, plus `pendingRef` ref. Add `UseSessionWebSocketReturn` fields. Handle `recall_point_recalled`, `rabbithole_entered`, `rabbithole_exited` events (these types must be added by T01/T09 first). Use ref for `pendingRecallAnimations` to avoid stale closure in flush. Return new values from hook. |

---

## Success Criteria

1. **Anonymous circles**: One small circle renders per recall point. With 7 total points, 7 circles appear. No text labels, no topic hints, no numbered indicators — just circles.
2. **Left-to-right fill**: Circles fill from left to right regardless of which actual recall point was recalled. If the user recalls point 5 (of 7) first, the FIRST circle fills. Then if they recall point 2, the SECOND circle fills. The mapping is purely `recalledCount` based, not point-ID based.
3. **Fill animation**: When a circle fills, it briefly scales to 1.5x then settles back to 1x over ~300ms. Smooth CSS transition, not jarring.
4. **Sound on recall**: A pleasant, short chime plays each time a circle fills. The chime is not startling — low volume (0.5), under 1 second duration.
5. **Mute toggle**: A small speaker icon is visible in the progress bar. Clicking it toggles sound on/off. The mute state persists across browser reloads via `localStorage`.
6. **Elapsed timer**: Displays MM:SS format, updating every second. Starts at 00:00 when the session begins. Uses a monospace/tabular-nums font so the width doesn't shift as digits change.
7. **Rabbit hole labels**: After a rabbit hole is explored (entered AND exited), its 2-4 word label appears as a small amber-colored pill. No labels appear if no rabbit holes have been explored. Labels come from `msg.label` in the canonical `rabbithole_exited` payload.
8. **Hide during rabbit hole**: When `isInRabbithole` becomes `true`, the entire progress bar smoothly animates out (fade + slide up, ~500ms). No progress information is visible during the rabbit hole.
9. **Show after rabbit hole**: When `isInRabbithole` becomes `false`, the progress bar smoothly animates back in (~500ms).
10. **Buffered recalls**: If 3 points are recalled during a rabbit hole, all 3 circle-fill animations and chimes play in sequence (150ms apart) when the rabbit hole exits. The total `recalledCount` jumps by 3 at that moment.
11. **No old progress UI**: The old "X / Y points" text and the linear progress bar are completely removed. The `currentPoint` and `showBar` props are no longer used. BOTH old `SessionProgress` calls (lines 344-349 and 362-370) are removed. No remnants of the old design.
12. **Props interface**: `SessionProgressProps` matches the specification: `totalPoints`, `recalledCount`, `elapsedSeconds`, `rabbitholeLabels`, `isInRabbithole`, `isMuted`, `onToggleMute`.
13. **Accessibility**: Each circle has an `aria-label` ("Point recalled" or "Point pending"). The mute button has an `aria-label`. The timer is readable by screen readers.
14. **No content leak**: At no point does the progress UI reveal the CONTENT or TOPIC of any unchecked recall point. The only information conveyed is: total count, recalled count, elapsed time, and which rabbit holes were explored.
15. **Sound file**: Either a real MP3 file exists at `web/public/sounds/recall-chime.mp3`, or a programmatic Web Audio API fallback is implemented that produces a pleasant chime.
16. **Integration**: `SessionContainer.tsx` passes all required props to the new `SessionProgress`. The WebSocket hook provides the necessary state values.
17. **Build passes**: `bun run build` in `web/` completes without errors. No TypeScript type errors from the new props interface.
18. **Timer bug fixed**: The `useSessionTimer` hook uses `useEffect` (not `useState`) for the interval. The interval is properly cleaned up on unmount. No interval leak.
19. **Stale closure bugs fixed**: `isMutedRef` is used in setTimeout callbacks (not the `isMuted` prop). `pendingRef` is used in the `rabbithole_exited` handler to read the current pending count (not the stale `pendingRecallAnimations` state).
20. **`elapsedSeconds` destructured**: `SessionContainer.tsx` destructures `elapsedSeconds` from `useSessionTimer()` and passes it to `SessionProgress`.

---

## Implementation Warnings

> **WARNING: WS event types do not exist yet — hard dependency on T01 and T09**
> The event types `recall_point_recalled`, `rabbithole_entered`, and `rabbithole_exited` are NOT in the current `SessionEventType` enum (`src/core/session/types.ts` lines 51-58) or the `ServerMessage` union (`use-session-websocket.ts` lines 64-72). T01 must add `recall_point_recalled` and T09 must add `rabbithole_entered`/`rabbithole_exited` to both the backend event types and the frontend `ServerMessage` union. T11's handler code will not compile until those types exist. The developer should verify the exact event names match what T01/T09 actually define.

> **WARNING: WS event name mismatch — `point_recalled` vs `recall_point_recalled`**
> T01 emits `'point_recalled'` from the session engine. T13's final event catalog uses `'recall_point_recalled'` as the WS server message type. Ensure the WebSocket handler translates between these names, or ensure T01 and T13 agree on the same name. The handler code in section 14 uses `'recall_point_recalled'` (the WS message type), which is correct for the frontend.

> **WARNING: `rabbithole_exited` canonical payload shape**
> T09 originally defined `{ completionPending: boolean }` and T13 originally defined `{ label: string; pointsRecalledDuring: number }`. Per cross-task issue #12, the canonical shape is:
> ```typescript
> { type: 'rabbithole_exited'; label: string; pointsRecalledDuring: number; completionPending: boolean; }
> ```
> T11 should use `msg.label` for `rabbitholeLabels` and `msg.pointsRecalledDuring` is available for validation, but the primary mechanism for counting buffered recalls is `pendingRef.current` (incremented by each `recall_point_recalled` event during the rabbithole).

> **WARNING: `currentPointIndex` is being replaced by T01**
> The existing `currentPointIndex` state in `use-session-websocket.ts` will be replaced by T01's checklist-based tracking (see cross-task issue #13). T11 adds `recalledCount` as NEW state, which is semantically different from `currentPointIndex`. `recalledCount` is driven by `recall_point_recalled` events and counts successful recalls. Do not reuse or alias `currentPointIndex` for this purpose.
