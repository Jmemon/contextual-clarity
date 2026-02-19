/**
 * Socratic Tutor Prompt Builder
 *
 * This module constructs the system prompt for AI-powered Socratic recall discussions.
 * The Socratic method involves guiding learners to recall and understand concepts
 * through thoughtful questioning rather than direct answers.
 *
 * Key design decisions:
 *
 * 1. **Context separation**: The AI receives the recall point content and context
 *    but is explicitly instructed NOT to share this information directly. Instead,
 *    it uses this knowledge to craft probing questions that lead the learner to
 *    recall the information themselves.
 *
 * 2. **Progressive disclosure**: The prompt includes information about the current
 *    point being discussed and upcoming points, allowing the AI to naturally
 *    transition between topics when appropriate.
 *
 * 3. **Layered prompts**: The prompt combines the RecallSet's custom discussion
 *    prompt (which sets domain-specific context and persona) with standardized
 *    Socratic method guidelines.
 *
 * 4. **Recall vs. understanding**: The prompt distinguishes between simple recall
 *    (did they remember the fact?) and deeper understanding (do they grasp why
 *    it matters?), encouraging the AI to probe both.
 */

import type { RecallPoint, RecallSet } from '../../core/models';

/**
 * Parameters required to build a Socratic tutor system prompt.
 * These provide all the context the AI needs to conduct an effective
 * recall discussion for a specific point within a session.
 */
export interface SocraticTutorPromptParams {
  /**
   * The RecallSet being studied, which provides the custom discussion
   * system prompt and overall context for the learning material.
   */
  recallSet: RecallSet;

  /**
   * All recall points targeted in this session. Used to understand the
   * full scope of material and identify already-recalled points.
   */
  targetPoints: RecallPoint[];

  /**
   * Recall points that have NOT been recalled yet, in their original order.
   * Used to show the tutor which points still need to be probed.
   */
  uncheckedPoints: RecallPoint[];

  /**
   * The next recall point the tutor should probe, or null if all points are recalled.
   * This is the primary focus for the tutor's questions.
   */
  currentProbePoint: RecallPoint | null;
}

/**
 * Builds the system prompt for a Socratic tutor discussion.
 *
 * The generated prompt instructs the AI to:
 * 1. Use the RecallSet's custom discussion persona
 * 2. Guide recall through questioning (not telling)
 * 3. Focus on the current recall point
 * 4. Use context to inform questions without revealing it
 * 5. Transition naturally to subsequent points
 *
 * @param params - The parameters containing RecallSet, target points, and current index
 * @returns A complete system prompt string for the LLM
 *
 * @example
 * ```typescript
 * const prompt = buildSocraticTutorPrompt({
 *   recallSet: historySet,
 *   targetPoints: [point1, point2, point3],
 *   uncheckedPoints: [point1, point2, point3],
 *   currentProbePoint: point1,
 * });
 * client.setSystemPrompt(prompt);
 * ```
 */
export function buildSocraticTutorPrompt(params: SocraticTutorPromptParams): string {
  const { recallSet, targetPoints, uncheckedPoints, currentProbePoint } = params;

  // Handle edge case: empty target points array
  // In this case, we still generate a valid prompt but with limited guidance
  if (targetPoints.length === 0) {
    return buildEmptySessionPrompt(recallSet);
  }

  // Identify already-recalled points (in targetPoints but not in uncheckedPoints)
  const uncheckedIds = new Set(uncheckedPoints.map(p => p.id));
  const recalledPoints = targetPoints.filter(p => !uncheckedIds.has(p.id));

  // Build the complete prompt by combining layers
  const promptSections: string[] = [
    // Section 1: RecallSet's custom discussion prompt (domain-specific persona)
    buildCustomPromptSection(recallSet),

    // Section 2: Socratic method guidelines
    buildSocraticMethodSection(),

    // Section 3: Current focus point and unchecked points (checklist-aware)
    buildCurrentPointSection(currentProbePoint, uncheckedPoints),

    // Section 4: Already recalled points for context
    buildRecalledPointsSection(recalledPoints),

    // Section 5: Important guidelines and constraints
    buildGuidelinesSection(),
  ];

  // Filter out empty sections and join with double newlines for readability
  return promptSections.filter(Boolean).join('\n\n');
}

/**
 * Builds a minimal prompt for sessions with no target points.
 * This handles the edge case gracefully while still maintaining
 * the RecallSet's custom persona.
 */
function buildEmptySessionPrompt(recallSet: RecallSet): string {
  return `${recallSet.discussionSystemPrompt}

You are in a recall session, but there are no specific recall points assigned for this session.
Engage in a general discussion about the subject matter covered by this recall set: "${recallSet.name}"

Help the learner explore and reinforce their understanding of the topic through open-ended questions.`;
}

/**
 * Section 1: Custom prompt from the RecallSet
 *
 * This section incorporates the domain-specific persona and teaching style
 * defined by the user when creating the RecallSet. It sets the overall tone
 * and expertise level for the discussion.
 */
function buildCustomPromptSection(recallSet: RecallSet): string {
  // Include the RecallSet's custom prompt if it exists and isn't just whitespace
  const customPrompt = recallSet.discussionSystemPrompt.trim();

  if (!customPrompt) {
    // Fallback to a generic educational persona
    return `You are a knowledgeable and patient tutor helping a student recall and understand concepts from "${recallSet.name}".`;
  }

  return customPrompt;
}

