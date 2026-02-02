/**
 * Core Scoring Module - Barrel Export
 *
 * This module provides recall evaluation functionality for the Contextual Clarity
 * learning application. It uses an LLM to assess whether users have successfully
 * demonstrated recall of information during Socratic dialogue sessions.
 *
 * The evaluation results integrate with the FSRS (Free Spaced Repetition Scheduler)
 * algorithm to optimize review intervals based on actual recall performance.
 *
 * @example
 * ```typescript
 * import { RecallEvaluator, type RecallEvaluation } from '@/core/scoring';
 * import { AnthropicClient } from '@/llm/client';
 *
 * // Create the evaluator with an LLM client
 * const client = new AnthropicClient();
 * const evaluator = new RecallEvaluator(client);
 *
 * // Evaluate a recall attempt
 * const evaluation: RecallEvaluation = await evaluator.evaluate(
 *   recallPoint,
 *   sessionMessages
 * );
 *
 * if (evaluation.success) {
 *   // Update FSRS with successful recall
 *   // Use confidence to adjust difficulty parameter
 * }
 * ```
 */

// RecallEvaluator class - LLM-powered recall assessment
export { RecallEvaluator } from './recall-evaluator';

// Types for recall evaluation results
export type { RecallEvaluation } from './types';
