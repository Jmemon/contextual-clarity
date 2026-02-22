# Batch Transcription Rework — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace real-time Deepgram WebSocket streaming with server-side batch transcription so voice input never hangs.

**Architecture:** Frontend records audio into a Blob via MediaRecorder, uploads it to a new `POST /api/voice/transcribe` endpoint, which calls Deepgram's pre-recorded REST API and optionally runs the TranscriptionPipeline. The WebSocket token endpoint and all client-side Deepgram code are removed.

**Tech Stack:** Deepgram SDK v3 (`@deepgram/sdk`), Hono REST routes, React hooks, MediaRecorder API, existing TranscriptionPipeline + terminology extractor.

**Design doc:** `docs/plans/2026-02-22-batch-transcription-design.md`

---

### Task 1: Backend — Add `transcribeAudio()` to Deepgram Client

**Files:**
- Modify: `src/core/voice/deepgram-client.ts`
- Modify: `src/core/voice/index.ts`

**Context:** The existing file has `createDeepgramClient()` and a `DEEPGRAM_CONFIG` constant with streaming-specific fields. We need a function that takes an audio Buffer and returns a transcript string via Deepgram's pre-recorded API.

**Step 1: Rewrite `src/core/voice/deepgram-client.ts`**

Replace the entire file. Remove `DEEPGRAM_CONFIG` (streaming-only, no longer used). Add `transcribeAudio()`.

```typescript
/**
 * Deepgram Client — Server-side batch transcription
 *
 * Provides a single function to transcribe an audio buffer via Deepgram's
 * pre-recorded (REST) API. Replaces the old streaming WebSocket approach.
 *
 * The Deepgram API key stays server-side — the frontend never talks to
 * Deepgram directly. Audio is uploaded to our server, transcribed here,
 * and the text is returned.
 */

import { createClient } from '@deepgram/sdk';

/**
 * Transcribe an audio buffer using Deepgram's pre-recorded API.
 *
 * @param apiKey - Deepgram API key (from server config, never exposed to client)
 * @param audioBuffer - Raw audio data as a Buffer (webm, mp4, wav, etc.)
 * @returns The full transcript string, or empty string if no speech detected
 * @throws Error if Deepgram API call fails
 */
export async function transcribeAudio(
  apiKey: string,
  audioBuffer: Buffer
): Promise<string> {
  const deepgram = createClient(apiKey);

  const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
    audioBuffer,
    {
      model: 'nova-2',
      language: 'en',
      smart_format: true,
      punctuate: true,
    }
  );

  if (error) {
    throw new Error(`Deepgram transcription failed: ${error.message}`);
  }

  // Extract the transcript from the first channel's first alternative.
  // Deepgram always returns at least one channel with one alternative,
  // but we guard against unexpected response shapes.
  const transcript =
    result?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';

  return transcript.trim();
}
```

**Step 2: Update `src/core/voice/index.ts`**

Replace the old exports:

```typescript
export { transcribeAudio } from './deepgram-client';
```

**Step 3: Verify the module compiles**

Run: `cd /Users/johnmemon/Desktop/contextual-clarity && npx tsc --noEmit --pretty 2>&1 | grep -E "error TS|Found" | head -20`

Expected: No errors in `src/core/voice/` files. There WILL be errors in `src/api/routes/voice.ts` because it still imports `createDeepgramClient` — that's expected and fixed in Task 3.

**Step 4: Commit**

```bash
git add src/core/voice/deepgram-client.ts src/core/voice/index.ts
git commit -m "T1: Replace Deepgram streaming config with batch transcribeAudio()"
```

---

### Task 2: Backend — Terminology Cache

**Files:**
- Create: `src/core/voice/terminology-cache.ts`
- Modify: `src/core/voice/index.ts`

**Context:** The `extractTerminology()` function makes a Haiku LLM call to extract domain terms from a recall set's points. It should run once per recall set and be cached. The transcribe endpoint (Task 3) will use this cache.

**Step 1: Create `src/core/voice/terminology-cache.ts`**

```typescript
/**
 * Terminology Cache
 *
 * In-memory cache for domain-specific terminology extracted per recall set.
 * Avoids re-running the Haiku LLM call on every transcription request.
 *
 * Cache is keyed by recallSetId. Entries persist for the lifetime of the
 * server process — this is fine because terminology doesn't change for a
 * given recall set, and server restarts are infrequent.
 */

import { AnthropicClient } from '../../llm/client';
import { extractTerminology } from '../transcription/terminology-extractor';

const cache = new Map<string, string[]>();

/**
 * Get terminology for a recall set, extracting and caching on first access.
 *
 * @param recallSetId - The recall set ID to use as cache key
 * @param recallSetName - The recall set name (passed to extractor)
 * @param recallPoints - The recall points array (content + context fields)
 * @returns Array of domain-specific terms
 */
export async function getTerminology(
  recallSetId: string,
  recallSetName: string,
  recallPoints: Array<{ content: string; context: string }>
): Promise<string[]> {
  const cached = cache.get(recallSetId);
  if (cached) return cached;

  // Dedicated LLM client for terminology extraction — not shared with session
  const llmClient = new AnthropicClient({ maxTokens: 1024, temperature: 0 });
  const terms = await extractTerminology(
    { name: recallSetName },
    recallPoints,
    llmClient
  );

  cache.set(recallSetId, terms);
  return terms;
}

/**
 * Clear the terminology cache. Useful for testing.
 */
export function clearTerminologyCache(): void {
  cache.clear();
}
```

