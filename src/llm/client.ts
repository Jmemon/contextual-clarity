/**
 * Anthropic Client Wrapper
 *
 * This module provides an abstraction layer over the Anthropic SDK.
 * It handles:
 * - API key configuration with clear error messages
 * - Non-streaming and streaming API calls
 * - System prompt management
 * - Approximate token counting
 * - Error handling with typed errors
 *
 * Usage:
 * ```typescript
 * const client = new AnthropicClient();
 * const response = await client.complete('Hello, Claude!');
 * console.log(response.text);
 * ```
 */

import Anthropic, {
  APIError,
  APIConnectionError,
  APIConnectionTimeoutError,
  AuthenticationError,
  RateLimitError,
  BadRequestError,
  InternalServerError,
} from '@anthropic-ai/sdk';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages/messages';
import type { LLMMessage, LLMConfig, StreamCallbacks, LLMResponse } from './types';
import { getAnthropicApiKey } from '../config';
import { LLMError, type LLMErrorType } from './types';

// Default model to use for all requests (Claude Sonnet 4.5)
const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';

// Default maximum tokens for responses
const DEFAULT_MAX_TOKENS = 1024;

// Default temperature for response generation
const DEFAULT_TEMPERATURE = 0.7;

/**
 * Wrapper class for the Anthropic API client.
 * Provides a simplified interface for making LLM calls with
 * proper error handling and streaming support.
 */
export class AnthropicClient {
  /** The underlying Anthropic SDK client */
  private client: Anthropic;

  /** Default configuration for all requests */
  private defaultConfig: Required<LLMConfig>;

  /** Optional system prompt to include with all requests */
  private systemPrompt: string | undefined;

  /**
   * Creates a new AnthropicClient instance.
   *
   * @param config - Optional configuration to override defaults
   * @throws LLMError if ANTHROPIC_API_KEY environment variable is not set
   *
   * @example
   * ```typescript
   * // Use defaults
   * const client = new AnthropicClient();
   *
   * // Custom configuration
   * const client = new AnthropicClient({
   *   model: 'claude-3-haiku-20240307',
   *   maxTokens: 2048,
   *   temperature: 0.5
   * });
   * ```
   */
  constructor(config: LLMConfig = {}) {
    // Validate API key is present before proceeding
    const apiKey = getAnthropicApiKey();
    if (!apiKey) {
      throw new LLMError(
        'ANTHROPIC_API_KEY environment variable is required.\n' +
          'Get your API key at: https://console.anthropic.com/\n' +
          'Then set it: export ANTHROPIC_API_KEY=your-key-here',
        'authentication'
      );
    }

    // Initialize the Anthropic client with the API key
    this.client = new Anthropic({ apiKey });

    // Merge provided config with defaults
    this.defaultConfig = {
      model: config.model ?? DEFAULT_MODEL,
      maxTokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: config.temperature ?? DEFAULT_TEMPERATURE,
    };
  }

  /**
   * Sets a system prompt to be included with all subsequent requests.
   * The system prompt provides context and instructions to the model.
   *
   * @param prompt - The system prompt text, or undefined to clear
   *
   * @example
   * ```typescript
   * client.setSystemPrompt(
   *   'You are a helpful tutor. Ask Socratic questions ' +
   *   'to help the user discover answers themselves.'
   * );
   * ```
   */
  setSystemPrompt(prompt: string | undefined): void {
    this.systemPrompt = prompt;
  }

  /**
   * Gets the current system prompt.
   *
   * @returns The current system prompt, or undefined if not set
   */
  getSystemPrompt(): string | undefined {
    return this.systemPrompt;
  }

