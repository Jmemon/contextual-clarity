/**
 * Voice Input Component for Live Sessions
 *
 * Voice-first input that supports two modes:
 * - Voice (default): idle (mic button) -> recording (waveform + send) -> transcribing (spinner) -> idle (auto-sent)
 * - Text (fallback): standard textarea + send
 *
 * State-based rendering:
 * - Idle: mic button + keyboard switch
 * - Recording: waveform + send button (stops recording and transcribes)
 * - Transcribing: loading spinner
 * - Error: error message + text fallback
 * - Text mode: standard input + mic switch + send
 *
 * The hook auto-sends transcribed text via the onSend callback —
 * no review state is needed.
 */

import { useState, useRef, useCallback, useEffect, type FormEvent, type KeyboardEvent, type HTMLAttributes } from 'react';
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
  /** Whether the session is currently in rabbit hole mode — shifts accent to emerald */
  isInRabbithole?: boolean;
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
  isInRabbithole = false,
  className = '',
  ...props
}: VoiceInputProps) {
  // Accent color classes swap from clarity (blue) to emerald during rabbit hole mode
  const accentBg = isInRabbithole ? 'bg-emerald-600' : 'bg-clarity-600';
  const accentHover = isInRabbithole ? 'hover:bg-emerald-500' : 'hover:bg-clarity-500';
  const accentRing = isInRabbithole ? 'focus:ring-emerald-500' : 'focus:ring-clarity-500';
  const [inputMode, setInputMode] = useState<InputMode>('voice');
  const [textInputValue, setTextInputValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Voice input hook — batch transcription, auto-sends via onSend callback
  const {
    state: voiceState,
    errorMessage,
    waveformData,
    startRecording,
    stopAndSend,
    reset: resetVoice,
  } = useVoiceInput({ sessionId, onSend });

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

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

  // Enter key sends audio while recording
  useEffect(() => {
    if (voiceState !== 'recording') return;
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        stopAndSend();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [voiceState, stopAndSend]);

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
            className={`
              flex-1 px-4 py-3
              bg-slate-800/60 text-white placeholder-clarity-400
              rounded-xl
              focus:outline-none focus:ring-2 ${accentRing}
              disabled:opacity-50 disabled:cursor-not-allowed
              resize-none min-h-[48px] max-h-[120px]
              transition-all
            `}
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
            className={`
              p-3 ${accentBg} text-white rounded-xl
              ${accentHover}
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-all
            `}
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
            className={`
              w-14 h-14 rounded-full
              ${accentBg} text-white
              flex items-center justify-center
              ${accentHover}
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-all
            `}
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
              className={`
                w-14 h-14 rounded-full
                ${accentBg} text-white
                flex items-center justify-center
                ${accentHover}
                transition-colors
              `}
              aria-label="Send recording"
            >
              <SendIcon className="w-6 h-6" />
            </button>
          </div>

          <p className="text-clarity-500 text-xs text-center">
            Listening... press Enter or tap send when done
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

      {/* Error state: message + text fallback */}
      {voiceState === 'error' && (
        <div className="space-y-3">
          <p className="text-red-400 text-sm text-center">{errorMessage}</p>
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={resetVoice}
              className="px-4 py-2 bg-slate-700 text-white rounded-lg text-sm hover:bg-slate-600 transition-colors"
            >
              Try Again
            </button>
            <button
              type="button"
              onClick={switchToText}
              className={`px-4 py-2 ${accentBg} text-white rounded-lg text-sm ${accentHover} transition-colors`}
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
