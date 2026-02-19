# T13 — Structured Events Protocol

| Field | Value |
|-------|-------|
| **name** | Structured Events Protocol |
| **parallel-group** | E (final — depends on all other tasks) |
| **depends-on** | T01 (Checklist), T02 (Universal Agent), T03 (Transcription), T04 (Resources), T05 (Rename), T06 (Evaluator), T07 (Tone), T08 (Auto-End), T09 (Rabbit Holes), T10 (Voice), T11 (Progress), T12 (Session History) |

---

## Description

Define and implement the complete structured event protocol that governs all communication between the session engine, WebSocket server, and frontend. This is the final integration task — it audits and codifies every event type introduced by all previous tasks, wires them end-to-end, removes deprecated event types, and adds a safety instruction to the LLM prompt to prevent the agent from generating text that duplicates what the UI already handles through events.

After this task, the entire system operates on a typed, exhaustive event protocol. Every user-visible state change (recall feedback, rabbit hole transitions, session completion, image display) is driven by structured events, NOT by LLM-generated text. The agent's text responses are limited to questions, hints, explanations, and brief acknowledgments.

---

## Detailed Implementation

### 1. Complete Event Catalog — Engine Events (`src/core/session/types.ts`)

The current `SessionEventType` union (lines 51-58 of `types.ts`) contains 7 event types:

```typescript
// CURRENT (to be replaced):
export type SessionEventType =
  | 'session_started'      // KEEP
  | 'point_started'        // REMOVE — replaced by checklist model from T01
  | 'user_message'         // KEEP
  | 'assistant_message'    // KEEP
  | 'point_evaluated'      // REMOVE — replaced by recall_point_recalled / recall_point_near_miss
  | 'point_completed'      // REMOVE — replaced by recall_point_recalled + FSRS in markPointRecalled()
  | 'session_completed';   // KEEP
```

**Explicit change list:**

- **KEEP** these 4 existing types unchanged: `session_started`, `user_message`, `assistant_message`, `session_completed`
- **REMOVE** these 3 existing types: `point_started`, `point_evaluated`, `point_completed`
- **ADD** these 12 new types (introduced by T01-T12):
  - `session_paused` (T08 — user clicked Leave Session)
  - `session_complete_overlay` (T08 — all points recalled, show overlay)
  - `recall_point_recalled` (T01 + T06 — a checklist point was checked off)
  - `recall_point_near_miss` (T06 — user was close but imprecise)
  - `rabbithole_detected` (T09 — tangent detected, prompt user)
  - `rabbithole_entered` (T09 — user accepted, entering rabbithole mode)
  - `rabbithole_exited` (T09 — user returned to main session)
  - `rabbithole_declined` (T09 — user declined to explore tangent)
  - `show_image` (T04 — display an image resource)
  - `show_resource` (T04 — reference a text resource)
  - `assistant_streaming_start` (T03 — streaming has begun)
  - `assistant_streaming_end` (T03 — streaming has ended)

**New definition (16 total event types):**

```typescript
/**
 * Complete catalog of session engine events.
 *
 * These events are emitted by SessionEngine and consumed by:
 * 1. WebSocketSessionHandler — translates to ServerMessage and sends to client
 * 2. MetricsCollector — records event timing and outcomes
 * 3. Any future event listeners (analytics, logging)
 *
 * Event categories:
 * - Session lifecycle: start, pause, complete overlay, complete
 * - Recall point: recalled, near miss
 * - Rabbit hole: detected, entered, exited, declined
 * - Resources: show image, show resource
 * - Messages: user, assistant, streaming start/end
 *
 * IMPORTANT: This is the SINGLE SOURCE OF TRUTH for all session events.
 * If you add a new event type, you must also:
 * 1. Add a corresponding entry in SessionEventData (below)
 * 2. Add a corresponding ServerMessage payload in src/api/ws/types.ts
 * 3. Handle it in src/api/ws/session-handler.ts handleEngineEvent()
 * 4. Handle it in web/src/hooks/use-session-websocket.ts
 * 5. Render it in the appropriate frontend component
 */
export type SessionEventType =
  // === Session Lifecycle ===
  | 'session_started'           // Session initialized, opening message generated
  | 'session_paused'            // Session paused by user (Leave Session from T08)
  | 'session_complete_overlay'  // All points recalled — show completion overlay (T08)
  | 'session_completed'         // Session fully ended (user exited after completion or left)

  // === Recall Point Events ===
  | 'recall_point_recalled'     // A specific point was checked off (T01 + T06)
  | 'recall_point_near_miss'    // User was close but imprecise — informational only

  // === Rabbit Hole Events ===
  | 'rabbithole_detected'       // Tangent detected, prompt user to explore (T09)
  | 'rabbithole_entered'        // User accepted, entering rabbit hole mode (T09)
  | 'rabbithole_exited'         // User returned to main session (T09)
  | 'rabbithole_declined'       // User declined to explore the tangent (T09)

  // === Resource Events ===
  | 'show_image'                // Display an image from resources in the session (T04)
  | 'show_resource'             // Reference or display a text resource (T04)

  // === Message Events ===
  | 'user_message'              // User sent a message
  | 'assistant_message'         // Agent response complete (full text)
  | 'assistant_streaming_start' // Agent response streaming has begun
  | 'assistant_streaming_end';  // Agent response streaming has ended
```

**Removed event types** (present in current code but no longer emitted):
- `point_started` — replaced by the checklist model from T01. The tutor probes the next unchecked point via prompt, not a discrete event.
- `point_evaluated` — replaced by `recall_point_recalled` and `recall_point_near_miss`. Evaluation is continuous (T06) and produces recall events, not evaluation events.
- `point_completed` — replaced by `recall_point_recalled`. FSRS update happens inside `markPointRecalled()`.

#### 1a. Create `SessionCompletionSummary` Type

This type does NOT currently exist anywhere in the codebase. It must be created in `src/core/session/types.ts` alongside `SessionEventData`. It is used by:
- The `session_completed` engine event data
- The `SessionCompletePayload` WS server message (via `SessionSummary` — see section 2 for reconciliation)

```typescript
/**
 * Summary of a completed session. Used in the session_completed event
 * and the session_complete WS payload.
 *
 * Field naming convention: uses server-side names (totalPointsReviewed,
 * successfulRecalls) consistently across backend AND frontend. The frontend's
 * SessionCompleteSummary in use-session-websocket.ts MUST be updated to match
 * these names (see section 5 for the frontend reconciliation).
 */
export interface SessionCompletionSummary {
  sessionId: string;
  /** Total number of recall points that were reviewed in this session */
  totalPointsReviewed: number;
  /** Number of successfully recalled points */
  successfulRecalls: number;
  /** Recall success rate (0.0 to 1.0) */
  recallRate: number;
  /** Total session duration in milliseconds */
  durationMs: number;
  /** Number of rabbit holes entered during the session */
  rabbitholeCount: number;
  /** IDs of all recall points that were successfully recalled */
  recalledPointIds: string[];
  /** Engagement score (0-100) */
  engagementScore: number;
  /** Estimated API cost in USD */
  estimatedCostUsd: number;
}
```

