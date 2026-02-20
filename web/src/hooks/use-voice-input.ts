/**
 * Voice Input Hook
 *
 * Manages the full voice input lifecycle: mic permission, MediaRecorder,
 * native WebSocket to Deepgram for real-time STT, waveform data via
 * AudioContext.AnalyserNode, and two recording modes (initial / correction).
 *
 * State machine: idle -> recording -> processing -> review -> correction -> error
 *
 * Key design decisions:
 * - Uses browser native WebSocket to Deepgram (NOT @deepgram/sdk on frontend)
 * - Audio captured in 250ms chunks via MediaRecorder
 * - Stale-closure-safe via refs for all mutable state used in WS handlers
 * - Proper cleanup on unmount to prevent memory leaks
 */

import { useState, useRef, useCallback, useEffect } from 'react';

// =============================================================================
// Types
// =============================================================================

export type VoiceInputState = 'idle' | 'recording' | 'processing' | 'review' | 'correction' | 'error';

export interface UseVoiceInputOptions {
  /** Called with the final transcription text when recording completes (initial mode) */
  onFinalTranscription?: (text: string) => void;
  /** Called with corrected text when correction recording completes */
  onProcessCorrection?: (currentText: string, correctionInstruction: string) => void;
}

export interface UseVoiceInputReturn {
  /** Current state of the voice input */
  state: VoiceInputState;
  /** The transcribed text during review */
  transcribedText: string;
  /** Interim (partial) transcription shown during recording */
  interimText: string;
  /** Error message if in error state */
  errorMessage: string;
  /** Waveform amplitude data (32 bars, 0-255 range) for visualization */
  waveformData: number[];
  /** Start recording in initial mode */
  startRecording: () => Promise<void>;
  /** Stop the current recording */
  stopRecording: () => void;
  /** Start a correction recording (re-record to modify transcribed text) */
  startCorrection: () => Promise<void>;
  /** Update the transcribed text manually (for inline editing in review) */
  setTranscribedText: (text: string) => void;
  /** Reset to idle state */
  reset: () => void;
}

// =============================================================================
// Constants
// =============================================================================

/** Audio chunk interval in ms — how often MediaRecorder sends data */
const CHUNK_INTERVAL_MS = 250;

/**
 * Determine the best supported MIME type for MediaRecorder.
 * Falls back through webm (with opus), plain webm, mp4, and finally ''
 * (browser default) to support Safari/iOS which does not support webm.
 */
function getMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', ''];
  return candidates.find((type) => type === '' || MediaRecorder.isTypeSupported(type)) ?? '';
}

/** Waveform bar count for visualization */
const WAVEFORM_BARS = 32;

/** Deepgram WebSocket base URL */
const DEEPGRAM_WS_URL = 'wss://api.deepgram.com/v1/listen';

/** Deepgram streaming query parameters matching server-side DEEPGRAM_CONFIG */
const DEEPGRAM_PARAMS = new URLSearchParams({
  model: 'nova-2',
  language: 'en',
  smart_format: 'true',
  punctuate: 'true',
  utterances: 'true',
  interim_results: 'true',
});

// =============================================================================
// Hook Implementation
// =============================================================================

