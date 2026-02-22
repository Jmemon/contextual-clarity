/**
 * WebSocket Message Types for Real-time Session Communication
 *
 * This module defines the message protocol for WebSocket communication
 * during recall sessions. The protocol supports:
 *
 * 1. **User Input**: Messages from the client to the server
 * 2. **Streaming Responses**: LLM responses streamed as chunks
 * 3. **Session Events**: Recall events, rabbit hole transitions, completion
 * 4. **Connection Management**: Ping/pong keepalive and error handling
 *
 * Protocol Flow:
 * ```
 * Client connects to /api/session/ws?sessionId=<id>
 *        |
 *        v
 * Server sends 'session_started' with opening message
 *        |
 *        v
 * Client sends 'user_message' with content
 *        |
 *        v
 * Server streams 'assistant_chunk' messages
 *        |
 *        v
 * Server sends 'assistant_complete' when done
 *        |
 *        v
 * (Repeat for conversation)
 *        |
 *        v
 * Server sends 'session_complete' and closes
 * ```
 *
 * @example
 * ```typescript
 * // Client sends a user message
 * ws.send(JSON.stringify({
 *   type: 'user_message',
 *   content: 'The Treaty of Versailles was signed in 1919...'
 * }));
 *
 * // Client leaves session
 * ws.send(JSON.stringify({ type: 'leave_session' }));
 * ```
 */

// Note: SessionMetricsSummary is available in '@/core/models/session-metrics' for future use
// when integrating with the full metrics system

// ============================================================================
// Client -> Server Messages
// ============================================================================

/**
 * Message sent by the client containing user's response in the conversation.
 * The server will process this through the SessionEngine and stream back
 * the assistant's response.
 */
export interface UserMessagePayload {
  type: 'user_message';
  /** The text content of the user's message */
  content: string;
}

/**
 * Client request to leave the session (T08 — replaces end_session).
 * The server pauses the session (preserving checklist state for later resumption)
 * rather than abandoning it, so progress is never lost.
 */
export interface LeaveSessionPayload {
  type: 'leave_session';
}

/**
 * Keepalive ping message from client.
 * The server will respond with a 'pong' message.
 * Clients should send pings periodically to keep the connection alive.
 */
export interface PingPayload {
  type: 'ping';
}

/**
 * T09: Client opts into a detected rabbit hole by providing the event ID and topic.
 * The server will create a RabbitholeAgent and send back 'rabbithole_entered'.
 */
export interface EnterRabbitholePayload {
  type: 'enter_rabbithole';
  /** The rabbithole event ID returned in the 'rabbithole_detected' server message */
  rabbitholeEventId: string;
  /** The topic of the rabbit hole to explore */
  topic: string;
}

/**
 * T09: Client requests to exit the current rabbit hole and return to the session.
 * The server will persist the conversation and emit 'rabbithole_exited'.
 */
export interface ExitRabbitholePayload {
  type: 'exit_rabbithole';
}

/**
 * T09: Client declines the rabbit hole prompt.
 * The server will suppress future rabbit hole detections for 3 messages (cooldown).
 */
export interface DeclineRabbitholePayload {
  type: 'decline_rabbithole';
}

/**
 * T13: User dismisses the completion overlay and continues the discussion.
 * No engine call needed — this is purely a UI state change on the server side.
 */
export interface DismissOverlayPayload {
  type: 'dismiss_overlay';
}

/**
 * Union type representing all possible messages from client to server.
 * Use this type when parsing incoming WebSocket messages.
 *
 * T13: Removed 'trigger_eval' (evaluation is continuous since T06).
 */
export type ClientMessage =
  | UserMessagePayload
  | LeaveSessionPayload
  | PingPayload
  | EnterRabbitholePayload
  | ExitRabbitholePayload
  | DeclineRabbitholePayload
  | DismissOverlayPayload;

/**
 * All valid client message types for validation.
 * T13: Removed 'trigger_eval' (evaluation is continuous since T06).
 */
export const CLIENT_MESSAGE_TYPES = [
  'user_message',
  'leave_session',
  'ping',
  'enter_rabbithole',
  'exit_rabbithole',
  'decline_rabbithole',
  'dismiss_overlay',
] as const;

