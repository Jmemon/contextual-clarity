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

---

## Detailed Implementation

### 1. Complete Rewrite of `SessionProgress.tsx` (`web/src/components/live-session/SessionProgress.tsx`)

**Delete the entire current implementation.** The current component (107 lines) shows "X / Y points" with a linear progress bar. The new component is fundamentally different.

**New visual design:**
```
┌─────────────────────────────────────────────────────────────┐
│  ○ ○ ● ● ○ ○ ○    03:42    🐇 Adenosine    🔇             │
│                              Tolerance                      │
└─────────────────────────────────────────────────────────────┘
```

Layout: A single horizontal bar containing (left to right):
1. Anonymous point icons (circles)
2. Elapsed time (center or right-of-center)
3. Rabbit hole labels (small pills, right side)
4. Mute toggle (far right)

### 2. New Props Interface

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

### 3. Anonymous Point Icons

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

    // Animate each newly filled circle in sequence (50ms apart)
    for (let i = oldCount; i < newCount; i++) {
      setTimeout(() => {
        setAnimatingIndex(i);
        // Clear animation after 300ms
        setTimeout(() => setAnimatingIndex(null), 300);
      }, (i - oldCount) * 150);
    }

    prevRecalledCount.current = recalledCount;
  }
}, [recalledCount]);
```

### 4. Sound Effect on Recall

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

**Playing the sound**: Create a small utility hook or inline the logic in the recall animation effect:

```typescript
// Audio utility at the top of SessionProgress.tsx or in a separate utils file
const recallChimeRef = useRef<HTMLAudioElement | null>(null);

useEffect(() => {
  // Pre-load the audio element on mount for instant playback
  recallChimeRef.current = new Audio('/sounds/recall-chime.mp3');
  recallChimeRef.current.volume = 0.5;  // 50% volume — not startling
}, []);

/**
 * Play the recall chime sound. Respects mute state.
 * Clones the audio node if a previous chime is still playing
 * (handles rapid successive recalls after rabbit hole exit).
 */
function playRecallChime() {
  if (isMuted || !recallChimeRef.current) return;

  // Clone the audio node for overlapping playback
  const chime = recallChimeRef.current.cloneNode() as HTMLAudioElement;
  chime.volume = 0.5;
  chime.play().catch(() => {
    // Browser may block autoplay — fail silently
  });
}
```

**Trigger**: Play the chime inside the same `useEffect` that triggers the circle animation:
```typescript
// Inside the recall animation effect:
for (let i = oldCount; i < newCount; i++) {
  setTimeout(() => {
    setAnimatingIndex(i);
    playRecallChime();  // Play sound with each circle fill
    setTimeout(() => setAnimatingIndex(null), 300);
  }, (i - oldCount) * 150);
}
```

### 5. Mute Toggle

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

### 6. Elapsed Time Display

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

The `elapsedSeconds` prop is provided by `SessionContainer.tsx`, which already has a `useSessionTimer` hook (lines 48-59 of `SessionContainer.tsx`) that updates every second.

### 7. Rabbit Hole Labels Display

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
          {/* Small rabbit emoji or icon */}
          <span className="text-[10px]" aria-hidden="true">🐇</span>
          {label}
        </span>
      ))}
    </div>
  );
}
```

**Label source**: The `rabbitholeLabels` prop is populated from `rabbithole_exited` WebSocket events (handled in `use-session-websocket.ts`). Each `rabbithole_exited` event includes a `label` field (a 2-4 word description of the tangent topic).

### 8. Rabbit Hole Mode: Hide Progress

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

**Buffered recall animations**: Points that are recalled DURING a rabbit hole (because the silent evaluator from T06 is still running) are NOT animated immediately. Instead, `SessionContainer.tsx` maintains a buffer:

```typescript
// In SessionContainer.tsx or use-session-websocket.ts:

// Number of recall animations that are pending because they happened during a rabbit hole
const [pendingRecallAnimations, setPendingRecallAnimations] = useState(0);

// When a recall_point_recalled event arrives AND we are in a rabbit hole:
//   increment pendingRecallAnimations instead of immediately updating recalledCount for display

// When rabbithole_exited event arrives:
//   flush: update recalledCount by pendingRecallAnimations
//   this triggers the useEffect in SessionProgress that plays N animations in sequence
```

