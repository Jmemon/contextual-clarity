/**
 * Message List Component for Live Sessions
 *
 * Displays a scrollable list of chat messages in the live session interface.
 * Features:
 * - User messages aligned right with blue styling
 * - Assistant messages aligned left with gray styling
 * - Auto-scroll to newest message
 * - Support for streaming messages
 *
 * @example
 * ```tsx
 * <MessageList
 *   messages={messages}
 *   streamingContent={streamingContent}
 *   className="flex-1"
 * />
 * ```
 */

import { useEffect, useRef, type HTMLAttributes } from 'react';
import type { ChatMessage } from '@/hooks/use-session-websocket';
import { StreamingMessage } from './StreamingMessage';

// ============================================================================
// Types
// ============================================================================

export interface MessageListProps extends HTMLAttributes<HTMLDivElement> {
  /** Array of chat messages to display */
  messages: ChatMessage[];
  /** Content of message currently being streamed (empty if none) */
  streamingContent?: string;
  /** Whether the assistant is thinking (show typing indicator) */
  isThinking?: boolean;
}

// ============================================================================
// Message Bubble Component
// ============================================================================

/**
 * Individual message bubble with role-based styling.
 */
function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <div
      className={`
        flex
        ${isUser ? 'justify-end' : 'justify-start'}
      `}
    >
      <div
        className={`
          max-w-2xl
          rounded-2xl
          p-4
          ${isUser
            ? 'bg-blue-600 text-white rounded-tr-sm ml-12'
            : 'bg-clarity-700/50 text-clarity-100 rounded-tl-sm mr-12'
          }
        `}
      >
        {/* Role label */}
        <p
          className={`
            text-xs mb-1 font-medium
            ${isUser ? 'text-blue-200' : 'text-clarity-400'}
          `}
        >
          {isUser ? 'You' : 'Agent'}
        </p>

        {/* Message content with preserved whitespace */}
        <p className="leading-relaxed whitespace-pre-wrap">{message.content}</p>
      </div>
    </div>
  );
}

// ============================================================================
// Message List Component
// ============================================================================

/**
 * Scrollable list of chat messages with auto-scroll functionality.
 * Supports both complete messages and streaming content.
 */
export function MessageList({
  messages,
  streamingContent = '',
  isThinking = false,
  className = '',
  ...props
}: MessageListProps) {
  // Ref for the scroll container to enable auto-scroll
  const containerRef = useRef<HTMLDivElement>(null);

  // Ref for the end of messages (scroll target)
  const messagesEndRef = useRef<HTMLDivElement>(null);

  /**
   * Scroll to the bottom of the message list.
   * Uses smooth scrolling for a better user experience.
   */
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Auto-scroll when messages change or streaming content updates
  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent, isThinking]);

  // Check if we have any content to show
  const hasContent = messages.length > 0 || streamingContent || isThinking;

  return (
    <div
      data-testid="message-list"
      ref={containerRef}
      className={`
        overflow-auto
        space-y-4
        ${className}
      `.trim()}
      {...props}
    >
      {/* Empty state when no messages */}
      {!hasContent && (
        <div className="flex items-center justify-center h-full">
          <p className="text-clarity-400 text-center">
            Connecting to your study session...
          </p>
        </div>
      )}

      {/* Render all complete messages */}
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}

      {/* Render streaming message if there is content being streamed */}
      {streamingContent && (
        <StreamingMessage content={streamingContent} />
      )}

      {/* Show typing indicator when waiting but no streaming content yet */}
      {isThinking && !streamingContent && (
        <div className="flex justify-start">
          <div className="bg-clarity-700/50 text-clarity-100 rounded-2xl rounded-tl-sm p-4 mr-12">
            <p className="text-xs mb-1 font-medium text-clarity-400">Agent</p>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 bg-clarity-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-clarity-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-clarity-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        </div>
      )}

      {/* Invisible element at the end for scroll targeting */}
      <div ref={messagesEndRef} />
    </div>
  );
}

export default MessageList;
