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
 *
 * 6. **Enhanced evaluation** (Phase 2+): The enhanced prompt provides detailed
 *    concept-level analysis, identifying what was demonstrated vs. missed,
 *    and suggests an appropriate FSRS rating based on recall quality.
 */

import type { RecallRating } from '../../core/fsrs/types';

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

// ============================================================================
// Enhanced Evaluation Types and Functions (Phase 2+)
// ============================================================================

/**
 * Extended response structure for enhanced recall evaluation.
 *
 * This interface defines the JSON schema that the LLM should return when using
 * the enhanced evaluation prompt. It includes detailed concept-level analysis
 * and a suggested FSRS rating.
 */
export interface EnhancedRecallEvaluationResult {
  /**
   * Whether the learner successfully demonstrated recall of the target content.
   * True means they recalled the essential information, even if not verbatim.
   */
  success: boolean;

  /**
   * Confidence level in the evaluation (0.0 to 1.0).
   *
   * This score reflects both evaluation certainty and recall quality:
   * - 0.85 - 1.0: Effortless recall (maps to 'easy')
   * - 0.6 - 0.85: Solid recall (maps to 'good')
   * - 0.3 - 0.6: Partial recall with effort (maps to 'hard')
   * - 0.0 - 0.3: Major concepts missing (maps to 'forgot')
   */
  confidence: number;

  /**
   * Detailed human-readable explanation of the evaluation reasoning.
   * Should describe what was recalled, what was missed, and justify the rating.
   */
  reasoning: string;

  /**
   * List of key concepts the user successfully demonstrated understanding of.
   * These are specific facts, ideas, or concepts from the target content.
   */
  keyDemonstratedConcepts: string[];

  /**
   * List of concepts the user missed or got wrong.
   * These are specific facts, ideas, or concepts the user failed to recall.
   */
  missedConcepts: string[];

  /**
   * Suggested FSRS rating based on the quality of recall.
   * One of: 'forgot', 'hard', 'good', 'easy'
   */
  suggestedRating: RecallRating;
}

/**
 * Optional session context for enhanced evaluation.
 *
 * Providing session context helps the evaluator make more consistent
 * judgments across the session, considering previous interactions and
 * the learner's overall performance pattern.
 */
export interface EnhancedEvaluationContext {
  /**
   * Number of recall attempts made in this session so far.
   * Helps calibrate expectations (first attempts may be rougher).
   */
  attemptNumber?: number;

  /**
   * How many recall points have been successfully completed this session.
   * Provides context about the learner's session performance.
   */
  previousSuccesses?: number;

  /**
   * How many recall points have been failed this session.
   * Helps identify if the learner is struggling overall.
   */
  previousFailures?: number;

  /**
   * Optional topic or domain for the recall content.
   * Helps the evaluator understand the subject matter context.
   */
  topic?: string;
}

/**
 * Builds an enhanced prompt for detailed recall evaluation with concept analysis.
 *
 * This prompt instructs the evaluator to:
 * 1. Analyze the conversation for demonstrated concepts
 * 2. Identify missed concepts from the target content
 * 3. Calculate a confidence score reflecting recall quality
 * 4. Suggest an appropriate FSRS rating based on performance
 *
 * The enhanced evaluation provides more actionable feedback than the basic
 * evaluation, enabling better FSRS scheduling and learner feedback.
 *
 * @param recallPointContent - The target content the learner should have recalled
 * @param conversationExcerpt - The relevant portion of the Socratic dialogue
 * @param context - Optional session context for more consistent evaluation
 * @returns A complete prompt string for enhanced recall evaluation
 *
 * @example
 * ```typescript
 * const prompt = buildEnhancedRecallEvaluatorPrompt(
 *   'The Treaty of Versailles was signed on June 28, 1919, imposing reparations on Germany.',
 *   '[Conversation between tutor and learner about WWI treaties...]',
 *   { attemptNumber: 2, previousSuccesses: 1, topic: 'World War I History' }
 * );
 * const response = await client.complete(prompt);
 * const result = parseEnhancedRecallEvaluationResponse(response.text);
 * ```
 */
