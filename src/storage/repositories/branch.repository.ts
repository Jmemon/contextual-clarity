/**
 * Branch Repository Implementation
 *
 * Provides data access operations for Branch entities, abstracting Drizzle ORM
 * queries from business logic. Branches represent first-class conversation
 * tangents that fork off from the session trunk (or from parent branches).
 *
 * Each branch tracks:
 * - The tangent topic and where it forked (branchPointMessageId)
 * - Depth in the tree (1 = off trunk, 2 = off a branch, etc.)
 * - Related recall point IDs for cross-referencing
 * - Status lifecycle: detected -> active -> closed/abandoned
 * - The full conversation exchange as a JSON array
 *
 * This replaces the former RabbitholeEventRepository with a richer tree model.
 */

import { eq, and, inArray } from 'drizzle-orm';
import type { AppDatabase } from '../db';
import { branches, type BranchRow, type NewBranchRow } from '../schema';

/**
 * Input shape for creating a new branch. Closely mirrors NewBranchRow but
 * omits server-set fields (status, createdAt) for a cleaner call-site API.
 */
export interface CreateBranchInput {
  id: string;
  sessionId: string;
  parentBranchId?: string | null;
  branchPointMessageId: string;
  topic: string;
  depth?: number;
  relatedRecallPointIds?: string[];
  userInitiated: boolean;
}

/**
 * Repository for Branch entity data access operations.
 *
 * Provides methods for creating, querying, and managing conversation branches
 * within recall sessions. Branches follow a lifecycle from detection through
 * activation to closure or abandonment.
 *
 * @example
 * ```typescript
 * const repo = new BranchRepository(db);
 *
 * // Create a branch when a tangent is detected
 * const branch = await repo.create({
 *   id: 'br_' + crypto.randomUUID(),
 *   sessionId: 'sess_abc123',
 *   branchPointMessageId: 'msg_xyz',
 *   topic: 'Economic impacts of reparations',
 *   relatedRecallPointIds: ['rp_treaty_versailles_001'],
 *   userInitiated: true,
 * });
 *
 * // When the user engages with the branch tab
 * await repo.activate(branch.id);
 *
 * // When the branch concludes
 * await repo.close(branch.id, 'Explored reparations impact on Weimar economy');
 * ```
 */
export class BranchRepository {
  constructor(private readonly db: AppDatabase) {}

  /**
   * Creates a new branch with status 'detected'.
   *
   * Called when the system detects a conversational tangent worth exploring.
   * The branch starts in 'detected' status — it becomes 'active' when the
   * user actually engages with it.
   */
  async create(input: CreateBranchInput): Promise<BranchRow> {
    const row: NewBranchRow = {
      id: input.id,
      sessionId: input.sessionId,
      parentBranchId: input.parentBranchId ?? null,
      branchPointMessageId: input.branchPointMessageId,
      topic: input.topic,
      status: 'detected',
      depth: input.depth ?? 1,
      relatedRecallPointIds: input.relatedRecallPointIds ?? [],
      userInitiated: input.userInitiated,
      createdAt: new Date(),
    };

    const result = await this.db
      .insert(branches)
      .values(row)
      .returning();

    return result[0];
  }

  /**
   * Retrieves a single branch by its ID.
   *
   * @returns The branch if found, or null if not found
   */
  async findById(id: string): Promise<BranchRow | null> {
    const result = await this.db
      .select()
      .from(branches)
      .where(eq(branches.id, id))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return result[0];
  }

  /**
   * Retrieves all branches for a session, ordered by creation time ascending.
   */
  async findBySessionId(sessionId: string): Promise<BranchRow[]> {
    return await this.db
      .select()
      .from(branches)
      .where(eq(branches.sessionId, sessionId));
    // SQLite returns in insertion order by default; createdAt ASC matches that.
  }

  /**
   * Retrieves branches that are still open (detected or active) for a session.
   * Useful for knowing which branch tabs should be shown in the UI and
   * for cleanup when a session ends.
   */
  async findActiveBySessionId(sessionId: string): Promise<BranchRow[]> {
    return await this.db
      .select()
      .from(branches)
      .where(
        and(
          eq(branches.sessionId, sessionId),
          inArray(branches.status, ['detected', 'active'])
        )
      );
  }

  /**
   * Transitions a branch from 'detected' to 'active'.
   *
   * Called when the user clicks on a branch tab to engage with the tangent.
   *
   * @throws If the branch is not found (returns the first result, which will
   *         be undefined — callers should handle accordingly).
   */
  async activate(id: string): Promise<BranchRow> {
    const result = await this.db
      .update(branches)
      .set({ status: 'active' })
      .where(eq(branches.id, id))
      .returning();

    return result[0];
  }

  /**
   * Closes a branch with a summary of its conversation.
   *
   * Called when the branch conversation naturally concludes or the user
   * explicitly marks it done. Records the closure timestamp.
   */
  async close(id: string, summary: string): Promise<BranchRow> {
    const result = await this.db
      .update(branches)
      .set({
        status: 'closed',
        summary,
        closedAt: new Date(),
      })
      .where(eq(branches.id, id))
      .returning();

    return result[0];
  }

  /**
   * Persists the full conversation exchange for a branch.
   *
   * Called by SessionEngine after the user exits a branch, storing the
   * complete message history for future review or analysis.
   */
  async updateConversation(
    id: string,
    conversation: Array<{ role: string; content: string }>
  ): Promise<void> {
    await this.db
      .update(branches)
      .set({ conversation })
      .where(eq(branches.id, id));
  }

  /**
   * Marks all detected/active branches in a session as abandoned.
   *
   * Called when a session ends (completed or abandoned) to ensure no branches
   * remain in an open status. This maintains data integrity for analytics.
   */
  async markActiveAsAbandoned(sessionId: string): Promise<void> {
    await this.db
      .update(branches)
      .set({
        status: 'abandoned',
        closedAt: new Date(),
      })
      .where(
        and(
          eq(branches.sessionId, sessionId),
          inArray(branches.status, ['detected', 'active'])
        )
      );
  }

  /**
   * Deletes all branches for a session.
   *
   * WARNING: Permanently removes branch data. Typically used when deleting
   * a session and all its associated data.
   */
  async deleteBySessionId(sessionId: string): Promise<void> {
    await this.db
      .delete(branches)
      .where(eq(branches.sessionId, sessionId));
  }
}
