# Recall Session UX Refinements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix broken rabbit hole detection, replace audio chime with haptic+visual feedback, add tappable point indicators showing topic keywords, and enhance session completion with recalled topic list.

**Architecture:** Six independent changes to the recall session flow. Task 1 (wire up rabbit hole deps) is the critical backend fix. Tasks 2-6 are frontend changes that can proceed in any order after Task 1. All data flows through the existing WebSocket event system — no new API endpoints.

**Tech Stack:** React (frontend), Bun (backend), WebSocket, Tailwind CSS, Web Vibration API

---

### Task 1: Wire Up Rabbit Hole Detection Dependencies

The `SessionEngine` is constructed in `session-handler.ts` WITHOUT the `rabbitholeDetector` dependency, so rabbit hole detection is dead code. This task injects the Phase 2 dependencies.

**Files:**
- Modify: `src/api/ws/session-handler.ts:169-184` (WebSocketHandlerDependencies interface)
- Modify: `src/api/ws/session-handler.ts:266-274` (SessionEngine construction in handleOpen)
- Modify: `src/api/server.ts:420-443` (createWsDependencies function)
- Modify: `src/api/server.ts:56-65` (imports)

**Step 1: Add Phase 2 deps to `WebSocketHandlerDependencies`**

In `src/api/ws/session-handler.ts`, add to the `WebSocketHandlerDependencies` interface after line 183:

```typescript
// Phase 2: Metrics and rabbit hole detection (optional but recommended)
import type { SessionMetricsCollector } from '@/core/session/metrics-collector';
import type { RabbitholeDetector } from '@/core/analysis/rabbithole-detector';
import type {
  SessionMetricsRepository,
  RecallOutcomeRepository,
  RabbitholeEventRepository,
} from '@/storage/repositories';

// Add these fields to WebSocketHandlerDependencies:
  /** Phase 2: Metrics collector instance */
  metricsCollector?: SessionMetricsCollector;
  /** Phase 2: Rabbit hole detector instance */
  rabbitholeDetector?: RabbitholeDetector;
  /** Phase 2: Session metrics repository */
  metricsRepo?: SessionMetricsRepository;
  /** Phase 2: Recall outcome repository */
  recallOutcomeRepo?: RecallOutcomeRepository;
  /** Phase 2: Rabbithole event repository */
  rabbitholeRepo?: RabbitholeEventRepository;
```

**Step 2: Pass Phase 2 deps when constructing SessionEngine in `handleOpen()`**

In `src/api/ws/session-handler.ts`, update the `new SessionEngine({...})` call around line 266:

```typescript
const engine = new SessionEngine({
  scheduler: this.deps.scheduler,
  evaluator: this.deps.evaluator,
  llmClient: this.deps.llmClient,
  recallSetRepo: this.deps.recallSetRepo,
  recallPointRepo: this.deps.recallPointRepo,
  sessionRepo: this.deps.sessionRepo,
  messageRepo: this.deps.messageRepo,
  // Phase 2: Metrics and rabbit hole detection
  metricsCollector: this.deps.metricsCollector,
  rabbitholeDetector: this.deps.rabbitholeDetector,
  metricsRepo: this.deps.metricsRepo,
  recallOutcomeRepo: this.deps.recallOutcomeRepo,
  rabbitholeRepo: this.deps.rabbitholeRepo,
});
```

**Step 3: Create Phase 2 instances in `createWsDependencies()` in `server.ts`**

Add imports at the top of `src/api/server.ts`:

```typescript
import { SessionMetricsCollector } from '@/core/session/metrics-collector';
import { RabbitholeDetector } from '@/core/analysis/rabbithole-detector';
import {
  SessionRepository,
  RecallSetRepository,
  RecallPointRepository,
  SessionMessageRepository,
  SessionMetricsRepository,
  RecallOutcomeRepository,
  RabbitholeEventRepository,
} from '@/storage/repositories';
```

Update the `createWsDependencies()` function to construct and return Phase 2 deps:

