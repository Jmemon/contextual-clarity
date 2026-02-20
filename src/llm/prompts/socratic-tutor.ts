/**
 * Socratic Tutor Prompt Builder
 *
 * This module constructs the system prompt for AI-powered Socratic recall discussions.
 * A universal recall-session facilitator prompt (domain-agnostic) forms the identity,
 * while the recall points' content and context fields supply all domain knowledge.
 * The per-set discussionSystemPrompt is demoted to optional "Supplementary Guidelines"
 * appended at the end.
 *
 * Key design decisions:
 *
 * 1. **Universal agent**: A single domain-agnostic facilitator prompt works across
 *    all subjects. The recall points themselves carry all domain knowledge.
 *
 * 2. **Context separation**: The AI receives the recall point content and context
 *    but is explicitly instructed NOT to share this information directly. Instead,
 *    it uses this knowledge to craft probing questions that lead the learner to
 *    recall the information themselves.
 *
 * 3. **Progressive disclosure**: The prompt includes information about the current
 *    point being discussed and upcoming points, allowing the AI to naturally
 *    transition between topics when appropriate.
 *
 * 4. **Supplementary guidelines**: The RecallSet's discussionSystemPrompt is
 *    optional and appended last. It adds per-set nuance without overriding
 *    the universal identity.
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
 * 1. Adopt the universal recall-session facilitator identity (domain-agnostic)
 * 2. Guide recall through questioning (not telling)
 * 3. Focus on the current checklist-aware probe point
 * 4. Use context to inform questions without revealing it
 * 5. Transition naturally to subsequent unchecked points
 *
 * @param params - The parameters containing RecallSet, target points, unchecked points, and current probe point
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

  // Build the complete prompt by combining layers.
  // Section order: universal agent identity, Socratic method, checklist-aware
  // points, guidelines, and finally optional per-set supplementary guidelines.
  const promptSections: string[] = [
    // Section 1: Universal recall-session facilitator identity (domain-agnostic)
    buildUniversalAgentSection(),

    // Section 2: Socratic method guidelines — defines approach, tone, and edge-case handling
    buildSocraticMethodSection(),

    // Section 3: Current focus point and unchecked points (checklist-aware)
    buildCurrentPointSection(currentProbePoint, uncheckedPoints),

    // Section 4: Already recalled points for context
    buildRecalledPointsSection(recalledPoints),

    // Section 5: Important guidelines and constraints
    buildGuidelinesSection(),

    // Section 6: Optional per-set supplementary guidelines (LAST)
    buildSupplementaryGuidelinesSection(recallSet),
  ];

  // Filter out empty sections and join with double newlines for readability
  return promptSections.filter(Boolean).join('\n\n');
}

/**
 * Builds a minimal prompt for sessions with no target points.
 * Uses the universal agent framing instead of the per-set persona.
 */
function buildEmptySessionPrompt(recallSet: RecallSet): string {
  return `You are facilitating a recall session for "${recallSet.name}", but there are no specific recall points assigned for this session.

Engage in a general discussion about the subject matter. Ask open-ended questions to help the user explore and articulate what they know about the topic.`;
}

/**
 * Section 1: Universal recall-session facilitator identity
 *
 * Domain-agnostic agent prompt that works across all subjects. The recall
 * points' content and context fields (injected by other sections) supply
 * all the domain knowledge the agent needs.
 */
function buildUniversalAgentSection(): string {
  return `You are facilitating a recall session. The user has previously learned the material below and is practicing retrieving it from memory. Your job is to probe their recall through questions — not to teach, explain, or provide the answers.

## Your role

- You are a recall session facilitator. You work across any domain — science, history, music, philosophy, engineering, anything.
- The recall points listed below are your only source of truth for this session. They tell you what the user should be able to recall.
- You are NOT teaching new material. The user has already learned this. You are helping them practice retrieval.
- An evaluator system analyzes each user message and provides you with observations about what they have and have not recalled. Use these observations to decide what to probe next and how to nudge them toward precision.
- The UI handles all positive reinforcement (checkmarks, sounds, progress indicators). Do not generate congratulatory text, celebration, or praise. When a point is recalled, move on to the next unchecked point.`;
}

