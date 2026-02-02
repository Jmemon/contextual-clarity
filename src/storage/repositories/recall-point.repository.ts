/**
 * RecallPoint Repository Implementation
 *
 * This module provides data access operations for RecallPoint entities,
 * abstracting Drizzle ORM queries from business logic. It handles the
 * complex mapping between the flat database schema (with individual FSRS
 * columns) and the nested domain model (with FSRSState object).
 *
 * RecallPoints are individual pieces of knowledge tracked using the FSRS
 * (Free Spaced Repetition Scheduler) algorithm for optimal review timing.
 */

import { eq, lte, and } from 'drizzle-orm';
import type { AppDatabase } from '../db';
import { recallPoints } from '../schema';
import type {
  RecallPoint,
  FSRSState,
  RecallAttempt,
} from '@/core/models';
import type { Repository } from './base';

/**
 * Database representation of a recall attempt.
 * Timestamps are stored as numbers (milliseconds since epoch) in JSON.
 */
interface DbRecallAttempt {
  timestamp: number;
  success: boolean;
  latencyMs: number;
}

/**
 * Input type for creating a new RecallPoint.
 * Includes nested FSRSState for cleaner API.
 */
export interface CreateRecallPointInput {
  /** Unique identifier - typically a prefixed UUID (e.g., 'rp_xyz789') */
  id: string;
  /** ID of the parent RecallSet */
  recallSetId: string;
  /** The core knowledge to be recalled */
  content: string;
  /** Additional context that supports understanding */
  context: string;
  /** Initial FSRS scheduling state */
  fsrsState: FSRSState;
}

/**
 * Input type for updating an existing RecallPoint.
 * All fields are optional - only specified fields will be updated.
 * Note: FSRS state updates should use updateFSRSState method instead.
 */
export interface UpdateRecallPointInput {
  /** The core knowledge to be recalled */
  content?: string;
  /** Additional context that supports understanding */
  context?: string;
}

/**
 * Maps a database row to a RecallPoint domain model.
 *
 * Handles the transformation from:
 * - Flat FSRS columns -> nested FSRSState object
 * - JSON recall history with number timestamps -> RecallAttempt[] with Date objects
 *
 * @param row - Raw database row from Drizzle query
 * @returns RecallPoint domain model with proper nesting and Date objects
 */
