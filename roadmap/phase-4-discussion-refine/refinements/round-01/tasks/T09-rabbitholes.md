# T09 — Rabbit Holes as Separate UX Mode

| Field | Value |
|-------|-------|
| **name** | Rabbit Holes as Separate UX Mode |
| **parallel-group** | C (wave 3) |
| **depends-on** | T06 (Continuous Evaluator with Feedback Field) |

---

## Description

Transform rabbit holes from a detection-and-redirect mechanism into a first-class UX mode with a separate LLM context, visual transitions, and a distinct agent personality. Currently, `RabbitholeDetector` detects tangents and the tutor is told to redirect. After this task, detected rabbit holes become an opt-in experience: the user is prompted, and if they accept, a completely separate `RabbitholeAgent` takes over with its own conversation history, system prompt, and personality. The main recall session freezes until the user returns.

**Key architectural distinction:**
- `RabbitholeDetector` (existing, `src/core/analysis/rabbithole-detector.ts`) = **detection only**. It analyzes conversations to identify tangents and returns. This class is NOT modified for detection logic.
- `RabbitholeAgent` (new, `src/core/session/rabbithole-agent.ts`) = **UX mode management**. It handles the conversation within a rabbit hole once the user opts in: owns the sub-conversation, generates responses, and manages its own LLM context. It does NOT duplicate detection logic.

Detection still happens automatically (via `RabbitholeDetector`), but instead of silently recording the event and emitting a misleading `'point_evaluated'` event (the current behavior at `session-engine.ts` line 1203), the engine now emits a `'rabbithole_detected'` event. The WebSocket handler forwards this to the client as a prompt. The user's response (enter/decline) triggers the new UX path.

The evaluator (from T06) continues to run silently during rabbit holes in `'rabbithole'` mode — it tags recall points as recalled if the user demonstrates knowledge, but provides no steering feedback to the rabbit hole agent.

---

## Detailed Implementation

### 1. RabbitholeAgent class (NEW: `src/core/session/rabbithole-agent.ts`)

Create a new class that manages a self-contained LLM conversation for a rabbit hole exploration.

**CRITICAL: The `RabbitholeAgent` MUST create its own dedicated `AnthropicClient` instance.** The `AnthropicClient` stores its system prompt as a private instance field (`systemPrompt` at line 56 of `src/llm/client.ts`). The `setSystemPrompt()` method (line 114) mutates this field, and `complete()` (line 149) always sends `system: this.systemPrompt` (line 168). There is NO per-call system prompt override. If the agent reuses the session's client and calls `setSystemPrompt()`, it will overwrite the Socratic tutor prompt, corrupting the main session. See cross-task issue #1.

```typescript
import { AnthropicClient } from '../../llm/client';

/**
 * Represents a single message in the rabbit hole conversation.
 * Stored separately from the main session messages.
 */
interface RabbitholeMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * RabbitholeAgent manages a separate LLM conversation context for exploring
 * tangential topics that arise during recall sessions. It has its own
 * dedicated AnthropicClient instance, conversation history, and personality
 * distinct from the recall tutor.
 *
 * This agent handles ONLY the conversation within an active rabbit hole.
 * Detection of rabbit holes is handled by RabbitholeDetector (separate class).
 *
 * Lifecycle:
 * 1. Created when user opts into a detected rabbit hole
 * 2. Receives user messages and generates exploratory responses
 * 3. Destroyed when user exits — conversation stored in DB for analysis
 */
export class RabbitholeAgent {
  /**
   * Dedicated LLM client for this rabbit hole agent.
   * MUST be a separate instance from the session's client to avoid
   * corrupting the Socratic tutor's system prompt.
   */
  private llmClient: AnthropicClient;

  /** Conversation history for this rabbit hole — completely independent of main session */
  private messages: RabbitholeMessage[] = [];

  /** The tangential topic being explored */
  private topic: string;

  constructor(params: {
    topic: string;
    recallSetName: string;
    recallSetDescription: string;
  }) {
    this.topic = params.topic;

    // Create a DEDICATED AnthropicClient instance for this agent.
    // Do NOT accept or reuse the session's client — that would corrupt
    // the Socratic tutor's system prompt when we call setSystemPrompt().
    this.llmClient = new AnthropicClient();
    this.llmClient.setSystemPrompt(
      buildRabbitholeAgentPrompt(
        params.topic,
        params.recallSetName,
        params.recallSetDescription
      )
    );
  }

  /**
   * Generates a response to a user message within the rabbit hole context.
   * The rabbit hole agent is exploratory and conversational — it follows
   * the user's curiosity, not a Socratic method.
   */
  async generateResponse(userMessage: string): Promise<string> {
    this.messages.push({ role: 'user', content: userMessage });

    // NOTE: AnthropicClient.complete() signature is:
    //   complete(messages: string | LLMMessage[], config?: LLMConfig): Promise<LLMResponse>
    // The system prompt was already set on this dedicated client in the constructor.
    const response = await this.llmClient.complete(this.messages);

    this.messages.push({ role: 'assistant', content: response.text });
    return response.text;
  }

  /**
   * Generates an opening message to kick off the rabbit hole exploration.
   * Called immediately after the user opts in, before they send a message.
   */
  async generateOpeningMessage(): Promise<string> {
    // System prompt was already set on the dedicated client in constructor
    const opening = await this.llmClient.complete([
      {
        role: 'user',
        content: `I'm curious about ${this.topic}. Tell me more.`,
      },
    ]);

    this.messages.push({
      role: 'user',
      content: `I'm curious about ${this.topic}. Tell me more.`,
    });
    this.messages.push({ role: 'assistant', content: opening.text });

    return opening.text;
  }

  /**
   * Returns the full conversation history for storage in the database
   * when the rabbit hole is exited.
   */
  getConversationHistory(): RabbitholeMessage[] {
    return [...this.messages];
  }

  /** Returns the topic being explored */
  getTopic(): string {
    return this.topic;
  }
}
```

### 2. Rabbit hole agent system prompt

Create `buildRabbitholeAgentPrompt()` in the same file (or in `src/llm/prompts/rabbithole-agent.ts` if prompt files are kept separate from agent files):

```
The user is exploring a tangent about "{topic}" that came up during a recall session on "{recallSetName}".

