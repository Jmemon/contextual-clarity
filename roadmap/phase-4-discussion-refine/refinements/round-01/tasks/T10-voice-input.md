# T10 — Voice Input Integration (Deepgram)

| Field | Value |
|-------|-------|
| **name** | Voice Input Integration (Deepgram) |
| **parallel-group** | C (wave 3) |
| **depends-on** | T03 (Transcription Processing Pipeline) |

---

## Description

Integrate Deepgram for voice-first input into the live session experience. Replace the current `MessageInput` component with a new `VoiceInput` component that supports two modes: voice (default) and text (fallback). Voice mode uses the browser's `MediaRecorder` API to capture audio, streams it to Deepgram via a WebSocket for real-time transcription, shows a waveform visualization while recording, and presents the transcribed text for review before sending. The Deepgram API key stays server-side via a short-lived token endpoint.

After Deepgram returns raw text, it passes through the `TranscriptionPipeline` from T03 for terminology correction and notation conversion before display. Users can approve the transcription (swipe up or Enter), enter correction mode (speak editing instructions processed by Haiku), or manually edit with the keyboard.

This task also creates a backend route for Deepgram token generation, a voice input React hook, and a waveform visualization component.

---

## Detailed Implementation

### 1. Deepgram API Key Management (Backend)

**Server config** (MODIFY: `src/config.ts`):

Add `DEEPGRAM_API_KEY` to the config schema:

```typescript
// In the configSchema z.object({...}):
deepgram: z.object({
  apiKey: z.string().optional(),
}),
```

Load from environment:
```typescript
deepgram: {
  apiKey: process.env.DEEPGRAM_API_KEY || '',
},
```

**Token endpoint** (CREATE: `src/api/routes/voice.ts`):

```typescript
import { Hono } from 'hono';
import { createClient } from '@deepgram/sdk';
import { config } from '../../config';

const voiceRoutes = new Hono();

/**
 * GET /api/voice/deepgram-token
 *
 * Generates a short-lived Deepgram API key for the frontend to use when
 * connecting directly to Deepgram's streaming transcription API.
 *
 * This keeps the main Deepgram API key server-side while allowing the
 * browser to establish a direct WebSocket connection to Deepgram.
 *
 * Returns: { token: string, expiresAt: string }
 *
 * The token is valid for 60 seconds — long enough for a single recording
 * session. The frontend requests a new token each time the user taps the
 * mic button.
 */
voiceRoutes.get('/deepgram-token', async (c) => {
  const apiKey = config.deepgram.apiKey;

  if (!apiKey) {
    return c.json({ error: 'Deepgram API key not configured' }, 503);
  }

  try {
    const deepgram = createClient(apiKey);

    // Create a temporary API key with limited scope and short TTL
    const { result } = await deepgram.manage.createProjectKey(
      // Project ID is inferred from the API key
      '', // project ID — Deepgram SDK may handle this automatically
      {
        comment: 'Temporary browser transcription key',
        scopes: ['usage:write'],  // Minimal scope: only allows transcription
        time_to_live_in_seconds: 60,
      }
    );

    return c.json({
      token: result.key,
      expiresAt: new Date(Date.now() + 60 * 1000).toISOString(),
    });
  } catch (error) {
    console.error('Failed to create Deepgram token:', error);
    return c.json({ error: 'Failed to generate voice token' }, 500);
  }
});

export { voiceRoutes };
```

**Alternative approach** (if Deepgram temporary key creation is not straightforward): Use the backend as a WebSocket proxy. The frontend sends audio chunks to the backend's WebSocket, and the backend forwards them to Deepgram. This is more complex but keeps the API key completely hidden. The task implementer should evaluate which approach is simpler with the current Deepgram SDK version and choose accordingly. The token endpoint approach is preferred if Deepgram supports it cleanly.

**Register route** (MODIFY: `src/api/server.ts`):

```typescript
import { voiceRoutes } from './routes/voice';

// In the route registration section:
app.route('/api/voice', voiceRoutes);
```

### 2. Deepgram Client (CREATE: `src/core/voice/deepgram-client.ts`)

Server-side Deepgram client for any backend operations. For now this is thin — the actual transcription happens client-side via the browser SDK. This module exists for future backend-side transcription needs and as the single place to configure Deepgram settings.

