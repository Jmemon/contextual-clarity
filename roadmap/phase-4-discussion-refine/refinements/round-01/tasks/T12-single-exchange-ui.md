# T12 — Single-Exchange UI

| Field | Value |
|-------|-------|
| **name** | Single-Exchange UI |
| **parallel-group** | D (wave 4) |
| **depends-on** | T10 (Voice Input Integration) |

---

## Description

Replace the scrolling chat history in the live session with a single-exchange view. At any moment, the user sees only one thing: the AI's current text, plus the input bar below. Each exchange replaces the last — there is no visible conversation history. This design forces genuine recall: the user cannot re-read prior exchanges to remind themselves of what they said or what the AI asked.

The full conversation history is still maintained in memory (the evaluator needs it) and in the database (for analytics and replay). The change is purely visual: the UI renders only the latest assistant message and the current user input state.

This task pairs naturally with voice input (T10): user sees a question, speaks their response, approves it, brief animation, AI responds with the next prompt. Clean, minimal, focused on recall.

---

## Detailed Implementation

### 1. SingleExchangeView Component (CREATE: `web/src/components/live-session/SingleExchangeView.tsx`)

The core new component that replaces `MessageList`. It renders only the latest exchange between the AI and the user.

```tsx
import { useState, useEffect, useRef } from 'react';
import { FormattedText } from '../shared/FormattedText';

/**
 * Visual states for the single-exchange view's transition animation.
 *
 * - showing_ai: Displaying the AI's current message. This is the default resting state.
 * - user_sent: User just sent a message. Their text briefly animates upward, then fades.
 * - loading: Waiting for the AI's response. Pulsing dots visible.
 * - ai_streaming: AI response is streaming in. Text appears progressively.
 */
type ExchangePhase = 'showing_ai' | 'user_sent' | 'loading' | 'ai_streaming';

interface SingleExchangeViewProps {
  /** The AI's most recent complete message. Shown in the 'showing_ai' phase. */
  currentAssistantMessage: string;

  /** Whether the AI's response is currently being streamed. */
  isStreaming: boolean;

  /** Partial content of the AI's response during streaming. */
  streamingContent: string;

  /** The user's message that was just sent. Briefly visible during the 'user_sent' phase. */
  userMessageSent: string | null;

  /** Whether the system is waiting for an AI response (after user sent, before streaming starts). */
  isLoading: boolean;

  /** Whether this is the very first message (session opening) — skip entrance animation. */
  isOpeningMessage: boolean;

  /** Additional CSS classes */
  className?: string;
}

/**
 * Single-exchange view for live sessions.
 *
 * Replaces the scrolling MessageList with a view that shows only the current exchange.
 * The user sees:
 * 1. The AI's current text (large, centered, no chat bubble)
 * 2. A brief flash of their sent message (animates upward, fades out)
 * 3. Loading dots while waiting for the AI
 * 4. The AI's new response streaming in
 *
 * The conversation history is NOT displayed. This forces genuine recall — the user
 * cannot scroll up to re-read previous exchanges.
 *
 * Lifecycle:
 * - Session starts -> AI opening message appears (no animation)
 * - User sends message -> user text animates up (200ms), loading appears
 * - AI starts streaming -> loading fades, AI text streams in progressively
 * - AI completes -> static AI text displayed, ready for next exchange
 * - Repeat
 */
function SingleExchangeView({
  currentAssistantMessage,
  isStreaming,
  streamingContent,
  userMessageSent,
  isLoading,
  isOpeningMessage,
  className = '',
}: SingleExchangeViewProps) {
  // Track the current animation phase
  const [phase, setPhase] = useState<ExchangePhase>('showing_ai');

  // The user message to show during the brief animation
  const [animatingUserMessage, setAnimatingUserMessage] = useState<string | null>(null);

  // Whether the user_sent animation has completed (CSS transition ended)
  const [userMessageFading, setUserMessageFading] = useState(false);

  // Ref for the content container to manage scroll position
  const contentRef = useRef<HTMLDivElement>(null);

  // ---- Phase transitions based on prop changes ----

  // When user sends a message: trigger the user_sent animation
  useEffect(() => {
    if (userMessageSent && userMessageSent.trim()) {
      setAnimatingUserMessage(userMessageSent);
      setUserMessageFading(false);
      setPhase('user_sent');

      // After 200ms, start fading out the user message
      const fadeTimer = setTimeout(() => {
        setUserMessageFading(true);
      }, 100);

      // After 400ms total, move to loading phase
      const loadingTimer = setTimeout(() => {
        setAnimatingUserMessage(null);
        setPhase('loading');
      }, 400);

      return () => {
        clearTimeout(fadeTimer);
        clearTimeout(loadingTimer);
      };
    }
  }, [userMessageSent]);

  // When streaming starts: transition from loading to ai_streaming
  useEffect(() => {
    if (isStreaming && streamingContent) {
      setPhase('ai_streaming');
    }
  }, [isStreaming, streamingContent]);

  // When streaming completes and we have a new assistant message: show it
  useEffect(() => {
    if (!isStreaming && !isLoading && currentAssistantMessage) {
      setPhase('showing_ai');
    }
  }, [isStreaming, isLoading, currentAssistantMessage]);

  // When loading (after user sent, before streaming): ensure we're in loading phase
  useEffect(() => {
    if (isLoading && phase !== 'user_sent') {
      setPhase('loading');
    }
  }, [isLoading, phase]);

  // Scroll to top when new content appears
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [phase, currentAssistantMessage, streamingContent]);

  // ---- Render ----

  return (
    <div
      className={`flex flex-col items-center justify-start flex-1 overflow-hidden ${className}`}
      data-testid="single-exchange-view"
    >
      <div
        ref={contentRef}
        className="w-full max-w-3xl flex-1 overflow-y-auto px-6 py-8 flex flex-col"
      >
        {/* Phase: showing_ai — Display the AI's current message */}
        {phase === 'showing_ai' && currentAssistantMessage && (
          <div
            className={`
              transition-opacity duration-300
              ${isOpeningMessage ? '' : 'animate-fade-in'}
            `}
          >
            <p className="text-clarity-400 text-xs font-medium mb-3 uppercase tracking-wide">
              Agent
            </p>
            <div className="text-white text-lg leading-relaxed">
              <FormattedText content={currentAssistantMessage} />
            </div>
          </div>
        )}

        {/* Phase: user_sent — User's message animates upward and fades */}
        {phase === 'user_sent' && animatingUserMessage && (
          <div
            className={`
              transition-all duration-200 ease-out
              ${userMessageFading
                ? 'opacity-0 -translate-y-4'
                : 'opacity-100 translate-y-0'
              }
            `}
          >
            <p className="text-blue-300 text-xs font-medium mb-3 uppercase tracking-wide">
              You
            </p>
            <div className="text-blue-100 text-lg leading-relaxed">
              <FormattedText content={animatingUserMessage} />
            </div>
          </div>
        )}

        {/* Phase: loading — Pulsing dots while waiting for AI response */}
        {phase === 'loading' && (
          <div className="flex flex-col items-start animate-fade-in">
            <p className="text-clarity-400 text-xs font-medium mb-3 uppercase tracking-wide">
              Agent
            </p>
            <div className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 bg-clarity-400 rounded-full animate-bounce"
                style={{ animationDelay: '0ms' }}
              />
              <span
                className="w-2.5 h-2.5 bg-clarity-400 rounded-full animate-bounce"
                style={{ animationDelay: '150ms' }}
              />
              <span
                className="w-2.5 h-2.5 bg-clarity-400 rounded-full animate-bounce"
                style={{ animationDelay: '300ms' }}
              />
            </div>
          </div>
        )}

        {/* Phase: ai_streaming — AI text appears progressively */}
        {phase === 'ai_streaming' && (
          <div className="animate-fade-in">
            <p className="text-clarity-400 text-xs font-medium mb-3 uppercase tracking-wide">
              Agent
            </p>
            <div className="text-white text-lg leading-relaxed">
              <FormattedText content={streamingContent} />
              {/* Blinking cursor at the end of streaming text */}
              <span className="inline-block w-2 h-5 ml-0.5 bg-clarity-300 animate-pulse rounded-sm" />
            </div>
          </div>
        )}

        {/* Empty state — only shown before the first message arrives */}
        {!currentAssistantMessage && !isLoading && !isStreaming && !animatingUserMessage && (
          <div className="flex items-center justify-center flex-1">
            <p className="text-clarity-400 text-center">Starting session...</p>
          </div>
        )}
      </div>
    </div>
  );
}

export { SingleExchangeView, type ExchangePhase };
export default SingleExchangeView;
```