```typescript
function createWsDependencies(): WebSocketHandlerDependencies {
  const llmClient = new AnthropicClient();
  const evaluatorClient = new AnthropicClient();
  // Dedicated LLM client for rabbit hole detection (separate from tutor and evaluator)
  const detectorClient = new AnthropicClient();
  const scheduler = new FSRSScheduler();
  const evaluator = new RecallEvaluator(evaluatorClient);

  return {
    sessionRepo: new SessionRepository(db),
    recallSetRepo: new RecallSetRepository(db),
    recallPointRepo: new RecallPointRepository(db),
    messageRepo: new SessionMessageRepository(db),
    scheduler,
    evaluator,
    llmClient,
    // Phase 2: Metrics and rabbit hole detection
    metricsCollector: new SessionMetricsCollector(),
    rabbitholeDetector: new RabbitholeDetector(detectorClient),
    metricsRepo: new SessionMetricsRepository(db),
    recallOutcomeRepo: new RecallOutcomeRepository(db),
    rabbitholeRepo: new RabbitholeEventRepository(db),
  };
}
```

**Step 4: Verify TypeScript compiles**

Run: `cd /Users/johnmemon/Desktop/contextual-clarity && bunx tsc --noEmit 2>&1 | head -20`
Expected: No errors

**Step 5: Commit**

```bash
git add src/api/ws/session-handler.ts src/api/server.ts
git commit -m "fix: wire up rabbit hole detection and metrics dependencies into SessionEngine"
```

---

### Task 2: Add `label` Field to `point_recalled` Event

RecallPoint has no `title` field — only `content` (full text). We need to extract a short label and send it with the `point_recalled` event so the frontend can display topic keywords.

**Files:**
- Modify: `src/core/session/types.ts:120` (SessionEventData point_recalled variant)
- Modify: `src/core/session/session-engine.ts:1116-1142` (markPointRecalled method)
- Modify: `src/api/ws/types.ts:206-214` (PointRecalledPayload)
- Modify: `src/api/ws/session-handler.ts:300-307` (event listener point_recalled case)
- Modify: `web/src/hooks/use-session-websocket.ts:77` (ServerMessage point_recalled)
- Modify: `web/src/hooks/use-session-websocket.ts:497-509` (point_recalled handler)

**Step 1: Add `label` to `SessionEventData` point_recalled variant**

In `src/core/session/types.ts` line 120, change:
```typescript
| { type: 'point_recalled'; pointId: string; recalledCount: number; totalPoints: number }
```
to:
```typescript
| { type: 'point_recalled'; pointId: string; label: string; recalledCount: number; totalPoints: number }
```

**Step 2: Extract label in `markPointRecalled()`**

In `src/core/session/session-engine.ts`, update `markPointRecalled()`. Add a label extraction helper above it:

```typescript
/**
 * Extracts a short topic label from recall point content.
 * Takes the first sentence or first 50 characters, whichever is shorter.
 */
private extractPointLabel(pointId: string): string {
  const point = this.targetPoints.find(p => p.id === pointId);
  if (!point) return 'Unknown';
  const content = point.content;
  // Take first sentence (up to period, question mark, or newline)
  const firstSentence = content.split(/[.\n?]/)[0].trim();
  // Cap at 50 chars
  return firstSentence.length > 50 ? firstSentence.substring(0, 47) + '...' : firstSentence;
}
```

Update the `emitEvent` call inside `markPointRecalled()` (around line 1121):
```typescript
this.emitEvent({
  type: 'point_recalled',
  pointId,
  label: this.extractPointLabel(pointId),
  recalledCount: this.getRecalledCount(),
  totalPoints: this.targetPoints.length,
});
```

**Step 3: Add `label` to `PointRecalledPayload` WS type**

In `src/api/ws/types.ts`, add `label` field to `PointRecalledPayload`:
```typescript
export interface PointRecalledPayload {
  type: 'point_recalled';
  pointId: string;
  /** Short topic keyword extracted from the recall point content */
  label: string;
  recalledCount: number;
  totalPoints: number;
}
```

