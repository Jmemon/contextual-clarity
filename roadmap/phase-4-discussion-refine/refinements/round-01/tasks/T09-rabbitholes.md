# T09 — Rabbit Holes as Separate UX Mode

| Field | Value |
|-------|-------|
| **name** | Rabbit Holes as Separate UX Mode |
| **parallel-group** | C (wave 3) |
| **depends-on** | T06 (Continuous Evaluator with Feedback Field) |

---

## Description

Transform rabbit holes from a detection-and-redirect mechanism into a first-class UX mode with a separate LLM context, visual transitions, and a distinct agent personality. Currently, `RabbitholeDetector` detects tangents and the tutor is told to redirect. After this task, detected rabbit holes become an opt-in experience: the user is prompted, and if they accept, a completely separate `RabbitholeAgent` takes over with its own conversation history, system prompt, and personality. The main recall session freezes until the user returns.

Detection stays in the existing `RabbitholeDetector` class. What changes is everything that happens AFTER detection: user prompting, context switching, the rabbit hole agent, message routing, UI transitions, and conversation storage.

The evaluator (from T06) continues to run silently during rabbit holes in `'rabbithole'` mode — it tags recall points as recalled if the user demonstrates knowledge, but provides no steering feedback to the rabbit hole agent.

---

## Detailed Implementation

### 1. RabbitholeAgent class (NEW: `src/core/session/rabbithole-agent.ts`)

Create a new class that manages a self-contained LLM conversation for a rabbit hole exploration:

```typescript
import type { AnthropicClient } from '../../llm/client';

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
 * tangential topics that arise during recall sessions. It has its own system
 * prompt, conversation history, and personality distinct from the recall tutor.
 *
 * Lifecycle:
 * 1. Created when user opts into a detected rabbit hole
 * 2. Receives user messages and generates exploratory responses
 * 3. Destroyed when user exits — conversation stored in DB for analysis
 */
export class RabbitholeAgent {
  /** The LLM client for generating responses */
  private llmClient: AnthropicClient;

  /** Conversation history for this rabbit hole — completely independent of main session */
  private messages: RabbitholeMessage[] = [];

  /** The tangential topic being explored */
  private topic: string;

  /** System prompt for the rabbit hole agent */
  private systemPrompt: string;

  constructor(params: {
    topic: string;
    recallSetName: string;
    recallSetDescription: string;
    llmClient: AnthropicClient;
  }) {
    this.topic = params.topic;
    this.llmClient = params.llmClient;
    this.systemPrompt = buildRabbitholeAgentPrompt(
      params.topic,
      params.recallSetName,
      params.recallSetDescription
    );
  }

  /**
   * Generates a response to a user message within the rabbit hole context.
   * The rabbit hole agent is exploratory and conversational — it follows
   * the user's curiosity, not a Socratic method.
   */
  async generateResponse(userMessage: string): Promise<string> {
    this.messages.push({ role: 'user', content: userMessage });

    const response = await this.llmClient.complete(this.systemPrompt, {
      messages: this.messages,
      // Use the same model as the main session for quality
    });

    this.messages.push({ role: 'assistant', content: response.text });
    return response.text;
  }

  /**
   * Generates an opening message to kick off the rabbit hole exploration.
   * Called immediately after the user opts in, before they send a message.
   */
  async generateOpeningMessage(): Promise<string> {
    const opening = await this.llmClient.complete(this.systemPrompt, {
      messages: [
        {
          role: 'user',
          content: `I'm curious about ${this.topic}. Tell me more.`,
        },
      ],
    });

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

### 4. New SessionEngine methods

