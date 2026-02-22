# Batch Transcription Rework — Design Document

**Date:** 2026-02-22
**Branch:** discussion-refine
**Status:** Approved

## Problem

Voice input hangs on "processing text" after recording stops. The current architecture uses a real-time Deepgram WebSocket for streaming transcription — when the WebSocket doesn't cleanly finalize, the UI gets stuck. Additionally, real-time transcription adds unnecessary complexity since we don't display interim results in any meaningful way before the user is done speaking.

## Decision

Replace real-time WebSocket streaming with server-side batch transcription via Deepgram's REST pre-recorded API. The frontend records audio into a blob, uploads it to a new server endpoint, and receives the full transcript back in a single HTTP response.

## New User Flow

```
idle → recording → transcribing → review → (voice-edit → transcribing → review) → sent
```

1. **Idle** — Mic button + keyboard switch
2. **Recording** — Waveform visualization, **Send button** (not stop). Audio accumulates in a blob.
3. **Transcribing** — HTTP POST with audio blob. Spinner shown. Clear timeout (30s).
4. **Review** — Pipeline-processed text in editable textarea. Three actions:
   - Manual edit (type in textarea)
   - Voice edit (record instruction → batch transcribe → Haiku correction → updated text)
   - Send (submit message)
5. **Error** — Message + retry/keyboard fallback

## Architecture

### Backend

#### New: `POST /api/voice/transcribe`

Accepts audio file + optional sessionId. Returns transcribed (and optionally pipeline-processed) text.

```
Request:  multipart/form-data { audio: File, sessionId?: string }
Response: { success: true, data: { text: string, rawText: string, corrections: [...], hasNotation: boolean } }
```

Flow:
1. Validate audio file (exists, size < 5MB, duration sanity)
2. Convert to Buffer
3. Call `deepgram.listen.prerecorded.transcribeFile(buffer, options)`
4. Extract transcript from response
5. If sessionId provided:
   a. Look up session → recall set → recall points
   b. Extract terminology (cached per recallSetId)
   c. Run TranscriptionPipeline.process(rawText)
   d. Return pipeline output
6. If no sessionId: return raw transcript

#### Modified: `src/core/voice/deepgram-client.ts`

