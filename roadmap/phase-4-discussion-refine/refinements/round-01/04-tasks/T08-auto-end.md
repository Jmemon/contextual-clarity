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

The current `status` column (line 152) accepts `'in_progress' | 'completed' | 'abandoned'`. Add `'paused'` to this enum.

```typescript
// In the sessions table definition, update the status column:
status: text('status', { enum: ['in_progress', 'completed', 'abandoned', 'paused'] })
  .notNull()
  .default('in_progress'),
```

**Add `recalledPointIds` column and timestamp columns:**

These store which points have been recalled so far and when the session was paused/resumed, enabling session resume with checklist state intact.

```typescript
// Add to sessions table after endedAt:

// JSON array of recall point IDs that have been recalled during this session.
// Used to reconstruct the pointChecklist Map when resuming a paused session.
recalledPointIds: text('recalled_point_ids', { mode: 'json' })
  .$type<string[]>()
  .notNull()
  .default('[]'),

// Timestamp when the session was last paused (null if never paused)
pausedAt: integer('paused_at', { mode: 'timestamp_ms' }),

// Timestamp when the session was last resumed from a paused state
resumedAt: integer('resumed_at', { mode: 'timestamp_ms' }),
```

**Add inferred type exports** following the project convention (see `CROSS-TASK-ISSUES.md` section 7):

```typescript
export type SessionRow = typeof sessions.$inferSelect;
export type NewSessionRow = typeof sessions.$inferInsert;
```

**Generate and apply a Drizzle migration:**

After modifying `schema.ts`, generate and apply the migration using the project's workflow:

```bash
bun run db:generate   # generates SQL migration file in the migrations directory
bun run db:migrate    # applies via src/storage/migrate.ts
```

Never use `drizzle-kit push`. The project uses `src/storage/migrate.ts` as its migration runner.

Since the status column is stored as plain text in SQLite (not a native enum), no ALTER TABLE is needed for the enum change — just the new columns. The migration should:
- Add the `recalled_point_ids` column with a default of `'[]'`
- Add the `paused_at` column (nullable)
- Add the `resumed_at` column (nullable)
- Be safe to run on existing databases with existing sessions

### 2. Domain Model Update — Add `'paused'` to `SessionStatus` and Extend `Session` Interface (`src/core/models/session.ts`)

**Update the `SessionStatus` type** at line 31:

```typescript
// Before:
export type SessionStatus = 'in_progress' | 'completed' | 'abandoned';

// After:
// - 'paused': Session was paused by the user via "Leave Session" with points remaining.
//             The session can be resumed later with its checklist state intact.
export type SessionStatus = 'in_progress' | 'completed' | 'abandoned' | 'paused';
```

**Update the `Session` interface** to include the new persisted fields:

```typescript
// Add to the Session interface after endedAt:

/**
 * IDs of recall points that have been recalled during this session.
 * Used to reconstruct the pointChecklist Map when resuming a paused session.
 * Defaults to an empty array for new sessions.
 */
recalledPointIds: string[];

/**
 * When the session was last paused, or null if never paused.
 */
pausedAt: Date | null;

/**
 * When the session was last resumed from a paused state, or null if never resumed.
 */
resumedAt: Date | null;
```

**Update the JSDoc for `endedAt`** to clarify paused sessions do NOT set endedAt:

```typescript
/**
 * When the session ended, or null if still in progress or paused.
 * Set when status changes to 'completed' or 'abandoned'.
 * NOT set when status changes to 'paused'.
 */
endedAt: Date | null;
```

### 3. Repository Changes (`src/storage/repositories/session.repository.ts`)

**Update `mapToDomain()`** (line 51-61) to include the new fields:

```typescript
function mapToDomain(row: typeof sessions.$inferSelect): Session {
  return {
    id: row.id,
    recallSetId: row.recallSetId,
    status: row.status,
    targetRecallPointIds: row.targetRecallPointIds,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    // New fields for pause/resume support
    recalledPointIds: row.recalledPointIds ?? [],
    pausedAt: row.pausedAt ?? null,
    resumedAt: row.resumedAt ?? null,
  };
}
```

**Extend `UpdateSessionInput`** (line 38-43) to support the new fields:

```typescript
export interface UpdateSessionInput {
  /** Current lifecycle status */
  status?: SessionStatus;
  /** When the session ended */
  endedAt?: Date;
  /** IDs of recalled points (for persisting checklist state) */
  recalledPointIds?: string[];
  /** When the session was paused */
  pausedAt?: Date;
  /** When the session was resumed */
  resumedAt?: Date;
}
```