  /**
   * Makes a non-streaming API call and returns the complete response.
   * Use this when you don't need real-time streaming of the response.
   *
   * @param messages - Either a single string (treated as user message) or an array of messages
   * @param config - Optional configuration to override defaults for this request
   * @returns Promise resolving to the complete response with usage info
   * @throws LLMError on API errors
   *
   * @example
   * ```typescript
   * // Simple string input
   * const response = await client.complete('What is 2 + 2?');
   *
   * // Full message array with conversation history
   * const response = await client.complete([
   *   { role: 'user', content: 'Hello!' },
   *   { role: 'assistant', content: 'Hi there!' },
   *   { role: 'user', content: 'What is AI?' }
   * ]);
   * ```
   */
  async complete(
    messages: string | LLMMessage[],
    config: LLMConfig = {}
  ): Promise<LLMResponse> {
    // Convert string input to message array
    const messageArray = this.normalizeMessages(messages);

    // Format messages for the Anthropic API
    const formattedMessages = this.formatMessages(messageArray);

    // Merge config with defaults
    const mergedConfig = this.mergeConfig(config);

    try {
      // Make the API call
      const response = await this.client.messages.create({
        model: mergedConfig.model,
        max_tokens: mergedConfig.maxTokens,
        temperature: mergedConfig.temperature,
        system: this.systemPrompt,
        messages: formattedMessages,
      });

      // Extract text from the response content blocks
      const text = this.extractText(response.content);

      return {
        text,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
        stopReason: response.stop_reason,
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Makes a streaming API call, invoking callbacks as text arrives.
   * Use this when you want to display the response in real-time.
   *
   * @param messages - Either a single string (treated as user message) or an array of messages
   * @param callbacks - Callbacks for handling stream events
   * @param config - Optional configuration to override defaults for this request
   * @returns Promise that resolves when streaming is complete
   *
   * @example
   * ```typescript
   * await client.stream('Tell me a story', {
   *   onText: (chunk) => process.stdout.write(chunk),
   *   onComplete: (fullText) => console.log('\n\nDone!'),
   *   onError: (error) => console.error('Error:', error)
   * });
   * ```
   */
  async stream(
    messages: string | LLMMessage[],
    callbacks: StreamCallbacks,
    config: LLMConfig = {}
  ): Promise<void> {
    // Convert string input to message array
    const messageArray = this.normalizeMessages(messages);

    // Format messages for the Anthropic API
    const formattedMessages = this.formatMessages(messageArray);

    // Merge config with defaults
    const mergedConfig = this.mergeConfig(config);

    // Accumulate full text for onComplete callback
    let fullText = '';

    try {
      // Create the streaming request
      const stream = await this.client.messages.create({
        model: mergedConfig.model,
        max_tokens: mergedConfig.maxTokens,
        temperature: mergedConfig.temperature,
        system: this.systemPrompt,
        messages: formattedMessages,
        stream: true,
      });

      // Process each event in the stream
      for await (const event of stream) {
        // Handle text delta events (actual response text)
        if (event.type === 'content_block_delta') {
          const delta = event.delta;
          // Check if this is a text delta (not input_json_delta or other types)
          if ('text' in delta && delta.type === 'text_delta') {
            const text = delta.text;
            fullText += text;

            // Invoke the onText callback if provided
            if (callbacks.onText) {
              callbacks.onText(text);
            }
          }
        }
      }

      // Stream complete, invoke onComplete callback
      if (callbacks.onComplete) {
        callbacks.onComplete(fullText);
      }
    } catch (error) {
      const llmError = this.handleError(error);

      // Invoke onError callback if provided
      if (callbacks.onError) {
        callbacks.onError(llmError);
      } else {
        // If no error callback, throw the error
        throw llmError;
      }
    }
  }

  /**
   * Estimates the number of tokens in a string.
   * This is an approximation based on character count, not exact tokenization.
   * Use this for rough estimates before making API calls.
   *
   * The estimation uses a ratio of ~4 characters per token, which is
   * a reasonable approximation for English text with Claude models.
   *
   * @param text - The text to estimate tokens for
   * @returns Estimated token count
   *
   * @example
   * ```typescript
   * const tokens = client.estimateTokens('Hello, world!');
   * console.log(`Approximately ${tokens} tokens`);
   * ```
   */
  estimateTokens(text: string): number {
    // Claude models use roughly 4 characters per token for English text
    // This is a rough approximation - actual tokenization varies
    const CHARS_PER_TOKEN = 4;
    return Math.ceil(text.length / CHARS_PER_TOKEN);
  }

  /**
   * Estimates token count for a conversation.
   * Includes both message content and approximate overhead for message structure.
   *
   * @param messages - Array of messages to estimate
   * @param systemPrompt - Optional system prompt to include in estimate
   * @returns Estimated total token count
   */
  estimateConversationTokens(
    messages: LLMMessage[],
    systemPrompt?: string
  ): number {
    let total = 0;

    // Add tokens for system prompt if present
    if (systemPrompt) {
      total += this.estimateTokens(systemPrompt);
    }

    // Add tokens for each message (content + small overhead for role/structure)
    const MESSAGE_OVERHEAD = 4; // Approximate overhead per message
    for (const message of messages) {
      total += this.estimateTokens(message.content) + MESSAGE_OVERHEAD;
    }

    return total;
  }

  /**
   * Normalizes input to always return an array of messages.
   * Converts a single string to a user message array.
   *
   * @param input - String or message array
   * @returns Normalized message array
   */
  private normalizeMessages(input: string | LLMMessage[]): LLMMessage[] {
    if (typeof input === 'string') {
      return [{ role: 'user', content: input }];
    }
    return input;
  }

  /**
   * Formats messages for the Anthropic API.
   * Converts our LLMMessage format to the SDK's MessageParam format.
   *
   * @param messages - Array of LLMMessage objects
   * @returns Array of MessageParam objects for the API
   */
  private formatMessages(messages: LLMMessage[]): MessageParam[] {
    return messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
  }

  /**
   * Merges provided config with defaults.
   *
   * @param config - Partial config from the user
   * @returns Complete config with all required fields
   */
  private mergeConfig(config: LLMConfig): Required<LLMConfig> {
    return {
      model: config.model ?? this.defaultConfig.model,
      maxTokens: config.maxTokens ?? this.defaultConfig.maxTokens,
      temperature: config.temperature ?? this.defaultConfig.temperature,
    };
  }

  /**
   * Extracts text content from response content blocks.
   * Handles the case where response contains multiple content blocks.
   *
   * @param content - Array of content blocks from the API response
   * @returns Concatenated text from all text blocks
   */
  private extractText(
    content: Anthropic.Messages.ContentBlock[]
  ): string {
    return content
      .filter((block): block is Anthropic.Messages.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');
  }

  /**
   * Converts an API error to a typed LLMError.
   * Maps Anthropic SDK error types to our simplified error types.
   *
   * @param error - The error caught from the API call
   * @returns LLMError with appropriate type and message
   */
  private handleError(error: unknown): LLMError {
    // Handle timeout errors (must check before APIConnectionError since it extends it)
    if (error instanceof APIConnectionTimeoutError) {
      return new LLMError(
        'Request to Anthropic API timed out. Please try again.',
        'timeout',
        error
      );
    }

    // Handle network errors
    if (error instanceof APIConnectionError) {
      return new LLMError(
        'Failed to connect to Anthropic API. Please check your network connection.',
        'network',
        error
      );
    }

    // Handle Anthropic SDK-specific errors
    if (error instanceof APIError) {
      const errorType = this.mapErrorType(error);
      return new LLMError(error.message, errorType, error);
    }

    // Handle unknown errors
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return new LLMError(message, 'unknown', error instanceof Error ? error : undefined);
  }

  /**
   * Maps an Anthropic API error to our simplified error type.
   *
   * @param error - The Anthropic APIError
   * @returns The corresponding LLMErrorType
   */
  private mapErrorType(error: APIError): LLMErrorType {
    if (error instanceof AuthenticationError) {
      return 'authentication';
    }
    if (error instanceof RateLimitError) {
      return 'rate_limit';
    }
    if (error instanceof BadRequestError) {
      return 'invalid_request';
    }
    if (error instanceof InternalServerError) {
      return 'server_error';
    }
    return 'unknown';
  }
}