**Step 4: Forward `label` in session-handler event listener**

In `src/api/ws/session-handler.ts`, update the `point_recalled` case (around line 300):
```typescript
case 'point_recalled':
  this.send(ws, {
    type: 'point_recalled',
    pointId: d.pointId,
    label: d.label,
    recalledCount: d.recalledCount,
    totalPoints: d.totalPoints,
  });
  break;
```

**Step 5: Update frontend `ServerMessage` type and handler**

In `web/src/hooks/use-session-websocket.ts`, update the `point_recalled` type in `ServerMessage` (line 77):
```typescript
| { type: 'point_recalled'; pointId: string; label: string; recalledCount: number; totalPoints: number }
```

Add `recalledLabels` state to the hook (near line 349):
```typescript
// Labels of recalled points in recall order, for tappable indicator display
const [recalledLabels, setRecalledLabels] = useState<string[]>([]);
```

Update the `point_recalled` case in `handleMessage` (around line 497):
```typescript
case 'point_recalled':
  setTotalPoints(message.totalPoints);
  // Store the label for tappable indicator display
  if (!isInRabbitholeRef.current) {
    setRecalledLabels(prev => [...prev, message.label]);
  } else {
    // Buffer labels during rabbit hole, along with count
    pendingLabelsRef.current.push(message.label);
    pendingRef.current += 1;
  }
  if (isInRabbitholeRef.current) {
    // Already handled above
  } else {
    setRecalledCount(message.recalledCount);
  }
  break;
```

Add a `pendingLabelsRef` near `pendingRef`:
```typescript
const pendingLabelsRef = useRef<string[]>([]);
```

In the `rabbithole_exited` handler, flush pending labels:
```typescript
case 'rabbithole_exited':
  setIsInRabbithole(false);
  setRabbitholeTopic(null);
  if (pendingRef.current > 0) {
    setRecalledCount(prev => prev + pendingRef.current);
    setRecalledLabels(prev => [...prev, ...pendingLabelsRef.current]);
    pendingRef.current = 0;
    pendingLabelsRef.current = [];
  }
  if (message.label) {
    setRabbitholeLabels(prev => [...prev, message.label]);
  }
  callbacksRef.current.onRabbitholeExited?.(
    message.label,
    message.pointsRecalledDuring,
    message.completionPending
  );
  break;
```

Also reset `pendingLabelsRef` in `rabbithole_entered`:
```typescript
case 'rabbithole_entered':
  // ... existing code ...
  pendingRef.current = 0;
  pendingLabelsRef.current = [];
  // ...
```

Add `recalledLabels` to the return object of the hook.

**Step 6: Verify TypeScript compiles**

Run: `cd /Users/johnmemon/Desktop/contextual-clarity && bunx tsc --noEmit 2>&1 | head -20`
Expected: No errors

**Step 7: Commit**

```bash
git add src/core/session/types.ts src/core/session/session-engine.ts src/api/ws/types.ts src/api/ws/session-handler.ts web/src/hooks/use-session-websocket.ts
git commit -m "feat: add label field to point_recalled events for topic keyword display"
```

---

### Task 3: Tappable Point Indicators with Popover

**Files:**
- Modify: `web/src/components/live-session/SessionProgress.tsx:70-101` (PointIcons component)
- Modify: `web/src/components/live-session/SessionProgress.tsx:168-314` (SessionProgress component)
- Modify: `web/src/components/live-session/SessionContainer.tsx:386-397` (pass recalledLabels)

**Step 1: Add `recalledLabels` prop to `SessionProgressProps`**

In `SessionProgress.tsx`, add to the interface:
```typescript
/** Labels of recalled points in recall order, for tappable display */
recalledLabels: string[];
```

**Step 2: Create a PointPopover sub-component**

