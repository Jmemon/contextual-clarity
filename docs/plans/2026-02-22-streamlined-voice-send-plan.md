# Streamlined Voice Send + Visible Exchange — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the review/edit step from voice input so it auto-sends after transcription, and show both the agent message and user message while waiting for the next AI response.

**Architecture:** Four files change: the voice hook skips review state and auto-sends, the VoiceInput component drops review UI, the SingleExchangeView gets a new `awaiting_response` phase showing both messages, and the WebSocket hook stops auto-clearing the user message after 500ms.

**Tech Stack:** React, TypeScript, Tailwind CSS

---

### Task 1: WebSocket Hook — Remove 500ms auto-clear of lastSentUserMessage

**Files:**
- Modify: `web/src/hooks/use-session-websocket.ts:741-779` (sendUserMessage)
- Modify: `web/src/hooks/use-session-websocket.ts:470-492` (handleMessage — assistant_chunk + assistant_complete)

**Step 1: Remove the 500ms timeout from sendUserMessage**

In `sendUserMessage` (line 741), remove the timeout that clears `lastSentUserMessage` after 500ms. The message should persist until the AI starts streaming.

Replace lines 767-776:
```typescript
      // T12: Set the flash message and auto-clear after 500ms.
      // Cancel any previous pending clear so rapid sends don't clear too early.
      if (lastSentClearTimeoutRef.current) {
        clearTimeout(lastSentClearTimeoutRef.current);
      }
      setLastSentUserMessage(content.trim());
      lastSentClearTimeoutRef.current = setTimeout(() => {
        setLastSentUserMessage(null);
        lastSentClearTimeoutRef.current = null;
      }, 500);
```

With:
```typescript
      // Set the user message — stays visible in SingleExchangeView until AI streaming begins.
      setLastSentUserMessage(content.trim());
```

**Step 2: Clear lastSentUserMessage when AI streaming starts**

In `handleMessage`, inside the `assistant_chunk` case (line 470), add a clear:

```typescript
        case 'assistant_chunk':
          // Clear the user's sent message once AI starts streaming
          setLastSentUserMessage(null);
          // Append chunk to streaming content
          setStreamingContent((prev) => prev + message.content);
          break;
```

Also clear it in `assistant_complete` (line 475) as a safety net in case chunks are skipped:

Add `setLastSentUserMessage(null);` right after `setMessages(...)` and before `setStreamingContent('')`.

**Step 3: Remove the lastSentClearTimeoutRef**

- Remove the ref declaration at line 333: `const lastSentClearTimeoutRef = useRef<...>(null);`
- Remove the cleanup in the unmount effect (lines 839-841):
  ```typescript
      if (lastSentClearTimeoutRef.current) {
        clearTimeout(lastSentClearTimeoutRef.current);
      }
  ```

**Step 4: Verify**

Run: `cd web && bunx tsc --noEmit`
Expected: No type errors.

**Step 5: Commit**

```bash
git add web/src/hooks/use-session-websocket.ts
git commit -m "T-voice: persist lastSentUserMessage until AI streams"
```

---

### Task 2: useVoiceInput Hook — Auto-send after transcription (skip review)

**Files:**
- Modify: `web/src/hooks/use-voice-input.ts`

**Step 1: Add onSend callback to hook options**

Add `onSend` to `UseVoiceInputOptions` (line 29):

```typescript
export interface UseVoiceInputOptions {
  sessionId?: string;
  /** Called automatically after transcription completes — sends the message */
  onSend?: (text: string) => void;
  onCorrectionComplete?: (correctedText: string) => void;
}
```

**Step 2: Auto-send instead of entering review state**

In `stopAndSend` (around line 355), replace the `initial` mode branch:

Replace:
```typescript
          setTranscribedText(result.text);
          setState('review');
```

With:
```typescript
          // Auto-send: skip review, fire callback directly, return to idle
          optionsRef.current.onSend?.(result.text);
          setState('idle');
```

**Step 3: Remove voice-edit mode and review-related exports**

