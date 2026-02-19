/**
 * LLM Prompts Module - Barrel Export
 *
 * This module provides prompt builders for the Contextual Clarity application's
 * AI-powered learning features. These prompts guide the LLM's behavior during:
 *
 * 1. **Socratic Recall Discussions**: Interactive dialogues where the AI helps
 *    learners recall information through thoughtful questioning rather than
 *    direct answers.
 *
 * 2. **Recall Evaluation**: Automated assessment of whether a learner has
 *    successfully demonstrated recall of target information.
 *
 * @example
 * ```typescript
 * import {
 *   buildSocraticTutorPrompt,
 *   buildRecallEvaluatorPrompt,
 *   parseRecallEvaluationResponse,
 * } from '@/llm/prompts';
 *
 * // Set up Socratic tutor
 * const tutorPrompt = buildSocraticTutorPrompt({
 *   recallSet,
 *   targetPoints,
 *   uncheckedPoints: targetPoints,
 *   currentProbePoint: targetPoints[0],
 * });
 * client.setSystemPrompt(tutorPrompt);
 *
 * // Later, evaluate recall success
 * const evalPrompt = buildRecallEvaluatorPrompt(pointContent, conversation);
 * const response = await client.complete(evalPrompt);
 * const result = parseRecallEvaluationResponse(response.text);
 * ```
 */

// Socratic tutor prompt builder and types
export {
  buildSocraticTutorPrompt,
  type SocraticTutorPromptParams,
} from './socratic-tutor';

// Recall evaluator prompt builder, types, and utilities
export {
  buildRecallEvaluatorPrompt,
  buildRecallEvaluatorSystemPrompt,
  buildRecallEvaluatorUserMessage,
  parseRecallEvaluationResponse,
  type RecallEvaluationResult,
  // Enhanced evaluation exports (Phase 2+)
  buildEnhancedRecallEvaluatorPrompt,
  parseEnhancedRecallEvaluationResponse,
  deriveRatingFromConfidence,
  type EnhancedRecallEvaluationResult,
  type EnhancedEvaluationContext,
} from './recall-evaluator';

// Rabbithole detector prompt builders, types, and utilities
export {
  buildRabbitholeDetectorPrompt,
  buildRabbitholeReturnPrompt,
  parseRabbitholeDetectionResponse,
  parseRabbitholeReturnResponse,
  type RabbitholeDetectionResult,
  type RabbitholeDetectorParams,
  type RabbitholeReturnResult,
} from './rabbithole-detector';