export function buildEnhancedRecallEvaluatorPrompt(
  recallPointContent: string,
  conversationExcerpt: string,
  context?: EnhancedEvaluationContext
): string {
  // Handle edge cases with graceful degradation
  const safeContent = sanitizeInput(recallPointContent);
  const safeConversation = sanitizeInput(conversationExcerpt);

  // Build optional context section if provided
  const contextSection = context
    ? buildContextSection(context)
    : '';

  // Build the complete enhanced evaluation prompt
  return `You are an expert evaluator assessing whether a learner has successfully recalled specific information during a Socratic dialogue session. You provide detailed, concept-level analysis of recall quality.

## Your Task

Analyze the conversation excerpt and provide a detailed evaluation of the learner's recall performance, including:
1. Whether they successfully recalled the target information
2. Which specific concepts they demonstrated understanding of
3. Which concepts they missed or got wrong
4. A suggested FSRS (spaced repetition) rating for scheduling
${contextSection}
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

## Confidence Score and FSRS Rating Guidelines

Your confidence score should reflect the quality of recall and map to FSRS ratings:

| Confidence Range | Rating   | Description |
|------------------|----------|-------------|
| 0.85 - 1.0       | 'easy'   | Effortless recall, immediate and accurate |
| 0.6 - 0.85       | 'good'   | Solid recall, perhaps with minor prompting |
| 0.3 - 0.6        | 'hard'   | Partial recall, required significant effort or hints |
| 0.0 - 0.3        | 'forgot' | Major concepts missing, failed to recall |

**When determining concepts:**
- keyDemonstratedConcepts: List specific facts, ideas, or terms the learner correctly recalled
- missedConcepts: List specific facts, ideas, or terms the learner failed to recall or got wrong
- Keep each concept description brief but specific (e.g., "signing date of 1919" not just "date")

## Response Format

You MUST respond with ONLY a valid JSON object in this exact format:

\`\`\`json
{
  "success": boolean,
  "confidence": number,
  "reasoning": "string",
  "keyDemonstratedConcepts": ["concept1", "concept2"],
  "missedConcepts": ["concept3"],
  "suggestedRating": "forgot" | "hard" | "good" | "easy"
}
\`\`\`

Where:
- \`success\`: true if the learner successfully recalled the essential information, false otherwise
- \`confidence\`: a number from 0.0 to 1.0 reflecting recall quality (see table above)
- \`reasoning\`: A detailed explanation (2-4 sentences) of what was recalled, what was missed, and why you assigned this rating
- \`keyDemonstratedConcepts\`: Array of specific concepts the learner demonstrated (can be empty)
- \`missedConcepts\`: Array of specific concepts the learner missed (can be empty)
- \`suggestedRating\`: One of 'forgot', 'hard', 'good', or 'easy' based on confidence range

**Important:** Return ONLY the JSON object. Do not include any other text, explanations, or markdown formatting outside the JSON.`;
}

/**
 * Builds the context section for the enhanced evaluation prompt.
 *
 * This helper formats optional session context into a readable prompt section
 * that helps the evaluator make more consistent judgments.
 *
 * @param context - The session context to format
 * @returns Formatted context section string
 */
function buildContextSection(context: EnhancedEvaluationContext): string {
  const parts: string[] = [];

  if (context.topic) {
    parts.push(`- Topic/Domain: ${context.topic}`);
  }

  if (context.attemptNumber !== undefined) {
    parts.push(`- This is recall attempt #${context.attemptNumber} in this session`);
  }

  if (context.previousSuccesses !== undefined || context.previousFailures !== undefined) {
    const successes = context.previousSuccesses ?? 0;
    const failures = context.previousFailures ?? 0;
    parts.push(`- Session performance so far: ${successes} successful, ${failures} failed`);
  }

  if (parts.length === 0) {
    return '';
  }

  return `
## Session Context

${parts.join('\n')}
`;
}

/**
 * Parses the LLM response into a structured EnhancedRecallEvaluationResult.
 *
 * This utility function handles common response variations:
 * - JSON wrapped in markdown code blocks
 * - Extra whitespace or text around the JSON
 * - Missing or invalid fields
 * - Invalid suggestedRating values
 *
 * @param response - The raw LLM response text
 * @returns Parsed enhanced evaluation result, or a default failure result if parsing fails
 *
 * @example
 * ```typescript
 * const response = await client.complete(prompt);
 * const result = parseEnhancedRecallEvaluationResponse(response.text);
 * if (result.success) {
 *   console.log(`Rating: ${result.suggestedRating}`);
 *   console.log(`Demonstrated: ${result.keyDemonstratedConcepts.join(', ')}`);
 * }
 * ```
 */