#### 1b. Create `SessionEventData` Discriminated Union

The current `SessionEvent.data` is typed as `unknown` (line 92 of `types.ts`). This must be replaced with a proper discriminated union that maps each event type to its exact data shape.

```typescript
/**
 * Typed event data payloads for each SessionEventType.
 * Using a discriminated union on `type` ensures type safety at every handler.
 *
 * Each variant corresponds exactly to one SessionEventType value.
 * When adding a new event type, add a corresponding variant here.
 */
export type SessionEventData =
  | { type: 'session_started'; sessionId: string; recallSetName: string; totalPoints: number }
  | { type: 'session_paused'; sessionId: string; recalledCount: number; totalPoints: number }
  | { type: 'session_complete_overlay'; message: string; recalledCount: number; totalPoints: number; durationMs: number }
  | { type: 'session_completed'; sessionId: string; summary: SessionCompletionSummary }
  | { type: 'recall_point_recalled'; pointId: string; pointIndex: number; recalledCount: number; totalPoints: number }
  | { type: 'recall_point_near_miss'; pointId: string; feedback: string }
  | { type: 'rabbithole_detected'; topic: string; label: string; triggerMessageContent: string }
  | { type: 'rabbithole_entered'; topic: string; label: string }
  | { type: 'rabbithole_exited'; label: string; pointsRecalledDuring: number; completionPending: boolean }
  | { type: 'rabbithole_declined'; topic: string }
  | { type: 'show_image'; resourceId: string; url: string; caption?: string; mimeType?: string }
  | { type: 'show_resource'; resourceId: string; title: string; snippet: string }
  | { type: 'user_message'; content: string; tokenCount?: number }
  | { type: 'assistant_message'; content: string; tokenCount?: number }
  | { type: 'assistant_streaming_start' }
  | { type: 'assistant_streaming_end'; fullContent: string; totalChunks: number };

/**
 * A session event with typed payload.
 * Replaces the previous definition that used `data: unknown`.
 */
export interface SessionEvent {
  type: SessionEventType;
  data: SessionEventData;
  timestamp: Date;
}
```

### 2. Complete ServerMessage Union (`src/api/ws/types.ts`)

Replace the current `ServerMessage` union type (lines 257-265) with the complete set. Each event type from step 1 that is relevant to the client gets a corresponding server message payload.

#### 2a. Payload Interfaces to REMOVE

Delete these interfaces entirely from `src/api/ws/types.ts`:

- **`EvaluationResultPayload`** (lines 169-179) — replaced by `RecallPointRecalledPayload` and `RecallPointNearMissPayload`
- **`PointTransitionPayload`** (lines 185-195) — replaced by the checklist model from T01; there is no linear "transition" anymore

#### 2b. Payload Interfaces to KEEP (unchanged)

- `AssistantChunkPayload` (lines 144-150)
- `AssistantCompletePayload` (lines 157-163)
- `ErrorPayload` (lines 233-241)
- `PongPayload` (lines 247-251)

#### 2c. Update `SessionStartedPayload`

Remove `currentPointIndex` field (no longer meaningful with checklist model). Add `recalledCount: number` (0 for fresh session, >0 for resumed session).

```typescript
export interface SessionStartedPayload {
  type: 'session_started';
  /** Unique identifier for this session */
  sessionId: string;
  /** The AI tutor's opening message (question about the recall point) */
  openingMessage: string;
  /** Total number of recall points in this session */
  totalPoints: number;
  /** Number of points already recalled (0 for fresh session, >0 for resumed) */
  recalledCount: number;
  // REMOVED: currentPointIndex — no longer meaningful with checklist model
}
```

#### 2d. Update `SessionCompletePayload` and `SessionSummary`

Replace the existing `SessionSummary` (lines 212-227) with `SessionCompletionSummary` (defined in step 1a). The `SessionCompletePayload` (lines 202-206) keeps its structure but references the new type:

```typescript
export interface SessionCompletePayload {
  type: 'session_complete';
  /** Summary of the session's metrics and performance */
  summary: SessionCompletionSummary;
}
```

Remove the old `SessionSummary` interface. Import `SessionCompletionSummary` from `src/core/session/types.ts` instead.

#### 2e. New Payload Interfaces to ADD

```typescript
/**
 * Sent when a recall point is checked off by the continuous evaluator.
 * The frontend uses this to trigger progress animation + sound (T11).
 * Note: pointIndex is for display ordering only (left-to-right fill).
 */
export interface RecallPointRecalledPayload {
  type: 'recall_point_recalled';
  pointId: string;
  pointIndex: number;       // sequential index for display (0, 1, 2...) — not the point's position in targetPoints
  recalledCount: number;    // total recalled so far
  totalPoints: number;      // total points in session
}

/**
 * Sent when the evaluator detects the user was close but imprecise.
 * Informational — the UI may show a subtle indicator or ignore it.
 */
export interface RecallPointNearMissPayload {
  type: 'recall_point_near_miss';
  pointId: string;
  feedback: string;         // brief description of what was close
}

/**
 * Sent when the rabbit hole detector identifies a tangent.
 * The frontend should show a prompt asking the user if they want to explore.
 */
export interface RabbitholeDetectedPayload {
  type: 'rabbithole_detected';
  topic: string;            // full description of the tangent
  label: string;            // 2-4 word short label for display in pills
}

/**
 * Sent when the user accepts the rabbit hole prompt.
 * Frontend transitions to rabbit hole UI mode.
 */
export interface RabbitholeEnteredPayload {
  type: 'rabbithole_entered';
  topic: string;
  label: string;
}

/**
 * Sent when the user exits a rabbit hole.
 * Frontend transitions back to main session mode and flushes buffered recalls.
 *
 * CANONICAL SHAPE — agreed between T09, T11, and T13 (see CROSS-TASK-ISSUES #12):
 * - label: topic of the rabbithole that was exited
 * - pointsRecalledDuring: recall points checked off while in rabbithole
 * - completionPending: whether all points are now recalled (triggers overlay after exit)
 */
export interface RabbitholeExitedPayload {
  type: 'rabbithole_exited';
  label: string;
  pointsRecalledDuring: number;  // how many points were recalled during the rabbit hole
  completionPending: boolean;    // whether all points are now recalled
}

/**
 * Sent when all recall points have been recalled.
 * Frontend shows a completion overlay. User can continue discussion or leave.
 * If the user is in a rabbit hole when this fires, defer until rabbithole_exited.
 */
export interface SessionCompleteOverlayPayload {
  type: 'session_complete_overlay';
  message: string;          // brief completion message
  recalledCount: number;
  totalPoints: number;
  durationMs: number;       // session duration so far
}

/**
 * Sent when the session engine wants to display an image from resources.
 * The frontend renders the image inline in the chat or as a modal.
 */
export interface ShowImagePayload {
  type: 'show_image';
  resourceId: string;
  url: string;              // URL to the image (external or served from API)
  caption?: string;         // optional caption text
  mimeType?: string;        // image MIME type for rendering hints
}

/**
 * Sent when the session engine references a text resource.
 * The frontend may show a collapsible excerpt or tooltip.
 */
export interface ShowResourcePayload {
  type: 'show_resource';
  resourceId: string;
  title: string;
  snippet: string;          // short excerpt from the resource (first ~200 chars)
}

/**
 * Sent when the session is paused (user clicked Leave Session).
 */
export interface SessionPausedPayload {
  type: 'session_paused';
  sessionId: string;
  recalledCount: number;
  totalPoints: number;
}
```

