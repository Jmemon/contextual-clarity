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
 *     triggerEvaluation,
 *     endSession,
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
 */
export type ClientMessage =
  | { type: 'user_message'; content: string }
  | { type: 'trigger_eval' }
  | { type: 'end_session' }
  | { type: 'ping' };

/**
 * Messages received from server via WebSocket.
 */
export type ServerMessage =
  | { type: 'session_started'; sessionId: string; openingMessage: string }
  | { type: 'assistant_chunk'; content: string }
  | { type: 'assistant_complete'; fullContent: string }
  | { type: 'evaluation_result'; recallPointId: string; outcome: string; feedback: string }
  | { type: 'point_transition'; nextPointIndex: number; totalPoints: number }
  | { type: 'session_complete'; summary: SessionCompleteSummary }
  | { type: 'error'; code: string; message: string }
  | { type: 'pong' };

/**
 * Summary data received when session completes.
 */
export interface SessionCompleteSummary {
  /** Total duration of the session in milliseconds */
  durationMs: number;
  /** Recall success rate (0.0 to 1.0) */
  recallRate: number;
  /** Number of recall points attempted */
  pointsAttempted: number;
  /** Number of successful recalls */
  pointsSuccessful: number;
  /** Overall engagement score */
  engagementScore: number;
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
 * Configuration options for the WebSocket hook.
 */
export interface UseSessionWebSocketOptions {
  /** Callback when session is started */
  onSessionStarted?: (sessionId: string, openingMessage: string) => void;
  /** Callback when evaluation result is received */
  onEvaluationResult?: (result: EvaluationResult) => void;
  /** Callback when transitioning to next recall point */
  onPointTransition?: (nextIndex: number, total: number) => void;
  /** Callback when session completes */
  onSessionComplete?: (summary: SessionCompleteSummary) => void;
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
  /** All chat messages (user and assistant) */
  messages: ChatMessage[];
  /** Content of message currently being streamed (empty if none) */
  streamingContent: string;
  /** Current point index (1-based) */
  currentPointIndex: number;
  /** Total number of points in the session */
  totalPoints: number;
  /** Whether waiting for assistant response */
  isWaitingForResponse: boolean;
  /** Send a user message */
  sendUserMessage: (content: string) => void;
  /** Trigger evaluation ("I've got it" button) */
  triggerEvaluation: () => void;
  /** End the session early */
  endSession: () => void;
  /** Manually connect to WebSocket */
  connect: () => void;
  /** Manually disconnect from WebSocket */
  disconnect: () => void;
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

  // Session progress state
  const [currentPointIndex, setCurrentPointIndex] = useState(0);
  const [totalPoints, setTotalPoints] = useState(0);

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
    onError,
  });

  // Update callback refs when they change
  useEffect(() => {
    callbacksRef.current = {
      onSessionStarted,
      onEvaluationResult,
      onPointTransition,
      onSessionComplete,
      onError,
    };
  }, [onSessionStarted, onEvaluationResult, onPointTransition, onSessionComplete, onError]);

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
          // Add the opening message as an assistant message
          setMessages([
            {
              id: generateMessageId(),
              role: 'assistant',
              content: message.openingMessage,
              timestamp: new Date(),
            },
          ]);
          setIsWaitingForResponse(false);
          callbacksRef.current.onSessionStarted?.(message.sessionId, message.openingMessage);
          break;

        case 'assistant_chunk':
          // Append chunk to streaming content
          setStreamingContent((prev) => prev + message.content);
          break;

        case 'assistant_complete':
          // Finalize the assistant message
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
          break;

        case 'evaluation_result':
          callbacksRef.current.onEvaluationResult?.({
            recallPointId: message.recallPointId,
            outcome: message.outcome,
            feedback: message.feedback,
          });
          break;

        case 'point_transition':
          setCurrentPointIndex(message.nextPointIndex);
          setTotalPoints(message.totalPoints);
          callbacksRef.current.onPointTransition?.(message.nextPointIndex, message.totalPoints);
          break;

        case 'session_complete':
          callbacksRef.current.onSessionComplete?.(message.summary);
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

    // Construct WebSocket URL from current location
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Use the API base URL if available, otherwise use localhost
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
    const wsBaseUrl = apiBaseUrl.replace(/^http/, 'ws');
    const wsUrl = `${wsBaseUrl}/api/session/ws?sessionId=${encodeURIComponent(sessionId)}`;

    // Handle development mode where we might connect directly
    const finalUrl = wsUrl.startsWith('ws') ? wsUrl : `${protocol}//${window.location.host}/api/session/ws?sessionId=${encodeURIComponent(sessionId)}`;

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
   */
  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true;
    clearReconnectTimeout();
    clearPingInterval();

    if (wsRef.current) {
      wsRef.current.close(1000, 'Client disconnect');
      wsRef.current = null;
    }

    setConnectionState('disconnected');
  }, [clearReconnectTimeout, clearPingInterval]);

  /**
   * Send a user message to the session.
   */
  const sendUserMessage = useCallback(
    (content: string) => {
      if (!content.trim()) return;

      // Add user message to the list
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
    },
    [sendMessage]
  );

  /**
   * Trigger evaluation ("I've got it" button).
   */
  const triggerEvaluation = useCallback(() => {
    sendMessage({ type: 'trigger_eval' });
    setIsWaitingForResponse(true);
  }, [sendMessage]);

  /**
   * End the session early.
   */
  const endSession = useCallback(() => {
    sendMessage({ type: 'end_session' });
  }, [sendMessage]);

  // Auto-connect on mount if enabled and sessionId is provided
  useEffect(() => {
    if (autoConnect && sessionId) {
      connect();
    }

    // Cleanup on unmount
    return () => {
      disconnect();
    };
  }, [sessionId, autoConnect, connect, disconnect]);

  return {
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
    disconnect,
  };
}

export default useSessionWebSocket;
