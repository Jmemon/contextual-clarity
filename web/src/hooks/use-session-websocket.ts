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
  | { type: 'user_message'; content: string; branchId?: string }
  | { type: 'leave_session' }  // T08: replaces 'end_session' — pauses session instead of abandoning
  | { type: 'ping' }
  | { type: 'activate_branch'; branchId: string }
  | { type: 'close_branch'; branchId: string }
  | { type: 'dismiss_overlay' };  // T13: dismiss completion overlay, continue discussion

/**
 * Messages received from server via WebSocket.
 * T13: Removed 'evaluation_result' and 'point_transition' (deprecated).
 * T13: Updated 'session_started' to use recalledCount instead of currentPointIndex.
 */
export type ServerMessage =
  | { type: 'session_started'; sessionId: string; openingMessage: string; totalPoints: number; recalledCount: number }
  | { type: 'assistant_chunk'; content: string; branchId?: string }
  | { type: 'assistant_complete'; fullContent: string; branchId?: string }
  | { type: 'point_recalled'; pointId: string; label: string; recalledCount: number; totalPoints: number }
  | { type: 'session_complete'; summary: SessionCompleteSummary }
  | { type: 'session_complete_overlay'; sessionId: string; recalledCount: number; totalPoints: number; message: string; canContinue: boolean }
  | { type: 'session_paused'; sessionId: string; recalledCount: number; totalPoints: number }
  | { type: 'branch_detected'; branchId: string; topic: string; parentBranchId?: string; depth: number }
  | { type: 'branch_activated'; branchId: string }
  | { type: 'branch_closed'; branchId: string; summary: string }
  | { type: 'branch_summary_injected'; branchId: string }
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
  /** Short topic labels for each recalled point */
  recalledPointLabels: string[];
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
 * T13: message and canContinue are required — the server always sends both.
 */
export interface CompleteOverlayData {
  /** Session ID */
  sessionId: string;
  /** Number of points recalled */
  recalledCount: number;
  /** Total points in session */
  totalPoints: number;
  /** Completion message from the server to show in the overlay */
  message: string;
  /** Whether the user can continue discussing after the overlay */
  canContinue: boolean;
}

/** Per-branch UI state tracked by the WS hook */
export interface BranchState {
  branchId: string;
  topic: string;
  parentBranchId: string | null;
  depth: number;
  status: 'detected' | 'active' | 'closed';
  latestAssistantMessage: string;
  streamingContent: string;
  lastSentUserMessage: string | null;
  isWaitingForResponse: boolean;
  hasUnread: boolean;
  summary: string | null;
}

/**
 * Configuration options for the WebSocket hook.
 */
export interface UseSessionWebSocketOptions {
  /** Callback when session is started */
  onSessionStarted?: (sessionId: string, openingMessage: string) => void;
  /** Callback when evaluation result is received */
  onEvaluationResult?: (result: EvaluationResult) => void;
  /** Callback when session completes (finalized as 'completed') */
  onSessionComplete?: (summary: SessionCompleteSummary) => void;
  /** T08: Callback when all points recalled — triggers completion overlay in UI */
  onCompleteOverlay?: (data: CompleteOverlayData) => void;
  /** T08: Callback when session is paused after leave_session */
  onSessionPaused?: () => void;
  /** Callback when a new branch (tangent) is detected by the server */
  onBranchDetected?: (branchId: string, topic: string) => void;
  /** Callback when a branch is closed and its summary is available */
  onBranchClosed?: (branchId: string, summary: string) => void;
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
   * The user message that was just sent. Set on send; cleared when AI streaming
   * begins (first assistant_chunk). SingleExchangeView uses this for the
   * awaiting_response phase.
   */
  lastSentUserMessage: string | null;
  /**
   * True while the very first (opening) AI message is being shown.
   * Lets SingleExchangeView skip the fade-in animation for the first message.
   */
  isOpeningMessage: boolean;

  // ---- Branch (tangent) state fields ----
  /** ID of the currently focused branch, or null if viewing the trunk */
  activeBranchId: string | null;
  /** Map of all live branches keyed by branchId */
  branches: Map<string, BranchState>;
  /** Summaries of branches that have been closed (for display in recap / progress) */
  branchSummaries: Array<{ branchId: string; summary: string; topic: string }>;
  /** Switch the active view to a specific branch (activates it on server if first time) */
  activateBranch: (branchId: string) => void;
  /** Request the server to close a branch */
  closeBranch: (branchId: string) => void;
  /** Switch back to the main trunk view */
  switchToTrunk: () => void;

  /** T13: Dismiss the completion overlay and continue the discussion */
  dismissOverlay: () => void;

