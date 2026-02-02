/**
 * RecallSet Domain Types
 *
 * A RecallSet represents a thematic collection of related recall points that share
 * a common context or subject matter. For example, a RecallSet might contain all
 * the key concepts from a specific chapter of a textbook, a programming language's
 * core features, or vocabulary words from a language learning course.
 *
 * RecallSets provide organizational structure and allow users to:
 * - Group related concepts for focused study sessions
 * - Define custom discussion prompts that guide AI-powered Socratic dialogues
 * - Track learning progress at the collection level
 * - Pause or archive sets when needed (e.g., exam completed, topic mastered)
 *
 * This module contains only pure TypeScript types with no runtime dependencies,
 * forming the contract between all modules that work with recall sets.
 */

/**
 * Represents the lifecycle status of a RecallSet.
 *
 * - 'active': The set is currently being studied; recall points are scheduled
 * - 'paused': Temporarily suspended from scheduling; useful during breaks or
 *             when focusing on other material
 * - 'archived': Permanently removed from active study; retained for historical
 *               reference but no longer included in review sessions
 */
export type RecallSetStatus = 'active' | 'paused' | 'archived';

/**
 * RecallSet represents a thematic collection of recall points.
 *
 * Each RecallSet groups related concepts that share a common subject or context.
 * The discussionSystemPrompt allows customization of how the AI conducts
 * Socratic dialogues for this particular set of material.
 *
 * @example
 * ```typescript
 * const historySet: RecallSet = {
 *   id: 'rs_abc123',
 *   name: 'World War II Key Events',
 *   description: 'Major battles, treaties, and turning points of WWII',
 *   status: 'active',
 *   discussionSystemPrompt: 'You are a history teacher helping the student recall key WWII events through discussion.',
 *   createdAt: new Date('2024-01-15'),
 *   updatedAt: new Date('2024-01-15'),
 * };
 * ```
 */
export interface RecallSet {
  /**
   * Unique identifier for the recall set.
   * Format: typically a prefixed UUID (e.g., 'rs_abc123')
   */
  id: string;

  /**
   * Human-readable name for the recall set.
   * Should be concise but descriptive (e.g., "JavaScript Fundamentals")
   */
  name: string;

  /**
   * Detailed description of what this recall set covers.
   * Helps users understand the scope and purpose of the collection.
   */
  description: string;

  /**
   * Current lifecycle status of the recall set.
   * Determines whether recall points are included in scheduling.
   */
  status: RecallSetStatus;

  /**
   * System prompt used when conducting AI discussions for this set.
   * Allows customization of the AI's persona, teaching style, and domain expertise
   * to match the subject matter of the recall set.
   */
  discussionSystemPrompt: string;

  /**
   * Timestamp when the recall set was created.
   */
  createdAt: Date;

  /**
   * Timestamp of the last modification to the recall set.
   * Updated when name, description, status, or prompt changes.
   */
  updatedAt: Date;
}
