/**
 * Streaming Message Component for Live Sessions
 *
 * Displays a message that is being streamed in real-time from the AI.
 * Shows partial content as chunks arrive with a typing indicator animation.
 *
 * Features:
 * - Shows partial content with blinking cursor
 * - Maintains consistent styling with assistant messages
 * - Smooth text appearance as chunks arrive
 *
 * @example
 * ```tsx
 * {streamingContent && (
 *   <StreamingMessage content={streamingContent} />
 * )}
 * ```
 */

import type { HTMLAttributes } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface StreamingMessageProps extends HTMLAttributes<HTMLDivElement> {
  /** The content received so far (partial message) */
  content: string;
}

// ============================================================================
// Component Implementation
// ============================================================================

/**
 * Message bubble for AI responses that are still being streamed.
 * Displays with a blinking cursor to indicate more content is coming.
 */
export function StreamingMessage({ content, className = '', ...props }: StreamingMessageProps) {
  return (
    <div
      className={`flex justify-start ${className}`}
      {...props}
    >
      <div className="max-w-2xl bg-clarity-700/50 text-clarity-100 rounded-2xl rounded-tl-sm p-4 mr-12">
        {/* Role label */}
        <p className="text-xs mb-1 font-medium text-clarity-400">Agent</p>

        {/* Streaming content with blinking cursor */}
        <p className="leading-relaxed whitespace-pre-wrap">
          {content}
          {/* Blinking cursor indicator */}
          <span className="inline-block w-2 h-4 ml-0.5 bg-clarity-300 animate-pulse" />
        </p>
      </div>
    </div>
  );
}

export default StreamingMessage;
