/**
 * Session Domain Types
 *
 * A Session represents a single study encounter where the user reviews due
 * recall points through AI-powered Socratic dialogues. Unlike traditional
 * flashcard sessions with simple reveal-and-grade interactions, Sessions in
 * Contextual Clarity are conversational:
 *
 * 1. The AI prompts the user to recall information
 * 2. The user attempts to explain/recall the concept
 * 3. The AI guides understanding through follow-up questions
 * 4. The AI provides feedback and determines recall success
 *
 * Sessions maintain a complete message history for:
 * - Continuing interrupted sessions
 * - Reviewing past study conversations
 * - Analyzing learning patterns over time
 *
 * This module contains only pure TypeScript types with no runtime dependencies,
 * forming the contract between all modules that work with sessions.
 */

/**
 * Represents the lifecycle status of a Session.
 *
 * - 'in_progress': Session is currently active; user may be in dialogue
 * - 'completed': All target recall points were reviewed; session finished normally
 * - 'abandoned': Session was stopped before completion; may happen due to time
 *                constraints, technical issues, or user choice
 */
export type SessionStatus = 'in_progress' | 'completed' | 'abandoned';

/**
 * Role of a message participant in the conversation.
 *
 * - 'user': Message from the human learner
 * - 'assistant': Message from the AI tutor conducting the Socratic dialogue
 * - 'system': Internal system messages (e.g., session context, instructions)
 */
export type MessageRole = 'user' | 'assistant' | 'system';

/**
 * SessionMessage represents a single message in a session's conversation.
 *
 * Messages form the complete dialogue history between the user and the AI
 * assistant during a recall session. They are persisted to allow:
 * - Resuming interrupted sessions with full context
 * - Reviewing past learning conversations
 * - Analyzing conversation patterns for improvement
 *
 * @example
 * ```typescript
 * const assistantMessage: SessionMessage = {
 *   id: 'msg_001',
 *   sessionId: 'sess_abc123',
 *   role: 'assistant',
 *   content: 'Can you tell me about the significance of the Treaty of Versailles?',
 *   timestamp: new Date('2024-01-20T10:30:00Z'),
 *   tokenCount: 42,
 * };
 * ```
 */
export interface SessionMessage {
  /**
   * Unique identifier for the message.
   * Format: typically a prefixed UUID (e.g., 'msg_001')
   */
  id: string;

  /**
   * ID of the Session this message belongs to.
   * Establishes the parent-child relationship.
   */
  sessionId: string;

  /**
   * Who sent this message in the conversation.
   */
  role: MessageRole;

  /**
   * The text content of the message.
   * For system messages, this may contain structured instructions.
   * For user/assistant messages, this is the conversational text.
   */
  content: string;

  /**
   * When the message was created/sent.
   * Used for ordering messages and session timeline analysis.
   */
  timestamp: Date;

  /**
   * Number of tokens in the message, or null if not yet calculated.
   * Useful for:
   * - Tracking API usage costs
   * - Managing context window limits
   * - Analyzing message complexity patterns
   */
  tokenCount: number | null;
}

/**
 * Session represents a single study session reviewing recall points.
 *
 * Each Session targets specific recall points that are due for review
 * (based on FSRS scheduling) and tracks the conversation between the
 * user and the AI tutor as they work through the material.
 *
 * Sessions belong to a RecallSet, which provides the system prompt
 * that guides the AI's behavior during the conversation.
 *
 * @example
 * ```typescript
 * const session: Session = {
 *   id: 'sess_abc123',
 *   recallSetId: 'rs_xyz789',
 *   status: 'in_progress',
 *   targetRecallPointIds: ['rp_001', 'rp_002', 'rp_003'],
 *   startedAt: new Date('2024-01-20T10:30:00Z'),
 *   endedAt: null,
 * };
 * ```
 */
export interface Session {
  /**
   * Unique identifier for the session.
   * Format: typically a prefixed UUID (e.g., 'sess_abc123')
   */
  id: string;

  /**
   * ID of the RecallSet being studied in this session.
   * Determines which system prompt guides the AI conversation.
   */
  recallSetId: string;

  /**
   * Current lifecycle status of the session.
   */
  status: SessionStatus;

  /**
   * IDs of the recall points targeted for review in this session.
   * These are the specific items the FSRS algorithm determined were
   * due (or overdue) for review when the session started.
   */
  targetRecallPointIds: string[];

  /**
   * When the session began.
   */
  startedAt: Date;

  /**
   * When the session ended, or null if still in progress.
   * Set when status changes to 'completed' or 'abandoned'.
   */
  endedAt: Date | null;
}
