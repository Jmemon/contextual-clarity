/**
 * WebSocket Hook for Live Study Sessions
 *
 * Provides a React hook for managing WebSocket connections to live study sessions.
 * Handles:
 * - Connection establishment and URL construction
 * - Automatic reconnection with exponential backoff
 * - Message parsing and event dispatching
 * - Connection state management
 * - Ping/pong heartbeat for connection health
 *
 * @example
 * ```tsx
 * function LiveSession({ sessionId }: { sessionId: string }) {
 *   const {
 *     connectionState,
 *     messages,
 *     streamingContent,
 *     sendUserMessage,
 *     leaveSession,
 *   } = useSessionWebSocket(sessionId, {
 *     onSessionComplete: (summary) => navigate('/sessions'),
 *   });
 *
 *   return (
 *     <div>
 *       <ConnectionStatus state={connectionState} />
 *       <MessageList messages={messages} streamingContent={streamingContent} />
 *       <Input onSend={sendUserMessage} />
 *     </div>
 *   );
 * }
 * ```
 */

import { useRef, useEffect, useCallback, useState } from 'react';
// NOTE: T08 modifies this file in parallel (renaming endSession→leaveSession).
// T12 changes are: new state vars (latestAssistantMessage, lastSentUserMessage,
// isOpeningMessage), updated return type, and updated event handlers.

// ============================================================================
// Types
// ============================================================================

/**
 * WebSocket connection states.
 * - connecting: Initial connection attempt in progress
 * - connected: Successfully connected and ready for messages
 * - disconnected: Connection closed (intentionally or due to error)
 * - reconnecting: Attempting to reconnect after a disconnect
 */
export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

/**
 * Messages sent from client to server via WebSocket.
 * T13: Removed 'trigger_eval' (evaluation is continuous since T06).
 * T13: Added 'dismiss_overlay' for dismissing the completion overlay.
 */
export type ClientMessage =
  | { type: 'user_message'; content: string }
  | { type: 'leave_session' }  // T08: replaces 'end_session' — pauses session instead of abandoning
  | { type: 'ping' }
  | { type: 'enter_rabbithole'; rabbitholeEventId: string; topic: string }
  | { type: 'exit_rabbithole' }
  | { type: 'decline_rabbithole' }
  | { type: 'dismiss_overlay' };  // T13: dismiss completion overlay, continue discussion

/**
 * Messages received from server via WebSocket.
 * T13: Removed 'evaluation_result' and 'point_transition' (deprecated).
 * T13: Updated 'session_started' to use recalledCount instead of currentPointIndex.
 */
export type ServerMessage =
  | { type: 'session_started'; sessionId: string; openingMessage: string; totalPoints: number; recalledCount: number }
  | { type: 'assistant_chunk'; content: string }
  | { type: 'assistant_complete'; fullContent: string }
  | { type: 'point_recalled'; pointId: string; recalledCount: number; totalPoints: number }
  | { type: 'session_complete'; summary: SessionCompleteSummary }
  | { type: 'session_complete_overlay'; sessionId: string; recalledCount: number; totalPoints: number; message?: string; canContinue?: boolean }
  | { type: 'session_paused'; sessionId: string; recalledCount: number; totalPoints: number }
  | { type: 'rabbithole_detected'; topic: string; rabbitholeEventId: string }
  | { type: 'rabbithole_entered'; topic: string }
  | { type: 'rabbithole_exited'; label: string; pointsRecalledDuring: number; completionPending: boolean }
  | { type: 'error'; code: string; message: string }
  | { type: 'pong' };

/**
 * Summary data received when session completes.
 * T13: Field names updated to match server's SessionCompletionSummary.
 * - totalPointsReviewed replaces pointsAttempted
 * - successfulRecalls replaces pointsSuccessful
 * New fields: sessionId, rabbitholeCount, recalledPointIds, estimatedCostUsd
 */