**Add `pause()` method:**

```typescript
/**
 * Pauses a session — sets status to 'paused' without clearing state.
 * The session can be resumed later with its checklist state intact.
 * Does NOT set endedAt — the session is not over, just paused.
 */
async pause(sessionId: string): Promise<void> {
  const result = await this.db
    .update(sessions)
    .set({
      status: 'paused',
      pausedAt: new Date(),
    })
    .where(eq(sessions.id, sessionId))
    .returning({ id: sessions.id });

  if (result.length === 0) {
    throw new Error(`Session with id '${sessionId}' not found`);
  }
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
      recalledPointIds: recalledPointIds,
    })
    .where(eq(sessions.id, sessionId));
}
```

**Rename `findInProgress()` to `findActiveSession()`** (line 147) and update to also match `'paused'` sessions:

The existing method `findInProgress(recallSetId)` is called by both `session-handler.ts` (line 326) and `session-engine.ts` (line 326). Rename it and update both callers. Do NOT add a duplicate method.

```typescript
// Add inArray import at top of file:
import { eq, and, inArray } from 'drizzle-orm';

/**
 * Finds an active (in-progress or paused) session for a specific recall set.
 * Only one session should be active at a time for each recall set.
 * Used to resume interrupted or paused sessions.
 *
 * Renamed from findInProgress() — update all callers:
 *   - src/api/ws/session-handler.ts (line 326)
 *   - src/core/session/session-engine.ts (line 326)
 */
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

  if (result.length === 0) {
    return null;
  }

  return mapToDomain(result[0]);
}
```

**Update callers of `findInProgress()`:**
- `src/core/session/session-engine.ts` line 326: `this.sessionRepo.findInProgress(recallSet.id)` becomes `this.sessionRepo.findActiveSession(recallSet.id)`
- `src/api/ws/session-handler.ts` — check if `findInProgress` is called anywhere and update likewise

### 4. Session Engine Event Types (`src/core/session/types.ts`)

**Add new event types to `SessionEventType`** (line 51-58):

```typescript
export type SessionEventType =
  | 'session_started'
  | 'point_started'
  | 'user_message'
  | 'assistant_message'
  | 'point_evaluated'
  | 'point_completed'
  | 'session_completed'
  // New events added by T08:
  | 'session_complete_overlay'  // All points recalled — show completion overlay
  | 'session_paused';           // Session paused via Leave Session
```

Both `'session_complete_overlay'` and `'session_paused'` must be added BEFORE any code calls `emitEvent('session_paused', ...)` or `emitEvent('session_complete_overlay', ...)`, otherwise TypeScript will reject the event type.

**Define payload types** (add below `SessionEventType`):

```typescript
/**
 * Payload for session_complete_overlay event.
 * Sent when all recall points are recalled and the user is not in a rabbit hole.
 * The frontend shows a completion overlay with options to continue or leave.
 */
export interface SessionCompleteOverlayEventPayload {
  message: string;        // e.g., "You've covered everything!"
  canContinue: boolean;   // true — user can dismiss overlay and keep chatting
  recalledCount: number;
  totalPoints: number;
}

/**
 * Payload for session_paused event.
 * Sent when the session is paused via Leave Session with points remaining.
 */
export interface SessionPausedEventPayload {
  sessionId: string;
  recalledCount: number;
  totalPoints: number;
}
```

### 5. WebSocket Protocol Types (`src/api/ws/types.ts`)

**Replace `EndSessionPayload` with `LeaveSessionPayload`:**

```typescript
// Remove:
export interface EndSessionPayload {
  type: 'end_session';
}

// Add:
/**
 * Client request to leave the session.
 * If all points are recalled, the session is marked 'completed'.
 * If points remain, the session is marked 'paused' (preserving state for later resumption).
 */
export interface LeaveSessionPayload {
  type: 'leave_session';
}
```

**Update `ClientMessage` union** (line 100-104):

```typescript
export type ClientMessage =
  | UserMessagePayload
  | TriggerEvalPayload    // Note: T06 removes this; if already removed, omit
  | LeaveSessionPayload   // Replaces EndSessionPayload
  | PingPayload;
```

**Update `CLIENT_MESSAGE_TYPES` array** (line 109-114):

