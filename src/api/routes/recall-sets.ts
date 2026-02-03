/**
 * Recall Sets API Routes
 *
 * Provides RESTful CRUD endpoints for managing RecallSets and their RecallPoints.
 * RecallSets are thematic collections of recall points that share a common subject
 * or context, used for spaced repetition learning.
 *
 * Endpoints:
 * - GET    /                   - List all sets with summary stats
 * - POST   /                   - Create a new set
 * - GET    /:id                - Get a set with full details
 * - PATCH  /:id                - Update a set
 * - DELETE /:id                - Archive a set (soft delete)
 * - GET    /:id/points         - List points for a set
 * - POST   /:id/points         - Add a point to a set
 * - PATCH  /:id/points/:pointId - Update a point
 * - DELETE /:id/points/:pointId - Delete a point
 *
 * All endpoints return responses in the standard API format:
 * - Success: { success: true, data: T }
 * - Error: { success: false, error: { code, message, details? } }
 */

import { Hono } from 'hono';
import { db } from '@/storage/db';
import {
  RecallSetRepository,
  RecallPointRepository,
} from '@/storage/repositories';
import { FSRSScheduler } from '@/core/fsrs';
import { validate, getValidatedBody } from '../middleware/validate';
import {
  createRecallSetSchema,
  updateRecallSetSchema,
  createRecallPointSchema,
  updateRecallPointSchema,
} from '../types';
import { success, notFound, badRequest } from '../utils/response';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Summary statistics for a RecallSet.
 * Provides an overview of points and due counts for listing.
 */
interface RecallSetSummary {
  /** Total number of recall points in the set */
  totalPoints: number;
  /** Number of points due for review */
  duePoints: number;
  /** Number of new (never reviewed) points */
  newPoints: number;
}

/**
 * RecallSet with summary statistics for listing endpoints.
 */