{recallSetDescription}

Be exploratory and conversational. Follow their curiosity. Go deep on whatever interests them.
You are NOT a Socratic tutor here — you're a curious conversation partner who knows about this topic.

Feel free to:
- Share interesting facts and connections
- Ask follow-up questions about what interests them
- Reference the broader context of {recallSetName} when relevant
- Make connections between {topic} and related ideas

Keep responses concise but information-dense. No bullet lists. Conversational tone.
Short paragraphs. If they ask a direct question, answer it directly — don't turn it into a Socratic exercise.
```

The tone is fundamentally different from the recall tutor:
- The recall tutor asks questions and never reveals answers
- The rabbit hole agent shares information freely and follows curiosity
- The recall tutor is direct and short (1-3 sentences)
- The rabbit hole agent can be slightly longer but still concise (no walls of text)

### 3. SessionEngine state changes (`src/core/session/session-engine.ts`)

Add new instance properties:

```typescript
/** Current session mode: 'recall' for normal flow, 'rabbithole' for tangent exploration */
private currentMode: 'recall' | 'rabbithole' = 'recall';

/** Active rabbit hole agent, if user is currently exploring a tangent */
private activeRabbitholeAgent: RabbitholeAgent | null = null;

/** The rabbithole event ID for the currently active rabbit hole (for DB updates on exit) */
private activeRabbitholeEventId: string | null = null;

/** The topic label for the current rabbit hole (from detection result's `topic` field) */
private activeRabbitholeTopic: string | null = null;

/**
 * Count of recall points checked off while in the current rabbit hole.
 * Reset on exit. Used in the rabbithole_exited payload.
 */
private rabbitholePointsRecalled: number = 0;

/**
 * When true, all recall points were recalled while in rabbit hole mode.
 * The completion overlay should wait until the user exits the rabbit hole.
 * (Integration point for T08 auto-end)
 */
private completionPendingAfterRabbithole: boolean = false;

/**
 * Number of messages to suppress rabbit hole detection after a decline.
 * Decremented on each message until 0, then detection resumes.
 */
private rabbitholeDeclineCooldown: number = 0;
```

### 4. Fix existing `detectAndRecordRabbithole()` event emission

The existing code at `session-engine.ts` line 1203 emits rabbithole detection as `'point_evaluated'` — this is semantically wrong. Change the detection flow to:

1. Add `'rabbithole_detected'` to `SessionEventType` in `src/core/session/types.ts`:
   ```typescript
   export type SessionEventType =
     | 'session_started'
     | 'point_started'
     | 'user_message'
     | 'assistant_message'
     | 'point_evaluated'
     | 'point_completed'
     | 'session_completed'
     | 'rabbithole_detected'    // NEW: rabbithole tangent detected
     | 'rabbithole_entered'     // NEW: user opted into rabbit hole
     | 'rabbithole_exited';     // NEW: user exited rabbit hole
   ```

2. In `detectAndRecordRabbithole()`, replace:
   ```typescript
   // BEFORE (wrong event type):
   this.emitEvent('point_evaluated', {
     pointId: currentPoint.id,
     rabbitholeDetected: true,
     rabbitholeId: rabbitholeEvent.id,
     rabbitholeTopic: rabbitholeEvent.topic,
   });
   ```
   With:
   ```typescript
   // AFTER (correct event type):
   this.emitEvent('rabbithole_detected', {
     topic: rabbitholeEvent.topic,
     rabbitholeEventId: rabbitholeEvent.id,
   });
   ```

3. Add the cooldown check at the top of `detectAndRecordRabbithole()`:
   ```typescript
   // Skip detection during decline cooldown
   if (this.rabbitholeDeclineCooldown > 0) {
     this.rabbitholeDeclineCooldown--;
     return;
   }
   ```

The key behavioral change: instead of silently recording the rabbithole and continuing, the engine now emits an event that the WebSocket handler forwards to the client as a prompt. The user must explicitly opt in before entering rabbit hole mode.

### 5. New SessionEngine methods

```typescript
/**
 * Enters rabbit hole mode. Freezes the main recall session context
 * and creates a new RabbitholeAgent with its own dedicated LLM client
 * and conversation history.
 *
 * Called when the user accepts a rabbit hole prompt after detection.
 *
 * @param topic - The tangential topic to explore (from RabbitholeDetectionResult.topic)
 * @param rabbitholeEventId - The ID of the detected rabbithole event (for DB linking)
 * @returns The rabbit hole agent's opening message
 */
