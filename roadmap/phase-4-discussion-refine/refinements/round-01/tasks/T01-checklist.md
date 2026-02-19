# T01 — Per-Session Recall Point Checklist

| Field | Value |
|-------|-------|
| **name** | Per-Session Recall Point Checklist |
| **parallel-group** | A (no dependencies) |
| **depends-on** | none |

---

## Description

Replace the linear `currentPointIndex: number` tracking mechanism in `SessionEngine` with a `Map<string, 'pending' | 'recalled'>` checklist. This is the foundational data structure change that all subsequent evaluation, auto-end, and progress features depend on. The tutor probes points in the original order by default but accepts out-of-order recall — if a user mentions point 3 before point 1, the system checks it off and moves on.

This task does NOT change how evaluation is triggered or called (that is T06). It changes the data structure, the session state reporting, and the tutor prompt to be checklist-aware instead of index-aware.

---

## Detailed Implementation

### 1. SessionEngine State Change (`src/core/session/session-engine.ts`)

**Remove these instance properties:**
- `currentPointIndex: number` (line ~178)
- `currentPointMessageCount: number` (if it exists — the per-point message counter)

**Add these instance properties:**
```typescript
// Tracks whether each recall point has been recalled during this session.
// Keyed by recall point ID. Values: 'pending' = not yet recalled, 'recalled' = demonstrated by user.
private pointChecklist: Map<string, 'pending' | 'recalled'> = new Map();

// Index into targetPoints[] for the next point the tutor should probe.
// This is a suggestion, not a constraint — the evaluator (T06) can mark any point as recalled at any time.
private currentProbeIndex: number = 0;
```

Keep `targetPoints: RecallPoint[]` as-is for ordered access.

### 2. Initialization (`startSession` / `resumeSession`)

In `startSession()` (after `targetPoints` is populated):
```typescript
this.pointChecklist = new Map(
  this.targetPoints.map(p => [p.id, 'pending'])
);
this.currentProbeIndex = 0;
```

In `resumeSession()` (if the session has previously recalled points — requires `recalledPointIds` from T08, but for now initialize all as 'pending' and add a TODO comment for T08 to populate from persisted state):
```typescript
// TODO (T08): When resuming a paused session, populate recalled state from session.recalledPointIds
this.pointChecklist = new Map(
  this.targetPoints.map(p => [p.id, 'pending'])
);
this.currentProbeIndex = 0;
```

### 3. Helper Methods (add to `SessionEngine`)

```typescript
/**
 * Returns all recall points that have NOT been recalled yet, in their original order.
 * Used by the evaluator (T06) to know which points to evaluate against.
 */
getUncheckedPoints(): RecallPoint[] {
  return this.targetPoints.filter(p => this.pointChecklist.get(p.id) === 'pending');
}

/**
 * Returns the next point the tutor should probe, starting from currentProbeIndex.
 * Skips already-recalled points. Wraps around if needed.
 * Returns null if all points are recalled.
 */
getNextProbePoint(): RecallPoint | null {
  if (this.allPointsRecalled()) return null;

  const total = this.targetPoints.length;
  for (let offset = 0; offset < total; offset++) {
    const idx = (this.currentProbeIndex + offset) % total;
    const point = this.targetPoints[idx];
    if (this.pointChecklist.get(point.id) === 'pending') {
      return point;
    }
  }
  return null; // Should not reach here if allPointsRecalled() is false
}

/**
 * Marks a recall point as recalled. Idempotent — if the point is already recalled, this is a no-op.
 * Also advances currentProbeIndex past this point if it was the current probe target.
 * Triggers FSRS state update via recordRecallOutcome().
 */
markPointRecalled(pointId: string): void {
  if (this.pointChecklist.get(pointId) !== 'pending') return; // already recalled or unknown ID

  this.pointChecklist.set(pointId, 'recalled');

  // If this was the current probe point, advance to the next unchecked point
  const currentProbePoint = this.targetPoints[this.currentProbeIndex];
  if (currentProbePoint && currentProbePoint.id === pointId) {
    this.advanceProbeIndex();
  }
}

/**
 * Returns true if every point in the checklist has been recalled.
 */
allPointsRecalled(): boolean {
  for (const status of this.pointChecklist.values()) {
    if (status === 'pending') return false;
  }
  return true;
}

/**
 * Returns the count of points that have been recalled so far.
 */
getRecalledCount(): number {
  let count = 0;
  for (const status of this.pointChecklist.values()) {
    if (status === 'recalled') count++;
  }
  return count;
}

/**
 * Advances currentProbeIndex to the next unchecked point.
 * Called internally after marking a point as recalled.
 */
private advanceProbeIndex(): void {
  const total = this.targetPoints.length;
  for (let offset = 1; offset <= total; offset++) {
    const idx = (this.currentProbeIndex + offset) % total;
    if (this.pointChecklist.get(this.targetPoints[idx].id) === 'pending') {
      this.currentProbeIndex = idx;
      return;
    }
  }
  // All recalled — probe index doesn't matter anymore, but set to length as sentinel
  this.currentProbeIndex = total;
}
```