  // ---- T2: Recalled point labels ----
  /**
   * Short topic labels extracted from recalled points' content.
   * Populated from the `label` field of `point_recalled` events.
   * Enables the frontend to display topic keywords for each recalled item.
   */
  recalledLabels: string[];
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
    onSessionComplete,
    onCompleteOverlay,
    onSessionPaused,
    onBranchDetected,
    onBranchClosed,
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
  // lastSentUserMessage is set when the user sends a message so
  // SingleExchangeView can display the awaiting_response phase.
  const [lastSentUserMessage, setLastSentUserMessage] = useState<string | null>(null);
  // isOpeningMessage is true while the first AI message is shown so the view
  // can skip the fade-in animation on initial render.
  const [isOpeningMessage, setIsOpeningMessage] = useState(true);
  // T2: Labels of recalled points, extracted from point_recalled events.
  // Used by the frontend to display topic keywords for recalled items.
  const [recalledLabels, setRecalledLabels] = useState<string[]>([]);

  // Branch state — tracks all live branches and which one the user is viewing.
  // activeBranchId is null when viewing the trunk (main conversation).
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null);
  const [branches, setBranches] = useState<Map<string, BranchState>>(new Map());
  const [branchSummaries, setBranchSummaries] = useState<Array<{ branchId: string; summary: string; topic: string }>>([]);

  // Refs for accessing current branch state in callbacks without stale closures.
  const activeBranchIdRef = useRef<string | null>(null);
  const branchesRef = useRef<Map<string, BranchState>>(new Map());

  // Keep refs in sync with state values.
  useEffect(() => { activeBranchIdRef.current = activeBranchId; }, [activeBranchId]);
  useEffect(() => { branchesRef.current = branches; }, [branches]);

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
    onSessionComplete,
    onCompleteOverlay,
    onSessionPaused,
    onBranchDetected,
    onBranchClosed,
    onError,
  });

  // Update callback refs when they change
  useEffect(() => {
    callbacksRef.current = {
      onSessionStarted,
      onEvaluationResult,
      onSessionComplete,
      onCompleteOverlay,
      onSessionPaused,
      onBranchDetected,
      onBranchClosed,
      onError,
    };
  }, [onSessionStarted, onEvaluationResult, onSessionComplete, onCompleteOverlay, onSessionPaused, onBranchDetected, onBranchClosed, onError]);

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

        case 'assistant_chunk': {
          const chunkBranchId = message.branchId ?? null;
          if (chunkBranchId) {
            // Route streaming content to the target branch
            setBranches(prev => {
              const next = new Map(prev);
              const branch = next.get(chunkBranchId);
              if (branch) {
                next.set(chunkBranchId, {
                  ...branch,
                  streamingContent: branch.streamingContent + message.content,
                  hasUnread: chunkBranchId !== activeBranchIdRef.current,
                });
              }
              return next;
            });
          } else {
            // Trunk: existing logic — clear user message and append to streaming content
            setLastSentUserMessage(null);
            setStreamingContent((prev) => prev + message.content);
          }
          break;
        }

        case 'assistant_complete': {
          const completeBranchId = message.branchId ?? null;
          if (completeBranchId) {
            // Finalize the branch's assistant message
            setBranches(prev => {
              const next = new Map(prev);
              const branch = next.get(completeBranchId);
              if (branch) {
                next.set(completeBranchId, {
                  ...branch,
                  latestAssistantMessage: branch.streamingContent || message.fullContent,
                  streamingContent: '',
                  isWaitingForResponse: false,
                });
              }
              return next;
            });
          } else {
            // Trunk: existing logic — finalize assistant message in full history
            setMessages((prev) => [
              ...prev,
              {
                id: generateMessageId(),
                role: 'assistant',
                content: message.fullContent,
                timestamp: new Date(),
              },
            ]);
            setLastSentUserMessage(null);
            setStreamingContent('');
            setIsWaitingForResponse(false);
            setLatestAssistantMessage(message.fullContent);
            setIsOpeningMessage(false);
          }
          break;
        }

        case 'point_recalled':
          // Update progress counts and labels immediately. With branches replacing
          // rabbit holes, there is no need to buffer recall animations.
          setTotalPoints(message.totalPoints);
          setRecalledCount(message.recalledCount);
          setRecalledLabels(prev => [...prev, message.label]);
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
          callbacksRef.current.onSessionPaused?.();
          break;

        // Server detected a tangent — create a new branch in 'detected' status.
        // The user can choose to activate (explore) it or ignore it.
        case 'branch_detected': {
          const { branchId, topic, parentBranchId, depth } = message;
          setBranches(prev => {
            const next = new Map(prev);
            next.set(branchId, {
              branchId, topic, parentBranchId: parentBranchId ?? null, depth,
              status: 'detected',
              latestAssistantMessage: '', streamingContent: '',
              lastSentUserMessage: null, isWaitingForResponse: false,
              hasUnread: true, summary: null,
            });
            return next;
          });
          callbacksRef.current.onBranchDetected?.(branchId, topic);
          break;
        }

        // Server confirmed a branch is now active (agent running).
        case 'branch_activated': {
          setBranches(prev => {
            const next = new Map(prev);
            const branch = next.get(message.branchId);
            if (branch) next.set(message.branchId, { ...branch, status: 'active' });
            return next;
          });
          break;
        }

        // Server closed a branch — remove from live branches, archive to summaries.
        case 'branch_closed': {
          const { branchId, summary } = message;
          const branch = branchesRef.current.get(branchId);
          setBranches(prev => {
            const next = new Map(prev);
            next.delete(branchId);
            return next;
          });
          setBranchSummaries(prev => [...prev, { branchId, summary, topic: branch?.topic ?? 'Unknown' }]);
          if (activeBranchIdRef.current === branchId) setActiveBranchId(null);
          callbacksRef.current.onBranchClosed?.(branchId, summary);
          break;
        }

        // Branch summary was injected into the trunk context on the server side.
        // No client action needed — the summary is already tracked in branchSummaries.
        case 'branch_summary_injected':
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
   * If the user is currently viewing a branch (activeBranchId is set), the message
   * is tagged with branchId so the server routes it to the branch agent. Otherwise
   * the message is sent to the trunk.
   *
   * Also sets lastSentUserMessage so SingleExchangeView can display the user's
   * message until AI streaming begins (cleared on first assistant_chunk).
   */
  const sendUserMessage = useCallback(
    (content: string) => {
      if (!content.trim()) return;
      const trimmed = content.trim();

      // Add user message to the full history list (trunk history)
      setMessages((prev) => [
        ...prev,
        {
          id: generateMessageId(),
          role: 'user',
          content: trimmed,
          timestamp: new Date(),
        },
      ]);

      const branchId = activeBranchIdRef.current;
      if (branchId) {
        // Route to the active branch — set branch-level waiting state
        setBranches(prev => {
          const next = new Map(prev);
          const branch = next.get(branchId);
          if (branch) next.set(branchId, { ...branch, lastSentUserMessage: trimmed, isWaitingForResponse: true });
          return next;
        });
        sendMessage({ type: 'user_message', content: trimmed, branchId });
      } else {
        // Trunk: existing logic
        sendMessage({ type: 'user_message', content: trimmed });
        setIsWaitingForResponse(true);
        setLastSentUserMessage(trimmed);
      }
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
   * Switch the active view to a branch. If the branch is still in 'detected' status,
   * this sends an activate_branch message to the server to spin up the branch agent.
   * If the branch is already active, this just switches the UI view.
   */
  const activateBranch = useCallback((branchId: string) => {
    setActiveBranchId(branchId);
    const branch = branchesRef.current.get(branchId);
    if (branch?.status === 'detected') {
      // First activation — tell server to create the branch agent
      setBranches(prev => {
        const next = new Map(prev);
        const b = next.get(branchId);
        if (b) next.set(branchId, { ...b, isWaitingForResponse: true, hasUnread: false });
        return next;
      });
      wsRef.current?.send(JSON.stringify({ type: 'activate_branch', branchId }));
    } else {
      // Already active — just switch view and clear unread badge
      setBranches(prev => {
        const next = new Map(prev);
        const b = next.get(branchId);
        if (b) next.set(branchId, { ...b, hasUnread: false });
        return next;
      });
    }
  }, []);

  /**
   * Request the server to close a specific branch. The server will send back
   * a branch_closed event which triggers cleanup in the handler above.
   */
  const closeBranch = useCallback((branchId: string) => {
    wsRef.current?.send(JSON.stringify({ type: 'close_branch', branchId }));
  }, []);

  /**
   * Switch the active view back to the main trunk (no branch selected).
   */
  const switchToTrunk = useCallback(() => {
    setActiveBranchId(null);
  }, []);

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

    // Cleanup on unmount
    return () => {
      disconnect();
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
    // Branch (tangent) state
    activeBranchId,
    branches,
    branchSummaries,
    activateBranch,
    closeBranch,
    switchToTrunk,
    // T13: Dismiss completion overlay
    dismissOverlay,
    // T2 recalled point labels
    recalledLabels,
  };
}

export default useSessionWebSocket;