```typescript
export const CLIENT_MESSAGE_TYPES = [
  'user_message',
  'trigger_eval',    // Note: T06 removes this; if already removed, omit
  'leave_session',   // Replaces 'end_session'
  'ping',
] as const;
```

Both the union and the array MUST be updated atomically. If `'end_session'` is removed from the union but left in `CLIENT_MESSAGE_TYPES` (or vice versa), TypeScript will error. The exhaustiveness check at `session-handler.ts` line 360 (`const _exhaustive: never = parsed`) will also fail if the switch cases don't match the union.

**Add new server message payload types:**

```typescript
/**
 * Sent when all recall points have been recalled.
 * The frontend shows a completion overlay with options to continue or leave.
 */
export interface SessionCompleteOverlayPayload {
  type: 'session_complete_overlay';
  message: string;
  canContinue: boolean;
  recalledCount: number;
  totalPoints: number;
}

/**
 * Sent when a session is paused via Leave Session.
 * The frontend should navigate away (e.g., to the dashboard).
 */
export interface SessionPausedPayload {
  type: 'session_paused';
  sessionId: string;
  recalledCount: number;
  totalPoints: number;
}
```

**Update `ServerMessage` union** (line 257-265) to include the new types:

```typescript
export type ServerMessage =
  | SessionStartedPayload
  | AssistantChunkPayload
  | AssistantCompletePayload
  | EvaluationResultPayload
  | PointTransitionPayload
  | SessionCompletePayload
  | SessionCompleteOverlayPayload  // New: completion overlay
  | SessionPausedPayload           // New: session paused
  | ErrorPayload
  | PongPayload;
```

### 6. Barrel Export Updates (`src/api/ws/index.ts`)

**Update the exports** (lines 85-122) to reflect the rename and additions:

```typescript
// Replace EndSessionPayload with LeaveSessionPayload:
// Before: type EndSessionPayload,
// After:
type LeaveSessionPayload,

// Add new server message types:
type SessionCompleteOverlayPayload,
type SessionPausedPayload,
```

### 7. SessionEngine — Add `completionPending` State and Auto-End Logic (`src/core/session/session-engine.ts`)

**Add `completionPending` as a private field on `SessionEngine`:**

This is a new field that must be explicitly declared on the class. It is NOT inherited from anywhere.

```typescript
// Add as a private field on the SessionEngine class:
/**
 * Flag set when all points are recalled but the user is in a rabbit hole.
 * The completion overlay is deferred until the rabbit hole exits.
 */
private completionPending: boolean = false;
```

**Modify `processUserMessage()` (after T06 changes):**

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

```typescript
/**
 * Called when the user exits a rabbit hole.
 * If all points were recalled during the rabbit hole, show the completion overlay now.
 */
public onRabbitHoleExit(): void {
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

**Add `isInRabbitHole()` stub** (if T09 has not yet implemented rabbit hole mode):

```typescript
/**
 * Returns whether the session is currently in a rabbit hole.
 * TODO: T09 (RabbitholeAgent) will implement this properly.
 * For now returns false so the overlay appears immediately.
 */
private isInRabbitHole(): boolean {
  return false;
}
```

### 8. SessionEngine — `pauseSession()` Public Method (`src/core/session/session-engine.ts`)

The existing `completeSession()` (line 1091) and `resetState()` (line 1129) are both **private**. External callers (like the WS handler) cannot call them directly. This task adds new **public** methods that delegate to the private internals.

**Add public `pauseSession()` method:**

```typescript
/**
 * Pauses the current session — saves state and marks as 'paused'.
 * The session can be resumed later with its checklist state intact.
 * Unlike abandonSession(), this is not a termination — it's a pause.
 *
 * This method is public so the WS handler can call it.
 */