### 4. FSRS Integration — New `recordRecallOutcome()` Method

Extract the existing FSRS update logic from `advanceToNextPoint()` (line ~763) into a new standalone method. This method can be called for any point at any time, not just when advancing linearly.

```typescript
/**
 * Records a recall outcome for a specific point: maps evaluation result to FSRS rating,
 * runs the FSRS scheduler, and persists the updated state to the database.
 * Extracted from the old advanceToNextPoint() so it can be called for any point at any time.
 */
private async recordRecallOutcome(
  pointId: string,
  evaluation: { success: boolean; confidence: number }
): Promise<void> {
  const rating = this.evaluationToRating(evaluation);
  const point = this.targetPoints.find(p => p.id === pointId);
  if (!point) return;

  // NOTE: scheduler.schedule() takes FSRSState, not the full RecallPoint object
  const schedulingResult = this.scheduler.schedule(point.fsrsState, rating);
  await this.recallPointRepo.updateFSRSState(pointId, schedulingResult);
}
```

The old `advanceToNextPoint()` method should be refactored or removed. Its responsibilities split:
- FSRS update logic → `recordRecallOutcome()` (above)
- Index advancement → `advanceProbeIndex()` (above)
- Session completion check → `allPointsRecalled()` (above)

If `advanceToNextPoint()` is still called by other code paths during this task, it should delegate to the new methods internally. But ideally, mark it as deprecated with a TODO for T06 to remove it entirely.

### 5. `processUserMessage()` Change

The core flow in `processUserMessage()` (line ~529) currently checks triggers and evaluates a single point. For T01, make the minimal data-structure change:

- Replace any reference to `this.currentPointIndex` with `this.currentProbeIndex` or the appropriate checklist method
- Replace `this.targetPoints[this.currentPointIndex]` with `this.getNextProbePoint()`
- Replace the completion check (`this.currentPointIndex >= this.targetPoints.length`) with `this.allPointsRecalled()`

Do NOT change the evaluation trigger mechanism yet — T06 handles that. The goal is to make the existing flow work with the new data structure.

### 6. `getSessionState()` Change (line ~635)

Replace the current return value to expose checklist state:

```typescript
getSessionState(): SessionState {
  return {
    session: this.currentSession,
    recallSet: this.currentRecallSet,
    // New checklist fields — replace currentPointIndex
    pointChecklist: Object.fromEntries(this.pointChecklist),
    currentProbeIndex: this.currentProbeIndex,
    currentProbePoint: this.getNextProbePoint(),
    totalPoints: this.targetPoints.length,
    recalledCount: this.getRecalledCount(),
    uncheckedPoints: this.getUncheckedPoints(),
    // Keep existing fields
    messageCount: this.messages.length,
    isComplete: this.allPointsRecalled(),
  };
}
```

**CREATE** a `SessionState` type in `types.ts` to match (this type does not currently exist as a named export — it is currently an anonymous inline return type on `getSessionState()` and must be created as a new named interface).

### 7. `updateLLMPrompt()` Change (line ~1028)

Currently calls `buildSocraticTutorPrompt({recallSet, targetPoints, currentPointIndex})`. Change to:

```typescript
private updateLLMPrompt(): void {
  const systemPrompt = buildSocraticTutorPrompt({
    recallSet: this.currentRecallSet!,
    targetPoints: this.targetPoints,
    uncheckedPoints: this.getUncheckedPoints(),
    currentProbePoint: this.getNextProbePoint(),
  });
  // ... rest of method
}
```

### 8. Socratic Tutor Prompt Changes (`src/llm/prompts/socratic-tutor.ts`)

**Update `SocraticTutorPromptParams`:**
- Remove `currentPointIndex: number`
- Add `uncheckedPoints: RecallPoint[]`
- Add `currentProbePoint: RecallPoint | null`

**Rewrite `buildCurrentPointSection()`:**

Old behavior: Shows one "Current Recall Point" based on `currentPointIndex`.

New behavior: Shows "Current Focus Point" (the probe point) plus "Other Unchecked Points":