#### 2f. Updated `ServerMessage` Union

```typescript
export type ServerMessage =
  | SessionStartedPayload
  | AssistantChunkPayload
  | AssistantCompletePayload
  | RecallPointRecalledPayload
  | RecallPointNearMissPayload
  | RabbitholeDetectedPayload
  | RabbitholeEnteredPayload
  | RabbitholeExitedPayload
  | SessionCompleteOverlayPayload
  | SessionPausedPayload
  | ShowImagePayload
  | ShowResourcePayload
  | SessionCompletePayload        // final session summary — keep
  | ErrorPayload
  | PongPayload;
```

### 3. Complete ClientMessage Union (`src/api/ws/types.ts`)

#### 3a. Payload Interfaces to REMOVE

Delete these interfaces entirely:

- **`TriggerEvalPayload`** (lines 74-76) — removed in T06. Evaluation is continuous; no manual trigger.
- **`EndSessionPayload`** (lines 83-85) — replaced by `LeaveSessionPayload` in T08.

#### 3b. Payload Interfaces to KEEP (unchanged)

- `UserMessagePayload` (lines 63-67)
- `PingPayload` (lines 92-94)

#### 3c. New Payload Interfaces to ADD

```typescript
/**
 * User wants to leave the session. Replaces the old 'end_session'.
 * The session is PAUSED (not abandoned) — state is preserved for later resumption.
 */
export interface LeaveSessionPayload {
  type: 'leave_session';
}

/**
 * User accepts the rabbit hole prompt and wants to explore the tangent.
 *
 * NOTE: This payload MUST include rabbitholeEventId and topic so the server
 * handler can call engine.enterRabbithole(topic, eventId). Without these fields,
 * the server has no way to link the entry to the detected rabbithole event.
 */
export interface EnterRabbitholePayload {
  type: 'enter_rabbithole';
  rabbitholeEventId: string;  // echoed from rabbithole_detected server message
  topic: string;              // echoed from rabbithole_detected server message
}

/**
 * User wants to exit the rabbit hole and return to the main session.
 */
export interface ExitRabbitholePayload {
  type: 'exit_rabbithole';
}

/**
 * User declines the rabbit hole prompt and wants to stay on topic.
 */
export interface DeclineRabbitholePayload {
  type: 'decline_rabbithole';
}

/**
 * User dismisses the completion overlay and continues the discussion.
 */
export interface DismissOverlayPayload {
  type: 'dismiss_overlay';
}
```

#### 3d. Updated `ClientMessage` Union and `CLIENT_MESSAGE_TYPES`

```typescript
export type ClientMessage =
  | UserMessagePayload
  | LeaveSessionPayload
  | EnterRabbitholePayload  // NOTE: includes rabbitholeEventId + topic fields
  | ExitRabbitholePayload
  | DeclineRabbitholePayload
  | DismissOverlayPayload
  | PingPayload;

export const CLIENT_MESSAGE_TYPES = [
  'user_message',
  'leave_session',
  'enter_rabbithole',
  'exit_rabbithole',
  'decline_rabbithole',
  'dismiss_overlay',
  'ping',
] as const;
```

**REMOVED from `CLIENT_MESSAGE_TYPES`:** `'trigger_eval'`, `'end_session'`

#### 3e. Update `parseClientMessage()` (lines 325-382)

The `parseClientMessage()` function must be updated to:

1. **Reject** `trigger_eval` and `end_session` as `UNKNOWN_MESSAGE_TYPE` (they will fail the `isClientMessageType()` check automatically once removed from `CLIENT_MESSAGE_TYPES`).
2. **Validate `enter_rabbithole`** — this type requires `rabbitholeEventId: string` and `topic: string` fields. Without validation, a malformed client message would cause the handler to call `engine.enterRabbithole(undefined, undefined)`.
3. **Accept** the new types: `leave_session`, `exit_rabbithole`, `decline_rabbithole`, `dismiss_overlay` (no additional fields required beyond `type`).

```typescript
export function parseClientMessage(
  rawMessage: string
): ClientMessage | ErrorPayload {
  // ... existing JSON parsing and type validation (unchanged) ...

  // Validate specific message types that have required fields
  if (message.type === 'user_message') {
    if (typeof message.content !== 'string' || message.content.trim() === '') {
      return {
        type: 'error',
        code: 'MISSING_CONTENT',
        message: 'user_message must include a non-empty "content" field',
        recoverable: true,
      };
    }
    return { type: 'user_message', content: message.content };
  }

  // enter_rabbithole requires rabbitholeEventId and topic
  if (message.type === 'enter_rabbithole') {
    const msg = parsed as { type: string; rabbitholeEventId?: unknown; topic?: unknown };
    if (typeof msg.rabbitholeEventId !== 'string' || msg.rabbitholeEventId.trim() === '') {
      return {
        type: 'error',
        code: 'MISSING_CONTENT',
        message: 'enter_rabbithole must include a non-empty "rabbitholeEventId" field',
        recoverable: true,
      };
    }
    if (typeof msg.topic !== 'string' || msg.topic.trim() === '') {
      return {
        type: 'error',
        code: 'MISSING_CONTENT',
        message: 'enter_rabbithole must include a non-empty "topic" field',
        recoverable: true,
      };
    }
    return {
      type: 'enter_rabbithole',
      rabbitholeEventId: msg.rabbitholeEventId,
      topic: msg.topic,
    };
  }

  // For other message types (leave_session, exit_rabbithole,
  // decline_rabbithole, dismiss_overlay, ping), return as-is
  return { type: message.type } as ClientMessage;
}
```

### 4. Deprecated `emitEvent()` Calls in `session-engine.ts` — Update or Remove

The session engine currently emits deprecated event types. These must be updated to use the new event types or removed entirely:

| Line | Current Call | Action | Replacement |
|------|-------------|--------|-------------|
| 470 | `emitEvent('point_started', { pointIndex, pointId, totalPoints })` | **REMOVE** | The checklist model (T01) handles point probing via prompt, not discrete events. The opening message flow does not need a point_started event. |
| 691 | `emitEvent('point_evaluated', { pointId, success, confidence, reasoning })` | **REPLACE** | Emit `recall_point_recalled` (if `success === true`) or `recall_point_near_miss` (if close but not successful). The continuous evaluator (T06) calls this path. |
| 785 | `emitEvent('point_completed', { pointId, rating, newDueDate, success })` | **REMOVE** | The checklist model handles FSRS updates inside `markPointRecalled()`. No separate point_completed event needed. |
| 814 | `emitEvent('point_started', { pointIndex, pointId, totalPoints })` | **REMOVE** | Same as line 470 — the checklist model probes the next unchecked point via prompt. |
| 1203 | `emitEvent('point_evaluated', { pointId, rabbitholeDetected, ... })` | **REPLACE** | Emit `rabbithole_detected` with `{ topic, label, triggerMessageContent }`. The `topic` comes from `rabbitholeEvent.topic`. The `label` should be a short 2-4 word version of the topic (derived from the detection result). |