/**
 * Section 2: Socratic method guidelines
 *
 * This section defines the core principles of the Socratic teaching method.
 * These guidelines are consistent across all RecallSets and ensure the AI
 * engages in genuine dialogue rather than simple Q&A.
 */
function buildSocraticMethodSection(): string {
  return `## Your Socratic Approach

You are conducting a Socratic recall discussion. Your role is to help the learner retrieve information from memory through thoughtful questioning, not by providing answers directly.

Core principles:
1. **Ask, don't tell**: Guide the learner to recall information through questions. Never reveal the answer outright.
2. **Start broad, then narrow**: Begin with general questions and progressively focus on specific details.
3. **Follow their lead**: Build on what the learner says, even if they're partially correct or heading in an unexpected direction.
4. **Encourage elaboration**: When they recall something correctly, ask them to explain why it matters or how it connects to other concepts.
5. **Support struggle productively**: If they're stuck, provide hints that jog memory without giving away the answer.
6. **Celebrate recall**: Acknowledge successful recall warmly, then deepen understanding with follow-up questions.`;
}

/**
 * Section 3: Current focus point and unchecked points (checklist-aware)
 *
 * Shows the current probe point and all other unchecked points. The AI
 * probes in order but accepts out-of-order recall if the user demonstrates
 * knowledge of any unchecked point.
 */
function buildCurrentPointSection(currentProbePoint: RecallPoint | null, uncheckedPoints: RecallPoint[]): string {
  // If all points are recalled, indicate completion
  if (!currentProbePoint) {
    return '## Current Focus Point\n\nAll points have been recalled.';
  }

  // Escape any content that might look like prompt injection
  const safeContent = escapePromptContent(currentProbePoint.content);
  const safeContext = escapePromptContent(currentProbePoint.context);

  let section = `## Current Focus Point

Probe this point next. Ask the user to recall this concept (DO NOT share this directly):

<recall_target>
${safeContent}
</recall_target>

${safeContext ? `<supporting_context>
This context can inform your questions but should not be revealed:
${safeContext}
</supporting_context>` : ''}

Your goal is to guide the learner to articulate this information in their own words through your questions.`;

  // Show other unchecked points (excluding the current probe point)
  const otherUnchecked = uncheckedPoints.filter(p => p.id !== currentProbePoint.id);
  if (otherUnchecked.length > 0) {
    const pointsList = otherUnchecked
      .map((point, index) => `${index + 1}. ${escapePromptContent(point.content.substring(0, 100))}${point.content.length > 100 ? '...' : ''}`)
      .join('\n');

    section += `\n\n## Other Unchecked Points

These points have not been recalled yet. If the user demonstrates knowledge of any of these out of order, accept it. Probe them in the order listed if the user doesn't bring them up naturally:
${pointsList}`;
  }

  section += `\n\n## Instruction

Probe points in the order listed, but if the user demonstrates recall of ANY unchecked point (even out of order), accept it and move to the next unchecked point. Do not fight the user's natural flow.`;

  return section;
}

/**
 * Section 4: Already recalled points
 *
 * Shows the AI which points have already been recalled. The tutor
 * should not re-probe these but can reference them if relevant.
 */
function buildRecalledPointsSection(recalledPoints: RecallPoint[]): string {
  // Don't include this section if no points have been recalled yet
  if (recalledPoints.length === 0) {
    return '';
  }

  const recalledList = recalledPoints
    .map((point, index) => `${index + 1}. ${escapePromptContent(point.content.substring(0, 100))}${point.content.length > 100 ? '...' : ''}`)
    .join('\n');

  return `## Already Recalled Points

The user has already demonstrated recall of these. Do not re-probe them, but you can reference them if relevant:
${recalledList}`;
}

/**
 * Section 5: Important guidelines and constraints
 *
 * This section provides explicit do's and don'ts for the AI's behavior.
 * These constraints ensure a positive learning experience and prevent
 * common failure modes.
 */
function buildGuidelinesSection(): string {
  return `## Important Guidelines

**DO:**
- Begin with an open-ended question that prompts recall of the target content
- Provide encouraging feedback when the learner makes progress
- Use hints that activate memory without revealing answers (e.g., "Think about when/where/why...")
- Accept paraphrased or partial answers as valid recall
- Adapt your language complexity to match the learner's responses

**DON'T:**
- Never say the recall target content outright, even if the learner asks directly
- Don't move on until the learner has demonstrated some recall of the current point
- Avoid yes/no questions that don't require active recall
- Don't be condescending or make the learner feel bad for struggling
- Don't provide so many hints that recall becomes trivial

**Handling difficulty:**
If the learner is struggling significantly after 3-4 attempts:
1. Break the concept into smaller pieces
2. Provide more contextual hints
3. Ask what they DO remember about the topic
4. As a last resort, provide a partial answer and have them complete it`;
}

/**
 * Escapes potentially problematic content in recall points.
 *
 * This helps prevent prompt injection attacks where malicious content
 * in a recall point could attempt to override the system prompt.
 * We use XML-like tags and escape special sequences.
 */
function escapePromptContent(content: string): string {
  if (!content) {
    return '';
  }

  // Replace potential prompt injection patterns
  // Note: This is a basic sanitization; more robust solutions may be needed
  return content
    // Escape XML-like closing tags that might match our delimiters
    .replace(/<\/(recall_target|supporting_context)>/gi, '&lt;/$1&gt;')
    // Escape sequences that look like they're trying to break out of context
    .replace(/```/g, '` ` `')
    // Preserve newlines and other formatting
    .trim();
}