Since there's no review state, voice-edit is no longer reachable. Remove:
- The `voice-edit` branch in `stopAndSend` (lines 373-399 — the entire `else` block)
- `startVoiceEdit` function (line 424-426)
- `setTranscribedText` from the return value
- `startVoiceEdit` from the return value
- `transcribedText` from the return value (keep internal state if needed for error recovery, but don't export)
- `isVoiceEdit` from the return value
- The `RecordingMode` type (simplify — only `initial` mode exists now)
- `modeRef` usage (always `initial`)
- `applyCorrection` function (lines 299-322)
- `transcribedTextRef` (line 89) — no longer needed

Update the `UseVoiceInputReturn` interface to remove removed fields:
```typescript
export interface UseVoiceInputReturn {
  state: VoiceInputState;
  errorMessage: string;
  waveformData: number[];
  startRecording: () => Promise<void>;
  stopAndSend: () => void;
  reset: () => void;
}
```

Update `VoiceInputState` — remove `'review'`:
```typescript
export type VoiceInputState = 'idle' | 'recording' | 'transcribing' | 'error';
```

Simplify `startRecordingInternal` — remove `mode` parameter since it's always `initial`:
```typescript
const startRecordingInternal = useCallback(async () => {
    cleanup();
    chunksRef.current = [];
    // ... rest stays the same but without modeRef
```

And `startRecording` just calls `startRecordingInternal()`.

**Step 4: Verify**

Run: `cd web && bunx tsc --noEmit`
Expected: Type errors in VoiceInput.tsx (expected — it still references removed fields). That's Task 3.

**Step 5: Commit**

```bash
git add web/src/hooks/use-voice-input.ts
git commit -m "T-voice: auto-send after transcription, remove review state"
```

---

### Task 3: VoiceInput Component — Remove review UI, wire auto-send

**Files:**
- Modify: `web/src/components/live-session/VoiceInput.tsx`

**Step 1: Update hook usage**

Replace the hook destructuring (lines 101-112):

```typescript
  const {
    state: voiceState,
    errorMessage,
    waveformData,
    startRecording,
    stopAndSend,
    reset: resetVoice,
  } = useVoiceInput({ sessionId, onSend: onSend });
```

**Step 2: Remove review-related handlers and state**

Delete:
- `handleVoiceSend` (lines 118-122) — no longer needed, auto-send handles it
- `handleReviewKeyDown` (lines 140-145)
- `handleTouchStart` / `handleTouchEnd` (lines 147-160) — swipe-up was for review
- `touchStartYRef` (line 98)

**Step 3: Remove review state rendering block**

Delete the entire `{voiceState === 'review' && (...)}` block (lines 313-378).

**Step 4: Remove touch handlers from root div**

Remove `onTouchStart` and `onTouchEnd` from the voice mode root `<div>`.

**Step 5: Verify**

Run: `cd web && bunx tsc --noEmit`
Expected: No type errors. The full pipeline compiles.

**Step 6: Commit**

```bash
git add web/src/components/live-session/VoiceInput.tsx
git commit -m "T-voice: remove review UI, wire auto-send to hook"
```

---

### Task 4: SingleExchangeView — New `awaiting_response` phase

**Files:**
- Modify: `web/src/components/live-session/SingleExchangeView.tsx`

**Step 1: Add `awaiting_response` to ExchangePhase**

```typescript
export type ExchangePhase = 'showing_ai' | 'awaiting_response' | 'ai_streaming';
```

Remove `user_sent` and `loading` — they're replaced by `awaiting_response`.

**Step 2: Rewrite phase resolution logic**

Replace the phase resolution `useEffect` (lines 112-124):

```typescript
  useEffect(() => {
    if (isStreaming) {
      setPhase('ai_streaming');
    } else if (userMessageSent !== null || isLoading) {
      // User has sent a message and we're waiting for AI — show both messages
      setPhase('awaiting_response');
    } else {
      setPhase('showing_ai');
    }
  }, [userMessageSent, isLoading, isStreaming]);
```

**Step 3: Remove visibleUserMessage state and its cleanup effect**

Delete:
- `visibleUserMessage` state (line 102)
- The cleanup `useEffect` for `visibleUserMessage` (lines 128-136)

**Step 4: Remove old `user_sent` and `loading` render blocks**

Delete the `{phase === 'user_sent' && ...}` block (lines 200-215).
Delete the `{phase === 'loading' && ...}` block (lines 220-243).

**Step 5: Add new `awaiting_response` render block**

After the `showing_ai` block, add:

```tsx
      {/* ------------------------------------------------------------------ */}
      {/* Phase: awaiting_response — agent message + user message + dots      */}
      {/* ------------------------------------------------------------------ */}
      {phase === 'awaiting_response' && (
        <div className="flex flex-col gap-6">
          {/* Agent's last message (the prompt the user responded to) */}
          {currentAssistantMessage && (
            <div>
              <p className="text-clarity-400 text-xs font-medium uppercase tracking-wider mb-3">
                Agent
              </p>
              <FormattedText
                content={currentAssistantMessage}
                className="text-lg leading-relaxed text-white"
              />
            </div>
          )}

          {/* User's sent message */}
          {userMessageSent && (
            <div>
              <p className="text-blue-300 text-xs font-medium uppercase tracking-wider mb-3">
                You
              </p>
              <FormattedText
                content={userMessageSent}
                className="text-lg leading-relaxed text-blue-100"
              />
            </div>
          )}

          {/* Loading dots — AI is thinking */}
          <div>
            <p className="text-clarity-400 text-xs font-medium uppercase tracking-wider mb-3">
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
        </div>
      )}
```

**Step 6: Clean up unused animation code**

The `animate-user-flash` CSS class is no longer needed (it was for the user_sent flash). Check if it's defined in a Tailwind config or global CSS — if so, leave it (cleanup is separate). No code changes needed here since we just stopped referencing it.

**Step 7: Verify**

Run: `cd web && bunx tsc --noEmit`
Expected: No type errors.

**Step 8: Manual test**

Start the app: `cd web && bun run dev`

1. Start a recall session
2. Press mic, speak, press send
3. Verify: transcription spinner appears in VoiceInput area, then auto-sends
4. Verify: after auto-send, both the agent's prompt and your transcribed message appear
5. Verify: loading dots appear below both messages
6. Verify: when AI starts streaming, view transitions to show only the new AI response
7. Verify: text mode still works (type, press Enter, same awaiting_response view)

**Step 9: Commit**

```bash
git add web/src/components/live-session/SingleExchangeView.tsx
git commit -m "T-voice: awaiting_response phase shows both messages while waiting"
```
