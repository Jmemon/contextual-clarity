/**
 * WebSocket Session Handler
 *
 * Handles WebSocket connections for real-time recall sessions with streaming
 * LLM responses. This handler manages the full lifecycle of a WebSocket session:
 *
 * 1. **Connection Setup**: Validates session ID, loads session from database
 * 2. **Message Handling**: Processes client messages (user input, commands)
 * 3. **Response Streaming**: Streams LLM responses as they're generated
 * 4. **Session Events**: Sends evaluation results, point transitions, completion
 * 5. **Error Handling**: Graceful error recovery and reporting
 * 6. **Keepalive**: Ping/pong for connection health monitoring
 *
 * Integration Notes:
 * - This handler integrates with SessionEngine for recall session logic
 * - Full session integration requires T06 (Sessions API) to be complete
 * - For now, implements the WebSocket infrastructure and message handling
 *
 * Usage with Bun's native WebSocket support:
 * ```typescript
 * Bun.serve({
 *   fetch: app.fetch,
 *   websocket: createWebSocketHandler(dependencies),
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Client connection flow
 * const ws = new WebSocket('ws://localhost:3001/api/session/ws?sessionId=sess_123');
 *
 * ws.onopen = () => {
 *   console.log('Connected to session');
 * };
 *
 * ws.onmessage = (event) => {
 *   const message = JSON.parse(event.data);
 *   switch (message.type) {
 *     case 'session_started':
 *       displayMessage('Tutor', message.openingMessage);
 *       break;
 *     case 'assistant_chunk':
 *       appendToCurrentMessage(message.content);
 *       break;
 *     case 'assistant_complete':
 *       finalizeMessage(message.fullContent);
 *       break;
 *     // ... handle other message types
 *   }
 * };
 *
 * // Send user message
 * ws.send(JSON.stringify({ type: 'user_message', content: 'My response...' }));
 * ```
 */

import type { ServerWebSocket } from 'bun';
import type { Session, RecallSet } from '@/core/models';
import type { SessionRepository } from '@/storage/repositories/session.repository';
import type { RecallSetRepository } from '@/storage/repositories/recall-set.repository';
import type { RecallPointRepository } from '@/storage/repositories/recall-point.repository';
import type { SessionMessageRepository } from '@/storage/repositories/session-message.repository';
import type { FSRSScheduler } from '@/core/fsrs/scheduler';
import type { RecallEvaluator } from '@/core/scoring/recall-evaluator';
import type { AnthropicClient } from '@/llm/client';
import { SessionEngine } from '@/core/session/session-engine';
import {
  type ClientMessage,
  type ServerMessage,
  type SessionSummary,
  type WebSocketErrorCode,
  parseClientMessage,
  serializeServerMessage,
  createErrorPayload,
  WS_CLOSE_CODES,
} from './types';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for the WebSocket session handler.
 */
export interface WebSocketSessionConfig {
  /** Interval in milliseconds between server-side ping checks */
  pingIntervalMs: number;
  /** Timeout in milliseconds to wait for pong response */
  pongTimeoutMs: number;
  /** Maximum number of consecutive errors before closing connection */
  maxConsecutiveErrors: number;
  /** Idle timeout in milliseconds (no messages received) */
  idleTimeoutMs: number;
}

/**
 * Default configuration for WebSocket sessions.
 */
export const DEFAULT_WS_CONFIG: WebSocketSessionConfig = {
  pingIntervalMs: 30000,        // 30 seconds between pings
  pongTimeoutMs: 10000,         // 10 seconds to respond to ping
  maxConsecutiveErrors: 5,      // Close after 5 consecutive errors
  idleTimeoutMs: 5 * 60 * 1000, // 5 minutes idle timeout
};

// ============================================================================
// WebSocket Data (attached to each connection)
// ============================================================================

/**
 * Data attached to each WebSocket connection.
 * This is stored in the WebSocket's data field and provides
 * session-specific context for message handling.
 */