The parent component is responsible for this buffering logic. `SessionProgress` itself is stateless regarding buffering — it just reacts to `recalledCount` changes. If `recalledCount` jumps from 2 to 5 on rabbit hole exit, the animation effect plays 3 sequential circle fills with 3 chimes (150ms apart).

### 9. Complete Component Assembly

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

### 10. SessionContainer.tsx Integration

**Modify `SessionContainer.tsx`** to pass the new props to `SessionProgress`:

1. Track `recalledCount` from WebSocket events (already tracked if T01 is done)
2. Track `rabbitholeLabels: string[]` — append on each `rabbithole_exited` event
3. Track `isInRabbithole: boolean` — set `true` on `rabbithole_entered`, `false` on `rabbithole_exited`
4. Track `isMuted: boolean` — from localStorage
5. Pass all to `SessionProgress` as props

Replace the current `SessionProgress` usage. Currently (around line 120-ish in `SessionContainer.tsx`):
```tsx
<SessionProgress
  currentPoint={currentPointIndex + 1}
  totalPoints={totalPoints}
/>
```

Replace with:
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

### 11. WebSocket Hook Updates (`web/src/hooks/use-session-websocket.ts`)

Add state tracking for the new progress data. These may already be partially done by T01 and T09, but verify:

```typescript
// State additions:
const [recalledCount, setRecalledCount] = useState(0);
const [rabbitholeLabels, setRabbitholeLabels] = useState<string[]>([]);
const [isInRabbithole, setIsInRabbithole] = useState(false);
const [pendingRecallAnimations, setPendingRecallAnimations] = useState(0);

// Handler additions in the message handler switch:
// NOTE: The WS event name is 'recall_point_recalled' (with recall_ prefix), matching T13's event catalog.
// T01 emits 'point_recalled' from the engine, but the WS server message type is 'recall_point_recalled'.
// Ensure consistency between engine event names and WS message type names.
case 'recall_point_recalled':
  if (isInRabbithole) {
    // Buffer the animation — don't update recalledCount visually yet
    setPendingRecallAnimations(prev => prev + 1);
  } else {
    setRecalledCount(msg.recalledCount);
  }
  break;

case 'rabbithole_entered':
  setIsInRabbithole(true);
  break;

// NOTE: The rabbithole_exited payload (per T09/T13) has { label, pointsRecalledDuring },
// NOT { label, completionPending }. Use pointsRecalledDuring for buffer flush count.
case 'rabbithole_exited':
  setIsInRabbithole(false);
  // Flush buffered recalls
  if (pendingRecallAnimations > 0) {
    setRecalledCount(prev => prev + pendingRecallAnimations);
    setPendingRecallAnimations(0);
  }
  // Add the rabbit hole label
  if (msg.label) {
    setRabbitholeLabels(prev => [...prev, msg.label]);
  }
  break;
```

Return these values from the hook so `SessionContainer` can pass them to `SessionProgress`.

### 12. Sound File

Create or download a sound file at `web/public/sounds/recall-chime.mp3`.

If no suitable royalty-free MP3 can be found during implementation, create a placeholder:
- Use the Web Audio API to generate a simple sine wave chime programmatically as a fallback
- Add a TODO comment to replace with a proper sound file