**Step 2: Update `src/core/voice/index.ts`**

```typescript
export { transcribeAudio } from './deepgram-client';
export { getTerminology, clearTerminologyCache } from './terminology-cache';
```

**Step 3: Verify compilation**

Run: `cd /Users/johnmemon/Desktop/contextual-clarity && npx tsc --noEmit --pretty 2>&1 | grep -E "error TS" | grep "voice" | head -10`

Expected: No errors in `src/core/voice/` files.

**Step 4: Commit**

```bash
git add src/core/voice/terminology-cache.ts src/core/voice/index.ts
git commit -m "T2: Add in-memory terminology cache for batch transcription pipeline"
```

---

### Task 3: Backend — Rewrite Voice Routes

**Files:**
- Rewrite: `src/api/routes/voice.ts`
- Modify: `src/api/routes/index.ts` (update API info descriptions)

**Context:** Remove the `/voice/token` endpoint entirely. Add `POST /voice/transcribe` that accepts multipart audio + optional sessionId. Keep `/voice/correct` unchanged. The transcribe endpoint needs access to session, recall set, and recall point repositories for pipeline processing.

**Step 1: Rewrite `src/api/routes/voice.ts`**

```typescript
/**
 * Voice API Routes
 *
 * Endpoints for voice input: batch transcription and correction.
 *
 * - POST /voice/transcribe - Upload audio, get back transcribed text
 * - POST /voice/correct    - Apply a spoken correction instruction to text
 *
 * The Deepgram API key stays server-side. The frontend uploads audio to
 * our server, which calls Deepgram's pre-recorded API and optionally
 * runs the TranscriptionPipeline (terminology correction + notation detection).
 */

import { Hono } from 'hono';
import { success, error } from '../utils/response';
import { getDeepgramApiKey } from '../../config';
import { transcribeAudio, getTerminology } from '../../core/voice';
import { processCorrection } from '../../core/transcription/correction-processor';
import { TranscriptionPipeline } from '../../core/transcription/pipeline';
import { AnthropicClient } from '../../llm/client';
import { db } from '../../storage/db';
import { SessionRepository } from '../../storage/repositories/session.repository';
import { RecallSetRepository } from '../../storage/repositories/recall-set.repository';
import { RecallPointRepository } from '../../storage/repositories/recall-point.repository';

// =============================================================================
// Constants
// =============================================================================

/** Maximum audio upload size: 5MB (~40 minutes of webm/opus) */
const MAX_AUDIO_SIZE = 5 * 1024 * 1024;

// =============================================================================
// Route Definitions
// =============================================================================

export function voiceRoutes(): Hono {
  const router = new Hono();

  // Repositories for pipeline terminology lookup
  const sessionRepo = new SessionRepository(db);
  const recallSetRepo = new RecallSetRepository(db);
  const recallPointRepo = new RecallPointRepository(db);

  // ---------------------------------------------------------------------------
  // POST /voice/transcribe - Batch transcribe uploaded audio
  // ---------------------------------------------------------------------------

  /**
   * Accepts an audio file via multipart/form-data and returns the transcript.
   * If sessionId is provided, also runs the TranscriptionPipeline (terminology
   * correction + notation detection) using that session's recall set context.
   *
   * Form fields:
   * - audio: File (required) — the audio blob from MediaRecorder
   * - sessionId: string (optional) — if provided, runs pipeline with session context
   *
   * Returns 503 if DEEPGRAM_API_KEY is not configured.
   * Returns 400 if audio file is missing or too large.
   */
  router.post('/transcribe', async (c) => {
    const apiKey = getDeepgramApiKey();

    if (!apiKey) {
      return error(
        c,
        'SERVICE_UNAVAILABLE',
        'Voice input is not configured. Set DEEPGRAM_API_KEY to enable.',
        503
      );
    }

    // Parse multipart form data
    let formData: FormData;
    try {
      formData = await c.req.formData();
    } catch {
      return error(c, 'INVALID_REQUEST', 'Request must be multipart/form-data', 400);
    }

    const audioFile = formData.get('audio');
    const sessionId = formData.get('sessionId');

    // Validate audio file exists and is a File/Blob
    if (!audioFile || !(audioFile instanceof File)) {
      return error(c, 'INVALID_REQUEST', 'audio file is required', 400);
    }

    // Validate file size
    if (audioFile.size > MAX_AUDIO_SIZE) {
      return error(c, 'INVALID_REQUEST', `Audio file too large (max ${MAX_AUDIO_SIZE / 1024 / 1024}MB)`, 400);
    }

    // Validate file size is non-zero
    if (audioFile.size === 0) {
      return error(c, 'INVALID_REQUEST', 'Audio file is empty', 400);
    }

    try {
      // Convert File to Buffer for Deepgram SDK
      const arrayBuffer = await audioFile.arrayBuffer();
      const audioBuffer = Buffer.from(arrayBuffer);

      // Transcribe via Deepgram pre-recorded API
      const rawText = await transcribeAudio(apiKey, audioBuffer);

      // If no speech detected, return early
      if (!rawText) {
        return success(c, {
          text: '',
          rawText: '',
          corrections: [],
          hasNotation: false,
        });
      }

      // If no sessionId, return raw transcription (used for voice-edit instructions)
      if (!sessionId || typeof sessionId !== 'string') {
        return success(c, {
          text: rawText,
          rawText,
          corrections: [],
          hasNotation: false,
        });
      }

      // --- Pipeline processing with session context ---

      // Look up session -> recall set -> recall points for terminology
      const session = await sessionRepo.findById(sessionId);
      if (!session) {
        // Session not found — return raw text rather than failing
        console.warn(`[voice/transcribe] Session ${sessionId} not found, skipping pipeline`);
        return success(c, {
          text: rawText,
          rawText,
          corrections: [],
          hasNotation: false,
        });
      }

      const recallSet = await recallSetRepo.findById(session.recallSetId);
      if (!recallSet) {
        console.warn(`[voice/transcribe] RecallSet ${session.recallSetId} not found, skipping pipeline`);
        return success(c, {
          text: rawText,
          rawText,
          corrections: [],
          hasNotation: false,
        });
      }

      const recallPoints = await recallPointRepo.findByRecallSetId(recallSet.id);

      // Get or extract terminology (cached per recallSetId)
      const terminology = await getTerminology(
        recallSet.id,
        recallSet.name,
        recallPoints.map((p) => ({ content: p.content, context: p.context }))
      );

      // Run pipeline: terminology correction + notation detection
      const pipelineClient = new AnthropicClient({ maxTokens: 1024, temperature: 0 });
      const pipeline = new TranscriptionPipeline(pipelineClient, {
        recallSetTerminology: terminology,
        enableNotationDetection: true,
      });

      const processed = await pipeline.process(rawText);

      return success(c, {
        text: processed.displayText,
        rawText,
        corrections: processed.corrections,
        hasNotation: processed.hasNotation,
      });
    } catch (err) {
      console.error('Error transcribing audio:', err);
      return error(c, 'INTERNAL_ERROR', 'Failed to transcribe audio', 500);
    }
  });

  // ---------------------------------------------------------------------------
  // POST /voice/correct - Apply a spoken correction instruction to text
  // ---------------------------------------------------------------------------

  /**
   * Accepts the current transcription text and a spoken correction instruction,
   * then uses the correction processor (Claude Haiku) to produce the corrected
   * text. This keeps the LLM call server-side so API keys are never exposed.
   *
   * Request body: { currentText: string, correctionInstruction: string }
   * Response:     { correctedText: string }
   */
  router.post('/correct', async (c) => {
    let body: { currentText?: unknown; correctionInstruction?: unknown };

    try {
      body = await c.req.json<{ currentText?: unknown; correctionInstruction?: unknown }>();
    } catch {
      return error(c, 'INVALID_REQUEST', 'Request body must be valid JSON', 400);
    }

    const { currentText, correctionInstruction } = body;

    if (typeof currentText !== 'string' || !currentText.trim()) {
      return error(c, 'INVALID_REQUEST', 'currentText is required and must be a non-empty string', 400);
    }

    if (typeof correctionInstruction !== 'string' || !correctionInstruction.trim()) {
      return error(c, 'INVALID_REQUEST', 'correctionInstruction is required and must be a non-empty string', 400);
    }

    try {
      const correctedText = await processCorrection(currentText, correctionInstruction);
      return success(c, { correctedText });
    } catch (err) {
      console.error('Error processing voice correction:', err);
      return error(c, 'INTERNAL_ERROR', 'Failed to process correction', 500);
    }
  });

  return router;
}

export default voiceRoutes;
```

