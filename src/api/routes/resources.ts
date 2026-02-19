/**
 * Resources API Routes
 *
 * Provides endpoints for fetching source resources associated with recall sets
 * and recall points. Resources are source materials (articles, excerpts, images)
 * that agents reference during sessions.
 *
 * Uses the factory function pattern consistent with all other route modules.
 *
 * Routes (relative to mount point /api/recall-sets):
 * - GET /:recallSetId/resources — resources for a recall set
 * - GET /by-point/:recallPointId — resources linked to a recall point
 */

import { Hono } from 'hono';
import { db } from '@/storage/db';
import { ResourceRepository } from '@/storage/repositories/resource.repository';
import { success } from '../utils/response';

/**
 * Creates the resources API router.
 *
 * Provides endpoints for fetching resources associated with recall sets
 * and recall points. Uses the factory function pattern consistent with
 * all other route modules in the codebase.
 *
 * @returns Hono router instance with resource routes
 */
export function resourcesRoutes(): Hono {
  const router = new Hono();

  // Repository initialized with the shared db instance
  const repo = new ResourceRepository(db);

  /**
   * GET /:recallSetId/resources
   *
   * Returns all resources associated with a recall set.
   * Response includes text content, image URLs, and metadata.
   * Image base64 data is excluded by default (use ?includeImageData=true to include).
   */
  router.get('/:recallSetId/resources', async (c) => {
    const recallSetId = c.req.param('recallSetId');
    const includeImageData = c.req.query('includeImageData') === 'true';

    const resources = await repo.findByRecallSetId(recallSetId);

    // Strip base64 image data unless explicitly requested (large payloads)
    const responseResources = includeImageData
      ? resources
      : resources.map(r => ({ ...r, imageData: r.imageData ? '[base64 omitted]' : null }));

    return success(c, responseResources);
  });

  /**
   * GET /by-point/:recallPointId
   *
   * Returns all resources linked to a specific recall point.
   * Includes the relevance description from the junction table.
   */
  router.get('/by-point/:recallPointId', async (c) => {
    const recallPointId = c.req.param('recallPointId');

    const resources = await repo.findByRecallPointId(recallPointId);

    return success(c, resources);
  });

  return router;
}