### 2. CSS Animations

Add a custom `animate-fade-in` utility to the Tailwind config or as a CSS class. This is a simple opacity transition for content appearing:

**Option A: Add to `tailwind.config.ts` (or `.js`):**

```typescript
// In the theme.extend section:
keyframes: {
  'fade-in': {
    '0%': { opacity: '0' },
    '100%': { opacity: '1' },
  },
},
animation: {
  'fade-in': 'fade-in 300ms ease-out',
},
```

**Option B: Add a CSS class in the global stylesheet** (`web/src/index.css` or similar):

```css
@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.animate-fade-in {
  animation: fade-in 300ms ease-out;
}
```

If `animate-fade-in` already exists in the project's Tailwind configuration, no change is needed. Check before adding.

### 3. WebSocket Hook Changes (MODIFY: `web/src/hooks/use-session-websocket.ts`)

Add a `latestAssistantMessage` state that tracks the most recent completed assistant message, separate from the full `messages` array:

```typescript
// Add alongside existing state:

/** The most recent completed assistant message. Used by SingleExchangeView. */
const [latestAssistantMessage, setLatestAssistantMessage] = useState('');

/** The user message that was just sent. Set briefly for the send animation, then cleared. */
const [lastSentUserMessage, setLastSentUserMessage] = useState<string | null>(null);

/** Whether this is the first assistant message in the session (for opening animation). */
const [isOpeningMessage, setIsOpeningMessage] = useState(true);
```