interface RecallSetWithSummary {
  id: string;
  name: string;
  description: string;
  status: string;
  discussionSystemPrompt: string;
  createdAt: Date;
  updatedAt: Date;
  summary: RecallSetSummary;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generates a unique identifier with a prefix for recall sets.
 * Uses UUID v4 format via crypto.randomUUID().
 *
 * @returns A prefixed unique identifier (e.g., 'rs_abc123...')
 */
function generateRecallSetId(): string {
  return `rs_${crypto.randomUUID()}`;
}

/**
 * Generates a unique identifier with a prefix for recall points.
 * Uses UUID v4 format via crypto.randomUUID().
 *
 * @returns A prefixed unique identifier (e.g., 'rp_xyz789...')
 */
function generateRecallPointId(): string {
  return `rp_${crypto.randomUUID()}`;
}

// ============================================================================
// Route Factory
// ============================================================================

/**
 * Creates the recall sets router with all CRUD endpoints.
 *
 * This factory creates repository instances and configures all routes for
 * managing recall sets and their associated recall points.
 *
 * @returns Hono router instance with recall set routes
 *
 * @example
 * ```typescript
 * import { Hono } from 'hono';
 * import { recallSetsRoutes } from '@/api/routes/recall-sets';
 *
 * const app = new Hono();
 * app.route('/api/recall-sets', recallSetsRoutes());
 * ```
 */
export function recallSetsRoutes(): Hono {
  const router = new Hono();

  // Initialize repositories with the database connection
  const recallSetRepo = new RecallSetRepository(db);
  const recallPointRepo = new RecallPointRepository(db);

  // Initialize FSRS scheduler for creating initial point states
  const fsrsScheduler = new FSRSScheduler();

  // ===========================================================================
  // RecallSet CRUD Routes
  // ===========================================================================

  /**
   * GET /
   *
   * Lists all recall sets with summary statistics.
   * Each set includes counts for total points, due points, and new points.
   *
   * Response: 200 OK with array of RecallSetWithSummary
   */
  router.get('/', async (c) => {
    // Fetch all recall sets
    const sets = await recallSetRepo.findAll();

    // Enrich each set with summary statistics
    const setsWithSummary: RecallSetWithSummary[] = await Promise.all(
      sets.map(async (set) => {
        // Get all points for this set to calculate stats
        const points = await recallPointRepo.findByRecallSetId(set.id);
        const duePoints = await recallPointRepo.findDuePoints(set.id);

        // Count new (never reviewed) points
        const newPoints = points.filter((p) => p.fsrsState.state === 'new');

        const summary: RecallSetSummary = {
          totalPoints: points.length,
          duePoints: duePoints.length,
          newPoints: newPoints.length,
        };

        return {
          ...set,
          summary,
        };
      })
    );

    return success(c, setsWithSummary);
  });

  /**
   * POST /
   *
   * Creates a new recall set with the provided data.
   * Automatically generates a unique ID and sets status to 'active'.
   *
   * Request body: { name, description, discussionSystemPrompt }
   * Response: 201 Created with the new RecallSet
   */
  router.post('/', validate(createRecallSetSchema), async (c) => {
    const body = getValidatedBody(c, createRecallSetSchema);

    // Create the recall set with a generated ID
    const newSet = await recallSetRepo.create({
      id: generateRecallSetId(),
      name: body.name,
      description: body.description,
      discussionSystemPrompt: body.discussionSystemPrompt,
      status: 'active',
    });

    return success(c, newSet, 201);
  });

  /**
   * GET /:id
   *
   * Retrieves a single recall set by its ID with full details.
   * Includes summary statistics like the list endpoint.
   *
   * Response: 200 OK with RecallSetWithSummary, or 404 if not found
   */
  router.get('/:id', async (c) => {
    const id = c.req.param('id');
    const set = await recallSetRepo.findById(id);

    if (!set) {
      return notFound(c, 'RecallSet', id);
    }

    // Calculate summary statistics
    const points = await recallPointRepo.findByRecallSetId(set.id);
    const duePoints = await recallPointRepo.findDuePoints(set.id);
    const newPoints = points.filter((p) => p.fsrsState.state === 'new');

    const summary: RecallSetSummary = {
      totalPoints: points.length,
      duePoints: duePoints.length,
      newPoints: newPoints.length,
    };

    const setWithSummary: RecallSetWithSummary = {
      ...set,
      summary,
    };

    return success(c, setWithSummary);
  });

  /**
   * PATCH /:id
   *
   * Updates an existing recall set with partial data.
   * Only provided fields are updated; others remain unchanged.
   *
   * Request body: { name?, description?, discussionSystemPrompt?, status? }
   * Response: 200 OK with updated RecallSet, or 404 if not found
   */
  router.patch('/:id', validate(updateRecallSetSchema), async (c) => {
    const id = c.req.param('id');
    const body = getValidatedBody(c, updateRecallSetSchema);

    // Check if the set exists
    const existing = await recallSetRepo.findById(id);
    if (!existing) {
      return notFound(c, 'RecallSet', id);
    }

    // Ensure at least one field is being updated
    if (
      body.name === undefined &&
      body.description === undefined &&
      body.discussionSystemPrompt === undefined &&
      body.status === undefined
    ) {
      return badRequest(c, 'No fields provided for update');
    }

    // Update the recall set
    const updatedSet = await recallSetRepo.update(id, body);

    return success(c, updatedSet);
  });

  /**
   * DELETE /:id
   *
   * Archives a recall set by setting its status to 'archived'.
   * This is a soft delete; the set remains in the database.
   *
   * Response: 200 OK with archived RecallSet, or 404 if not found
   */
  router.delete('/:id', async (c) => {
    const id = c.req.param('id');

    // Check if the set exists
    const existing = await recallSetRepo.findById(id);
    if (!existing) {
      return notFound(c, 'RecallSet', id);
    }

    // Soft delete by setting status to 'archived'
    const archivedSet = await recallSetRepo.update(id, { status: 'archived' });

    return success(c, archivedSet);
  });

  // ===========================================================================
  // RecallPoint Routes (nested under /:id/points)
  // ===========================================================================

  /**
   * GET /:id/points
   *
   * Lists all recall points belonging to a specific recall set.
   *
   * Response: 200 OK with array of RecallPoint, or 404 if set not found
   */
  router.get('/:id/points', async (c) => {
    const setId = c.req.param('id');

    // Verify the recall set exists
    const set = await recallSetRepo.findById(setId);
    if (!set) {
      return notFound(c, 'RecallSet', setId);
    }

    // Get all points for this set
    const points = await recallPointRepo.findByRecallSetId(setId);

    return success(c, points);
  });

  /**
   * POST /:id/points
   *
   * Creates a new recall point within a specific recall set.
   * Automatically generates a unique ID and initializes FSRS state.
   *
   * Request body: { content, context }
   * Response: 201 Created with the new RecallPoint, or 404 if set not found
   */
  router.post('/:id/points', validate(createRecallPointSchema), async (c) => {
    const setId = c.req.param('id');
    const body = getValidatedBody(c, createRecallPointSchema);

    // Verify the recall set exists
    const set = await recallSetRepo.findById(setId);
    if (!set) {
      return notFound(c, 'RecallSet', setId);
    }

    // Create the recall point with generated ID and initial FSRS state
    const initialFsrsState = fsrsScheduler.createInitialState();

    const newPoint = await recallPointRepo.create({
      id: generateRecallPointId(),
      recallSetId: setId,
      content: body.content,
      context: body.context,
      fsrsState: initialFsrsState,
    });

    return success(c, newPoint, 201);
  });

  /**
   * PATCH /:id/points/:pointId
   *
   * Updates an existing recall point with partial data.
   * Only content and context can be updated; FSRS state is managed by the system.
   *
   * Request body: { content?, context? }
   * Response: 200 OK with updated RecallPoint, or 404 if not found
   */
  router.patch(
    '/:id/points/:pointId',
    validate(updateRecallPointSchema),
    async (c) => {
      const setId = c.req.param('id');
      const pointId = c.req.param('pointId');
      const body = getValidatedBody(c, updateRecallPointSchema);

      // Verify the recall set exists
      const set = await recallSetRepo.findById(setId);
      if (!set) {
        return notFound(c, 'RecallSet', setId);
      }

      // Verify the recall point exists and belongs to this set
      const existingPoint = await recallPointRepo.findById(pointId);
      if (!existingPoint) {
        return notFound(c, 'RecallPoint', pointId);
      }

      // Verify the point belongs to the specified set
      if (existingPoint.recallSetId !== setId) {
        return notFound(c, 'RecallPoint', pointId);
      }

      // Ensure at least one field is being updated
      if (body.content === undefined && body.context === undefined) {
        return badRequest(c, 'No fields provided for update');
      }

      // Update the recall point
      const updatedPoint = await recallPointRepo.update(pointId, body);

      return success(c, updatedPoint);
    }
  );

  /**
   * DELETE /:id/points/:pointId
   *
   * Permanently deletes a recall point from a recall set.
   * This is a hard delete; the point is removed from the database.
   *
   * Response: 200 OK with success message, or 404 if not found
   */
  router.delete('/:id/points/:pointId', async (c) => {
    const setId = c.req.param('id');
    const pointId = c.req.param('pointId');

    // Verify the recall set exists
    const set = await recallSetRepo.findById(setId);
    if (!set) {
      return notFound(c, 'RecallSet', setId);
    }

    // Verify the recall point exists and belongs to this set
    const existingPoint = await recallPointRepo.findById(pointId);
    if (!existingPoint) {
      return notFound(c, 'RecallPoint', pointId);
    }

    // Verify the point belongs to the specified set
    if (existingPoint.recallSetId !== setId) {
      return notFound(c, 'RecallPoint', pointId);
    }

    // Delete the recall point
    await recallPointRepo.delete(pointId);

    return success(c, { message: 'Recall point deleted successfully', id: pointId });
  });

  return router;
}

// ============================================================================
// Default Export
// ============================================================================

/**
 * Default export provides the recall sets route factory.
 */
export default recallSetsRoutes;
