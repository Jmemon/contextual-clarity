/**
 * Resource Repository Implementation
 *
 * This module provides data access operations for Resource entities and
 * the recall_point_resources junction table. It handles querying source
 * materials (articles, excerpts, images) associated with recall sets,
 * and linking them to specific recall points.
 *
 * Resources are referenced by agents during sessions — the tutor quotes
 * from them, the rabbit hole agent uses them for deeper exploration, and
 * the transcription pipeline uses their terminology.
 */

import { eq } from 'drizzle-orm';
import type { AppDatabase } from '../db';
import { resources, recallPointResources } from '../schema';
import type { Resource, NewResource } from '../schema';

/**
 * Extended resource type that includes the relevance description from
 * the junction table when querying resources by recall point.
 */
export interface ResourceWithRelevance extends Resource {
  relevance: string | null;
}

/**
 * Input type for creating a new resource.
 * Excludes auto-generated fields (id, createdAt, updatedAt).
 */
export type CreateResourceInput = Omit<NewResource, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Repository for Resource entity data access operations.
 *
 * Provides methods for querying resources by recall set or recall point,
 * creating resources individually or in bulk, and managing the junction
 * table linking resources to specific recall points.
 *
 * @example
 * ```typescript
 * const repo = new ResourceRepository(db);
 *
 * // Get all resources for a recall set
 * const resources = await repo.findByRecallSetId('rs_abc123');
 *
 * // Get resources linked to a specific recall point
 * const pointResources = await repo.findByRecallPointId('rp_xyz789');
 * ```
 */
export class ResourceRepository {
  /**
   * Creates a new ResourceRepository instance.
   *
   * @param db - The Drizzle database instance to use for queries
   */
  constructor(private readonly db: AppDatabase) {}

  /**
   * Find all resources belonging to a specific recall set.
   * Returns resources sorted by type (articles first, then excerpts, then images).
   *
   * @param recallSetId - The ID of the recall set
   * @returns Array of Resource records (may be empty)
   */
  async findByRecallSetId(recallSetId: string): Promise<Resource[]> {
    const results = await this.db
      .select()
      .from(resources)
      .where(eq(resources.recallSetId, recallSetId));

    // Sort by type priority: articles → excerpts → book_passage → reference → image
    const typePriority: Record<string, number> = {
      article: 0,
      excerpt: 1,
      book_passage: 2,
      reference: 3,
      image: 4,
    };

    return results.sort(
      (a, b) => (typePriority[a.type] ?? 99) - (typePriority[b.type] ?? 99)
    );
  }

  /**
   * Find all resources linked to a specific recall point via the junction table.
   * Joins through recall_point_resources to get the actual resource records.
   * Includes the relevance description from the junction table.
   *
   * @param recallPointId - The ID of the recall point
   * @returns Array of ResourceWithRelevance records (may be empty)
   */
  async findByRecallPointId(recallPointId: string): Promise<ResourceWithRelevance[]> {
    const results = await this.db
      .select({
        // All resource fields
        id: resources.id,
        recallSetId: resources.recallSetId,
        title: resources.title,
        type: resources.type,
        content: resources.content,
        url: resources.url,
        imageData: resources.imageData,
        mimeType: resources.mimeType,
        metadata: resources.metadata,
        createdAt: resources.createdAt,
        updatedAt: resources.updatedAt,
        // Junction table relevance field
        relevance: recallPointResources.relevance,
      })
      .from(recallPointResources)
      .innerJoin(resources, eq(recallPointResources.resourceId, resources.id))
      .where(eq(recallPointResources.recallPointId, recallPointId));

    return results;
  }

  /**
   * Find a single resource by its ID.
   *
   * @param id - The unique identifier of the resource
   * @returns The Resource if found, or null if not found
   */
  async findById(id: string): Promise<Resource | null> {
    const result = await this.db
      .select()
      .from(resources)
      .where(eq(resources.id, id))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return result[0];
  }

  /**
   * Create a single resource. Generates a UUID for the id field.
   * Sets createdAt and updatedAt to current timestamp.
   *
   * @param resource - The resource data to create (without id/timestamps)
   * @returns The created Resource record
   */
  async create(resource: CreateResourceInput): Promise<Resource> {
    const now = new Date();
    const id = `res_${crypto.randomUUID()}`;

    const result = await this.db
      .insert(resources)
      .values({
        id,
        ...resource,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return result[0];
  }

  /**
   * Create multiple resources in a single transaction.
   * Used by the seed runner to bulk-insert source materials.
   * Either all resources are created or none (atomic).
   *
   * @param resourceInputs - Array of resource data to create
   * @returns Array of created Resource records
   */
  async createMany(resourceInputs: CreateResourceInput[]): Promise<Resource[]> {
    if (resourceInputs.length === 0) return [];

    const now = new Date();
    const values = resourceInputs.map((r) => ({
      id: `res_${crypto.randomUUID()}`,
      ...r,
      createdAt: now,
      updatedAt: now,
    }));

    // Use a transaction so either all resources are created or none
    const results = await this.db.transaction(async (tx) => {
      return tx.insert(resources).values(values).returning();
    });

    return results;
  }

  /**
   * Create a link between a recall point and a resource.
   * Generates a UUID for the junction table id field.
   *
   * @param recallPointId - The ID of the recall point
   * @param resourceId - The ID of the resource
   * @param relevance - Optional description of why this resource is relevant
   */
  async linkToRecallPoint(
    recallPointId: string,
    resourceId: string,
    relevance?: string
  ): Promise<void> {
    await this.db.insert(recallPointResources).values({
      id: `rpr_${crypto.randomUUID()}`,
      recallPointId,
      resourceId,
      relevance: relevance ?? null,
    });
  }

  /**
   * Create multiple links between recall points and resources in a single transaction.
   * Used by the seed runner when linking resources to all points in a set.
   *
   * @param links - Array of link definitions with recallPointId, resourceId, and optional relevance
   */
  async linkManyToRecallPoints(
    links: Array<{ recallPointId: string; resourceId: string; relevance?: string }>
  ): Promise<void> {
    if (links.length === 0) return;

    const values = links.map((link) => ({
      id: `rpr_${crypto.randomUUID()}`,
      recallPointId: link.recallPointId,
      resourceId: link.resourceId,
      relevance: link.relevance ?? null,
    }));

    await this.db.transaction(async (tx) => {
      await tx.insert(recallPointResources).values(values);
    });
  }

  /**
   * Delete all junction table links for a given recall point.
   * Used during force-reseed to clear FK references before deleting the recall point.
   *
   * @param recallPointId - The ID of the recall point to unlink
   */
  async unlinkAllFromRecallPoint(recallPointId: string): Promise<void> {
    await this.db
      .delete(recallPointResources)
      .where(eq(recallPointResources.recallPointId, recallPointId));
  }

  /**
   * Delete all resources belonging to a given recall set.
   * Used during force-reseed to clear resources before deleting the recall set.
   *
   * @param recallSetId - The ID of the recall set whose resources to delete
   */
  async deleteByRecallSetId(recallSetId: string): Promise<void> {
    await this.db
      .delete(resources)
      .where(eq(resources.recallSetId, recallSetId));
  }
}
