/**
 * Recall Evaluator Prompt Builder
 *
 * This module constructs the system prompt for evaluating whether a learner
 * has successfully recalled a specific piece of information during a Socratic
 * dialogue session.
 *
 * Key design decisions:
 *
 * 1. **Structured output**: The evaluator is instructed to return JSON in a
 *    specific format, making it easy to parse programmatically. This allows
 *    for consistent handling of evaluation results.
 *
 * 2. **Confidence scoring**: Beyond binary success/failure, the evaluator
 *    provides a confidence score (0-1). This nuance helps the system handle
 *    edge cases and potentially adjust FSRS scheduling parameters.
 *
 * 3. **Reasoning transparency**: The evaluator must explain its reasoning,
 *    which aids debugging, allows for human review, and can be shown to
 *    learners who want to understand the assessment.
 *
 * 4. **Semantic matching**: The prompt emphasizes understanding over verbatim
 *    recall. Paraphrased answers that demonstrate understanding should be
 *    counted as successful recall.
 *
 * 5. **Conversation context**: Rather than just the final answer, the evaluator
 *    sees relevant conversation context to understand how the learner arrived
 *    at their answer (with guidance vs. independently).
 */

/**
 * Response structure expected from the recall evaluator.
 *
 * This interface defines the JSON schema that the LLM should return.
 * Applications should parse the LLM response and validate against this structure.
 */
export interface RecallEvaluationResult {
  /**
   * Whether the learner successfully demonstrated recall of the target content.
   * True means they recalled the essential information, even if not verbatim.
   */
  success: boolean;

  /**
   * Confidence level in the evaluation (0.0 to 1.0).
   *
   * High confidence (0.8-1.0): Clear success or failure, unambiguous.
   * Medium confidence (0.5-0.8): Some uncertainty, partial recall, or edge case.
   * Low confidence (0.0-0.5): Significant uncertainty, evaluation may be unreliable.
   *
   * Use cases:
   * - Low confidence evaluations might warrant human review
   * - Can influence FSRS difficulty adjustments
   * - Helps identify ambiguous recall points that need refinement
   */
  confidence: number;

  /**
   * Human-readable explanation of the evaluation reasoning.
   * Describes what the learner recalled, what they missed, and why
   * the evaluation reached its conclusion.
   */
  reasoning: string;
}

/**
 * Builds the prompt for evaluating recall success.
 *
 * The generated prompt instructs the evaluator to:
 * 1. Compare the recall point against the conversation
 * 2. Determine if essential information was recalled
 * 3. Assess confidence in the evaluation
 * 4. Provide reasoning for the decision
 *
 * @param recallPointContent - The target content the learner should have recalled
 * @param conversationExcerpt - The relevant portion of the Socratic dialogue
 * @returns A complete prompt string for the recall evaluation
 *
 * @example
 * ```typescript
 * const prompt = buildRecallEvaluatorPrompt(
 *   'The Treaty of Versailles was signed on June 28, 1919',
 *   '[Conversation between tutor and learner about WWI treaties...]'
 * );
 * const response = await client.complete(prompt);
 * const result = JSON.parse(response.text) as RecallEvaluationResult;
 * ```
 */
export function buildRecallEvaluatorPrompt(
  recallPointContent: string,
  conversationExcerpt: string
): string {
  // Handle edge cases with graceful degradation
  const safeContent = sanitizeInput(recallPointContent);
  const safeConversation = sanitizeInput(conversationExcerpt);

  // Build the complete evaluation prompt
  return `You are an expert evaluator assessing whether a learner has successfully recalled specific information during a Socratic dialogue session.

## Your Task

Analyze the conversation excerpt and determine if the learner demonstrated successful recall of the target information.

## Target Information to Recall

The learner should have recalled this information:
<recall_target>
${safeContent || '[No content provided - evaluate based on general engagement]'}
</recall_target>

## Conversation Excerpt

This is the relevant portion of the Socratic dialogue:
<conversation>
${safeConversation || '[No conversation provided - cannot evaluate]'}
</conversation>

## Evaluation Criteria

**Mark as SUCCESS if the learner:**
- Stated the essential information, even if paraphrased or reworded
- Demonstrated understanding of the core concept
- Recalled key facts, dates, names, or details from the target (when applicable)
- Arrived at the correct answer through guided discovery (hints are acceptable)

**Mark as FAILURE if the learner:**
- Could not recall the information even with significant hints
- Provided incorrect or contradictory information
- Only recalled trivial or tangential details
- Required the tutor to essentially provide the answer

**When evaluating, consider:**
- Semantic equivalence: Different words conveying the same meaning counts as success
- Partial recall: If the target has multiple parts, assess if the critical elements were recalled
- Guided recall: Some hints from the tutor are acceptable; too many hints resulting in minimal cognitive effort is not
- Context matters: The learner doesn't need to use exact terminology if they demonstrate understanding

## Response Format

You MUST respond with ONLY a valid JSON object in this exact format:

\`\`\`json
{
  "success": boolean,
  "confidence": number,
  "reasoning": "string"
}
\`\`\`

Where:
- \`success\`: true if the learner successfully recalled the information, false otherwise
- \`confidence\`: a number from 0.0 to 1.0 indicating your certainty in this evaluation
  - 0.9-1.0: Very certain (clear success or clear failure)
  - 0.7-0.9: Confident but with minor ambiguity
  - 0.5-0.7: Moderate uncertainty, borderline case
  - Below 0.5: Significant uncertainty, evaluation may be unreliable
- \`reasoning\`: A brief explanation (1-3 sentences) of why you made this evaluation

**Important:** Return ONLY the JSON object. Do not include any other text, explanations, or markdown formatting outside the JSON.`;
}