async enterRabbithole(topic: string, rabbitholeEventId: string): Promise<string> {
  if (this.currentMode === 'rabbithole') {
    throw new Error('Already in a rabbit hole. Exit the current one before entering a new one.');
  }

  this.currentMode = 'rabbithole';
  this.activeRabbitholeEventId = rabbitholeEventId;
  this.activeRabbitholeTopic = topic;
  this.rabbitholePointsRecalled = 0;

  // NOTE: RabbitholeAgent creates its own dedicated AnthropicClient internally.
  // Do NOT pass this.llmClient — that would corrupt the session's Socratic tutor prompt.
  this.activeRabbitholeAgent = new RabbitholeAgent({
    topic,
    // NOTE: The property is this.currentRecallSet, NOT this.recallSet
    recallSetName: this.currentRecallSet!.name,
    recallSetDescription: this.currentRecallSet!.description,
  });

  // Emit rabbithole_entered event for WS handler
  this.emitEvent('rabbithole_entered', {
    topic,
    rabbitholeEventId,
  });

  // Generate an opening message from the rabbit hole agent
  const openingMessage = await this.activeRabbitholeAgent.generateOpeningMessage();
  return openingMessage;
}

/**
 * Exits rabbit hole mode. Stores the rabbit hole conversation in the DB,
 * destroys the agent, and resumes the main recall session exactly where it left off.
 *
 * Emits a 'rabbithole_exited' event with the canonical payload shape
 * consumed by T11 (progress display) and T13 (protocol):
 *   { type: 'rabbithole_exited', label: string, pointsRecalledDuring: number, completionPending: boolean }
 *
 * Where `label` is the rabbithole's `topic` field value.
 */
async exitRabbithole(): Promise<{
  label: string;
  pointsRecalledDuring: number;
  completionPending: boolean;
}> {
  if (this.currentMode !== 'rabbithole' || !this.activeRabbitholeAgent) {
    throw new Error('Not currently in a rabbit hole.');
  }

  // Store the rabbit hole conversation in the database
  const conversation = this.activeRabbitholeAgent.getConversationHistory();
  if (this.activeRabbitholeEventId && this.rabbitholeRepo) {
    // NOTE: rabbitholeRepo.update() only accepts { returnMessageIndex, depth, status, relatedRecallPointIds }.
    // The new `conversation` column requires extending the repository's update() method
    // OR adding a dedicated updateConversation() method. See section 10 and 11.
    await this.rabbitholeRepo.updateConversation(
      this.activeRabbitholeEventId,
      conversation
    );
    // Also update the status to 'entered' (or 'returned' if we want to mark it as completed)
    await this.rabbitholeRepo.update(this.activeRabbitholeEventId, {
      status: 'returned',
      returnMessageIndex: this.messages.length - 1,
    });
  }

  // Build the canonical exit payload
  const label = this.activeRabbitholeTopic ?? 'Unknown';
  const pointsRecalledDuring = this.rabbitholePointsRecalled;
  const completionPending = this.completionPendingAfterRabbithole;

  // Emit rabbithole_exited event with canonical shape for T11/T13
  this.emitEvent('rabbithole_exited', {
    label,
    pointsRecalledDuring,
    completionPending,
  });

  // Clean up rabbit hole state
  this.activeRabbitholeAgent = null;
  this.activeRabbitholeEventId = null;
  this.activeRabbitholeTopic = null;
  this.rabbitholePointsRecalled = 0;
  this.currentMode = 'recall';
  this.completionPendingAfterRabbithole = false;

  return { label, pointsRecalledDuring, completionPending };
}

/**
 * Processes a user message during rabbit hole mode.
 * Routes the message to the RabbitholeAgent and runs the evaluator in 'rabbithole' mode.
 *
 * @param content - The user's message text
 * @returns The rabbit hole agent's response
 */
async processRabbitholeMessage(content: string): Promise<string> {
  if (this.currentMode !== 'rabbithole' || !this.activeRabbitholeAgent) {
    throw new Error('Not currently in a rabbit hole.');
  }

  // Run evaluator silently in rabbithole mode — checks if user accidentally recalled any points
  // The evaluator returns tagged points but no steering feedback
  // NOTE: Use evaluateBatch() (from T06), not evaluate(). The evaluate() method is for single-point evaluation.
  // Also, evaluateBatch() takes (uncheckedPoints, conversationMessages, mode) — not (content, points, mode).
  const evalResult = await this.evaluator.evaluateBatch(this.getUncheckedPoints(), this.messages, 'rabbithole');
  if (evalResult.recalledPointIds.length > 0) {
    for (const pointId of evalResult.recalledPointIds) {
      this.markPointRecalled(pointId);
      this.rabbitholePointsRecalled++;
    }
    // Check if all points are now recalled
    if (this.allPointsRecalled()) {
      this.completionPendingAfterRabbithole = true;
    }
  }

  // Generate response from rabbit hole agent (evaluator feedback is NOT passed to this agent)
  const response = await this.activeRabbitholeAgent.generateResponse(content);
  return response;
}

/**
 * Declines a rabbit hole prompt. Sets a cooldown to suppress re-detection
 * for the next few messages.
 */
