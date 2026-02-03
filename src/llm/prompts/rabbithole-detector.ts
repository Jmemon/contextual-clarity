/**
 * Rabbithole Detector Prompt Builder
 *
 * This module constructs prompts for detecting and managing conversational tangents
 * ("rabbitholes") during Socratic recall sessions. A rabbithole occurs when the
 * conversation drifts away from the current recall point into related but tangential
 * topics.
 *
 * Key design decisions:
 *
 * 1. **Depth classification**: Rabbitholes are classified by depth (1-3) based on
 *    how far the conversation has strayed from the core topic. This allows for
 *    nuanced handling - shallow tangents might be valuable context, while deep
 *    ones may require redirection.
 *
 * 2. **Relationship tracking**: The detector identifies whether a tangent relates
 *    to the current recall point or to other points in the session. This helps
 *    determine if the tangent is productive learning or pure distraction.
 *
 * 3. **Return detection**: A separate prompt detects when a rabbithole has concluded,
 *    allowing the system to resume normal recall evaluation.
 *
 * 4. **Contextual awareness**: The detector considers existing rabbitholes to avoid
 *    flagging the same tangent multiple times and to understand nesting depth.
 *
 * Use cases:
 * - Tracking when users explore interesting but off-topic areas
 * - Deciding when to gently redirect back to core material
 * - Identifying patterns in how users connect concepts
 * - Preventing conversations from becoming unproductive
 */

import type { RecallPoint, SessionMessage } from '../../core/models';

/**
 * Result of analyzing whether the conversation has entered a rabbithole.
 *
 * This interface defines the JSON schema that the LLM should return when
 * evaluating conversation tangents. The structured format enables programmatic
 * handling of rabbithole detection.
 */
export interface RabbitholeDetectionResult {
  /**
   * Whether the recent conversation represents a rabbithole (tangent from
   * the main recall point being discussed).
   */
  isRabbithole: boolean;

  /**
   * The topic of the rabbithole, if one was detected.
   * Null when isRabbithole is false.
   *
   * @example "the etymology of the word 'photosynthesis'"
   * @example "historical context of ATP discovery"
   */
  topic: string | null;

  /**
   * Depth level of the rabbithole indicating how far the conversation
   * has strayed from the core recall point.
   *
   * - 1 (shallow): Brief tangent, 1-2 exchanges, easily returnable
   * - 2 (moderate): Extended tangent, 3-5 exchanges, requires redirection
   * - 3 (deep): Significant departure, 5+ exchanges, major topic shift
   */
  depth: 1 | 2 | 3;

  /**
   * Whether the rabbithole topic is semantically related to the current
   * recall point being discussed. Related tangents may have educational
   * value even if they drift from the specific recall target.
   */
  relatedToCurrentPoint: boolean;

  /**
   * IDs of other recall points in the session that this rabbithole topic
   * relates to. Useful for identifying when tangents actually preview
   * or reinforce other session material.
   */
  relatedRecallPointIds: string[];

  /**
   * Confidence level in the rabbithole detection (0.0 to 1.0).
   *
   * High confidence (0.8-1.0): Clear tangent or clearly on-topic
   * Medium confidence (0.5-0.8): Borderline case, topic somewhat related
   * Low confidence (0.0-0.5): Unclear whether this is a tangent
   */
  confidence: number;

  /**
   * Human-readable explanation of the detection reasoning.
   * Describes why the conversation was or wasn't classified as a rabbithole.
   */
  reasoning: string;
}

/**
 * Parameters required to build a rabbithole detection prompt.
 * Provides all the context needed to assess whether the conversation
 * has drifted into a tangent.
 */
export interface RabbitholeDetectorParams {
  /**
   * Recent messages from the session conversation.
   * These are analyzed to detect topic drift from the current recall point.
   * Typically the last 5-10 messages provide sufficient context.
   */
  recentMessages: SessionMessage[];

  /**
   * The recall point currently being discussed in the session.
   * This is the "anchor" topic - deviations from this constitute rabbitholes.
   */
  currentRecallPoint: RecallPoint;

  /**
   * All recall points in the current session.
   * Used to identify if tangents relate to other session material.
   */
  allRecallPoints: RecallPoint[];

  /**
   * Topics of already-identified rabbitholes in this session.
   * Helps avoid re-flagging known tangents and understand nesting.
   */
  existingRabbitholes: string[];
}

/**
 * Result of analyzing whether a rabbithole has concluded.
 *
 * This interface defines the JSON schema for rabbithole return detection,
 * allowing the system to know when normal recall evaluation should resume.
 */
export interface RabbitholeReturnResult {
  /**
   * Whether the conversation has returned from the rabbithole to the
   * main recall topic or a new productive area.
   */
  hasReturned: boolean;