Fallback programmatic chime:
```typescript
function playProgrammaticChime() {
  if (isMuted) return;
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
| REWRITE | `web/src/components/live-session/SessionProgress.tsx` | Complete rewrite: anonymous circles, timer, rabbit hole labels, mute toggle, hide-during-rabbithole |
| CREATE | `web/public/sounds/recall-chime.mp3` | Short royalty-free chime sound (or programmatic fallback) |
| MODIFY | `web/src/components/live-session/SessionContainer.tsx` | Pass new props to SessionProgress: `recalledCount`, `elapsedSeconds`, `rabbitholeLabels`, `isInRabbithole`, `isMuted`, `onToggleMute`. Add mute state with localStorage persistence. Add pending recall animation buffering. |
| MODIFY | `web/src/hooks/use-session-websocket.ts` | Track `recalledCount`, `rabbitholeLabels`, `isInRabbithole`, `pendingRecallAnimations`. Handle `recall_point_recalled`, `rabbithole_entered`, `rabbithole_exited` events with buffering logic. Return these values from the hook. |

---

## Success Criteria

1. **Anonymous circles**: One small circle renders per recall point. With 7 total points, 7 circles appear. No text labels, no topic hints, no numbered indicators — just circles.
2. **Left-to-right fill**: Circles fill from left to right regardless of which actual recall point was recalled. If the user recalls point 5 (of 7) first, the FIRST circle fills. Then if they recall point 2, the SECOND circle fills. The mapping is purely `recalledCount` based, not point-ID based.
3. **Fill animation**: When a circle fills, it briefly scales to 1.5x then settles back to 1x over ~300ms. Smooth CSS transition, not jarring.
4. **Sound on recall**: A pleasant, short chime plays each time a circle fills. The chime is not startling — low volume (0.5), under 1 second duration.
5. **Mute toggle**: A small speaker icon is visible in the progress bar. Clicking it toggles sound on/off. The mute state persists across browser reloads via `localStorage`.
6. **Elapsed timer**: Displays MM:SS format, updating every second. Starts at 00:00 when the session begins. Uses a monospace/tabular-nums font so the width doesn't shift as digits change.
7. **Rabbit hole labels**: After a rabbit hole is explored (entered AND exited), its 2-4 word label appears as a small amber-colored pill. No labels appear if no rabbit holes have been explored.
8. **Hide during rabbit hole**: When `isInRabbithole` becomes `true`, the entire progress bar smoothly animates out (fade + slide up, ~500ms). No progress information is visible during the rabbit hole.
9. **Show after rabbit hole**: When `isInRabbithole` becomes `false`, the progress bar smoothly animates back in (~500ms).
10. **Buffered recalls**: If 3 points are recalled during a rabbit hole, all 3 circle-fill animations and chimes play in sequence (150ms apart) when the rabbit hole exits. The total `recalledCount` jumps by 3 at that moment.
11. **No old progress UI**: The old "X / Y points" text and the linear progress bar are completely removed. The `currentPoint` prop is no longer used. No remnants of the old design.
12. **Props interface**: `SessionProgressProps` matches the specification: `totalPoints`, `recalledCount`, `elapsedSeconds`, `rabbitholeLabels`, `isInRabbithole`, `isMuted`, `onToggleMute`.
13. **Accessibility**: Each circle has an `aria-label` ("Point recalled" or "Point pending"). The mute button has an `aria-label`. The timer is readable by screen readers.
14. **No content leak**: At no point does the progress UI reveal the CONTENT or TOPIC of any unchecked recall point. The only information conveyed is: total count, recalled count, elapsed time, and which rabbit holes were explored.
15. **Sound file**: Either a real MP3 file exists at `web/public/sounds/recall-chime.mp3`, or a programmatic Web Audio API fallback is implemented that produces a pleasant chime.
16. **Integration**: `SessionContainer.tsx` passes all required props to the new `SessionProgress`. The WebSocket hook provides the necessary state values.
17. **Build passes**: `bun run build` in `web/` completes without errors. No TypeScript type errors from the new props interface.

---

## Implementation Warnings

> **WARNING: WS event name mismatch — `point_recalled` vs `recall_point_recalled`**
> T01 emits `'point_recalled'` from the session engine. T13's final event catalog uses `'recall_point_recalled'` as the WS server message type. Ensure the WebSocket handler translates between these names, or ensure T01 and T13 agree on the same name. The handler code in section 11 uses `'recall_point_recalled'` (the WS message type), which is correct for the frontend.

> **WARNING: Timer may have stale closure bug**
> Section 6 references `useSessionTimer` hook at lines 48-59 of `SessionContainer.tsx`. If the timer uses `setInterval` inside a `useEffect` that captures `elapsedSeconds` in a closure, the timer will not increment correctly (stale value captured). Verify that the existing timer uses a ref or functional `setState(prev => prev + 1)` pattern.

> **WARNING: `rabbithole_exited` payload structure**
> The `rabbithole_exited` WS message payload (per T09/T13) contains `{ label, pointsRecalledDuring }`, NOT `{ completionPending }`. The `label` field is what should be appended to the labels array. The `pointsRecalledDuring` field tells how many points were recalled during the rabbit hole (for buffered animation count). The `completionPending` flag is a separate concern handled by the overlay — check for a `session_complete_overlay` event that may follow.

> **WARNING: Stale closure in recall animation effect**
> The `useEffect` in section 3 closes over `recalledCount` via `prevRecalledCount.current`. When multiple points are recalled during a rabbit hole and then flushed on exit, the `for` loop with `setTimeout` captures `setAnimatingIndex` — this is fine (functional React state), but `playRecallChime()` may capture a stale `isMuted` value. Use a ref for `isMuted` in the chime playback function.
