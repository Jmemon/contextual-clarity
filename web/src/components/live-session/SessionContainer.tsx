/**
 * Session Container Component for Live Sessions
 *
 * Main container component that manages all state and orchestrates
 * the live session experience. Acts as a smart container that:
 * - Connects to the WebSocket
 * - Manages session state (active, evaluating, completed)
 * - Coordinates child components
 * - Handles session lifecycle events
 *
 * @example
 * ```tsx
 * <SessionContainer sessionId={sessionId} />
 * ```
 */

import { useState, useCallback, type HTMLAttributes } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSessionWebSocket, type SessionCompleteSummary, type CompleteOverlayData } from '@/hooks/use-session-websocket';
import { SingleExchangeView } from './SingleExchangeView';
import { VoiceInput } from './VoiceInput';
import { SessionProgress } from './SessionProgress';
import { SessionControls } from './SessionControls';
import { SessionCompleteOverlay } from './SessionCompleteOverlay';
import { RabbitholePrompt } from './RabbitholePrompt';
import { RabbitholeIndicator } from './RabbitholeIndicator';

// ============================================================================
// Types
// ============================================================================

/**
 * Session lifecycle states.
 * T08: Added 'paused' — session paused after leave_session.
 */
export type SessionState = 'connecting' | 'active' | 'completed' | 'paused';

export interface SessionContainerProps extends HTMLAttributes<HTMLDivElement> {
  /** Session ID to connect to */
  sessionId: string;
  /** Callback when session completes */
  onSessionComplete?: (summary: SessionCompleteSummary) => void;
}

// ============================================================================
// Session Timer Hook
// ============================================================================

/**
 * Simple hook to track elapsed time since session start.
 */
