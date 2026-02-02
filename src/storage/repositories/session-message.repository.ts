/**
 * SessionMessage Repository Implementation
 *
 * This module provides data access operations for SessionMessage entities,
 * abstracting Drizzle ORM queries from business logic. It handles the
 * mapping between database rows and domain models.
 *
 * SessionMessages store the conversation history within recall sessions,
 * enabling context-aware AI responses and allowing users to review
 * past interactions.
 */

import { eq } from 'drizzle-orm';
import type { AppDatabase } from '../db';
import { sessionMessages } from '../schema';
import type { SessionMessage, MessageRole } from '@/core/models';
import type { Repository } from './base';

/**
 * Input type for creating a new SessionMessage.
 */
export interface CreateSessionMessageInput {
  /** Unique identifier - typically a prefixed UUID (e.g., 'msg_001') */
  id: string;
  /** ID of the parent session */
  sessionId: string;
  /** Who sent this message: 'user', 'assistant', or 'system' */
  role: MessageRole;
  /** The text content of the message */
  content: string;
  /** When the message was sent (defaults to now if not provided) */
  timestamp?: Date;
  /** Number of tokens in the message (optional, for cost tracking) */
  tokenCount?: number | null;
}

/**
 * Input type for updating an existing SessionMessage.
 * In practice, messages are typically immutable after creation.
 */
export interface UpdateSessionMessageInput {
  /** The text content of the message */
  content?: string;
  /** Number of tokens in the message */
  tokenCount?: number | null;
}

/**
 * Maps a database row to a SessionMessage domain model.
 *
 * @param row - Raw database row from Drizzle query
 * @returns SessionMessage domain model with proper Date objects
 */
function mapToDomain(row: typeof sessionMessages.$inferSelect): SessionMessage {
  return {
    id: row.id,
    sessionId: row.sessionId,
    role: row.role,
    content: row.content,
    // Drizzle's timestamp_ms mode already returns Date objects
    timestamp: row.timestamp,
    tokenCount: row.tokenCount,
  };
}

/**
 * Repository for SessionMessage entity data access operations.
 *
 * Provides CRUD operations plus the ability to retrieve all messages
 * for a session, which is essential for building conversation context.
 *
 * @example
 * ```typescript
 * const repo = new SessionMessageRepository(db);
 *
 * // Add a user message
 * await repo.create({
 *   id: 'msg_' + crypto.randomUUID(),
 *   sessionId: 'sess_abc123',
 *   role: 'user',
 *   content: 'The Treaty of Versailles ended World War I.',
 * });
 *
 * // Get all messages for a session (for AI context)
 * const history = await repo.findBySessionId('sess_abc123');
 * ```
 */
export class SessionMessageRepository
  implements
    Repository<SessionMessage, CreateSessionMessageInput, UpdateSessionMessageInput>
{
  /**
   * Creates a new SessionMessageRepository instance.
   *
   * @param db - The Drizzle database instance to use for queries
   */
  constructor(private readonly db: AppDatabase) {}

  /**
   * Retrieves a session message by its unique identifier.
   *
   * @param id - The unique identifier of the message
   * @returns The SessionMessage domain model if found, or null if not found
   */
  async findById(id: string): Promise<SessionMessage | null> {
    const result = await this.db
      .select()
      .from(sessionMessages)
      .where(eq(sessionMessages.id, id))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return mapToDomain(result[0]);
  }

  /**
   * Retrieves all session messages.
   *
   * Note: For most use cases, prefer findBySessionId for scoped queries.
   *
   * @returns Array of all SessionMessage domain models (may be empty)
   */
  async findAll(): Promise<SessionMessage[]> {
    const results = await this.db.select().from(sessionMessages);
    return results.map(mapToDomain);
  }

  /**
   * Retrieves all messages for a specific session in chronological order.
   *
   * This is the primary method for building conversation context when
   * generating AI responses. Messages are returned in timestamp order.
   *
   * @param sessionId - The ID of the session to get messages for
   * @returns Array of SessionMessage domain models, ordered by timestamp
   *
   * @example
   * ```typescript
   * // Build conversation history for AI context
   * const messages = await repo.findBySessionId('sess_abc123');
   * const aiContext = messages.map(m => ({
   *   role: m.role,
   *   content: m.content,
   * }));
   * ```
   */
  async findBySessionId(sessionId: string): Promise<SessionMessage[]> {
    const results = await this.db
      .select()
      .from(sessionMessages)
      .where(eq(sessionMessages.sessionId, sessionId))
      .orderBy(sessionMessages.timestamp);

    return results.map(mapToDomain);
  }

  /**
   * Creates a new session message.
   *
   * @param input - The data for creating the new message
   * @returns The created SessionMessage domain model
   */
  async create(input: CreateSessionMessageInput): Promise<SessionMessage> {
    const result = await this.db
      .insert(sessionMessages)
      .values({
        id: input.id,
        sessionId: input.sessionId,
        role: input.role,
        content: input.content,
        timestamp: input.timestamp ?? new Date(),
        tokenCount: input.tokenCount ?? null,
      })
      .returning();

    return mapToDomain(result[0]);
  }

  /**
   * Updates an existing session message.
   *
   * Note: Messages are typically immutable in conversation systems.
   * This method exists primarily for correcting token counts or
   * administrative purposes.
   *
   * @param id - The unique identifier of the message to update
   * @param input - The partial data to update
   * @returns The updated SessionMessage domain model
   * @throws Error if the message with the given id does not exist
   */
  async update(
    id: string,
    input: UpdateSessionMessageInput
  ): Promise<SessionMessage> {
    const result = await this.db
      .update(sessionMessages)
      .set(input)
      .where(eq(sessionMessages.id, id))
      .returning();

    if (result.length === 0) {
      throw new Error(`SessionMessage with id '${id}' not found`);
    }

    return mapToDomain(result[0]);
  }

  /**
   * Permanently deletes a session message.
   *
   * Note: Deleting messages can break conversation context continuity.
   * Use with caution.
   *
   * @param id - The unique identifier of the message to delete
   * @throws Error if the message does not exist
   */
  async delete(id: string): Promise<void> {
    const result = await this.db
      .delete(sessionMessages)
      .where(eq(sessionMessages.id, id))
      .returning({ id: sessionMessages.id });

    if (result.length === 0) {
      throw new Error(`SessionMessage with id '${id}' not found`);
    }
  }
}