**Update the `assistant_complete` message handler:**

In the existing handler for `case 'assistant_complete':` (or equivalent):

```typescript
case 'assistant_complete': {
  const fullContent = msg.fullContent;
  // ... existing logic to add to messages array ...

  // Track as latest assistant message for SingleExchangeView
  setLatestAssistantMessage(fullContent);

  // After the first assistant message, all subsequent ones are not "opening"
  if (isOpeningMessage) setIsOpeningMessage(false);

  break;
}
```

**Update the `session_started` message handler:**

When the session starts with an opening message:

```typescript
case 'session_started': {
  // ... existing logic ...
  setLatestAssistantMessage(msg.openingMessage);
  setIsOpeningMessage(true);
  break;
}
```

**Update `sendUserMessage`:**

When the user sends a message, briefly set `lastSentUserMessage` for the animation:

```typescript
const sendUserMessage = useCallback((content: string) => {
  // Set the sent message for SingleExchangeView animation
  setLastSentUserMessage(content);

  // Clear the sent message after the animation completes (500ms)
  setTimeout(() => setLastSentUserMessage(null), 500);

  // ... existing WebSocket send logic ...
}, [/* existing deps */]);
```

**Add to the returned object:**

```typescript
return {
  // ... existing returns ...
  latestAssistantMessage,
  lastSentUserMessage,
  isOpeningMessage,
};
```

The full `messages` array is STILL maintained. It is still returned from the hook. The evaluator, session persistence, and any future session replay feature still have access to the full history. The new fields are additive — they provide what `SingleExchangeView` needs without removing anything.

### 4. SessionContainer Changes (MODIFY: `web/src/components/live-session/SessionContainer.tsx`)

**Replace `MessageList` import and usage with `SingleExchangeView`:**

Remove:
```typescript
import { MessageList } from './MessageList';
```

Add:
```typescript
import { SingleExchangeView } from './SingleExchangeView';
```

**Update the destructured WebSocket hook return** (around line 264):

Add the new fields:
```typescript
const {
  connectionState,
  lastError,
  messages,           // Keep — still needed for evaluator/persistence
  streamingContent,
  currentPointIndex,
  totalPoints,
  isWaitingForResponse,
  sendUserMessage,
  triggerEvaluation,
  endSession,
  connect,
  latestAssistantMessage,   // NEW
  lastSentUserMessage,       // NEW
  isOpeningMessage,           // NEW
} = useSessionWebSocket(sessionId, {
  // ... existing callbacks
});
```

**Replace the `<MessageList>` JSX** (currently around line 393-398):

Current:
```tsx
<MessageList
  messages={messages}
  streamingContent={streamingContent}
  isThinking={isWaitingForResponse && !streamingContent}
  className="flex-1"
/>
```

Replace with:
```tsx
<SingleExchangeView
  currentAssistantMessage={latestAssistantMessage}
  isStreaming={!!streamingContent}
  streamingContent={streamingContent || ''}
  userMessageSent={lastSentUserMessage}
  isLoading={isWaitingForResponse && !streamingContent}
  isOpeningMessage={isOpeningMessage}
  className="flex-1"
/>
```

**Remove the evaluation feedback banner** (lines ~375-389):