Add `transcribeAudio(apiKey, audioBuffer, mimeType)` function:
- Uses Deepgram SDK `listen.prerecorded.transcribeFile()`
- Config: `{ model: 'nova-2', language: 'en', smart_format: true, punctuate: true }`
- No `interim_results`, no `utterances` (pre-recorded doesn't use these)
- Returns the transcript string

#### Removed: `POST /api/voice/token`

No longer needed — the frontend never talks to Deepgram directly. API key stays server-side.

#### Kept: `POST /api/voice/correct`

Unchanged. Still accepts `{ currentText, correctionInstruction }` and returns `{ correctedText }` via Claude Haiku.

#### New: Terminology cache

Simple in-memory `Map<string, string[]>` keyed by recallSetId. Populated on first transcription request for a given recall set. Avoids re-running the Haiku terminology extraction LLM call on every transcription.

### Frontend

#### Rewritten: `web/src/hooks/use-voice-input.ts`

**Removed:**
- Deepgram WebSocket connection (`DEEPGRAM_WS_URL`, `DEEPGRAM_PARAMS`)
- Token fetching (`fetchToken`)
- WebSocket message handlers (`onmessage`, `onclose`, `onerror`)
- Interim text state (`interimText`, `accumulatedTextRef`)
- Chunk streaming to WebSocket (`ondataavailable → ws.send`)

**Added:**
- Audio chunk accumulation into array → Blob on stop
- `transcribeAudio(blob, sessionId?)` — POST to `/api/voice/transcribe`
- AbortController for cancelling in-flight transcription requests
- 30-second timeout on transcription fetch

**Kept:**
- MediaRecorder setup (mic permission, stream, mimeType detection)
- AudioContext + AnalyserNode for waveform visualization
- Cleanup on unmount
- State machine (updated states)
- `setTranscribedText` for manual editing
- Error handling for mic permission denied

**New state type:**
```typescript
type VoiceInputState = 'idle' | 'recording' | 'transcribing' | 'review' | 'error';
```

Note: `correction` state removed — voice-edit reuses `recording` + `transcribing` states with a mode flag.

**New mode tracking:**
```typescript
type RecordingMode = 'initial' | 'voice-edit';
```

When `mode === 'voice-edit'`, after transcription completes, the transcribed text is sent to `/api/voice/correct` instead of displayed directly.

**Key behavioral change — `stopAndSend()`:**
```typescript
// 1. Stop MediaRecorder → fires final ondataavailable
// 2. Collect all chunks into Blob
// 3. Stop waveform animation + release mic
// 4. Set state to 'transcribing'
// 5. POST blob to /api/voice/transcribe
// 6. On success: set transcribedText, state → 'review'
// 7. On failure: state → 'error'
```

The `ondataavailable` → Blob collection uses a Promise pattern:
```typescript
// MediaRecorder.stop() triggers one final ondataavailable, then onstop
// We resolve the Promise in onstop to guarantee all chunks are collected
```

#### Modified: `web/src/components/live-session/VoiceInput.tsx`

**UI changes:**
- Recording state: Send button (arrow icon) replaces red stop button
- Remove interim text display during recording (no longer exists)
- Remove `processing` state rendering (replaced by `transcribing`)
- `transcribing` state: spinner + "Transcribing..." text
- Review state: voice-edit button triggers new recording in `voice-edit` mode
- Voice-edit recording shows different helper text ("Speak your edit instruction...")

**Props change:**
- Remove `onProcessTranscription` prop (pipeline now runs server-side)
- Add `sessionId?: string` prop (passed to transcribe endpoint)

#### Modified: `web/src/components/live-session/SessionContainer.tsx`

- Pass `sessionId` to VoiceInput so it can include it in transcribe requests
- Remove `onProcessTranscription` callback wiring

### Removed: `DEEPGRAM_CONFIG.interim_results`

Update `src/core/voice/deepgram-client.ts` to remove streaming-specific config fields (`interim_results`, `utterances`). Replace with pre-recorded config.

## Edge Cases & Paranoia

### Audio blob collection race condition
When `MediaRecorder.stop()` is called, one final `ondataavailable` fires asynchronously, then `onstop` fires. We MUST wait for `onstop` before creating the Blob. Using a Promise resolved in the `onstop` handler prevents sending an incomplete blob.

### Safari/iOS audio format
Safari doesn't support webm — records as `audio/mp4`. The existing `getMimeType()` helper handles detection. We pass the actual mimeType as the Content-Type to Deepgram, which accepts both webm and mp4.

### Empty recording
User taps mic then immediately taps send → very short audio → Deepgram returns empty transcript. Handle: if transcript is empty string, go back to `idle` state (don't show empty review).

### Concurrent recordings
User rapidly taps mic → send → mic → send. The `cleanup()` call at the start of `startRecording()` already handles this. For in-flight transcription requests, use AbortController — abort the previous request before starting a new recording.

### Network failure during upload
fetch throws → catch → error state with "Failed to transcribe. Try again or use keyboard." message.

### Deepgram API timeout
Set 30-second timeout via AbortController.signal with setTimeout. If exceeded, abort and show error.

### Audio blob size
Cap at 5MB server-side (enforced in the route handler). For reference: 60 seconds of webm/opus = ~120KB, so 5MB allows ~40 minutes — well beyond any reasonable voice message.

### Pipeline failure
If the terminology extraction or pipeline Haiku call fails, the transcribe endpoint falls back to returning the raw Deepgram transcript. The existing pipeline `parseResponse` already handles this gracefully.

### Memory: audio blob lifecycle
The Blob is created in the browser, uploaded via fetch, then the reference is released. No persistent memory leak. The server receives it as a Buffer, processes it, then lets it be GC'd.

### Mic permission persists
Browser mic permission from the first recording persists for subsequent voice-edit recordings in the same session. No re-prompt.

### Waveform during voice-edit
Same AnalyserNode-based waveform works for voice-edit recordings. No change needed.

### AbortController cleanup on unmount
If the component unmounts while a transcription request is in-flight, the cleanup effect must call `abortController.abort()` to prevent state updates on an unmounted component.

## Files Changed Summary

| File | Action | Description |
|------|--------|-------------|
| `src/core/voice/deepgram-client.ts` | Modify | Add `transcribeAudio()`, update config for pre-recorded |
| `src/core/voice/index.ts` | Modify | Update exports |
| `src/api/routes/voice.ts` | Rewrite | Remove token endpoint, add transcribe endpoint, keep correct |
| `src/api/routes/index.ts` | Modify | Update API info endpoint descriptions |
| `web/src/hooks/use-voice-input.ts` | Rewrite | Remove WebSocket, add blob capture + HTTP transcription |
| `web/src/components/live-session/VoiceInput.tsx` | Modify | New state rendering, send button, sessionId prop |
| `web/src/components/live-session/SessionContainer.tsx` | Modify | Pass sessionId, remove onProcessTranscription |

## Not Changed

- `src/core/transcription/pipeline.ts` — Used as-is by the transcribe endpoint
- `src/core/transcription/terminology-extractor.ts` — Used as-is, wrapped in cache
- `src/core/transcription/correction-processor.ts` — Used as-is by correct endpoint
- `src/api/ws/session-handler.ts` — No changes, message flow unchanged
- `web/src/components/live-session/Waveform.tsx` — No changes, still receives amplitude data
