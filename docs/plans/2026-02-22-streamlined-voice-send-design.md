# Streamlined Voice Send + Visible Exchange

## Problem

The current recall session voice flow is clunky: Record → Send → Transcribe → Review/Edit → Send again. Two separate "send" actions create friction. Additionally, after sending, the user briefly sees their message flash then disappear — they can't see what they said while waiting for the next AI prompt.

## Design

### 1. Voice Flow: Auto-send after transcription

**Current:** idle → recording → transcribing → review (edit) → manual send → idle
**New:** idle → recording → transcribing → auto-send → idle

- `useVoiceInput` hook: After successful transcription in `initial` mode, call `onSend(text)` directly instead of entering `review` state. State goes `transcribing → idle`.
- `VoiceInput` component: Remove the `review` state rendering (textarea, voice-edit, cancel/send). Remove voice-edit functionality entirely.
- Text mode: Unchanged.

### 2. Message Display: Both messages visible during wait

**Current phases:** `showing_ai → user_sent (200ms flash) → loading (dots) → ai_streaming → showing_ai`
**New phases:** `showing_ai → awaiting_response → ai_streaming → showing_ai`

The `awaiting_response` phase shows:
- Agent's last completed message (top, standard agent styling)
- User's sent message (below, blue user styling)
- Loading dots (below both, indicating AI is thinking)

This persists until AI streaming begins, then transitions to `ai_streaming` showing only the new response.

### 3. WebSocket Hook: Persistent user message

- `lastSentUserMessage`: Remove the 500ms auto-clear timeout. Instead, clear when `assistant_chunk` or `assistant_complete` arrives.
- This keeps the user's message visible throughout the entire wait period.

### 4. VoiceInput: Transcribing state shows in SingleExchangeView

- During transcription, the `VoiceInput` component still shows its transcribing spinner at the bottom.
- The `SingleExchangeView` stays in `showing_ai` phase until the message is actually sent.
- After auto-send, `SingleExchangeView` transitions to `awaiting_response`.

## Files to Change

1. `web/src/hooks/use-voice-input.ts` — Remove review state, auto-send after transcription
2. `web/src/components/live-session/VoiceInput.tsx` — Remove review UI, voice-edit, simplify
3. `web/src/components/live-session/SingleExchangeView.tsx` — New `awaiting_response` phase
4. `web/src/hooks/use-session-websocket.ts` — Remove 500ms clear timeout for lastSentUserMessage
