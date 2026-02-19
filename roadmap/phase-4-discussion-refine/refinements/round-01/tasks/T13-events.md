# T13 — Structured Events Protocol

| Field | Value |
|-------|-------|
| **name** | Structured Events Protocol |
| **parallel-group** | E (final — depends on all other tasks) |
| **depends-on** | T01 (Checklist), T02 (Universal Agent), T03 (Transcription), T04 (Resources), T05 (Rename), T06 (Evaluator), T07 (Tone), T08 (Auto-End), T09 (Rabbit Holes), T10 (Voice), T11 (Progress), T12 (not yet defined) |

---

## Description

Define and implement the complete structured event protocol that governs all communication between the session engine, WebSocket server, and frontend. This is the final integration task — it audits and codifies every event type introduced by all previous tasks, wires them end-to-end, removes deprecated event types, and adds a safety instruction to the LLM prompt to prevent the agent from generating text that duplicates what the UI already handles through events.

After this task, the entire system operates on a typed, exhaustive event protocol. Every user-visible state change (recall feedback, rabbit hole transitions, session completion, image display) is driven by structured events, NOT by LLM-generated text. The agent's text responses are limited to questions, hints, explanations, and brief acknowledgments.

---

## Detailed Implementation

### 1. Complete Event Catalog — Engine Events (`src/core/session/types.ts`)

Replace the current `SessionEventType` union with the complete, exhaustive catalog. The current definition (lines 51-58 of `types.ts`):

```typescript
// CURRENT (to be replaced):
export type SessionEventType =
  | 'session_started'
  | 'point_started'
  | 'user_message'
  | 'assistant_message'
  | 'point_evaluated'
  | 'point_completed'
  | 'session_completed';
```

**New definition:**

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
 * 1. Add a corresponding ServerMessage payload in src/api/ws/types.ts
 * 2. Handle it in src/api/ws/session-handler.ts
 * 3. Handle it in web/src/hooks/use-session-websocket.ts
 * 4. Render it in the appropriate frontend component
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

**Update the `SessionEvent` interface** to use typed event data instead of `data: unknown`:

```typescript
/**
 * Typed event data payloads for each SessionEventType.
 * Using a discriminated union ensures type safety at every handler.
 */
export type SessionEventData =
  | { type: 'session_started'; sessionId: string; recallSetName: string; totalPoints: number }
  | { type: 'session_paused'; sessionId: string; recalledCount: number; totalPoints: number }
  | { type: 'session_complete_overlay'; message: string; recalledCount: number; totalPoints: number; durationMs: number }
  // NOTE: SessionCompletionSummary must be defined as a type — it does not currently exist.
  // Define it alongside SessionEventData:
  //   interface SessionCompletionSummary {
  //     sessionId: string;
  //     recalledCount: number;
  //     totalPoints: number;
  //     durationMs: number;
  //     rabbitholeCount: number;
  //     recalledPointIds: string[];
  //   }
  | { type: 'session_completed'; sessionId: string; summary: SessionCompletionSummary }
  | { type: 'recall_point_recalled'; pointId: string; pointIndex: number; recalledCount: number; totalPoints: number }
  | { type: 'recall_point_near_miss'; pointId: string; feedback: string }
  | { type: 'rabbithole_detected'; topic: string; label: string; triggerMessageContent: string }
  | { type: 'rabbithole_entered'; topic: string; label: string }
  // NOTE: T09's exitRabbithole() returns { completionPending: boolean }. The WS payload
  // translates this to { label, pointsRecalledDuring } for the frontend (T11 needs the count).
  // The session handler must compute pointsRecalledDuring from the engine state during the exit.
  | { type: 'rabbithole_exited'; label: string; pointsRecalledDuring: number }
  | { type: 'rabbithole_declined'; topic: string }
  | { type: 'show_image'; resourceId: string; url: string; caption?: string; mimeType?: string }
  | { type: 'show_resource'; resourceId: string; title: string; snippet: string }
  | { type: 'user_message'; content: string; tokenCount?: number }
  | { type: 'assistant_message'; content: string; tokenCount?: number }
  | { type: 'assistant_streaming_start' }
  | { type: 'assistant_streaming_end'; fullContent: string; totalChunks: number };

/**
 * A session event with typed payload.
 */
export interface SessionEvent {
  type: SessionEventType;
  data: SessionEventData;
  timestamp: Date;
}
```