```typescript
/**
 * Enters rabbit hole mode. Freezes the main recall session context
 * and creates a new RabbitholeAgent with its own conversation.
 *
 * Called when the user accepts a rabbit hole prompt after detection.
 *
 * @param topic - The tangential topic to explore
 * @param rabbitholeEventId - The ID of the detected rabbithole event (for DB linking)
 * @returns The rabbit hole agent's opening message
 */
async enterRabbithole(topic: string, rabbitholeEventId: string): Promise<string> {
  if (this.currentMode === 'rabbithole') {
    throw new Error('Already in a rabbit hole. Exit the current one before entering a new one.');
  }

  this.currentMode = 'rabbithole';
  this.activeRabbitholeEventId = rabbitholeEventId;

  this.activeRabbitholeAgent = new RabbitholeAgent({
    topic,
    recallSetName: this.recallSet!.name,
    recallSetDescription: this.recallSet!.description,
    llmClient: this.llmClient,
  });

  // Generate an opening message from the rabbit hole agent
  const openingMessage = await this.activeRabbitholeAgent.generateOpeningMessage();
  return openingMessage;
}

/**
 * Exits rabbit hole mode. Stores the rabbit hole conversation in the DB,
 * destroys the agent, and resumes the main recall session exactly where it left off.
 *
 * If all points were recalled during the rabbit hole (completionPendingAfterRabbithole),
 * this is signaled to the caller so the completion overlay can be shown.
 */
async exitRabbithole(): Promise<{ completionPending: boolean }> {
  if (this.currentMode !== 'rabbithole' || !this.activeRabbitholeAgent) {
    throw new Error('Not currently in a rabbit hole.');
  }

  // Store the rabbit hole conversation in the database
  const conversation = this.activeRabbitholeAgent.getConversationHistory();
  if (this.activeRabbitholeEventId) {
    await this.rabbitholeEventRepo.updateConversation(
      this.activeRabbitholeEventId,
      conversation
    );
  }

  // Clean up rabbit hole state
  const wasPending = this.completionPendingAfterRabbithole;
  this.activeRabbitholeAgent = null;
  this.activeRabbitholeEventId = null;
  this.currentMode = 'recall';
  this.completionPendingAfterRabbithole = false;

  return { completionPending: wasPending };
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
  const evalResult = await this.evaluator.evaluate(content, this.getUncheckedPoints(), 'rabbithole');
  if (evalResult.recalledPointIds.length > 0) {
    for (const pointId of evalResult.recalledPointIds) {
      this.markPointRecalled(pointId);
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
```

### 5. Modify `processUserMessage()` to check mode

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

### 6. Rabbit hole label generation — modify `RabbitholeDetector`

The existing `RabbitholeDetector.detectRabbithole()` returns a `RabbitholeEvent` with a `topic` field (a description like "the etymology of the word 'photosynthesis'"). This topic is too long for UI display. Add label generation:

In `src/core/analysis/rabbithole-detector.ts`, after a rabbithole is detected (line ~280, after `const activeState` is created):
- Make a fast Haiku call to generate a 2-4 word label from the topic
- Add the label to the returned event

Add a `label` field to `RabbitholeEvent` and `ActiveRabbitholeState`:

```typescript
// In the detection result handling, after topic is determined:
const label = await this.generateLabel(result.topic ?? 'Unknown tangent');

// ...
const event: RabbitholeEvent = {
  // ... existing fields
  label, // NEW: short 2-4 word label for UI display
};
```

New private method:

```typescript
/**
 * Generates a short 2-4 word label for a rabbit hole topic.
 * Uses Haiku for fast, cheap label generation.
 *
 * @param topic - The full topic description
 * @returns A short label suitable for UI display (e.g., "Adenosine Tolerance", "Free Will Debate")
 */
private async generateLabel(topic: string): Promise<string> {
  const response = await this.llmClient.complete(
    `Generate a 2-4 word label for this topic. Return ONLY the label, no quotes, no explanation.\n\nTopic: ${topic}`,
    {
      temperature: 0.3,
      maxTokens: 20,
      model: 'haiku', // Use Haiku for speed and cost
    }
  );
  return response.text.trim();
}
```