declineRabbithole(): void {
  // Suppress detection for the next 3 messages
  this.rabbitholeDeclineCooldown = 3;
}
```

### 6. Modify `processUserMessage()` to check mode

In the existing `processUserMessage()` method, add a mode check at the top:

```typescript
async processUserMessage(content: string): Promise<ProcessMessageResult> {
  // If in rabbit hole mode, route to rabbit hole processing
  if (this.currentMode === 'rabbithole') {
    const response = await this.processRabbitholeMessage(content);
    return {
      response,
      // ... return appropriate ProcessMessageResult for rabbithole mode
    };
  }

  // ... existing recall mode processing
}
```

### 7. Detection + User Prompt flow

When `RabbitholeDetector.detectRabbithole()` returns a non-null event:

a. `SessionEngine` emits a `rabbithole_detected` event with `{ topic: string, rabbitholeEventId: string }` — note: `topic` comes from the `RabbitholeDetectionResult.topic` field (the existing interface field), NOT a separate `label` field
b. The WebSocket handler sends a `rabbithole_detected` server message to the client
c. Frontend shows a `RabbitholePrompt` component inline
d. User clicks "Explore" -> client sends `enter_rabbithole` -> handler calls `engine.enterRabbithole(topic, eventId)` -> server streams `rabbithole_entered` + opening message
e. User clicks "Stay on track" -> client sends `decline_rabbithole` -> handler calls `engine.declineRabbithole()` which sets the cooldown counter

### 8. New WebSocket message types (`src/api/ws/types.ts`)

The existing `ServerMessage` and `ClientMessage` union types have NO rabbithole payload types. All six new interfaces must be defined and added to the unions.

**New client message interfaces:**

```typescript
/** User accepts a detected rabbit hole and wants to explore it */
export interface EnterRabbitholePayload {
  type: 'enter_rabbithole';
  /** The rabbitholeEventId from the rabbithole_detected message */
  rabbitholeEventId: string;
  /** The topic to explore (from the rabbithole_detected message's topic field) */
  topic: string;
}

/** User wants to return from rabbit hole to main recall session */
export interface ExitRabbitholePayload {
  type: 'exit_rabbithole';
}

/** User declines to explore a detected rabbit hole */
export interface DeclineRabbitholePayload {
  type: 'decline_rabbithole';
}
```

Add these to the `ClientMessage` union type:

```typescript
export type ClientMessage =
  | UserMessagePayload
  | TriggerEvalPayload
  | EndSessionPayload
  | PingPayload
  | EnterRabbitholePayload   // NEW
  | ExitRabbitholePayload    // NEW
  | DeclineRabbitholePayload; // NEW
```

Add to `CLIENT_MESSAGE_TYPES` array:

```typescript
export const CLIENT_MESSAGE_TYPES = [
  'user_message',
  'trigger_eval',
  'end_session',
  'ping',
  'enter_rabbithole',     // NEW
  'exit_rabbithole',      // NEW
  'decline_rabbithole',   // NEW
] as const;
```

**New server message interfaces:**

```typescript
/** Prompts user about a detected rabbit hole */
export interface RabbitholeDetectedPayload {
  type: 'rabbithole_detected';
  /** The tangential topic detected (from RabbitholeDetectionResult.topic) */
  topic: string;
  /** Event ID for referencing this detection */
  rabbitholeEventId: string;
}

/** Confirms entry into rabbit hole mode */
export interface RabbitholeEnteredPayload {
  type: 'rabbithole_entered';
  /** The topic being explored */
  topic: string;
}

/**
 * Confirms exit from rabbit hole mode, returning to main session.
 *
 * CANONICAL SHAPE — T11 consumes this for progress display, T13 codifies it in the protocol.
 * The `label` field is populated from the rabbithole's `topic` field value.
 */
export interface RabbitholeExitedPayload {
  type: 'rabbithole_exited';
  /** Short description of the rabbithole that was exited (from the detection's `topic` field) */
  label: string;
  /** Number of recall points checked off while in the rabbit hole */
  pointsRecalledDuring: number;
  /** Whether all recall points were completed during the rabbit hole */
  completionPending: boolean;
}
```

Add these to the `ServerMessage` union type:

```typescript
export type ServerMessage =
  | SessionStartedPayload
  | AssistantChunkPayload
  | AssistantCompletePayload
  | EvaluationResultPayload
  | PointTransitionPayload
  | SessionCompletePayload
  | ErrorPayload
  | PongPayload
  | RabbitholeDetectedPayload  // NEW
  | RabbitholeEnteredPayload   // NEW
  | RabbitholeExitedPayload;   // NEW
```

Also update `parseClientMessage()` to validate the new client message types. Specifically, `enter_rabbithole` must validate that `rabbitholeEventId` (string) and `topic` (string) are present.

### 9. Session handler changes (`src/api/ws/session-handler.ts`)

Add handlers for the three new client message types:

```typescript
case 'enter_rabbithole': {
  const openingMessage = await engine.enterRabbithole(message.topic, message.rabbitholeEventId);
  ws.send(serializeServerMessage({
    type: 'rabbithole_entered',
    topic: message.topic,
  }));
  // Stream the opening message as assistant chunks
  // ... (use existing streaming infrastructure)
  break;
}

case 'exit_rabbithole': {
  const { label, pointsRecalledDuring, completionPending } = await engine.exitRabbithole();
  ws.send(serializeServerMessage({
    type: 'rabbithole_exited',
    label,
    pointsRecalledDuring,
    completionPending,
  }));
  // If completion is pending, send session_complete_overlay event (T08 integration)
  break;
}

