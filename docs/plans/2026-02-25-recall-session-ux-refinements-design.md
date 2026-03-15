# Recall Session UX Refinements Design

**Date:** 2026-02-25
**Branch:** `discussion-refine`

## Problem Statement

Several recall session UX issues need addressing:

1. **Rabbit holes don't work** — detection pipeline is fully implemented but `rabbitholeDetector` dependency is never injected into `SessionEngine`, so `detectAndRecordRabbithole()` always returns early
2. **No sound on recall** — Web Audio API chime silently fails on mobile (iOS AudioContext restrictions)
3. **No visibility into recalled points** — circles are anonymous; users don't know what they just recalled
4. **Session completion feels abrupt** — overlay and completion screen show stats but not the actual topics recalled
5. **Rabbit hole UX needs differentiation** — once working, rabbit holes should feel like a distinct exploration mode

## Design

### 1. Wire Up Rabbit Hole Detection (Root Cause Fix)

**Root cause:** `session-handler.ts:266-274` constructs `SessionEngine` without Phase 2 dependencies (`rabbitholeDetector`, `rabbitholeRepo`, `metricsCollector`, `metricsRepo`, `recallOutcomeRepo`).

**Fix:**
- Add Phase 2 deps to `WebSocketHandlerDependencies` interface
- Construct `RabbitholeDetector` (and other Phase 2 services) in server bootstrap
- Pass them through when creating `SessionEngine` in `handleOpen()`

**Files:** `session-handler.ts`, server bootstrap file

### 2. Rabbit Hole Visual Theme: Emerald

Replace amber palette with emerald across all rabbit hole components:

| Component | Current | New |
|-----------|---------|-----|
| `RabbitholePrompt.tsx` | `amber-500/10`, `amber-500/30`, `amber-200`, `amber-100`, `amber-400`, `amber-500` | `emerald-500/10`, `emerald-500/30`, `emerald-200`, `emerald-100`, `emerald-400`, `emerald-500` |
| `RabbitholeIndicator.tsx` | `amber-500/15`, `amber-500/25`, `amber-400`, `amber-200`, `amber-100` | `emerald-500/15`, `emerald-500/25`, `emerald-400`, `emerald-200`, `emerald-100` |
| `SessionProgress.tsx` (label pills) | `amber-500/15`, `amber-300`, `amber-500/20` | `emerald-500/15`, `emerald-300`, `emerald-500/20` |
| `SessionContainer.tsx` | No theme tint | Add subtle `emerald-500/5` background tint when `isInRabbithole` is true |

Emerald (`emerald-*`) is visually distinct from recalled-point green (`green-400`) — cooler, bluer tone.

### 3. Tappable Point Indicators

**Behavior:** Tapping a filled (recalled) circle shows a popover with the topic keyword. Tapping outside dismisses it.

**Data flow:**
- `point_recalled` WS event gets a new `label: string` field (short topic keyword)
- `SessionEngine.markPointRecalled()` includes the label in the emitted event
- Frontend stores `recalledLabels: string[]` (ordered by recall sequence)
- `PointIcons` sub-component gets click handler on filled circles
- Popover positioned relative to the tapped circle, clamped to viewport

**Popover design:**
- Small dark card (`bg-slate-700 rounded-lg px-3 py-2`)
- Shows topic keyword in `text-sm text-white`
- Positioned above the circle on desktop, below on mobile if needed
- Dismissed on outside click or second tap

### 4. Haptic + Enhanced Visual Feedback (Replace Audio Chime)

**Remove:** `playRecallChime()` function and Web Audio API code from `SessionProgress.tsx`. Remove mute toggle (no audio to mute).

**Add:**
- `navigator.vibrate?.(50)` call when each circle animates (short haptic pulse)
- Enhanced glow: recalled circle gets `shadow-[0_0_8px_rgba(74,222,128,0.6)]` during animation (brighter than current `/30`)
- Ring burst: CSS keyframe animation — a ring expands outward from the circle and fades

**Mute toggle repurposed:** Controls haptic vibration instead of audio. Label changes to "vibration on/off". localStorage key stays `recall-sound-muted` for backwards compat (or rename to `recall-haptic-muted`).

### 5. Session Completion with Topic List

**Data change:** `SessionCompleteSummary` gets `recalledPointLabels: string[]` — sent from the engine alongside `recalledPointIds`.

**SessionCompleteOverlay enhancement:**
- After the stats row, add a scrollable list of recalled topic keywords
- Each item: `✓ {label}` in a small pill with green checkmark
- `max-h-40 overflow-y-auto` to prevent overflow on mobile

**SessionCompleteScreen enhancement:**
- Below engagement score, add "Points Recalled" section
- Same scrollable topic list with checkmarks
- Handles both full-completion and partial-completion (paused) cases

### 6. Mobile Polish

- Popover positioning uses `getBoundingClientRect()` and clamps to viewport
- Topic list in completion screens has `-webkit-overflow-scrolling: touch`
- Haptic only fires when `navigator.vibrate` exists (no-op on desktop)
- Rabbit hole emerald tint is full-width (no clipping on small screens)
- All touch targets are minimum 44px for accessibility

## Non-Goals

- No changes to the Socratic tutor prompt or evaluation logic
- No changes to FSRS scheduling
- No changes to voice input or transcription
- No new API endpoints (all data flows through existing WebSocket events)
