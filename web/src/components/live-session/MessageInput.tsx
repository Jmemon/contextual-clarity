/**
 * Message Input Component for Live Sessions
 *
 * Text input with send button for typing and sending messages in live sessions.
 * Features:
 * - Text input that expands as needed
 * - Send button with loading state
 * - Enter key to send (Shift+Enter for newline)
 * - Disabled state while waiting for response
 *
 * @example
 * ```tsx
 * <MessageInput
 *   onSend={sendUserMessage}
 *   disabled={isWaitingForResponse}
 *   placeholder="Type your response..."
 * />
 * ```
 */

import { useState, useRef, type FormEvent, type KeyboardEvent, type HTMLAttributes } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface MessageInputProps extends Omit<HTMLAttributes<HTMLFormElement>, 'onSubmit'> {
  /** Callback when a message is sent */
  onSend: (message: string) => void;
  /** Whether the input is disabled (e.g., waiting for response) */
  disabled?: boolean;
  /** Placeholder text for the input */
  placeholder?: string;
}

// ============================================================================
// Component Implementation
// ============================================================================

/**
 * Message input form with text area and send button.
 * Handles Enter key submission and manages its own input state.
 */
export function MessageInput({
  onSend,
  disabled = false,
  placeholder = 'Type your response...',
  className = '',
  ...props
}: MessageInputProps) {
  // Local state for input value
  const [inputValue, setInputValue] = useState('');

  // Ref for the textarea to manage focus
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /**
   * Handle form submission.
   */
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    const trimmedValue = inputValue.trim();
    if (!trimmedValue || disabled) return;

    // Send the message and clear input
    onSend(trimmedValue);
    setInputValue('');

    // Refocus the input for continued typing
    textareaRef.current?.focus();
  };

  /**
   * Handle keyboard events for Enter key submission.
   * Enter sends, Shift+Enter creates a newline.
   */
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={`flex gap-4 ${className}`}
      {...props}
    >
      {/* Text input area */}
      <textarea
        ref={textareaRef}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        className={`
          flex-1
          px-6 py-4
          bg-clarity-700/50
          text-white
          placeholder-clarity-400
          rounded-xl
          focus:outline-none focus:ring-2 focus:ring-clarity-500
          disabled:opacity-50 disabled:cursor-not-allowed
          resize-none
          min-h-[56px]
          max-h-[120px]
          transition-opacity
        `}
      />

      {/* Send button */}
      <button
        type="submit"
        disabled={disabled || !inputValue.trim()}
        className={`
          px-8 py-4
          bg-clarity-600
          text-white
          rounded-xl
          font-medium
          hover:bg-clarity-500
          focus:outline-none focus:ring-2 focus:ring-clarity-500 focus:ring-offset-2 focus:ring-offset-clarity-800
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-all
          min-w-[100px]
        `}
      >
        {disabled ? (
          // Loading spinner when disabled
          <span className="flex items-center justify-center gap-2">
            <svg
              className="animate-spin h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </span>
        ) : (
          'Send'
        )}
      </button>
    </form>
  );
}

export default MessageInput;