Also update `src/llm/prompts/rabbithole-detector.ts`:
- Add `label` to the `RabbitholeDetectionResult` interface
- Add label generation instruction to the detection prompt (alternative to separate call): include `"label": "2-4 word short label"` in the JSON response format
- Update `parseRabbitholeDetectionResponse()` to extract the label field

Choose ONE approach: either generate the label in the detector prompt itself (cheaper, one call) or in a separate Haiku call (simpler, but costs an extra API call). The in-prompt approach is preferred since the LLM already understands the topic.

### 7. Detection + User Prompt flow

When `RabbitholeDetector.detectRabbithole()` returns a non-null event:

a. `SessionEngine` emits a `rabbithole_detected` event with `{ topic: string, label: string, rabbitholeEventId: string }`
b. The WebSocket handler sends a `rabbithole_detected` server message to the client
c. Frontend shows a `RabbitholePrompt` component inline
d. User clicks "Explore" -> client sends `enter_rabbithole` -> handler calls `engine.enterRabbithole(topic, eventId)` -> server streams `rabbithole_entered` + opening message
e. User clicks "Stay on track" -> client sends `decline_rabbithole` -> handler calls `engine.declineRabbithole()` which sets the cooldown counter

### 8. New WebSocket message types (`src/api/ws/types.ts`)

**New client messages:**

```typescript
/** User accepts a detected rabbit hole and wants to explore it */
export interface EnterRabbitholePayload {
  type: 'enter_rabbithole';
  /** The rabbitholeEventId from the rabbithole_detected message */
  rabbitholeEventId: string;
  /** The topic to explore */
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

Add these to the `ClientMessage` union type and `CLIENT_MESSAGE_TYPES` array.

**New server messages:**

```typescript
/** Prompts user about a detected rabbit hole */
export interface RabbitholeDetectedPayload {
  type: 'rabbithole_detected';
  /** The tangential topic detected */
  topic: string;
  /** Short 2-4 word label for UI display */
  label: string;
  /** Event ID for referencing this detection */
  rabbitholeEventId: string;
}

/** Confirms entry into rabbit hole mode */
export interface RabbitholeEnteredPayload {
  type: 'rabbithole_entered';
  /** The topic being explored */
  topic: string;
  /** Short label for the UI banner */
  label: string;
}

/** Confirms exit from rabbit hole mode, returning to main session */
export interface RabbitholeExitedPayload {
  type: 'rabbithole_exited';
  /** Whether all recall points were completed during the rabbit hole */
  completionPending: boolean;
}
```

Add these to the `ServerMessage` union type.

### 9. Session handler changes (`src/api/ws/session-handler.ts`)

Add handlers for the three new client message types:

```typescript
case 'enter_rabbithole': {
  const openingMessage = await engine.enterRabbithole(message.topic, message.rabbitholeEventId);
  ws.send(serializeServerMessage({
    type: 'rabbithole_entered',
    topic: message.topic,
    label: message.label ?? message.topic, // fallback
  }));
  // Stream the opening message as assistant chunks
  // ... (use existing streaming infrastructure)
  break;
}

