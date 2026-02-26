/**
 * TranscriptMessage Component
 *
 * Renders a single message bubble in the session transcript.
 * Displays user messages aligned right with blue background,
 * and assistant messages aligned left with gray background.
 *
 * Features:
 * - Role-based styling (user/assistant/system)
 * - Timestamp display for each message
 * - Support for evaluation and branch markers
 * - Responsive layout that adapts to message content
 *
 * @example
 * ```tsx
 * <TranscriptMessage
 *   message={message}
 *   recallPointContent={recallPointContent}
 * />
 * ```
 */

import type { TranscriptMessage as TranscriptMessageType } from '@/types/api';
import { EvaluationMarker } from './EvaluationMarker';
import { BranchMarker } from './BranchMarker';

// ============================================================================
// Types
// ============================================================================

export interface TranscriptMessageProps {
  /** The message data to display */
  message: TranscriptMessageType;
  /** Optional content of the recall point being evaluated (for display in marker) */
  recallPointContent?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Formats a timestamp string into a human-readable time (HH:MM format).
 *
 * @param timestamp - ISO 8601 timestamp string
 * @returns Formatted time string
 */
function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Gets the appropriate CSS classes for a message based on its role.
 * User messages are blue and right-aligned, assistant messages are gray and left-aligned.
 *
 * @param role - The message role ('user', 'assistant', or 'system')
 * @returns Object containing container and bubble class strings
 */
function getMessageStyles(role: 'user' | 'assistant' | 'system'): {
  container: string;
  bubble: string;
  timestamp: string;
} {
  switch (role) {
    case 'user':
      // User messages: blue background, right-aligned
      return {
        container: 'flex justify-end',
        bubble: 'bg-blue-500 text-white rounded-lg rounded-br-sm',
        timestamp: 'text-blue-300',
      };
    case 'assistant':
      // Assistant messages: dark slate background, left-aligned
      return {
        container: 'flex justify-start',
        bubble: 'bg-slate-800 text-slate-200 rounded-lg rounded-bl-sm',
        timestamp: 'text-slate-500',
      };
    case 'system':
      // System messages: subtle dark background, centered
      return {
        container: 'flex justify-center',
        bubble: 'bg-slate-800/50 text-slate-400 rounded-lg italic',
        timestamp: 'text-slate-500',
      };
    default:
      return {
        container: 'flex justify-start',
        bubble: 'bg-slate-800 text-slate-200 rounded-lg',
        timestamp: 'text-slate-500',
      };
  }
}

// ============================================================================
// TranscriptMessage Component
// ============================================================================

/**
 * Renders a single message in the session transcript with role-based styling.
 *
 * User messages appear on the right with a blue bubble,
 * assistant messages appear on the left with a gray bubble.
 * Includes timestamps and optional evaluation/rabbithole markers.
 */
export function TranscriptMessage({
  message,
  recallPointContent,
}: TranscriptMessageProps) {
  const styles = getMessageStyles(message.role);

  // Determine if we should show the evaluation marker
  // Only show when evaluation ends (has a success result)
  const showEvaluationMarker =
    message.evaluationMarker?.isEnd && message.evaluationMarker.success !== undefined;

  // Determine if we should show the branch marker
  // Show at the trigger point of a tangent
  const showBranchMarker = message.branchMarker?.isTrigger;

  return (
    <div className="mb-4">
      {/* Main message container with role-based alignment */}
      <div className={styles.container}>
        <div className="max-w-[75%] flex flex-col">
          {/* Role label for clarity */}
          <span
            className={`text-xs mb-1 ${
              message.role === 'user' ? 'text-right text-blue-400' : 'text-left text-slate-400'
            }`}
          >
            {message.role === 'user' ? 'You' : message.role === 'assistant' ? 'AI' : 'System'}
          </span>

          {/* Message bubble */}
          <div className={`px-4 py-3 ${styles.bubble}`}>
            {/* Message content with proper whitespace handling */}
            <p className="whitespace-pre-wrap break-words">{message.content}</p>

            {/* Timestamp in bottom corner */}
            <div className={`text-xs mt-2 ${styles.timestamp}`}>
              {formatTime(message.timestamp)}
            </div>
          </div>
        </div>
      </div>

      {/* Evaluation marker - shown after evaluation ends */}
      {showEvaluationMarker && message.evaluationMarker && (
        <div className={`mt-2 ${message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}`}>
          <div className="max-w-[75%]">
            <EvaluationMarker
              outcome={message.evaluationMarker.success ? 'success' : 'fail'}
              recallPointContent={recallPointContent}
              confidence={message.evaluationMarker.confidence}
            />
          </div>
        </div>
      )}

      {/* Branch marker - shown when tangent is triggered */}
      {showBranchMarker && message.branchMarker && (
        <div className="mt-2 flex justify-center">
          <BranchMarker
            topic={message.branchMarker.topic}
            depth={message.branchMarker.depth}
            isReturn={message.branchMarker.isReturn}
          />
        </div>
      )}
    </div>
  );
}

export default TranscriptMessage;