  /**
   * Confidence level in the return detection (0.0 to 1.0).
   */
  confidence: number;

  /**
   * Human-readable explanation of why the rabbithole was or wasn't
   * considered concluded.
   */
  reasoning: string;
}

/**
 * Builds a prompt for detecting if the conversation has entered a rabbithole.
 *
 * The generated prompt instructs the LLM to:
 * 1. Analyze recent messages against the current recall point
 * 2. Determine if the conversation has drifted to a tangent
 * 3. Classify the depth and relatedness of any detected tangent
 * 4. Identify connections to other recall points in the session
 *
 * @param params - Context for rabbithole detection including messages and recall points
 * @returns A complete prompt string for the LLM to evaluate
 *
 * @example
 * ```typescript
 * const prompt = buildRabbitholeDetectorPrompt({
 *   recentMessages: lastTenMessages,
 *   currentRecallPoint: atpSynthesisPoint,
 *   allRecallPoints: sessionPoints,
 *   existingRabbitholes: ['mitochondria history'],
 * });
 * const response = await client.complete(prompt);
 * const result = JSON.parse(response.text) as RabbitholeDetectionResult;
 * ```
 */
export function buildRabbitholeDetectorPrompt(params: RabbitholeDetectorParams): string {
  const { recentMessages, currentRecallPoint, allRecallPoints, existingRabbitholes } = params;

  // Format recent messages for inclusion in the prompt
  const formattedMessages = formatMessagesForPrompt(recentMessages);

  // Format all recall points with their IDs for cross-reference
  const formattedRecallPoints = formatRecallPointsForPrompt(allRecallPoints, currentRecallPoint.id);

  // Format existing rabbitholes if any
  const existingRabbitholesSection = existingRabbitholes.length > 0
    ? `## Previously Identified Rabbitholes

The following tangent topics have already been identified in this session:
${existingRabbitholes.map((topic, idx) => `${idx + 1}. ${sanitizeInput(topic)}`).join('\n')}

Do not re-flag these unless the conversation has returned to them after leaving.`
    : '';

  // Build the complete detection prompt
  return `You are an expert conversation analyst specializing in detecting topic drift during educational dialogues.

## Your Task

Analyze the recent conversation and determine if it has drifted into a "rabbithole" - a tangent away from the current recall point being discussed.

## Current Recall Point

The conversation should be focused on helping the learner recall this information:

<current_recall_point>
**Content:** ${sanitizeInput(currentRecallPoint.content)}
**Context:** ${sanitizeInput(currentRecallPoint.context)}
</current_recall_point>

## Recent Conversation

Analyze these recent messages for topic drift:

<recent_messages>
${formattedMessages || '[No messages provided]'}
</recent_messages>

## All Session Recall Points

These are all the recall points in this session. If the tangent relates to any of these, note their IDs:

${formattedRecallPoints}

${existingRabbitholesSection}

## Rabbithole Detection Criteria

**IS a rabbithole if the conversation:**
- Has shifted to discussing a topic not directly related to recalling the current point
- Is exploring interesting but tangential details that don't help recall the core content
- Has the learner asking about related but off-topic information
- Shows multiple exchanges (2+) on a subject other than the recall target

**Is NOT a rabbithole if:**
- The discussion directly supports recalling the current point's content
- The learner is working through the recall process, even if struggling
- The tangent is a brief clarification (single exchange) that helps understanding
- The conversation naturally uses the recall point's context to aid recall

## Depth Classification

Classify rabbithole depth based on how far the conversation has strayed:

- **Depth 1 (Shallow)**: 1-2 message exchanges on tangent; brief detour that's easily recoverable
- **Depth 2 (Moderate)**: 3-5 message exchanges on tangent; extended exploration requiring gentle redirection
- **Depth 3 (Deep)**: 5+ message exchanges on tangent; significant departure from recall topic

## Response Format

You MUST respond with ONLY a valid JSON object in this exact format:

\`\`\`json
{
  "isRabbithole": boolean,
  "topic": string | null,
  "depth": 1 | 2 | 3,
  "relatedToCurrentPoint": boolean,
  "relatedRecallPointIds": string[],
  "confidence": number,
  "reasoning": string
}
\`\`\`

Where:
- \`isRabbithole\`: true if the conversation has drifted into a tangent, false if on-topic
- \`topic\`: brief description of the tangent topic (null if isRabbithole is false)
- \`depth\`: 1 for shallow, 2 for moderate, 3 for deep tangents (use 1 if not a rabbithole)
- \`relatedToCurrentPoint\`: whether the tangent semantically relates to the current recall point
- \`relatedRecallPointIds\`: array of recall point IDs that the tangent relates to (empty array if none)
- \`confidence\`: number from 0.0 to 1.0 indicating certainty in detection
- \`reasoning\`: 1-3 sentence explanation of the detection decision

**Important:** Return ONLY the JSON object. Do not include any other text, explanations, or markdown formatting outside the JSON.`;
}