Add above the `SessionProgress` component:
```typescript
/**
 * Small popover showing the topic keyword for a recalled point.
 * Positioned above the circle, clamped to viewport edges.
 */
function PointPopover({
  label,
  onDismiss,
}: {
  label: string;
  onDismiss: () => void;
}) {
  // Dismiss on outside click
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
      className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-slate-700 text-white text-xs rounded-lg shadow-lg whitespace-nowrap z-50 animate-in fade-in duration-150"
    >
      {label}
      <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-700 rotate-45 -mt-1" />
    </div>
  );
}
```

**Step 3: Update PointIcons to accept labels and handle clicks**

Replace the `PointIcons` component to accept `recalledLabels` and manage popover state:

```typescript
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
```

**Step 4: Pass `recalledLabels` through SessionProgress to PointIcons**

Update the `SessionProgress` component to destructure `recalledLabels` and pass it to `PointIcons`:
```typescript
<PointIcons
  totalPoints={totalPoints}
  recalledCount={recalledCount}
  animatingIndex={animatingIndex}
  recalledLabels={recalledLabels}
/>
```

**Step 5: Pass `recalledLabels` from SessionContainer**

In `SessionContainer.tsx`, destructure `recalledLabels` from the hook return and pass to `SessionProgress`:
```typescript
// Destructure from hook
const { ..., recalledLabels } = useSessionWebSocket(sessionId, { ... });

// Pass to SessionProgress
<SessionProgress
  ...
  recalledLabels={recalledLabels}
/>
```

**Step 6: Verify TypeScript compiles**

Run: `cd /Users/johnmemon/Desktop/contextual-clarity && bunx tsc --noEmit 2>&1 | head -20`

**Step 7: Commit**

```bash
git add web/src/components/live-session/SessionProgress.tsx web/src/components/live-session/SessionContainer.tsx
git commit -m "feat: add tappable point indicators showing topic keywords on tap"
```

---

### Task 4: Replace Audio Chime with Haptic + Enhanced Visual

**Files:**
- Modify: `web/src/components/live-session/SessionProgress.tsx:129-154` (MuteToggle)
- Modify: `web/src/components/live-session/SessionProgress.tsx:200-230` (playRecallChime)
- Modify: `web/src/components/live-session/SessionProgress.tsx:246-272` (animation effect)
- Modify: `web/src/components/live-session/SessionContainer.tsx:247-257` (mute state + label)

**Step 1: Replace `playRecallChime` with `triggerRecallFeedback`**

In `SessionProgress.tsx`, replace the `playRecallChime` function with:

```typescript
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
```

**Step 2: Update the animation effect to use `triggerRecallFeedback`**

In the `useEffect` that animates circles, replace `playRecallChime()` with `triggerRecallFeedback()`.

**Step 3: Update MuteToggle icons and labels**

Change the `MuteToggle` component to use vibration icons:
- Unmuted: phone-with-vibration icon
- Muted: phone-with-slash icon
- aria-label: "Disable vibration" / "Enable vibration"

```typescript
function MuteToggle({ isMuted, onToggle }: { isMuted: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="text-clarity-400 hover:text-clarity-200 transition-colors p-1"
      aria-label={isMuted ? 'Enable vibration' : 'Disable vibration'}
      title={isMuted ? 'Vibration off' : 'Vibration on'}
    >
      {isMuted ? (
        /* Vibration off icon */
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="7" y="4" width="10" height="16" rx="1" />
          <line x1="2" y1="2" x2="22" y2="22" />
        </svg>
      ) : (
        /* Vibration on icon */
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
```

**Step 4: Enhanced glow on circle animation**

Already handled in Task 3 Step 3 — the animating circle gets `shadow-[0_0_8px_rgba(74,222,128,0.6)]` class during animation. Verify this is in place.

**Step 5: Verify TypeScript compiles**

Run: `cd /Users/johnmemon/Desktop/contextual-clarity && bunx tsc --noEmit 2>&1 | head -20`

**Step 6: Commit**