```typescript
import { createClient, type DeepgramClient } from '@deepgram/sdk';

/**
 * Deepgram transcription configuration.
 * These settings are shared between the token endpoint and any backend transcription.
 */
const DEEPGRAM_CONFIG = {
  model: 'nova-2',       // Latest and most accurate model
  language: 'en',        // English — extend to other languages later
  smart_format: true,    // Adds punctuation and formatting
  punctuate: true,       // Ensure punctuation is added
  utterances: true,      // Group speech into utterances
  interim_results: true, // Send partial results during recording
} as const;

/**
 * Creates and returns a configured Deepgram client instance.
 * Used by the token endpoint and any future backend transcription logic.
 *
 * @param apiKey - Deepgram API key from server config
 * @returns Configured DeepgramClient instance
 */
function createDeepgramClient(apiKey: string): DeepgramClient {
  return createClient(apiKey);
}

export { createDeepgramClient, DEEPGRAM_CONFIG };
```

### 3. Barrel Export (CREATE: `src/core/voice/index.ts`)

```typescript
export { createDeepgramClient, DEEPGRAM_CONFIG } from './deepgram-client';
```

### 4. Voice Input Hook (CREATE: `web/src/hooks/use-voice-input.ts`)

The core React hook that manages the entire voice recording lifecycle: requesting mic permission, capturing audio via `MediaRecorder`, streaming to Deepgram for real-time transcription, and extracting waveform data for visualization.