function mapToDomain(row: typeof recallPoints.$inferSelect): RecallPoint {
  // Convert database recall history (with number timestamps) to domain format (with Date objects)
  const recallHistory: RecallAttempt[] = (
    row.recallHistory as DbRecallAttempt[]
  ).map((attempt) => ({
    timestamp: new Date(attempt.timestamp),
    success: attempt.success,
    latencyMs: attempt.latencyMs,
  }));

  return {
    id: row.id,
    recallSetId: row.recallSetId,
    content: row.content,
    context: row.context,
    // Transform flat FSRS columns into nested FSRSState object
    fsrsState: {
      difficulty: row.fsrsDifficulty,
      stability: row.fsrsStability,
      due: row.fsrsDue,
      lastReview: row.fsrsLastReview,
      reps: row.fsrsReps,
      lapses: row.fsrsLapses,
      state: row.fsrsState,
    },
    recallHistory,
    // Drizzle's timestamp_ms mode already returns Date objects
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Repository for RecallPoint entity data access operations.
 *
 * Provides CRUD operations plus custom queries for recall point management,
 * including FSRS-specific operations like finding due points and updating
 * scheduling state.
 *
 * @example
 * ```typescript
 * const repo = new RecallPointRepository(db);
 *
 * // Find all points due for review
 * const duePoints = await repo.findDuePoints('rs_abc123');
 *
 * // Update FSRS state after a review
 * await repo.updateFSRSState('rp_xyz789', {
 *   difficulty: 5.5,
 *   stability: 3.0,
 *   due: new Date('2024-01-25'),
 *   lastReview: new Date(),
 *   reps: 4,
 *   lapses: 0,
 *   state: 'review',
 * });
 * ```
 */
export class RecallPointRepository
  implements
    Repository<RecallPoint, CreateRecallPointInput, UpdateRecallPointInput>
{
  /**
   * Creates a new RecallPointRepository instance.
   *
   * @param db - The Drizzle database instance to use for queries
   */
  constructor(private readonly db: AppDatabase) {}

  /**
   * Retrieves a recall point by its unique identifier.
   *
   * @param id - The unique identifier of the recall point
   * @returns The RecallPoint domain model if found, or null if not found
   */
  async findById(id: string): Promise<RecallPoint | null> {
    const result = await this.db
      .select()
      .from(recallPoints)
      .where(eq(recallPoints.id, id))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return mapToDomain(result[0]);
  }

  /**
   * Retrieves all recall points.
   *
   * Note: For large datasets, prefer findByRecallSetId for scoped queries.
   *
   * @returns Array of all RecallPoint domain models (may be empty)
   */
  async findAll(): Promise<RecallPoint[]> {
    const results = await this.db.select().from(recallPoints);
    return results.map(mapToDomain);
  }

  /**
   * Retrieves all recall points belonging to a specific recall set.
   *
   * @param recallSetId - The ID of the parent recall set
   * @returns Array of RecallPoint domain models (may be empty)
   */
  async findByRecallSetId(recallSetId: string): Promise<RecallPoint[]> {
    const results = await this.db
      .select()
      .from(recallPoints)
      .where(eq(recallPoints.recallSetId, recallSetId));

    return results.map(mapToDomain);
  }

  /**
   * Finds recall points that are due for review.
   *
   * A point is considered "due" when its fsrsDue timestamp is less than or
   * equal to the specified reference time. This is the core query for
   * scheduling recall sessions.
   *
   * @param recallSetId - The ID of the recall set to search within
   * @param asOf - Reference time for due calculation (defaults to now)
   * @returns Array of due RecallPoint domain models, ordered by due date
   *
   * @example
   * ```typescript
   * // Get all points due right now
   * const dueNow = await repo.findDuePoints('rs_abc123');
   *
   * // Get points that will be due by end of day
   * const endOfDay = new Date();
   * endOfDay.setHours(23, 59, 59, 999);
   * const dueToday = await repo.findDuePoints('rs_abc123', endOfDay);
   * ```
   */
  async findDuePoints(
    recallSetId: string,
    asOf: Date = new Date()
  ): Promise<RecallPoint[]> {
    const results = await this.db
      .select()
      .from(recallPoints)
      .where(
        and(
          eq(recallPoints.recallSetId, recallSetId),
          lte(recallPoints.fsrsDue, asOf)
        )
      );

    return results.map(mapToDomain);
  }

  /**
   * Creates a new recall point.
   *
   * @param input - The data for creating the new recall point
   * @returns The created RecallPoint domain model with timestamps
   */
  async create(input: CreateRecallPointInput): Promise<RecallPoint> {
    const now = new Date();

    const result = await this.db
      .insert(recallPoints)
      .values({
        id: input.id,
        recallSetId: input.recallSetId,
        content: input.content,
        context: input.context,
        // Flatten FSRSState object into individual columns
        fsrsDifficulty: input.fsrsState.difficulty,
        fsrsStability: input.fsrsState.stability,
        fsrsDue: input.fsrsState.due,
        fsrsLastReview: input.fsrsState.lastReview,
        fsrsReps: input.fsrsState.reps,
        fsrsLapses: input.fsrsState.lapses,
        fsrsState: input.fsrsState.state,
        recallHistory: [],
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return mapToDomain(result[0]);
  }

  /**
   * Updates an existing recall point's content/context fields.
   *
   * Note: For FSRS state updates, use updateFSRSState instead.
   * For adding recall attempts, use addRecallAttempt instead.
   *
   * @param id - The unique identifier of the recall point to update
   * @param input - The partial data to update (content and/or context)
   * @returns The updated RecallPoint domain model
   * @throws Error if the recall point with the given id does not exist
   */
  async update(id: string, input: UpdateRecallPointInput): Promise<RecallPoint> {
    const result = await this.db
      .update(recallPoints)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(recallPoints.id, id))
      .returning();

    if (result.length === 0) {
      throw new Error(`RecallPoint with id '${id}' not found`);
    }

    return mapToDomain(result[0]);
  }

  /**
   * Updates the FSRS scheduling state for a recall point.
   *
   * This is the primary method for updating scheduling after a review.
   * The FSRS algorithm calculates new state values based on the user's
   * performance, and this method persists those changes.
   *
   * @param id - The unique identifier of the recall point to update
   * @param fsrsState - The new FSRS state values to persist
   * @throws Error if the recall point with the given id does not exist
   *
   * @example
   * ```typescript
   * // After calculating new FSRS state from a review
   * await repo.updateFSRSState('rp_xyz789', {
   *   difficulty: 5.5,
   *   stability: 3.0,
   *   due: new Date('2024-01-25'),
   *   lastReview: new Date(),
   *   reps: 4,
   *   lapses: 0,
   *   state: 'review',
   * });
   * ```
   */
  async updateFSRSState(id: string, fsrsState: FSRSState): Promise<void> {
    const result = await this.db
      .update(recallPoints)
      .set({
        fsrsDifficulty: fsrsState.difficulty,
        fsrsStability: fsrsState.stability,
        fsrsDue: fsrsState.due,
        fsrsLastReview: fsrsState.lastReview,
        fsrsReps: fsrsState.reps,
        fsrsLapses: fsrsState.lapses,
        fsrsState: fsrsState.state,
        updatedAt: new Date(),
      })
      .where(eq(recallPoints.id, id))
      .returning({ id: recallPoints.id });

    if (result.length === 0) {
      throw new Error(`RecallPoint with id '${id}' not found`);
    }
  }

  /**
   * Adds a recall attempt to the point's history.
   *
   * This appends a new attempt record to the recallHistory array,
   * preserving the chronological record of all review attempts.
   *
   * @param id - The unique identifier of the recall point
   * @param attempt - The recall attempt to add
   * @throws Error if the recall point with the given id does not exist
   *
   * @example
   * ```typescript
   * await repo.addRecallAttempt('rp_xyz789', {
   *   timestamp: new Date(),
   *   success: true,
   *   latencyMs: 2500,
   * });
   * ```
   */
  async addRecallAttempt(id: string, attempt: RecallAttempt): Promise<void> {
    // First, fetch the current recall history
    const existing = await this.db
      .select({ recallHistory: recallPoints.recallHistory })
      .from(recallPoints)
      .where(eq(recallPoints.id, id))
      .limit(1);

    if (existing.length === 0) {
      throw new Error(`RecallPoint with id '${id}' not found`);
    }

    // Convert domain RecallAttempt to database format (Date -> number)
    const dbAttempt: DbRecallAttempt = {
      timestamp: attempt.timestamp.getTime(),
      success: attempt.success,
      latencyMs: attempt.latencyMs,
    };

    // Append the new attempt to the existing history
    const updatedHistory = [
      ...(existing[0].recallHistory as DbRecallAttempt[]),
      dbAttempt,
    ];

    // Update the database with the new history
    await this.db
      .update(recallPoints)
      .set({
        recallHistory: updatedHistory,
        updatedAt: new Date(),
      })
      .where(eq(recallPoints.id, id));
  }

  /**
   * Permanently deletes a recall point.
   *
   * @param id - The unique identifier of the recall point to delete
   * @throws Error if the recall point does not exist
   */
  async delete(id: string): Promise<void> {
    const result = await this.db
      .delete(recallPoints)
      .where(eq(recallPoints.id, id))
      .returning({ id: recallPoints.id });

    if (result.length === 0) {
      throw new Error(`RecallPoint with id '${id}' not found`);
    }
  }
}