export interface SessionCompleteSummary {
  /** Unique identifier for the session */
  sessionId: string;
  /** Total duration of the session in milliseconds */
  durationMs: number;
  /** Recall success rate (0.0 to 1.0) */
  recallRate: number;
  /** Total number of recall points reviewed (was: pointsAttempted) */
  totalPointsReviewed: number;
  /** Number of successfully recalled points (was: pointsSuccessful) */
  successfulRecalls: number;
  /** Overall engagement score */
  engagementScore: number;
  /** Number of rabbit holes entered during the session */
  rabbitholeCount: number;
  /** IDs of all recall points that were successfully recalled */
  recalledPointIds: string[];
  /** Estimated API cost in USD */
  estimatedCostUsd: number;
}

/**
 * A message in the conversation (user or assistant).
 */
export interface ChatMessage {
  /** Unique message identifier */
  id: string;
  /** Role of the message author */
  role: 'user' | 'assistant';
  /** Message content text */
  content: string;
  /** When the message was added */
  timestamp: Date;
  /** Whether this message is still being streamed */
  isStreaming?: boolean;
}

/**
 * Evaluation result for a recall point.
 */
export interface EvaluationResult {
  /** ID of the recall point evaluated */
  recallPointId: string;
  /** Outcome of the evaluation */
  outcome: string;
  /** Feedback message from the AI */
  feedback: string;
}

/**
 * Overlay data received when all points have been recalled (T08).
 * FIX 7: Added optional message and canContinue fields forwarded from the server payload.
 */
export interface CompleteOverlayData {
  /** Session ID */
  sessionId: string;
  /** Number of points recalled */
  recalledCount: number;
  /** Total points in session */
  totalPoints: number;
  /** Optional message from the server to show in the overlay */
  message?: string;
  /** Whether the user can continue discussing after the overlay */
  canContinue?: boolean;
}

/**
 * T09: Data for the rabbit hole prompt shown when a tangent is detected.
 */
export interface RabbitholePromptData {
  /** The detected tangent topic */
  topic: string;
  /** Event ID used when accepting or declining */
  rabbitholeEventId: string;
}

/**
 * Configuration options for the WebSocket hook.
 */
export interface UseSessionWebSocketOptions {
  /** Callback when session is started */
  onSessionStarted?: (sessionId: string, openingMessage: string) => void;
  /** Callback when evaluation result is received */
  onEvaluationResult?: (result: EvaluationResult) => void;
  /** Callback when transitioning to next recall point */
  onPointTransition?: (nextIndex: number, total: number) => void;
  /** Callback when session completes (finalized as 'completed') */
  onSessionComplete?: (summary: SessionCompleteSummary) => void;
  /** T08: Callback when all points recalled — triggers completion overlay in UI */
  onCompleteOverlay?: (data: CompleteOverlayData) => void;
  /** T08: Callback when session is paused after leave_session */
  onSessionPaused?: (data: CompleteOverlayData) => void;
  /** T09: Callback when a rabbit hole tangent is detected — show opt-in prompt */
  onRabbitholeDetected?: (data: RabbitholePromptData) => void;
  /** T09: Callback when the user enters a rabbit hole */
  onRabbitholeEntered?: (topic: string) => void;
  /** T09: Callback when the user exits a rabbit hole */
  onRabbitholeExited?: (label: string, pointsRecalledDuring: number, completionPending: boolean) => void;
  /** Callback when an error occurs */
  onError?: (code: string, message: string) => void;
  /** Whether to auto-connect on mount (default: true) */
  autoConnect?: boolean;
}

/**
 * Return value from the useSessionWebSocket hook.
 */
export interface UseSessionWebSocketReturn {
  /** Current connection state */
  connectionState: ConnectionState;
  /** Last error that occurred */
  lastError: { code: string; message: string } | null;
  /** All chat messages (user and assistant) — full history kept for evaluator/DB */
  messages: ChatMessage[];
  /** Content of message currently being streamed (empty if none) */
  streamingContent: string;
  /** Number of recall points recalled so far */
  recalledCount: number;
  /** Total number of points in the session */
  totalPoints: number;
  /** Whether waiting for assistant response */
  isWaitingForResponse: boolean;
  /** Send a user message */
  sendUserMessage: (content: string) => void;
  /** T08: Pause the session non-destructively (replaces endSession) */
  leaveSession: () => void;
  /** Manually connect to WebSocket */
  connect: () => void;
  /** Manually disconnect from WebSocket */
  disconnect: () => void;