/**
 * Builds a prompt for detecting when a rabbithole has concluded.
 *
 * This prompt helps determine when the conversation has returned from a tangent
 * back to productive recall discussion, allowing the system to resume normal
 * evaluation flow.
 *
 * @param rabbitholeTopic - The topic of the rabbithole being tracked
 * @param currentRecallPoint - The recall point the conversation should return to
 * @param recentMessages - Recent messages to analyze for return signals
 * @returns A complete prompt string for rabbithole return detection
 *
 * @example
 * ```typescript
 * const prompt = buildRabbitholeReturnPrompt(
 *   'the history of ATP discovery',
 *   atpStructurePoint,
 *   lastFiveMessages
 * );
 * const response = await client.complete(prompt);
 * const result = JSON.parse(response.text) as RabbitholeReturnResult;
 * ```
 */
export function buildRabbitholeReturnPrompt(
  rabbitholeTopic: string,
  currentRecallPoint: RecallPoint,
  recentMessages: SessionMessage[]
): string {
  // Format recent messages for inclusion in the prompt
  const formattedMessages = formatMessagesForPrompt(recentMessages);

  // Build the return detection prompt
  return `You are an expert conversation analyst evaluating whether a conversational tangent has concluded.

## Your Task

Determine if the conversation has returned from a tangent ("rabbithole") back to the main recall topic or transitioned to productive discussion.

## Rabbithole Being Tracked

The conversation previously drifted into this tangent:

<rabbithole_topic>
${sanitizeInput(rabbitholeTopic)}
</rabbithole_topic>

## Target Recall Point

The conversation should ideally return to discussing:

<current_recall_point>
**Content:** ${sanitizeInput(currentRecallPoint.content)}
**Context:** ${sanitizeInput(currentRecallPoint.context)}
</current_recall_point>

## Recent Conversation

Analyze these recent messages for signs of returning from the tangent:

<recent_messages>
${formattedMessages || '[No messages provided]'}
</recent_messages>

## Return Detection Criteria

**HAS returned if:**
- The conversation is now discussing the original recall point content
- The tutor has successfully redirected back to the main topic
- The learner has naturally transitioned back to the recall target
- The tangent topic is no longer being actively discussed

**Has NOT returned if:**
- The conversation is still exploring the tangent topic
- New sub-tangents have emerged from the original rabbithole
- The learner is still asking about the tangential subject
- The redirect attempt was unsuccessful

## Response Format

You MUST respond with ONLY a valid JSON object in this exact format:

\`\`\`json
{
  "hasReturned": boolean,
  "confidence": number,
  "reasoning": string
}
\`\`\`

Where:
- \`hasReturned\`: true if the conversation has returned from the rabbithole, false if still in tangent
- \`confidence\`: number from 0.0 to 1.0 indicating certainty in detection
- \`reasoning\`: 1-3 sentence explanation of the detection decision

**Important:** Return ONLY the JSON object. Do not include any other text, explanations, or markdown formatting outside the JSON.`;
}

/**
 * Formats an array of session messages for inclusion in a prompt.
 *
 * Creates a readable representation of the conversation that preserves
 * the message order and clearly indicates speaker roles.
 *
 * @param messages - Array of session messages to format
 * @returns Formatted string representation of the conversation
 */
function formatMessagesForPrompt(messages: SessionMessage[]): string {
  if (!messages || messages.length === 0) {
    return '';
  }

  return messages
    .map((msg) => {
      // Map role to a human-readable label
      const roleLabel = msg.role === 'user' ? 'Learner' : msg.role === 'assistant' ? 'Tutor' : 'System';
      // Sanitize content and format with role
      return `[${roleLabel}]: ${sanitizeInput(msg.content)}`;
    })
    .join('\n\n');
}

/**
 * Formats recall points for the prompt, highlighting the current point.
 *
 * Creates a numbered list of all recall points with their IDs visible,
 * allowing the LLM to reference specific points in its response.
 *
 * @param recallPoints - All recall points in the session
 * @param currentPointId - ID of the current recall point (to mark it)
 * @returns Formatted string listing all recall points
 */
