/**
 * WebSocket Module - Barrel Export
 *
 * This module provides WebSocket infrastructure for real-time recall sessions.
 * It exports the session handler, message types, and utility functions needed
 * to set up WebSocket communication in the API server.
 *
 * Main components:
 * - **Session Handler**: Manages WebSocket connections and message routing
 * - **Message Types**: TypeScript types for client/server message protocol
 * - **Utilities**: Parsing, validation, and serialization helpers
 *
 * @example
 * ```typescript
 * import {
 *   createWebSocketHandlers,
 *   extractSessionIdFromUrl,
 *   isWebSocketUpgradeRequest,
 *   createInitialSessionData,
 *   type ClientMessage,
 *   type ServerMessage,
 *   WS_CLOSE_CODES,
 * } from '@/api/ws';
 *
 * // In your Bun server setup
 * const wsHandlers = createWebSocketHandlers({
 *   sessionRepo: new SessionRepository(db),
 *   recallSetRepo: new RecallSetRepository(db),
 * });
 *
 * // Handle WebSocket upgrade in Hono route
 * app.get('/api/session/ws', (c) => {
 *   if (!isWebSocketUpgradeRequest(c.req.raw)) {
 *     return c.json({ error: 'Expected WebSocket' }, 426);
 *   }
 *
 *   const result = extractSessionIdFromUrl(new URL(c.req.url));
 *   if ('error' in result) {
 *     return c.json({ error: result.error }, 400);
 *   }
 *
 *   const server = c.env.server;
 *   const upgraded = server.upgrade(c.req.raw, {
 *     data: createInitialSessionData(result.sessionId),
 *   });
 *
 *   if (!upgraded) {
 *     return c.json({ error: 'WebSocket upgrade failed' }, 500);
 *   }
 *
 *   return undefined; // Bun handles the response
 * });
 * ```
 */

// ============================================================================
// Session Handler Exports
// ============================================================================

export {
  // Main handler class
  WebSocketSessionHandler,

  // Factory function for creating Bun-compatible handlers
  createWebSocketHandlers,

  // Utility functions
  extractSessionIdFromUrl,
  isWebSocketUpgradeRequest,
  createInitialSessionData,

  // Types
  type WebSocketSessionConfig,
  type WebSocketSessionData,
  type WebSocketHandlerDependencies,

  // Constants
  DEFAULT_WS_CONFIG,
} from './session-handler';

// ============================================================================
// Message Type Exports
// ============================================================================

export {
  // Client -> Server message types
  type UserMessagePayload,
  type LeaveSessionPayload,
  type EnterRabbitholePayload,
  type ExitRabbitholePayload,
  type DeclineRabbitholePayload,
  type DismissOverlayPayload,
  type PingPayload,
  type ClientMessage,
  type ClientMessageType,

  // Server -> Client message types
  type SessionStartedPayload,
  type AssistantChunkPayload,
  type AssistantCompletePayload,
  type PointRecalledPayload,
  type SessionCompletePayload,
  type SessionCompleteOverlayPayload,
  type SessionPausedPayload,
  type RabbitholeDetectedPayload,
  type RabbitholeEnteredPayload,
  type RabbitholeExitedPayload,
  type ErrorPayload,
  type PongPayload,
  type ServerMessage,

  // Session completion summary (T13: replaces inline SessionSummary)
  type SessionCompletionSummary,

  // Error handling
  type WebSocketErrorCode,
  type WebSocketCloseCode,
  ERROR_CODE_DESCRIPTIONS,

  // Constants
  CLIENT_MESSAGE_TYPES,
  WS_CLOSE_CODES,

  // Utility functions
  isClientMessageType,
  parseClientMessage,
  serializeServerMessage,
  createErrorPayload,
} from './types';
