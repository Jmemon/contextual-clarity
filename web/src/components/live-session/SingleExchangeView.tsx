/**
 * SingleExchangeView Component for Live Sessions (T12)
 *
 * Replaces the scrolling MessageList with a single-exchange view. At any given
 * moment only one piece of content is visible: the AI's current text, an
 * awaiting-response view (agent prompt + user reply + loading dots), or the
 * streaming AI response.
 *
 * Each exchange replaces the previous — there is no visible history. This forces
 * genuine recall because the user cannot re-read earlier exchanges.
 *
 * The full conversation history is still maintained in the hook and the database;
 * this is purely a visual change.
 *
 * Phase transitions:
 *   showing_ai  → user sends  → awaiting_response → ai_streaming → showing_ai
 *
 * @example
 * ```tsx
 * <SingleExchangeView
 *   currentAssistantMessage={latestAssistantMessage}
 *   isStreaming={!!streamingContent}
 *   streamingContent={streamingContent || ''}
 *   userMessageSent={lastSentUserMessage}
 *   isLoading={isWaitingForResponse && !streamingContent}
 *   isOpeningMessage={isOpeningMessage}
 *   className="flex-1"
 * />
 * ```
 */

import { useState, useEffect, useRef } from 'react';
import { FormattedText } from '../shared/FormattedText';

// ============================================================================
// Types
// ============================================================================

/**
 * The phase the single-exchange view is currently in.
 * - showing_ai:         AI's completed message is displayed.
 * - awaiting_response:  User sent a message; shows agent prompt + user reply + loading dots.
 * - ai_streaming:       AI response is streaming in with a blinking cursor.
 */
export type ExchangePhase = 'showing_ai' | 'awaiting_response' | 'ai_streaming';

