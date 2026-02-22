/**
 * Rabbithole Event Repository Implementation
 *
 * This module provides data access operations for RabbitholeEvent entities,
 * abstracting Drizzle ORM queries from business logic. It handles tracking
 * and analyzing conversational tangents ("rabbitholes") that occur during
 * recall sessions.
 *
 * Rabbitholes occur when the conversation diverges from the current recall
 * point into a related but distinct topic. Tracking them helps:
 * - Understand engagement patterns and natural curiosity
 * - Identify recall points that frequently trigger tangents
 * - Optimize session structure and flow
 * - Analyze whether tangents are beneficial or distracting
 *
 * Each rabbithole event tracks:
 * - The tangent topic
 * - Message indices (trigger and return points)
 * - Depth (nesting level of tangents)
 * - Related recall points
 * - Whether user or AI initiated the tangent
 * - Status (active, returned, abandoned)
 */

import { eq, and, desc, count, avg } from 'drizzle-orm';
import type { AppDatabase } from '../db';
import { rabbitholeEvents, sessions } from '../schema';
import type {
  RabbitholeEvent as DbRabbitholeEvent,
  NewRabbitholeEvent,
} from '../schema';

/**
 * Aggregated statistics for a frequently occurring rabbithole topic.
 * Useful for identifying which topics tend to trigger tangents.
 */
export interface TopicStats {
  /** The topic that triggered rabbitholes */
  topic: string;
  /** Number of times this topic appeared as a rabbithole */
  count: number;
  /** Average depth of rabbitholes for this topic (1-3 scale) */
  avgDepth: number;
}

/**
 * Repository for RabbitholeEvent entity data access operations.
 *
 * Provides methods for tracking conversational tangents during sessions,
 * updating their status, and analyzing patterns across multiple sessions.
 *
 * @example
 * ```typescript
 * const repo = new RabbitholeEventRepository(db);
 *
 * // Track a new rabbithole event
 * const event = await repo.create({
 *   id: 'rh_' + crypto.randomUUID(),
 *   sessionId: 'sess_abc123',
 *   topic: 'Economic impacts of reparations',
 *   triggerMessageIndex: 5,
 *   depth: 1,
 *   relatedRecallPointIds: ['rp_treaty_versailles_001'],
 *   userInitiated: true,
 *   status: 'active',
 *   createdAt: new Date(),
 * });
 *
 * // When conversation returns to main topic
 * await repo.update(event.id, {
 *   returnMessageIndex: 9,
 *   status: 'returned',
 * });
 *
 * // Analyze which topics trigger the most rabbitholes
 * const topTopics = await repo.getTopTopics('rs_abc123', 5);
 * ```
 */
export class RabbitholeEventRepository {
  /**
   * Creates a new RabbitholeEventRepository instance.
   *
   * @param db - The Drizzle database instance to use for queries
   */
  constructor(private readonly db: AppDatabase) {}

  /**
   * Creates a new rabbithole event.
   *
   * Call this when detecting that a conversation has diverged into
   * a tangent. The event starts with status 'active' and should be
   * updated when the conversation returns to the main topic.
   *
   * @param event - The rabbithole event data to store
   * @returns The created event record with all fields
   *
   * @example
   * ```typescript
   * const event = await repo.create({
   *   id: 'rh_' + crypto.randomUUID(),
   *   sessionId: 'sess_abc123',
   *   topic: 'Economic impacts of reparations',
   *   triggerMessageIndex: 5,
   *   depth: 1,
   *   relatedRecallPointIds: ['rp_treaty_versailles_001'],
   *   userInitiated: true,
   *   status: 'active',
   *   createdAt: new Date(),
   * });
   * ```
   */
  async create(event: NewRabbitholeEvent): Promise<DbRabbitholeEvent> {
    const result = await this.db
      .insert(rabbitholeEvents)
      .values(event)
      .returning();

    return result[0];
  }

  /**
   * Updates an existing rabbithole event.
   *
   * Most commonly used to mark a rabbithole as 'returned' when the
   * conversation successfully returns to the main topic, or 'abandoned'
   * if the session ends while still in the tangent.
   *
   * @param id - The unique identifier of the rabbithole event to update
   * @param updates - Partial data to update (status, returnMessageIndex, depth)
   * @returns The updated event record, or null if not found
   *
   * @example
   * ```typescript
   * // Mark rabbithole as returned
   * const updated = await repo.update('rh_abc123', {
   *   returnMessageIndex: 9,
   *   status: 'returned',
   * });
   *
   * // Mark rabbithole as abandoned (session ended in tangent)
   * await repo.update('rh_abc123', {
   *   status: 'abandoned',
   * });
   * ```
   */
  async update(
    id: string,
    updates: Partial<Pick<DbRabbitholeEvent, 'returnMessageIndex' | 'depth' | 'status' | 'relatedRecallPointIds' | 'conversation'>>
  ): Promise<DbRabbitholeEvent | null> {
    const result = await this.db
      .update(rabbitholeEvents)
      .set(updates)
      .where(eq(rabbitholeEvents.id, id))
      .returning();

    if (result.length === 0) {
      return null;
    }

    return result[0];
  }

  /**
   * T09: Convenience method to persist the RabbitholeAgent conversation on exit.
   *
   * Called by SessionEngine.exitRabbithole() after the user clicks
   * "Return to session". Stores the complete message history so it can be
   * reviewed or used for future analysis.
   *
   * @param id - The unique identifier of the rabbithole event
   * @param conversation - Array of { role, content } objects from RabbitholeAgent
   * @returns The updated event record, or null if not found
   */
  async updateConversation(
    id: string,
    conversation: Array<{ role: string; content: string }>
  ): Promise<DbRabbitholeEvent | null> {
    return this.update(id, { conversation });
  }

