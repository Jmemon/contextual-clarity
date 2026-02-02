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
 */

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