export interface WebSocketSessionData {
  /** The session ID this connection is handling */
  sessionId: string;
  /** The loaded Session entity */
  session: Session | null;
  /** The RecallSet being studied */
  recallSet: RecallSet | null;
  /** The SessionEngine instance for this connection (manages LLM interactions) */
  engine: SessionEngine | null;
  /** Whether the session has been initialized (opening message sent) */
  initialized: boolean;
  /** Timestamp of the last message received */
  lastMessageTime: number;
  /** Count of consecutive errors */
  consecutiveErrors: number;
  /** Whether the connection is currently streaming a response */
  isStreaming: boolean;
  /** Accumulated chunks for the current response */
  currentResponseChunks: string[];
  /** Current chunk index being sent */
  currentChunkIndex: number;
}

/**
 * Creates initial WebSocket session data for a new connection.
 *
 * @param sessionId - The session ID from the query parameter
 * @returns Initial WebSocketSessionData
 */
export function createInitialSessionData(
  sessionId: string
): WebSocketSessionData {
  return {
    sessionId,
    session: null,
    recallSet: null,
    engine: null,
    initialized: false,
    lastMessageTime: Date.now(),
    consecutiveErrors: 0,
    isStreaming: false,
    currentResponseChunks: [],
    currentChunkIndex: 0,
  };
}

// ============================================================================
// Dependencies Interface
// ============================================================================

/**
 * Dependencies required by the WebSocket session handler.
 * These are injected when creating the handler for testability.
 * Includes all dependencies needed to create SessionEngine instances.
 */
export interface WebSocketHandlerDependencies {
  /** Repository for loading session data */
  sessionRepo: SessionRepository;
  /** Repository for loading recall set data */
  recallSetRepo: RecallSetRepository;
  /** Repository for recall point data access */
  recallPointRepo: RecallPointRepository;
  /** Repository for session message data access */
  messageRepo: SessionMessageRepository;
  /** FSRS scheduler for spaced repetition calculations */
  scheduler: FSRSScheduler;
  /** LLM-powered evaluator for assessing recall */
  evaluator: RecallEvaluator;
  /** Anthropic client for generating tutor responses */
  llmClient: AnthropicClient;
}

// ============================================================================
// WebSocket Handler Class
// ============================================================================

/**
 * WebSocket session handler for real-time recall sessions.
 *
 * This class encapsulates all WebSocket message handling logic and provides
 * methods for Bun's WebSocket handlers (open, message, close, ping, pong).
 */
export class WebSocketSessionHandler {
  /** Handler dependencies (repositories, engines, etc.) */
  private deps: WebSocketHandlerDependencies;
  /** Configuration for WebSocket behavior */
  private config: WebSocketSessionConfig;

  /**
   * Creates a new WebSocket session handler.
   *
   * @param deps - Required dependencies (repositories, etc.)
   * @param config - Optional configuration overrides
   */
  constructor(
    deps: WebSocketHandlerDependencies,
    config?: Partial<WebSocketSessionConfig>
  ) {
    this.deps = deps;
    this.config = { ...DEFAULT_WS_CONFIG, ...config };
  }