```bash
git add web/src/components/live-session/SessionProgress.tsx
git commit -m "feat: replace audio chime with haptic vibration and enhanced visual glow"
```

---

### Task 5: Emerald Theme for Rabbit Hole UI

**Files:**
- Modify: `web/src/components/live-session/RabbitholePrompt.tsx`
- Modify: `web/src/components/live-session/RabbitholeIndicator.tsx`
- Modify: `web/src/components/live-session/SessionProgress.tsx` (RabbitholeLabels)
- Modify: `web/src/components/live-session/SessionContainer.tsx` (background tint)

**Step 1: Update RabbitholePrompt colors**

In `RabbitholePrompt.tsx`, replace all amber classes with emerald:
- `bg-amber-500/10` → `bg-emerald-500/10`
- `border-amber-500/30` → `border-emerald-500/30`
- `text-amber-400` → `text-emerald-400`
- `text-amber-200` → `text-emerald-200`
- `text-amber-100` → `text-emerald-100`
- `bg-amber-500` → `bg-emerald-500`
- `hover:bg-amber-400` → `hover:bg-emerald-400`

**Step 2: Update RabbitholeIndicator colors**

In `RabbitholeIndicator.tsx`, replace:
- `bg-amber-500/15` → `bg-emerald-500/15`
- `border-amber-500/25` → `border-emerald-500/25`
- `text-amber-400` → `text-emerald-400`
- `text-amber-200` → `text-emerald-200`
- `text-amber-100` → `text-emerald-100`

**Step 3: Update RabbitholeLabels pill colors in SessionProgress**

In `SessionProgress.tsx`, update the `RabbitholeLabels` component:
- `bg-amber-500/15` → `bg-emerald-500/15`
- `text-amber-300` → `text-emerald-300`
- `border-amber-500/20` → `border-emerald-500/20`

**Step 4: Add background tint in SessionContainer**

In `SessionContainer.tsx`, add a subtle emerald background tint when in rabbit hole mode. On the `<main>` element, add a conditional class:

```typescript
<main className={`flex-1 flex flex-col max-w-4xl mx-auto w-full px-6 py-6 overflow-hidden transition-colors duration-500 ${
  isInRabbithole ? 'bg-emerald-500/[0.03]' : ''
}`}>
```

**Step 5: Verify visually**

No compile check needed for CSS-only changes, but run `bunx tsc --noEmit` to be safe.

**Step 6: Commit**

```bash
git add web/src/components/live-session/RabbitholePrompt.tsx web/src/components/live-session/RabbitholeIndicator.tsx web/src/components/live-session/SessionProgress.tsx web/src/components/live-session/SessionContainer.tsx
git commit -m "feat: emerald theme for rabbit hole UI — distinct from main recall flow"
```

---

### Task 6: Session Completion with Recalled Topic List

**Files:**
- Modify: `src/core/session/types.ts:88-106` (SessionCompletionSummary)
- Modify: `src/core/session/session-engine.ts:1393-1414` (completeSession — add labels)
- Modify: `web/src/hooks/use-session-websocket.ts:94-113` (SessionCompleteSummary)
- Modify: `web/src/components/live-session/SessionCompleteOverlay.tsx`
- Modify: `web/src/components/live-session/SessionContainer.tsx:80-162` (SessionCompleteScreen)

**Step 1: Add `recalledPointLabels` to `SessionCompletionSummary`**

In `src/core/session/types.ts`, add after `recalledPointIds`:
```typescript
/** Short topic labels for each recalled point (same order as recalledPointIds) */
recalledPointLabels: string[];
```

**Step 2: Populate labels in `completeSession()`**

In `session-engine.ts`, update the `completeSession()` method's `emitEvent` call to include labels:
```typescript
recalledPointIds: this.getRecalledPointIds(),
recalledPointLabels: this.getRecalledPointIds().map(id => this.extractPointLabel(id)),
```

**Step 3: Add `recalledPointLabels` to frontend `SessionCompleteSummary`**