case 'exit_rabbithole': {
  const { completionPending } = await engine.exitRabbithole();
  ws.send(serializeServerMessage({
    type: 'rabbithole_exited',
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

Also modify the `user_message` handler: when the engine is in rabbit hole mode, messages are routed through `processRabbitholeMessage()` automatically (the engine handles this internally in `processUserMessage()`).

### 10. Schema change — add `conversation` column to `rabbithole_events`

In `src/storage/schema.ts`, add a new column to the `rabbitholeEvents` table:

```typescript
// Full conversation history from the rabbit hole exploration, stored as JSON.
// Each entry has { role: 'user' | 'assistant', content: string }.
// Null for rabbit holes that were detected but never entered (user declined).
conversation: text('conversation', { mode: 'json' })
  .$type<Array<{ role: string; content: string }>>(),
```

Create a migration file for this schema change. The migration should:
- Add the `conversation` column as nullable (existing rows will have NULL)
- Not modify existing data

### 11. Frontend: RabbitholePrompt component (NEW: `web/src/components/live-session/RabbitholePrompt.tsx`)

An inline component that appears in the message area when `rabbithole_detected` is received:

```tsx
interface RabbitholePromptProps {
  /** The label to display (2-4 words) */
  label: string;
  /** Full topic for accessibility/tooltip */
  topic: string;
  /** Called when user wants to explore */
  onExplore: () => void;
  /** Called when user wants to stay on track */
  onDecline: () => void;
}
```

Visual design:
- Appears inline in the chat area, not as a modal or overlay
- Shows text like: "Looks like you're curious about {label}. Want to explore?"
- Two buttons: "Explore" (primary) and "Stay on track" (secondary/text)
- Subtle styling — should feel like a natural part of the conversation, not a system alert
- Auto-dismisses if the user sends another message before clicking (treat as implicit decline)

### 12. Frontend: RabbitholeIndicator component (NEW: `web/src/components/live-session/RabbitholeIndicator.tsx`)

A persistent banner/indicator shown during rabbit hole mode:

```tsx
interface RabbitholeIndicatorProps {
  /** The short label of the current rabbit hole */
  label: string;
  /** Called when user clicks "Return to session" */
  onReturn: () => void;
}
```

Visual design:
- Appears at the top of the chat area during rabbit hole mode
- Shows: "Exploring: {label}" with a "Return to session" button
- Subtle background color shift for the entire chat area (e.g., slightly warmer tone than the normal recall mode)
- The shift should be noticeable but not jarring — a visual cue that the mode has changed

### 13. Frontend: SessionContainer integration (`web/src/components/live-session/SessionContainer.tsx`)

Modify `SessionContainer` to track rabbit hole state:

```typescript
// New state
const [sessionMode, setSessionMode] = useState<'recall' | 'rabbithole'>('recall');
const [rabbitholeLabel, setRabbitholeLabel] = useState<string | null>(null);
const [pendingRabbithole, setPendingRabbithole] = useState<{
  topic: string;
  label: string;
  eventId: string;
} | null>(null);
```

Handle the three new server message types in the WebSocket hook:
- `rabbithole_detected` -> set `pendingRabbithole` state, render `RabbitholePrompt`
- `rabbithole_entered` -> set `sessionMode` to `'rabbithole'`, set `rabbitholeLabel`, clear `pendingRabbithole`, render `RabbitholeIndicator`
- `rabbithole_exited` -> set `sessionMode` to `'recall'`, clear `rabbitholeLabel`. If `completionPending` is true, show completion overlay (T08 integration).

Conditional rendering based on mode:
- When `sessionMode === 'rabbithole'`: show `RabbitholeIndicator`, hide `SessionProgress` component
- When `pendingRabbithole` is set: show `RabbitholePrompt` inline in the message area

### 14. Frontend: WebSocket hook changes (`web/src/hooks/use-session-websocket.ts`)

Add handlers for the new message types. Expose new functions and state:

```typescript
// New state exposed by the hook
rabbitholeState: {
  mode: 'recall' | 'rabbithole';
  label: string | null;
  pendingPrompt: { topic: string; label: string; eventId: string } | null;
};

// New actions exposed by the hook
enterRabbithole: (eventId: string, topic: string) => void;
exitRabbithole: () => void;
declineRabbithole: () => void;
```

### 15. Decline cooldown mechanism

When the user declines a rabbit hole (`decline_rabbithole`), the detector should not re-detect the same tangent for a few messages. Implement this in `SessionEngine`:

```typescript
declineRabbithole(): void {
  // Suppress detection for the next 3 messages
  this.rabbitholeDeclineCooldown = 3;
}
```

In the existing detection call site (wherever `detectRabbithole()` is called in the message processing flow):

```typescript
if (this.rabbitholeDeclineCooldown > 0) {
  this.rabbitholeDeclineCooldown--;
  // Skip rabbit hole detection for this message
} else {
  const event = await this.rabbitholeDetector.detectRabbithole(...);
  // ... handle detection
}
```

### 16. Multiple rabbit holes per session

Multiple rabbit holes can occur in a single session, but they are sequential, not nested. The `enterRabbithole()` method throws if already in rabbit hole mode. Each rabbit hole creates a separate `RabbitholeAgent` instance with its own conversation history. Each is stored as a separate entry in `rabbithole_events` with its own `conversation` JSON.

---

## Relevant Files

| Action | File | What Changes |
|--------|------|-------------|
| CREATE | `src/core/session/rabbithole-agent.ts` | New `RabbitholeAgent` class with own LLM context, system prompt, conversation history, and `generateResponse()`/`generateOpeningMessage()`/`getConversationHistory()` methods |
| MODIFY | `src/core/session/session-engine.ts` | Add `currentMode`, `activeRabbitholeAgent`, `activeRabbitholeEventId`, `completionPendingAfterRabbithole`, `rabbitholeDeclineCooldown` properties. Add `enterRabbithole()`, `exitRabbithole()`, `processRabbitholeMessage()`, `declineRabbithole()` methods. Modify `processUserMessage()` to check mode. |
| MODIFY | `src/core/analysis/rabbithole-detector.ts` | Add `label` field to detection results. Add `generateLabel()` private method (or integrate into detection prompt). Update `ActiveRabbitholeState` to include `label`. |
| MODIFY | `src/llm/prompts/rabbithole-detector.ts` | Add `label` to `RabbitholeDetectionResult` interface. Add label instruction to detection prompt JSON schema. Update `parseRabbitholeDetectionResponse()` to extract label. |
| MODIFY | `src/storage/schema.ts` | Add `conversation` column (nullable JSON text) to `rabbitholeEvents` table. |
| CREATE | Migration file (e.g., `src/storage/migrations/XXXX_add_rabbithole_conversation.ts`) | Alter `rabbithole_events` table to add `conversation` column. |
| MODIFY | `src/api/ws/types.ts` | Add `EnterRabbitholePayload`, `ExitRabbitholePayload`, `DeclineRabbitholePayload` to client messages. Add `RabbitholeDetectedPayload`, `RabbitholeEnteredPayload`, `RabbitholeExitedPayload` to server messages. Update union types and `CLIENT_MESSAGE_TYPES`. |
| MODIFY | `src/api/ws/session-handler.ts` | Add handlers for `enter_rabbithole`, `exit_rabbithole`, `decline_rabbithole` client messages. Send `rabbithole_detected`, `rabbithole_entered`, `rabbithole_exited` server messages at appropriate times. |
| MODIFY | `web/src/hooks/use-session-websocket.ts` | Add rabbit hole message handling. Expose `rabbitholeState` and rabbit hole action functions (`enterRabbithole`, `exitRabbithole`, `declineRabbithole`). |
| CREATE | `web/src/components/live-session/RabbitholePrompt.tsx` | Inline prompt component with "Explore" and "Stay on track" buttons. |
| CREATE | `web/src/components/live-session/RabbitholeIndicator.tsx` | Persistent banner during rabbit hole mode with topic label and "Return to session" button. |
| MODIFY | `web/src/components/live-session/SessionContainer.tsx` | Track `sessionMode`, `rabbitholeLabel`, `pendingRabbithole` state. Conditionally render `RabbitholePrompt` and `RabbitholeIndicator`. Hide `SessionProgress` during rabbit holes. |

---

## Success Criteria

1. **Detection triggers user prompt**: When `RabbitholeDetector` detects a tangent, the user sees an inline prompt in the chat area: "Looks like you're curious about {label}. Want to explore?" with "Explore" and "Stay on track" buttons. The prompt is NOT a modal or popup.

2. **User opt-in required**: Rabbit hole mode is NEVER entered automatically. The user must explicitly click "Explore" (or equivalent) to enter rabbit hole mode. If they ignore the prompt and keep chatting, it auto-dismisses (implicit decline).

3. **Separate LLM context**: The `RabbitholeAgent` has its own `messages` array completely independent of the main session's conversation history. The main session tutor's context is not modified by rabbit hole messages. The rabbit hole agent does not see the main session's conversation.

4. **Main session frozen**: While in rabbit hole mode, no messages are sent to the recall tutor. The tutor's conversation context remains exactly as it was when the rabbit hole was entered. When the user returns, the tutor resumes from that exact state.

5. **Rabbit hole agent tone**: The rabbit hole agent is exploratory and conversational. It shares information, asks follow-up questions, and follows the user's curiosity. It does NOT use Socratic method, does NOT withhold answers, and does NOT try to test the user. It feels like a different personality from the recall tutor.

6. **Evaluator runs silently**: During rabbit hole mode, the evaluator runs on every user message with `mode: 'rabbithole'`. It silently checks off any recall points the user demonstrates knowledge of. The evaluator's output is NOT passed to the rabbit hole agent. The agent does not know about the evaluator.

7. **UI transitions on entry**: When entering rabbit hole mode: the `RabbitholeIndicator` banner appears at the top of the chat area showing "Exploring: {label}", the `SessionProgress` component is hidden, and a subtle visual shift (background color change) indicates the mode change.

8. **UI transitions on exit**: When exiting rabbit hole mode: the `RabbitholeIndicator` disappears, the `SessionProgress` component reappears, the visual shift reverts, and the chat resumes with the recall tutor's context.

9. **Return to session button**: A "Return to session" button is always visible during rabbit hole mode (in the `RabbitholeIndicator` component). Clicking it sends `exit_rabbithole` and triggers the exit flow.

10. **Conversation stored on exit**: When exiting a rabbit hole, the full conversation history (`[{role, content}, ...]`) is stored in the `conversation` column of the `rabbithole_events` table for the corresponding event. The conversation is stored as JSON.

11. **Completion during rabbit hole**: If all recall points are recalled during a rabbit hole (via silent evaluator), the system does NOT interrupt the rabbit hole. It sets `completionPendingAfterRabbithole = true`. When the user exits, the `rabbithole_exited` message includes `completionPending: true`, and the frontend shows the completion overlay (T08 integration point).

12. **Rabbit hole labels**: Each detected rabbit hole has a 2-4 word label (e.g., "Adenosine Tolerance", "Free Will Debate") generated during detection. This label is used in the prompt, the indicator banner, and the progress area's rabbit hole list.

13. **Decline cooldown**: When the user clicks "Stay on track" (decline), the detector skips detection for the next 3 messages (configurable). This prevents the same tangent from being re-detected immediately. After the cooldown, detection resumes normally.

14. **Sequential, not nested**: Multiple rabbit holes can occur in one session, but only one at a time. Attempting to enter a rabbit hole while already in one throws an error. Each rabbit hole has its own `RabbitholeAgent` instance and conversation record.

15. **Schema migration**: The `conversation` column is added to `rabbithole_events` as a nullable JSON text column. Existing rows (from detection-only events) have NULL in this column. A migration file exists and runs cleanly.

16. **WebSocket types complete**: All six new message types are defined with proper TypeScript interfaces, added to the appropriate union types, and handled in both the session handler (server) and the WebSocket hook (client). `CLIENT_MESSAGE_TYPES` includes the three new client types.

17. **No rabbit hole during first 2 messages**: Rabbit hole detection should not trigger during the first 2 message exchanges of a session (the detector already has a minimum message check, but verify this behavior is preserved).

18. **Opening message on entry**: When entering a rabbit hole, the agent generates an opening message that sets the exploratory tone. This message is streamed to the client using the same `assistant_chunk` / `assistant_complete` infrastructure as the main session.