### 5. Wire `setEventListener()` in `session-handler.ts` — THE CRITICAL GAP

**This is the single most important change in T13.** Currently, `session-handler.ts` creates a `SessionEngine` at line 266 and calls `engine.startSession()` at line 277, but **NEVER calls `engine.setEventListener()`**. This means all engine events go nowhere — the entire event system is disconnected.

#### 5a. Add Event Listener Wiring

After engine creation (line 278, after `data.engine = engine`), add the event listener wiring:

```typescript
// Wire engine events to WebSocket messages — THIS IS THE CRITICAL INTEGRATION POINT.
// Without this, engine events (recall, rabbithole, completion) never reach the client.
engine.setEventListener((event: SessionEvent) => {
  this.handleEngineEvent(ws, event);
});
```

#### 5b. Add `handleEngineEvent()` Method

Add a new private method to `WebSocketSessionHandler` that translates each `SessionEvent` into the appropriate `ServerMessage` and sends it via WebSocket:

```typescript
/**
 * Translates a SessionEngine event into the appropriate ServerMessage
 * and sends it to the client via WebSocket.
 *
 * This is the bridge between the engine's internal event system and
 * the WebSocket protocol. Every SessionEventType that is client-relevant
 * must have a case here.
 */
private handleEngineEvent(
  ws: ServerWebSocket<WebSocketSessionData>,
  event: SessionEvent
): void {
  switch (event.data.type) {
    case 'session_started':
      // session_started is handled separately in the connection setup flow
      // (the handler already sends it after getOpeningMessage). Skip here
      // to avoid sending a duplicate.
      break;

    case 'recall_point_recalled':
      this.send(ws, {
        type: 'recall_point_recalled',
        pointId: event.data.pointId,
        pointIndex: event.data.pointIndex,
        recalledCount: event.data.recalledCount,
        totalPoints: event.data.totalPoints,
      });
      break;

    case 'recall_point_near_miss':
      this.send(ws, {
        type: 'recall_point_near_miss',
        pointId: event.data.pointId,
        feedback: event.data.feedback,
      });
      break;

    case 'rabbithole_detected':
      this.send(ws, {
        type: 'rabbithole_detected',
        topic: event.data.topic,
        label: event.data.label,
      });
      break;

    case 'rabbithole_entered':
      this.send(ws, {
        type: 'rabbithole_entered',
        topic: event.data.topic,
        label: event.data.label,
      });
      break;

    case 'rabbithole_exited':
      this.send(ws, {
        type: 'rabbithole_exited',
        label: event.data.label,
        pointsRecalledDuring: event.data.pointsRecalledDuring,
        completionPending: event.data.completionPending,
      });
      // If completionPending is true, the handler should also emit session_complete_overlay
      // after the rabbithole exit. This is deferred from when all points were recalled
      // during the rabbithole. The engine will emit session_complete_overlay separately.
      break;

    case 'rabbithole_declined':
      // No server message needed — the engine just resumes normal flow
      break;

    case 'session_complete_overlay':
      this.send(ws, {
        type: 'session_complete_overlay',
        message: event.data.message,
        recalledCount: event.data.recalledCount,
        totalPoints: event.data.totalPoints,
        durationMs: event.data.durationMs,
      });
      break;

    case 'session_paused':
      this.send(ws, {
        type: 'session_paused',
        sessionId: event.data.sessionId,
        recalledCount: event.data.recalledCount,
        totalPoints: event.data.totalPoints,
      });
      break;

    case 'session_completed':
      this.send(ws, {
        type: 'session_complete',
        summary: event.data.summary,
      });
      break;

    case 'show_image':
      this.send(ws, {
        type: 'show_image',
        resourceId: event.data.resourceId,
        url: event.data.url,
        caption: event.data.caption,
        mimeType: event.data.mimeType,
      });
      break;

    case 'show_resource':
      this.send(ws, {
        type: 'show_resource',
        resourceId: event.data.resourceId,
        title: event.data.title,
        snippet: event.data.snippet,
      });
      break;

    case 'assistant_streaming_start':
      // No explicit message — streaming is signaled by the first assistant_chunk
      break;

    case 'assistant_streaming_end':
      this.send(ws, {
        type: 'assistant_complete',
        fullContent: event.data.fullContent,
        totalChunks: event.data.totalChunks,
      });
      break;

    case 'user_message':
    case 'assistant_message':
      // These events are handled by the existing message flow
      // (user messages come from the client; assistant messages are streamed as chunks).
      // No additional WS message needed.
      break;

    default: {
      // TypeScript exhaustiveness check — if a new event type is added
      // to SessionEventData but not handled here, this will cause a compile error.
      const _exhaustive: never = event.data;
      console.warn(`[WS] Unhandled engine event type: ${(event.data as SessionEventData).type}`);
    }
  }
}
```

#### 5c. Update `session_started` Payload in Connection Setup

Update the existing `session_started` send (around line 287) to use the new payload shape. Replace `currentPointIndex` with `recalledCount`:

```typescript
// BEFORE (current code at line 287-293):
this.send(ws, {
  type: 'session_started',
  sessionId: session.id,
  openingMessage,
  currentPointIndex: sessionState?.currentPointIndex ?? 0,
  totalPoints: sessionState?.totalPoints ?? session.targetRecallPointIds.length,
});

// AFTER:
this.send(ws, {
  type: 'session_started',
  sessionId: session.id,
  openingMessage,
  totalPoints: sessionState?.totalPoints ?? session.targetRecallPointIds.length,
  recalledCount: 0, // 0 for fresh sessions; for resumed sessions, read from engine state
});
```

### 6. Client Message Routing Cleanup in `session-handler.ts`

#### 6a. REMOVE These Handler Methods and Switch Cases

- **`case 'trigger_eval':`** (line 349-350) and **`handleTriggerEval()` method** (lines 445-496) — evaluation is continuous from T06; no manual trigger.
- **`case 'end_session':`** (line 352-353) and **`handleEndSession()` method** (lines 504-560) — replaced by `leave_session` from T08.

#### 6b. ADD These New Switch Cases

```typescript
switch (parsed.type) {
  case 'user_message':
    await this.handleUserMessage(ws, parsed.content);
    break;

  case 'leave_session':
    await this.handleLeaveSession(ws);
    break;

  // NOTE: enter_rabbithole includes rabbitholeEventId and topic in the payload
  case 'enter_rabbithole':
    await this.handleEnterRabbithole(ws, parsed.rabbitholeEventId, parsed.topic);
    break;

  case 'exit_rabbithole':
    await this.handleExitRabbithole(ws);
    break;

  case 'decline_rabbithole':
    await this.handleDeclineRabbithole(ws);
    break;

  case 'dismiss_overlay':
    await this.handleDismissOverlay(ws);
    break;

  case 'ping':
    this.handlePing(ws);
    break;

  default: {
    // TypeScript exhaustiveness check
    const _exhaustive: never = parsed;
    throw new Error(`Unhandled message type: ${(_exhaustive as ClientMessage).type}`);
  }
}
```