The `lastEvaluation` banner that shows "Great recall!" / "Keep practicing" is no longer appropriate in the single-exchange view. Evaluation feedback is now invisible (handled by T06's evaluator feedback injection into the tutor prompt). Remove the entire evaluation banner `div`:

```tsx
{/* Remove this entire block: */}
{lastEvaluation && (
  <div className={`mb-4 p-4 rounded-xl ...`}>
    ...
  </div>
)}
```

Also remove the `lastEvaluation` state variable and `handleEvaluationResult` callback if they are no longer used by any other part of the component. If other code still references `lastEvaluation`, keep the state but remove the visual rendering.

### 5. MessageList.tsx — Keep But Unused

Do NOT delete `MessageList.tsx`. It may be useful for:
- Session replay feature (viewing past session transcripts)
- Debugging (toggling chat view for development)
- Future "review mode" where a user replays their session

Add a comment at the top of the file:

```typescript
/**
 * Message List Component for Live Sessions
 *
 * NOTE: This component is no longer used during live sessions (replaced by
 * SingleExchangeView in T12). It is preserved for potential use in session
 * replay, debugging, and review features.
 *
 * ...existing docs...
 */
```

### 6. Text Styling in SingleExchangeView

The AI text in SingleExchangeView is NOT in a chat bubble. It is rendered as large, readable text that fills the content area:

- **Font size**: `text-lg` (18px) — larger than the chat bubble text for readability
- **Line height**: `leading-relaxed` (1.625) — generous spacing for easy reading
- **Color**: `text-white` for AI text, `text-blue-100` for the brief user message flash
- **Alignment**: Left-aligned, flowing naturally. Not centered text (that would be hard to read for longer responses).
- **Max width**: `max-w-3xl` container constrains line length for readability (48rem / 768px)
- **No chat bubble**: No rounded rectangle background, no message-bubble styling. Just clean text on the dark session background.
- **Label**: Small "Agent" label above AI text in `text-clarity-400`, uppercase, tracking-wide. No "AI Tutor" label.

### 7. Interaction with Voice Input (T10)

The single-exchange view pairs with the VoiceInput component:

1. User sees AI question text (large, readable)
2. User taps mic in the input bar below
3. Waveform visualization appears in the input bar during recording
4. User stops recording, reviews transcription in the input bar
5. User approves (swipe up / Enter)
6. Their message briefly flashes in the main content area (200ms animation)
7. Loading dots appear
8. AI response streams in, replacing everything
9. User sees only the new AI text + input bar

This flow is clean and focused. No distractions from previous exchanges.

### 8. Rabbit Hole Mode

During rabbit holes (T09, future task), the single-exchange view behaves identically. There is no mini-history or multi-exchange view during rabbit holes. Consistency is more important than showing context — the evaluator has the full history and the AI agent has full context via the conversation history in its prompt. The user does not need to see it.

### 9. No Scrolling Conversation

There is intentionally no way for the user to scroll up and see previous exchanges during a live session. The `messages` array is not rendered. The `overflow-y-auto` on the content container only applies to the CURRENT AI text (which might be long enough to need scrolling within a single response), not to a conversation history.

---

## Relevant Files

| Action | File | What Changes |
|--------|------|-------------|
| CREATE | `web/src/components/live-session/SingleExchangeView.tsx` | New component: single-exchange view with phase-based rendering (showing_ai, user_sent, loading, ai_streaming) |
| MODIFY | `web/src/components/live-session/SessionContainer.tsx` | Replace `MessageList` with `SingleExchangeView`; add new WebSocket hook fields; remove evaluation feedback banner |
| MODIFY | `web/src/hooks/use-session-websocket.ts` | Add `latestAssistantMessage`, `lastSentUserMessage`, `isOpeningMessage` state; update handlers for `session_started`, `assistant_complete`, and `sendUserMessage` |
| MODIFY | `web/src/components/live-session/MessageList.tsx` | Add deprecation comment; no functional changes — preserved for future session replay |
| MODIFY | `tailwind.config.ts` (or `web/src/index.css`) | Add `animate-fade-in` keyframe and animation utility if not already present |

---

## Success Criteria

1. **Only one exchange visible**: At any point during a live session, the user sees ONLY the AI's current text and the input bar. No previous messages are visible. No scroll history.

2. **AI text is not in a chat bubble**: The AI's text is rendered as large, readable text (`text-lg`, `text-white`) directly in the content area with a small "Agent" label above it. No rounded-rectangle bubble, no message-pair layout.

3. **Opening message appears without animation**: When the session starts and the AI's first message arrives, it appears immediately (no fade-in animation). `isOpeningMessage=true` suppresses the entrance animation.

4. **Subsequent messages animate**: After the opening message, all new AI responses use the `animate-fade-in` transition (300ms opacity fade-in).

5. **User message animation**: When the user sends a message, their text briefly appears in the content area with a blue-tinted style, then animates upward (`-translate-y-4`) and fades out (`opacity-0`) over 200ms. The total visibility window is ~400ms.

6. **Loading indicator**: After the user message fades, pulsing dots appear in the "Agent" section to indicate the AI is processing. The dots use the same `animate-bounce` pattern already used in the existing `MessageList` typing indicator.

7. **Streaming works**: When the AI response starts streaming, the loading dots are replaced with progressively appearing text (via `streamingContent`). A blinking cursor appears at the end of the streaming text.

8. **Streaming completion**: When streaming completes, the view transitions to the `showing_ai` phase with the full response text. The blinking cursor disappears.

9. **Full conversation history maintained in memory**: The `messages` array in `use-session-websocket.ts` still accumulates every message (user and assistant) for the entire session. It is still returned from the hook. The evaluator (T06) can access all messages.

10. **Full conversation history stored in database**: No changes to how messages are saved to the database. Every message is persisted via the existing `saveMessage()` calls in `SessionEngine`.

11. **Smooth transitions**: All phase transitions use CSS transitions/animations (opacity, transform). No jarring content jumps. Transitions are 200-300ms — fast enough to feel snappy, slow enough to be perceived.

12. **Works with voice input**: The single-exchange view functions correctly when the user inputs via voice (T10's VoiceInput). The flow: see AI text -> speak response -> review in input bar -> approve -> user text animates up -> loading -> AI streams in.

13. **Works with text input**: The single-exchange view functions correctly when the user types their response. The flow is identical to voice: type -> Enter -> user text animates up -> loading -> AI streams in.

14. **During rabbit holes, same behavior**: If a rabbit hole is active (T09), the single-exchange view still shows only the latest exchange. No mini-history, no expanded view.

15. **FormattedText used**: Both the AI text and the brief user text animation use the `FormattedText` component (from T03) to render LaTeX and code notation correctly.

16. **No evaluation banner**: The "Great recall!" / "Keep practicing" evaluation feedback banner that existed in `SessionContainer` is removed. Evaluation feedback is now invisible (processed by the evaluator and injected into the tutor's context, never shown to the user).

17. **MessageList preserved**: `MessageList.tsx` still exists in the codebase with a comment noting it is no longer used in live sessions but preserved for session replay. No functional changes to the file.

18. **Scrolling within a single response**: If the AI's current response is long enough to exceed the viewport, the user can scroll within the content area to read it. The `overflow-y-auto` on the content container enables this. But there is no scrolling to previous exchanges.

19. **Empty state before first message**: Before the AI's first message arrives (during initial connection), the view shows "Starting session..." centered text. No chat bubbles, no "Connecting to your study session..." in a chat format.

20. **Phase state machine is correct**: The `ExchangePhase` transitions follow this strict order: `showing_ai` -> `user_sent` (200-400ms) -> `loading` -> `ai_streaming` -> `showing_ai` (repeat). No phase can be skipped. No two phases render simultaneously. If props change unexpectedly (e.g., streaming starts before loading is shown), the component handles it gracefully by jumping to the appropriate phase.

---

## Implementation Warnings

> **WARNING: `FormattedText` component dependency on T03**
> `SingleExchangeView` imports `FormattedText` from `'../shared/FormattedText'`. This component is created by T03 (Transcription Processing Pipeline) — it does not currently exist in the codebase. T12 has a hard dependency on T10 (Voice Input) but only a soft/implicit dependency on T03 for `FormattedText`. If T03 has not landed when T12 is implemented, either:
> 1. Create a minimal `FormattedText` stub that just renders `<span>{content}</span>`, or
> 2. Render the content directly without the `FormattedText` wrapper and add it later.
> Document this dependency clearly.

> **WARNING: `UseSessionWebSocketReturn` interface needs updating**
> The hook's returned object type (`UseSessionWebSocketReturn` in `use-session-websocket.ts`) must be updated to include the three new fields: `latestAssistantMessage`, `lastSentUserMessage`, and `isOpeningMessage`. The current interface does not include these. If T12 is implemented before the return type is updated, TypeScript will error when destructuring these fields in `SessionContainer.tsx`.