### 2. Complete ServerMessage Union (`src/api/ws/types.ts`)

Replace the current `ServerMessage` union type (lines 257-265) with the complete set. Each event type from step 1 that is relevant to the client gets a corresponding server message payload.

**New payload interfaces to ADD** (keep existing `AssistantChunkPayload`, `ErrorPayload`, `PongPayload`):

```typescript
/**
 * Sent when a recall point is checked off by the continuous evaluator.
 * The frontend uses this to trigger progress animation + sound.
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
 */
export interface RabbitholeExitedPayload {
  type: 'rabbithole_exited';
  label: string;
  pointsRecalledDuring: number;  // how many points were recalled during the rabbit hole
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

**Payload interfaces to REMOVE:**
- `EvaluationResultPayload` — replaced by `RecallPointRecalledPayload` and `RecallPointNearMissPayload`
- `PointTransitionPayload` — replaced by checklist model from T01; there is no linear "transition" anymore

**Updated `SessionStartedPayload`:**
```typescript
export interface SessionStartedPayload {
  type: 'session_started';
  sessionId: string;
  openingMessage: string;
  totalPoints: number;       // keep
  recalledCount: number;     // new: 0 for fresh session, >0 for resumed session
  // REMOVED: currentPointIndex — no longer meaningful
}
```

**Updated `ServerMessage` union:**
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

Replace the current `ClientMessage` union (lines 100-104) and `CLIENT_MESSAGE_TYPES` (lines 109-114):

**New definition:**
```typescript
export interface UserMessagePayload {
  type: 'user_message';
  content: string;
}

/**
 * User wants to leave the session. Replaces the old 'end_session'.
 * The session is PAUSED (not abandoned) — state is preserved for later resumption.
 */
export interface LeaveSessionPayload {
  type: 'leave_session';
}

/**
 * User accepts the rabbit hole prompt and wants to explore the tangent.
 */
// NOTE: This payload MUST include rabbitholeEventId so the server can link the entry
// to the detected rabbithole event. The topic is also needed for the engine's enterRabbithole() call.
// Without these fields, the server handler cannot call engine.enterRabbithole(topic, eventId).
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

export interface PingPayload {
  type: 'ping';
}

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

**REMOVED client messages:**
- `trigger_eval` — removed in T06. Evaluation is continuous; no manual trigger.
- `end_session` — replaced by `leave_session` in T08.

Also update `parseClientMessage()` function (lines 325-381) to handle the new message types. In particular, add validation that `user_message` has a `content` field (already done) and that other message types don't require additional fields.

### 4. Event Wiring in `session-handler.ts` (`src/api/ws/session-handler.ts`)

The `WebSocketSessionHandler` bridges `SessionEngine` events to WebSocket messages. Audit the event listener setup and ensure ALL new event types are handled:

```typescript
// Inside the session engine event listener setup:
engine.setEventListener((event: SessionEvent) => {
  switch (event.data.type) {
    case 'session_started':
      this.send(ws, {
        type: 'session_started',
        sessionId: event.data.sessionId,
        openingMessage: '', // populated separately during session start flow
        totalPoints: event.data.totalPoints,
        recalledCount: 0,
      });
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
      });
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

    // user_message and assistant_message events are handled by existing message flow
    // (user messages come from the client; assistant messages are streamed as chunks)
  }
});
```

**Client message handling**: Update the `handleClientMessage()` method to handle new client message types:

```typescript
switch (message.type) {
  case 'user_message':
    await this.handleUserMessage(ws, message.content);
    break;

  case 'leave_session':
    await this.handleLeaveSession(ws);
    break;

  // NOTE: enter_rabbithole includes rabbitholeEventId and topic in the payload
  case 'enter_rabbithole':
    await this.handleEnterRabbithole(ws, message.rabbitholeEventId, message.topic);
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
    this.send(ws, { type: 'pong', timestamp: Date.now() });
    break;
}
```

**Remove handlers for deleted client messages:**
- Remove `handleTriggerEval()` method and any references to `trigger_eval`
- Remove `handleEndSession()` method (replaced by `handleLeaveSession()`)

### 5. Frontend Event Handling (`web/src/hooks/use-session-websocket.ts`)

Update the `ServerMessage` type definition in the hook (lines 64-72) to match the new server message types from step 2.

Add handlers in the message processing switch for all new server message types:

```typescript
// State to add/update in the hook:
const [recalledCount, setRecalledCount] = useState(0);
const [totalPoints, setTotalPoints] = useState(0);
const [isInRabbithole, setIsInRabbithole] = useState(false);
const [rabbitholeLabels, setRabbitholeLabels] = useState<string[]>([]);
const [rabbitholePrompt, setRabbitholePrompt] = useState<{ topic: string; label: string } | null>(null);
const [completionOverlay, setCompletionOverlay] = useState<SessionCompleteOverlayPayload | null>(null);
const [sessionImages, setSessionImages] = useState<ShowImagePayload[]>([]);
const [pendingRecallAnimations, setPendingRecallAnimations] = useState(0);

// Message handler additions:
case 'recall_point_recalled':
  if (isInRabbithole) {
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

**Update the `ClientMessage` type** in the hook to match the new client message types:
```typescript
export type ClientMessage =
  | { type: 'user_message'; content: string }
  | { type: 'leave_session' }
  | { type: 'enter_rabbithole' }
  | { type: 'exit_rabbithole' }
  | { type: 'decline_rabbithole' }
  | { type: 'dismiss_overlay' }
  | { type: 'ping' };
```

**Remove:**
- `triggerEvaluation` function (was for `trigger_eval`)
- `endSession` function (replaced by `leaveSession`)

**Add new action functions:**
```typescript
const leaveSession = useCallback(() => {
  sendMessage({ type: 'leave_session' });
}, [sendMessage]);

const enterRabbithole = useCallback(() => {
  sendMessage({ type: 'enter_rabbithole' });
}, [sendMessage]);

const exitRabbithole = useCallback(() => {
  sendMessage({ type: 'exit_rabbithole' });
}, [sendMessage]);

const declineRabbithole = useCallback(() => {
  sendMessage({ type: 'decline_rabbithole' });
}, [sendMessage]);