#### 6c. ADD These New Handler Methods

```typescript
/**
 * Handles a leave_session request. Pauses the session (not abandons it)
 * so the user can resume later. Replaces the old handleEndSession().
 */
private async handleLeaveSession(
  ws: ServerWebSocket<WebSocketSessionData>
): Promise<void> {
  // Delegate to engine's pause/leave method (from T08)
  // Engine will emit session_paused event, which handleEngineEvent() translates to WS message
  // Then close the connection gracefully
}

/**
 * Handles enter_rabbithole request. Tells the engine the user accepted the tangent.
 */
private async handleEnterRabbithole(
  ws: ServerWebSocket<WebSocketSessionData>,
  rabbitholeEventId: string,
  topic: string
): Promise<void> {
  // Call engine.enterRabbithole(topic, rabbitholeEventId)
  // Engine will emit rabbithole_entered event
}

/**
 * Handles exit_rabbithole request. Returns user to main session.
 */
private async handleExitRabbithole(
  ws: ServerWebSocket<WebSocketSessionData>
): Promise<void> {
  // Call engine.exitRabbithole()
  // Engine returns { completionPending: boolean }
  // Engine will emit rabbithole_exited event
  // If completionPending, engine will also emit session_complete_overlay
}

/**
 * Handles decline_rabbithole request. User stays on topic.
 */
private async handleDeclineRabbithole(
  ws: ServerWebSocket<WebSocketSessionData>
): Promise<void> {
  // Call engine.declineRabbithole()
  // Engine will emit rabbithole_declined event
}

/**
 * Handles dismiss_overlay request. User continues discussion after completion overlay.
 */
private async handleDismissOverlay(
  ws: ServerWebSocket<WebSocketSessionData>
): Promise<void> {
  // Clear the completion overlay state — session continues in discussion mode
  // No engine call needed; this is purely a UI state change
}
```

### 7. Frontend Event Handling (`web/src/hooks/use-session-websocket.ts`)

#### 7a. Update `ServerMessage` Type (lines 64-72)

The frontend has its OWN `ServerMessage` type that duplicates the backend's. It must be updated to match. Remove deprecated types and add all new ones:

```typescript
export type ServerMessage =
  | { type: 'session_started'; sessionId: string; openingMessage: string; totalPoints: number; recalledCount: number }
  | { type: 'assistant_chunk'; content: string }
  | { type: 'assistant_complete'; fullContent: string }
  | { type: 'recall_point_recalled'; pointId: string; pointIndex: number; recalledCount: number; totalPoints: number }
  | { type: 'recall_point_near_miss'; pointId: string; feedback: string }
  | { type: 'rabbithole_detected'; topic: string; label: string }
  | { type: 'rabbithole_entered'; topic: string; label: string }
  | { type: 'rabbithole_exited'; label: string; pointsRecalledDuring: number; completionPending: boolean }
  | { type: 'session_complete_overlay'; message: string; recalledCount: number; totalPoints: number; durationMs: number }
  | { type: 'session_paused'; sessionId: string; recalledCount: number; totalPoints: number }
  | { type: 'show_image'; resourceId: string; url: string; caption?: string; mimeType?: string }
  | { type: 'show_resource'; resourceId: string; title: string; snippet: string }
  | { type: 'session_complete'; summary: SessionCompleteSummary }
  | { type: 'error'; code: string; message: string }
  | { type: 'pong' };
```

**REMOVED from `ServerMessage`:**
- `{ type: 'evaluation_result'; ... }` (line 68)
- `{ type: 'point_transition'; ... }` (line 69)

#### 7b. Reconcile `SessionCompleteSummary` Field Names (lines 77-88)