case 'decline_rabbithole': {
  engine.declineRabbithole(); // Sets cooldown counter
  break;
}
```

Also wire `engine.setEventListener()` to forward `rabbithole_detected` events from the engine to the WebSocket:

```typescript
engine.setEventListener((eventType, data) => {
  if (eventType === 'rabbithole_detected') {
    ws.send(serializeServerMessage({
      type: 'rabbithole_detected',
      topic: data.topic,
      rabbitholeEventId: data.rabbitholeEventId,
    }));
  }
  // ... handle other event types
});
```

Note: `setEventListener()` exists (line 279) but is never called by `session-handler.ts`. T13 is responsible for the full wiring, but T09 should add the `rabbithole_detected` forwarding as part of its implementation.

Also modify the `user_message` handler: when the engine is in rabbit hole mode, messages are routed through `processRabbitholeMessage()` automatically (the engine handles this internally in `processUserMessage()`).

### 10. Schema change — add `conversation` column to `rabbithole_events`

In `src/storage/schema.ts`, add a new column to the `rabbitholeEvents` table:

```typescript
// Full conversation history from the rabbit hole exploration, stored as JSON.
// Each entry has { role: 'user' | 'assistant', content: string }.
// Null for rabbit holes that were detected but the user declined (never entered),
// or for legacy detection-only events from before this feature was added.
// This is NOT redundant with sessionMessages — sessionMessages stores the main
// recall session conversation, while this stores the separate rabbit hole
// sub-conversation that happens in its own LLM context.
conversation: text('conversation', { mode: 'json' })
  .$type<Array<{ role: string; content: string }>>(),
```

This column stores the rabbit hole agent's sub-conversation, which is completely separate from the main session's messages in the `sessionMessages` table. The `sessionMessages` table contains only the main recall session messages; rabbit hole messages are exchanged in a separate LLM context and stored here as JSON.

**Column semantics:**
- **Type**: nullable JSON text (an array of `{ role: string; content: string }` objects)
- **Populated when**: The user exits a rabbit hole — the full conversation from `RabbitholeAgent.getConversationHistory()` is serialized to JSON and stored
- **Null when**: The rabbit hole was detected but never entered (user declined), OR the event predates this feature
- **Not redundant with `sessionMessages`**: `sessionMessages` stores the main recall session; this stores the separate rabbit hole sub-conversation

Create a migration file for this schema change. Use the project's migration workflow:

```bash
bun run db:generate   # generates SQL migration file
bun run db:migrate    # applies via src/storage/migrate.ts
```

Never use `drizzle-kit push`.

### 11. Extend `RabbitholeEventRepository.update()` and add `updateConversation()`

The existing `update()` method in `src/storage/repositories/rabbithole-event.repository.ts` (line 146) only accepts:

```typescript
Partial<Pick<DbRabbitholeEvent, 'returnMessageIndex' | 'depth' | 'status' | 'relatedRecallPointIds'>>
```

After adding the `conversation` column to the schema (section 10), extend the repository:

1. **Add `conversation` to `update()` allowed fields**:
   ```typescript
   async update(
     id: string,
     updates: Partial<Pick<DbRabbitholeEvent, 'returnMessageIndex' | 'depth' | 'status' | 'relatedRecallPointIds' | 'conversation'>>
   ): Promise<DbRabbitholeEvent | null> {
     // ... existing implementation unchanged
   }
   ```

2. **Add a dedicated `updateConversation()` method** for clarity:
   ```typescript
   /**
    * Stores the rabbit hole sub-conversation JSON for an event.
    * Called when the user exits a rabbit hole.
    *
    * @param id - The rabbithole event ID
    * @param conversation - Array of { role, content } messages from the rabbit hole agent
    * @returns The updated event, or null if not found
    */
   async updateConversation(
     id: string,
     conversation: Array<{ role: string; content: string }>
   ): Promise<DbRabbitholeEvent | null> {
     return this.update(id, { conversation });
   }
   ```

### 12. Frontend: RabbitholePrompt component (NEW: `web/src/components/live-session/RabbitholePrompt.tsx`)

An inline component that appears in the message area when `rabbithole_detected` is received:

```tsx
interface RabbitholePromptProps {
  /** Full topic for display and accessibility */
  topic: string;
  /** Called when user wants to explore */
  onExplore: () => void;
  /** Called when user wants to stay on track */
  onDecline: () => void;
}
```

Visual design:
- Appears inline in the chat area, not as a modal or overlay
- Shows text like: "Looks like you're curious about {topic}. Want to explore?"
- Two buttons: "Explore" (primary) and "Stay on track" (secondary/text)
- Subtle styling — should feel like a natural part of the conversation, not a system alert
- Auto-dismisses if the user sends another message before clicking (treat as implicit decline)

### 13. Frontend: RabbitholeIndicator component (NEW: `web/src/components/live-session/RabbitholeIndicator.tsx`)

A persistent banner/indicator shown during rabbit hole mode:

```tsx
interface RabbitholeIndicatorProps {
  /** The topic of the current rabbit hole */
  topic: string;
  /** Called when user clicks "Return to session" */
  onReturn: () => void;
}
```

Visual design:
- Appears at the top of the chat area during rabbit hole mode
- Shows: "Exploring: {topic}" with a "Return to session" button
- Subtle background color shift for the entire chat area (e.g., slightly warmer tone than the normal recall mode)
- The shift should be noticeable but not jarring — a visual cue that the mode has changed

### 14. Frontend: SessionContainer integration (`web/src/components/live-session/SessionContainer.tsx`)

The existing `SessionContainer.tsx` and `use-session-websocket.ts` have **zero** rabbithole handling. Modify `SessionContainer` to track rabbit hole state:

```typescript
// New state
const [sessionMode, setSessionMode] = useState<'recall' | 'rabbithole'>('recall');
const [rabbitholeTopic, setRabbitholeTopic] = useState<string | null>(null);
const [pendingRabbithole, setPendingRabbithole] = useState<{
  topic: string;
  eventId: string;
} | null>(null);
```

Handle the three new server message types in the WebSocket hook:
- `rabbithole_detected` -> set `pendingRabbithole` state, render `RabbitholePrompt`
- `rabbithole_entered` -> set `sessionMode` to `'rabbithole'`, set `rabbitholeTopic`, clear `pendingRabbithole`, render `RabbitholeIndicator`
- `rabbithole_exited` -> set `sessionMode` to `'recall'`, clear `rabbitholeTopic`. If `completionPending` is true, show completion overlay (T08 integration).

Conditional rendering based on mode:
- When `sessionMode === 'rabbithole'`: show `RabbitholeIndicator`, hide `SessionProgress` component
- When `pendingRabbithole` is set: show `RabbitholePrompt` inline in the message area

### 15. Frontend: WebSocket hook changes (`web/src/hooks/use-session-websocket.ts`)

The existing hook has zero rabbithole handling. Add handlers for the new message types. Expose new functions and state:

```typescript
// New state variables in the hook
isInRabbithole: boolean;          // true when sessionMode === 'rabbithole'
rabbitholeTopic: string | null;   // the topic of the active rabbit hole
rabbitholePrompt: {               // non-null when a detection prompt is pending
  topic: string;
  eventId: string;
} | null;

