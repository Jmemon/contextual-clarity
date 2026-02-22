/**
 * Voice Input Hook — Batch Transcription (Auto-Send)
 *
 * Manages the voice input lifecycle: mic permission, MediaRecorder for audio
 * capture, waveform visualization via AudioContext.AnalyserNode, and batch
 * transcription via server-side Deepgram REST API.
 *
 * State machine: idle -> recording -> transcribing -> idle (auto-sends on success)
 *
 * Key design decisions:
 * - Audio captured as a Blob (accumulated chunks), NOT streamed
 * - Transcription happens server-side via POST /api/voice/transcribe
 * - No client-side Deepgram connection — API key stays on server
 * - AbortController cancels in-flight requests on cleanup/new recording
 * - After transcription, onSend callback fires automatically (no review step)
 */

import { useState, useRef, useCallback, useEffect } from 'react';

// =============================================================================
// Types
// =============================================================================

export type VoiceInputState = 'idle' | 'recording' | 'transcribing' | 'error';

export interface UseVoiceInputOptions {
  /** Session ID passed to the transcribe endpoint for pipeline processing */
  sessionId?: string;
  /** Called automatically after transcription completes — sends the message */
  onSend?: (text: string) => void;
}

export interface UseVoiceInputReturn {
  state: VoiceInputState;
  errorMessage: string;
  waveformData: number[];
  startRecording: () => Promise<void>;
  /** Stop recording and send audio for transcription (auto-sends on success) */
  stopAndSend: () => void;
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
  const [errorMessage, setErrorMessage] = useState('');
  const [waveformData, setWaveformData] = useState<number[]>(() => new Array(WAVEFORM_BARS).fill(0));

  // Refs to avoid stale closures
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

  const startRecordingInternal = useCallback(async () => {
    cleanup();
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
   * Stop recording and send for transcription.
   * On success, fires onSend callback automatically and returns to idle.
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
        // Transcribe with pipeline (pass sessionId)
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

        // Auto-send: skip review, fire callback directly, return to idle
        optionsRef.current.onSend?.(result.text);
        setState('idle');
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
  }, [stopWaveformAnimation, collectAudioBlob, transcribeBlob]);

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  const startRecording = useCallback(async () => {
    await startRecordingInternal();
  }, [startRecordingInternal]);

  const reset = useCallback(() => {
    cleanup();
    setState('idle');
    setErrorMessage('');
  }, [cleanup]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { cleanup(); };
  }, [cleanup]);

  return {
    state,
    errorMessage,
    waveformData,
    startRecording,
    stopAndSend,
    reset,
  };
}
