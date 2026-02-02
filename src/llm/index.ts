/**
 * LLM Module - Barrel Export
 *
 * This module provides an abstraction layer over the Anthropic SDK for
 * making LLM API calls. It includes:
 * - AnthropicClient: Main client class for making API calls
 * - Type definitions for messages, configs, and responses
 * - Custom error types for better error handling
 * - Prompt builders for Socratic tutoring and recall evaluation
 *
 * @example
 * ```typescript
 * import {
 *   AnthropicClient,
 *   LLMError,
 *   buildSocraticTutorPrompt,
 *   buildRecallEvaluatorPrompt,
 * } from './llm';
 *
 * const client = new AnthropicClient();
 *
 * // Set up Socratic tutor with built prompt
 * const tutorPrompt = buildSocraticTutorPrompt({
 *   recallSet,
 *   targetPoints,
 *   currentPointIndex: 0,
 * });
 * client.setSystemPrompt(tutorPrompt);
 *
 * // Non-streaming
 * const response = await client.complete('What is machine learning?');
 *
 * // Streaming
 * await client.stream('Explain neural networks', {
 *   onText: (chunk) => process.stdout.write(chunk),
 *   onComplete: (full) => console.log('\nDone!')
 * });
 * ```
 */

// Re-export the main client class
export { AnthropicClient } from './client';

// Re-export all types for external use
export type {
  LLMMessage,
  LLMConfig,
  StreamCallbacks,
  LLMResponse,
  LLMErrorType,
} from './types';

// Re-export the error class (needs to be a value export, not just type)
export { LLMError } from './types';

// Re-export prompt builders and types for Socratic tutoring and recall evaluation
export {
  buildSocraticTutorPrompt,
  buildRecallEvaluatorPrompt,
  buildRecallEvaluatorSystemPrompt,
  buildRecallEvaluatorUserMessage,
  parseRecallEvaluationResponse,
  type SocraticTutorPromptParams,
  type RecallEvaluationResult,
} from './prompts';