// New action functions exposed by the hook
enterRabbithole: (eventId: string, topic: string) => void;
exitRabbithole: () => void;
declineRabbithole: () => void;
```

The `enterRabbithole` action sends:
```typescript
sendMessage({ type: 'enter_rabbithole', rabbitholeEventId: eventId, topic });
```

The `exitRabbithole` action sends:
```typescript
sendMessage({ type: 'exit_rabbithole' });
```

The `declineRabbithole` action sends:
```typescript
sendMessage({ type: 'decline_rabbithole' });
```

Add new handler cases in the hook's message switch for:
- `'rabbithole_detected'`: set `rabbitholePrompt` state
- `'rabbithole_entered'`: set `isInRabbithole = true`, set `rabbitholeTopic`, clear `rabbitholePrompt`
- `'rabbithole_exited'`: set `isInRabbithole = false`, clear `rabbitholeTopic`

### 16. Decline cooldown mechanism

When the user declines a rabbit hole (`decline_rabbithole`), the detector should not re-detect the same tangent for a few messages. Implement this in `SessionEngine`:

```typescript
declineRabbithole(): void {
  // Suppress detection for the next 3 messages
  this.rabbitholeDeclineCooldown = 3;
}
```

In the existing detection call site (`detectAndRecordRabbithole()`):

```typescript
if (this.rabbitholeDeclineCooldown > 0) {
  this.rabbitholeDeclineCooldown--;
  // Skip rabbit hole detection for this message
} else {
  const event = await this.rabbitholeDetector.detectRabbithole(...);
  // ... handle detection
}
```

### 17. Multiple rabbit holes per session

Multiple rabbit holes can occur in a single session, but they are sequential, not nested. The `enterRabbithole()` method throws if already in rabbit hole mode. Each rabbit hole creates a separate `RabbitholeAgent` instance with its own dedicated `AnthropicClient` and conversation history. Each is stored as a separate entry in `rabbithole_events` with its own `conversation` JSON.

---

## Relevant Files

| Action | File | What Changes |
|--------|------|-------------|
| CREATE | `src/core/session/rabbithole-agent.ts` | New `RabbitholeAgent` class with its own **dedicated `AnthropicClient` instance** (NOT shared with session), conversation history, and `generateResponse()`/`generateOpeningMessage()`/`getConversationHistory()` methods. Also contains `buildRabbitholeAgentPrompt()`. |
| MODIFY | `src/core/session/session-engine.ts` | Add `currentMode`, `activeRabbitholeAgent`, `activeRabbitholeEventId`, `activeRabbitholeTopic`, `rabbitholePointsRecalled`, `completionPendingAfterRabbithole`, `rabbitholeDeclineCooldown` properties. Add `enterRabbithole()`, `exitRabbithole()`, `processRabbitholeMessage()`, `declineRabbithole()` methods. Modify `processUserMessage()` to check mode. Fix `detectAndRecordRabbithole()` to emit `'rabbithole_detected'` instead of `'point_evaluated'`. Add cooldown check to detection. |
| MODIFY | `src/core/session/types.ts` | Add `'rabbithole_detected'`, `'rabbithole_entered'`, `'rabbithole_exited'` to `SessionEventType`. |
| MODIFY | `src/storage/schema.ts` | Add `conversation` column (nullable JSON text) to `rabbitholeEvents` table. |
| CREATE | Migration file (via `bun run db:generate`) | Alter `rabbithole_events` table to add nullable `conversation` column. |
| MODIFY | `src/storage/repositories/rabbithole-event.repository.ts` | Extend `update()` to accept `conversation` field. Add `updateConversation()` convenience method. |
| MODIFY | `src/api/ws/types.ts` | Add `EnterRabbitholePayload`, `ExitRabbitholePayload`, `DeclineRabbitholePayload` to client messages and `ClientMessage` union. Add `RabbitholeDetectedPayload`, `RabbitholeEnteredPayload`, `RabbitholeExitedPayload` to server messages and `ServerMessage` union. Update `CLIENT_MESSAGE_TYPES`. Update `parseClientMessage()` for new types. `RabbitholeExitedPayload` uses canonical shape: `{ type, label, pointsRecalledDuring, completionPending }`. |
| MODIFY | `src/api/ws/session-handler.ts` | Add handlers for `enter_rabbithole`, `exit_rabbithole`, `decline_rabbithole` client messages. Wire `engine.setEventListener()` to forward `rabbithole_detected` events to client. Send `rabbithole_entered` and `rabbithole_exited` server messages. |
| MODIFY | `web/src/hooks/use-session-websocket.ts` | Add rabbit hole message handling. Expose `isInRabbithole`, `rabbitholeTopic`, `rabbitholePrompt` state. Expose `enterRabbithole()`, `exitRabbithole()`, `declineRabbithole()` action functions. Add handler cases for `rabbithole_detected`, `rabbithole_entered`, `rabbithole_exited` in message switch. |
| CREATE | `web/src/components/live-session/RabbitholePrompt.tsx` | Inline prompt component with "Explore" and "Stay on track" buttons. |
| CREATE | `web/src/components/live-session/RabbitholeIndicator.tsx` | Persistent banner during rabbit hole mode with topic and "Return to session" button. |
| MODIFY | `web/src/components/live-session/SessionContainer.tsx` | Track `sessionMode`, `rabbitholeTopic`, `pendingRabbithole` state. Conditionally render `RabbitholePrompt` and `RabbitholeIndicator`. Hide `SessionProgress` during rabbit holes. |

---

## Success Criteria

1. **Detection triggers user prompt**: When `RabbitholeDetector` detects a tangent, the user sees an inline prompt in the chat area: "Looks like you're curious about {topic}. Want to explore?" with "Explore" and "Stay on track" buttons. The prompt is NOT a modal or popup.

2. **User opt-in required**: Rabbit hole mode is NEVER entered automatically. The user must explicitly click "Explore" (or equivalent) to enter rabbit hole mode. If they ignore the prompt and keep chatting, it auto-dismisses (implicit decline).

3. **Separate LLM context with dedicated client**: The `RabbitholeAgent` creates its own `AnthropicClient` instance internally. It does NOT accept or reuse the session's client. This prevents `setSystemPrompt()` calls from corrupting the Socratic tutor prompt. The agent has its own `messages` array completely independent of the main session's conversation history.

4. **Main session frozen**: While in rabbit hole mode, no messages are sent to the recall tutor. The tutor's conversation context remains exactly as it was when the rabbit hole was entered. When the user returns, the tutor resumes from that exact state.

5. **Rabbit hole agent tone**: The rabbit hole agent is exploratory and conversational. It shares information, asks follow-up questions, and follows the user's curiosity. It does NOT use Socratic method, does NOT withhold answers, and does NOT try to test the user. It feels like a different personality from the recall tutor.

6. **Evaluator runs silently**: During rabbit hole mode, the evaluator runs on every user message with `mode: 'rabbithole'`. It silently checks off any recall points the user demonstrates knowledge of. The evaluator's output is NOT passed to the rabbit hole agent. The agent does not know about the evaluator.

7. **UI transitions on entry**: When entering rabbit hole mode: the `RabbitholeIndicator` banner appears at the top of the chat area showing "Exploring: {topic}", the `SessionProgress` component is hidden, and a subtle visual shift (background color change) indicates the mode change.

8. **UI transitions on exit**: When exiting rabbit hole mode: the `RabbitholeIndicator` disappears, the `SessionProgress` component reappears, the visual shift reverts, and the chat resumes with the recall tutor's context.

9. **Return to session button**: A "Return to session" button is always visible during rabbit hole mode (in the `RabbitholeIndicator` component). Clicking it sends `exit_rabbithole` and triggers the exit flow.

10. **Conversation stored on exit**: When exiting a rabbit hole, the full conversation history (`[{role, content}, ...]`) is stored in the `conversation` column of the `rabbithole_events` table for the corresponding event. The conversation is stored as JSON. This is NOT redundant with `sessionMessages` — it stores the rabbit hole's separate sub-conversation.

11. **Completion during rabbit hole**: If all recall points are recalled during a rabbit hole (via silent evaluator), the system does NOT interrupt the rabbit hole. It sets `completionPendingAfterRabbithole = true`. When the user exits, the `rabbithole_exited` message includes `completionPending: true`, and the frontend shows the completion overlay (T08 integration point).

12. **Topic used for display**: Each detected rabbit hole uses its `topic` field (from `RabbitholeDetectionResult.topic`) for UI display in prompts, indicators, and the `rabbithole_exited` payload's `label` field. There is no separate `label` field on the detection result — the existing `topic` field already serves this purpose.

13. **Canonical `rabbithole_exited` payload**: The `RabbitholeExitedPayload` uses this exact shape: `{ type: 'rabbithole_exited'; label: string; pointsRecalledDuring: number; completionPending: boolean; }`. The `label` is populated from the rabbithole's `topic` field. T11 consumes this for progress display. T13 codifies it in the protocol.

14. **Decline cooldown**: When the user clicks "Stay on track" (decline), the detector skips detection for the next 3 messages (configurable). This prevents the same tangent from being re-detected immediately. After the cooldown, detection resumes normally.

15. **Sequential, not nested**: Multiple rabbit holes can occur in one session, but only one at a time. Attempting to enter a rabbit hole while already in one throws an error. Each rabbit hole has its own `RabbitholeAgent` instance (with its own `AnthropicClient`) and conversation record.

16. **Schema migration**: The `conversation` column is added to `rabbithole_events` as a nullable JSON text column. Existing rows (from detection-only events) have NULL in this column. A migration file is generated via `bun run db:generate` and applied via `bun run db:migrate`.

17. **Repository extended**: `RabbitholeEventRepository.update()` is extended to accept `conversation` in its allowed fields. A convenience `updateConversation()` method is added.

18. **WebSocket types complete**: All six new message types are defined with proper TypeScript interfaces, added to the appropriate union types (`ClientMessage`, `ServerMessage`), and handled in both the session handler (server) and the WebSocket hook (client). `CLIENT_MESSAGE_TYPES` includes the three new client types. `parseClientMessage()` validates the new types.

19. **Frontend state added**: `use-session-websocket.ts` exposes `isInRabbithole`, `rabbitholeTopic`, `rabbitholePrompt` state variables and `enterRabbithole()`, `exitRabbithole()`, `declineRabbithole()` action functions. `SessionContainer.tsx` uses these for conditional rendering.

20. **Correct event type emission**: `detectAndRecordRabbithole()` emits `'rabbithole_detected'` (not the previous incorrect `'point_evaluated'`). `SessionEventType` includes `'rabbithole_detected'`, `'rabbithole_entered'`, and `'rabbithole_exited'`.

21. **No rabbit hole during first 2 messages**: Rabbit hole detection should not trigger during the first 2 message exchanges of a session (the detector already has a minimum message check via `recentMessages.length < 2`, but verify this behavior is preserved).

22. **Opening message on entry**: When entering a rabbit hole, the agent generates an opening message that sets the exploratory tone. This message is streamed to the client using the same `assistant_chunk` / `assistant_complete` infrastructure as the main session.

23. **RabbitholeDetector is NOT modified for detection logic**: Detection logic stays exactly as-is in `RabbitholeDetector`. The `RabbitholeDetectionResult` interface in `src/llm/prompts/rabbithole-detector.ts` is NOT modified — no `label` field is added. The existing 7 fields (`isRabbithole`, `topic`, `depth`, `relatedToCurrentPoint`, `relatedRecallPointIds`, `confidence`, `reasoning`) remain unchanged.

---

## Implementation Warnings

> **WARNING: Dedicated `AnthropicClient` — CRITICAL**
> The `RabbitholeAgent` MUST create its own `AnthropicClient` instance. The `AnthropicClient` is stateful: `systemPrompt` is a private instance field (line 56 of `src/llm/client.ts`), accessible only via `setSystemPrompt()` (line 114) and `getSystemPrompt()` (line 123). `complete()` always sends `system: this.systemPrompt` (line 168). There is NO per-call system prompt override. `LLMConfig` only has `model`, `maxTokens`, `temperature`. Sharing the session's client and calling `setSystemPrompt()` will corrupt the Socratic tutor prompt. Do NOT pass the session's `llmClient` to `RabbitholeAgent`.

> **WARNING: `this.currentRecallSet` NOT `this.recallSet`**
> The `SessionEngine` property is named `this.currentRecallSet`, not `this.recallSet`. This has been corrected in the `enterRabbithole()` code above.

> **WARNING: `this.rabbitholeRepo` NOT `this.rabbitholeEventRepo`**
> The `SessionEngine` (and `session-handler.ts`) property is named `this.rabbitholeRepo`, not `this.rabbitholeEventRepo`. This has been corrected in the `exitRabbithole()` code above.

> **WARNING: `RabbitholeEventRepository.update()` limited fields**
> The existing `update()` method in `src/storage/repositories/rabbithole-event.repository.ts` (line 146) only accepts `{ returnMessageIndex, depth, status, relatedRecallPointIds }`. After adding the `conversation` column (section 10), this must be extended to include `conversation` (section 11). Without this extension, storing rabbit hole conversations will fail.

> **WARNING: `RabbitholeDetectionResult` has NO `label` field**
> The `RabbitholeDetectionResult` interface in `src/llm/prompts/rabbithole-detector.ts` has exactly 7 fields: `isRabbithole`, `topic`, `depth`, `relatedToCurrentPoint`, `relatedRecallPointIds`, `confidence`, `reasoning`. There is NO `label` field. The `topic` field already serves the purpose of identifying the rabbit hole. Do NOT add a `label` field to this interface. Use `topic` everywhere a display name is needed. The `rabbithole_exited` payload's `label` field is populated from the detection's `topic` value.

> **WARNING: Interface definition is in the prompts file**
> `RabbitholeDetectionResult` is DEFINED in `src/llm/prompts/rabbithole-detector.ts` (lines 42-96). The `src/core/analysis/rabbithole-detector.ts` file IMPORTS it — it does not define it. Do not attempt to modify the interface in the wrong file.

> **WARNING: Wrong event type at line 1203**
> `session-engine.ts` line 1203 currently emits `'point_evaluated'` for rabbithole detection — semantically wrong. This must be changed to emit `'rabbithole_detected'` after adding it to `SessionEventType`.

> **WARNING: `setEventListener()` is never wired**
> `SessionEngine.setEventListener()` exists (line 279) but `session-handler.ts` never calls it. T13 owns the full wiring, but T09 should document that the `rabbithole_detected` event forwarding depends on this wiring.

> **WARNING: Haiku model ID**
> The shorthand `'haiku'` is not a valid Anthropic model ID. If any fast/cheap LLM calls are needed (e.g., for label generation), use `'claude-haiku-4-5-20251001'`.

> **WARNING: `EnterRabbitholePayload` needs `rabbitholeEventId` and `topic`**
> In section 8, `EnterRabbitholePayload` includes `rabbitholeEventId` and `topic` fields. The client needs to echo back the `rabbitholeEventId` and `topic` from the `rabbithole_detected` server message. Ensure the frontend stores the detected event's ID and topic and sends them back.

> **WARNING: Migration workflow**
> Use `bun run db:generate` then `bun run db:migrate`. Never `drizzle-kit push`.