```typescript
import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Voice input states:
 * - idle: Not recording, ready to start
 * - recording: Actively capturing audio and streaming to Deepgram
 * - processing: Recording stopped, waiting for final transcription from Deepgram
 * - review: Transcription complete, text shown for user approval
 * - correction: User is speaking correction instructions
 * - error: Mic permission denied or other error
 */
type VoiceInputState = 'idle' | 'recording' | 'processing' | 'review' | 'correction' | 'error';

interface UseVoiceInputOptions {
  /**
   * Called when a new interim (partial) transcription is available.
   * Used to show real-time text as the user speaks.
   */
  onInterimTranscription?: (text: string) => void;

  /**
   * Called when the final transcription is ready (after recording stops).
   * This is the raw Deepgram output, before pipeline processing.
   */
  onFinalTranscription?: (text: string) => void;

  /**
   * Base URL for the backend API (to fetch the Deepgram token).
   * Defaults to '' (same origin).
   */
  apiBaseUrl?: string;
}

interface UseVoiceInputReturn {
  /** Current state of the voice input system */
  state: VoiceInputState;

  /** The current transcription text (interim during recording, final during review) */
  transcription: string;

  /** Waveform amplitude data for visualization (array of 0-1 values, updated in real time) */
  waveformData: number[];

  /** Error message if state is 'error' */
  errorMessage: string | null;

  /** Start recording. Requests mic permission if not yet granted. */
  startRecording: () => Promise<void>;

  /** Stop recording. Triggers final transcription from Deepgram. */
  stopRecording: () => void;

  /** Reset to idle state. Clears transcription and error. */
  reset: () => void;

  /** Set transcription text manually (for correction mode or keyboard editing). */
  setTranscription: (text: string) => void;
}

/**
 * React hook for voice input via Deepgram.
 *
 * Manages the full lifecycle:
 * 1. Requests browser mic permission
 * 2. Creates MediaRecorder + AudioContext for waveform data
 * 3. Fetches a temporary Deepgram token from the backend
 * 4. Opens a WebSocket to Deepgram's streaming transcription API
 * 5. Streams audio chunks in real time
 * 6. Receives interim and final transcriptions
 * 7. Provides waveform data for visualization
 *
 * Usage:
 * ```tsx
 * const { state, transcription, waveformData, startRecording, stopRecording, reset } = useVoiceInput({
 *   onFinalTranscription: (text) => console.log('Final:', text),
 * });
 * ```
 */
function useVoiceInput(options: UseVoiceInputOptions = {}): UseVoiceInputReturn {
  const { onInterimTranscription, onFinalTranscription, apiBaseUrl = '' } = options;

  // State
  const [state, setState] = useState<VoiceInputState>('idle');
  const [transcription, setTranscription] = useState('');
  const [waveformData, setWaveformData] = useState<number[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Refs for cleanup
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const deepgramSocketRef = useRef<WebSocket | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  /**
   * Fetches a temporary Deepgram API token from the backend.
   */
  const fetchDeepgramToken = useCallback(async (): Promise<string> => {
    const response = await fetch(`${apiBaseUrl}/api/voice/deepgram-token`);
    if (!response.ok) {
      throw new Error('Failed to fetch Deepgram token');
    }
    const data = await response.json();
    return data.token;
  }, [apiBaseUrl]);

  /**
   * Updates waveform data from the AnalyserNode.
   * Called on each animation frame during recording.
   */
  const updateWaveform = useCallback(() => {
    if (!analyserRef.current) return;

    const analyser = analyserRef.current;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(dataArray);

    // Convert to 0-1 range where 0.5 is silence
    // Take every Nth sample to get a manageable number of bars (e.g., 32 bars)
    const barCount = 32;
    const step = Math.floor(dataArray.length / barCount);
    const bars: number[] = [];
    for (let i = 0; i < barCount; i++) {
      const value = dataArray[i * step] / 255; // 0-1 range
      bars.push(Math.abs(value - 0.5) * 2); // 0 = silence, 1 = max amplitude
    }
    setWaveformData(bars);

    // Continue animation loop
    animationFrameRef.current = requestAnimationFrame(updateWaveform);
  }, []);

  /**
   * Start recording audio and streaming to Deepgram.
   */
  const startRecording = useCallback(async () => {
    try {
      setErrorMessage(null);

      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Set up AudioContext and AnalyserNode for waveform visualization
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      // Fetch temporary Deepgram token
      const token = await fetchDeepgramToken();

      // Open WebSocket to Deepgram streaming API
      const dgSocket = new WebSocket(
        `wss://api.deepgram.com/v1/listen?model=nova-2&language=en&smart_format=true&punctuate=true&interim_results=true`,
        ['token', token]
      );

      deepgramSocketRef.current = dgSocket;

      dgSocket.onopen = () => {
        // Start MediaRecorder to capture audio chunks
        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : 'audio/webm',
        });
        mediaRecorderRef.current = mediaRecorder;

        // Send audio chunks to Deepgram as they become available
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0 && dgSocket.readyState === WebSocket.OPEN) {
            dgSocket.send(event.data);
          }
        };

        // Capture audio in 250ms chunks for low latency
        mediaRecorder.start(250);

        setState('recording');

        // Start waveform animation
        animationFrameRef.current = requestAnimationFrame(updateWaveform);
      };

      // Handle incoming transcription results from Deepgram
      dgSocket.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === 'Results') {
          const transcript = data.channel?.alternatives?.[0]?.transcript || '';
          const isFinal = data.is_final;

          if (transcript) {
            if (isFinal) {
              // Final result for this utterance — append to running transcription
              setTranscription((prev) => {
                const updated = prev ? `${prev} ${transcript}` : transcript;
                return updated;
              });
            } else {
              // Interim result — show as preview via callback
              onInterimTranscription?.(transcript);
            }
          }
        }
      };

      dgSocket.onerror = (error) => {
        console.error('Deepgram WebSocket error:', error);
        setErrorMessage('Voice transcription connection error');
        setState('error');
      };

      dgSocket.onclose = () => {
        // When Deepgram socket closes, finalize transcription
        if (state === 'processing') {
          setState('review');
          onFinalTranscription?.(transcription);
        }
      };
    } catch (error) {
      // Handle mic permission denied or other errors
      const message = error instanceof DOMException && error.name === 'NotAllowedError'
        ? 'Microphone permission denied. Please allow microphone access to use voice input.'
        : 'Failed to start recording. Please try again.';

      setErrorMessage(message);
      setState('error');
      console.error('Failed to start recording:', error);
    }
  }, [fetchDeepgramToken, onInterimTranscription, onFinalTranscription, updateWaveform, state, transcription]);

  /**
   * Stop recording and finalize transcription.
   */
  const stopRecording = useCallback(() => {
    setState('processing');

    // Stop waveform animation
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setWaveformData([]);

    // Stop MediaRecorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    // Close Deepgram WebSocket (sends close frame, Deepgram sends final results)
    if (deepgramSocketRef.current && deepgramSocketRef.current.readyState === WebSocket.OPEN) {
      deepgramSocketRef.current.close();
    }

    // Stop all audio tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }

    // Close AudioContext
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }

    // After a brief delay for any final Deepgram messages, move to review
    // The dgSocket.onclose handler also moves to review
    setTimeout(() => {
      setState((current) => {
        if (current === 'processing') return 'review';
        return current;
      });
    }, 500);
  }, []);

  /**
   * Reset to idle state, clearing all transcription data.
   */
  const reset = useCallback(() => {
    setTranscription('');
    setWaveformData([]);
    setErrorMessage(null);
    setState('idle');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current?.stop();
      if (deepgramSocketRef.current?.readyState === WebSocket.OPEN) deepgramSocketRef.current?.close();
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, []);

  return {
    state,
    transcription,
    waveformData,
    errorMessage,
    startRecording,
    stopRecording,
    reset,
    setTranscription,
  };
}

