/**
 * Recall Evaluator
 *
 * This module provides the RecallEvaluator class, which uses an LLM to assess
 * whether a user has successfully demonstrated recall of a specific piece of
 * information during a Socratic dialogue session.
 *
 * Key design principles:
 *
 * 1. **Semantic evaluation**: The evaluator looks for understanding, not verbatim
 *    matching. Paraphrased answers that convey the correct meaning are accepted.
 *
 * 2. **Conversation context**: The evaluator considers the flow of dialogue,
 *    including how much guidance the user needed to arrive at the answer.
 *
 * 3. **Consistent evaluation**: Uses low temperature (0.3) to ensure reproducible
 *    and consistent evaluations across similar recall attempts.
 *
 * 4. **Graceful degradation**: Handles LLM failures and malformed responses with
 *    sensible defaults, ensuring the application remains functional.
 *
 * Usage:
 * ```typescript
 * const evaluator = new RecallEvaluator(anthropicClient);
 * const result = await evaluator.evaluate(recallPoint, sessionMessages);
 *
 * if (result.success) {
 *   // Update FSRS with successful recall
 * } else {
 *   // Schedule for earlier review
 * }
 * ```
 */

import { AnthropicClient } from '../../llm/client';
import {
  buildRecallEvaluatorPrompt,
  parseRecallEvaluationResponse,
} from '../../llm/prompts';
import type { RecallPoint, SessionMessage } from '../models';
import type { RecallEvaluation } from './types';

/**
 * Default number of recent messages to include in the conversation excerpt.
 * This balances providing enough context for accurate evaluation while
 * keeping token usage reasonable.
 */
const DEFAULT_EXCERPT_SIZE = 10;

/**
 * Temperature setting for evaluation LLM calls.
 * Low temperature (0.3) ensures more deterministic and consistent evaluations,
 * which is important for fair and reproducible recall assessment.
 */
const EVALUATION_TEMPERATURE = 0.3;

/**
 * Maximum tokens for evaluation response.
 * The evaluation response is structured JSON, so we don't need many tokens.
 * This keeps costs low and responses fast.
 */
const EVALUATION_MAX_TOKENS = 512;

/**
 * Evaluates whether a user has successfully demonstrated recall of information
 * during a Socratic dialogue session.
 *
 * The evaluator:
 * 1. Extracts relevant conversation context from the session
 * 2. Builds a structured evaluation prompt
 * 3. Calls the LLM with low temperature for consistency
 * 4. Parses and validates the evaluation response
 *
 * @example
 * ```typescript
 * const client = new AnthropicClient();
 * const evaluator = new RecallEvaluator(client);
 *
 * const evaluation = await evaluator.evaluate(recallPoint, messages);
 * console.log(`Success: ${evaluation.success}, Confidence: ${evaluation.confidence}`);
 * console.log(`Reasoning: ${evaluation.reasoning}`);
 * ```
 */
export class RecallEvaluator {
  /** The LLM client used to perform evaluations */
  private llmClient: AnthropicClient;

  /**
   * Creates a new RecallEvaluator instance.
   *
   * @param llmClient - An initialized AnthropicClient for making LLM calls
   *
   * @example
   * ```typescript
   * const client = new AnthropicClient({ temperature: 0.5 });
   * const evaluator = new RecallEvaluator(client);
   * ```
   */
  constructor(llmClient: AnthropicClient) {
    this.llmClient = llmClient;
  }