const dismissOverlay = useCallback(() => {
  sendMessage({ type: 'dismiss_overlay' });
  setCompletionOverlay(null);
}, [sendMessage]);
```

Return all new state and action functions from the hook.

### 6. Frontend Component Integration

**SessionContainer.tsx**: Orchestrate all event-driven UI:
- Pass `recalledCount`, `totalPoints`, `isInRabbithole`, `rabbitholeLabels` to `SessionProgress`
- Show rabbit hole prompt UI when `rabbitholePrompt` is non-null
- Show completion overlay when `completionOverlay` is non-null
- Show images inline when `sessionImages` has entries
- Remove any references to `triggerEvaluation` or `endSession` callbacks

**SessionControls.tsx**:
- Remove the "I've got it!" button (evaluation is continuous from T06)
- Change "End Session" to "Leave Session" and wire to `leaveSession()` instead of `endSession()`

### 7. LLM Text Cleanup — Safety Instruction

Add a final safety instruction to the agent system prompt in `src/llm/prompts/socratic-tutor.ts`. This instruction prevents the LLM from generating text that duplicates what the UI handles through events.

**Add to the end of the system prompt** (after all other instructions):

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

**Verify prompt changes from T02 and T07** are compatible. The safety instruction should not contradict the tone guidelines from T07 — it complements them by specifying what the agent should NOT say, while T07 specifies the style of what it SHOULD say.

### 8. Audit — Remove All Deprecated Event References

Search the entire codebase for references to removed/deprecated event types and message types. Remove or update each:

**Engine-side:**
```bash
grep -rn "point_started\|point_evaluated\|point_completed" src/
```
Remove any code that emits these events. Replace with the new event types where appropriate.

**WebSocket types:**
```bash
grep -rn "trigger_eval\|end_session\|TriggerEvalPayload\|EndSessionPayload\|EvaluationResultPayload\|PointTransitionPayload" src/
```
Remove all interface definitions, type union entries, handler code, and validation code for these.

**Frontend:**
```bash
grep -rn "trigger_eval\|end_session\|triggerEvaluation\|endSession\|evaluation_result\|point_transition\|currentPointIndex" web/src/
```
Remove all references to deprecated message types and replace with new ones.

**Session Controls:**
```bash
grep -rn "I've got it\|trigger_eval\|Got It" web/src/
```
Remove the "I've got it!" button completely.

### 9. Event Flow Diagrams (Inline Documentation)

Add these as JSDoc comments in `session-handler.ts` for reference by future developers:

**Normal recall flow:**
```
User speaks
  → evaluator runs continuously (T06)
  → point recalled
  → engine emits recall_point_recalled
  → handler sends recall_point_recalled WS message
  → frontend: plays chime + fills circle (T11)
  → engine updates prompt with unchecked points
  → agent asks about next unchecked point
  → handler streams response as assistant_chunk messages
```

**Rabbit hole flow:**
```
User goes on tangent
  → detector fires (T09)
  → engine emits rabbithole_detected
  → frontend shows prompt ("Explore this tangent?")
  → user clicks Explore
  → client sends enter_rabbithole
  → engine emits rabbithole_entered
  → frontend transitions: hides progress (T11), shows rabbit hole UI
  → messages route to rabbit hole agent
  → evaluator still runs silently — any recalls buffered
  → user clicks Return
  → client sends exit_rabbithole
  → engine emits rabbithole_exited (with pointsRecalledDuring count)
  → frontend transitions back: shows progress, flushes buffered recalls
```

**Auto-end flow (T08):**
```
Last point recalled
  → engine checks allPointsRecalled()
  → if not in rabbit hole:
      engine emits session_complete_overlay
      → frontend shows overlay with message + Continue/Done buttons
      → user clicks Continue → client sends dismiss_overlay → overlay dismissed, chat continues
      → user clicks Done → client sends leave_session → session paused
  → if in rabbit hole:
      engine defers overlay until rabbithole_exited
      → on exit: emits session_complete_overlay
