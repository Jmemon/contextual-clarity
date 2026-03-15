/**
 * BranchAgent - Dedicated conversation agent for branch (tangent) exploration
 *
 * Evolves from RabbitholeAgent with a key addition: parent context support.
 * When a user branches off from the main trunk (or from another branch),
 * this agent receives a frozen snapshot of the parent conversation and
 * prepends it to all LLM calls. This gives the branch agent full awareness
 * of the conversation that led to the branch point, without modifying that
 * context.
 *
 * Key design decisions:
 * - MUST use its own AnthropicClient -- sharing would corrupt the tutor's system prompt.
 * - parentContext is a frozen snapshot: stored once at construction, never modified.
 * - getConversationHistory() returns ONLY branch-specific messages (not parent context),
 *   because parent context is reconstructed from the DB on the fly at load time.
 * - Tone is exploratory and conversational, NOT Socratic.
 */

import { AnthropicClient } from '../../llm/client';

// ============================================================================
// Types
// ============================================================================

/**
 * A single message in a branch conversation.
 * Identical shape to LLMMessage -- kept as a named type for clarity at call sites.
 */
export interface BranchMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ============================================================================
// System Prompt Builder
// ============================================================================

/**
 * Builds the system prompt for the branch agent.
 *
 * The agent's personality is distinctly different from the Socratic tutor:
 * - Exploratory and conversational, not question-driven
 * - Goes deep on whatever the user is curious about
 * - Information-dense but NOT a lecture -- responds to what the user asks
 * - No bullet lists, flowing conversational prose
 *
 * @param topic - The tangent topic the user wants to explore
 * @param recallSetName - Name of the recall set (provides context)
 * @param recallSetDescription - Description of the recall set (provides context)
 * @returns System prompt string for the branch agent
 */
function buildBranchAgentPrompt(
  topic: string,
  recallSetName: string,
  recallSetDescription: string
): string {
  return `The user branched off into "${topic}" during a recall session on "${recallSetName}".

${recallSetDescription}

You're a sharp conversation partner — NOT a Socratic tutor. Don't test recall. Just talk about the topic like a knowledgeable friend would.

Keep it tight: 1-2 sentences per response. No bullet lists. Answer what they ask, connect to ${recallSetName} when it's natural, and move on. Don't pad, don't over-explain, don't redirect them back to their session.`;
}

// ============================================================================
// BranchAgent Class
// ============================================================================

/**
 * Manages the conversation within a branch (tangent) exploration.
 *
 * Each instance represents one branch and owns its complete branch-specific
 * conversation history. The parent context (frozen snapshot of the conversation
 * up to the branch point) is prepended to every LLM call so the agent has
 * full awareness of the prior conversation.
 *
 * @example
 * ```typescript
 * const agent = new BranchAgent({
 *   topic: 'etymology of photosynthesis',
 *   recallSetName: 'Cell Biology',
 *   recallSetDescription: 'Core concepts in cell biology...',
 *   parentContext: [
 *     { role: 'user', content: 'Tell me about cell energy' },
 *     { role: 'assistant', content: 'Cells produce energy through...' },
 *   ],
 * });
 *
 * const opening = await agent.generateOpeningMessage();
 * const response = await agent.generateResponse('Tell me more about chlorophyll');
 * const history = agent.getConversationHistory(); // branch messages only
 * ```
 */
export class BranchAgent {
  /**
   * Dedicated LLM client for this branch.
   * MUST be its own instance -- sharing the tutor's client would corrupt its system prompt.
   */
  private llmClient: AnthropicClient;

  /**
   * Frozen snapshot of the parent conversation up to the branch point.
   * Stored once at construction time, never modified. Prepended to every LLM call
   * so the agent understands the conversational context that led here.
   */
  private parentContext: BranchMessage[];

  /** Branch-specific conversation history (does NOT include parent context) */
  private messages: BranchMessage[] = [];

  /** The tangent topic being explored */
  private topic: string;

  /**
   * Creates a new BranchAgent for a given topic with parent context.
   *
   * Immediately creates a dedicated AnthropicClient and sets its system prompt.
   * The parentContext is shallow-copied and frozen -- subsequent mutations to
   * the caller's array will not affect this agent.
   *
   * @param params.topic - The tangent topic the user wants to explore
   * @param params.recallSetName - Name of the recall set the session is in
   * @param params.recallSetDescription - Description of the recall set for context
   * @param params.parentContext - Frozen snapshot of parent conversation messages
   */
  constructor(params: {
    topic: string;
    recallSetName: string;
    recallSetDescription: string;
    parentContext: BranchMessage[];
  }) {
    this.topic = params.topic;

    // Shallow-copy to ensure immutability -- caller can't mutate our snapshot
    this.parentContext = [...params.parentContext];

    // Create a completely separate LLM client -- never share with the tutor
    this.llmClient = new AnthropicClient();
    this.llmClient.setSystemPrompt(
      buildBranchAgentPrompt(
        params.topic,
        params.recallSetName,
        params.recallSetDescription
      )
    );
  }

  /**
   * Generates the agent's opening message to kick off the branch.
   *
   * Uses a lightweight opening prompt that signals curiosity and invites
   * the user to guide the exploration. The parent context is prepended
   * so the LLM knows what conversation preceded this branch.
   *
   * @returns The agent's opening message as a string
   */
  async generateOpeningMessage(): Promise<string> {
    const openingPrompt = `I'm curious about "${this.topic}". Tell me what you'd like to explore — I'll follow your lead.`;

    // LLM sees: parent context + opening prompt
    // Parent context gives the agent awareness of the conversation that led here.
    const fullHistory = [
      ...this.parentContext.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: openingPrompt },
    ];

    const response = await this.llmClient.complete(fullHistory, {
      temperature: 0.7,
      maxTokens: 256,
    });

    // Record only in branch-specific history (not parent context).
    // The user turn MUST be first -- Anthropic API requires messages[0].role === 'user'.
    this.messages.push({ role: 'user', content: openingPrompt });
    this.messages.push({ role: 'assistant', content: response.text });

    return response.text;
  }

  /**
   * Generates a response to a user message within the branch.
   *
   * Appends the user message to branch history, then calls the LLM with
   * parent context + full branch history, then appends and returns the
   * assistant response.
   *
   * @param userMessage - The user's message text
   * @returns The agent's response as a string
   */
  async generateResponse(userMessage: string): Promise<string> {
    // Record the user's message in branch history
    this.messages.push({ role: 'user', content: userMessage });

    // LLM sees: parent context + all branch messages
    // This ensures the agent always has full conversational awareness.
    const fullHistory = [
      ...this.parentContext.map((m) => ({ role: m.role, content: m.content })),
      ...this.messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const response = await this.llmClient.complete(fullHistory, {
      temperature: 0.7,
      maxTokens: 512,
    });

    // Record the assistant's response in branch history
    this.messages.push({ role: 'assistant', content: response.text });

    return response.text;
  }

  /**
   * Returns a copy of the branch-specific conversation history.
   * Does NOT include parent context -- that is reconstructed from the DB
   * on the fly when the branch is loaded. Only branch messages are persisted.
   *
   * @returns Array of branch messages, oldest first
   */
  getConversationHistory(): BranchMessage[] {
    return [...this.messages];
  }

  /**
   * Returns the topic this branch is exploring.
   *
   * @returns The topic string
   */
  getTopic(): string {
    return this.topic;
  }
}
