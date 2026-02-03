/**
 * Recall Scoring Types
 *
 * This module defines the types used for evaluating whether a user has
 * successfully demonstrated recall of information during a Socratic dialogue.
 *
 * The evaluation system uses an LLM to assess recall quality, taking into account:
 * - Semantic understanding (not just verbatim matching)
 * - Guided discovery (hints are acceptable, but not full answers)
 * - Context-appropriate recall (focus on critical information)
 *
 * These types are designed to integrate with the FSRS scheduling system,
 * where the success/confidence scores influence future review timing.
 *
 * Two evaluation modes are supported:
 * 1. **Basic evaluation** (RecallEvaluation): Simple success/confidence/reasoning
 *    Used for backward compatibility with Phase 1.
 * 2. **Enhanced evaluation** (EnhancedRecallEvaluation): Detailed analysis with
 *    demonstrated/missed concepts and suggested FSRS rating. Used for Phase 2+.
 */

import type { RecallRating } from '../fsrs/types';

/**
 * Result of evaluating a user's recall attempt during a Socratic dialogue.
 *
 * The LLM analyzes the conversation to determine if the user successfully
 * demonstrated recall of the target information. This evaluation feeds into
 * the FSRS scheduling algorithm to optimize future review intervals.
 *
 * @example
 * ```typescript
 * const evaluation: RecallEvaluation = {
 *   success: true,
 *   confidence: 0.85,
 *   reasoning: 'The learner correctly identified the key date and significance of the Treaty of Versailles, though with minor assistance on the specific terms.'
 * };
 *
 * if (evaluation.success && evaluation.confidence > 0.7) {
 *   // High-confidence success: increase FSRS interval significantly
 * } else if (evaluation.success) {
 *   // Lower-confidence success: moderate interval increase
 * }
 * ```
 */
export interface RecallEvaluation {
  /**
   * Whether the learner successfully demonstrated recall of the target content.
   *
   * True indicates the user recalled the essential information, even if:
   * - They paraphrased or used different wording
   * - They received some hints to jog their memory
   * - They demonstrated understanding rather than verbatim recall
   *
   * False indicates:
   * - The user could not recall the information
   * - They provided incorrect or contradictory information
   * - The tutor had to essentially provide the answer
   */
  success: boolean;

  /**
   * Confidence level in the evaluation, ranging from 0.0 to 1.0.
   *
   * This score reflects the evaluator's certainty about the success/failure
   * determination. It can be used to:
   * - Adjust FSRS difficulty parameters (low confidence = less adjustment)
   * - Flag evaluations for human review
   * - Identify ambiguous recall points that may need refinement
   *
   * Score ranges:
   * - 0.9 - 1.0: Very certain (clear success or failure)
   * - 0.7 - 0.9: Confident with minor ambiguity
   * - 0.5 - 0.7: Moderate uncertainty, borderline case
   * - Below 0.5: Significant uncertainty, evaluation may be unreliable
   */
  confidence: number;

  /**
   * Human-readable explanation of the evaluation reasoning.
   *
   * This provides transparency into why the evaluation reached its conclusion,
   * which is useful for:
   * - Debugging unexpected evaluations
   * - Showing learners why they succeeded or failed
   * - Reviewing and improving recall point clarity
   *
   * Typically 1-3 sentences describing what was recalled, what was missed,
   * and the key factors in the decision.
   */
  reasoning: string;
}

/**
 * Enhanced result of evaluating a user's recall attempt with detailed concept analysis.
 *
 * This extended evaluation provides more nuanced feedback than the basic RecallEvaluation,
 * including:
 * - Which specific concepts the user demonstrated understanding of
 * - Which concepts were missed or incorrectly recalled
 * - A suggested FSRS rating based on the quality of recall
 *
 * The enhanced evaluation is designed to support:
 * - More accurate FSRS scheduling through suggested ratings
 * - Better feedback to learners about their recall quality
 * - Analytics on which concepts are consistently difficult
 * - Partial recall scenarios where some concepts are remembered but not others
 *
 * @example
 * ```typescript
 * const evaluation: EnhancedRecallEvaluation = {
 *   success: true,
 *   confidence: 0.75,
 *   reasoning: 'The learner recalled the main date and significance but missed the specific treaty terms.',
 *   keyDemonstratedConcepts: ['signing date', 'historical significance', 'participating nations'],
 *   missedConcepts: ['specific treaty terms', 'war reparations amount'],
 *   suggestedRating: 'good'
 * };
 *
 * // Use suggested rating for FSRS scheduling
 * scheduler.recordReview(recallPoint, evaluation.suggestedRating);
 *
 * // Show learner which concepts to focus on
 * console.log(`You got these right: ${evaluation.keyDemonstratedConcepts.join(', ')}`);
 * console.log(`Consider reviewing: ${evaluation.missedConcepts.join(', ')}`);
 * ```
 */
export interface EnhancedRecallEvaluation {
  /**
   * Whether the learner successfully demonstrated recall of the target content.
   *
   * This is the primary success indicator, similar to RecallEvaluation.success.
   * A value of true indicates the user recalled the essential information,
   * even if some minor concepts were missed.
   */
  success: boolean;

  /**
   * Confidence level in the evaluation, ranging from 0.0 to 1.0.
   *
   * This score reflects both the evaluator's certainty and the quality of recall:
   * - 0.85 - 1.0: Effortless recall with high certainty (maps to 'easy')
   * - 0.6 - 0.85: Solid recall with good understanding (maps to 'good')
   * - 0.3 - 0.6: Partial recall with effort required (maps to 'hard')
   * - 0.0 - 0.3: Major concepts missing or incorrect (maps to 'forgot')
   *
   * The confidence directly influences the suggestedRating.
   */
  confidence: number;

  /**
   * Detailed human-readable explanation of the evaluation reasoning.
   *
   * More detailed than the basic RecallEvaluation.reasoning, this field provides:
   * - What the user got right and how they demonstrated understanding
   * - What was missed and why it matters
   * - How much guidance was needed
   * - Justification for the suggested rating
   */
  reasoning: string;

  /**
   * List of key concepts the user successfully demonstrated understanding of.
   *
   * These are specific concepts, facts, or ideas from the recall target that
   * the user correctly recalled or demonstrated understanding of during the
   * Socratic dialogue. Useful for:
   * - Positive reinforcement to the learner
   * - Tracking which concepts are well-retained
   * - Informing partial-credit calculations
   *
   * @example ['signing date of 1919', 'role of France in negotiations', 'impact on Germany']
   */
  keyDemonstratedConcepts: string[];

  /**
   * List of concepts the user missed or got wrong.
   *
   * These are specific concepts, facts, or ideas from the recall target that
   * the user failed to recall, got wrong, or required too much help to reach.
   * Useful for:
   * - Targeted feedback to the learner
   * - Identifying knowledge gaps
   * - Prioritizing future review focus
   *
   * @example ['specific reparations amount', 'Article 231 war guilt clause']
   */
  missedConcepts: string[];

  /**
   * Suggested FSRS rating based on the quality of recall.
   *
   * This rating is derived from the confidence score and the evaluation context:
   * - 'forgot' (0.0 - 0.3 confidence): Major concepts missing, complete failure
   * - 'hard' (0.3 - 0.6 confidence): Partial recall with significant effort
   * - 'good' (0.6 - 0.85 confidence): Solid recall, normal retention
   * - 'easy' (0.85 - 1.0 confidence): Effortless, perfect recall
   *
   * The application can use this suggestion directly or let the user override it
   * based on their subjective experience of the recall difficulty.
   */
  suggestedRating: RecallRating;
}
