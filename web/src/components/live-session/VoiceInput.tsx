/**
 * Voice Input Component for Live Sessions
 *
 * Voice-first input that replaces MessageInput. Supports two modes:
 * - Voice (default): tap mic to record, Deepgram transcribes, review before sending
 * - Text (fallback): standard text input for when voice isn't available/desired
 *
 * State-based rendering:
 * - Idle: mic button + keyboard switch
 * - Recording: waveform + pulsing red mic button
 * - Processing: loading spinner
 * - Review: transcribed text (tappable to edit) + correction mic + send button
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
  /** Callback to process transcription through the pipeline (optional) */
  onProcessTranscription?: (text: string) => void;
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
  onProcessTranscription,
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

  // Voice input hook
  const {
    state: voiceState,
    transcribedText,
    interimText,
    errorMessage,
    waveformData,
    startRecording,
    stopRecording,
    startCorrection,
    setTranscribedText,
    reset: resetVoice,
  } = useVoiceInput({
    onFinalTranscription: (text) => {
      onProcessTranscription?.(text);
    },
    onProcessCorrection: (_currentText, correctionInstruction) => {
      // The correction instruction is spoken; the parent should process it
      // For now, just replace the text with the correction instruction
      // In production this would call the correction-processor endpoint
      onProcessTranscription?.(correctionInstruction);
    },
  });

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  /** Send the current transcribed text (voice review mode) */
  const handleVoiceSend = useCallback(() => {
    if (disabled || !transcribedText.trim()) return;
    onSend(transcribedText.trim());
    resetVoice();
  }, [disabled, transcribedText, onSend, resetVoice]);

  /** Handle text mode form submission */
  const handleTextSubmit = useCallback((e: FormEvent) => {
    e.preventDefault();
    const trimmed = textInputValue.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setTextInputValue('');
    textareaRef.current?.focus();
  }, [textInputValue, disabled, onSend]);

  /** Handle Enter key in text mode */
  const handleTextKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleTextSubmit(e);
    }
  }, [handleTextSubmit]);

  /** Handle Enter key in voice review mode */
  const handleReviewKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleVoiceSend();
    }
  }, [handleVoiceSend]);

  /** Mobile swipe-up detection for sending */
  const handleTouchStart = useCallback((e: TouchEvent) => {
    touchStartYRef.current = e.touches[0]?.clientY ?? null;
  }, []);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (touchStartYRef.current === null) return;
    const touchEndY = e.changedTouches[0]?.clientY ?? touchStartYRef.current;
    const deltaY = touchStartYRef.current - touchEndY;
    touchStartYRef.current = null;

    // Swipe up (50px threshold) to send
    if (deltaY > 50 && voiceState === 'review') {
      handleVoiceSend();
    }
  }, [voiceState, handleVoiceSend]);

  /** Switch to text input mode */
  const switchToText = useCallback(() => {
    resetVoice();
    setInputMode('text');
  }, [resetVoice]);

  /** Switch to voice input mode */
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

          {/* Mic switch button */}
          <button
            type="button"
            onClick={switchToVoice}
            disabled={disabled}
            className="p-3 text-clarity-400 hover:text-white transition-colors disabled:opacity-50"
            aria-label="Switch to voice input"
          >
            <MicIcon className="w-5 h-5" />
          </button>

          {/* Send button */}
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

      {/* Recording state: waveform + pulsing red stop button */}
      {(voiceState === 'recording' || voiceState === 'correction') && (
        <div className="space-y-3">
          {/* Interim transcription preview */}
          {interimText && (
            <p className="text-clarity-300 text-sm text-center truncate px-4">
              {interimText}
            </p>
          )}

          <div className="flex items-center gap-4">
            <Waveform data={waveformData} className="flex-1" />

            <button
              type="button"
              onClick={stopRecording}
              className="
                w-14 h-14 rounded-full
                bg-red-500 text-white
                flex items-center justify-center
                animate-pulse
                hover:bg-red-400
                transition-colors
              "
              aria-label="Stop recording"
            >
              <MicIcon className="w-6 h-6" />
            </button>
          </div>

          <p className="text-clarity-500 text-xs text-center">
            {voiceState === 'correction' ? 'Speak your correction...' : 'Listening... tap to stop'}
          </p>
        </div>
      )}

      {/* Processing state: loading spinner */}
      {voiceState === 'processing' && (
        <div className="flex items-center justify-center py-4">
          <svg className="animate-spin h-6 w-6 text-clarity-400" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="ml-3 text-clarity-400 text-sm">Processing speech...</span>
        </div>
      )}

      {/* Review state: editable transcription + correction mic + send */}
      {voiceState === 'review' && (
        <div className="space-y-3">
          {/* Editable transcription text */}
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
            {/* Re-record / correct button */}
            <button
              type="button"
              onClick={startCorrection}
              disabled={disabled}
              className="
                p-2 text-clarity-400 hover:text-white
                transition-colors disabled:opacity-50
                flex items-center gap-2 text-sm
              "
              aria-label="Record correction"
            >
              <MicIcon className="w-4 h-4" />
              <span>Correct</span>
            </button>

            <div className="flex items-center gap-2">
              {/* Cancel button */}
              <button
                type="button"
                onClick={resetVoice}
                className="px-4 py-2 text-clarity-400 hover:text-white text-sm transition-colors"
              >
                Cancel
              </button>

              {/* Send button */}
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