  // ---- T12: Single-Exchange UI fields ----
  /**
   * The most recently completed AI message text (from assistant_complete or
   * session_started). Used by SingleExchangeView to display the current AI turn.
   */
  latestAssistantMessage: string;
  /**
   * The user message that was just sent. Set on send; cleared ~500ms later.
   * SingleExchangeView uses this for the brief "user_sent" flash phase.
   */
  lastSentUserMessage: string | null;
  /**
   * True while the very first (opening) AI message is being shown.
   * Lets SingleExchangeView skip the fade-in animation for the first message.
   */
  isOpeningMessage: boolean;

  // ---- T09: Rabbit Hole UX Mode fields ----
  /** T09: Whether the session is currently in rabbit hole mode */
  isInRabbithole: boolean;
  /** T09: Topic currently being explored in rabbit hole (null if not in rabbit hole) */
  rabbitholeTopic: string | null;
  /** T09: Pending prompt data when a rabbit hole is detected (null if no prompt) */
  rabbitholePrompt: RabbitholePromptData | null;
  /** T09: Enter a rabbit hole after the user opts in */
  enterRabbithole: (rabbitholeEventId: string, topic: string) => void;
  /** T09: Exit the current rabbit hole and return to the session */
  exitRabbithole: () => void;
  /** T09: Decline the current rabbit hole prompt */
  declineRabbithole: () => void;
  /** T13: Dismiss the completion overlay and continue the discussion */
  dismissOverlay: () => void;

  // ---- T11: Visual Progress fields ----
  /**
   * Labels of rabbit holes that have been fully explored (entered and exited).
   * Each entry is the `label` field from the `rabbithole_exited` payload.
   */
  rabbitholeLabels: string[];
}

// ============================================================================
// Constants
// ============================================================================

/** Maximum number of reconnection attempts */
const MAX_RECONNECT_ATTEMPTS = 5;

/** Base delay for exponential backoff (in ms) */
const BASE_RECONNECT_DELAY = 1000;

/** Interval for ping messages (in ms) */
const PING_INTERVAL = 30000;