public async pauseSession(): Promise<void> {
  this.validateActiveSession();

  const sessionId = this.currentSession!.id;

  // Persist current recalled point IDs before pausing
  const recalledPointIds = this.targetPoints
    .filter(p => this.pointChecklist.get(p.id) === 'recalled')
    .map(p => p.id);
  await this.sessionRepo.updateRecalledPointIds(sessionId, recalledPointIds);

  // Set status to paused in the database
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

**Add public `finalizeSession()` method** (delegates to private `completeSession()`):

```typescript
/**
 * Public wrapper around the private completeSession() method.
 * Called by the WS handler when the user clicks "Done" on the overlay
 * or sends leave_session with all points recalled.
 *
 * completeSession() is private (line 1091) so this public method
 * provides external access without changing the existing private API.
 */
public async finalizeSession(): Promise<void> {
  this.validateActiveSession();
  await this.completeSession();
}
```

### 9. SessionEngine — Persist Checklist State on Each Recall (`src/core/session/session-engine.ts`)

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

  // Persist recalled state to DB for resume capability.
  // Fire and forget — don't await to avoid slowing down the message flow.
  // If this fails, the worst case is that a resume loses the last recalled point.
  const recalledPointIds = this.targetPoints
    .filter(p => this.pointChecklist.get(p.id) === 'recalled')
    .map(p => p.id);
  this.sessionRepo.updateRecalledPointIds(this.currentSession!.id, recalledPointIds)
    .catch(err => console.error('Failed to persist recalled point IDs:', err));

  const currentProbePoint = this.targetPoints[this.currentProbeIndex];
  if (currentProbePoint && currentProbePoint.id === pointId) {
    this.advanceProbeIndex();
  }
}
```

### 10. SessionEngine — Resume Paused Session (`src/core/session/session-engine.ts`)

**Update `startSession()`** (line 324) to use `findActiveSession()` instead of `findInProgress()`:

```typescript
// Before:
const existingSession = await this.sessionRepo.findInProgress(recallSet.id);