export interface SingleExchangeViewProps {
  /** The most-recently completed AI message (from assistant_complete). */
  currentAssistantMessage: string;
  /** Whether the AI is currently streaming a response. */
  isStreaming: boolean;
  /** Content of the response being streamed. */
  streamingContent: string;
  /**
   * The user message that was just sent.
   * Non-null for a brief window (500ms) after the user submits, then null.
   */
  userMessageSent: string | null;
  /** Whether we are waiting for the AI but streaming hasn't started yet. */
  isLoading: boolean;
  /**
   * True while the very first (opening) message is displayed.
   * Opening messages appear without the fade-in animation to avoid jarring
   * entry on session start.
   */
  isOpeningMessage: boolean;
  /** Additional CSS classes for the root element. */
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Single-exchange view for live sessions.
 *
 * Renders one of three phases:
 * 1. showing_ai         — AI text with "Agent" label (fade-in except for opening msg)
 * 2. awaiting_response  — Agent prompt + user reply + loading dots while waiting for AI
 * 3. ai_streaming       — AI text streaming in with a blinking cursor
 *
 * Empty state ("Starting session...") is shown before the first message arrives.
 */
export function SingleExchangeView({
  currentAssistantMessage,
  isStreaming,
  streamingContent,
  userMessageSent,
  isLoading,
  isOpeningMessage,
  className = '',
}: SingleExchangeViewProps) {
  // Accent color for labels and loading indicators — always clarity colors.
  const labelColor = 'text-clarity-400';
  const dotColor = 'bg-clarity-400';
  // Derived phase from the combination of incoming props.
  // Priority: ai_streaming > awaiting_response > showing_ai
  const [phase, setPhase] = useState<ExchangePhase>('showing_ai');

  // Used to ensure we don't apply fade-in on the very first render of the
  // opening message, but do apply it on all subsequent AI messages.
  const hasShownFirstMessage = useRef(false);

  // -------------------------------------------------------------------------
  // Phase resolution
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (isStreaming) {
      setPhase('ai_streaming');
    } else if (userMessageSent !== null || isLoading) {
      // User sent a message and we're waiting for AI — show both messages + dots
      setPhase('awaiting_response');
    } else {
      setPhase('showing_ai');
    }
  }, [userMessageSent, isLoading, isStreaming]);

  // Mark that we have displayed the first message so subsequent ones can
  // use the fade-in animation.
  useEffect(() => {
    if (currentAssistantMessage) {
      hasShownFirstMessage.current = true;
    }
  }, [currentAssistantMessage]);

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  // Whether to animate the currently displayed AI message.
  // The opening message skips the animation; every subsequent one uses it.
  const shouldAnimate = !isOpeningMessage && hasShownFirstMessage.current;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const isEmpty =
    !currentAssistantMessage &&
    !streamingContent &&
    !isLoading &&
    !userMessageSent;

  return (
    <div className={`flex flex-col justify-center max-w-3xl mx-auto w-full ${className}`}>
      {/* ------------------------------------------------------------------ */}
      {/* Empty state — shown before the session produces any content         */}
      {/* ------------------------------------------------------------------ */}
      {isEmpty && (
        <div className="flex items-center justify-center h-full">
          <p className={`${labelColor} text-lg`}>Starting session...</p>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Phase: showing_ai — completed AI message                           */}
      {/* ------------------------------------------------------------------ */}
      {phase === 'showing_ai' && currentAssistantMessage && (
        <div
          key={currentAssistantMessage}
          className={shouldAnimate ? 'animate-fade-in' : ''}
        >
          {/* "Agent" role label */}
          <p className={`${labelColor} text-xs font-medium uppercase tracking-wider mb-3`}>
            Agent
          </p>

          {/* AI message text — large, left-aligned, no chat bubble */}
          <FormattedText
            content={currentAssistantMessage}
            className="text-lg leading-relaxed text-white"
          />
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Phase: awaiting_response — agent message + user message + dots      */}
      {/* ------------------------------------------------------------------ */}
      {phase === 'awaiting_response' && (
        <div className="flex flex-col gap-6">
          {/* Agent's last message (the prompt the user responded to) */}
          {currentAssistantMessage && (
            <div>
              <p className={`${labelColor} text-xs font-medium uppercase tracking-wider mb-3`}>
                Agent
              </p>
              <FormattedText
                content={currentAssistantMessage}
                className="text-lg leading-relaxed text-white"
              />
            </div>
          )}

          {/* User's sent message */}
          {userMessageSent && (
            <div>
              <p className="text-blue-300 text-xs font-medium uppercase tracking-wider mb-3">
                You
              </p>
              <FormattedText
                content={userMessageSent}
                className="text-lg leading-relaxed text-blue-100"
              />
            </div>
          )}

          {/* Loading dots — AI is thinking */}
          <div>
            <p className={`${labelColor} text-xs font-medium uppercase tracking-wider mb-3`}>
              Agent
            </p>
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2.5 h-2.5 ${dotColor} rounded-full animate-bounce`}
                style={{ animationDelay: '0ms' }}
              />
              <span
                className={`w-2.5 h-2.5 ${dotColor} rounded-full animate-bounce`}
                style={{ animationDelay: '150ms' }}
              />
              <span
                className={`w-2.5 h-2.5 ${dotColor} rounded-full animate-bounce`}
                style={{ animationDelay: '300ms' }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Phase: ai_streaming — streaming text with blinking cursor          */}
      {/* ------------------------------------------------------------------ */}
      {phase === 'ai_streaming' && (
        <div>
          {/* "Agent" role label */}
          <p className={`${labelColor} text-xs font-medium uppercase tracking-wider mb-3`}>
            Agent
          </p>

          {/* Streaming content with blinking cursor appended */}
          <div className="text-lg leading-relaxed text-white">
            <FormattedText content={streamingContent} />
            {/* Blinking cursor to signal live streaming */}
            <span
              className="inline-block w-0.5 h-5 bg-white ml-0.5 align-middle animate-cursor-blink"
              aria-hidden="true"
            />
          </div>
        </div>
      )}

    </div>
  );
}

export default SingleExchangeView;