  /**
   * Handles a new WebSocket connection.
   * Called when a client successfully connects to the WebSocket endpoint.
   *
   * This method:
   * 1. Loads the session from the database
   * 2. Validates the session is in-progress
   * 3. Loads the associated RecallSet
   * 4. Creates a SessionEngine instance for real LLM interactions
   * 5. Sends the session_started message with LLM-generated opening message
   *
   * @param ws - The WebSocket connection
   */
  async handleOpen(ws: ServerWebSocket<WebSocketSessionData>): Promise<void> {
    const data = ws.data;
    console.log(`[WS] Connection opened for session: ${data.sessionId}`);

    try {
      // Load the session from the database
      const session = await this.deps.sessionRepo.findById(data.sessionId);

      if (!session) {
        this.sendError(ws, 'SESSION_NOT_FOUND');
        ws.close(WS_CLOSE_CODES.INVALID_SESSION, 'Session not found');
        return;
      }

      // Verify the session is in-progress
      if (session.status !== 'in_progress') {
        this.sendError(ws, 'SESSION_NOT_ACTIVE', `Session status is '${session.status}'`);
        ws.close(WS_CLOSE_CODES.INVALID_SESSION, 'Session not active');
        return;
      }

      // Load the associated RecallSet
      const recallSet = await this.deps.recallSetRepo.findById(session.recallSetId);

      if (!recallSet) {
        this.sendError(ws, 'INTERNAL_ERROR', 'RecallSet not found for session');
        ws.close(WS_CLOSE_CODES.INVALID_SESSION, 'RecallSet not found');
        return;
      }

      // Store session data for later use
      data.session = session;
      data.recallSet = recallSet;

      // Create a SessionEngine instance for this connection
      // This provides real LLM-powered tutoring instead of placeholders
      const engine = new SessionEngine({
        scheduler: this.deps.scheduler,
        evaluator: this.deps.evaluator,
        llmClient: this.deps.llmClient,
        recallSetRepo: this.deps.recallSetRepo,
        recallPointRepo: this.deps.recallPointRepo,
        sessionRepo: this.deps.sessionRepo,
        messageRepo: this.deps.messageRepo,
      });

      // Start/resume the session in the engine
      await engine.startSession(recallSet);
      data.engine = engine;

      // Get the real opening message from the LLM
      const openingMessage = await engine.getOpeningMessage();

      // Get session state for progress info
      const sessionState = engine.getSessionState();

      // Send session_started message with real LLM-generated opening
      this.send(ws, {
        type: 'session_started',
        sessionId: session.id,
        openingMessage,
        currentPointIndex: sessionState?.recalledCount ?? 0,
        totalPoints: sessionState?.totalPoints ?? session.targetRecallPointIds.length,
      });

      data.initialized = true;
      console.log(`[WS] Session ${data.sessionId} initialized with ${session.targetRecallPointIds.length} recall points`);

    } catch (error) {
      console.error(`[WS] Error during connection setup:`, error);
      this.sendError(ws, 'INTERNAL_ERROR', 'Failed to initialize session');
      ws.close(WS_CLOSE_CODES.INVALID_SESSION, 'Initialization failed');
    }
  }

  /**
   * Handles an incoming message from the client.
   * Parses the message and routes it to the appropriate handler method.
   *
   * @param ws - The WebSocket connection
   * @param rawMessage - The raw message string from the client
   */
  async handleMessage(
    ws: ServerWebSocket<WebSocketSessionData>,
    rawMessage: string | Buffer
  ): Promise<void> {
    const data = ws.data;
    data.lastMessageTime = Date.now();

    // Convert Buffer to string if necessary
    const messageStr = typeof rawMessage === 'string'
      ? rawMessage
      : rawMessage.toString('utf-8');

    // Parse and validate the message
    const parsed = parseClientMessage(messageStr);

    // If parsing returned an error, send it and increment error count
    if (parsed.type === 'error') {
      data.consecutiveErrors++;
      this.send(ws, parsed);

      // Close connection if too many errors
      if (data.consecutiveErrors >= this.config.maxConsecutiveErrors) {
        console.log(`[WS] Too many errors for session ${data.sessionId}, closing`);
        ws.close(WS_CLOSE_CODES.TOO_MANY_ERRORS, 'Too many errors');
      }
      return;
    }

    // Reset error count on successful parse
    data.consecutiveErrors = 0;

    // Route to appropriate handler based on message type
    try {
      switch (parsed.type) {
        case 'user_message':
          await this.handleUserMessage(ws, parsed.content);
          break;
        case 'trigger_eval':
          await this.handleTriggerEval(ws);
          break;
        case 'end_session':
          await this.handleEndSession(ws);
          break;
        case 'ping':
          this.handlePing(ws);
          break;
        default:
          // TypeScript exhaustiveness check
          const _exhaustive: never = parsed;
          throw new Error(`Unhandled message type: ${(_exhaustive as ClientMessage).type}`);
      }
    } catch (error) {
      console.error(`[WS] Error handling message:`, error);
      this.sendError(ws, 'SESSION_ENGINE_ERROR', String(error));
    }
  }