  /**
   * Extracts a relevant conversation excerpt for evaluation.
   *
   * Takes the most recent N messages from the conversation, as these
   * typically contain the recall attempt and any guiding dialogue.
   * Older messages (beyond the excerpt window) are assumed to be
   * context-setting or unrelated to the current recall evaluation.
   *
   * The messages are formatted with clear role labels (USER/ASSISTANT/SYSTEM)
   * to help the evaluator understand the conversation flow.
   *
   * @param messages - The full array of session messages
   * @param maxMessages - Maximum number of recent messages to include (default: 10)
   * @returns A formatted string representing the conversation excerpt
   *
   * @example
   * ```typescript
   * // With 15 messages total, extracts last 10
   * const excerpt = this.extractExcerpt(messages, 10);
   * // Result:
   * // "ASSISTANT: Can you tell me about the Treaty of Versailles?
   * //
   * //  USER: It was signed after World War I...
   * //
   * //  ASSISTANT: Good! What was the specific date?"
   * ```
   */
  private extractExcerpt(
    messages: SessionMessage[],
    maxMessages: number = DEFAULT_EXCERPT_SIZE
  ): string {
    // Take only the most recent messages to focus on the relevant recall attempt
    // Older messages may be setup/context that isn't directly relevant to evaluation
    const recentMessages = messages.slice(-maxMessages);

    // Format each message with its role clearly labeled
    // The double newline between messages improves readability for the evaluator
    return recentMessages
      .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
      .join('\n\n');
  }

  /**
   * Evaluates whether the user successfully demonstrated recall of a point.
   *
   * This method:
   * 1. Extracts a relevant conversation excerpt (recent messages)
   * 2. Builds an evaluation prompt with the recall target and conversation
   * 3. Calls the LLM with low temperature for consistent evaluation
   * 4. Parses the JSON response with fallback handling for malformed responses
   *
   * The evaluation considers:
   * - Whether the user stated the essential information (paraphrasing OK)
   * - How much guidance was needed (some hints acceptable, full answers not)
   * - Whether understanding was demonstrated vs. just guessing
   *
   * @param recallPoint - The recall point being evaluated (contains target content)
   * @param conversationMessages - The session's message history
   * @returns Promise resolving to a RecallEvaluation with success, confidence, and reasoning
   *
   * @throws Never throws - returns a default failed evaluation on any error
   *
   * @example
   * ```typescript
   * const evaluation = await evaluator.evaluate(recallPoint, messages);
   *
   * if (evaluation.success) {
   *   console.log('User recalled the information!');
   *   console.log(`Confidence: ${evaluation.confidence}`);
   * } else {
   *   console.log('User did not recall:', evaluation.reasoning);
   * }
   * ```
   */
  async evaluate(
    recallPoint: RecallPoint,
    conversationMessages: SessionMessage[]
  ): Promise<RecallEvaluation> {
    // Step 1: Extract relevant conversation context
    // We use the recent messages to focus on the actual recall attempt
    // rather than initial session setup or unrelated discussion
    const conversationExcerpt = this.extractExcerpt(conversationMessages);

    // Step 2: Build the evaluation prompt
    // The prompt includes the target content and conversation excerpt
    // with clear instructions for semantic evaluation
    const evaluationPrompt = buildRecallEvaluatorPrompt(
      recallPoint.content,
      conversationExcerpt
    );

    try {
      // Step 3: Call the LLM with low temperature for consistent evaluation
      // We use a dedicated temperature and max tokens for evaluation calls
      // to ensure reproducible results and efficient token usage
      const response = await this.llmClient.complete(evaluationPrompt, {
        temperature: EVALUATION_TEMPERATURE,
        maxTokens: EVALUATION_MAX_TOKENS,
      });

      // Step 4: Parse the JSON response
      // The parseRecallEvaluationResponse utility handles:
      // - JSON wrapped in markdown code blocks
      // - Extra text around the JSON
      // - Missing or invalid fields
      // It returns a default failure result if parsing fails
      const parsedResult = parseRecallEvaluationResponse(response.text);

      // Convert the prompt's result type to our scoring module's type
      // (They have the same shape but are defined in different modules)
      return {
        success: parsedResult.success,
        confidence: parsedResult.confidence,
        reasoning: parsedResult.reasoning,
      };
    } catch (error) {
      // Step 5: Handle any errors gracefully
      // On failure, return a default evaluation with success=false and 0 confidence
      // This ensures the application can continue functioning even if the LLM fails
      // The low confidence signals that this evaluation should not heavily influence FSRS
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      return {
        success: false,
        confidence: 0,
        reasoning: `Evaluation failed due to an error: ${errorMessage}`,
      };
    }
  }
}