export { useVoiceInput, type VoiceInputState, type UseVoiceInputReturn };
```

### 5. Waveform Visualization (CREATE: `web/src/components/live-session/Waveform.tsx`)

A thin horizontal waveform bar that animates in real time during recording. Each bar represents an amplitude sample. The visualization is subtle and non-distracting.

```tsx
interface WaveformProps {
  /** Array of amplitude values (0-1) to render as bars */
  data: number[];
  /** Additional CSS classes */
  className?: string;
}

/**
 * Waveform visualization component.
 *
 * Renders a horizontal row of thin vertical bars that pulse with audio amplitude.
 * Used in the VoiceInput component during recording to provide visual feedback
 * that the microphone is active and capturing audio.
 *
 * Each bar height is proportional to its amplitude value (0 = flat, 1 = max height).
 * The bars have a subtle color from the clarity palette and smooth height transitions.
 */
function Waveform({ data, className = '' }: WaveformProps) {
  return (
    <div
      className={`flex items-center justify-center gap-0.5 h-8 ${className}`}
      aria-label="Audio waveform visualization"
      role="img"
    >
      {data.map((amplitude, index) => (
        <div
          key={index}
          className="w-1 rounded-full bg-clarity-400 transition-all duration-75"
          style={{
            // Minimum height of 2px (silent), max of 100% of container (32px)
            height: `${Math.max(6, amplitude * 100)}%`,
            // Slight opacity variation based on amplitude for depth
            opacity: 0.4 + amplitude * 0.6,
          }}
        />
      ))}
    </div>
  );
}

export { Waveform };
export default Waveform;
```

### 6. Correction Processor (CREATE: `src/core/transcription/correction-processor.ts`)

Processes spoken correction instructions against the current transcription. The user speaks something like "change the second part to say phosphoanhydride" and this function applies that edit instruction to the displayed text.

```typescript
import type { AnthropicClient } from '../../llm/client';

/**
 * Processes a spoken correction instruction and applies it to the current transcription.
 *
 * The user sees their transcribed text and speaks a correction instruction.
 * This function sends both the current text and the correction instruction
 * to Haiku, which returns the updated text.
 *
 * Examples:
 * - Current: "The process involves my selenium networks"
 *   Instruction: "Change selenium to mycelium"
 *   Result: "The process involves mycelium networks"
 *
 * - Current: "The integral of X from 0 to 1"
 *   Instruction: "Make that X squared instead of X"
 *   Result: "The integral of X squared from 0 to 1"
 *
 * - Current: "I think the answer is about 42"
 *   Instruction: "Remove the 'I think' part and just say the answer is 42"
 *   Result: "The answer is 42"
 *
 * @param currentText - The text currently displayed for review
 * @param correctionInstruction - The user's spoken edit instruction
 * @param llmClient - AnthropicClient instance (will use Haiku)
 * @returns The updated text with the correction applied
 */
async function processCorrection(
  currentText: string,
  correctionInstruction: string,
  llmClient: AnthropicClient
): Promise<string> {
  const prompt = `Current message: "${currentText}"

User's correction instruction: "${correctionInstruction}"

Apply the user's correction to the current message. Return ONLY the updated message text, nothing else. Do not explain what you changed. If the instruction is unclear, make your best interpretation and apply it.`;

  try {
    const response = await llmClient.complete(prompt);
    const result = response.text.trim();

    // If the response looks like it contains explanation rather than just the corrected text,
    // try to extract just the corrected text
    if (result.includes('\n') && result.length > currentText.length * 2) {
      // Take the first line as the corrected text if the response is suspiciously long
      return result.split('\n')[0].trim();
    }

    return result || currentText;
  } catch (error) {
    console.error('Correction processing failed:', error);
    return currentText; // Return unchanged text on failure
  }
}

