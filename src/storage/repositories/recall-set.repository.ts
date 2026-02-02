/**
 * RecallSet Repository Implementation
 *
 * This module provides data access operations for RecallSet entities,
 * abstracting Drizzle ORM queries from business logic. It handles the
 * mapping between database rows (with timestamps as numbers) and domain
 * models (with timestamps as Date objects).
 *
 * RecallSets are thematic collections of recall points that share a common
 * subject or context. They include a discussion system prompt that guides
 * AI-powered Socratic dialogues.
 */

import { eq, sql } from 'drizzle-orm';
import type { AppDatabase } from '../db';
import { recallSets } from '../schema';
import type { RecallSet, RecallSetStatus } from '@/core/models';
import type { Repository } from './base';

/**
 * Input type for creating a new RecallSet.
 * Excludes auto-generated fields (id, createdAt, updatedAt).
 */
export interface CreateRecallSetInput {
  /** Unique identifier - typically a prefixed UUID (e.g., 'rs_abc123') */
  id: string;
  /** Human-readable name for the recall set */
  name: string;
  /** Detailed description of what this recall set covers */
  description: string;
  /** Lifecycle status: 'active', 'paused', or 'archived' */
  status?: RecallSetStatus;
  /** System prompt for AI discussions in this set */
  discussionSystemPrompt: string;
}

/**
 * Input type for updating an existing RecallSet.
 * All fields are optional - only specified fields will be updated.
 */
export interface UpdateRecallSetInput {
  /** Human-readable name for the recall set */
  name?: string;
  /** Detailed description of what this recall set covers */
  description?: string;
  /** Lifecycle status: 'active', 'paused', or 'archived' */
  status?: RecallSetStatus;
  /** System prompt for AI discussions in this set */
  discussionSystemPrompt?: string;
}

/**
 * Maps a database row to a RecallSet domain model.
 *
 * The database stores timestamps using Drizzle's timestamp_ms mode,
 * which automatically converts to/from Date objects.
 *
 * @param row - Raw database row from Drizzle query
 * @returns RecallSet domain model with proper Date objects
 */
function mapToDomain(row: typeof recallSets.$inferSelect): RecallSet {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    discussionSystemPrompt: row.discussionSystemPrompt,
    // Drizzle's timestamp_ms mode already returns Date objects
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Repository for RecallSet entity data access operations.
 *
 * Provides CRUD operations plus custom queries for recall set management.
 * All methods return domain models with proper Date objects rather than
 * raw database rows.
 *
 * @example
 * ```typescript
 * const repo = new RecallSetRepository(db);
 *
 * // Create a new recall set
 * const set = await repo.create({
 *   id: 'rs_' + crypto.randomUUID(),
 *   name: 'Spanish Vocabulary',
 *   description: 'Common Spanish words and phrases',
 *   discussionSystemPrompt: 'You are a Spanish language tutor...',
 * });
 *
 * // Find by name (case-insensitive)
 * const found = await repo.findByName('spanish vocabulary');
 * ```
 */
export class RecallSetRepository
  implements Repository<RecallSet, CreateRecallSetInput, UpdateRecallSetInput>
{
  /**
   * Creates a new RecallSetRepository instance.
   *
   * @param db - The Drizzle database instance to use for queries
   */
  constructor(private readonly db: AppDatabase) {}

  /**
   * Retrieves a recall set by its unique identifier.
   *
   * @param id - The unique identifier of the recall set
   * @returns The RecallSet domain model if found, or null if not found
   */
  async findById(id: string): Promise<RecallSet | null> {
    const result = await this.db
      .select()
      .from(recallSets)
      .where(eq(recallSets.id, id))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return mapToDomain(result[0]);
  }

  /**
   * Retrieves all recall sets.
   *
   * @returns Array of all RecallSet domain models (may be empty)
   */
  async findAll(): Promise<RecallSet[]> {
    const results = await this.db.select().from(recallSets);
    return results.map(mapToDomain);
  }

  /**
   * Finds a recall set by its name using case-insensitive search.
   *
   * This is useful for looking up sets by user input without requiring
   * exact case matching.
   *
   * @param name - The name to search for (case-insensitive)
   * @returns The RecallSet if found, or null if not found
   *
   * @example
   * ```typescript
   * // All of these would find "Spanish Vocabulary"
   * await repo.findByName('Spanish Vocabulary');
   * await repo.findByName('spanish vocabulary');
   * await repo.findByName('SPANISH VOCABULARY');
   * ```
   */
  async findByName(name: string): Promise<RecallSet | null> {
    // Use SQLite's LOWER() function for case-insensitive comparison
    const result = await this.db
      .select()
      .from(recallSets)
      .where(sql`LOWER(${recallSets.name}) = LOWER(${name})`)
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return mapToDomain(result[0]);
  }

  /**
   * Creates a new recall set.
   *
   * @param input - The data for creating the new recall set
   * @returns The created RecallSet domain model with timestamps
   */
  async create(input: CreateRecallSetInput): Promise<RecallSet> {
    const now = new Date();

    const result = await this.db
      .insert(recallSets)
      .values({
        id: input.id,
        name: input.name,
        description: input.description,
        status: input.status ?? 'active',
        discussionSystemPrompt: input.discussionSystemPrompt,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return mapToDomain(result[0]);
  }

  /**
   * Updates an existing recall set.
   *
   * Only the fields specified in the input will be updated.
   * The updatedAt timestamp is automatically set to the current time.
   *
   * @param id - The unique identifier of the recall set to update
   * @param input - The partial data to update
   * @returns The updated RecallSet domain model
   * @throws Error if the recall set with the given id does not exist
   */
  async update(id: string, input: UpdateRecallSetInput): Promise<RecallSet> {
    const result = await this.db
      .update(recallSets)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(recallSets.id, id))
      .returning();

    if (result.length === 0) {
      throw new Error(`RecallSet with id '${id}' not found`);
    }

    return mapToDomain(result[0]);
  }

  /**
   * Permanently deletes a recall set.
   *
   * WARNING: This will fail if there are recall points or sessions
   * referencing this recall set due to foreign key constraints.
   *
   * @param id - The unique identifier of the recall set to delete
   * @throws Error if the recall set does not exist or has dependencies
   */
  async delete(id: string): Promise<void> {
    const result = await this.db
      .delete(recallSets)
      .where(eq(recallSets.id, id))
      .returning({ id: recallSets.id });

    if (result.length === 0) {
      throw new Error(`RecallSet with id '${id}' not found`);
    }
  }
}