function formatRecallPointsForPrompt(recallPoints: RecallPoint[], currentPointId: string): string {
  if (!recallPoints || recallPoints.length === 0) {
    return '[No recall points provided]';
  }

  return recallPoints
    .map((point, idx) => {
      const isCurrent = point.id === currentPointId;
      const marker = isCurrent ? ' (CURRENT)' : '';
      // Truncate long content for readability in the prompt
      const truncatedContent = point.content.length > 100
        ? point.content.substring(0, 100) + '...'
        : point.content;
      return `${idx + 1}. [ID: ${point.id}]${marker}: ${sanitizeInput(truncatedContent)}`;
    })
    .join('\n');
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
    .replace(/<\/(current_recall_point|recent_messages|rabbithole_topic)>/gi, '&lt;/$1&gt;')
    // Escape potential JSON breaking characters in a way that preserves readability
    .replace(/```json/gi, '` ` `json')
    .replace(/```/g, '` ` `');
}

/**
 * Parses the LLM response into a structured RabbitholeDetectionResult.
 *
 * This utility function handles common response variations:
 * - JSON wrapped in markdown code blocks
 * - Extra whitespace or text around the JSON
 * - Missing or invalid fields
 *
 * @param response - The raw LLM response text
 * @returns Parsed detection result, or a default "not rabbithole" result if parsing fails
 *
 * @example
 * ```typescript
 * const response = await client.complete(prompt);
 * const result = parseRabbitholeDetectionResponse(response.text);
 * if (result.isRabbithole) {
 *   // Handle detected tangent
 * }
 * ```
 */
export function parseRabbitholeDetectionResponse(response: string): RabbitholeDetectionResult {
  // Default result for parse failures - assume not a rabbithole to avoid false positives
  const defaultResult: RabbitholeDetectionResult = {
    isRabbithole: false,
    topic: null,
    depth: 1,
    relatedToCurrentPoint: false,
    relatedRecallPointIds: [],
    confidence: 0,
    reasoning: 'Failed to parse detection response',
  };

  if (!response || typeof response !== 'string') {
    return defaultResult;
  }

  try {
    // Try to extract JSON from various formats the LLM might return
    const jsonString = extractJsonFromResponse(response);
    const parsed = JSON.parse(jsonString);

    // Validate and normalize the parsed result
    return {
      isRabbithole: typeof parsed.isRabbithole === 'boolean' ? parsed.isRabbithole : false,
      topic: typeof parsed.topic === 'string' ? parsed.topic : null,
      depth: normalizeDepth(parsed.depth),
      relatedToCurrentPoint: typeof parsed.relatedToCurrentPoint === 'boolean' ? parsed.relatedToCurrentPoint : false,
      relatedRecallPointIds: Array.isArray(parsed.relatedRecallPointIds)
        ? parsed.relatedRecallPointIds.filter((id: unknown) => typeof id === 'string')
        : [],
      confidence: normalizeConfidence(parsed.confidence),
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : 'No reasoning provided',
    };
  } catch {
    // JSON parse failed - return default
    return {
      ...defaultResult,
      reasoning: `Failed to parse detection response: ${response.substring(0, 100)}...`,
    };
  }
}

/**
 * Parses the LLM response into a structured RabbitholeReturnResult.
 *
 * @param response - The raw LLM response text
 * @returns Parsed return result, or a default "not returned" result if parsing fails
 *
 * @example
 * ```typescript
 * const response = await client.complete(prompt);
 * const result = parseRabbitholeReturnResponse(response.text);
 * if (result.hasReturned) {
 *   // Resume normal recall flow
 * }
 * ```
 */
export function parseRabbitholeReturnResponse(response: string): RabbitholeReturnResult {
  // Default result for parse failures - assume still in rabbithole to be safe
  const defaultResult: RabbitholeReturnResult = {
    hasReturned: false,
    confidence: 0,
    reasoning: 'Failed to parse return detection response',
  };

  if (!response || typeof response !== 'string') {
    return defaultResult;
  }

  try {
    // Try to extract JSON from various formats the LLM might return
    const jsonString = extractJsonFromResponse(response);
    const parsed = JSON.parse(jsonString);

    // Validate and normalize the parsed result
    return {
      hasReturned: typeof parsed.hasReturned === 'boolean' ? parsed.hasReturned : false,
      confidence: normalizeConfidence(parsed.confidence),
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : 'No reasoning provided',
    };
  } catch {
    // JSON parse failed - return default
    return {
      ...defaultResult,
      reasoning: `Failed to parse return detection response: ${response.substring(0, 100)}...`,
    };
  }
}

/**
 * Extracts JSON string from LLM response that may include markdown or extra text.
 *
 * @param response - Raw LLM response
 * @returns Cleaned JSON string ready for parsing
 */
function extractJsonFromResponse(response: string): string {
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

  return finalJsonString;
}

/**
 * Normalizes depth values to valid 1, 2, or 3.
 *
 * @param value - The raw depth value from the LLM
 * @returns Normalized depth of 1, 2, or 3
 */
function normalizeDepth(value: unknown): 1 | 2 | 3 {
  if (typeof value === 'number') {
    if (value <= 1) return 1;
    if (value >= 3) return 3;
    return 2;
  }
  return 1; // Default to shallow
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