export { processCorrection };
```

### 7. VoiceInput Component (CREATE: `web/src/components/live-session/VoiceInput.tsx`)

The main input component that replaces `MessageInput`. It combines voice input (default) with text input (fallback) in a single thin horizontal bar.

```tsx
import { useState, useRef, useCallback, type KeyboardEvent } from 'react';
import { useVoiceInput } from '@/hooks/use-voice-input';
import { Waveform } from './Waveform';

interface VoiceInputProps {
  /** Callback when a message is approved and ready to send */
  onSend: (message: string) => void;
  /** Whether the input is disabled (e.g., waiting for AI response) */
  disabled?: boolean;
  /** Callback to process transcription through the pipeline (T03) */
  onProcessTranscription?: (rawText: string) => Promise<string>;
  /** Callback to process a spoken correction instruction */
  onProcessCorrection?: (currentText: string, instruction: string) => Promise<string>;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Voice-first input component for live sessions.
 *
 * Replaces the previous MessageInput with a component that supports two modes:
 * - Voice mode (default): mic icon, waveform during recording, transcription review
 * - Text mode (fallback): traditional text input with Enter to send
 *
 * Flow:
 * 1. User taps mic -> recording starts, waveform shows
 * 2. User taps mic again -> recording stops, transcription appears for review
 * 3. Transcription passes through T03 pipeline for correction and notation
 * 4. User reviews: swipe up / Enter to send, tap mic for correction mode, tap text to edit
 * 5. After sending, returns to voice-ready state
 */
function VoiceInput({
  onSend,
  disabled = false,
  onProcessTranscription,
  onProcessCorrection,
  className = '',
}: VoiceInputProps) {
  // Input mode: voice (default) or text (fallback)
  const [mode, setMode] = useState<'voice' | 'text'>('voice');

  // Text input state (for text mode and for editing transcription in review)
  const [textInput, setTextInput] = useState('');

  // Review state: the processed transcription being shown for approval
  const [reviewText, setReviewText] = useState('');

  // Whether currently processing transcription through the pipeline
  const [isProcessing, setIsProcessing] = useState(false);

  // Text input ref for focus management
  const textInputRef = useRef<HTMLInputElement>(null);

  // Touch start position for swipe detection
  const touchStartY = useRef<number | null>(null);

  // Voice input hook
  const {
    state: voiceState,
    transcription,
    waveformData,
    errorMessage,
    startRecording,
    stopRecording,
    reset: resetVoice,
    setTranscription,
  } = useVoiceInput({
    onFinalTranscription: async (rawText) => {
      // Process through T03 pipeline if available
      if (onProcessTranscription && rawText.trim()) {
        setIsProcessing(true);
        try {
          const processed = await onProcessTranscription(rawText);
          setReviewText(processed);
        } catch {
          setReviewText(rawText); // Fallback to raw text
        }
        setIsProcessing(false);
      } else {
        setReviewText(rawText);
      }
    },
  });

  /**
   * Handle microphone button tap.
   * In idle: start recording.
   * In recording: stop recording.
   * In review: enter correction mode.
   */
  const handleMicTap = useCallback(() => {
    if (disabled) return;

    if (voiceState === 'idle' || voiceState === 'error') {
      resetVoice();
      startRecording();
    } else if (voiceState === 'recording') {
      stopRecording();
    } else if (voiceState === 'review') {
      // Enter correction mode: start recording the correction instruction
      startRecording();
      // The voice state will go to 'recording' — when it stops,
      // the correction instruction is processed against reviewText
    }
  }, [disabled, voiceState, startRecording, stopRecording, resetVoice]);

  /**
   * Handle sending the approved message.
   * Called on swipe up (mobile) or Enter (desktop) during review.
   */
  const handleSend = useCallback(() => {
    const textToSend = mode === 'text' ? textInput.trim() : reviewText.trim();
    if (!textToSend || disabled) return;

    onSend(textToSend);

    // Reset to voice-ready state
    setTextInput('');
    setReviewText('');
    resetVoice();
    setMode('voice');
  }, [mode, textInput, reviewText, disabled, onSend, resetVoice]);

  /**
   * Handle keyboard events.
   * Enter sends in both text mode and review mode.
   */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  /**
   * Handle touch start for swipe-up gesture detection.
   */
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  }, []);

  /**
   * Handle touch end for swipe-up gesture detection.
   * A swipe up of at least 50px triggers send.
   */
  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartY.current === null) return;

      const deltaY = touchStartY.current - e.changedTouches[0].clientY;
      touchStartY.current = null;

      // Swipe up detected (at least 50px upward)
      if (deltaY > 50 && (reviewText.trim() || textInput.trim())) {
        handleSend();
      }
    },
    [reviewText, textInput, handleSend]
  );

  /**
   * Switch to text input mode.
   */
  const switchToTextMode = useCallback(() => {
    setMode('text');
    resetVoice();
    // Focus the text input after mode switch
    setTimeout(() => textInputRef.current?.focus(), 50);
  }, [resetVoice]);

  /**
   * Switch to voice input mode.
   */
  const switchToVoiceMode = useCallback(() => {
    setMode('voice');
    setTextInput('');
  }, []);

  // ---- Render ----

  // Voice mode: recording state — show waveform
  if (mode === 'voice' && voiceState === 'recording') {
    return (
      <div
        className={`flex items-center gap-3 px-4 py-3 bg-clarity-700/50 rounded-xl ${className}`}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Waveform visualization fills the center */}
        <div className="flex-1">
          <Waveform data={waveformData} />
        </div>

        {/* Pulsing mic button to stop recording */}
        <button
          onClick={handleMicTap}
          className="w-12 h-12 rounded-full bg-red-500 flex items-center justify-center animate-pulse"
          aria-label="Stop recording"
        >
          <MicIcon className="w-5 h-5 text-white" />
        </button>
      </div>
    );
  }

  // Voice mode: processing state — show loading
  if (mode === 'voice' && (voiceState === 'processing' || isProcessing)) {
    return (
      <div className={`flex items-center gap-3 px-4 py-3 bg-clarity-700/50 rounded-xl ${className}`}>
        <div className="flex-1 text-clarity-400 text-sm">Processing transcription...</div>
        <div className="w-12 h-12 rounded-full bg-clarity-600 flex items-center justify-center">
          <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
      </div>
    );
  }

  // Voice mode: review state — show transcribed text for approval
  if (mode === 'voice' && voiceState === 'review' && reviewText) {
    return (
      <div
        className={`flex items-center gap-3 px-4 py-3 bg-clarity-700/50 rounded-xl ${className}`}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onKeyDown={handleKeyDown}
        tabIndex={0}
      >
        {/* Transcription text — tappable to switch to keyboard editing */}
        <div
          className="flex-1 text-white cursor-text min-h-[32px]"
          onClick={() => {
            setTextInput(reviewText);
            setMode('text');
            setTimeout(() => textInputRef.current?.focus(), 50);
          }}
        >
          {reviewText}
        </div>

        {/* Mic button for correction mode */}
        <button
          onClick={handleMicTap}
          className="w-10 h-10 rounded-full bg-clarity-600 flex items-center justify-center hover:bg-clarity-500 transition-colors"
          aria-label="Speak correction"
          title="Speak a correction"
        >
          <MicIcon className="w-4 h-4 text-white" />
        </button>

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={disabled}
          className="w-10 h-10 rounded-full bg-clarity-500 flex items-center justify-center hover:bg-clarity-400 transition-colors disabled:opacity-50"
          aria-label="Send message"
        >
          <SendIcon className="w-4 h-4 text-white" />
        </button>
      </div>
    );
  }

  // Voice mode: error state — show error with fallback to text
  if (mode === 'voice' && voiceState === 'error') {
    return (
      <div className={`flex flex-col gap-2 ${className}`}>
        <p className="text-red-400 text-sm px-4">{errorMessage}</p>
        <div className="flex items-center gap-3 px-4 py-3 bg-clarity-700/50 rounded-xl">
          <input
            ref={textInputRef}
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your response..."
            disabled={disabled}
            className="flex-1 bg-transparent text-white placeholder-clarity-400 focus:outline-none disabled:opacity-50"
            autoFocus
          />
          <button
            onClick={handleSend}
            disabled={disabled || !textInput.trim()}
            className="w-10 h-10 rounded-full bg-clarity-500 flex items-center justify-center hover:bg-clarity-400 transition-colors disabled:opacity-50"
          >
            <SendIcon className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>
    );
  }

  // Text mode — traditional text input
  if (mode === 'text') {
    return (
      <div className={`flex items-center gap-3 px-4 py-3 bg-clarity-700/50 rounded-xl ${className}`}>
        {/* Text input */}
        <input
          ref={textInputRef}
          type="text"
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your response..."
          disabled={disabled}
          className="flex-1 bg-transparent text-white placeholder-clarity-400 focus:outline-none disabled:opacity-50"
        />

        {/* Switch to voice mode button */}
        <button
          onClick={switchToVoiceMode}
          className="w-10 h-10 rounded-full bg-clarity-600 flex items-center justify-center hover:bg-clarity-500 transition-colors"
          aria-label="Switch to voice input"
        >
          <MicIcon className="w-4 h-4 text-clarity-300" />
        </button>

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={disabled || !textInput.trim()}
          className="w-10 h-10 rounded-full bg-clarity-500 flex items-center justify-center hover:bg-clarity-400 transition-colors disabled:opacity-50"
        >
          <SendIcon className="w-4 h-4 text-white" />
        </button>
      </div>
    );
  }

  // Default: voice mode idle — show mic button with text fallback option
  return (
    <div className={`flex items-center gap-3 px-4 py-3 bg-clarity-700/50 rounded-xl ${className}`}>
      {/* Placeholder text indicating voice-first mode */}
      <div className="flex-1 text-clarity-400 text-sm">Tap the mic to respond with voice</div>

      {/* Keyboard icon to switch to text mode */}
      <button
        onClick={switchToTextMode}
        className="w-10 h-10 rounded-full bg-clarity-700 flex items-center justify-center hover:bg-clarity-600 transition-colors"
        aria-label="Switch to keyboard input"
      >
        <KeyboardIcon className="w-4 h-4 text-clarity-300" />
      </button>

      {/* Mic button — prominent, primary action */}
      <button
        onClick={handleMicTap}
        disabled={disabled}
        className="w-12 h-12 rounded-full bg-clarity-500 flex items-center justify-center hover:bg-clarity-400 transition-colors disabled:opacity-50"
        aria-label="Start recording"
      >
        <MicIcon className="w-5 h-5 text-white" />
      </button>
    </div>
  );
}