export type ClientMessageType = (typeof CLIENT_MESSAGE_TYPES)[number];

// ============================================================================
// Server -> Client Messages
// ============================================================================

/**
 * Sent when the WebSocket connection is established and the session is ready.
 * Contains the session ID and the AI tutor's opening message to start
 * the recall conversation.
 *
 * T13: Removed currentPointIndex (no longer meaningful with checklist model).
 * Added recalledCount (0 for fresh sessions, >0 for resumed sessions).
 */
export interface SessionStartedPayload {
  type: 'session_started';
  /** Unique identifier for this session */
  sessionId: string;
  /** The AI tutor's opening message (question about the recall point) */
  openingMessage: string;
  /** Total number of recall points in this session */
  totalPoints: number;
  /** Number of points already recalled (0 for fresh session, >0 for resumed) */
  recalledCount: number;
}

/**
 * Partial chunk of the assistant's response during streaming.
 * Multiple chunks are sent as the LLM generates the response,
 * allowing for real-time display of the response as it's generated.
 */
export interface AssistantChunkPayload {
  type: 'assistant_chunk';
  /** Partial content chunk to append to the response */
  content: string;
  /** Sequence number for this chunk (0-indexed) */
  chunkIndex: number;
}

/**
 * Sent when the assistant's response is fully generated.
 * Contains the complete response text for verification and storage.
 * The client should use this to ensure the full response was received.
 */
export interface AssistantCompletePayload {
  type: 'assistant_complete';
  /** Complete response text */
  fullContent: string;
  /** Total number of chunks that were sent */
  totalChunks: number;
}

/**
 * Sent when a specific recall point has been marked as recalled.
 * Contains progress information about the session.
 * T13: Renamed from PointRecalledPayload to align with engine event type.
 */
export interface PointRecalledPayload {
  type: 'point_recalled';
  /** ID of the recall point that was recalled */
  pointId: string;
  /** Number of points recalled so far */
  recalledCount: number;
  /** Total number of recall points in the session */
  totalPoints: number;
}

/**
 * Sent when all recall points have been reviewed and the session is complete.
 * Contains a summary of the session's performance metrics.
 * The WebSocket connection will be closed after this message.
 *
 * T13: Uses SessionCompletionSummary from core/session/types.ts instead of the
 * old inline SessionSummary interface, adding rabbitholeCount and recalledPointIds.
 */
export interface SessionCompletePayload {
  type: 'session_complete';
  /** Summary of the session's metrics and performance */
  summary: SessionCompletionSummary;
}

// Import SessionCompletionSummary from core types so it's the single source of truth
import type { SessionCompletionSummary } from '../../core/session/types';
export type { SessionCompletionSummary };

/**
 * T08: Sent when all recall points have been recalled.
 * Prompts the UI to show the completion overlay. The session has NOT been finalized yet —
 * the user can choose to "Continue Discussion" (overlay dismissed, no WS message) or
 * "Done" (sends leave_session, navigates to dashboard).
 */
export interface SessionCompleteOverlayPayload {
  type: 'session_complete_overlay';
  /** Number of points recalled in this session */
  recalledCount: number;
  /** Total points targeted in the session */
  totalPoints: number;
  /** Session ID for reference */
  sessionId: string;
  /** Human-readable completion message shown in the overlay */
  message: string;
  /** Whether the user can continue discussion after dismissing the overlay */
  canContinue: boolean;
}

/**
 * T08: Sent when the session has been paused (user left via the overlay or sent leave_session).
 * The session status is now 'paused' and can be resumed later.
 */
export interface SessionPausedPayload {
  type: 'session_paused';
  /** Session ID of the paused session */
  sessionId: string;
  /** Number of points recalled before pausing */
  recalledCount: number;
  /** Total points in the session */
  totalPoints: number;
}

/**
 * T09: Sent when the rabbithole detector identifies a tangent in the conversation.
 * The client should show a prompt asking the user if they want to explore.
 * The user must explicitly opt in via 'enter_rabbithole' — never auto-enter.
 */
export interface RabbitholeDetectedPayload {
  type: 'rabbithole_detected';
  /** The detected tangent topic */
  topic: string;
  /** Stable event ID used when the client sends 'enter_rabbithole' or 'decline_rabbithole' */
  rabbitholeEventId: string;
}