```
## Current Focus Point
Probe this point next. Ask the user to recall this concept:
- [currentProbePoint.content]

## Other Unchecked Points
These points have not been recalled yet. If the user demonstrates knowledge of any of these out of order, accept it. Probe them in the order listed if the user doesn't bring them up naturally:
1. [uncheckedPoint1.content]
2. [uncheckedPoint2.content]
...

## Instruction
Probe points in the order listed, but if the user demonstrates recall of ANY unchecked point (even out of order), accept it and move to the next unchecked point. Do not fight the user's natural flow.
```

If `currentProbePoint` is null (all recalled), this section should say: "All points have been recalled."

**Rewrite `buildUpcomingPointsSection()`:**

This section previously showed points after `currentPointIndex`. Now it should be removed or merged into the above section, since unchecked points already cover what was "upcoming." If there's a separate section for already-recalled points (useful context for the tutor), add:

```
## Already Recalled Points
The user has already demonstrated recall of these. Do not re-probe them, but you can reference them if relevant:
- [recalledPoint1.content]
- [recalledPoint2.content]
```

### 9. Types Changes (`src/core/session/types.ts`)

**Update `SessionState` interface** to match `getSessionState()` return value above.

**Update `ProcessMessageResult`:**
- Remove `currentPointIndex`
- Add `recalledCount: number`
- Add `totalPoints: number`
- Add `pointsRecalledThisTurn: string[]` (list of point IDs recalled in this message — will be populated by T06)

**Add new event types to `SessionEventType`:**
- `point_recalled` — emitted when a specific point is marked as recalled. Payload: `{ pointId: string, recalledCount: number, totalPoints: number }`

**Remove `EVALUATION_TRIGGER_PHRASES`** (line ~283). This array of strings like "i think i understand", "got it", etc. is no longer needed — evaluation will be continuous (T06). Remove the constant and any references to it.

**Remove or deprecate `autoEvaluateAfter` and `maxMessagesPerPoint`** from `SessionEngineConfig`. These message-count-based thresholds are obsolete with continuous evaluation. Add TODO comments noting T06 will complete the removal.

### 10. WebSocket Type Changes (`src/api/ws/types.ts`)

**Update `ServerMessage` union type:**
- Add `point_recalled` message type with payload `{ pointId: string, recalledCount: number, totalPoints: number }`
- Keep existing types for now; T06 and T08 will make further changes

### 11. Session Handler Changes (`src/api/ws/session-handler.ts`)

**Update `handleUserMessage()`** (line ~376):
- After `engine.processUserMessage()`, read the new `ProcessMessageResult` shape
- If any points were recalled this turn, send `point_recalled` server messages for each
- Update the `point_transition` message to use checklist data instead of index

### 12. Frontend WebSocket Hook Changes (`web/src/hooks/use-session-websocket.ts`)

- Handle `point_recalled` message type: update local state with `recalledCount` and `totalPoints`
- Replace `currentPointIndex` tracking with `recalledCount` and `totalPoints`
- Keep `triggerEvaluation` for now (T06 will remove it)

### 13. Event Emissions

When `markPointRecalled()` is called, emit a `point_recalled` event:

```typescript
markPointRecalled(pointId: string): void {
  if (this.pointChecklist.get(pointId) !== 'pending') return;

  this.pointChecklist.set(pointId, 'recalled');

  this.emitEvent('point_recalled', {
    pointId,
    recalledCount: this.getRecalledCount(),
    totalPoints: this.targetPoints.length,
  });

  // Advance probe index if this was the current probe target
  const currentProbePoint = this.targetPoints[this.currentProbeIndex];
  if (currentProbePoint && currentProbePoint.id === pointId) {
    this.advanceProbeIndex();
  }
}
```

Do NOT emit the old `point_started` / `point_completed` events in the linear sense. Those event types can remain defined but should not be emitted by the new checklist logic. T05 (events) will clean up the full event surface later.

---

## Relevant Files

| Action | File | What Changes |
|--------|------|-------------|
| MODIFY | `src/core/session/session-engine.ts` | Replace `currentPointIndex` with `pointChecklist` Map, add helper methods, extract `recordRecallOutcome()`, update `processUserMessage()`, `getSessionState()`, `updateLLMPrompt()` |
| MODIFY | `src/core/session/types.ts` | Update `SessionState`, `ProcessMessageResult`, add `point_recalled` event type, remove `EVALUATION_TRIGGER_PHRASES`, deprecate `autoEvaluateAfter`/`maxMessagesPerPoint` |
| MODIFY | `src/llm/prompts/socratic-tutor.ts` | Update `SocraticTutorPromptParams`, rewrite `buildCurrentPointSection()` and `buildUpcomingPointsSection()` for checklist-aware prompts |
| MODIFY | `src/api/ws/types.ts` | Add `point_recalled` to `ServerMessage` union type |
| MODIFY | `src/api/ws/session-handler.ts` | Update session state reporting to use checklist data instead of index |
| MODIFY | `web/src/hooks/use-session-websocket.ts` | Handle `point_recalled` messages, replace `currentPointIndex` tracking with `recalledCount`/`totalPoints` |
| MODIFY | `src/cli/commands/session.ts` | Update 4 references to `currentPointIndex` (lines ~116, 215, 312, 336) to use new checklist-based state (`recalledCount`/`totalPoints`). **This file is critical — it will fail to compile if `currentPointIndex` is removed without updating these references.** |

