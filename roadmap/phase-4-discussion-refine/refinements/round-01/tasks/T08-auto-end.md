# T08 — Auto-End + Leave Session

| Field | Value |
|-------|-------|
| **name** | Auto-End + Leave Session |
| **parallel-group** | C (wave 3) |
| **depends-on** | T06 (Continuous Evaluator with Feedback Field) |

---

## Description

When all recall points are recalled (checklist fully checked from T01/T06), show a completion overlay instead of a hard stop. Replace the "End Session" button with "Leave Session" which pauses the session (preserving state for later resumption) instead of abandoning it. Handle the edge case where the last point is recalled while the user is in a rabbit hole — defer the overlay until the rabbit hole exits.

This task introduces the `'paused'` session status, persists checklist state for resume, and adds the completion overlay UI component.

---

## Detailed Implementation

### 1. Schema Change — Add `'paused'` Status and `recalledPointIds` Column (`src/storage/schema.ts`)

**Modify the `sessions` table definition:**

The current `status` column accepts `'in_progress' | 'completed' | 'abandoned'`. Add `'paused'` to this enum.

```typescript
// In the sessions table definition, update the status column:
status: text('status', { enum: ['in_progress', 'completed', 'abandoned', 'paused'] })
  .notNull()
  .default('in_progress'),
```

**Add `recalledPointIds` column:**

This stores which points have been recalled so far, enabling session resume with checklist state intact.

```typescript
// Add to sessions table:
// JSON array of recall point IDs that have been recalled during this session.
// Used to reconstruct the pointChecklist Map when resuming a paused session.
recalledPointIds: text('recalled_point_ids', { mode: 'json' })
  .notNull()
  .default('[]'),
```

**Generate and apply a Drizzle migration:**

After modifying `schema.ts`, generate a migration:
```bash
npx drizzle-kit generate
```

This creates a migration file in the migrations directory. The migration should:
- Add the `'paused'` value to the status enum (if using a proper enum type) or just work naturally (if using text with application-level validation)
- Add the `recalled_point_ids` column with a default of `'[]'`
- Be safe to run on existing databases with existing sessions

If Drizzle does not support altering enums directly (common with SQLite), and the status is stored as plain text, the schema change alone is sufficient — no ALTER TABLE needed for the enum, just the new column.

### 2. Session Repository Changes (`src/storage/repositories/session.repository.ts`)

**Add `pause()` method:**

```typescript
/**
 * Pauses a session — sets status to 'paused' without clearing state.
 * The session can be resumed later with its checklist state intact.
 */
async pause(sessionId: string): Promise<void> {
  await this.db
    .update(sessions)
    .set({
      status: 'paused',
      // Do NOT set endedAt — the session is not over, just paused
    })
    .where(eq(sessions.id, sessionId));
}
```

**Add `updateRecalledPointIds()` method:**

```typescript
/**
 * Updates the list of recalled point IDs for a session.
 * Called each time a point is recalled, so the persisted state stays current.
 */
async updateRecalledPointIds(sessionId: string, recalledPointIds: string[]): Promise<void> {
  await this.db
    .update(sessions)
    .set({
      recalledPointIds: JSON.stringify(recalledPointIds),
    })
    .where(eq(sessions.id, sessionId));
}
```

**Update `findInProgress()` or equivalent method:**

The method that finds an active session for a recall set should also find `'paused'` sessions. Update the query:

```typescript
// Before: where status = 'in_progress'
// After: where status IN ('in_progress', 'paused')
async findActiveSession(recallSetId: string): Promise<Session | null> {
  const result = await this.db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.recallSetId, recallSetId),
        inArray(sessions.status, ['in_progress', 'paused'])
      )
    )
    .limit(1);
  return result[0] ?? null;
}
```

### 3. SessionEngine — Auto-End Logic (`src/core/session/session-engine.ts`)

**Add `completionPending` flag:**

```typescript
// Flag set when all points are recalled but the user is in a rabbit hole.
// The completion overlay is deferred until the rabbit hole exits.
private completionPending: boolean = false;
```

**Modify `processUserMessage()` (after the T06 changes):**