export function parseEnhancedRecallEvaluationResponse(
  response: string
): EnhancedRecallEvaluationResult {
  // Default result for parse failures - fail-safe with low confidence
  const defaultResult: EnhancedRecallEvaluationResult = {
    success: false,
    confidence: 0,
    reasoning: 'Failed to parse enhanced evaluation response',
    keyDemonstratedConcepts: [],
    missedConcepts: [],
    suggestedRating: 'forgot',
  };

  if (!response || typeof response !== 'string') {
    return defaultResult;
  }

  try {
    // Try to extract JSON from various formats the LLM might return
    const jsonString = extractJsonFromResponse(response);
    const parsed = JSON.parse(jsonString);

    // Normalize and validate the confidence value
    const confidence = normalizeConfidence(parsed.confidence);

    // Validate and normalize the suggested rating
    const suggestedRating = normalizeSuggestedRating(
      parsed.suggestedRating,
      confidence
    );

    // Validate and normalize concept arrays
    const keyDemonstratedConcepts = normalizeConceptArray(
      parsed.keyDemonstratedConcepts
    );
    const missedConcepts = normalizeConceptArray(parsed.missedConcepts);

    return {
      success: typeof parsed.success === 'boolean' ? parsed.success : false,
      confidence,
      reasoning:
        typeof parsed.reasoning === 'string'
          ? parsed.reasoning
          : 'No reasoning provided',
      keyDemonstratedConcepts,
      missedConcepts,
      suggestedRating,
    };
  } catch {
    // JSON parse failed - return default
    return {
      ...defaultResult,
      reasoning: `Failed to parse enhanced evaluation response: ${response.substring(0, 100)}...`,
    };
  }
}

/**
 * Extracts JSON from various response formats.
 *
 * Handles responses where JSON might be:
 * - In a markdown code block
 * - Surrounded by extra text
 * - Raw JSON
 *
 * @param response - The raw response string
 * @returns Extracted JSON string
 */
function extractJsonFromResponse(response: string): string {
  // First, try to find JSON in a code block
  const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonString = codeBlockMatch ? codeBlockMatch[1].trim() : response.trim();

  // If still not valid JSON, try to find the first { to last }
  if (!jsonString.startsWith('{')) {
    const startIdx = jsonString.indexOf('{');
    const endIdx = jsonString.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      return jsonString.substring(startIdx, endIdx + 1);
    }
  }

  return jsonString;
}

/**
 * Normalizes the suggested FSRS rating.
 *
 * Validates that the rating is one of the valid RecallRating values.
 * If invalid, derives an appropriate rating from the confidence score.
 *
 * @param value - The raw rating value from the LLM
 * @param confidence - The normalized confidence score (used as fallback)
 * @returns A valid RecallRating
 */
function normalizeSuggestedRating(
  value: unknown,
  confidence: number
): RecallRating {
  // Valid rating values
  const validRatings: RecallRating[] = ['forgot', 'hard', 'good', 'easy'];

  // If the value is a valid rating string, use it
  if (typeof value === 'string' && validRatings.includes(value as RecallRating)) {
    return value as RecallRating;
  }

  // Otherwise, derive rating from confidence score
  // This ensures we always have a valid rating even if the LLM returns garbage
  return deriveRatingFromConfidence(confidence);
}

/**
 * Derives an FSRS rating from a confidence score.
 *
 * Uses the confidence thresholds defined in the task:
 * - 0.85 - 1.0: 'easy'
 * - 0.6 - 0.85: 'good'
 * - 0.3 - 0.6: 'hard'
 * - 0.0 - 0.3: 'forgot'
 *
 * @param confidence - The confidence score (0.0 to 1.0)
 * @returns The corresponding RecallRating
 */
export function deriveRatingFromConfidence(confidence: number): RecallRating {
  if (confidence >= 0.85) {
    return 'easy';
  } else if (confidence >= 0.6) {
    return 'good';
  } else if (confidence >= 0.3) {
    return 'hard';
  } else {
    return 'forgot';
  }
}

/**
 * Normalizes a concept array from LLM response.
 *
 * Ensures the result is always an array of strings, handling:
 * - Non-array values (returns empty array)
 * - Arrays with non-string elements (filters them out)
 * - Empty arrays (returns empty array)
 *
 * @param value - The raw concept array from the LLM
 * @returns A normalized array of concept strings
 */
function normalizeConceptArray(value: unknown): string[] {
  // Return empty array for non-array values
  if (!Array.isArray(value)) {
    return [];
  }

  // Filter to only valid string elements and trim whitespace
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}