---

## Success Criteria

1. **Data structure**: `SessionEngine` uses `Map<string, 'pending' | 'recalled'>` (keyed by recall point ID) instead of `currentPointIndex: number`. No property named `currentPointIndex` remains on the class.
2. **`getUncheckedPoints()`**: Returns only points where checklist value is `'pending'`, in the original `targetPoints` order. If points 1, 3, 5 are pending and 2, 4 are recalled, returns `[point1, point3, point5]`.
3. **`getNextProbePoint()`**: Returns the first unchecked point at or after `currentProbeIndex`. If `currentProbeIndex` is 2 and point 2 is already recalled, skips to point 3 (or wraps). Returns `null` when all points are recalled.
4. **`allPointsRecalled()`**: Returns `true` only when every entry in the Map has value `'recalled'`. Returns `false` if even one is `'pending'`.
5. **`markPointRecalled(pointId)`**: Sets the entry to `'recalled'`, emits `point_recalled` event, and triggers FSRS update via `recordRecallOutcome()`. If the point is already `'recalled'`, does nothing (idempotent). If the point ID is not in the Map, does nothing.
6. **`getRecalledCount()`**: Returns the integer count of `'recalled'` entries.
7. **`getSessionState()`**: Exposes `pointChecklist` (as a plain object), `currentProbeIndex`, `recalledCount`, `totalPoints`, `currentProbePoint`, `uncheckedPoints`, and `isComplete`. Does NOT expose a `currentPointIndex` field.
8. **Socratic tutor prompt**: Shows "Current Focus Point" + "Other Unchecked Points" + "Already Recalled Points" sections instead of a single "Current Point" and index-based "Upcoming Points". Includes instruction to accept out-of-order recall.
9. **`EVALUATION_TRIGGER_PHRASES`**: Completely removed from `types.ts`. No references to it remain in the codebase.
10. **`autoEvaluateAfter` and `maxMessagesPerPoint`**: Removed or marked deprecated with TODO comments pointing to T06.
11. **Existing tests**: All tests that reference `currentPointIndex` are updated to use the new checklist-based state. Tests for `getUncheckedPoints()`, `getNextProbePoint()`, `markPointRecalled()`, `allPointsRecalled()`, and `getRecalledCount()` are added.
12. **Resume compatibility**: `resumeSession()` initializes the checklist (all pending for now — T08 adds persistence). A TODO comment marks where T08 will populate recalled state from the database.
13. **Event emission**: `point_recalled` events are emitted with `{ pointId, recalledCount, totalPoints }` payload.
14. **FSRS integration**: `recordRecallOutcome()` is a standalone method that can be called for any point at any time, not coupled to linear index advancement.
15. **Frontend**: WebSocket hook tracks `recalledCount` and `totalPoints` instead of `currentPointIndex`. The `point_recalled` message type is handled.
16. **No behavioral regression**: The session still functions end-to-end — user can start a session, chat, have points evaluated (via existing mechanism until T06 replaces it), and complete the session.

---

## Implementation Warnings

> **WARNING: `point_transition` payload mismatch (pre-existing bug)**
> The server currently sends `{ currentPointIndex, pointsRemaining }` in `point_transition` messages, but the frontend expects `{ nextPointIndex, totalPoints }`. This is a pre-existing mismatch that this task should reconcile when replacing `currentPointIndex` with checklist-based data. Ensure the new `point_recalled` event payload matches what the frontend will consume.

> **WARNING: `ProcessMessageResult` shape change cascades**
> Removing `currentPointIndex` from `ProcessMessageResult` and adding `recalledCount`/`totalPoints`/`pointsRecalledThisTurn` will break `session-handler.ts` (lines ~403-411) which reads `result.pointAdvanced` and `result.currentPointIndex`. The handler code MUST be updated in this task to read the new fields. Downstream tasks T06, T08, and T09 also consume this type — coordinate field names.

> **WARNING: `src/cli/commands/session.ts` must be updated**
> This file reads `currentPointIndex` at 4 locations (lines ~116, 215, 312, 336). If `currentPointIndex` is removed from the engine without updating this file, the backend will fail to compile. Add this file to the MODIFY scope.