After the batch evaluation processes recalled points, add the auto-end check:

```typescript
// After processing recalled points in processUserMessage():
const isComplete = this.allPointsRecalled();

if (isComplete) {
  if (this.isInRabbitHole()) {
    // User is mid-rabbit-hole — defer the overlay
    this.completionPending = true;
    // Do NOT emit session_complete_overlay yet
  } else {
    // All points recalled and not in rabbit hole — show overlay
    this.emitEvent('session_complete_overlay', {
      message: "You've covered everything!",
      canContinue: true,
      recalledCount: this.getRecalledCount(),
      totalPoints: this.targetPoints.length,
    });
  }
}
```

**Add rabbit hole exit hook:**

When the user exits a rabbit hole (this hooks into whatever rabbit hole exit mechanism exists — likely in a rabbit hole handler or detector), check `completionPending`:

```typescript
/**
 * Called when the user exits a rabbit hole.
 * If all points were recalled during the rabbit hole, show the completion overlay now.
 */
onRabbitHoleExit(): void {
  if (this.completionPending) {
    this.completionPending = false;
    this.emitEvent('session_complete_overlay', {
      message: "You've covered everything!",
      canContinue: true,
      recalledCount: this.getRecalledCount(),
      totalPoints: this.targetPoints.length,
    });
  }
}
```