/**
 * Builds a system prompt for the recall evaluator.
 *
 * This is an alternative approach where the evaluation instructions are
 * provided as a system prompt, and the actual content to evaluate is
 * sent as a user message. This can provide better separation of concerns
 * and allows for easier reuse across multiple evaluations.
 *
 * @returns A system prompt string for the evaluator role
 */
export function buildRecallEvaluatorSystemPrompt(): string {
  return `You are a precise and fair recall evaluator for an educational application.

Your role is to assess whether a learner has successfully demonstrated recall of specific information during Socratic dialogue sessions.

## Core Principles

1. **Semantic over syntactic**: Accept paraphrased answers that convey the same meaning.
2. **Essential vs. peripheral**: Focus on whether critical information was recalled, not every minor detail.
3. **Guided recall is valid**: Hints that jog memory are acceptable; having the answer provided is not.
4. **Understanding matters**: Demonstrated comprehension is as valuable as verbatim recall.
5. **Be fair but honest**: Don't penalize for phrasing, but don't give credit for guessing.

## Your Output

Always respond with a valid JSON object containing:
- \`success\` (boolean): Whether the learner demonstrated successful recall
- \`confidence\` (number 0-1): Your certainty in this evaluation
- \`reasoning\` (string): Brief explanation of your decision

Never include anything outside the JSON object in your response.`;
}

/**
 * Builds a user message for recall evaluation when using the system prompt approach.
 *
 * @param recallPointContent - The target content the learner should have recalled
 * @param conversationExcerpt - The relevant portion of the Socratic dialogue
 * @returns A user message string for the evaluation
 */
export function buildRecallEvaluatorUserMessage(
  recallPointContent: string,
  conversationExcerpt: string
): string {
  const safeContent = sanitizeInput(recallPointContent);
  const safeConversation = sanitizeInput(conversationExcerpt);

  return `Evaluate this recall attempt:

**Target to recall:**
${safeContent || '[No content provided]'}

**Conversation excerpt:**
${safeConversation || '[No conversation provided]'}

Respond with JSON only: { "success": boolean, "confidence": number, "reasoning": "string" }`;
}

/**
 * Sanitizes input strings to prevent prompt injection and handle edge cases.
 *
 * This function:
 * - Trims whitespace
 * - Removes potential delimiter-breaking sequences
 * - Handles empty/null inputs gracefully
 *
 * @param input - The raw input string
 * @returns Sanitized string safe for prompt inclusion
 */
function sanitizeInput(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  return input
    // Basic trimming
    .trim()
    // Escape XML-like tags that might confuse the prompt structure
    .replace(/<\/(recall_target|conversation)>/gi, '&lt;/$1&gt;')
    // Escape potential JSON breaking characters in a way that preserves readability
    .replace(/```json/gi, '` ` `json')
    .replace(/```/g, '` ` `');
}

/**
 * Parses the LLM response into a structured RecallEvaluationResult.
 *
 * This utility function handles common response variations:
 * - JSON wrapped in markdown code blocks
 * - Extra whitespace or text around the JSON
 * - Missing or invalid fields
 *
 * @param response - The raw LLM response text
 * @returns Parsed evaluation result, or a default failure result if parsing fails
 *
 * @example
 * ```typescript
 * const response = await client.complete(prompt);
 * const result = parseRecallEvaluationResponse(response.text);
 * if (result.success) {
 *   // Handle successful recall
 * }
 * ```
 */
export function parseRecallEvaluationResponse(response: string): RecallEvaluationResult {
  // Default result for parse failures - fail-safe with low confidence
  const defaultResult: RecallEvaluationResult = {
    success: false,
    confidence: 0,
    reasoning: 'Failed to parse evaluation response',
  };

  if (!response || typeof response !== 'string') {
    return defaultResult;
  }

  try {
    // Try to extract JSON from various formats the LLM might return

    // First, try to find JSON in a code block
    const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonString = codeBlockMatch
      ? codeBlockMatch[1].trim()
      : response.trim();

    // If still not valid JSON, try to find the first { to last }
    let finalJsonString = jsonString;
    if (!jsonString.startsWith('{')) {
      const startIdx = jsonString.indexOf('{');
      const endIdx = jsonString.lastIndexOf('}');
      if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        finalJsonString = jsonString.substring(startIdx, endIdx + 1);
      }
    }

    const parsed = JSON.parse(finalJsonString);

    // Validate and normalize the parsed result
    return {
      success: typeof parsed.success === 'boolean' ? parsed.success : false,
      confidence: normalizeConfidence(parsed.confidence),
      reasoning: typeof parsed.reasoning === 'string'
        ? parsed.reasoning
        : 'No reasoning provided',
    };
  } catch {
    // JSON parse failed - return default
    return {
      ...defaultResult,
      reasoning: `Failed to parse evaluation response: ${response.substring(0, 100)}...`,
    };
  }
}

/**
 * Normalizes confidence values to the 0-1 range.
 *
 * Handles various input types and ensures the output is always
 * a valid number between 0 and 1.
 *
 * @param value - The raw confidence value from the LLM
 * @returns Normalized confidence between 0 and 1
 */
function normalizeConfidence(value: unknown): number {
  // Handle non-numeric values
  if (typeof value !== 'number' || isNaN(value)) {
    return 0.5; // Default to moderate confidence
  }

  // Handle percentage-style values (0-100 instead of 0-1)
  if (value > 1 && value <= 100) {
    return Math.min(1, Math.max(0, value / 100));
  }

  // Clamp to valid range
  return Math.min(1, Math.max(0, value));
}
