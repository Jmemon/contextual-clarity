/**
 * Recall Outcome Repository Implementation
 *
 * This module provides data access operations for RecallOutcome entities,
 * abstracting Drizzle ORM queries from business logic. It handles storing
 * and querying the detailed results of individual recall attempts within sessions.
 *
 * RecallOutcomes capture granular data about each recall point tested during
 * a session, including:
 * - Whether recall was successful
 * - User confidence level
 * - Self-rated difficulty (FSRS-style ratings)
 * - AI reasoning for the assessment
 * - Message indices marking the conversation segment
 * - Time spent on the recall attempt
 *
 * This granular data enables detailed analysis of which recall points need
 * more practice and tracking of confidence calibration over time.
 */

import { eq, avg, count, sum, sql } from 'drizzle-orm';
import type { AppDatabase } from '../db';
import { recallOutcomes } from '../schema';
import type {
  RecallOutcome as DbRecallOutcome,
  NewRecallOutcome,
} from '../schema';

/**
 * Statistics for a specific recall point across all sessions.
 * Provides aggregate data to understand how well a recall point
 * is being learned over time.
 */
export interface RecallPointStats {
  /** Total number of times this recall point was attempted */
  totalAttempts: number;
  /** Number of successful recall attempts */
  successCount: number;
  /** Average confidence score across all attempts (0.0 to 1.0) */
  avgConfidence: number;
}

/**
 * Repository for RecallOutcome entity data access operations.
 *
 * Provides methods for storing and querying individual recall attempt
 * results. Supports both session-level queries (all outcomes for a session)
 * and recall point-level queries (history of attempts for a specific point).
 *
 * @example
 * ```typescript
 * const repo = new RecallOutcomeRepository(db);
 *
 * // Store outcomes after evaluating recall in a session
 * const outcomes = await repo.createMany([
 *   {
 *     id: 'ro_' + crypto.randomUUID(),
 *     sessionId: 'sess_abc123',
 *     recallPointId: 'rp_001',
 *     success: true,
 *     confidence: 0.9,
 *     rating: 'good',
 *     messageIndexStart: 3,
 *     messageIndexEnd: 8,
 *     timeSpentMs: 45000,
 *     createdAt: new Date(),
 *   },
 *   // ... more outcomes
 * ]);
 *
 * // Get statistics for a recall point
 * const stats = await repo.getStatsForRecallPoint('rp_001');
 * console.log(`Success rate: ${(stats.successCount / stats.totalAttempts * 100).toFixed(1)}%`);
 * ```
 */
export class RecallOutcomeRepository {
  /**
   * Creates a new RecallOutcomeRepository instance.
   *
   * @param db - The Drizzle database instance to use for queries
   */
  constructor(private readonly db: AppDatabase) {}

  /**
   * Stores a single recall outcome.
   *
   * Use this when processing outcomes one at a time. For batch
   * processing (more common), use createMany instead.
   *
   * @param outcome - The recall outcome data to store
   * @returns The created outcome record with all fields
   *
   * @example
   * ```typescript
   * const outcome = await repo.create({
   *   id: 'ro_' + crypto.randomUUID(),
   *   sessionId: 'sess_abc123',
   *   recallPointId: 'rp_001',
   *   success: true,
   *   confidence: 0.9,
   *   rating: 'good',
   *   reasoning: 'User correctly identified key concepts with minimal hints.',
   *   messageIndexStart: 3,
   *   messageIndexEnd: 8,
   *   timeSpentMs: 45000,
   *   createdAt: new Date(),
   * });
   * ```
   */
  async create(outcome: NewRecallOutcome): Promise<DbRecallOutcome> {
    const result = await this.db
      .insert(recallOutcomes)
      .values(outcome)
      .returning();

    return result[0];
  }

  /**
   * Stores multiple recall outcomes in a single transaction.
   *
   * This is the preferred method when storing outcomes after a session
   * completes, as it's more efficient than multiple individual inserts.
   *
   * @param outcomes - Array of recall outcome data to store
   * @returns Array of created outcome records with all fields
   *
   * @example
   * ```typescript
   * const outcomes = await repo.createMany([
   *   {
   *     id: 'ro_' + crypto.randomUUID(),
   *     sessionId: 'sess_abc123',
   *     recallPointId: 'rp_001',
   *     success: true,
   *     confidence: 0.9,
   *     rating: 'good',
   *     messageIndexStart: 3,
   *     messageIndexEnd: 8,
   *     timeSpentMs: 45000,
   *     createdAt: new Date(),
   *   },
   *   {
   *     id: 'ro_' + crypto.randomUUID(),
   *     sessionId: 'sess_abc123',
   *     recallPointId: 'rp_002',
   *     success: false,
   *     confidence: 0.6,
   *     rating: 'hard',
   *     messageIndexStart: 9,
   *     messageIndexEnd: 15,
   *     timeSpentMs: 60000,
   *     createdAt: new Date(),
   *   },
   * ]);
   * ```
   */
  async createMany(outcomes: NewRecallOutcome[]): Promise<DbRecallOutcome[]> {
    // Handle empty array case - nothing to insert
    if (outcomes.length === 0) {
      return [];
    }

    const result = await this.db
      .insert(recallOutcomes)
      .values(outcomes)
      .returning();

    return result;
  }