/**
 * T09: Sent when the user has entered a rabbit hole (opted in via enter_rabbithole).
 * The main session is now frozen; all user messages route to the RabbitholeAgent.
 */
export interface RabbitholeEnteredPayload {
  type: 'rabbithole_entered';
  /** The topic being explored */
  topic: string;
}

/**
 * T09: Sent when the user exits a rabbit hole (via exit_rabbithole).
 * The main session resumes. If all points were recalled during the rabbit hole,
 * completionPending will be true and the session_complete_overlay fires next.
 */
export interface RabbitholeExitedPayload {
  type: 'rabbithole_exited';
  /** Human-readable label for the rabbit hole that just ended */
  label: string;
  /** Number of recall points that were recalled WHILE in this rabbit hole */
  pointsRecalledDuring: number;
  /** True if all points were recalled during the rabbit hole — overlay fires next */
  completionPending: boolean;
}

/**
 * Sent when an error occurs during the session.
 * Contains an error code and message for debugging and user display.
 */
export interface ErrorPayload {
  type: 'error';
  /** Machine-readable error code */
  code: WebSocketErrorCode;
  /** Human-readable error message */
  message: string;
  /** Whether the error is recoverable (connection can continue) */
  recoverable: boolean;
}

/**
 * Response to a client 'ping' message.
 * Used for keepalive verification.
 */
export interface PongPayload {
  type: 'pong';
  /** Timestamp when the pong was sent */
  timestamp: number;
}

/**
 * Union type representing all possible messages from server to client.
 * Use this type when constructing outgoing WebSocket messages.
 *
 * T13: Removed EvaluationResultPayload and PointTransitionPayload (deprecated).
 */
export type ServerMessage =
  | SessionStartedPayload
  | AssistantChunkPayload
  | AssistantCompletePayload
  | PointRecalledPayload
  | SessionCompletePayload
  | SessionCompleteOverlayPayload
  | SessionPausedPayload
  | RabbitholeDetectedPayload
  | RabbitholeEnteredPayload
  | RabbitholeExitedPayload
  | ErrorPayload
  | PongPayload;

// ============================================================================
// Error Codes
// ============================================================================

/**
 * Error codes for WebSocket communication.
 * These codes help clients identify and handle specific error conditions.
 */
export type WebSocketErrorCode =
  | 'INVALID_SESSION_ID'      // Session ID is missing or invalid
  | 'SESSION_NOT_FOUND'       // Session doesn't exist in the database
  | 'SESSION_NOT_ACTIVE'      // Session exists but is not in-progress
  | 'INVALID_MESSAGE_FORMAT'  // Message couldn't be parsed as JSON
  | 'UNKNOWN_MESSAGE_TYPE'    // Message type is not recognized
  | 'MISSING_CONTENT'         // user_message missing content field
  | 'SESSION_ENGINE_ERROR'    // Error from the SessionEngine
  | 'LLM_ERROR'               // Error from the LLM API
  | 'INTERNAL_ERROR';         // Unexpected server error

/**
 * Error code descriptions for logging and debugging.
 */
export const ERROR_CODE_DESCRIPTIONS: Record<WebSocketErrorCode, string> = {
  INVALID_SESSION_ID: 'The session ID is missing or invalid',
  SESSION_NOT_FOUND: 'The specified session does not exist',
  SESSION_NOT_ACTIVE: 'The session is not in an active state',
  INVALID_MESSAGE_FORMAT: 'The message could not be parsed as valid JSON',
  UNKNOWN_MESSAGE_TYPE: 'The message type is not recognized',
  MISSING_CONTENT: 'The user_message is missing the content field',
  SESSION_ENGINE_ERROR: 'An error occurred in the session engine',
  LLM_ERROR: 'An error occurred while communicating with the LLM API',
  INTERNAL_ERROR: 'An unexpected internal server error occurred',
};

// ============================================================================
// Type Guards and Utilities
// ============================================================================

/**
 * Type guard to check if a value is a valid ClientMessageType.
 *
 * @param type - The value to check
 * @returns True if the value is a valid client message type
 */
export function isClientMessageType(type: unknown): type is ClientMessageType {
  return (
    typeof type === 'string' &&
    CLIENT_MESSAGE_TYPES.includes(type as ClientMessageType)
  );
}

