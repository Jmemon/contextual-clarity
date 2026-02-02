/**
 * Session Repository Implementation
 *
 * This module provides data access operations for Session entities,
 * abstracting Drizzle ORM queries from business logic. It handles the
 * mapping between database rows and domain models.
 *
 * Sessions represent individual study encounters where users review
 * due recall points through AI-powered Socratic dialogues. They track
 * engagement and maintain conversation history.
 */

import { eq, and } from 'drizzle-orm';
import type { AppDatabase } from '../db';
import { sessions } from '../schema';
import type { Session, SessionStatus } from '@/core/models';
import type { Repository } from './base';

/**
 * Input type for creating a new Session.
 * Status defaults to 'in_progress' and endedAt starts as null.
 */
export interface CreateSessionInput {
  /** Unique identifier - typically a prefixed UUID (e.g., 'sess_abc123') */
  id: string;
  /** ID of the RecallSet being studied in this session */
  recallSetId: string;
  /** IDs of recall points targeted for review */
  targetRecallPointIds: string[];
  /** When the session started (defaults to now if not provided) */
  startedAt?: Date;
}

/**
 * Input type for updating an existing Session.
 * Most updates should use the specialized complete/abandon methods.
 */
export interface UpdateSessionInput {
  /** Current lifecycle status */
  status?: SessionStatus;
  /** When the session ended */
  endedAt?: Date;
}

/**
 * Maps a database row to a Session domain model.
 *
 * @param row - Raw database row from Drizzle query
 * @returns Session domain model with proper Date objects
 */
function mapToDomain(row: typeof sessions.$inferSelect): Session {
  return {
    id: row.id,
    recallSetId: row.recallSetId,
    status: row.status,
    targetRecallPointIds: row.targetRecallPointIds,
    // Drizzle's timestamp_ms mode already returns Date objects
    startedAt: row.startedAt,
    endedAt: row.endedAt,
  };
}

/**
 * Repository for Session entity data access operations.
 *
 * Provides CRUD operations plus specialized methods for session lifecycle
 * management (finding in-progress sessions, completing, abandoning).
 *
 * @example
 * ```typescript
 * const repo = new SessionRepository(db);
 *
 * // Start a new session
 * const session = await repo.create({
 *   id: 'sess_' + crypto.randomUUID(),
 *   recallSetId: 'rs_abc123',
 *   targetRecallPointIds: ['rp_001', 'rp_002'],
 * });
 *
 * // Check for an existing in-progress session
 * const existing = await repo.findInProgress('rs_abc123');
 *
 * // Complete the session
 * await repo.complete(session.id);
 * ```
 */
export class SessionRepository
  implements Repository<Session, CreateSessionInput, UpdateSessionInput>
{
  /**
   * Creates a new SessionRepository instance.
   *
   * @param db - The Drizzle database instance to use for queries
   */
  constructor(private readonly db: AppDatabase) {}

  /**
   * Retrieves a session by its unique identifier.
   *
   * @param id - The unique identifier of the session
   * @returns The Session domain model if found, or null if not found
   */
  async findById(id: string): Promise<Session | null> {
    const result = await this.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, id))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return mapToDomain(result[0]);
  }

  /**
   * Retrieves all sessions.
   *
   * @returns Array of all Session domain models (may be empty)
   */
  async findAll(): Promise<Session[]> {
    const results = await this.db.select().from(sessions);
    return results.map(mapToDomain);
  }

  /**
   * Finds an in-progress session for a specific recall set.
   *
   * Only one session should be in-progress at a time for each recall set.
   * This is used to resume interrupted sessions or prevent multiple
   * concurrent sessions for the same set.
   *
   * @param recallSetId - The ID of the recall set to check
   * @returns The in-progress Session if found, or null if none exists
   *
   * @example
   * ```typescript
   * const inProgress = await repo.findInProgress('rs_abc123');
   * if (inProgress) {
   *   console.log('Resuming session:', inProgress.id);
   * } else {
   *   console.log('No session in progress, starting new one');
   * }
   * ```
   */
  async findInProgress(recallSetId: string): Promise<Session | null> {
    const result = await this.db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.recallSetId, recallSetId),
          eq(sessions.status, 'in_progress')
        )
      )
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return mapToDomain(result[0]);
  }

  /**
   * Creates a new session.
   *
   * Sessions start with status 'in_progress' and endedAt as null.
   *
   * @param input - The data for creating the new session
   * @returns The created Session domain model
   */
  async create(input: CreateSessionInput): Promise<Session> {
    const result = await this.db
      .insert(sessions)
      .values({
        id: input.id,
        recallSetId: input.recallSetId,
        status: 'in_progress',
        targetRecallPointIds: input.targetRecallPointIds,
        startedAt: input.startedAt ?? new Date(),
        endedAt: null,
      })
      .returning();

    return mapToDomain(result[0]);
  }

  /**
   * Updates an existing session.
   *
   * For most status updates, prefer using the specialized complete()
   * or abandon() methods instead.
   *
   * @param id - The unique identifier of the session to update
   * @param input - The partial data to update
   * @returns The updated Session domain model
   * @throws Error if the session with the given id does not exist
   */
  async update(id: string, input: UpdateSessionInput): Promise<Session> {
    const result = await this.db
      .update(sessions)
      .set(input)
      .where(eq(sessions.id, id))
      .returning();

    if (result.length === 0) {
      throw new Error(`Session with id '${id}' not found`);
    }

    return mapToDomain(result[0]);
  }

  /**
   * Marks a session as completed.
   *
   * Sets the status to 'completed' and records the end time.
   * Use this when all target recall points have been reviewed.
   *
   * @param id - The unique identifier of the session to complete
   * @throws Error if the session does not exist
   *
   * @example
   * ```typescript
   * // After reviewing all points
   * await repo.complete('sess_abc123');
   * ```
   */
  async complete(id: string): Promise<void> {
    const result = await this.db
      .update(sessions)
      .set({
        status: 'completed',
        endedAt: new Date(),
      })
      .where(eq(sessions.id, id))
      .returning({ id: sessions.id });

    if (result.length === 0) {
      throw new Error(`Session with id '${id}' not found`);
    }
  }

  /**
   * Marks a session as abandoned.
   *
   * Sets the status to 'abandoned' and records the end time.
   * Use this when a session is stopped before completion.
   *
   * @param id - The unique identifier of the session to abandon
   * @throws Error if the session does not exist
   *
   * @example
   * ```typescript
   * // User stopped the session early
   * await repo.abandon('sess_abc123');
   * ```
   */
  async abandon(id: string): Promise<void> {
    const result = await this.db
      .update(sessions)
      .set({
        status: 'abandoned',
        endedAt: new Date(),
      })
      .where(eq(sessions.id, id))
      .returning({ id: sessions.id });

    if (result.length === 0) {
      throw new Error(`Session with id '${id}' not found`);
    }
  }

  /**
   * Permanently deletes a session.
   *
   * WARNING: This will fail if there are session messages referencing
   * this session due to foreign key constraints.
   *
   * @param id - The unique identifier of the session to delete
   * @throws Error if the session does not exist or has dependencies
   */
  async delete(id: string): Promise<void> {
    const result = await this.db
      .delete(sessions)
      .where(eq(sessions.id, id))
      .returning({ id: sessions.id });

    if (result.length === 0) {
      throw new Error(`Session with id '${id}' not found`);
    }
  }
}