  /**
   * Retrieves all recall outcomes for a specific session.
   *
   * Returns outcomes in the order they were created, which typically
   * corresponds to the order recall points were addressed in the session.
   *
   * @param sessionId - The ID of the session to get outcomes for
   * @returns Array of recall outcomes for the session (may be empty)
   *
   * @example
   * ```typescript
   * const outcomes = await repo.findBySessionId('sess_abc123');
   * for (const outcome of outcomes) {
   *   const status = outcome.success ? 'Recalled' : 'Forgot';
   *   console.log(`${outcome.recallPointId}: ${status} (${outcome.confidence * 100}% confidence)`);
   * }
   * ```
   */
  async findBySessionId(sessionId: string): Promise<DbRecallOutcome[]> {
    return await this.db
      .select()
      .from(recallOutcomes)
      .where(eq(recallOutcomes.sessionId, sessionId));
  }

  /**
   * Retrieves all recall outcomes for a specific recall point.
   *
   * Returns the complete history of attempts for a recall point across
   * all sessions. Useful for analyzing how a specific piece of knowledge
   * is being retained over time.
   *
   * @param recallPointId - The ID of the recall point to get outcomes for
   * @returns Array of recall outcomes for the recall point (may be empty)
   *
   * @example
   * ```typescript
   * const history = await repo.findByRecallPointId('rp_001');
   * console.log(`Total attempts: ${history.length}`);
   * const successCount = history.filter(o => o.success).length;
   * console.log(`Success rate: ${(successCount / history.length * 100).toFixed(1)}%`);
   * ```
   */
  async findByRecallPointId(recallPointId: string): Promise<DbRecallOutcome[]> {
    return await this.db
      .select()
      .from(recallOutcomes)
      .where(eq(recallOutcomes.recallPointId, recallPointId));
  }

  /**
   * Gets aggregate statistics for a specific recall point.
   *
   * Calculates key metrics across all attempts for a recall point,
   * useful for identifying which points need more practice and for
   * tracking improvement over time.
   *
   * @param recallPointId - The ID of the recall point to get stats for
   * @returns Aggregate statistics for the recall point
   *
   * @example
   * ```typescript
   * const stats = await repo.getStatsForRecallPoint('rp_001');
   * const successRate = stats.totalAttempts > 0
   *   ? (stats.successCount / stats.totalAttempts * 100).toFixed(1)
   *   : 'N/A';
   * console.log(`Recall point stats:`);
   * console.log(`  Total attempts: ${stats.totalAttempts}`);
   * console.log(`  Success rate: ${successRate}%`);
   * console.log(`  Avg confidence: ${(stats.avgConfidence * 100).toFixed(1)}%`);
   * ```
   */
  async getStatsForRecallPoint(recallPointId: string): Promise<RecallPointStats> {
    // Use SQL aggregation for efficient statistics calculation
    // Count successes by summing boolean (1 for true, 0 for false)
    const result = await this.db
      .select({
        totalAttempts: count(recallOutcomes.id),
        successCount: sum(
          sql<number>`CASE WHEN ${recallOutcomes.success} = 1 THEN 1 ELSE 0 END`
        ),
        avgConfidence: avg(recallOutcomes.confidence),
      })
      .from(recallOutcomes)
      .where(eq(recallOutcomes.recallPointId, recallPointId));

    const row = result[0];

    // Handle case where no outcomes exist yet (all aggregates will be null)
    return {
      totalAttempts: Number(row.totalAttempts) || 0,
      successCount: Number(row.successCount) || 0,
      avgConfidence: Number(row.avgConfidence) || 0,
    };
  }

  /**
   * Retrieves a single recall outcome by its ID.
   *
   * @param id - The unique identifier of the recall outcome
   * @returns The recall outcome if found, or null if not found
   */
  async findById(id: string): Promise<DbRecallOutcome | null> {
    const result = await this.db
      .select()
      .from(recallOutcomes)
      .where(eq(recallOutcomes.id, id))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return result[0];
  }

  /**
   * Deletes all recall outcomes for a session.
   *
   * WARNING: This permanently removes outcome data. Typically used
   * when deleting a session and its associated data.
   *
   * @param sessionId - The ID of the session whose outcomes to delete
   * @returns Number of outcomes deleted
   */
  async deleteBySessionId(sessionId: string): Promise<number> {
    const result = await this.db
      .delete(recallOutcomes)
      .where(eq(recallOutcomes.sessionId, sessionId))
      .returning({ id: recallOutcomes.id });

    return result.length;
  }
}