// ---- Inline SVG Icon Components ----

function MicIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function SendIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function KeyboardIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

export { VoiceInput };
export default VoiceInput;
```

### 8. SessionContainer Integration (MODIFY: `web/src/components/live-session/SessionContainer.tsx`)

Replace `MessageInput` with `VoiceInput`:

**Remove import:**
```typescript
import { MessageInput } from './MessageInput';
```

**Add import:**
```typescript
import { VoiceInput } from './VoiceInput';
```

**Replace the MessageInput JSX** (currently around line 413):

Current:
```tsx
<MessageInput
  onSend={sendUserMessage}
  disabled={controlsDisabled}
  placeholder="Type your response..."
/>
```

Replace with:
```tsx
<VoiceInput
  onSend={sendUserMessage}
  disabled={controlsDisabled}
  onProcessTranscription={async (rawText) => {
    // T03 pipeline integration point
    // When the pipeline is wired in, this calls pipeline.process(rawText)
    // For now, return raw text unchanged
    return rawText;
  }}
/>
```

**Remove the hint text** below the input (line ~420):
```tsx
<p className="text-clarity-500 text-sm text-center mt-3">
  Press Enter to send | Click "I've got it!" when you're ready to be evaluated
</p>
```

### 9. Install Deepgram SDK

Run: `bun add @deepgram/sdk`

---

## Relevant Files

| Action | File | What Changes |
|--------|------|-------------|
| CREATE | `src/core/voice/deepgram-client.ts` | Deepgram configuration constants and client factory function |
| CREATE | `src/core/voice/index.ts` | Barrel export for voice module |
| CREATE | `src/core/transcription/correction-processor.ts` | `processCorrection()` function for spoken edit instructions |
| CREATE | `src/api/routes/voice.ts` | `GET /api/voice/deepgram-token` endpoint for temporary Deepgram API key generation |
| CREATE | `web/src/hooks/use-voice-input.ts` | `useVoiceInput()` React hook: mic permission, MediaRecorder, Deepgram WebSocket, waveform data |
| CREATE | `web/src/components/live-session/VoiceInput.tsx` | Voice-first input component with mic, waveform, review, correction, and text fallback modes |
| CREATE | `web/src/components/live-session/Waveform.tsx` | Animated waveform visualization component for recording feedback |
| MODIFY | `web/src/components/live-session/SessionContainer.tsx` | Replace `MessageInput` with `VoiceInput`; remove evaluation hint text |
| MODIFY | `web/src/components/live-session/MessageInput.tsx` | No direct changes — kept as-is for potential reuse, but no longer imported by SessionContainer |
| MODIFY | `src/config.ts` | Add `deepgram.apiKey` to config schema and environment loading |
| MODIFY | `src/api/server.ts` | Register `/api/voice` route for Deepgram token endpoint |
| MODIFY | `package.json` (via `bun add @deepgram/sdk`) | Add `@deepgram/sdk` as a runtime dependency |

---

## Success Criteria

1. **Mic permission request**: Tapping the mic icon triggers `navigator.mediaDevices.getUserMedia({ audio: true })`. If permission is denied, the component shows an error message and falls back to text input mode.

2. **Recording with waveform**: While recording, the Waveform component displays real-time amplitude bars that pulse with the user's voice. The bars are updated via `AudioContext.AnalyserNode` on each animation frame.

3. **Real-time transcription**: During recording, Deepgram sends interim results via WebSocket. These partial transcriptions are accessible via the `onInterimTranscription` callback (for optional display).

4. **Stop recording produces final transcription**: Tapping the mic button during recording stops the `MediaRecorder`, closes the Deepgram WebSocket, and produces the final transcription text in the review state.

5. **Pipeline processing**: After Deepgram returns raw text, it is passed through the `onProcessTranscription` callback (which calls the T03 `TranscriptionPipeline.process()`). The processed text — with terminology corrections and notation conversions applied — is displayed for review.

6. **Swipe-up approval (mobile)**: On touch devices, swiping upward at least 50px on the review text area triggers the send action. The message is sent to the WebSocket and the input returns to idle voice mode.

7. **Enter key approval (desktop)**: Pressing Enter while the review text is focused sends the approved message. Same behavior as swipe-up.

8. **Correction mode**: Tapping the mic button during review enters correction mode. The user speaks editing instructions (e.g., "change the second word to phosphoanhydride"). The spoken instruction is transcribed by Deepgram, then processed by `processCorrection()` (Haiku call) against the current review text. The updated text replaces the review text for re-approval.

9. **Text input fallback**: Tapping the keyboard icon switches to text mode, showing a standard text input field. Typing and pressing Enter sends the message. A mic icon is available to switch back to voice mode.

10. **Tap-to-edit in review**: Tapping the transcribed text during review switches to text mode with the review text pre-filled in the input field, allowing keyboard editing.

11. **After sending, returns to voice-ready**: After a message is sent (via any method), the input resets to the voice-idle state with the mic button prominent and ready.

12. **Deepgram API key stays server-side**: The frontend never has the main `DEEPGRAM_API_KEY`. It fetches a temporary token from `GET /api/voice/deepgram-token` before each recording session. The token is short-lived (60 seconds).

13. **Token endpoint error handling**: If `DEEPGRAM_API_KEY` is not configured, the endpoint returns 503 with a clear error. If token generation fails, it returns 500. The frontend handles both by falling back to text input.

14. **Waveform is subtle**: The waveform bars are thin (1px wide), spaced 2px apart, and colored with the `clarity-400` palette. Height transitions are smooth (75ms CSS transition). The visualization occupies minimal vertical space (32px).

15. **Browser compatibility**: Voice input works on Chrome (desktop + mobile), Firefox (desktop), and Safari (iOS + macOS). The `MediaRecorder` mimeType is set to `audio/webm;codecs=opus` with a fallback to `audio/webm`. If `getUserMedia` is not available, falls back to text mode.

16. **Cleanup on unmount**: All recording resources (MediaRecorder, AudioContext, Deepgram WebSocket, MediaStream tracks, animation frames) are properly cleaned up when the component unmounts. No memory leaks.

17. **Disabled state**: When `disabled=true` (waiting for AI response), the mic button is grayed out and non-functional. Text input is disabled. No recording can start.

18. **Error recovery**: If the Deepgram WebSocket errors during recording, the error is caught, an error message is shown, and the component falls back to text mode gracefully. No unhandled promise rejections.

19. **Deepgram model**: The Deepgram WebSocket URL uses `model=nova-2` for the best accuracy and speed. `smart_format=true` and `punctuate=true` are enabled for natural text output.

20. **MessageInput preserved**: The original `MessageInput.tsx` file is not deleted. It is no longer imported by `SessionContainer` but remains in the codebase for potential reuse in session replay or other features.
