/**
 * WebSocket Message Types for Real-time Session Communication
 *
 * This module defines the message protocol for WebSocket communication
 * during recall sessions. The protocol supports:
 *
 * 1. **User Input**: Messages from the client to the server
 * 2. **Streaming Responses**: LLM responses streamed as chunks
 * 3. **Session Events**: Recall events, branch transitions, completion
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
  /** Target branch ID; null/undefined = trunk */
  branchId?: string;
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

/** Client activates a detected branch (first tab click) */
export interface ActivateBranchPayload {
  type: 'activate_branch';
  /** The branch ID to activate */
  branchId: string;
}

/** Client explicitly closes a branch (marks as done) */
export interface CloseBranchPayload {
  type: 'close_branch';
  /** The branch ID to close */
  branchId: string;
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
 * Replaced rabbithole messages with branch messages for multiplexed tab UX.
 */
export type ClientMessage =
  | UserMessagePayload
  | LeaveSessionPayload
  | PingPayload
  | ActivateBranchPayload
  | CloseBranchPayload
  | DismissOverlayPayload;

/**
 * All valid client message types for validation.
 * T13: Removed 'trigger_eval' (evaluation is continuous since T06).
 */
export const CLIENT_MESSAGE_TYPES = [
  'user_message',
  'leave_session',
  'ping',
  'activate_branch',
  'close_branch',
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
  /** Branch ID if streaming a branch response; undefined = trunk */
  branchId?: string;
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
  /** Branch ID if completing a branch response; undefined = trunk */
  branchId?: string;
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
  /** Short topic keyword extracted from the recall point content */
  label: string;
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

/** Sent when a tangent is detected — a new tab should appear in the branch bar */
export interface BranchDetectedPayload {
  type: 'branch_detected';
  /** Unique branch ID */
  branchId: string;
  /** The detected tangent topic */
  topic: string;
  /** Parent branch ID if nested; undefined = branched from trunk */
  parentBranchId?: string;
  /** How far from the main topic (1 = off trunk, 2 = nested, etc.) */
  depth: number;
}

/** Confirms a branch agent is ready after the client sent activate_branch */
export interface BranchActivatedPayload {
  type: 'branch_activated';
  /** The branch that was activated */
  branchId: string;
  /** The topic being explored */
  topic: string;
}

/** Sent when a branch is closed (AI-detected conclusion or user-closed) */
export interface BranchClosedPayload {
  type: 'branch_closed';
  /** The branch that was closed */
  branchId: string;
  /** Summary of the branch conversation */
  summary: string;
}

/** Sent when a closed branch's summary is available for the parent context */
export interface BranchSummaryInjectedPayload {
  type: 'branch_summary_injected';
  /** The branch whose summary was injected */
  branchId: string;
  /** The summary text */
  summary: string;
  /** The message ID in the parent where the branch forked */
  branchPointMessageId: string;
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
 * Replaced rabbithole payloads with branch payloads for multiplexed tab UX.
 */
export type ServerMessage =
  | SessionStartedPayload
  | AssistantChunkPayload
  | AssistantCompletePayload
  | PointRecalledPayload
  | SessionCompletePayload
  | SessionCompleteOverlayPayload
  | SessionPausedPayload
  | BranchDetectedPayload
  | BranchActivatedPayload
  | BranchClosedPayload
  | BranchSummaryInjectedPayload
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
    const msg = parsed as { branchId?: unknown };
    const branchId = typeof msg.branchId === 'string' ? msg.branchId : undefined;
    return { type: 'user_message', content: message.content, branchId };
  }

  // Validate activate_branch — needs branchId
  if (message.type === 'activate_branch') {
    const msg = parsed as { branchId?: unknown };
    if (typeof msg.branchId !== 'string') {
      return {
        type: 'error',
        code: 'MISSING_CONTENT',
        message: 'activate_branch must include a "branchId" field',
        recoverable: true,
      };
    }
    return { type: 'activate_branch', branchId: msg.branchId };
  }

  // Validate close_branch — needs branchId
  if (message.type === 'close_branch') {
    const msg = parsed as { branchId?: unknown };
    if (typeof msg.branchId !== 'string') {
      return {
        type: 'error',
        code: 'MISSING_CONTENT',
        message: 'close_branch must include a "branchId" field',
        recoverable: true,
      };
    }
    return { type: 'close_branch', branchId: msg.branchId };
  }

  // For other message types (leave_session, dismiss_overlay, ping),
  // return as-is — no additional fields required.
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