export function useVoiceInput(options: UseVoiceInputOptions = {}): UseVoiceInputReturn {
  const [state, setState] = useState<VoiceInputState>('idle');
  const [transcribedText, setTranscribedText] = useState('');
  const [interimText, setInterimText] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [waveformData, setWaveformData] = useState<number[]>(() => new Array(WAVEFORM_BARS).fill(0));

  // Refs to avoid stale closures in WebSocket message handlers
  const stateRef = useRef<VoiceInputState>('idle');
  const transcribedTextRef = useRef('');
  const accumulatedTextRef = useRef('');
  const optionsRef = useRef(options);

  // Resource refs for cleanup
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const websocketRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Keep options ref current
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  // Sync state ref
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Sync transcribedText ref
  useEffect(() => {
    transcribedTextRef.current = transcribedText;
  }, [transcribedText]);

  /**
   * Fetch a short-lived Deepgram token from our backend.
   */
  const fetchToken = useCallback(async (): Promise<string> => {
    const response = await fetch('/api/voice/token', { method: 'POST' });
    const data = await response.json();

    if (!data.success || !data.data?.token) {
      throw new Error(data.error?.message || 'Failed to get voice token');
    }

    return data.data.token;
  }, []);

  /**
   * Start waveform animation loop using AnalyserNode frequency data.
   */
  const startWaveformAnimation = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const animate = () => {
      analyser.getByteFrequencyData(dataArray);

      // Sample evenly across frequency bins to get WAVEFORM_BARS values
      const step = Math.floor(dataArray.length / WAVEFORM_BARS);
      const bars: number[] = [];
      for (let i = 0; i < WAVEFORM_BARS; i++) {
        const idx = i * step;
        bars.push(dataArray[idx] ?? 0);
      }

      setWaveformData(bars);
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);
  }, []);

  /**
   * Stop waveform animation and reset to zeros.
   */
  const stopWaveformAnimation = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setWaveformData(new Array(WAVEFORM_BARS).fill(0));
  }, []);

  /**
   * Clean up all active resources (MediaRecorder, WebSocket, AudioContext, animation).
   */
  const cleanup = useCallback(() => {
    // Stop MediaRecorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;

    // Close WebSocket
    if (websocketRef.current) {
      if (websocketRef.current.readyState === WebSocket.OPEN) {
        websocketRef.current.close();
      }
      websocketRef.current = null;
    }

    // Stop media stream tracks
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

    // Stop animation
    stopWaveformAnimation();
  }, [stopWaveformAnimation]);

  /**
   * Core recording function used by both initial and correction modes.
   * @param mode - 'initial' for first recording, 'correction' for re-recording to fix text
   */
  const startRecordingInternal = useCallback(async (mode: 'initial' | 'correction') => {
    // Clean up any previous session
    cleanup();

    try {
      // Request mic permission
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Set up AudioContext + AnalyserNode for waveform visualization
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      // Fetch a short-lived Deepgram token
      const token = await fetchToken();

      // Open native WebSocket to Deepgram with token as subprotocol
      const wsUrl = `${DEEPGRAM_WS_URL}?${DEEPGRAM_PARAMS.toString()}`;
      const ws = new WebSocket(wsUrl, ['token', token]);
      websocketRef.current = ws;

      // Reset accumulated text for this recording session
      accumulatedTextRef.current = '';
      setInterimText('');

      // WebSocket message handler — uses refs to avoid stale closures
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string);
          const transcript = data.channel?.alternatives?.[0]?.transcript;

          if (transcript) {
            if (data.is_final) {
              // Final result — accumulate
              accumulatedTextRef.current += (accumulatedTextRef.current ? ' ' : '') + transcript;
              setInterimText(accumulatedTextRef.current);
            } else {
              // Interim result — show accumulated + current interim
              const combined = accumulatedTextRef.current
                ? `${accumulatedTextRef.current} ${transcript}`
                : transcript;
              setInterimText(combined);
            }
          }
        } catch {
          // Ignore non-JSON messages (e.g., metadata)
        }
      };

      ws.onerror = () => {
        setErrorMessage('Voice connection error. Please try again.');
        setState('error');
        cleanup();
      };

      ws.onclose = () => {
        // Only transition to processing if we were actively recording
        const currentState = stateRef.current;
        if (currentState === 'recording' || currentState === 'correction') {
          const finalText = accumulatedTextRef.current.trim();

          if (!finalText) {
            // No speech detected — go back to idle
            setState('idle');
            return;
          }

          if (currentState === 'recording') {
            // Initial recording complete — move to review
            setTranscribedText(finalText);
            setState('review');
            optionsRef.current.onFinalTranscription?.(finalText);
          } else {
            // Correction recording complete — process correction
            optionsRef.current.onProcessCorrection?.(
              transcribedTextRef.current,
              finalText
            );
            setState('review');
          }
        }
      };

      // Wait for WebSocket to open before starting MediaRecorder
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('WebSocket connection timeout'));
        }, 5000);

        ws.addEventListener('open', () => {
          clearTimeout(timeout);
          resolve();
        }, { once: true });

        ws.addEventListener('error', () => {
          clearTimeout(timeout);
          reject(new Error('WebSocket connection failed'));
        }, { once: true });
      });

      // WebSocket is confirmed open — now it is safe to reflect this in UI state
      if (mode === 'initial') {
        setState('recording');
      } else {
        setState('correction');
      }

      // Start MediaRecorder — capture audio in 250ms chunks using the best
      // supported MIME type for this browser (Safari/iOS may not support webm)
      const mimeType = getMimeType();
      const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
          ws.send(event.data);
        }
      };

      mediaRecorder.start(CHUNK_INTERVAL_MS);

      // Start waveform visualization
      startWaveformAnimation();
    } catch (err) {
      cleanup();

      const message = err instanceof Error ? err.message : 'Failed to start recording';

      // Check for common mic permission errors
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setErrorMessage('Microphone permission denied. Please allow mic access and try again.');
      } else {
        setErrorMessage(message);
      }

      setState('error');
    }
  }, [cleanup, fetchToken, startWaveformAnimation]);

  /**
   * Start recording in initial mode.
   */
  const startRecording = useCallback(async () => {
    await startRecordingInternal('initial');
  }, [startRecordingInternal]);

  /**
   * Start a correction recording.
   */
  const startCorrection = useCallback(async () => {
    await startRecordingInternal('correction');
  }, [startRecordingInternal]);

  /**
   * Stop the current recording. Signals Deepgram to finalize by closing the WebSocket.
   */
  const stopRecording = useCallback(() => {
    setState('processing');

    // Stop MediaRecorder first (sends remaining data)
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    // Close WebSocket to signal Deepgram to finalize
    if (websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN) {
      websocketRef.current.close();
    }

    // Stop media stream and waveform
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    stopWaveformAnimation();
  }, [stopWaveformAnimation]);

  /**
   * Reset to idle state and clean up.
   */
  const reset = useCallback(() => {
    cleanup();
    setState('idle');
    setTranscribedText('');
    setInterimText('');
    setErrorMessage('');
  }, [cleanup]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    state,
    transcribedText,
    interimText,
    errorMessage,
    waveformData,
    startRecording,
    stopRecording,
    startCorrection,
    setTranscribedText,
    reset,
  };
}