**This fixes a pre-existing mismatch** (see CROSS-TASK-ISSUES #19). The server uses `totalPointsReviewed`/`successfulRecalls` but the frontend uses `pointsAttempted`/`pointsSuccessful`. Pick the server-side names and update the frontend to match:

```typescript
/**
 * Summary data received when session completes.
 * Field names match the server's SessionCompletionSummary for consistency.
 */
export interface SessionCompleteSummary {
  /** Unique identifier for the session */
  sessionId: string;
  /** Total number of recall points reviewed */
  totalPointsReviewed: number;    // was: pointsAttempted
  /** Number of successful recalls */
  successfulRecalls: number;      // was: pointsSuccessful
  /** Recall success rate (0.0 to 1.0) */
  recallRate: number;
  /** Total duration of the session in milliseconds */
  durationMs: number;
  /** Number of rabbit holes entered */
  rabbitholeCount: number;
  /** IDs of recalled points */
  recalledPointIds: string[];
  /** Overall engagement score */
  engagementScore: number;
  /** Estimated API cost in USD */
  estimatedCostUsd: number;
}
```

Update all frontend code that references `pointsAttempted` to use `totalPointsReviewed`, and `pointsSuccessful` to use `successfulRecalls`.

#### 7c. Add New State Variables

```typescript
const [recalledCount, setRecalledCount] = useState(0);
const [totalPoints, setTotalPoints] = useState(0);
const [isInRabbithole, setIsInRabbithole] = useState(false);
const [rabbitholeLabels, setRabbitholeLabels] = useState<string[]>([]);
const [rabbitholePrompt, setRabbitholePrompt] = useState<{ topic: string; label: string } | null>(null);
const [completionOverlay, setCompletionOverlay] = useState<SessionCompleteOverlayPayload | null>(null);
const [sessionImages, setSessionImages] = useState<ShowImagePayload[]>([]);
const [pendingRecallAnimations, setPendingRecallAnimations] = useState(0);
```

#### 7d. Add New Message Handlers in the Switch Statement

```typescript
case 'session_started':
  setTotalPoints(msg.totalPoints);
  setRecalledCount(msg.recalledCount);
  // ... existing session_started handling ...
  break;

case 'recall_point_recalled':
  if (isInRabbithole) {
    // Buffer recall animations during rabbithole — they'll flush on exit
    setPendingRecallAnimations(prev => prev + 1);
  } else {
    setRecalledCount(msg.recalledCount);
  }
  break;

case 'recall_point_near_miss':
  // Optional: show a subtle toast or ignore
  break;

case 'rabbithole_detected':
  setRabbitholePrompt({ topic: msg.topic, label: msg.label });
  break;

case 'rabbithole_entered':
  setIsInRabbithole(true);
  setRabbitholePrompt(null);
  break;

case 'rabbithole_exited':
  setIsInRabbithole(false);
  // Flush buffered recalls
  if (pendingRecallAnimations > 0) {
    setRecalledCount(prev => prev + pendingRecallAnimations);
    setPendingRecallAnimations(0);
  }
  setRabbitholeLabels(prev => [...prev, msg.label]);
  break;

case 'session_complete_overlay':
  setCompletionOverlay(msg);
  break;

case 'session_paused':
  // Handle session pause — navigate away or show paused state
  break;

case 'show_image':
  setSessionImages(prev => [...prev, msg]);
  break;

case 'show_resource':
  // Optional: show resource reference in chat
  break;
```

**REMOVE these cases from the switch:**
- `case 'evaluation_result':` — no longer sent
- `case 'point_transition':` — no longer sent

#### 7e. Remove Deprecated Action Functions, Add New Ones

**REMOVE** (these call deprecated client message types):
- `triggerEvaluation` function (line 526) — was for `trigger_eval`
- `endSession` function (line 534) — was for `end_session`

**ADD** these new action functions:

```typescript
const leaveSession = useCallback(() => {
  sendMessage({ type: 'leave_session' });
}, [sendMessage]);

const enterRabbithole = useCallback((rabbitholeEventId: string, topic: string) => {
  sendMessage({ type: 'enter_rabbithole', rabbitholeEventId, topic });
}, [sendMessage]);

const exitRabbithole = useCallback(() => {
  sendMessage({ type: 'exit_rabbithole' });
}, [sendMessage]);

const declineRabbithole = useCallback(() => {
  sendMessage({ type: 'decline_rabbithole' });
  setRabbitholePrompt(null);
}, [sendMessage]);

const dismissOverlay = useCallback(() => {
  sendMessage({ type: 'dismiss_overlay' });
  setCompletionOverlay(null);
}, [sendMessage]);
```

Return all new state and action functions from the hook.

### 8. Frontend Component Integration

**`SessionContainer.tsx`**: Orchestrate all event-driven UI:
- Pass `recalledCount`, `totalPoints`, `isInRabbithole`, `rabbitholeLabels` to `SessionProgress`
- Show rabbit hole prompt UI when `rabbitholePrompt` is non-null
- Show completion overlay when `completionOverlay` is non-null
- Show images inline when `sessionImages` has entries
- Remove any references to `triggerEvaluation` or `endSession` callbacks

**`SessionControls.tsx`**:
- Remove the "I've got it!" button (evaluation is continuous from T06)
- Change "End Session" to "Leave Session" and wire to `leaveSession()` instead of `endSession()`

### 9. Barrel Exports Cleanup (`src/api/ws/index.ts`)

Lines 87-102 of `src/api/ws/index.ts` explicitly export deprecated types. Update to reflect the new protocol:

**REMOVE these exports:**
- `type TriggerEvalPayload`
- `type EndSessionPayload`
- `type EvaluationResultPayload`
- `type PointTransitionPayload`
- `type SessionSummary` (replaced by `SessionCompletionSummary` from core/session/types.ts)

**ADD these exports:**
- `type LeaveSessionPayload`
- `type EnterRabbitholePayload`
- `type ExitRabbitholePayload`
- `type DeclineRabbitholePayload`
- `type DismissOverlayPayload`
- `type RecallPointRecalledPayload`
- `type RecallPointNearMissPayload`
- `type RabbitholeDetectedPayload`
- `type RabbitholeEnteredPayload`
- `type RabbitholeExitedPayload`
- `type SessionCompleteOverlayPayload`
- `type SessionPausedPayload`
- `type ShowImagePayload`
- `type ShowResourcePayload`

### 10. LLM Text Cleanup — Safety Instruction (`src/llm/prompts/socratic-tutor.ts`)

Add a final safety instruction to the agent system prompt. This instruction prevents the LLM from generating text that duplicates what the UI handles through events.

**Add to the end of the system prompt** (after all other instructions, including T02's universal agent instructions and T07's tone instructions):

```
## CRITICAL: UI-Handled Content — Do NOT Generate

The following types of content are handled by the application's UI through structured events.
You must NEVER include any of this in your text responses:

- Progress updates: "You've recalled 3 out of 5 points!" or "Great progress!" or "Almost there!"
- Congratulatory text: "Great job!", "Well done!", "Excellent!", "Perfect!", "Correct!"
- Praise or encouragement: "That's exactly right!", "You nailed it!", "Brilliant answer!"
- Meta-commentary about the session: "Let's move to the next point", "We've covered X, now let's discuss Y"
- Numbered lists summarizing what's been covered vs what remains
- Explicit point transitions: "Now let's talk about [next topic]"

Your text should ONLY contain:
- Questions probing recall ("What happens when..." / "Can you explain how..." / "Why does...")
- Hints when the user is stuck ("Think about what happens at the cellular level...")
- Brief, neutral acknowledgments before moving on ("Right." / "Yes." / "Mm-hmm.")
- Explanations or clarifications when the user asks for them
- Conversational responses during rabbit holes

The system will handle all feedback, progress tracking, praise, and transitions through visual and audio UI elements.
```

**Verify compatibility**: The safety instruction should not contradict the tone guidelines from T07 — it complements them by specifying what the agent should NOT say, while T07 specifies the style of what it SHOULD say.

### 11. Audit — Remove All Deprecated Event References

Search the entire codebase for references to removed/deprecated event types and message types. Remove or update each:

**Engine-side (`src/core/session/`):**
```bash
grep -rn "point_started\|point_evaluated\|point_completed" src/
```
Remove any code that emits these events. Replace with the new event types where appropriate (see step 4 above for the specific line-by-line replacements).

**WebSocket types (`src/api/ws/`):**
```bash
grep -rn "trigger_eval\|end_session\|TriggerEvalPayload\|EndSessionPayload\|EvaluationResultPayload\|PointTransitionPayload" src/
```
Remove all interface definitions, type union entries, handler code, and validation code for these.

**Frontend (`web/src/`):**
```bash
grep -rn "trigger_eval\|end_session\|triggerEvaluation\|endSession\|evaluation_result\|point_transition\|currentPointIndex" web/src/
```
Remove all references to deprecated message types and replace with new ones.

**Session Controls:**
```bash
grep -rn "I've got it\|trigger_eval\|Got It" web/src/
```
Remove the "I've got it!" button completely.

**Test files** — these reference deprecated concepts and must be updated:
- `tests/integration/session-engine-comprehensive.test.ts` — references `currentPointIndex` (5+), `point_started`/`point_completed` events
- `tests/integration/session-flow.test.ts` — references `currentPointIndex` (3)

### 12. Event Flow Diagrams (Inline Documentation)

Add these as JSDoc comments in `session-handler.ts` (at the top of the class or above the `handleEngineEvent` method) for reference by future developers:

**Normal recall flow:**
```
User speaks
  -> evaluator runs continuously (T06)
  -> point recalled
  -> engine emits recall_point_recalled
  -> handler sends recall_point_recalled WS message
  -> frontend: plays chime + fills circle (T11)
  -> engine updates prompt with unchecked points
  -> agent asks about next unchecked point
  -> handler streams response as assistant_chunk messages
```

**Rabbit hole flow:**
```
User goes on tangent
  -> detector fires (T09)
  -> engine emits rabbithole_detected
  -> frontend shows prompt ("Explore this tangent?")
  -> user clicks Explore
  -> client sends enter_rabbithole { rabbitholeEventId, topic }
  -> engine emits rabbithole_entered
  -> frontend transitions: hides progress (T11), shows rabbit hole UI
  -> messages route to rabbit hole agent
  -> evaluator still runs silently — any recalls buffered
  -> user clicks Return
  -> client sends exit_rabbithole
  -> engine emits rabbithole_exited (with pointsRecalledDuring count)
  -> frontend transitions back: shows progress, flushes buffered recalls
```

**Auto-end flow (T08):**
```
Last point recalled
  -> engine checks allPointsRecalled()
  -> if not in rabbit hole:
      engine emits session_complete_overlay
      -> frontend shows overlay with message + Continue/Done buttons
      -> user clicks Continue -> client sends dismiss_overlay -> overlay dismissed, chat continues
      -> user clicks Done -> client sends leave_session -> session paused
  -> if in rabbit hole:
      engine defers overlay until rabbithole_exited
      -> on exit: emits session_complete_overlay
```

### 13. Type Safety Verification

After all changes, verify TypeScript compilation catches any mismatches:

```bash
cd web && bun run build  # Frontend type check
cd .. && bun run typecheck  # Backend type check (or equivalent command)
```

Ensure that:
- `SessionEventData` is a discriminated union on `type`
- `ServerMessage` is a discriminated union on `type`
- `ClientMessage` is a discriminated union on `type`
- The `switch` statements in `session-handler.ts` and `use-session-websocket.ts` are exhaustive (no unhandled cases)

---

## Relevant Files

| Action | File | What Changes |
|--------|------|-------------|
| MODIFY | `src/core/session/types.ts` | Replace `SessionEventType` union (16 types: 4 kept, 3 removed, 12 added). Create `SessionCompletionSummary` interface. Create `SessionEventData` discriminated union. Update `SessionEvent.data` from `unknown` to `SessionEventData`. |
| MODIFY | `src/core/session/session-engine.ts` | Remove `emitEvent('point_started', ...)` at lines 470 and 814. Replace `emitEvent('point_evaluated', ...)` at line 691 with `recall_point_recalled` or `recall_point_near_miss`. Remove `emitEvent('point_completed', ...)` at line 785. Replace `emitEvent('point_evaluated', ...)` at line 1203 with `rabbithole_detected`. |
| MODIFY | `src/api/ws/types.ts` | Delete `TriggerEvalPayload`, `EndSessionPayload`, `EvaluationResultPayload`, `PointTransitionPayload`, `SessionSummary`. Update `SessionStartedPayload` (remove `currentPointIndex`, add `recalledCount`). Update `SessionCompletePayload` to use `SessionCompletionSummary`. Add 9 new payload interfaces. Replace `ServerMessage` union (15 types). Replace `ClientMessage` union (7 types). Replace `CLIENT_MESSAGE_TYPES` array. Update `parseClientMessage()` to validate `enter_rabbithole` fields and reject `trigger_eval`/`end_session`. |
| MODIFY | `src/api/ws/session-handler.ts` | **CRITICAL**: Wire `engine.setEventListener()` after engine creation. Add `handleEngineEvent()` method with exhaustive switch over all 16 event types. Remove `handleTriggerEval()` method and `case 'trigger_eval'`. Remove `handleEndSession()` method and `case 'end_session'`. Add `handleLeaveSession()`, `handleEnterRabbithole()`, `handleExitRabbithole()`, `handleDeclineRabbithole()`, `handleDismissOverlay()` methods. Update exhaustiveness check. Update `session_started` send to use `recalledCount` instead of `currentPointIndex`. Add event flow JSDoc comments. |
| MODIFY | `src/api/ws/index.ts` | Remove exports: `TriggerEvalPayload`, `EndSessionPayload`, `EvaluationResultPayload`, `PointTransitionPayload`, `SessionSummary`. Add exports for all new payload interfaces. |
| MODIFY | `web/src/hooks/use-session-websocket.ts` | Replace `ServerMessage` type (remove `evaluation_result`, `point_transition`; add all new types). Reconcile `SessionCompleteSummary` field names (`pointsAttempted` -> `totalPointsReviewed`, `pointsSuccessful` -> `successfulRecalls`, add new fields). Add state variables: `recalledCount`, `totalPoints`, `isInRabbithole`, `rabbitholeLabels`, `rabbitholePrompt`, `completionOverlay`, `sessionImages`, `pendingRecallAnimations`. Add handler cases for all new server message types. Remove `triggerEvaluation` (line 526), `endSession` (line 534). Add `leaveSession`, `enterRabbithole`, `exitRabbithole`, `declineRabbithole`, `dismissOverlay` action functions. |
| MODIFY | `web/src/components/live-session/SessionContainer.tsx` | Wire all new hook state/actions to child components. Remove `triggerEvaluation`/`endSession` references. |
| MODIFY | `web/src/components/live-session/SessionControls.tsx` | Remove "I've got it!" button. Change "End Session" to "Leave Session" wired to `leaveSession()`. |
| MODIFY | `src/llm/prompts/socratic-tutor.ts` | Add `## CRITICAL: UI-Handled Content — Do NOT Generate` safety instruction at end of system prompt. |
| AUDIT | `tests/integration/session-engine-comprehensive.test.ts` | Update references to `currentPointIndex`, `point_started`, `point_completed` events. |
| AUDIT | `tests/integration/session-flow.test.ts` | Update references to `currentPointIndex`. |
| AUDIT | All files in `src/core/session/`, `src/api/ws/`, `web/src/` | Search and remove all references to deprecated event types, message types, and handlers. |

---

## Success Criteria

1. **Complete event catalog**: `SessionEventType` in `types.ts` contains exactly these 16 types: `session_started`, `session_paused`, `session_complete_overlay`, `session_completed`, `recall_point_recalled`, `recall_point_near_miss`, `rabbithole_detected`, `rabbithole_entered`, `rabbithole_exited`, `rabbithole_declined`, `show_image`, `show_resource`, `user_message`, `assistant_message`, `assistant_streaming_start`, `assistant_streaming_end`. No others.
2. **Typed event data**: `SessionEventData` is a discriminated union with a payload variant for each `SessionEventType`. `SessionEvent.data` uses `SessionEventData` instead of `unknown`.
3. **`SessionCompletionSummary` exists**: The type is defined in `src/core/session/types.ts` with fields: `sessionId`, `totalPointsReviewed`, `successfulRecalls`, `recallRate`, `durationMs`, `rabbitholeCount`, `recalledPointIds`, `engagementScore`, `estimatedCostUsd`.
4. **Deprecated events removed**: `point_started`, `point_evaluated`, `point_completed` do not appear in `SessionEventType`. No code emits these events. `grep -rn "point_started\|point_evaluated\|point_completed" src/` returns zero results (outside of comments or changelogs).
5. **Deprecated emitEvent calls updated**: Lines 470, 691, 785, 814, 1203 of `session-engine.ts` no longer emit `point_started`, `point_evaluated`, or `point_completed`. Replaced with new event types or removed entirely as specified in step 4.
6. **ServerMessage complete**: `ServerMessage` union in `ws/types.ts` includes payloads for: `session_started`, `assistant_chunk`, `assistant_complete`, `recall_point_recalled`, `recall_point_near_miss`, `rabbithole_detected`, `rabbithole_entered`, `rabbithole_exited`, `session_complete_overlay`, `session_paused`, `show_image`, `show_resource`, `session_complete`, `error`, `pong`.
7. **Deprecated server messages removed**: `EvaluationResultPayload` and `PointTransitionPayload` interfaces are deleted. They do not appear in the `ServerMessage` union.
8. **ClientMessage complete**: `ClientMessage` union includes: `user_message`, `leave_session`, `enter_rabbithole`, `exit_rabbithole`, `decline_rabbithole`, `dismiss_overlay`, `ping`. No others.
9. **Deprecated client messages removed**: `trigger_eval` and `end_session` do not appear in `ClientMessage`, `CLIENT_MESSAGE_TYPES`, or `parseClientMessage()`. `grep -rn "trigger_eval\|TriggerEvalPayload" src/` returns zero results. `grep -rn "'end_session'\|EndSessionPayload" src/` returns zero results (outside of git history comments).
10. **Event listener wired**: `session-handler.ts` calls `engine.setEventListener()` after engine creation and before/after `startSession()`. The `handleEngineEvent()` method exists with an exhaustive switch over all `SessionEventData` variants.
11. **Engine-to-WS wiring**: Every event type in `SessionEventType` that is client-relevant has a corresponding case in `handleEngineEvent()`. The handler translates the engine event to the appropriate `ServerMessage` and sends it.
12. **WS-to-frontend wiring**: Every `ServerMessage` type has a handler case in `use-session-websocket.ts`. Each handler updates the appropriate React state.
13. **Frontend actions**: The hook exposes `leaveSession`, `enterRabbithole`, `exitRabbithole`, `declineRabbithole`, `dismissOverlay` functions. It does NOT expose `triggerEvaluation` or `endSession`.
14. **No "I've got it!" button**: `SessionControls.tsx` does not render a button that triggers evaluation. The manual evaluation trigger is completely gone.
15. **"Leave Session" button**: `SessionControls.tsx` renders "Leave Session" (not "End Session") and wires to `leaveSession()`.
16. **Field name reconciliation**: Server `SessionSummary`/`SessionCompletionSummary` and frontend `SessionCompleteSummary` use consistent field names: `totalPointsReviewed` (not `pointsAttempted`), `successfulRecalls` (not `pointsSuccessful`). Both sides updated.
17. **`currentPointIndex` removed**: The string `currentPointIndex` does not appear in any `ServerMessage` payload, `SessionStartedPayload`, or the `session_started` send in `session-handler.ts`. `grep -rn "currentPointIndex" src/api/ws/types.ts` returns zero results.
18. **`session_started` payload updated**: Uses `recalledCount: number` instead of `currentPointIndex: number`. Frontend handler reads `recalledCount` from the payload.
19. **LLM safety instruction**: The system prompt in `socratic-tutor.ts` contains the `## CRITICAL: UI-Handled Content — Do NOT Generate` block that explicitly prohibits: congratulatory text, progress updates, meta-commentary, praise, numbered summaries of covered points, and explicit point transitions.
20. **`parseClientMessage()` updated**: Rejects `trigger_eval` and `end_session` as `UNKNOWN_MESSAGE_TYPE`. Validates `enter_rabbithole` has non-empty `rabbitholeEventId: string` and `topic: string` fields. Accepts all new client message types.
21. **Barrel exports updated**: `src/api/ws/index.ts` no longer exports `TriggerEvalPayload`, `EndSessionPayload`, `EvaluationResultPayload`, `PointTransitionPayload`. Exports all new payload interfaces.
22. **Event flow documentation**: JSDoc comments in `session-handler.ts` document the three key event flows: normal recall, rabbit hole, and auto-end. Each flow traces the event from origin to final UI rendering.
23. **Graceful handling of unexpected event order**: If `rabbithole_exited` arrives before `rabbithole_entered` (shouldn't happen but could due to race conditions), the frontend does not crash. If `session_complete_overlay` arrives while in a rabbit hole, the overlay is deferred until exit.
24. **No regressions**: The app builds without errors in both `web/` and the backend. Existing functionality (connecting to a session, sending messages, receiving streamed responses) still works.
25. **Type safety**: The project compiles without TypeScript errors. All `switch` statements on event types are exhaustive.

---

## Implementation Warnings

> **WARNING: `setEventListener()` wiring is THE critical gap**
> `session-handler.ts` creates a `SessionEngine` (line 266) and calls `engine.startSession()` (line 277) but NEVER calls `engine.setEventListener()`. This means all engine events currently go nowhere. Step 5 of this spec is the most important change — without it, none of the event protocol works. The listener must be wired before OR after `startSession()` — the engine stores the listener and calls it on every `emitEvent()`.

> **WARNING: `EnterRabbitholePayload` must include `rabbitholeEventId` and `topic`**
> The `EnterRabbitholePayload` MUST include `rabbitholeEventId: string` and `topic: string` fields. The server handler (step 6) calls `engine.enterRabbithole(topic, eventId)` which requires both values. Without these fields in the client message, the handler has no way to call the engine correctly. The `parseClientMessage()` function MUST validate these fields are present.

> **WARNING: `RabbitholeExitedPayload` field reconciliation**
> T09's `exitRabbithole()` returns `{ completionPending: boolean }`. The `RabbitholeExitedPayload` WS message uses `{ label, pointsRecalledDuring, completionPending }`. The session handler must translate: read the label from the engine's rabbit hole state before exit, and compute `pointsRecalledDuring` by comparing recalled counts before/after the rabbit hole. If `completionPending` is true, the handler should also expect the engine to emit a `session_complete_overlay` event after the `rabbithole_exited` event.

> **WARNING: `SessionCompletionSummary` type does not exist**
> The `session_completed` event data references `SessionCompletionSummary` but this type is not defined anywhere in the codebase. It MUST be created in `src/core/session/types.ts` as specified in step 1a. The old `SessionSummary` in `ws/types.ts` must be removed and replaced by this new type.

> **WARNING: `parseClientMessage()` must validate `enter_rabbithole` fields**
> Since `enter_rabbithole` now includes `rabbitholeEventId` and `topic` fields, the `parseClientMessage()` function must validate that these fields are present and are strings. Without validation, a malformed client message could cause the handler to call `engine.enterRabbithole(undefined, undefined)`.

> **WARNING: Event name consistency between engine and WS**
> The engine emits events using `SessionEventType` names (e.g., `'recall_point_recalled'`). The WS server messages use their own `type` field. In this spec they are kept consistent — the engine event type `'recall_point_recalled'` maps to the WS message type `'recall_point_recalled'`. The only exception is `session_completed` (engine) mapping to `session_complete` (WS) — this preserves backward compatibility with the existing `SessionCompletePayload` type name. All tasks (T01-T12) that emit events MUST use the exact `SessionEventType` names defined in step 1.

> **WARNING: Test files must be updated**
> `tests/integration/session-engine-comprehensive.test.ts` references `currentPointIndex` (5+ occurrences) and `point_started`/`point_completed` events. `tests/integration/session-flow.test.ts` references `currentPointIndex` (3 occurrences). Both files must be updated to use the new event types and checklist-based tracking.