// After:
const existingSession = await this.sessionRepo.findActiveSession(recallSet.id);
```

**Update `resumeSession()`** (line 394, private) to reconstruct the checklist from persisted `recalledPointIds`:

```typescript
private async resumeSession(
  session: Session,
  recallSet: RecallSet
): Promise<Session> {
  // Load the recall points for this session
  const points: RecallPoint[] = [];
  for (const pointId of session.targetRecallPointIds) {
    const point = await this.recallPointRepo.findById(pointId);
    if (point) {
      points.push(point);
    }
  }

  // Load existing messages
  const existingMessages = await this.messageRepo.findBySessionId(session.id);

  // Initialize engine state
  this.currentSession = session;
  this.currentRecallSet = recallSet;
  this.targetPoints = points;
  this.messages = existingMessages;

  // Reconstruct the checklist from persisted recalledPointIds
  const recalledIds = session.recalledPointIds ?? [];
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
    await this.sessionRepo.update(session.id, {
      status: 'in_progress',
      resumedAt: new Date(),
    });
    // Update local state to reflect the status change
    this.currentSession = {
      ...this.currentSession!,
      status: 'in_progress',
      resumedAt: new Date(),
    };
  }

  // Reset completion pending flag
  this.completionPending = false;

  // Phase 2: Initialize metrics collection for resumed session
  if (this.metricsCollector) {
    this.metricsCollector.startSession(session.id, this.currentModel);
  }

  // ... existing resume logic continues
}
```

### 11. Session Handler Changes (`src/api/ws/session-handler.ts`)

**Update `handleOpen()`** (line 245) to accept `'paused'` sessions for resume:

```typescript
// Before:
if (session.status !== 'in_progress') {

// After:
if (session.status !== 'in_progress' && session.status !== 'paused') {
```

**Replace `case 'end_session':` with `case 'leave_session':`** in the switch at line 344-362:

Both the case label AND the exhaustiveness check must be updated atomically. The `never` exhaustiveness check at line 360 (`const _exhaustive: never = parsed`) will fail if the union type and switch cases don't match.

```typescript
switch (parsed.type) {
  case 'user_message':
    await this.handleUserMessage(ws, parsed.content);
    break;
  case 'trigger_eval':        // Note: T06 removes this case
    await this.handleTriggerEval(ws);
    break;
  case 'leave_session':       // Replaces 'end_session'
    await this.handleLeaveSession(ws);
    break;
  case 'ping':
    this.handlePing(ws);
    break;
  default:
    // TypeScript exhaustiveness check
    const _exhaustive: never = parsed;
    throw new Error(`Unhandled message type: ${(_exhaustive as ClientMessage).type}`);
}
```

**Replace `handleEndSession()` (line 504) with `handleLeaveSession()`:**

Important: After `abandonSession()`, `resetState()` sets `currentSession = null`, so `getSessionState()` returns null. The new `handleLeaveSession()` must capture state BEFORE calling pause/abandon.

```typescript
/**
 * Handles the leave_session client message.
 * If all points are recalled, marks the session as 'completed'.
 * If points remain, pauses the session for later resumption.
 *
 * State is captured BEFORE calling engine methods because
 * both pauseSession() and abandonSession() call resetState()
 * which sets currentSession to null.
 */
private async handleLeaveSession(
  ws: ServerWebSocket<WebSocketSessionData>
): Promise<void> {
  const data = ws.data;
  console.log(`[WS] Leave session requested for ${data.sessionId}`);

  if (!data.session) {
    this.sendError(ws, 'SESSION_NOT_ACTIVE', 'No active session');
    ws.close(WS_CLOSE_CODES.SESSION_ENDED, 'No active session');
    return;
  }

  try {
    if (data.engine) {
      // Capture state BEFORE engine methods reset it
      const recalledCount = data.engine.getRecalledCount();
      const totalPoints = data.engine.getTotalPoints();
      const allRecalled = data.engine.allPointsRecalled();

      if (allRecalled) {
        // All points recalled — this is a completion, not just a pause
        await data.engine.finalizeSession();
        this.send(ws, {
          type: 'session_complete',
          summary: {
            sessionId: data.sessionId,
            totalPointsReviewed: totalPoints,
            successfulRecalls: recalledCount,
            recallRate: totalPoints > 0 ? recalledCount / totalPoints : 0,
            durationMs: Date.now() - data.lastMessageTime,
            engagementScore: 80,
            estimatedCostUsd: 0.01,
          },
        });
      } else {
        // Points remain — pause for later resumption
        await data.engine.pauseSession();
        this.send(ws, {
          type: 'session_paused',
          sessionId: data.sessionId,
          recalledCount,
          totalPoints,
        });
      }
    }

    ws.close(WS_CLOSE_CODES.SESSION_ENDED, 'Session left');
  } catch (error) {
    console.error(`[WS] Error leaving session:`, error);
    this.sendError(ws, 'SESSION_ENGINE_ERROR', String(error));
  }
}
```

**Forward `session_complete_overlay` events to the WebSocket:**

The session engine emits events via `emitEvent()`, but `session-handler.ts` currently NEVER calls `engine.setEventListener()` (see `CROSS-TASK-ISSUES.md` section 15 — T13 is responsible for wiring this). For T08, add the event forwarding in the `handleOpen()` method after engine creation, so the overlay event reaches the client:

```typescript
// After engine.startSession() in handleOpen():
// Wire up event forwarding for auto-end overlay
data.engine.setEventListener((event) => {
  if (event.type === 'session_complete_overlay') {
    this.send(ws, {
      type: 'session_complete_overlay',
      ...(event.data as SessionCompleteOverlayEventPayload),
    });
  }
  if (event.type === 'session_paused') {
    this.send(ws, {
      type: 'session_paused',
      ...(event.data as SessionPausedEventPayload),
    });
  }
});
```

Note: T13 will later expand this event listener to handle all engine events. T08 only needs the overlay and paused events.

**Handle "Done" from overlay:**

When the user clicks "Done" on the completion overlay, the frontend sends `leave_session`. Since all points are recalled at that point, `handleLeaveSession()` calls `finalizeSession()` (which delegates to private `completeSession()`) and sends `session_complete`.

Semantics summary:
- **"Done" on overlay**: Sends `leave_session`. Since `allPointsRecalled()` is true, marks session as `'completed'`. Sends `session_complete`.
- **"Leave Session" button**: Sends `leave_session`. If `allPointsRecalled()` is true, marks as `'completed'`. If false, marks as `'paused'`. Sends appropriate message.
- **"Continue Discussion" on overlay**: Dismisses the overlay client-side only. No message sent to server. Session stays `'in_progress'`.

### 12. Frontend — Completion Overlay Component (new: `web/src/components/live-session/SessionCompleteOverlay.tsx`)

Create a new component. This is a new file, not a modification.

**Important**: `SessionContainer.tsx` (line 78-160) already has an inline `SessionCompleteScreen` component that shows when the session is fully finished. The new `SessionCompleteOverlay` is different — it's a dismissible overlay shown when all points are recalled but the user can continue chatting. Both components coexist:
- `SessionCompleteOverlay` — shows during an active session when all points are recalled. Has "Continue Discussion" and "Done" buttons.
- `SessionCompleteScreen` — shows after the session is truly completed/ended. Has "View Replay" and "Back to Dashboard" links.

```typescript
/**
 * Overlay displayed when all recall points have been recalled.
 * Shows a success message with options to continue chatting or exit.
 * Renders as a centered overlay with a semi-transparent backdrop.
 *
 * This is NOT the same as SessionCompleteScreen in SessionContainer.tsx,
 * which shows after the session is fully ended. This overlay appears
 * mid-session and is dismissible.
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
- Use Tailwind CSS for styling (matching the existing project approach in `web/src/components/`)

### 13. Frontend — SessionControls Changes (`web/src/components/live-session/SessionControls.tsx`)

**Replace "End Session" with "Leave Session":**

- Rename the `onEndSession` prop to `onLeaveSession` in `SessionControlsProps` (line 34)
- Remove the `showEndConfirm` state and the confirmation dialog entirely — pausing is non-destructive, no confirmation needed
- Change the button text from "End Session" to "Leave Session"
- Simplify the click handler — just call `onLeaveSession()` directly

**Remove "I've got it!" button** (already removed in T06 — verify it's gone).

The controls should now contain only:
- "Leave Session" button (always visible, secondary style)
- Any other existing controls that aren't related to evaluation or session termination

### 14. Frontend — `SessionState` Must Include `'paused'` (`web/src/components/live-session/SessionContainer.tsx`)

**Update the `SessionState` type** at line 32:

```typescript
// Before:
type SessionState = 'connecting' | 'active' | 'evaluating' | 'completed';

// After:
type SessionState = 'connecting' | 'active' | 'evaluating' | 'completed' | 'paused';
```

**Add corresponding state machine logic** — when a `session_paused` message is received, transition to `'paused'` state. When the session is resumed, transition back to `'active'`.

**Add overlay state:**

```typescript
const [showCompleteOverlay, setShowCompleteOverlay] = useState(false);
const [overlayData, setOverlayData] = useState<{
  message: string;
  recalledCount: number;
  totalPoints: number;
} | null>(null);
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

**Update prop passing** — replace `onEndSession={endSession}` with `onLeaveSession={leaveSession}` when rendering `SessionControls`.

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

### 15. Frontend — WebSocket Hook Changes (`web/src/hooks/use-session-websocket.ts`)

**Replace `endSession` with `leaveSession`:**

```typescript
// Remove (line 534-536):
const endSession = useCallback(() => {
  sendMessage({ type: 'end_session' });
}, [sendMessage]);

// Add:
/**
 * Leave the current session.
 * If all points are recalled, the server marks it 'completed'.
 * If points remain, the server marks it 'paused'.
 */
const leaveSession = useCallback(() => {
  sendMessage({ type: 'leave_session' });
}, [sendMessage]);
```

**Add handlers for new message types in `handleMessage` switch** (lines 290-355):

The current switch handles: `session_started`, `assistant_chunk`, `assistant_complete`, `evaluation_result`, `point_transition`, `session_complete`, `error`, `pong`. Without adding cases for the new types, `session_paused` and `session_complete_overlay` messages will be silently dropped.

```typescript
case 'session_complete_overlay':
  // Surface this to the component layer via a callback
  callbacksRef.current.onCompleteOverlay?.(message);
  break;

case 'session_paused':
  // Session was paused — clean up local state
  callbacksRef.current.onSessionPaused?.(message);
  break;
```

Add `onCompleteOverlay` and `onSessionPaused` to the hook's options/callbacks interface.

**Update the returned object** (lines 550-563):

```typescript
return {
  connectionState,
  lastError,
  messages,
  streamingContent,
  currentPointIndex,
  totalPoints,
  isWaitingForResponse,
  sendUserMessage,
  leaveSession,        // Replaces endSession
  connect,
  disconnect,
  // triggerEvaluation removed in T06
  // endSession removed in this task
};
```

### 16. Dashboard / Session List — Display Paused Sessions Differently

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

## `end_session` to `leave_session` Rename — Full Atomic Chain

All of the following locations MUST be updated atomically. If any are missed, TypeScript will error or runtime behavior will break.

| # | Location | File | What Changes |
|---|----------|------|-------------|
| 1 | `EndSessionPayload` interface | `src/api/ws/types.ts` line 83-85 | Rename to `LeaveSessionPayload`, change `type: 'end_session'` to `type: 'leave_session'` |
| 2 | `'end_session'` in `CLIENT_MESSAGE_TYPES` array | `src/api/ws/types.ts` line 109-114 | Replace with `'leave_session'` |
| 3 | `ClientMessage` union member | `src/api/ws/types.ts` line 100-104 | Replace `EndSessionPayload` with `LeaveSessionPayload` |
| 4 | `case 'end_session':` in switch | `src/api/ws/session-handler.ts` line 352-354 | Replace with `case 'leave_session':` |
| 5 | `handleEndSession()` method | `src/api/ws/session-handler.ts` line 504 | Rename to `handleLeaveSession()`, rewrite body |
| 6 | TypeScript exhaustiveness check | `src/api/ws/session-handler.ts` line 360 | Automatically satisfied if union and switch match |
| 7 | `sendMessage({ type: 'end_session' })` | `web/src/hooks/use-session-websocket.ts` line 535 | Change to `sendMessage({ type: 'leave_session' })` |
| 8 | `endSession` function name | `web/src/hooks/use-session-websocket.ts` line 534 | Rename to `leaveSession` |
| 9 | `endSession` in hook return value | `web/src/hooks/use-session-websocket.ts` line 560 | Replace with `leaveSession` |
| 10 | `onEndSession` prop | `web/src/components/live-session/SessionControls.tsx` line 34 | Rename to `onLeaveSession` |
| 11 | `onEndSession={endSession}` | `web/src/components/live-session/SessionContainer.tsx` | Replace with `onLeaveSession={leaveSession}` |
| 12 | Button text "End Session" | `web/src/components/live-session/SessionControls.tsx` line 140 | Change to "Leave Session" |
| 13 | Barrel export `EndSessionPayload` | `src/api/ws/index.ts` line 89 | Replace with `LeaveSessionPayload` |

---

## Relevant Files

| Action | File | What Changes |
|--------|------|-------------|
| MODIFY | `src/storage/schema.ts` | Add `'paused'` to session status enum, add `recalledPointIds` JSON column, add `pausedAt`/`resumedAt` timestamp columns, add `SessionRow`/`NewSessionRow` type exports |
| CREATE | Drizzle migration file (auto-generated via `bun run db:generate`) | Schema migration for the new columns |
| MODIFY | `src/core/models/session.ts` | Add `'paused'` to `SessionStatus` type union (line 31). Add `recalledPointIds`, `pausedAt`, `resumedAt` fields to `Session` interface. |
| MODIFY | `src/storage/repositories/session.repository.ts` | Update `mapToDomain()` for new fields. Extend `UpdateSessionInput`. Add `pause()`, `updateRecalledPointIds()` methods. Rename `findInProgress()` to `findActiveSession()` to also match `'paused'` sessions. Add `inArray` import. |
| MODIFY | `src/core/session/types.ts` | Add `'session_complete_overlay'` and `'session_paused'` to `SessionEventType` union. Add `SessionCompleteOverlayEventPayload` and `SessionPausedEventPayload` interfaces. |
| MODIFY | `src/api/ws/types.ts` | Replace `EndSessionPayload` with `LeaveSessionPayload`. Update `ClientMessage` union. Update `CLIENT_MESSAGE_TYPES` array. Add `SessionCompleteOverlayPayload` and `SessionPausedPayload` server message types. Update `ServerMessage` union. |
| MODIFY | `src/api/ws/index.ts` | Update barrel exports: replace `EndSessionPayload` with `LeaveSessionPayload`, add `SessionCompleteOverlayPayload` and `SessionPausedPayload`. |
| MODIFY | `src/core/session/session-engine.ts` | Add `completionPending` private field. Add public `pauseSession()`, `finalizeSession()`, `onRabbitHoleExit()` methods. Add private `isInRabbitHole()` stub. Update `processUserMessage()` with auto-end check. Update `markPointRecalled()` to persist state. Update `resumeSession()` to reconstruct checklist from DB. Rename `findInProgress()` call to `findActiveSession()`. |
| MODIFY | `src/api/ws/session-handler.ts` | Update `handleOpen()` to accept `'paused'` status. Replace `case 'end_session':` with `case 'leave_session':`. Replace `handleEndSession()` with `handleLeaveSession()`. Add event listener for `session_complete_overlay` forwarding. |
| CREATE | `web/src/components/live-session/SessionCompleteOverlay.tsx` | New overlay component with "Continue Discussion" and "Done" buttons |
| MODIFY | `web/src/components/live-session/SessionControls.tsx` | Replace `onEndSession` prop with `onLeaveSession`. Remove confirmation dialog. Change button text "End Session" to "Leave Session". Remove "I've got it!" button (verify T06 removed it). |
| MODIFY | `web/src/components/live-session/SessionContainer.tsx` | Add `'paused'` to `SessionState` type. Add overlay state management. Handle `session_complete_overlay` and `session_paused` messages. Wire up overlay component. Replace `onEndSession={endSession}` with `onLeaveSession={leaveSession}`. |
| MODIFY | `web/src/hooks/use-session-websocket.ts` | Replace `endSession` with `leaveSession` (sends `leave_session`). Add `session_complete_overlay` and `session_paused` cases to `handleMessage` switch. Add `onCompleteOverlay` and `onSessionPaused` callbacks. Update returned object. |

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
9. **Schema migration**: `bun run db:generate` produces a clean migration. `bun run db:migrate` applies it. Never use `drizzle-kit push`. Existing sessions get `recalledPointIds` defaulting to `'[]'` and nullable `pausedAt`/`resumedAt`.
10. **`end_session` fully removed**: All 13 locations in the rename chain are updated. `grep -r "end_session"` returns nothing in source code (may appear in task/docs files). `grep -r "EndSession"` returns nothing in source code.
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
18. **Domain model updated**: `SessionStatus` in `src/core/models/session.ts` includes `'paused'`. `Session` interface includes `recalledPointIds`, `pausedAt`, `resumedAt`.
19. **Repository `mapToDomain()` updated**: The mapping function includes the new fields from the database row.
20. **`handleOpen()` accepts paused sessions**: The WebSocket connection guard at `session-handler.ts` line 245 accepts both `'in_progress'` and `'paused'` status.
21. **No duplicate `findInProgress()` method**: The method is renamed to `findActiveSession()`, not duplicated. Both callers (`session-engine.ts` line 326 and `session-handler.ts`) are updated.
22. **`completionPending` is a class field**: Explicitly declared as `private completionPending: boolean = false` on `SessionEngine`.
23. **Both types.ts files updated**: `src/core/session/types.ts` (engine events) and `src/api/ws/types.ts` (WS protocol) are both updated with the new event/message types.
24. **Frontend `handleMessage` handles new events**: `use-session-websocket.ts` switch has cases for `session_complete_overlay` and `session_paused`.

---

## Implementation Warnings

> **WARNING: Implementation order matters within this task**
> The implementation order must be: (1) schema + domain model changes, (2) repository changes, (3) engine methods (`pauseSession`, `finalizeSession`), (4) handler changes (`handleLeaveSession`). The handler depends on engine methods that are being added in this same task.

> **WARNING: `handleOpen()` in `session-handler.ts` rejects non-`in_progress` sessions**
> The WebSocket `handleOpen()` method in `src/api/ws/session-handler.ts` checks `session.status !== 'in_progress'` and rejects the connection if so. When implementing session resume for `'paused'` sessions, you must also update this guard to accept `'paused'` status (and then the engine transitions the session to `'in_progress'` upon successful resume).

> **WARNING: `completeSession()` and `resetState()` are private**
> `completeSession()` (line 1091) and `resetState()` (line 1129) on `SessionEngine` are both `private`. External callers (like the WS handler) cannot call them. This spec adds `finalizeSession()` as a public wrapper for `completeSession()`. The `pauseSession()` public method calls `resetState()` internally, which is fine since it's calling from within the class.

> **WARNING: After `abandonSession()` or `pauseSession()`, `getSessionState()` returns null**
> Both methods call `resetState()` which sets `currentSession = null`. The new `handleLeaveSession()` in the WS handler MUST capture `recalledCount` and `totalPoints` BEFORE calling `pauseSession()` or `finalizeSession()`.

> **WARNING: `SessionStatus` lives in TWO places**
> - `src/core/models/session.ts` line 31: the TypeScript type union
> - `src/storage/schema.ts` line 152: the Drizzle schema enum
> Both MUST be updated to include `'paused'`.

> **WARNING: `findInProgress()` rename must update all callers**
> `findInProgress(recallSetId)` at line 147 of `session.repository.ts` is called by:
> - `session-engine.ts` line 326 in `startSession()`
> - Potentially `session-handler.ts` (check for any calls)
> All callers must be updated to `findActiveSession()` when renaming.

> **WARNING: Coexistence of SessionCompleteOverlay and SessionCompleteScreen**
> `SessionContainer.tsx` lines 78-160 have an inline `SessionCompleteScreen` that shows after session ends. The new `SessionCompleteOverlay.tsx` shows mid-session when all points are recalled. Both should coexist — do NOT remove `SessionCompleteScreen`.