  /**
   * Retrieves all rabbithole events for a specific session.
   *
   * Returns events in the order they were created, which corresponds
   * to the order they occurred during the session.
   *
   * @param sessionId - The ID of the session to get events for
   * @returns Array of rabbithole events for the session (may be empty)
   *
   * @example
   * ```typescript
   * const events = await repo.findBySessionId('sess_abc123');
   * for (const event of events) {
   *   const statusEmoji = event.status === 'returned' ? 'returned' : 'ongoing';
   *   console.log(`${event.topic}: ${statusEmoji} (depth ${event.depth})`);
   * }
   * ```
   */
  async findBySessionId(sessionId: string): Promise<DbRabbitholeEvent[]> {
    return await this.db
      .select()
      .from(rabbitholeEvents)
      .where(eq(rabbitholeEvents.sessionId, sessionId));
  }

  /**
   * Retrieves all active (unresolved) rabbithole events for a session.
   *
   * Active rabbitholes are those where the conversation hasn't yet
   * returned to the main topic. Useful for detecting nested tangents
   * and managing session flow.
   *
   * @param sessionId - The ID of the session to get active events for
   * @returns Array of active rabbithole events (may be empty)
   *
   * @example
   * ```typescript
   * const active = await repo.findActiveBySessionId('sess_abc123');
   * if (active.length > 0) {
   *   console.log(`Currently in ${active.length} rabbithole(s)`);
   *   const deepest = Math.max(...active.map(e => e.depth));
   *   console.log(`Deepest nesting level: ${deepest}`);
   * }
   * ```
   */
  async findActiveBySessionId(sessionId: string): Promise<DbRabbitholeEvent[]> {
    return await this.db
      .select()
      .from(rabbitholeEvents)
      .where(
        and(
          eq(rabbitholeEvents.sessionId, sessionId),
          eq(rabbitholeEvents.status, 'active')
        )
      );
  }

  /**
   * Gets the most frequently occurring rabbithole topics for a recall set.
   *
   * Analyzes rabbithole events across all sessions in the recall set
   * to identify which topics most commonly trigger tangents. Useful for
   * understanding engagement patterns and potentially restructuring
   * recall points to better address common curiosities.
   *
   * @param recallSetId - The ID of the recall set to analyze
   * @param limit - Maximum number of topics to return (default 10)
   * @returns Array of topic statistics, ordered by count descending
   *
   * @example
   * ```typescript
   * const topTopics = await repo.getTopTopics('rs_abc123', 5);
   * console.log('Most common rabbithole topics:');
   * for (const topic of topTopics) {
   *   console.log(`  "${topic.topic}": ${topic.count} times (avg depth: ${topic.avgDepth.toFixed(1)})`);
   * }
   * ```
   */
  async getTopTopics(
    recallSetId: string,
    limit: number = 10
  ): Promise<TopicStats[]> {
    // Join with sessions to filter by recall set, then aggregate by topic
    const results = await this.db
      .select({
        topic: rabbitholeEvents.topic,
        count: count(rabbitholeEvents.id),
        avgDepth: avg(rabbitholeEvents.depth),
      })
      .from(rabbitholeEvents)
      .innerJoin(sessions, eq(rabbitholeEvents.sessionId, sessions.id))
      .where(eq(sessions.recallSetId, recallSetId))
      .groupBy(rabbitholeEvents.topic)
      .orderBy(desc(count(rabbitholeEvents.id)))
      .limit(limit);

    return results.map((row) => ({
      topic: row.topic,
      count: Number(row.count) || 0,
      avgDepth: Number(row.avgDepth) || 0,
    }));
  }

  /**
   * Retrieves a single rabbithole event by its ID.
   *
   * @param id - The unique identifier of the rabbithole event
   * @returns The rabbithole event if found, or null if not found
   */
  async findById(id: string): Promise<DbRabbitholeEvent | null> {
    const result = await this.db
      .select()
      .from(rabbitholeEvents)
      .where(eq(rabbitholeEvents.id, id))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return result[0];
  }

  /**
   * Marks all active rabbitholes in a session as abandoned.
   *
   * Call this when a session ends (completed or abandoned) to ensure
   * no rabbithole events remain in 'active' status. This maintains
   * data integrity for analytics.
   *
   * @param sessionId - The ID of the session to finalize
   * @returns Number of rabbithole events marked as abandoned
   *
   * @example
   * ```typescript
   * // When session ends
   * const abandonedCount = await repo.markActiveAsAbandoned('sess_abc123');
   * if (abandonedCount > 0) {
   *   console.log(`${abandonedCount} rabbithole(s) were still active when session ended`);
   * }
   * ```
   */
  async markActiveAsAbandoned(sessionId: string): Promise<number> {
    const result = await this.db
      .update(rabbitholeEvents)
      .set({ status: 'abandoned' })
      .where(
        and(
          eq(rabbitholeEvents.sessionId, sessionId),
          eq(rabbitholeEvents.status, 'active')
        )
      )
      .returning({ id: rabbitholeEvents.id });

    return result.length;
  }

  /**
   * Deletes all rabbithole events for a session.
   *
   * WARNING: This permanently removes event data. Typically used
   * when deleting a session and its associated data.
   *
   * @param sessionId - The ID of the session whose events to delete
   * @returns Number of events deleted
   */
  async deleteBySessionId(sessionId: string): Promise<number> {
    const result = await this.db
      .delete(rabbitholeEvents)
      .where(eq(rabbitholeEvents.sessionId, sessionId))
      .returning({ id: rabbitholeEvents.id });

    return result.length;
  }
}