function useSessionTimer() {
  const [startTime] = useState(() => Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Update elapsed time every second
  useState(() => {
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  });

  // Format as MM:SS
  const formatTime = () => {
    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = elapsedSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  return { elapsedSeconds, formattedTime: formatTime() };
}

// ============================================================================
// Session Complete Screen
// ============================================================================

/**
 * Screen shown when session completes.
 */
function SessionCompleteScreen({ summary, sessionId }: { summary: SessionCompleteSummary; sessionId: string }) {
  // Format duration as MM:SS
  const formatDuration = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Calculate recall percentage
  const recallPercentage = Math.round(summary.recallRate * 100);

  return (
    <div data-testid="session-summary" className="flex-1 flex flex-col items-center justify-center text-center px-6">
      {/* Success icon */}
      <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mb-6">
        <svg
          className="w-10 h-10 text-green-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>

      {/* Completion title */}
      <h2 className="text-3xl font-bold text-white mb-2">Session Complete!</h2>
      <p className="text-clarity-300 mb-8">Great job on your study session.</p>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-4 w-full max-w-md mb-8">
        <div className="bg-clarity-700/50 rounded-xl p-4">
          <p className="text-clarity-400 text-sm mb-1">Duration</p>
          <p className="text-2xl font-bold text-white">{formatDuration(summary.durationMs)}</p>
        </div>
        <div className="bg-clarity-700/50 rounded-xl p-4">
          <p className="text-clarity-400 text-sm mb-1">Recall Rate</p>
          <p className="text-2xl font-bold text-white">{recallPercentage}%</p>
        </div>
        <div className="bg-clarity-700/50 rounded-xl p-4">
          <p className="text-clarity-400 text-sm mb-1">Points Attempted</p>
          <p className="text-2xl font-bold text-white">{summary.pointsAttempted}</p>
        </div>
        <div className="bg-clarity-700/50 rounded-xl p-4">
          <p className="text-clarity-400 text-sm mb-1">Successful</p>
          <p className="text-2xl font-bold text-green-400">{summary.pointsSuccessful}</p>
        </div>
      </div>

      {/* Engagement score */}
      <div className="bg-clarity-700/30 rounded-xl p-4 w-full max-w-md mb-8">
        <p className="text-clarity-400 text-sm mb-2">Engagement Score</p>
        <div className="flex items-center justify-center gap-4">
          <div className="h-2 flex-1 bg-clarity-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-clarity-500 rounded-full"
              style={{ width: `${summary.engagementScore}%` }}
            />
          </div>
          <span className="text-xl font-bold text-white">{summary.engagementScore}</span>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-4">
        <Link
          to={`/sessions/${sessionId}`}
          className="px-6 py-3 bg-clarity-600 text-white rounded-xl font-medium hover:bg-clarity-500 transition-colors"
        >
          View Replay
        </Link>
        <Link
          to="/"
          className="px-6 py-3 bg-clarity-700 text-white rounded-xl font-medium hover:bg-clarity-600 transition-colors"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}

// ============================================================================
// Connection Error Screen
// ============================================================================

/**
 * Screen shown when there's a connection error.
 */
function ConnectionErrorScreen({
  error,
  onRetry,
}: {
  error: { code: string; message: string } | null;
  onRetry: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
      {/* Error icon */}
      <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center mb-6">
        <svg
          className="w-10 h-10 text-red-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>

      <h2 className="text-2xl font-bold text-white mb-2">Connection Error</h2>
      <p className="text-clarity-300 mb-4">
        {error?.message || 'Failed to connect to the session.'}
      </p>
      {error?.code && (
        <p className="text-clarity-500 text-sm mb-6">Error code: {error.code}</p>
      )}

      <div className="flex gap-4">
        <button
          onClick={onRetry}
          className="px-6 py-3 bg-clarity-600 text-white rounded-xl font-medium hover:bg-clarity-500 transition-colors"
        >
          Try Again
        </button>
        <Link
          to="/"
          className="px-6 py-3 bg-clarity-700 text-white rounded-xl font-medium hover:bg-clarity-600 transition-colors"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}

// ============================================================================
// Session Container Component
// ============================================================================

/**
 * Main container for live session, orchestrating all session functionality.
 */
export function SessionContainer({
  sessionId,
  onSessionComplete,
  className = '',
  ...props
}: SessionContainerProps) {
  // Session state management
  const [sessionState, setSessionState] = useState<SessionState>('connecting');
  const [sessionSummary, setSessionSummary] = useState<SessionCompleteSummary | null>(null);

  // T08: Overlay state — shown when all recall points have been recalled.
  // The session is still live; the user can choose to continue or leave.
  const [showCompleteOverlay, setShowCompleteOverlay] = useState(false);
  const [overlayData, setOverlayData] = useState<CompleteOverlayData | null>(null);

  // Timer for session duration display
  const { formattedTime } = useSessionTimer();

  const navigate = useNavigate();

  // Callbacks for WebSocket events
  const handleSessionStarted = useCallback(() => {
    setSessionState('active');
  }, []);

  const handlePointTransition = useCallback(() => {
    // Point transition handled automatically by the hook
    setSessionState('active');
  }, []);

  const handleSessionComplete = useCallback((summary: SessionCompleteSummary) => {
    setSessionSummary(summary);
    setSessionState('completed');
    onSessionComplete?.(summary);
  }, [onSessionComplete]);

  // T08: Show overlay when all points have been recalled.
  // The session remains live — no WS message is sent here.
  const handleCompleteOverlay = useCallback((data: CompleteOverlayData) => {
    setOverlayData(data);
    setShowCompleteOverlay(true);
  }, []);

  // T08: User chose "Continue Discussion" — dismiss overlay, no WS message.
  const handleContinueDiscussion = useCallback(() => {
    setShowCompleteOverlay(false);
  }, []);

  const handleError = useCallback((code: string, message: string) => {
    console.error(`Session error [${code}]: ${message}`);
  }, []);

  // T08: After leave_session is acknowledged (session_paused), navigate to dashboard.
  const handleSessionPaused = useCallback(() => {
    navigate('/');
  }, [navigate]);

  // WebSocket connection.
  // Note: `messages` is intentionally omitted from destructuring here (T12).
  // The full conversation history is maintained inside the hook and written to
  // the database; SessionContainer no longer renders it directly.
  const {
    connectionState,
    lastError,
    streamingContent,
    recalledCount,
    totalPoints,
    isWaitingForResponse,
    sendUserMessage,
    leaveSession,
    connect,
    // T12: single-exchange UI fields
    latestAssistantMessage,
    lastSentUserMessage,
    isOpeningMessage,
    // T09: rabbit hole mode fields
    isInRabbithole,
    rabbitholeTopic,
    rabbitholePrompt,
    enterRabbithole,
    exitRabbithole,
    declineRabbithole,
  } = useSessionWebSocket(sessionId, {
    onSessionStarted: handleSessionStarted,
    onPointTransition: handlePointTransition,
    onSessionComplete: handleSessionComplete,
    onCompleteOverlay: handleCompleteOverlay,
    onSessionPaused: handleSessionPaused,
    onError: handleError,
  });

  // Determine if controls should be disabled
  const controlsDisabled =
    isWaitingForResponse ||
    connectionState !== 'connected' ||
    sessionState === 'completed';

  // Show connection error screen if disconnected with error
  if (connectionState === 'disconnected' && lastError && sessionState !== 'completed') {
    return (
      <div className={`flex flex-col h-full ${className}`} {...props}>
        <ConnectionErrorScreen error={lastError} onRetry={connect} />
      </div>
    );
  }

  // Show completion screen if session is complete
  if (sessionState === 'completed' && sessionSummary) {
    return (
      <div className={`flex flex-col h-full ${className}`} {...props}>
        <SessionCompleteScreen summary={sessionSummary} sessionId={sessionId} />
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full ${className}`} {...props}>
      {/* Header with timer and progress */}
      <header className="flex items-center justify-between px-6 py-4 bg-clarity-900/50 border-b border-clarity-700">
        {/* Session info */}
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 rounded-lg bg-clarity-600 flex items-center justify-center text-white text-sm font-bold">
            CC
          </div>
          <div>
            <p className="text-white font-medium">Live Session</p>
            <p className="text-clarity-400 text-sm">
              {connectionState === 'connected' ? 'Connected' :
               connectionState === 'connecting' ? 'Connecting...' :
               connectionState === 'reconnecting' ? 'Reconnecting...' : 'Disconnected'}
            </p>
          </div>
        </div>

        {/* Timer and progress */}
        <div className="flex items-center gap-6">
          {/* Session timer */}
          <div className="text-clarity-200 font-mono text-lg">
            {formattedTime}
          </div>

          {/* Session progress */}
          <SessionProgress
            currentPoint={recalledCount}
            totalPoints={totalPoints}
            showBar={false}
            className="min-w-[100px]"
          />

          {/* Exit button */}
          <Link
            to="/"
            className="px-4 py-2 bg-clarity-700 text-white rounded-lg hover:bg-clarity-600 transition-colors text-sm"
          >
            Exit
          </Link>
        </div>
      </header>

      {/* T09: RabbitholeIndicator replaces SessionProgress bar during rabbit hole mode.
           Signals to the user they're in a separate exploration context. */}
      {isInRabbithole && rabbitholeTopic ? (
        <RabbitholeIndicator
          topic={rabbitholeTopic}
          onReturn={exitRabbithole}
        />
      ) : (
        /* Progress bar below header — hidden during rabbit hole mode */
        totalPoints > 0 && (
          <div className="px-6 py-2 bg-clarity-900/30">
            <SessionProgress
              currentPoint={recalledCount}
              totalPoints={totalPoints}
              showBar={true}
            />
          </div>
        )
      )}

      {/* T08: Session complete overlay — shown when all recall points recalled.
           User can continue discussing or leave (which pauses the session). */}
      {/* FIX 7: Pass message and canContinue from overlayData so the overlay shows
           the server-provided text and conditionally shows the "Continue" button. */}
      {showCompleteOverlay && overlayData && (
        <SessionCompleteOverlay
          recalledCount={overlayData.recalledCount}
          totalPoints={overlayData.totalPoints}
          onContinue={handleContinueDiscussion}
          onDone={leaveSession}
          message={overlayData.message}
          canContinue={overlayData.canContinue}
        />
      )}

      {/* Main content area */}
      <main className="flex-1 flex flex-col max-w-4xl mx-auto w-full px-6 py-6 overflow-hidden">
        {/*
          T12: Single-exchange view replaces the scrolling MessageList.
          Only one AI turn is visible at a time — no history shown to the user.
          The full conversation is still in `messages` (maintained by the hook)
          for the evaluator and database; this is purely a visual change.
        */}
        <SingleExchangeView
          currentAssistantMessage={latestAssistantMessage}
          isStreaming={!!streamingContent}
          streamingContent={streamingContent || ''}
          userMessageSent={lastSentUserMessage}
          isLoading={isWaitingForResponse && !streamingContent}
          isOpeningMessage={isOpeningMessage}
          className="flex-1"
        />

        {/* T09: Rabbit hole opt-in prompt — shown inline when a tangent is detected.
             Dismissed when the user accepts (enter_rabbithole) or declines. */}
        {rabbitholePrompt && !isInRabbithole && (
          <RabbitholePrompt
            topic={rabbitholePrompt.topic}
            onExplore={() => enterRabbithole(rabbitholePrompt.rabbitholeEventId, rabbitholePrompt.topic)}
            onDecline={declineRabbithole}
            className="mt-3"
          />
        )}

        {/* Input and controls */}
        <div className="border-t border-clarity-700 pt-6 mt-4">
          {/* Session controls — "I've got it!" removed (T06: continuous evaluation).
              T08: "End Session" renamed to "Leave Session" (non-destructive pause). */}
          <SessionControls
            onLeaveSession={leaveSession}
            disabled={controlsDisabled}
            isSessionComplete={sessionState === 'completed'}
            className="mb-4"
          />

          {/* Voice-first input (with text fallback) */}
          <VoiceInput
            onSend={sendUserMessage}
            disabled={controlsDisabled}
            placeholder="Type your response..."
          />
        </div>
      </main>
    </div>
  );
}

export default SessionContainer;