If no rabbit hole exit mechanism exists yet (T08-rabbitholes task hasn't been implemented), add the `onRabbitHoleExit()` method with a TODO comment noting that the rabbit hole task should call this method. Also add `isInRabbitHole()` as a stub that returns `false` until the rabbit hole task implements it:

```typescript
/**
 * Returns whether the session is currently in a rabbit hole.
 * TODO: Implement properly in the rabbitholes task. For now returns false.
 */
private isInRabbitHole(): boolean {
  return false;
}
```

### 4. SessionEngine — `pauseSession()` Method (`src/core/session/session-engine.ts`)

```typescript
/**
 * Pauses the current session — saves state and marks as 'paused'.
 * The session can be resumed later with its checklist state intact.
 * Unlike abandonSession(), this is not a termination — it's a pause.
 */
async pauseSession(): Promise<void> {
  this.validateActiveSession();

  const sessionId = this.currentSession!.id;

  // Persist current recalled point IDs before pausing
  const recalledPointIds = this.targetPoints
    .filter(p => this.pointChecklist.get(p.id) === 'recalled')
    .map(p => p.id);
  await this.sessionRepo.updateRecalledPointIds(sessionId, recalledPointIds);

  // Set status to paused
  await this.sessionRepo.pause(sessionId);

  // Emit pause event
  this.emitEvent('session_paused', {
    sessionId,
    recalledCount: this.getRecalledCount(),
    totalPoints: this.targetPoints.length,
  });

  // Reset engine state (the session state is persisted in DB)
  this.resetState();
}
```

### 5. SessionEngine — Persist Checklist State on Each Recall (`src/core/session/session-engine.ts`)

Each time a point is recalled, persist the current recalled IDs to the database so the state is always recoverable. Modify `markPointRecalled()` (from T01) to also persist:

```typescript
markPointRecalled(pointId: string): void {
  if (this.pointChecklist.get(pointId) !== 'pending') return;

  this.pointChecklist.set(pointId, 'recalled');

  this.emitEvent('point_recalled', {
    pointId,
    recalledCount: this.getRecalledCount(),
    totalPoints: this.targetPoints.length,
  });

  // Persist recalled state to DB for resume capability
  const recalledPointIds = this.targetPoints
    .filter(p => this.pointChecklist.get(p.id) === 'recalled')
    .map(p => p.id);
  // Fire and forget — don't await to avoid slowing down the message flow.
  // If this fails, the worst case is that a resume loses the last recalled point.
  this.sessionRepo.updateRecalledPointIds(this.currentSession!.id, recalledPointIds)
    .catch(err => console.error('Failed to persist recalled point IDs:', err));

  const currentProbePoint = this.targetPoints[this.currentProbeIndex];
  if (currentProbePoint && currentProbePoint.id === pointId) {
    this.advanceProbeIndex();
  }
}
```

### 6. SessionEngine — Resume Paused Session (`src/core/session/session-engine.ts`)

Update `resumeSession()` (or `startSession()` — wherever existing sessions are detected and resumed) to reconstruct the checklist from persisted `recalledPointIds`:

```typescript
// In the resume path (inside startSession or resumeSession):
async resumeSession(session: Session): Promise<void> {
  // ... existing resume logic (load recall set, target points, messages, etc.)

  // Reconstruct the checklist from persisted state
  const recalledIds: string[] = JSON.parse(session.recalledPointIds as string || '[]');
  const recalledIdSet = new Set(recalledIds);

  this.pointChecklist = new Map(
    this.targetPoints.map(p => [
      p.id,
      recalledIdSet.has(p.id) ? 'recalled' : 'pending'
    ])
  );

  // Set probe index to the first unchecked point
  this.currentProbeIndex = 0;
  this.advanceProbeIndex(); // Skip already-recalled points at the start

  // If status was 'paused', update to 'in_progress' now that we're resuming
  if (session.status === 'paused') {
    await this.sessionRepo.updateStatus(session.id, 'in_progress');
  }

  // Reset completion pending flag
  this.completionPending = false;
}
```

If `sessionRepo.updateStatus()` doesn't exist, add it:

```typescript
// In session.repository.ts:
async updateStatus(sessionId: string, status: string): Promise<void> {
  await this.db
    .update(sessions)
    .set({ status })
    .where(eq(sessions.id, sessionId));
}
```

### 7. New Event Types (`src/core/session/types.ts`)

Add these to `SessionEventType`:

```typescript
// Emitted when all recall points have been recalled and the user is not in a rabbit hole.
// Tells the frontend to show the completion overlay.
'session_complete_overlay'

// Emitted when a session is paused (via Leave Session).
'session_paused'
```

Define payload types:

```typescript
interface SessionCompleteOverlayPayload {
  message: string;        // e.g., "You've covered everything!"
  canContinue: boolean;   // true — user can dismiss overlay and keep chatting
  recalledCount: number;
  totalPoints: number;
}

interface SessionPausedPayload {
  sessionId: string;
  recalledCount: number;
  totalPoints: number;
}
```

### 8. WebSocket Type Changes (`src/api/ws/types.ts`)

**Client messages — replace `end_session` with `leave_session`:**

```typescript
// Remove from ClientMessage union:
// { type: 'end_session' }

// Add to ClientMessage union:
{ type: 'leave_session' }
```

Note: `trigger_eval` was already removed in T06. After this change, ClientMessage should be:
`user_message | leave_session | ping`

**Server messages — add new types:**

```typescript
// Add to ServerMessage union:
{ type: 'session_complete_overlay'; data: { message: string; canContinue: boolean; recalledCount: number; totalPoints: number } }
{ type: 'session_paused'; data: { sessionId: string; recalledCount: number; totalPoints: number } }
```

Keep `session_complete` — it's sent when the user presses "Done" on the overlay and the session is truly finished. But consider: if "Leave Session" pauses and "Done" after overlay also pauses (or completes?), clarify the semantics:

- **"Done" on overlay**: Marks session as `'completed'` (all points recalled, user confirmed). Sends `session_complete`.
- **"Leave Session" button**: Marks session as `'paused'`. Sends `session_paused`.
- **"Continue Discussion" on overlay**: Dismisses the overlay client-side only. No message sent to server. Session stays `'in_progress'`.

### 9. Session Handler Changes (`src/api/ws/session-handler.ts`)

**Remove `handleEndSession()`** and replace with `handleLeaveSession()`:

```typescript
/**
 * Handles the leave_session client message.
 * Pauses the session instead of abandoning it — state is preserved for later resumption.
 */
private async handleLeaveSession(ws: WebSocket): Promise<void> {
  try {
    await this.engine.pauseSession();
    this.sendMessage(ws, {
      type: 'session_paused',
      data: {
        sessionId: this.engine.getSessionId(),
        recalledCount: this.engine.getRecalledCount(),
        totalPoints: this.engine.getTotalPoints(),
      },
    });
  } catch (error) {
    this.sendError(ws, 'Failed to pause session');
  }
}
```

**Update the message handler switch/if-else:**

```typescript
// Replace:
// case 'end_session': await this.handleEndSession(ws); break;
// With:
case 'leave_session': await this.handleLeaveSession(ws); break;
```

**Forward `session_complete_overlay` events to the WebSocket:**

The session engine emits events. The handler should listen for `session_complete_overlay` and forward it:

```typescript
// In the event listener setup (wherever engine events are forwarded to WS):
this.engine.on('session_complete_overlay', (data) => {
  this.sendMessage(ws, {
    type: 'session_complete_overlay',
    data,
  });
});
```

**Handle "Done" from overlay:**

When the user clicks "Done" on the completion overlay, the frontend could send `leave_session` (which pauses) or a new `complete_session` message. Since all points are already recalled, "Done" should mark the session as `'completed'`:

Option A: Reuse `leave_session` but check if all points are recalled — if so, mark as `'completed'` instead of `'paused'`.
Option B: Add a `complete_session` client message type.

**Go with Option A** for simplicity — the `handleLeaveSession()` method checks:

```typescript
private async handleLeaveSession(ws: WebSocket): Promise<void> {
  try {
    if (this.engine.allPointsRecalled()) {
      // All points recalled — this is a completion, not just a pause
      await this.engine.completeSession();
      this.sendMessage(ws, { type: 'session_complete', data: { /* ... */ } });
    } else {
      // Points remain — pause for later
      await this.engine.pauseSession();
      this.sendMessage(ws, { type: 'session_paused', data: { /* ... */ } });
    }
  } catch (error) {
    this.sendError(ws, 'Failed to leave session');
  }
}
```

This means "Leave Session" when all points are recalled = complete. "Leave Session" when points remain = pause. The frontend doesn't need to know the difference — it just navigates away.

### 10. Frontend — Completion Overlay Component (new: `web/src/components/live-session/SessionCompleteOverlay.tsx`)

Create a new component:

```typescript
/**
 * Overlay displayed when all recall points have been recalled.
 * Shows a success message with options to continue chatting or exit.
 * Renders as a centered overlay with a semi-transparent backdrop.
 */
interface SessionCompleteOverlayProps {
  message: string;               // e.g., "You've covered everything!"
  recalledCount: number;
  totalPoints: number;
  onContinue: () => void;        // Dismiss overlay, keep chatting
  onDone: () => void;            // Leave session, navigate to dashboard
}
```

**UI structure:**
- Semi-transparent backdrop covering the chat area (not a full page overlay — the session chrome remains visible)
- Centered card/panel with:
  - Success message (the `message` prop)
  - Stat line: "{recalledCount} / {totalPoints} points recalled"
  - Two buttons:
    - "Continue Discussion" (secondary style) — calls `onContinue`, which dismisses the overlay via local state. No WebSocket message.
    - "Done" (primary style) — calls `onDone`, which sends `leave_session` and navigates to dashboard
- Animated entrance: fade in over 300ms, card scales from 0.95 to 1.0

**Styling:** Use the existing design system/component library in the project. Check `web/src/components/` for the styling approach (Tailwind, CSS modules, styled-components, etc.) and match it.

### 11. Frontend — SessionControls Changes (`web/src/components/live-session/SessionControls.tsx`)

**Replace "End Session" with "Leave Session":**

- Change the button text from "End Session" to "Leave Session"
- Remove the confirmation dialog (pausing is non-destructive, no confirmation needed)
- Change the click handler from calling `onEndSession` to calling `onLeaveSession`
- Update the prop type: `onEndSession` becomes `onLeaveSession`

**Remove "I've got it!" button** (already removed in T06, verify it's gone).

The controls should now contain only:
- "Leave Session" button (always visible)
- Any other existing controls that aren't related to evaluation or session termination

### 12. Frontend — SessionContainer Integration (`web/src/components/live-session/SessionContainer.tsx`)

**Add overlay state:**

```typescript
const [showCompleteOverlay, setShowCompleteOverlay] = useState(false);
const [overlayData, setOverlayData] = useState<{ message: string; recalledCount: number; totalPoints: number } | null>(null);
```

**Handle `session_complete_overlay` message:**

In the WebSocket message handler (or via the hook), when a `session_complete_overlay` message is received:

```typescript
setOverlayData(message.data);
setShowCompleteOverlay(true);
```

**Handle overlay actions:**

```typescript
const handleContinueDiscussion = () => {
  setShowCompleteOverlay(false);
  // No WebSocket message — just dismiss the overlay client-side
};

const handleDone = () => {
  leaveSession(); // Sends leave_session via WebSocket
  navigate('/dashboard'); // Or wherever the session list lives
};
```

**Render the overlay:**

```tsx
{showCompleteOverlay && overlayData && (
  <SessionCompleteOverlay
    message={overlayData.message}
    recalledCount={overlayData.recalledCount}
    totalPoints={overlayData.totalPoints}
    onContinue={handleContinueDiscussion}
    onDone={handleDone}
  />
)}
```

### 13. Frontend — WebSocket Hook Changes (`web/src/hooks/use-session-websocket.ts`)

**Replace `endSession` with `leaveSession`:**

```typescript
// Remove:
// const endSession = () => { send({ type: 'end_session' }); };

// Add:
const leaveSession = () => { send({ type: 'leave_session' }); };
```

**Add `session_complete_overlay` handler:**

```typescript
// In the message handler:
case 'session_complete_overlay':
  // Surface this to the component layer via a callback or state
  options.onCompleteOverlay?.(message.data);
  break;

case 'session_paused':
  // Session was paused — clean up local state
  options.onSessionPaused?.(message.data);
  break;
```

**Update the returned object:**

```typescript
return {
  connectionState,
  messages,
  streamingContent,
  recalledCount,       // replaces currentPointIndex
  totalPoints,
  isWaitingForResponse,
  sendUserMessage,
  leaveSession,        // replaces endSession
  // triggerEvaluation removed in T06
  // endSession removed in this task
};
```

### 14. Dashboard / Session List — Display Paused Sessions Differently

If there is a session list or dashboard component that shows past sessions, paused sessions should appear distinctly:

- **Paused sessions**: Show a "Resume" button or "Paused" badge. Different visual treatment from abandoned sessions.
- **Abandoned sessions**: Show as "Abandoned" (existing behavior).
- **Completed sessions**: Show as "Completed" (existing behavior).

Search for components that render session lists (check `web/src/components/` for dashboard, session-list, or similar). Update the rendering to handle the `'paused'` status:

```typescript
// Example:
if (session.status === 'paused') {
  return <Badge variant="warning">Paused</Badge>;
} else if (session.status === 'abandoned') {
  return <Badge variant="error">Abandoned</Badge>;
} else if (session.status === 'completed') {
  return <Badge variant="success">Completed</Badge>;
}
```

---

## Relevant Files

| Action | File | What Changes |
|--------|------|-------------|
| MODIFY | `src/storage/schema.ts` | Add `'paused'` to session status enum, add `recalledPointIds` JSON column to sessions table |
| CREATE | Drizzle migration file (auto-generated path) | Schema migration for the new column and status value |
| MODIFY | `src/storage/repositories/session.repository.ts` | Add `pause()`, `updateRecalledPointIds()`, `updateStatus()` methods. Update `findActiveSession()` to include `'paused'` status. |
| MODIFY | `src/core/session/session-engine.ts` | Add `pauseSession()`, `onRabbitHoleExit()`, `completionPending` flag. Update `markPointRecalled()` to persist state. Update `resumeSession()` to reconstruct checklist from DB. Add auto-end check in `processUserMessage()`. Add `isInRabbitHole()` stub. |
| MODIFY | `src/core/session/types.ts` | Add `session_complete_overlay` and `session_paused` event types with payload types |
| MODIFY | `src/api/ws/types.ts` | Replace `end_session` client message with `leave_session`. Add `session_complete_overlay` and `session_paused` server message types. |
| MODIFY | `src/api/ws/session-handler.ts` | Replace `handleEndSession()` with `handleLeaveSession()`. Forward `session_complete_overlay` events. Update message handler switch. |
| CREATE | `web/src/components/live-session/SessionCompleteOverlay.tsx` | New overlay component with "Continue Discussion" and "Done" buttons |
| MODIFY | `web/src/components/live-session/SessionControls.tsx` | Replace "End Session" button with "Leave Session" button. Remove confirmation dialog. Update prop types. |
| MODIFY | `web/src/components/live-session/SessionContainer.tsx` | Add overlay state management. Handle `session_complete_overlay` messages. Wire up overlay component with continue/done handlers. Replace `endSession` with `leaveSession`. |
| MODIFY | `web/src/hooks/use-session-websocket.ts` | Replace `endSession` with `leaveSession`. Add `session_complete_overlay` and `session_paused` message handlers. Update returned object. |

---

## Success Criteria

1. **Overlay appears on completion**: When all recall points are recalled (and user is not in a rabbit hole), the `session_complete_overlay` event is emitted and the frontend displays the `SessionCompleteOverlay` component.
2. **Overlay message**: Shows "You've covered everything!" (or the `message` field from the event payload) and the recall stats.
3. **"Continue Discussion" button**: Dismisses the overlay client-side. The user can keep chatting. No WebSocket message is sent. The session remains `'in_progress'`.
4. **"Done" button**: Sends `leave_session` via WebSocket. Since all points are recalled, the session is marked as `'completed'` in the database. Frontend navigates to the dashboard.
5. **"Leave Session" button**: Always visible in the session controls. No confirmation dialog. Sends `leave_session` via WebSocket. If points remain, session status is `'paused'`. If all points are recalled, session status is `'completed'`. Frontend navigates to the dashboard.
6. **Paused sessions are resumable**: A paused session can be resumed. The checklist state is reconstructed from `recalledPointIds` in the database. Previously recalled points show as `'recalled'`, remaining points show as `'pending'`. The probe index starts at the first unchecked point.
7. **Rabbit hole edge case**: If the user is in a rabbit hole when the last point is recalled, `completionPending` is set to `true`. The overlay does NOT appear during the rabbit hole. When the rabbit hole exits (via `onRabbitHoleExit()`), the overlay appears.
8. **Persisted checklist state**: Each time a point is recalled, `recalledPointIds` is updated in the sessions table. This is fire-and-forget (non-blocking).
9. **Schema migration**: The Drizzle migration runs cleanly on existing databases. Existing sessions get `recalledPointIds` defaulting to `'[]'`. Existing sessions with `'in_progress'` status are unaffected.
10. **`end_session` removed**: The `end_session` client message type is removed. `handleEndSession()` is removed. `endSession` function is removed from the WebSocket hook. `grep -r "end_session"` returns nothing in source code (may appear in task/docs files).
11. **Session status values**: The database supports four session statuses: `'in_progress'`, `'completed'`, `'abandoned'`, `'paused'`. Each is used correctly:
    - `'in_progress'`: Active session, user is chatting
    - `'completed'`: All points recalled and user confirmed (via "Done" or "Leave Session" with all points recalled)
    - `'abandoned'`: Session was abandoned (legacy or future explicit abandon action)
    - `'paused'`: User left mid-session with points remaining
12. **Dashboard differentiation**: If a session list/dashboard exists, paused sessions display differently from abandoned and completed sessions (e.g., "Paused" badge vs "Abandoned" badge).
13. **Animated overlay**: The `SessionCompleteOverlay` has a smooth entrance animation (fade + subtle scale). Not jarring.
14. **No confirmation for Leave Session**: The "Leave Session" button does not show a confirmation dialog. Pausing is non-destructive and the user can always resume.
15. **"I've got it!" button is gone**: Verified absent (removed in T06).
16. **"End Session" button is gone**: Replaced entirely by "Leave Session".
17. **Completion overlay does not auto-navigate**: The overlay is informational with two choices. It does not automatically end or navigate. The user decides.