/**
 * Section 6 (LAST): Optional per-set supplementary guidelines
 *
 * Wraps the RecallSet's discussionSystemPrompt in a clearly labeled section.
 * Returns empty string when the prompt is empty or whitespace-only, causing
 * the section to be omitted from the final prompt entirely.
 */
function buildSupplementaryGuidelinesSection(recallSet: RecallSet): string {
  const guidelines = recallSet.discussionSystemPrompt.trim();

  if (!guidelines) {
    return '';
  }

  return `## Supplementary guidelines for this recall set

The following guidelines were provided for this specific recall set. Follow them in addition to (not instead of) the universal instructions above:

<supplementary_guidelines>
${guidelines}
</supplementary_guidelines>`;
}

/**
 * Section 2: Socratic method guidelines
 *
 * Defines how the agent approaches questioning, its tone, and how it handles
 * common edge cases like "I recall nothing." T07 rewrote this section to remove
 * "Encourage elaboration" and "Celebrate recall" principles (the UI handles
 * positive reinforcement), and to establish a direct, conversational tone.
 */
function buildSocraticMethodSection(): string {
  return `## Your approach

1. Ask, don't tell. Guide recall through questions. Never reveal answers.
2. Start broad, narrow down. Open questions first, specific details later.
3. Follow their lead. Build on what they say, even if partial or unexpected.
4. When a point is recalled, move on. Don't belabor it. The system will confirm it.
5. If they're stuck, give contextual hints — not the answer. "Think about the context where..." or "What happens when..."
6. If they say they can't remember anything, start with the broadest possible hint about the topic area. Don't panic. Don't break character. Just help them find a foothold.

## Your tone

Direct but warm. Short sentences. Think of a knowledgeable friend at a coffee shop who asks sharp questions to help you remember something — not a customer support bot, not a professor, not a cheerleader. You're curious about what they remember, not testing them.`;
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
 * Section 5: Guidelines and constraints
 *
 * T07 rewrote this section with a direct DO/DON'T structure that covers:
 * - Response length and conversational tone expectations
 * - Prohibitions on praise, bullet points, and answer-revealing
 * - Explicit handling for "I recall nothing" responses
 * - Handling of evaluator observations injected as [EVALUATOR OBSERVATION] blocks
 */
function buildGuidelinesSection(): string {
  return `## Guidelines

DO:
- Keep responses short. 1-3 sentences. Get them thinking, not reading.
- Be conversational. Like talking to a knowledgeable friend who asks good questions.
- Accept paraphrased or partial answers as valid recall.
- When the evaluator says they were close but imprecise, ask them to be more specific — don't re-ask from scratch.

DON'T:
- Don't congratulate, praise, or use exclamation marks. The system handles feedback through UI.
- Don't say "Great question!" or "Good job!" or any filler.
- Don't use bullet points or numbered lists in your responses.
- Don't provide the answer, even if they struggle repeatedly. Break the concept into smaller pieces instead.
- Don't use yes/no questions that don't require active recall.
- Don't ask them to elaborate on something they've already recalled. Move on.

HANDLING "I RECALL NOTHING" / "I DON'T REMEMBER":
- This is a valid response. The user is not confused about the session — they genuinely can't recall.
- Start with the broadest possible contextual hint: "This relates to [broad topic area]..."
- Progressively narrow hints if they continue to struggle.
- After 3-4 failed attempts at a specific point, provide a partial answer and have them complete it.
- NEVER respond with meta-commentary about the session format or whether the session has started.

HANDLING EVALUATOR OBSERVATIONS:
When you receive evaluator observations (marked [EVALUATOR OBSERVATION]):
- If user was close but imprecise: "Can you be more specific about [the imprecise part]?"
- If user got the concept but wrong term: "Right idea — what's the specific term for that?"
- If user missed a key detail: "You're on the right track. What about [hint at missing piece]?"
- Never repeat the evaluator's observations to the user verbatim.
- Never reference the evaluator or the evaluation system to the user.`;
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