  /**
   * Handles a user message in the conversation.
   * Processes the message through the SessionEngine and streams back the response.
   *
   * @param ws - The WebSocket connection
   * @param content - The user's message content
   */
  private async handleUserMessage(
    ws: ServerWebSocket<WebSocketSessionData>,
    content: string
  ): Promise<void> {
    const data = ws.data;
    console.log(`[WS] User message for session ${data.sessionId}: "${content.substring(0, 50)}..."`);

    // Validate session is initialized and engine is available
    if (!data.initialized || !data.session || !data.engine) {
      this.sendError(ws, 'SESSION_NOT_ACTIVE', 'Session not initialized');
      return;
    }

    // Mark as streaming
    data.isStreaming = true;
    data.currentResponseChunks = [];
    data.currentChunkIndex = 0;

    try {
      // Process the user message through the real SessionEngine
      // This generates an actual LLM response based on the conversation context
      const result = await data.engine.processUserMessage(content);

      // Stream the real response back to the client
      await this.streamResponse(ws, result.response);

      // Send point_recalled messages for any points recalled this turn
      if (result.pointsRecalledThisTurn.length > 0) {
        for (const pointId of result.pointsRecalledThisTurn) {
          this.send(ws, {
            type: 'point_recalled',
            pointId,
            recalledCount: result.recalledCount,
            totalPoints: result.totalPoints,
          });
        }
      }

      // If point was advanced, send point transition message
      if (result.pointAdvanced && !result.completed) {
        const state = data.engine.getSessionState();
        this.send(ws, {
          type: 'point_transition',
          fromPointId: result.pointsRecalledThisTurn[result.pointsRecalledThisTurn.length - 1] || '',
          toPointId: state?.currentProbePoint?.id || '',
          pointsRemaining: result.totalPoints - result.recalledCount,
          recalledCount: result.recalledCount,
        });
      }

      // If session completed, send completion summary
      if (result.completed) {
        const summary: SessionSummary = {
          sessionId: data.sessionId,
          totalPointsReviewed: result.totalPoints,
          successfulRecalls: result.totalPoints, // Will be refined when we track individual outcomes
          recallRate: 1.0, // Will be refined with actual metrics
          durationMs: Date.now() - data.lastMessageTime,
          engagementScore: 80, // Will be calculated from actual session data
          estimatedCostUsd: 0.05, // Will be calculated from token usage
        };

        this.send(ws, {
          type: 'session_complete',
          summary,
        });
      }
    } catch (error) {
      console.error(`[WS] Error processing user message:`, error);
      this.sendError(ws, 'SESSION_ENGINE_ERROR', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      // Mark streaming complete
      data.isStreaming = false;
    }
  }

  /**
   * Handles a manual evaluation trigger request.
   * Forces evaluation of the current recall point using the SessionEngine.
   *
   * @param ws - The WebSocket connection
   */
  private async handleTriggerEval(
    ws: ServerWebSocket<WebSocketSessionData>
  ): Promise<void> {
    const data = ws.data;
    console.log(`[WS] Manual evaluation triggered for session ${data.sessionId}`);

    // Validate session is initialized and engine is available
    if (!data.initialized || !data.session || !data.engine) {
      this.sendError(ws, 'SESSION_NOT_ACTIVE', 'Session not initialized');
      return;
    }

    try {
      // Trigger real evaluation through the SessionEngine
      const result = await data.engine.triggerEvaluation();

      // Stream the evaluation response (feedback from the tutor)
      await this.streamResponse(ws, result.response);

      // Send point_recalled messages for any points recalled this turn
      if (result.pointsRecalledThisTurn.length > 0) {
        for (const pointId of result.pointsRecalledThisTurn) {
          this.send(ws, {
            type: 'point_recalled',
            pointId,
            recalledCount: result.recalledCount,
            totalPoints: result.totalPoints,
          });
        }
      }

      // If point was advanced, send point transition message
      if (result.pointAdvanced && !result.completed) {
        const state = data.engine.getSessionState();
        this.send(ws, {
          type: 'point_transition',
          fromPointId: result.pointsRecalledThisTurn[result.pointsRecalledThisTurn.length - 1] || '',
          toPointId: state?.currentProbePoint?.id || '',
          pointsRemaining: result.totalPoints - result.recalledCount,
          recalledCount: result.recalledCount,
        });
      }

      // If session completed, send completion summary
      if (result.completed) {
        const summary: SessionSummary = {
          sessionId: data.sessionId,
          totalPointsReviewed: result.totalPoints,
          successfulRecalls: result.totalPoints,
          recallRate: 1.0,
          durationMs: Date.now() - data.lastMessageTime,
          engagementScore: 80,
          estimatedCostUsd: 0.05,
        };

        this.send(ws, {
          type: 'session_complete',
          summary,
        });
      }
    } catch (error) {
      console.error(`[WS] Error during manual evaluation:`, error);
      this.sendError(ws, 'SESSION_ENGINE_ERROR', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Handles a request to end the session early.
   * Abandons the session via the SessionEngine and sends completion summary.
   *
   * @param ws - The WebSocket connection
   */
  private async handleEndSession(
    ws: ServerWebSocket<WebSocketSessionData>
  ): Promise<void> {
    const data = ws.data;
    console.log(`[WS] Session end requested for ${data.sessionId}`);

    // Validate session exists
    if (!data.session) {
      this.sendError(ws, 'SESSION_NOT_ACTIVE', 'No active session');
      ws.close(WS_CLOSE_CODES.SESSION_ENDED, 'No active session');
      return;
    }

    try {
      // Abandon the session via the SessionEngine
      // This marks the session as abandoned in the database
      if (data.engine) {
        await data.engine.abandonSession();
      }

      // Get session state for summary (may be null after abandonment)
      const sessionState = data.engine?.getSessionState();

      const summary: SessionSummary = {
        sessionId: data.sessionId,
        totalPointsReviewed: sessionState?.recalledCount ?? 0,
        successfulRecalls: 0, // Abandoned sessions don't count as successful
        recallRate: 0,
        durationMs: Date.now() - data.lastMessageTime,
        engagementScore: 50, // Lower score for abandoned sessions
        estimatedCostUsd: 0.01,
      };

      this.send(ws, {
        type: 'session_complete',
        summary,
      });
    } catch (error) {
      console.error(`[WS] Error ending session:`, error);
      // Still send a completion message even if abandonment fails
      this.send(ws, {
        type: 'session_complete',
        summary: {
          sessionId: data.sessionId,
          totalPointsReviewed: 0,
          successfulRecalls: 0,
          recallRate: 0,
          durationMs: Date.now() - data.lastMessageTime,
          engagementScore: 0,
          estimatedCostUsd: 0,
        },
      });
    }

    // Close the connection
    ws.close(WS_CLOSE_CODES.SESSION_ENDED, 'Session ended by user');
  }

  /**
   * Handles a ping message from the client.
   * Responds with a pong to confirm the connection is alive.
   *
   * @param ws - The WebSocket connection
   */
  private handlePing(ws: ServerWebSocket<WebSocketSessionData>): void {
    this.send(ws, {
      type: 'pong',
      timestamp: Date.now(),
    });
  }

  /**
   * Handles WebSocket connection close.
   * Cleans up resources and logs the disconnection.
   *
   * @param ws - The WebSocket connection
   * @param code - The close code
   * @param reason - The close reason
   */
  handleClose(
    ws: ServerWebSocket<WebSocketSessionData>,
    code: number,
    reason: string
  ): void {
    const data = ws.data;
    console.log(`[WS] Connection closed for session ${data.sessionId}: ${code} - ${reason}`);

    // TODO: Clean up any session resources when T06 is complete
    // This might include abandoning the session if not completed
  }

  /**
   * Handles WebSocket errors.
   * Logs the error and attempts to notify the client if possible.
   *
   * @param ws - The WebSocket connection
   * @param error - The error that occurred
   */
  handleError(ws: ServerWebSocket<WebSocketSessionData>, error: Error): void {
    const data = ws.data;
    console.error(`[WS] Error for session ${data.sessionId}:`, error);

    // Try to send error to client (may fail if connection is broken)
    try {
      this.sendError(ws, 'INTERNAL_ERROR', error.message, false);
    } catch {
      // Connection may already be closed
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Sends a message to the WebSocket client.
   *
   * @param ws - The WebSocket connection
   * @param message - The message to send
   */
  private send(
    ws: ServerWebSocket<WebSocketSessionData>,
    message: ServerMessage
  ): void {
    try {
      ws.send(serializeServerMessage(message));
    } catch (error) {
      console.error(`[WS] Failed to send message:`, error);
    }
  }

  /**
   * Sends an error message to the client.
   *
   * @param ws - The WebSocket connection
   * @param code - The error code
   * @param customMessage - Optional custom error message
   * @param recoverable - Whether the error is recoverable
   */
  private sendError(
    ws: ServerWebSocket<WebSocketSessionData>,
    code: WebSocketErrorCode,
    customMessage?: string,
    recoverable: boolean = true
  ): void {
    this.send(ws, createErrorPayload(code, customMessage, recoverable));
  }

  /**
   * Streams a response to the client as chunks.
   * Simulates the streaming behavior of LLM responses.
   *
   * @param ws - The WebSocket connection
   * @param response - The full response to stream
   */
  private async streamResponse(
    ws: ServerWebSocket<WebSocketSessionData>,
    response: string
  ): Promise<void> {
    const data = ws.data;
    const chunkSize = 20; // Characters per chunk (adjustable)
    const chunks: string[] = [];

    // Split response into chunks
    for (let i = 0; i < response.length; i += chunkSize) {
      chunks.push(response.substring(i, i + chunkSize));
    }

    data.currentResponseChunks = chunks;

    // Stream each chunk with a small delay to simulate LLM streaming
    for (let i = 0; i < chunks.length; i++) {
      data.currentChunkIndex = i;

      this.send(ws, {
        type: 'assistant_chunk',
        content: chunks[i],
        chunkIndex: i,
      });

      // Small delay between chunks (10-30ms to simulate streaming)
      await new Promise((resolve) => setTimeout(resolve, 15));
    }

    // Send complete message
    this.send(ws, {
      type: 'assistant_complete',
      fullContent: response,
      totalChunks: chunks.length,
    });
  }

}

// ============================================================================
// Factory Functions for Bun WebSocket Handlers
// ============================================================================

/**
 * Creates WebSocket handlers compatible with Bun.serve().
 *
 * This function returns an object with all the necessary WebSocket event
 * handlers that Bun expects. Use this when configuring your Bun server.
 *
 * @param deps - Handler dependencies
 * @param config - Optional configuration overrides
 * @returns Object with WebSocket handlers for Bun.serve()
 *
 * @example
 * ```typescript
 * const wsHandlers = createWebSocketHandlers({
 *   sessionRepo: new SessionRepository(db),
 *   recallSetRepo: new RecallSetRepository(db),
 * });
 *
 * Bun.serve({
 *   fetch: app.fetch,
 *   websocket: wsHandlers,
 * });
 * ```
 */
export function createWebSocketHandlers(
  deps: WebSocketHandlerDependencies,
  config?: Partial<WebSocketSessionConfig>
): {
  open: (ws: ServerWebSocket<WebSocketSessionData>) => Promise<void>;
  message: (
    ws: ServerWebSocket<WebSocketSessionData>,
    message: string | Buffer
  ) => Promise<void>;
  close: (
    ws: ServerWebSocket<WebSocketSessionData>,
    code: number,
    reason: string
  ) => void;
  error: (ws: ServerWebSocket<WebSocketSessionData>, error: Error) => void;
  ping: (ws: ServerWebSocket<WebSocketSessionData>, data: Buffer) => void;
  pong: (ws: ServerWebSocket<WebSocketSessionData>, data: Buffer) => void;
} {
  const handler = new WebSocketSessionHandler(deps, config);

  return {
    // Handle new connection
    open: (ws) => handler.handleOpen(ws),

    // Handle incoming message
    message: (ws, message) => handler.handleMessage(ws, message),

    // Handle connection close
    close: (ws, code, reason) => handler.handleClose(ws, code, reason),

    // Handle WebSocket error
    error: (ws, error) => handler.handleError(ws, error),

    // Handle ping (can use Bun's default behavior or custom)
    ping: (_ws, _data) => {
      // Bun handles ping/pong automatically, but we can log if needed
    },

    // Handle pong (can use Bun's default behavior or custom)
    pong: (_ws, _data) => {
      // Bun handles ping/pong automatically, but we can log if needed
    },
  };
}

/**
 * Validates a session ID query parameter and extracts it from a URL.
 *
 * @param url - The request URL
 * @returns The session ID if valid, or an error message
 */
export function extractSessionIdFromUrl(
  url: URL
): { sessionId: string } | { error: string } {
  const sessionId = url.searchParams.get('sessionId');

  if (!sessionId) {
    return { error: 'Missing sessionId query parameter' };
  }

  // Basic validation - session IDs should start with 'sess_'
  if (!sessionId.startsWith('sess_')) {
    return { error: 'Invalid sessionId format' };
  }

  return { sessionId };
}

/**
 * Checks if a request is a WebSocket upgrade request.
 *
 * @param request - The incoming request
 * @returns True if this is a WebSocket upgrade request
 */
export function isWebSocketUpgradeRequest(request: Request): boolean {
  const upgrade = request.headers.get('upgrade');
  return upgrade?.toLowerCase() === 'websocket';
}
