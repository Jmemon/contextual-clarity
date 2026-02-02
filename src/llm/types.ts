/**
 * LLM Types and Interfaces
 *
 * This file defines the TypeScript types for the LLM client wrapper.
 * These types provide a clean abstraction over the Anthropic SDK types,
 * making it easier to work with in application code and potentially
 * swap out LLM providers in the future.
 */

/**
 * Represents a single message in a conversation.
 * Messages alternate between 'user' and 'assistant' roles.
 */
export interface LLMMessage {
  /** The role of who sent this message */
  role: 'user' | 'assistant';
  /** The text content of the message */
  content: string;
}

/**
 * Configuration options for LLM API calls.
 * All fields are optional and have sensible defaults.
 */
export interface LLMConfig {
  /**
   * The model to use for completions.
   * Defaults to 'claude-sonnet-4-5-20250929' (Claude Sonnet 4.5).
   */
  model?: string;

  /**
   * Maximum number of tokens to generate in the response.
   * Defaults to 1024. Higher values allow for longer responses
   * but cost more and take longer.
   */
  maxTokens?: number;

  /**
   * Controls randomness in the response (0.0 to 1.0).
   * Lower values = more deterministic, higher = more creative.
   * Defaults to 0.7.
   */
  temperature?: number;
}

/**
 * Callbacks for handling streaming responses.
 * All callbacks are optional - only provide the ones you need.
 */
export interface StreamCallbacks {
  /**
   * Called for each chunk of text as it arrives.
   * Use this to display text in real-time to the user.
   * @param text - The new text chunk (not cumulative)
   */
  onText?: (text: string) => void;

  /**
   * Called once when the stream completes successfully.
   * @param fullText - The complete response text
   */
  onComplete?: (fullText: string) => void;

  /**
   * Called if an error occurs during streaming.
   * @param error - The error that occurred
   */
  onError?: (error: Error) => void;
}

/**
 * Result of a complete (non-streaming) API call.
 * Contains the response text and usage information.
 */
export interface LLMResponse {
  /** The generated response text */
  text: string;

  /**
   * Token usage information for billing/tracking.
   * Null if usage data is not available.
   */
  usage: {
    /** Number of tokens in the input (prompt) */
    inputTokens: number;
    /** Number of tokens in the output (response) */
    outputTokens: number;
  } | null;

  /** The reason the model stopped generating */
  stopReason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | null;
}

/**
 * Error types that can occur when calling the LLM API.
 * These help distinguish between different failure modes.
 */
export type LLMErrorType =
  | 'authentication'   // Invalid or missing API key
  | 'rate_limit'       // Too many requests
  | 'invalid_request'  // Bad request parameters
  | 'server_error'     // Anthropic server error
  | 'network'          // Network/connection error
  | 'timeout'          // Request took too long
  | 'unknown';         // Unexpected error

/**
 * Custom error class for LLM-related errors.
 * Includes the error type for easier handling.
 */
export class LLMError extends Error {
  /** The type of error that occurred */
  type: LLMErrorType;
  /** The original error that was caught, if any */
  cause?: Error;

  constructor(message: string, type: LLMErrorType, cause?: Error) {
    super(message);
    this.name = 'LLMError';
    this.type = type;
    this.cause = cause;
  }
}
