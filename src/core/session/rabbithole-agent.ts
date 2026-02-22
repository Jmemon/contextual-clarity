/**
 * RabbitholeAgent - Dedicated conversation agent for rabbit hole exploration
 *
 * When a user opts into exploring a tangent (rabbit hole), this agent takes over
 * from the Socratic tutor. It creates its OWN dedicated AnthropicClient instance
 * with a separate system prompt and conversation history, ensuring no cross-
 * contamination with the main tutoring session.
 *
 * Key design decisions:
 * - MUST use its own AnthropicClient — the tutor's client stores systemPrompt
 *   as a private field; sharing it would corrupt the Socratic tutor prompt.
 * - Maintains completely separate message history from the main session.
 * - Tone is exploratory and conversational, NOT Socratic — no probing questions,
 *   just curious deep dives into whatever the user wants to explore.
 * - On exit, the full conversation is returned for DB persistence.
 */

import { AnthropicClient } from '../../llm/client';

// ============================================================================
// Types
// ============================================================================

/**
 * A single message in the rabbit hole conversation.
 * Kept minimal — we only need role + content for persistence and LLM context.
 */
export interface RabbitholeMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ============================================================================
// System Prompt Builder
// ============================================================================

/**
 * Builds the system prompt for the rabbit hole agent.
 *
 * The agent's personality is distinctly different from the Socratic tutor:
 * - Exploratory and conversational, not question-driven
 * - Goes deep on whatever the user is curious about
 * - Information-dense but NOT a lecture — responds to what the user asks
 * - No bullet lists, flowing conversational prose
 *
 * @param topic - The tangent topic the user wants to explore
 * @param recallSetName - Name of the recall set (provides context)
 * @param recallSetDescription - Description of the recall set (provides context)
 * @returns System prompt string for the rabbit hole agent
 */
function buildRabbitholeAgentPrompt(
  topic: string,
  recallSetName: string,
  recallSetDescription: string
): string {
  return `The user is exploring a tangent about "${topic}" that came up during a recall session on "${recallSetName}".

${recallSetDescription}

You are a curious conversation partner helping the user explore this topic deeply. You are NOT a Socratic tutor — do not ask probing questions to test recall. Instead, be genuinely exploratory: share what's interesting, make connections, go deep when asked.

Guidelines:
- Be conversational and information-dense. No bullet lists — flowing prose only.
- Follow the user's curiosity wherever it leads within this topic area.
- Keep responses concise but substantive. Aim for 2-4 sentences per response unless they ask for more.
- Connect ideas to the broader context of ${recallSetName} when relevant and natural.
- Do not redirect the user back to their recall session — that's the system's job, not yours.`;
}

// ============================================================================
// RabbitholeAgent Class
// ============================================================================

/**
 * Manages the conversation within a rabbit hole tangent.
 *
 * Each instance represents one rabbit hole exploration and owns its complete
 * conversation history. The agent is created when the user opts in and
 * destroyed (after saving) when the user exits.
 *
 * @example
 * ```typescript
 * const agent = new RabbitholeAgent({
 *   topic: 'etymology of photosynthesis',
 *   recallSetName: 'Cell Biology',
 *   recallSetDescription: 'Core concepts in cell biology...',
 * });
 *
 * const opening = await agent.generateOpeningMessage();
 * const response = await agent.generateResponse('Tell me more about chlorophyll');
 * const history = agent.getConversationHistory();
 * ```
 */
export class RabbitholeAgent {
  /**
   * Dedicated LLM client for this rabbit hole.
   * MUST be its own instance — sharing the tutor's client would corrupt its system prompt.
   */
  private llmClient: AnthropicClient;

  /** Complete conversation history within this rabbit hole */
  private messages: RabbitholeMessage[] = [];

  /** The tangent topic being explored */
  private topic: string;

  /**
   * Creates a new RabbitholeAgent for a given topic.
   *
   * Immediately creates a dedicated AnthropicClient and sets its system prompt.
   * The client is not shared with any other component.
   *
   * @param params.topic - The tangent topic the user wants to explore
   * @param params.recallSetName - Name of the recall set the session is in
   * @param params.recallSetDescription - Description of the recall set for context
   */
  constructor(params: {
    topic: string;
    recallSetName: string;
    recallSetDescription: string;
  }) {
    this.topic = params.topic;

    // Create a completely separate LLM client — never share with the tutor
    this.llmClient = new AnthropicClient();
    this.llmClient.setSystemPrompt(
      buildRabbitholeAgentPrompt(
        params.topic,
        params.recallSetName,
        params.recallSetDescription
      )
    );
  }

  /**
   * Generates the agent's opening message to kick off the rabbit hole.
   *
   * Uses a lightweight opening prompt that signals curiosity and invites
   * the user to guide the exploration.
   *
   * @returns The agent's opening message as a string
   */
  async generateOpeningMessage(): Promise<string> {
    const openingPrompt = `I'm curious about "${this.topic}". Tell me what you'd like to explore — I'll follow your lead.`;

    const response = await this.llmClient.complete(openingPrompt, {
      temperature: 0.7,
      maxTokens: 256,
    });

    // Record both the synthetic user turn and the assistant's opening in history.
    // The user turn MUST be first — Anthropic API requires messages[0].role === 'user'.
    this.messages.push({ role: 'user', content: openingPrompt });
    this.messages.push({ role: 'assistant', content: response.text });

    return response.text;
  }

  /**
   * Generates a response to a user message within the rabbit hole.
   *
   * Appends the user message to history, calls the LLM with the full
   * conversation context, then appends and returns the assistant response.
   *
   * @param userMessage - The user's message text
   * @returns The agent's response as a string
   */
  async generateResponse(userMessage: string): Promise<string> {
    // Record the user's message in history
    this.messages.push({ role: 'user', content: userMessage });

    // Build the conversation history for the LLM call
    const conversationHistory = this.messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    const response = await this.llmClient.complete(conversationHistory, {
      temperature: 0.7,
      maxTokens: 512,
    });

    // Record the assistant's response in history
    this.messages.push({ role: 'assistant', content: response.text });

    return response.text;
  }

  /**
   * Returns a copy of the full conversation history within this rabbit hole.
   * Used when exiting to persist the conversation to the database.
   *
   * @returns Array of messages, oldest first
   */
  getConversationHistory(): RabbitholeMessage[] {
    return [...this.messages];
  }

  /**
   * Returns the topic this rabbit hole is exploring.
   *
   * @returns The topic string
   */
  getTopic(): string {
    return this.topic;
  }
}