/**
 * Validates and parses a client message from a raw string.
 * Returns the parsed message if valid, or an error payload if invalid.
 *
 * @param rawMessage - The raw string message from the WebSocket
 * @returns Either the parsed ClientMessage or an ErrorPayload
 */
export function parseClientMessage(
  rawMessage: string
): ClientMessage | ErrorPayload {
  // Attempt to parse as JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawMessage);
  } catch {
    return {
      type: 'error',
      code: 'INVALID_MESSAGE_FORMAT',
      message: 'Failed to parse message as JSON',
      recoverable: true,
    };
  }

  // Validate the parsed object has a type field
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('type' in parsed)
  ) {
    return {
      type: 'error',
      code: 'INVALID_MESSAGE_FORMAT',
      message: 'Message must be an object with a "type" field',
      recoverable: true,
    };
  }

  const message = parsed as { type: unknown; content?: unknown };

  // Validate the message type
  if (!isClientMessageType(message.type)) {
    return {
      type: 'error',
      code: 'UNKNOWN_MESSAGE_TYPE',
      message: `Unknown message type: ${String(message.type)}`,
      recoverable: true,
    };
  }

  // Validate specific message types
  if (message.type === 'user_message') {
    if (typeof message.content !== 'string' || message.content.trim() === '') {
      return {
        type: 'error',
        code: 'MISSING_CONTENT',
        message: 'user_message must include a non-empty "content" field',
        recoverable: true,
      };
    }
    return { type: 'user_message', content: message.content };
  }

  // T09: Validate enter_rabbithole — needs rabbitholeEventId and topic fields
  if (message.type === 'enter_rabbithole') {
    const msg = parsed as { type: unknown; rabbitholeEventId?: unknown; topic?: unknown };
    if (typeof msg.rabbitholeEventId !== 'string' || typeof msg.topic !== 'string') {
      return {
        type: 'error',
        code: 'MISSING_CONTENT',
        message: 'enter_rabbithole must include "rabbitholeEventId" and "topic" fields',
        recoverable: true,
      };
    }
    return { type: 'enter_rabbithole', rabbitholeEventId: msg.rabbitholeEventId, topic: msg.topic };
  }

  // For other message types (leave_session, exit_rabbithole, decline_rabbithole,
  // dismiss_overlay, ping), return as-is — no additional fields required.
  return { type: message.type } as ClientMessage;
}

/**
 * Serializes a server message to JSON string for sending over WebSocket.
 *
 * @param message - The server message to serialize
 * @returns JSON string representation of the message
 */
export function serializeServerMessage(message: ServerMessage): string {
  return JSON.stringify(message);
}

/**
 * Creates an error payload with the specified code.
 *
 * @param code - The error code
 * @param customMessage - Optional custom message (uses default if not provided)
 * @param recoverable - Whether the error is recoverable (default: true)
 * @returns ErrorPayload ready for sending
 */
export function createErrorPayload(
  code: WebSocketErrorCode,
  customMessage?: string,
  recoverable: boolean = true
): ErrorPayload {
  return {
    type: 'error',
    code,
    message: customMessage ?? ERROR_CODE_DESCRIPTIONS[code],
    recoverable,
  };
}

// ============================================================================
// WebSocket Close Codes
// ============================================================================

/**
 * Custom WebSocket close codes for session-specific disconnection reasons.
 * Standard close codes (1000-1015) are defined by RFC 6455.
 * Custom codes can be in the range 4000-4999.
 */
export const WS_CLOSE_CODES = {
  /** Normal closure - session completed successfully */
  NORMAL: 1000,
  /** Session ended by client request */
  SESSION_ENDED: 4000,
  /** Session was abandoned (not all points reviewed) */
  SESSION_ABANDONED: 4001,
  /** Session ID was invalid or session not found */
  INVALID_SESSION: 4002,
  /** Too many errors occurred */
  TOO_MANY_ERRORS: 4003,
  /** Server is shutting down */
  SERVER_SHUTDOWN: 4004,
  /** Connection idle timeout */
  IDLE_TIMEOUT: 4005,
} as const;

export type WebSocketCloseCode =
  (typeof WS_CLOSE_CODES)[keyof typeof WS_CLOSE_CODES];
