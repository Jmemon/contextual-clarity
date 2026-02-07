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
import { Link } from 'react-router-dom';
import { useSessionWebSocket, type SessionCompleteSummary, type EvaluationResult } from '@/hooks/use-session-websocket';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { SessionProgress } from './SessionProgress';
import { SessionControls } from './SessionControls';

// ============================================================================
// Types
// ============================================================================

/**
 * Session lifecycle states.
 */
export type SessionState = 'connecting' | 'active' | 'evaluating' | 'completed';

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
  const [lastEvaluation, setLastEvaluation] = useState<EvaluationResult | null>(null);

  // Timer for session duration display
  const { formattedTime } = useSessionTimer();

  // Callbacks for WebSocket events
  const handleSessionStarted = useCallback(() => {
    setSessionState('active');
  }, []);

  const handleEvaluationResult = useCallback((result: EvaluationResult) => {
    setLastEvaluation(result);
    setSessionState('active'); // Return to active after evaluation
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

  const handleError = useCallback((code: string, message: string) => {
    console.error(`Session error [${code}]: ${message}`);
  }, []);

  // WebSocket connection
  const {
    connectionState,
    lastError,
    messages,
    streamingContent,
    currentPointIndex,
    totalPoints,
    isWaitingForResponse,
    sendUserMessage,
    triggerEvaluation,
    endSession,
    connect,
  } = useSessionWebSocket(sessionId, {
    onSessionStarted: handleSessionStarted,
    onEvaluationResult: handleEvaluationResult,
    onPointTransition: handlePointTransition,
    onSessionComplete: handleSessionComplete,
    onError: handleError,
  });

  /**
   * Handle triggering evaluation.
   */
  const handleTriggerEvaluation = useCallback(() => {
    setSessionState('evaluating');
    triggerEvaluation();
  }, [triggerEvaluation]);

  // Determine if controls should be disabled
  const controlsDisabled =
    isWaitingForResponse ||
    connectionState !== 'connected' ||
    sessionState === 'evaluating' ||
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
            currentPoint={currentPointIndex}
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

      {/* Progress bar below header */}
      {totalPoints > 0 && (
        <div className="px-6 py-2 bg-clarity-900/30">
          <SessionProgress
            currentPoint={currentPointIndex}
            totalPoints={totalPoints}
            showBar={true}
          />
        </div>
      )}

      {/* Main content area */}
      <main className="flex-1 flex flex-col max-w-4xl mx-auto w-full px-6 py-6 overflow-hidden">
        {/* Evaluation feedback banner */}
        {lastEvaluation && (
          <div
            className={`
              mb-4 p-4 rounded-xl
              ${lastEvaluation.outcome === 'success'
                ? 'bg-green-500/20 border border-green-500/30'
                : 'bg-amber-500/20 border border-amber-500/30'
              }
            `}
          >
            <p className={`font-medium ${lastEvaluation.outcome === 'success' ? 'text-green-400' : 'text-amber-400'}`}>
              {lastEvaluation.outcome === 'success' ? 'Great recall!' : 'Keep practicing'}
            </p>
            <p className="text-clarity-200 text-sm mt-1">{lastEvaluation.feedback}</p>
          </div>
        )}

        {/* Message list */}
        <MessageList
          messages={messages}
          streamingContent={streamingContent}
          isThinking={isWaitingForResponse && !streamingContent}
          className="flex-1"
        />

        {/* Input and controls */}
        <div className="border-t border-clarity-700 pt-6 mt-4">
          {/* Session controls */}
          <SessionControls
            onTriggerEvaluation={handleTriggerEvaluation}
            onEndSession={endSession}
            disabled={controlsDisabled}
            isEvaluating={sessionState === 'evaluating'}
            isSessionComplete={sessionState === 'completed'}
            className="mb-4"
          />

          {/* Message input */}
          <MessageInput
            onSend={sendUserMessage}
            disabled={controlsDisabled}
            placeholder="Type your response..."
          />

          <p className="text-clarity-500 text-sm text-center mt-3">
            Press Enter to send | Click "I've got it!" when you're ready to be evaluated
          </p>
        </div>
      </main>
    </div>
  );
}

export default SessionContainer;