**Step 2: Update `src/api/routes/index.ts`**

In the `endpoints` array inside `createApiRouter()`, replace the two voice entries:

Change:
```
{ path: '/api/voice/token', description: 'Deepgram voice token endpoint' },
{ path: '/api/voice/correct', description: 'Apply spoken correction instruction to transcribed text' },
```
To:
```
{ path: '/api/voice/transcribe', description: 'Batch transcribe uploaded audio with optional pipeline processing' },
{ path: '/api/voice/correct', description: 'Apply spoken correction instruction to transcribed text' },
```

Also update the mount comment from "Deepgram token endpoint" to "Voice transcription and correction endpoints".

**Step 3: Verify compilation**

Run: `cd /Users/johnmemon/Desktop/contextual-clarity && npx tsc --noEmit --pretty 2>&1 | grep -E "error TS" | head -20`

Expected: No TypeScript errors. All imports resolve. (Frontend files may have type warnings from old hook interface — that's fixed in Task 5.)

**Step 4: Commit**

```bash
git add src/api/routes/voice.ts src/api/routes/index.ts
git commit -m "T3: Replace token endpoint with batch /voice/transcribe, keep /voice/correct"
```

---

### Task 4: Frontend — Rewrite `use-voice-input.ts` Hook

**Files:**
- Rewrite: `web/src/hooks/use-voice-input.ts`

**Context:** This is the biggest change. Remove all Deepgram WebSocket code. Keep MediaRecorder + AudioContext for recording/waveform. Add blob accumulation, HTTP transcription, and AbortController for cancellation.

**IMPORTANT edge cases to handle:**
- `MediaRecorder.stop()` fires `ondataavailable` then `onstop` asynchronously — must await `onstop` before creating Blob
- AbortController must be aborted on unmount AND on new recording start
- Empty transcript → go back to idle, don't show empty review
- Voice-edit mode: after transcription, send to /api/voice/correct, don't display raw instruction
- Safari mimeType detection must be preserved

**Step 1: Rewrite the entire file**

```typescript
/**
 * Voice Input Hook — Batch Transcription
 *
 * Manages the voice input lifecycle: mic permission, MediaRecorder for audio
 * capture, waveform visualization via AudioContext.AnalyserNode, and batch
 * transcription via server-side Deepgram REST API.
 *
 * State machine: idle -> recording -> transcribing -> review -> error
 *
 * Key design decisions:
 * - Audio captured as a Blob (accumulated chunks), NOT streamed
 * - Transcription happens server-side via POST /api/voice/transcribe
 * - No client-side Deepgram connection — API key stays on server
 * - AbortController cancels in-flight requests on cleanup/new recording
 * - Voice-edit reuses recording + transcribing states with a mode flag
 */

import { useState, useRef, useCallback, useEffect } from 'react';

// =============================================================================
// Types
// =============================================================================

export type VoiceInputState = 'idle' | 'recording' | 'transcribing' | 'review' | 'error';

/** Internal mode: are we recording an initial message or a voice-edit instruction? */
type RecordingMode = 'initial' | 'voice-edit';

export interface UseVoiceInputOptions {
  /** Session ID passed to the transcribe endpoint for pipeline processing */
  sessionId?: string;
  /** Called when voice-edit correction completes (updated text) */
  onCorrectionComplete?: (correctedText: string) => void;
}

export interface UseVoiceInputReturn {
  state: VoiceInputState;
  transcribedText: string;
  errorMessage: string;
  waveformData: number[];
  /** Whether currently in voice-edit mode (affects UI hint text) */
  isVoiceEdit: boolean;
  startRecording: () => Promise<void>;
  /** Stop recording and send audio for transcription */
  stopAndSend: () => void;
  /** Start a voice-edit recording (record instruction to modify current text) */
  startVoiceEdit: () => Promise<void>;
  setTranscribedText: (text: string) => void;
  reset: () => void;
}

// =============================================================================
// Constants
// =============================================================================

/** Audio chunk interval in ms — how often MediaRecorder emits data */
const CHUNK_INTERVAL_MS = 250;

/** Waveform bar count for visualization */
const WAVEFORM_BARS = 32;

/** Transcription request timeout in ms */
const TRANSCRIBE_TIMEOUT_MS = 30_000;

/**
 * Determine the best supported MIME type for MediaRecorder.
 * Falls back through webm (with opus), plain webm, mp4, and finally ''
 * (browser default) to support Safari/iOS which does not support webm.
 */
function getMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', ''];
  return candidates.find((type) => type === '' || MediaRecorder.isTypeSupported(type)) ?? '';
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function useVoiceInput(options: UseVoiceInputOptions = {}): UseVoiceInputReturn {
  const [state, setState] = useState<VoiceInputState>('idle');
  const [transcribedText, setTranscribedText] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [waveformData, setWaveformData] = useState<number[]>(() => new Array(WAVEFORM_BARS).fill(0));

  // Recording mode: 'initial' or 'voice-edit'
  const modeRef = useRef<RecordingMode>('initial');

  // Refs to avoid stale closures
  const transcribedTextRef = useRef('');
  const optionsRef = useRef(options);

  // Resource refs for cleanup
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>('');
  const abortControllerRef = useRef<AbortController | null>(null);

  // Keep refs current
  useEffect(() => { optionsRef.current = options; }, [options]);
  useEffect(() => { transcribedTextRef.current = transcribedText; }, [transcribedText]);

  // ---------------------------------------------------------------------------
  // Waveform animation
  // ---------------------------------------------------------------------------

  const startWaveformAnimation = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const animate = () => {
      analyser.getByteFrequencyData(dataArray);

      const step = Math.floor(dataArray.length / WAVEFORM_BARS);
      const bars: number[] = [];
      for (let i = 0; i < WAVEFORM_BARS; i++) {
        bars.push(dataArray[i * step] ?? 0);
      }

      setWaveformData(bars);
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);
  }, []);

  const stopWaveformAnimation = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setWaveformData(new Array(WAVEFORM_BARS).fill(0));
  }, []);

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  const cleanup = useCallback(() => {
    // Stop MediaRecorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;

    // Stop media stream tracks (release mic)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    // Close AudioContext
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }
    audioContextRef.current = null;
    analyserRef.current = null;

    // Abort any in-flight transcription request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Clear chunks
    chunksRef.current = [];

    // Stop animation
    stopWaveformAnimation();
  }, [stopWaveformAnimation]);

  // ---------------------------------------------------------------------------
  // Core: Start recording
  // ---------------------------------------------------------------------------

  const startRecordingInternal = useCallback(async (mode: RecordingMode) => {
    cleanup();
    modeRef.current = mode;
    chunksRef.current = [];

    try {
      // Request mic permission
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Set up AudioContext + AnalyserNode for waveform
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      // Start MediaRecorder — capture audio in chunks, accumulate in array
      const mimeType = getMimeType();
      mimeTypeRef.current = mimeType;
      const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(CHUNK_INTERVAL_MS);
      setState('recording');
      startWaveformAnimation();
    } catch (err) {
      cleanup();

      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setErrorMessage('Microphone permission denied. Please allow mic access and try again.');
      } else {
        setErrorMessage(err instanceof Error ? err.message : 'Failed to start recording');
      }
      setState('error');
    }
  }, [cleanup, startWaveformAnimation]);

  // ---------------------------------------------------------------------------
  // Core: Stop recording and transcribe
  // ---------------------------------------------------------------------------

  /**
   * Collect all audio chunks into a single Blob.
   * MediaRecorder.stop() fires one final ondataavailable, then onstop.
   * We MUST wait for onstop to guarantee all chunks are collected.
   */
  const collectAudioBlob = useCallback((): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        // Already stopped — use whatever chunks we have
        const mimeType = mimeTypeRef.current || 'audio/webm';
        resolve(new Blob(chunksRef.current, { type: mimeType }));
        return;
      }

      recorder.onstop = () => {
        const mimeType = mimeTypeRef.current || 'audio/webm';
        resolve(new Blob(chunksRef.current, { type: mimeType }));
      };

      recorder.onerror = () => {
        reject(new Error('MediaRecorder error during stop'));
      };

      recorder.stop();
    });
  }, []);

  /**
   * POST audio blob to /api/voice/transcribe.
   * Returns the transcript text (pipeline-processed if sessionId provided).
   */
  const transcribeBlob = useCallback(async (
    blob: Blob,
    sessionId?: string,
    signal?: AbortSignal
  ): Promise<{ text: string; rawText: string; corrections: Array<{ original: string; corrected: string }>; hasNotation: boolean }> => {
    const formData = new FormData();
    formData.append('audio', blob, 'recording');
    if (sessionId) {
      formData.append('sessionId', sessionId);
    }

    const response = await fetch('/api/voice/transcribe', {
      method: 'POST',
      body: formData,
      signal,
    });

    const data = await response.json() as {
      success?: boolean;
      data?: { text: string; rawText: string; corrections: Array<{ original: string; corrected: string }>; hasNotation: boolean };
      error?: { message?: string };
    };

    if (!response.ok || !data.success) {
      throw new Error(data.error?.message || `Transcription failed (${response.status})`);
    }

    return data.data!;
  }, []);

  /**
   * POST correction instruction to /api/voice/correct.
   * Returns the corrected text.
   */
  const applyCorrection = useCallback(async (
    currentText: string,
    correctionInstruction: string,
    signal?: AbortSignal
  ): Promise<string> => {
    const response = await fetch('/api/voice/correct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentText, correctionInstruction }),
      signal,
    });

    const data = await response.json() as {
      success?: boolean;
      data?: { correctedText?: string };
    };

    if (data.success && data.data?.correctedText) {
      return data.data.correctedText;
    }

    // If correction fails, return original text unchanged
    return currentText;
  }, []);

  /**
   * Stop recording and send for transcription. This is the "Send" action.
   */
  const stopAndSend = useCallback(async () => {
    // Stop waveform + release mic immediately for responsive UI
    stopWaveformAnimation();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    setState('transcribing');

    try {
      // Collect all audio into a blob (waits for final ondataavailable)
      const blob = await collectAudioBlob();

      if (blob.size === 0) {
        // No audio captured — go back to idle
        setState('idle');
        return;
      }

      // Set up abort controller with timeout
      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      const timeoutId = setTimeout(() => abortController.abort(), TRANSCRIBE_TIMEOUT_MS);

      try {
        const mode = modeRef.current;

        if (mode === 'initial') {
          // Initial recording: transcribe with pipeline (pass sessionId)
          const result = await transcribeBlob(
            blob,
            optionsRef.current.sessionId,
            abortController.signal
          );

          clearTimeout(timeoutId);

          if (!result.text) {
            // No speech detected — go back to idle
            setState('idle');
            return;
          }

          setTranscribedText(result.text);
          setState('review');
        } else {
          // Voice-edit: transcribe WITHOUT pipeline (it's an instruction, not content)
          const result = await transcribeBlob(
            blob,
            undefined, // no sessionId = no pipeline
            abortController.signal
          );

          clearTimeout(timeoutId);

          if (!result.text) {
            // No edit instruction detected — stay in review with existing text
            setState('review');
            return;
          }

          // Apply the transcribed instruction as a correction to the current text
          const corrected = await applyCorrection(
            transcribedTextRef.current,
            result.text,
            abortController.signal
          );

          setTranscribedText(corrected);
          optionsRef.current.onCorrectionComplete?.(corrected);
          setState('review');
        }
      } catch (err) {
        clearTimeout(timeoutId);

        if ((err as Error).name === 'AbortError') {
          setErrorMessage('Transcription timed out. Please try again.');
        } else {
          setErrorMessage((err as Error).message || 'Failed to transcribe audio');
        }
        setState('error');
      }
    } catch (err) {
      setErrorMessage((err as Error).message || 'Failed to process recording');
      setState('error');
    }
  }, [stopWaveformAnimation, collectAudioBlob, transcribeBlob, applyCorrection]);

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  const startRecording = useCallback(async () => {
    await startRecordingInternal('initial');
  }, [startRecordingInternal]);

  const startVoiceEdit = useCallback(async () => {
    await startRecordingInternal('voice-edit');
  }, [startRecordingInternal]);

  const reset = useCallback(() => {
    cleanup();
    setState('idle');
    setTranscribedText('');
    setErrorMessage('');
  }, [cleanup]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { cleanup(); };
  }, [cleanup]);

  return {
    state,
    transcribedText,
    errorMessage,
    waveformData,
    isVoiceEdit: modeRef.current === 'voice-edit',
    startRecording,
    stopAndSend,
    startVoiceEdit,
    setTranscribedText,
    reset,
  };
}
```

**Step 2: Verify no remaining imports of old exports**

Run: `cd /Users/johnmemon/Desktop/contextual-clarity && grep -r "interimText\|startCorrection\|stopRecording\|onFinalTranscription\|onProcessCorrection\|fetchToken\|DEEPGRAM_WS_URL\|DEEPGRAM_PARAMS" web/src/ --include="*.ts" --include="*.tsx" | grep -v "node_modules" | head -20`

Expected: Hits only in `VoiceInput.tsx` (which uses old hook API) — that's fixed in Task 5.

**Step 3: Commit**

```bash
git add web/src/hooks/use-voice-input.ts
git commit -m "T4: Rewrite use-voice-input hook — blob capture + batch HTTP transcription"
```

---

### Task 5: Frontend — Update VoiceInput Component

**Files:**
- Modify: `web/src/components/live-session/VoiceInput.tsx`

**Context:** Update the component to use the new hook API. Key changes:
- Add `sessionId` prop, remove `onProcessTranscription` prop
- Replace `stopRecording` with `stopAndSend` in recording state
- Replace `startCorrection` with `startVoiceEdit` in review state
- Remove `interimText` display during recording
- Replace `processing` state with `transcribing` state
- Send button (arrow icon) during recording instead of red stop button
- Different helper text for voice-edit mode

**Step 1: Rewrite the component**

```typescript
/**
 * Voice Input Component for Live Sessions
 *
 * Voice-first input that supports two modes:
 * - Voice (default): tap mic to record, server transcribes, review before sending
 * - Text (fallback): standard text input
 *
 * State-based rendering:
 * - Idle: mic button + keyboard switch
 * - Recording: waveform + send button (stops recording and transcribes)
 * - Transcribing: loading spinner
 * - Review: editable text + voice-edit mic + send button
 * - Error: error message + text fallback
 * - Text mode: standard input + mic switch + send
 *
 * Mobile: swipe-up (50px) to send. Desktop: Enter to send.
 */

import { useState, useRef, useCallback, type FormEvent, type KeyboardEvent, type HTMLAttributes, type TouchEvent } from 'react';
import { useVoiceInput } from '@/hooks/use-voice-input';
import { Waveform } from './Waveform';

// =============================================================================
// Types
// =============================================================================

export interface VoiceInputProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onSubmit'> {
  /** Callback when a message is sent (voice or text) */
  onSend: (message: string) => void;
  /** Session ID for pipeline processing during transcription */
  sessionId?: string;
  /** Whether the input is disabled (e.g., waiting for AI response) */
  disabled?: boolean;
  /** Placeholder text for text input mode */
  placeholder?: string;
}

type InputMode = 'voice' | 'text';

// =============================================================================
// Inline SVG Icons
// =============================================================================

function MicIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function SendIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function KeyboardIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" ry="2" />
      <line x1="6" y1="8" x2="6" y2="8" />
      <line x1="10" y1="8" x2="10" y2="8" />
      <line x1="14" y1="8" x2="14" y2="8" />
      <line x1="18" y1="8" x2="18" y2="8" />
      <line x1="6" y1="12" x2="6" y2="12" />
      <line x1="10" y1="12" x2="10" y2="12" />
      <line x1="14" y1="12" x2="14" y2="12" />
      <line x1="18" y1="12" x2="18" y2="12" />
      <line x1="8" y1="16" x2="16" y2="16" />
    </svg>
  );
}

// =============================================================================
// Component Implementation
// =============================================================================

export function VoiceInput({
  onSend,
  sessionId,
  disabled = false,
  placeholder = 'Type your response...',
  className = '',
  ...props
}: VoiceInputProps) {
  const [inputMode, setInputMode] = useState<InputMode>('voice');
  const [textInputValue, setTextInputValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Touch tracking for swipe-up gesture (mobile send)
  const touchStartYRef = useRef<number | null>(null);

  // Voice input hook — batch transcription
  const {
    state: voiceState,
    transcribedText,
    errorMessage,
    waveformData,
    isVoiceEdit,
    startRecording,
    stopAndSend,
    startVoiceEdit,
    setTranscribedText,
    reset: resetVoice,
  } = useVoiceInput({ sessionId });

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleVoiceSend = useCallback(() => {
    if (disabled || !transcribedText.trim()) return;
    onSend(transcribedText.trim());
    resetVoice();
  }, [disabled, transcribedText, onSend, resetVoice]);

  const handleTextSubmit = useCallback((e: FormEvent) => {
    e.preventDefault();
    const trimmed = textInputValue.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setTextInputValue('');
    textareaRef.current?.focus();
  }, [textInputValue, disabled, onSend]);

  const handleTextKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleTextSubmit(e);
    }
  }, [handleTextSubmit]);

  const handleReviewKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleVoiceSend();
    }
  }, [handleVoiceSend]);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    touchStartYRef.current = e.touches[0]?.clientY ?? null;
  }, []);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (touchStartYRef.current === null) return;
    const touchEndY = e.changedTouches[0]?.clientY ?? touchStartYRef.current;
    const deltaY = touchStartYRef.current - touchEndY;
    touchStartYRef.current = null;

    if (deltaY > 50 && voiceState === 'review') {
      handleVoiceSend();
    }
  }, [voiceState, handleVoiceSend]);

  const switchToText = useCallback(() => {
    resetVoice();
    setInputMode('text');
  }, [resetVoice]);

  const switchToVoice = useCallback(() => {
    setTextInputValue('');
    setInputMode('voice');
  }, []);

  // -------------------------------------------------------------------------
  // Render: Text Mode
  // -------------------------------------------------------------------------

  if (inputMode === 'text') {
    return (
      <div className={`${className}`} {...props}>
        <form onSubmit={handleTextSubmit} className="flex gap-3 items-end">
          <textarea
            data-testid="message-input"
            ref={textareaRef}
            value={textInputValue}
            onChange={(e) => setTextInputValue(e.target.value)}
            onKeyDown={handleTextKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className="
              flex-1 px-4 py-3
              bg-clarity-700/50 text-white placeholder-clarity-400
              rounded-xl
              focus:outline-none focus:ring-2 focus:ring-clarity-500
              disabled:opacity-50 disabled:cursor-not-allowed
              resize-none min-h-[48px] max-h-[120px]
              transition-opacity
            "
          />
          <button
            type="button"
            onClick={switchToVoice}
            disabled={disabled}
            className="p-3 text-clarity-400 hover:text-white transition-colors disabled:opacity-50"
            aria-label="Switch to voice input"
          >
            <MicIcon className="w-5 h-5" />
          </button>
          <button
            type="submit"
            disabled={disabled || !textInputValue.trim()}
            className="
              p-3 bg-clarity-600 text-white rounded-xl
              hover:bg-clarity-500
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-all
            "
            aria-label="Send message"
          >
            <SendIcon className="w-5 h-5" />
          </button>
        </form>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render: Voice Mode (state-dependent)
  // -------------------------------------------------------------------------

  return (
    <div
      className={`${className}`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      {...props}
    >
      {/* Idle state: mic button + keyboard switch */}
      {voiceState === 'idle' && (
        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={switchToText}
            disabled={disabled}
            className="p-3 text-clarity-400 hover:text-white transition-colors disabled:opacity-50"
            aria-label="Switch to text input"
          >
            <KeyboardIcon className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={startRecording}
            disabled={disabled}
            className="
              w-14 h-14 rounded-full
              bg-clarity-600 text-white
              flex items-center justify-center
              hover:bg-clarity-500
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-all
            "
            aria-label="Start recording"
          >
            <MicIcon className="w-6 h-6" />
          </button>

          {/* Spacer to center the mic button */}
          <div className="w-11" />
        </div>
      )}

      {/* Recording state: waveform + send button */}
      {voiceState === 'recording' && (
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <Waveform data={waveformData} className="flex-1" />

            {/* Send button — stops recording and triggers transcription */}
            <button
              type="button"
              onClick={stopAndSend}
              className="
                w-14 h-14 rounded-full
                bg-clarity-600 text-white
                flex items-center justify-center
                hover:bg-clarity-500
                transition-colors
              "
              aria-label="Send recording"
            >
              <SendIcon className="w-6 h-6" />
            </button>
          </div>

          <p className="text-clarity-500 text-xs text-center">
            {isVoiceEdit ? 'Speak your edit instruction... tap send when done' : 'Listening... tap send when done'}
          </p>
        </div>
      )}

      {/* Transcribing state: loading spinner */}
      {voiceState === 'transcribing' && (
        <div className="flex items-center justify-center py-4">
          <svg className="animate-spin h-6 w-6 text-clarity-400" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="ml-3 text-clarity-400 text-sm">Transcribing...</span>
        </div>
      )}

      {/* Review state: editable transcription + voice-edit mic + send */}
      {voiceState === 'review' && (
        <div className="space-y-3">
          <textarea
            value={transcribedText}
            onChange={(e) => setTranscribedText(e.target.value)}
            onKeyDown={handleReviewKeyDown}
            rows={2}
            className="
              w-full px-4 py-3
              bg-clarity-700/50 text-white
              rounded-xl
              focus:outline-none focus:ring-2 focus:ring-clarity-500
              resize-none min-h-[48px] max-h-[120px]
            "
            aria-label="Review transcription"
          />

          <div className="flex items-center justify-between">
            {/* Voice-edit button */}
            <button
              type="button"
              onClick={startVoiceEdit}
              disabled={disabled}
              className="
                p-2 text-clarity-400 hover:text-white
                transition-colors disabled:opacity-50
                flex items-center gap-2 text-sm
              "
              aria-label="Record edit instruction"
            >
              <MicIcon className="w-4 h-4" />
              <span>Edit with voice</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={resetVoice}
                className="px-4 py-2 text-clarity-400 hover:text-white text-sm transition-colors"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleVoiceSend}
                disabled={disabled || !transcribedText.trim()}
                className="
                  px-4 py-2 bg-clarity-600 text-white rounded-xl
                  hover:bg-clarity-500
                  disabled:opacity-50 disabled:cursor-not-allowed
                  transition-all flex items-center gap-2
                "
                aria-label="Send transcription"
              >
                <SendIcon className="w-4 h-4" />
                <span>Send</span>
              </button>
            </div>
          </div>

          <p className="text-clarity-500 text-xs text-center">
            Tap text to edit | Swipe up to send
          </p>
        </div>
      )}

      {/* Error state: message + text fallback */}
      {voiceState === 'error' && (
        <div className="space-y-3">
          <p className="text-red-400 text-sm text-center">{errorMessage}</p>
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={resetVoice}
              className="px-4 py-2 bg-clarity-700 text-white rounded-lg text-sm hover:bg-clarity-600 transition-colors"
            >
              Try Again
            </button>
            <button
              type="button"
              onClick={switchToText}
              className="px-4 py-2 bg-clarity-600 text-white rounded-lg text-sm hover:bg-clarity-500 transition-colors"
            >
              Use Keyboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default VoiceInput;
```

**Step 2: Commit**

```bash
git add web/src/components/live-session/VoiceInput.tsx
git commit -m "T5: Update VoiceInput — send button, transcribing state, sessionId, voice-edit"
```

---

### Task 6: Frontend — Wire SessionContainer

**Files:**
- Modify: `web/src/components/live-session/SessionContainer.tsx`

**Context:** Pass `sessionId` to VoiceInput. The `onProcessTranscription` prop no longer exists (pipeline runs server-side).

**Step 1: Update the VoiceInput usage**

At line ~464 in `SessionContainer.tsx`, change:

```tsx
<VoiceInput
  onSend={sendUserMessage}
  disabled={controlsDisabled}
  placeholder="Type your response..."
/>
```

To:

```tsx
<VoiceInput
  onSend={sendUserMessage}
  sessionId={sessionId}
  disabled={controlsDisabled}
  placeholder="Type your response..."
/>
```

That's the only change. The `onProcessTranscription` prop was already not being passed (it was optional and unused in the current wiring).

**Step 2: Full compilation check**

Run: `cd /Users/johnmemon/Desktop/contextual-clarity && npx tsc --noEmit --pretty 2>&1 | grep -E "error TS|Found" | head -20`

Expected: 0 errors. All types align.

**Step 3: Commit**

```bash
git add web/src/components/live-session/SessionContainer.tsx
git commit -m "T6: Pass sessionId to VoiceInput for pipeline-aware transcription"
```

---

### Task 7: Smoke Test & Cleanup

**Files:**
- Verify: all modified files compile and run

**Step 1: Full TypeScript compilation**

Run: `cd /Users/johnmemon/Desktop/contextual-clarity && npx tsc --noEmit --pretty 2>&1 | tail -5`

Expected: No errors.

**Step 2: Run existing test suite to check for regressions**

Run: `cd /Users/johnmemon/Desktop/contextual-clarity && bun test 2>&1 | grep -E "\(pass\)|\(fail\)|^\s+\d+ (pass|fail)|^Ran "`

Expected: All existing tests pass. No voice-specific tests exist yet, so nothing new to fail.

**Step 3: Check for dead imports**

Search for any remaining references to the removed exports:

Run: `cd /Users/johnmemon/Desktop/contextual-clarity && grep -rn "createDeepgramClient\|DEEPGRAM_CONFIG\|interimText\|startCorrection\|stopRecording\|onFinalTranscription\|onProcessTranscription\|fetchToken\|DEEPGRAM_WS_URL\|DEEPGRAM_PARAMS\|voice/token" src/ web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".md" | head -20`

Expected: Zero matches. If any found, they are stale references that need updating.

**Step 4: Dev server boot check**

Run: `cd /Users/johnmemon/Desktop/contextual-clarity && timeout 10 bun run dev 2>&1 | head -20`

Expected: Server starts without import errors or crashes.

**Step 5: Final commit**

If any cleanup was needed, commit it:

```bash
git add -A
git commit -m "T7: Smoke test cleanup — remove dead references"
```

---

## Task Dependency Graph

```
T1 (deepgram-client) ──┐
                        ├── T3 (voice routes) ── T6 (SessionContainer) ── T7 (smoke test)
T2 (terminology cache) ┘                                                      │
                                                                               │
T4 (use-voice-input hook) ── T5 (VoiceInput component) ──────────────────────┘
```

T1 + T2 can be done in parallel. T4 can be done in parallel with T1-T3.
T5 depends on T4. T6 depends on T3 + T5. T7 depends on everything.

## Risk Checklist

- [ ] Safari/iOS: `getMimeType()` returns `audio/mp4` — Deepgram REST accepts it
- [ ] `MediaRecorder.onstop` fires AFTER final `ondataavailable` — blob collection is safe
- [ ] AbortController is aborted on unmount — no state updates on unmounted component
- [ ] Empty transcript returns user to `idle` — no empty review screen
- [ ] Pipeline failure falls back to raw Deepgram text — never blocks the user
- [ ] Terminology cache doesn't leak memory — bounded by number of unique recall sets
- [ ] No Deepgram API key ever reaches the frontend — all transcription is server-side
- [ ] 5MB upload limit prevents abuse — 5MB = ~40 minutes of audio
- [ ] 30-second timeout on transcription — user sees error, not infinite spinner