/** Generate a simple unique ID for messages */
const generateMessageId = () => `msg_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * React hook for managing WebSocket connection to a live study session.
 *
 * @param sessionId - The session ID to connect to
 * @param options - Configuration options for callbacks and behavior
 * @returns Object with connection state, messages, and control functions
 */
export function useSessionWebSocket(
  sessionId: string | undefined,
  options: UseSessionWebSocketOptions = {}
): UseSessionWebSocketReturn {
  const {
    onSessionStarted,
    onEvaluationResult,
    onPointTransition,
    onSessionComplete,
    onCompleteOverlay,
    onSessionPaused,
    onRabbitholeDetected,
    onRabbitholeEntered,
    onRabbitholeExited,
    onError,
    autoConnect = true,
  } = options;

  // Connection state
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [lastError, setLastError] = useState<{ code: string; message: string } | null>(null);

  // Message state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingContent, setStreamingContent] = useState('');
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);

  // Session progress state — tracks recalled count instead of linear index
  const [recalledCount, setRecalledCount] = useState(0);
  const [totalPoints, setTotalPoints] = useState(0);

  // T12: Single-exchange UI state.
  // latestAssistantMessage holds only the most recent completed AI text; the
  // full history is still in `messages` for the evaluator.
  const [latestAssistantMessage, setLatestAssistantMessage] = useState('');
  // lastSentUserMessage is briefly set when the user sends a message so
  // SingleExchangeView can display the user_sent flash phase.
  const [lastSentUserMessage, setLastSentUserMessage] = useState<string | null>(null);
  // isOpeningMessage is true while the first AI message is shown so the view
  // can skip the fade-in animation on initial render.
  const [isOpeningMessage, setIsOpeningMessage] = useState(true);
  // Ref to hold the active clear-timeout so it can be cancelled on rapid sends.
  const lastSentClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // FIX 8: Ref to track the current rabbitholePrompt inside sendUserMessage without
  // requiring it as a useCallback dependency (avoids recreating the function on every prompt change).
  const rabbitholePromptRef = useRef<RabbitholePromptData | null>(null);

  // T09: Rabbit hole UX mode state.
  const [isInRabbithole, setIsInRabbithole] = useState(false);
  const [rabbitholeTopic, setRabbitholeTopic] = useState<string | null>(null);
  // rabbitholePrompt holds the detected event data shown in RabbitholePrompt.
  // Cleared when the user accepts or declines.
  const [rabbitholePrompt, setRabbitholePrompt] = useState<RabbitholePromptData | null>(null);
  // FIX 8: Keep rabbitholePromptRef in sync so sendUserMessage can read the latest value
  // without needing rabbitholePrompt as a useCallback dependency.
  rabbitholePromptRef.current = rabbitholePrompt;

  // T11: Labels of rabbit holes that have been explored (entered and exited).
  // Populated from the `label` field of `rabbithole_exited` events.
  const [rabbitholeLabels, setRabbitholeLabels] = useState<string[]>([]);

  // FIX 3 (YAGNI): Removed pendingRecallAnimations state — it was exported but never consumed.
  // pendingRef is kept because it drives the buffering logic in handleMessage.

  // Ref to track pending count without stale closure when reading inside handleMessage.
  // Using a ref avoids needing the pending count in the useCallback dep array.
  const pendingRef = useRef(0);

  // Ref to track isInRabbithole inside handleMessage without stale closure.
  // Using a ref avoids needing isInRabbithole in the useCallback dep array.
  const isInRabbitholeRef = useRef(false);
  // Keep isInRabbitholeRef in sync with the state value on every render.
  isInRabbitholeRef.current = isInRabbithole;

  // Refs for WebSocket instance and reconnection tracking
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const intentionalCloseRef = useRef(false);

  // Store callbacks in refs to avoid dependency issues
  const callbacksRef = useRef({
    onSessionStarted,
    onEvaluationResult,
    onPointTransition,
    onSessionComplete,
    onCompleteOverlay,
    onSessionPaused,
    onRabbitholeDetected,
    onRabbitholeEntered,
    onRabbitholeExited,
    onError,
  });

  // Update callback refs when they change
  useEffect(() => {
    callbacksRef.current = {
      onSessionStarted,
      onEvaluationResult,
      onPointTransition,
      onSessionComplete,
      onCompleteOverlay,
      onSessionPaused,
      onRabbitholeDetected,
      onRabbitholeEntered,
      onRabbitholeExited,
      onError,
    };
  }, [onSessionStarted, onEvaluationResult, onPointTransition, onSessionComplete, onCompleteOverlay, onSessionPaused, onRabbitholeDetected, onRabbitholeEntered, onRabbitholeExited, onError]);

  /**
   * Clear any pending reconnection timeout.
   */
  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  /**
   * Clear ping interval timer.
   */
  const clearPingInterval = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
  }, []);

  /**
   * Start ping interval to keep connection alive.
   */
  const startPingInterval = useCallback(() => {
    clearPingInterval();
    pingIntervalRef.current = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }));
      }
    }, PING_INTERVAL);
  }, [clearPingInterval]);

  /**
   * Send a message through the WebSocket connection.
   */
  const sendMessage = useCallback((message: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  /**
   * Handle incoming WebSocket messages.
   */
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const message = JSON.parse(event.data) as ServerMessage;

      switch (message.type) {
        case 'session_started':
          // Add the opening message as an assistant message (full history)
          setMessages([
            {
              id: generateMessageId(),
              role: 'assistant',
              content: message.openingMessage,
              timestamp: new Date(),
            },
          ]);
          setIsWaitingForResponse(false);
          // T13: Initialize progress from session_started payload (supports resumed sessions)
          setTotalPoints(message.totalPoints);
          setRecalledCount(message.recalledCount);
          // T12: Track the latest AI text and mark this as the opening message
          // so SingleExchangeView skips the fade-in animation.
          setLatestAssistantMessage(message.openingMessage);
          setIsOpeningMessage(true);
          callbacksRef.current.onSessionStarted?.(message.sessionId, message.openingMessage);
          break;

        case 'assistant_chunk':
          // Append chunk to streaming content
          setStreamingContent((prev) => prev + message.content);
          break;

        case 'assistant_complete':
          // Finalize the assistant message (full history)
          setMessages((prev) => [
            ...prev,
            {
              id: generateMessageId(),
              role: 'assistant',
              content: message.fullContent,
              timestamp: new Date(),
            },
          ]);
          setStreamingContent('');
          setIsWaitingForResponse(false);
          // T12: Update the single-exchange display text and clear opening flag
          // so subsequent messages use the fade-in animation.
          setLatestAssistantMessage(message.fullContent);
          setIsOpeningMessage(false);
          break;

        case 'point_recalled':
          // T11: Update totalPoints always. For recalledCount, buffer the animation
          // increment while inside a rabbit hole so the circles animate in sequence
          // after the rabbit hole exits. Use isInRabbitholeRef (not state) to avoid
          // stale closure inside this useCallback.
          setTotalPoints(message.totalPoints);
          if (isInRabbitholeRef.current) {
            // Buffer the recall — don't update recalledCount visually yet.
            pendingRef.current += 1;
          } else {
            setRecalledCount(message.recalledCount);
          }
          break;

        case 'session_complete':
          callbacksRef.current.onSessionComplete?.(message.summary);
          break;

        // T08: All recall points have been marked as recalled — show the completion overlay.
        // The session is NOT finalized yet; the user can choose to continue or leave.
        // FIX 7: Forward message and canContinue so the overlay can display server-provided text.
        case 'session_complete_overlay':
          callbacksRef.current.onCompleteOverlay?.({
            sessionId: message.sessionId,
            recalledCount: message.recalledCount,
            totalPoints: message.totalPoints,
            message: message.message,
            canContinue: message.canContinue,
          });
          break;

        // T08: Session has been paused (user clicked "Done" on the overlay or sent leave_session).
        // Navigate away — the session is persisted and can be resumed later.
        case 'session_paused':
          callbacksRef.current.onSessionPaused?.({
            sessionId: message.sessionId,
            recalledCount: message.recalledCount,
            totalPoints: message.totalPoints,
          });
          break;

        // T09: Server detected a rabbit hole — store the prompt data so the UI can show it.
        // The user must explicitly accept or decline; never auto-enter.
        case 'rabbithole_detected':
          setRabbitholePrompt({
            topic: message.topic,
            rabbitholeEventId: message.rabbitholeEventId,
          });
          callbacksRef.current.onRabbitholeDetected?.({
            topic: message.topic,
            rabbitholeEventId: message.rabbitholeEventId,
          });
          break;

        // T09: User entered a rabbit hole — update mode state and clear the prompt.
        // T11: Also reset the pending recall buffer so we start fresh for this rabbit hole.
        case 'rabbithole_entered':
          setIsInRabbithole(true);
          setRabbitholeTopic(message.topic);
          setRabbitholePrompt(null);
          // Reset pending buffer for this new rabbit hole entry
          pendingRef.current = 0;
          callbacksRef.current.onRabbitholeEntered?.(message.topic);
          break;

        // T09: User exited a rabbit hole — restore normal session mode.
        // T11: Flush buffered recall animations and add the rabbit hole label.
        case 'rabbithole_exited':
          setIsInRabbithole(false);
          setRabbitholeTopic(null);
          // Flush buffered recalls: increment recalledCount by all points recalled
          // during the rabbit hole. The SessionProgress animation effect handles
          // playing N sequential circle-fill animations 150ms apart.
          if (pendingRef.current > 0) {
            setRecalledCount(prev => prev + pendingRef.current);
            pendingRef.current = 0;
          }
          // Add the explored rabbit hole's label as a pill in SessionProgress.
          if (message.label) {
            setRabbitholeLabels(prev => [...prev, message.label]);
          }
          callbacksRef.current.onRabbitholeExited?.(
            message.label,
            message.pointsRecalledDuring,
            message.completionPending
          );
          break;

        case 'error':
          setLastError({ code: message.code, message: message.message });
          callbacksRef.current.onError?.(message.code, message.message);
          break;

        case 'pong':
          // Heartbeat response received, connection is healthy
          break;
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  }, []);

  /**
   * Attempt to reconnect with exponential backoff.
   */
  const attemptReconnect = useCallback(() => {
    if (reconnectAttemptRef.current >= MAX_RECONNECT_ATTEMPTS) {
      setConnectionState('disconnected');
      setLastError({
        code: 'MAX_RECONNECT_ATTEMPTS',
        message: `Failed to reconnect after ${MAX_RECONNECT_ATTEMPTS} attempts`,
      });
      return;
    }

    setConnectionState('reconnecting');
    const delay = BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttemptRef.current);
    reconnectAttemptRef.current += 1;

    reconnectTimeoutRef.current = setTimeout(() => {
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      connect();
    }, delay);
  }, []);

  /**
   * Connect to the WebSocket server.
   */
  const connect = useCallback(() => {
    if (!sessionId) {
      return;
    }

    // Clean up any existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    clearReconnectTimeout();
    clearPingInterval();
    intentionalCloseRef.current = false;

    setConnectionState('connecting');
    setLastError(null);

    // Construct WebSocket URL
    // If VITE_API_BASE_URL is set, use it; otherwise use current host (works with Vite proxy)
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;

    let finalUrl: string;
    if (apiBaseUrl) {
      // Explicit API URL provided - convert http(s) to ws(s)
      const wsBaseUrl = apiBaseUrl.replace(/^http/, 'ws');
      finalUrl = `${wsBaseUrl}/api/session/ws?sessionId=${encodeURIComponent(sessionId)}`;
    } else {
      // No explicit URL - use current host (Vite proxy will forward to backend)
      finalUrl = `${protocol}//${window.location.host}/api/session/ws?sessionId=${encodeURIComponent(sessionId)}`;
    }

    try {
      const ws = new WebSocket(finalUrl);

      ws.onopen = () => {
        setConnectionState('connected');
        reconnectAttemptRef.current = 0;
        startPingInterval();
      };

      ws.onmessage = handleMessage;

      ws.onclose = (event) => {
        clearPingInterval();
        wsRef.current = null;

        if (intentionalCloseRef.current) {
          setConnectionState('disconnected');
        } else if (event.code !== 1000) {
          // Abnormal closure, attempt reconnect
          attemptReconnect();
        } else {
          setConnectionState('disconnected');
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        // The onclose handler will be called after this
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      setConnectionState('disconnected');
      setLastError({
        code: 'CONNECTION_FAILED',
        message: 'Failed to establish WebSocket connection',
      });
    }
  }, [sessionId, clearReconnectTimeout, clearPingInterval, startPingInterval, handleMessage, attemptReconnect]);

  /**
   * Disconnect from the WebSocket server.
   * Handles cleanup gracefully to avoid errors when connection is still establishing.
   */
  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true;
    clearReconnectTimeout();
    clearPingInterval();

    if (wsRef.current) {
      // Only attempt to close if the connection is open or connecting
      // Avoids "WebSocket is closed before connection is established" errors
      const ws = wsRef.current;
      wsRef.current = null;

      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1000, 'Client disconnect');
      } else if (ws.readyState === WebSocket.CONNECTING) {
        // For connections still establishing, just nullify the handlers
        // to prevent callbacks from firing, then close
        ws.onopen = null;
        ws.onmessage = null;
        ws.onclose = null;
        ws.onerror = null;
        // Close will trigger CLOSE_GOING_AWAY if still connecting
        try {
          ws.close();
        } catch {
          // Ignore errors when closing a connecting WebSocket
        }
      }
      // If CLOSING or CLOSED, no action needed
    }

    setConnectionState('disconnected');
  }, [clearReconnectTimeout, clearPingInterval]);

  /**
   * Send a user message to the session.
   *
   * T12: Also sets lastSentUserMessage briefly (500ms) so SingleExchangeView
   * can display the user_sent flash phase. Cancels any pending clear timeout
   * on rapid successive sends.
   *
   * FIX 8: If a rabbit hole prompt is currently visible (rabbitholePromptRef.current
   * is non-null), implicitly dismiss it and send a decline_rabbithole message to the
   * server before sending the user's message. This prevents the prompt from lingering
   * after the user has already moved on.
   */
  const sendUserMessage = useCallback(
    (content: string) => {
      if (!content.trim()) return;

      // FIX 8: Auto-dismiss any pending rabbit hole prompt when the user sends a message.
      // This signals to the server that the user is not interested in the tangent.
      if (rabbitholePromptRef.current !== null) {
        setRabbitholePrompt(null);
        sendMessage({ type: 'decline_rabbithole' });
      }

      // Add user message to the full history list
      setMessages((prev) => [
        ...prev,
        {
          id: generateMessageId(),
          role: 'user',
          content: content.trim(),
          timestamp: new Date(),
        },
      ]);

      // Send to server
      sendMessage({ type: 'user_message', content: content.trim() });
      setIsWaitingForResponse(true);

      // T12: Set the flash message and auto-clear after 500ms.
      // Cancel any previous pending clear so rapid sends don't clear too early.
      if (lastSentClearTimeoutRef.current) {
        clearTimeout(lastSentClearTimeoutRef.current);
      }
      setLastSentUserMessage(content.trim());
      lastSentClearTimeoutRef.current = setTimeout(() => {
        setLastSentUserMessage(null);
        lastSentClearTimeoutRef.current = null;
      }, 500);
    },
    [sendMessage]
  );

  /**
   * T08: Pause the session non-destructively (replaces endSession).
   * Sends 'leave_session' to the server, which persists progress and sets
   * the session status to 'paused'. The session can be resumed later.
   */
  const leaveSession = useCallback(() => {
    sendMessage({ type: 'leave_session' });
  }, [sendMessage]);

  /**
   * T09: Enter a rabbit hole after the user opts in.
   * Sends 'enter_rabbithole' to the server with the event ID and topic.
   * Also clears the pending prompt immediately for responsive UI.
   */
  const enterRabbithole = useCallback(
    (rabbitholeEventId: string, topic: string) => {
      setRabbitholePrompt(null); // Clear prompt optimistically
      sendMessage({ type: 'enter_rabbithole', rabbitholeEventId, topic });
    },
    [sendMessage]
  );

  /**
   * T09: Exit the current rabbit hole and return to the main session.
   * Sends 'exit_rabbithole' to the server.
   */
  const exitRabbithole = useCallback(() => {
    sendMessage({ type: 'exit_rabbithole' });
  }, [sendMessage]);

  /**
   * T09: Decline the current rabbit hole prompt.
   * Sends 'decline_rabbithole' to the server (sets 3-message cooldown)
   * and clears the pending prompt from local state.
   */
  const declineRabbithole = useCallback(() => {
    setRabbitholePrompt(null); // Clear prompt immediately
    sendMessage({ type: 'decline_rabbithole' });
  }, [sendMessage]);

  /**
   * T13: Dismiss the completion overlay and continue discussion.
   * Sends 'dismiss_overlay' to the server (pure UI state change — no engine action).
   */
  const dismissOverlay = useCallback(() => {
    sendMessage({ type: 'dismiss_overlay' });
  }, [sendMessage]);

  // Auto-connect on mount if enabled and sessionId is provided
  useEffect(() => {
    if (autoConnect && sessionId) {
      connect();
    }

    // Cleanup on unmount — also clear the lastSent timeout to avoid state
    // updates after the component has been destroyed.
    return () => {
      disconnect();
      if (lastSentClearTimeoutRef.current) {
        clearTimeout(lastSentClearTimeoutRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, autoConnect, connect, disconnect]);

  return {
    connectionState,
    lastError,
    messages,
    streamingContent,
    recalledCount,
    totalPoints,
    isWaitingForResponse,
    sendUserMessage,
    leaveSession,
    connect,
    disconnect,
    // T12 single-exchange UI fields
    latestAssistantMessage,
    lastSentUserMessage,
    isOpeningMessage,
    // T09 rabbit hole mode fields
    isInRabbithole,
    rabbitholeTopic,
    rabbitholePrompt,
    enterRabbithole,
    exitRabbithole,
    declineRabbithole,
    // T13: Dismiss completion overlay
    dismissOverlay,
    // T11 visual progress fields
    rabbitholeLabels,
  };
}

export default useSessionWebSocket;