In `web/src/hooks/use-session-websocket.ts`, add to `SessionCompleteSummary`:
```typescript
/** Short topic labels for each recalled point */
recalledPointLabels: string[];
```

**Step 4: Update `SessionCompleteOverlay` to show topic list**

In `SessionCompleteOverlay.tsx`, add `recalledPointLabels` to props and render a scrollable list:

Add to the `SessionCompleteOverlayProps` interface:
```typescript
/** Labels of recalled points to display in the completion list */
recalledPointLabels?: string[];
```

Add after the stats row (before action buttons):
```typescript
{/* Recalled topics list */}
{recalledPointLabels && recalledPointLabels.length > 0 && (
  <div className="max-h-32 overflow-y-auto mb-6 text-left">
    <p className="text-clarity-400 text-xs font-medium mb-2 uppercase tracking-wider">Points Recalled</p>
    <div className="flex flex-wrap gap-1.5">
      {recalledPointLabels.map((label, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-green-500/10 text-green-300 border border-green-500/20 rounded-full"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          {label}
        </span>
      ))}
    </div>
  </div>
)}
```

Pass `recalledPointLabels` from `SessionContainer` (from `overlayData` — needs the data to be extended, OR from `recalledLabels` state which we already track):

In `SessionContainer.tsx`, pass it to the overlay:
```typescript
<SessionCompleteOverlay
  ...
  recalledPointLabels={recalledLabels}
/>
```

**Step 5: Update `SessionCompleteScreen` to show topic list**

In `SessionContainer.tsx`, add the same topic list to the `SessionCompleteScreen` component, below the engagement score section:

```typescript
{/* Points recalled list */}
{summary.recalledPointLabels && summary.recalledPointLabels.length > 0 && (
  <div className="bg-slate-800/40 rounded-xl p-4 w-full max-w-md mb-8 text-left">
    <p className="text-clarity-400 text-sm mb-3">Points Recalled</p>
    <div className="max-h-40 overflow-y-auto flex flex-wrap gap-1.5">
      {summary.recalledPointLabels.map((label, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-green-500/10 text-green-300 border border-green-500/20 rounded-full"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          {label}
        </span>
      ))}
    </div>
  </div>
)}
```

**Step 6: Verify TypeScript compiles**

Run: `cd /Users/johnmemon/Desktop/contextual-clarity && bunx tsc --noEmit 2>&1 | head -20`

**Step 7: Commit**

```bash
git add src/core/session/types.ts src/core/session/session-engine.ts web/src/hooks/use-session-websocket.ts web/src/components/live-session/SessionCompleteOverlay.tsx web/src/components/live-session/SessionContainer.tsx
git commit -m "feat: show recalled topic keywords in session completion overlay and summary"
```

---

### Task 7: Final Integration Verification

**Step 1: Full TypeScript check**

Run: `cd /Users/johnmemon/Desktop/contextual-clarity && bunx tsc --noEmit 2>&1 | head -30`
Expected: No errors

**Step 2: Run existing tests**

Run: `cd /Users/johnmemon/Desktop/contextual-clarity && bun test 2>&1 | grep -E "\(pass\)|\(fail\)|^\s+\d+ (pass|fail)|^Ran "`
Expected: All existing tests pass

**Step 3: Manual smoke test checklist**

Verify the following work end-to-end:
- [ ] Start a recall session — circles appear, no audio plays
- [ ] Recall a point — circle fills with enhanced green glow, phone vibrates on mobile
- [ ] Tap filled circle — popover shows topic keyword, tap outside dismisses
- [ ] Conversation drifts — rabbit hole detection fires, prompt appears in emerald
- [ ] Accept rabbit hole — screen shifts to emerald tint, indicator banner appears
- [ ] Exit rabbit hole — tint fades, progress bar returns, buffered circles animate
- [ ] All points recalled — overlay shows with topic list below stats
- [ ] Click Done — summary screen shows stats + recalled topics list
