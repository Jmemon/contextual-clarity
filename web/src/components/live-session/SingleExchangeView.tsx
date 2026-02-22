/**
 * SingleExchangeView Component for Live Sessions (T12)
 *
 * Replaces the scrolling MessageList with a single-exchange view. At any given
 * moment only one piece of content is visible: the AI's current text, a brief
 * user-message flash, a loading indicator, or the streaming AI response.
 *
 * Each exchange replaces the previous — there is no visible history. This forces
 * genuine recall because the user cannot re-read earlier exchanges.
 *
 * The full conversation history is still maintained in the hook and the database;
 * this is purely a visual change.
 *
 * Phase transitions:
 *   showing_ai  → user sends  → user_sent (200ms) → loading → ai_streaming → showing_ai
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
 * - showing_ai:   AI's completed message is displayed.
 * - user_sent:    User's message briefly flashes (then fades upward ~400ms).
 * - loading:      Waiting for AI; pulsing bounce dots shown.
 * - ai_streaming: AI response is streaming in with a blinking cursor.
 */
export type ExchangePhase = 'showing_ai' | 'user_sent' | 'loading' | 'ai_streaming';

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
 * Renders one of four phases:
 * 1. showing_ai   — AI text with "Agent" label (fade-in except for opening msg)
 * 2. user_sent    — User text briefly visible, animating upward and fading out
 * 3. loading      — Three pulsing bounce dots with "Agent" label
 * 4. ai_streaming — AI text streaming in with a blinking cursor
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
  // Derived phase from the combination of incoming props.
  // Priority: user_sent > loading > ai_streaming > showing_ai
  const [phase, setPhase] = useState<ExchangePhase>('showing_ai');

  // Track the user message that is currently being animated so it remains
  // visible in the DOM while the exit animation plays (even after the prop
  // clears to null).
  const [visibleUserMessage, setVisibleUserMessage] = useState<string | null>(null);

  // Used to ensure we don't apply fade-in on the very first render of the
  // opening message, but do apply it on all subsequent AI messages.
  const hasShownFirstMessage = useRef(false);

  // -------------------------------------------------------------------------
  // Phase resolution
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (userMessageSent !== null) {
      // A new user message was just sent — show the brief user flash phase.
      setVisibleUserMessage(userMessageSent);
      setPhase('user_sent');
    } else if (isLoading) {
      setPhase('loading');
    } else if (isStreaming) {
      setPhase('ai_streaming');
    } else {
      setPhase('showing_ai');
    }
  }, [userMessageSent, isLoading, isStreaming]);

  // When the user_sent phase ends (userMessageSent clears) allow the
  // visibleUserMessage to be cleaned up after the exit animation completes.
  useEffect(() => {
    if (userMessageSent === null && phase === 'user_sent') {
      // Give the CSS animation time to finish before wiping the stored message.
      const timer = setTimeout(() => {
        setVisibleUserMessage(null);
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [userMessageSent, phase]);

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
    !userMessageSent &&
    !visibleUserMessage;

  return (
    <div className={`flex flex-col justify-center max-w-3xl mx-auto w-full ${className}`}>
      {/* ------------------------------------------------------------------ */}
      {/* Empty state — shown before the session produces any content         */}
      {/* ------------------------------------------------------------------ */}
      {isEmpty && (
        <div className="flex items-center justify-center h-full">
          <p className="text-clarity-400 text-lg">Starting session...</p>
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
          <p className="text-clarity-400 text-xs font-medium uppercase tracking-wider mb-3">
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
      {/* Phase: user_sent — brief flash of the user's message               */}
      {/* ------------------------------------------------------------------ */}
      {phase === 'user_sent' && visibleUserMessage && (
        // animate-user-flash: slides the message up 16px and fades it out over
        // 400ms, providing a clear visual signal that the message was sent
        // before the loading/streaming phase takes over.
        <div
          key={`user-${visibleUserMessage}`}
          className="animate-user-flash"
        >
          {/* "You" role label — matches the spec for the user_sent phase */}
          <p className="text-blue-300 text-xs font-medium mb-3 uppercase tracking-wide">You</p>
          <FormattedText
            content={visibleUserMessage}
            className="text-lg leading-relaxed text-blue-100"
          />
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Phase: loading — pulsing bounce dots                               */}
      {/* ------------------------------------------------------------------ */}
      {phase === 'loading' && (
        <div>
          {/* "Agent" role label */}
          <p className="text-clarity-400 text-xs font-medium uppercase tracking-wider mb-3">
            Agent
          </p>

          {/* Three staggered bounce dots */}
          <div className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 bg-clarity-400 rounded-full animate-bounce"
              style={{ animationDelay: '0ms' }}
            />
            <span
              className="w-2.5 h-2.5 bg-clarity-400 rounded-full animate-bounce"
              style={{ animationDelay: '150ms' }}
            />
            <span
              className="w-2.5 h-2.5 bg-clarity-400 rounded-full animate-bounce"
              style={{ animationDelay: '300ms' }}
            />
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Phase: ai_streaming — streaming text with blinking cursor          */}
      {/* ------------------------------------------------------------------ */}
      {phase === 'ai_streaming' && (
        <div>
          {/* "Agent" role label */}
          <p className="text-clarity-400 text-xs font-medium uppercase tracking-wider mb-3">
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