```

### 10. Type Safety Verification

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
| MODIFY | `src/core/session/types.ts` | Replace `SessionEventType` union with complete catalog. Add `SessionEventData` discriminated union. Update `SessionEvent` to use typed data. Remove `EVALUATION_TRIGGER_PHRASES` (if not already done by T06). Remove deprecated event types. |
| MODIFY | `src/api/ws/types.ts` | Replace `ServerMessage` and `ClientMessage` unions with complete catalogs. Add all new payload interfaces. Remove `TriggerEvalPayload`, `EndSessionPayload`, `EvaluationResultPayload`, `PointTransitionPayload`. Update `SessionStartedPayload`. Update `CLIENT_MESSAGE_TYPES`. Update `parseClientMessage()`. |
| MODIFY | `src/api/ws/session-handler.ts` | Wire all engine events to WS messages. Handle all new client message types. Remove `handleTriggerEval()`, `handleEndSession()`. Add `handleLeaveSession()`, `handleEnterRabbithole()`, `handleExitRabbithole()`, `handleDeclineRabbithole()`, `handleDismissOverlay()`. Add event flow JSDoc comments. |
| MODIFY | `web/src/hooks/use-session-websocket.ts` | Handle all new server message types. Add state for `recalledCount`, `rabbitholeLabels`, `isInRabbithole`, `rabbitholePrompt`, `completionOverlay`, `sessionImages`. Add action functions: `leaveSession`, `enterRabbithole`, `exitRabbithole`, `declineRabbithole`, `dismissOverlay`. Remove `triggerEvaluation`, `endSession`. Update `ServerMessage` and `ClientMessage` types. |
| MODIFY | `web/src/components/live-session/SessionContainer.tsx` | Wire all new hook state/actions to child components. Remove `triggerEvaluation`/`endSession` references. |
| MODIFY | `web/src/components/live-session/SessionControls.tsx` | Remove "I've got it!" button. Change "End Session" to "Leave Session". |
| MODIFY | `src/llm/prompts/socratic-tutor.ts` | Add safety instruction at end of system prompt preventing LLM from generating praise, progress updates, or meta-commentary. |
| AUDIT | All files in `src/core/session/`, `src/api/ws/`, `web/src/` | Search and remove all references to deprecated event types, message types, and handlers. |

---

## Success Criteria

1. **Complete event catalog**: `SessionEventType` in `types.ts` contains exactly these types: `session_started`, `session_paused`, `session_complete_overlay`, `session_completed`, `recall_point_recalled`, `recall_point_near_miss`, `rabbithole_detected`, `rabbithole_entered`, `rabbithole_exited`, `rabbithole_declined`, `show_image`, `show_resource`, `user_message`, `assistant_message`, `assistant_streaming_start`, `assistant_streaming_end`. No others.
2. **Typed event data**: `SessionEventData` is a discriminated union with a payload type for each `SessionEventType`. `SessionEvent.data` uses this type instead of `unknown`.
3. **Deprecated events removed**: `point_started`, `point_evaluated`, `point_completed` do not appear in `SessionEventType`. No code emits these events. `grep -rn "point_started\|point_evaluated\|point_completed" src/` returns zero results (outside of comments or changelogs).
4. **ServerMessage complete**: `ServerMessage` union in `ws/types.ts` includes payloads for: `session_started`, `assistant_chunk`, `assistant_complete`, `recall_point_recalled`, `recall_point_near_miss`, `rabbithole_detected`, `rabbithole_entered`, `rabbithole_exited`, `session_complete_overlay`, `session_paused`, `show_image`, `show_resource`, `session_complete`, `error`, `pong`.
5. **Deprecated server messages removed**: `EvaluationResultPayload` and `PointTransitionPayload` interfaces are deleted. They do not appear in the `ServerMessage` union.
6. **ClientMessage complete**: `ClientMessage` union includes: `user_message`, `leave_session`, `enter_rabbithole`, `exit_rabbithole`, `decline_rabbithole`, `dismiss_overlay`, `ping`. No others.
7. **Deprecated client messages removed**: `trigger_eval` and `end_session` do not appear in `ClientMessage`, `CLIENT_MESSAGE_TYPES`, or `parseClientMessage()`. `grep -rn "trigger_eval\|TriggerEvalPayload" src/` returns zero results. `grep -rn "'end_session'\|EndSessionPayload" src/` returns zero results (outside of git history comments).
8. **Engine-to-WS wiring**: Every event type in `SessionEventType` that is client-relevant has a corresponding case in the session handler's event listener. The handler translates the engine event to the appropriate `ServerMessage` and sends it.
9. **WS-to-frontend wiring**: Every `ServerMessage` type has a handler case in `use-session-websocket.ts`. Each handler updates the appropriate React state.
10. **Frontend actions**: The hook exposes `leaveSession`, `enterRabbithole`, `exitRabbithole`, `declineRabbithole`, `dismissOverlay` functions. It does NOT expose `triggerEvaluation` or `endSession`.
11. **No "I've got it!" button**: `SessionControls.tsx` does not render a button that triggers evaluation. The manual evaluation trigger is completely gone.
12. **"Leave Session" button**: `SessionControls.tsx` renders "Leave Session" (not "End Session") and wires to `leaveSession()`.
13. **LLM safety instruction**: The system prompt in `socratic-tutor.ts` contains the safety instruction that explicitly prohibits: congratulatory text, progress updates, meta-commentary, praise, numbered summaries of covered points, and explicit point transitions.
14. **No LLM-generated praise**: After the safety instruction, the LLM should never generate: "Great job!", "Well done!", "Excellent!", "Perfect!", "Correct!", "You've recalled X out of Y", "Let's move to the next point", or any similar UI-handled content. (Verified by prompt review, not automated test.)
15. **Type safety**: The project compiles without TypeScript errors. All `switch` statements on event types are exhaustive (no `default` case needed for unhandled types in the discriminated unions).
16. **`currentPointIndex` removed**: The string `currentPointIndex` does not appear in any `ServerMessage` payload, `SessionStartedPayload`, or `PointTransitionPayload`. `grep -rn "currentPointIndex" src/api/ws/types.ts` returns zero results.
17. **Event flow documentation**: JSDoc comments in `session-handler.ts` document the three key event flows: normal recall, rabbit hole, and auto-end. Each flow traces the event from origin to final UI rendering.
18. **Graceful handling of unexpected event order**: If `rabbithole_exited` arrives before `rabbithole_entered` (shouldn't happen but could due to race conditions), the frontend does not crash. If `session_complete_overlay` arrives while in a rabbit hole, the overlay is deferred until exit.
19. **parseClientMessage updated**: The `parseClientMessage()` function correctly parses all new client message types and rejects the old ones (`trigger_eval`, `end_session`) as `UNKNOWN_MESSAGE_TYPE`.
20. **No regressions**: The app builds without errors in both `web/` and the backend. Existing functionality (connecting to a session, sending messages, receiving streamed responses) still works.

---

## Implementation Warnings

> **WARNING: `EnterRabbitholePayload` must include `rabbitholeEventId` and `topic`**
> Section 3 originally defined `EnterRabbitholePayload` as `{ type: 'enter_rabbithole' }` with no additional fields. But the server handler (section 4) calls `engine.enterRabbithole(topic, eventId)` which requires both `topic` and `rabbitholeEventId`. Without these fields in the client message, the handler has no way to call the engine correctly. T09's section 8 correctly includes these fields — T13's definition has been corrected above to match.

> **WARNING: `RabbitholeExitedPayload` field reconciliation**
> T09's `exitRabbithole()` returns `{ completionPending: boolean }`. The `RabbitholeExitedPayload` server message uses `{ label, pointsRecalledDuring }` — different fields. The session handler must translate: read the label from the engine's rabbit hole state before exit, and compute `pointsRecalledDuring` by comparing recalled counts before/after the rabbit hole. If `completionPending` is true, the handler should also emit a `session_complete_overlay` event.

> **WARNING: `SessionCompletionSummary` type does not exist**
> The `session_completed` event data references `SessionCompletionSummary` but this type is not defined anywhere in the codebase. It must be defined alongside `SessionEventData` in `src/core/session/types.ts`. A suggested definition has been added as a comment in the code above.

> **WARNING: `parseClientMessage()` must validate `enter_rabbithole` fields**
> Since `enter_rabbithole` now includes `rabbitholeEventId` and `topic` fields, the `parseClientMessage()` function must validate that these fields are present and are strings. Without validation, a malformed client message could cause the handler to call `engine.enterRabbithole(undefined, undefined)`.

> **WARNING: Event name consistency between engine and WS**
> The engine emits events using `SessionEventType` names (e.g., `'recall_point_recalled'`). The WS server messages use their own `type` field. These may or may not match. T01 emits `'point_recalled'` but T13 defines the WS type as `'recall_point_recalled'`. Ensure the session handler's event listener translates between these names. The handler code in section 4 maps `'recall_point_recalled'` engine events to `'recall_point_recalled'` WS messages — this requires T01 to also use this name, or the handler must translate.
