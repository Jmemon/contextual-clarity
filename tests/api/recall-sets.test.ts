/**
 * Recall Sets API Endpoint Tests
 *
 * Tests for the Recall Sets CRUD API endpoints. These tests verify
 * the API contract, validation, and business logic for managing
 * recall sets and their associated recall points.
 *
 * Endpoints tested:
 * - GET /api/recall-sets - List all recall sets
 * - POST /api/recall-sets - Create a new recall set
 * - GET /api/recall-sets/:id - Get recall set details
 * - PATCH /api/recall-sets/:id - Update a recall set
 * - DELETE /api/recall-sets/:id - Archive a recall set
 * - GET /api/recall-sets/:id/points - List points for a set
 * - POST /api/recall-sets/:id/points - Add a point to a set
 * - PATCH /api/recall-sets/:id/points/:pointId - Update a point
 * - DELETE /api/recall-sets/:id/points/:pointId - Delete a point
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  createTestContext,
  cleanupTestDatabase,
  createTestApp,
  type TestContext,
} from '../setup';
import {
  createTestRecallSet,
  createTestRecallPoint,
  getJsonResponse,
} from '../helpers';
import type { Hono } from 'hono';

describe('Recall Sets API', () => {
  let ctx: TestContext;
  let app: Hono;

  beforeEach(async () => {
    ctx = createTestContext();
    app = createTestApp(ctx);
  });

  afterEach(() => {
    cleanupTestDatabase(ctx);
  });

  // ==========================================================================
  // GET /api/recall-sets
  // ==========================================================================
  describe('GET /api/recall-sets', () => {
    it('should return empty array when no recall sets exist', async () => {
      // Act
      const response = await app.request('/api/recall-sets');
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data).toHaveLength(0);
    });

    it('should return all recall sets with summary stats', async () => {
      // Arrange
      const set1 = await createTestRecallSet(ctx.repos, { name: 'Test Set 1' });
      const set2 = await createTestRecallSet(ctx.repos, { name: 'Test Set 2' });

      // Create points for set1
      await createTestRecallPoint(ctx.repos, { recallSetId: set1.id });
      await createTestRecallPoint(ctx.repos, { recallSetId: set1.id });

      // Act
      const response = await app.request('/api/recall-sets');
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data).toHaveLength(2);

      // Find set1 and verify summary
      const resultSet1 = json.data.find((s: any) => s.id === set1.id);
      expect(resultSet1).toBeDefined();
      expect(resultSet1.summary.totalPoints).toBe(2);
    });

    it('should include summary with due and new point counts', async () => {
      // Arrange
      const set = await createTestRecallSet(ctx.repos);
      await createTestRecallPoint(ctx.repos, {
        recallSetId: set.id,
        fsrsState: { state: 'new', reps: 0 },
      });

      // Act
      const response = await app.request('/api/recall-sets');
      const json = await getJsonResponse<any>(response);

      // Assert
      const resultSet = json.data[0];
      expect(resultSet.summary).toBeDefined();
      expect(resultSet.summary.totalPoints).toBeDefined();
      expect(resultSet.summary.duePoints).toBeDefined();
      expect(resultSet.summary.newPoints).toBeDefined();
    });
  });

  // ==========================================================================
  // POST /api/recall-sets
  // ==========================================================================
  describe('POST /api/recall-sets', () => {
    it('should create a new recall set with valid data', async () => {
      // Arrange
      const input = {
        name: 'JavaScript Fundamentals',
        description: 'Core JS concepts',
        discussionSystemPrompt: 'You are a helpful JavaScript tutor.',
      };

      // Act
      const response = await app.request('/api/recall-sets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(201);
      expect(json.success).toBe(true);
      expect(json.data.id).toBeDefined();
      expect(json.data.id).toMatch(/^rs_/);
      expect(json.data.name).toBe(input.name);
      expect(json.data.description).toBe(input.description);
      expect(json.data.discussionSystemPrompt).toBe(input.discussionSystemPrompt);
      expect(json.data.status).toBe('active');
    });

    it('should return error when name is missing', async () => {
      // Arrange
      const input = {
        description: 'Test description',
        discussionSystemPrompt: 'You are a helpful tutor.',
      };

      // Act
      const response = await app.request('/api/recall-sets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('BAD_REQUEST');
      expect(json.error.message).toContain('Name');
    });

    it('should return error when name is empty', async () => {
      // Arrange
      const input = {
        name: '',
        description: 'Test description',
        discussionSystemPrompt: 'You are a helpful tutor.',
      };

      // Act
      const response = await app.request('/api/recall-sets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
    });

    it('should return error when name exceeds max length', async () => {
      // Arrange
      const input = {
        name: 'A'.repeat(101),
        description: 'Test description',
        discussionSystemPrompt: 'You are a helpful tutor.',
      };

      // Act
      const response = await app.request('/api/recall-sets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
    });

    it('should return error when system prompt is too short', async () => {
      // Arrange
      const input = {
        name: 'Test Set',
        description: 'Test description',
        discussionSystemPrompt: 'Short', // Less than 10 characters
      };

      // Act
      const response = await app.request('/api/recall-sets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
    });

    it('should handle missing discussionSystemPrompt', async () => {
      // Arrange
      const input = {
        name: 'Test Set',
        description: 'Test description',
      };

      // Act
      const response = await app.request('/api/recall-sets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
    });
  });

  // ==========================================================================
  // GET /api/recall-sets/:id
  // ==========================================================================
  describe('GET /api/recall-sets/:id', () => {
    it('should return recall set with summary stats', async () => {
      // Arrange
      const set = await createTestRecallSet(ctx.repos, { name: 'Test Set' });
      await createTestRecallPoint(ctx.repos, { recallSetId: set.id });

      // Act
      const response = await app.request(`/api/recall-sets/${set.id}`);
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.id).toBe(set.id);
      expect(json.data.name).toBe('Test Set');
      expect(json.data.summary).toBeDefined();
      expect(json.data.summary.totalPoints).toBe(1);
    });

    it('should return 404 for non-existent recall set', async () => {
      // Act
      const response = await app.request('/api/recall-sets/rs_nonexistent');
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(404);
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('NOT_FOUND');
    });

    it('should include correct due and new point counts', async () => {
      // Arrange
      const set = await createTestRecallSet(ctx.repos);
      // Create a new point (due immediately)
      await createTestRecallPoint(ctx.repos, {
        recallSetId: set.id,
        fsrsState: { state: 'new', reps: 0, due: new Date() },
      });
      // Create a reviewed point not due
      await createTestRecallPoint(ctx.repos, {
        recallSetId: set.id,
        fsrsState: { state: 'review', reps: 5, due: new Date(Date.now() + 86400000 * 7) },
      });

      // Act
      const response = await app.request(`/api/recall-sets/${set.id}`);
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(json.data.summary.totalPoints).toBe(2);
      expect(json.data.summary.newPoints).toBe(1);
    });
  });

  // ==========================================================================
  // PATCH /api/recall-sets/:id
  // ==========================================================================
  describe('PATCH /api/recall-sets/:id', () => {
    it('should update recall set name', async () => {
      // Arrange
      const set = await createTestRecallSet(ctx.repos, { name: 'Original Name' });

      // Act
      const response = await app.request(`/api/recall-sets/${set.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated Name' }),
      });
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.name).toBe('Updated Name');
    });

    it('should update recall set status', async () => {
      // Arrange
      const set = await createTestRecallSet(ctx.repos, { status: 'active' });

      // Act
      const response = await app.request(`/api/recall-sets/${set.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'paused' }),
      });
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.status).toBe('paused');
    });

    it('should return 404 for non-existent recall set', async () => {
      // Act
      const response = await app.request('/api/recall-sets/rs_nonexistent', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Name' }),
      });
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(404);
      expect(json.success).toBe(false);
    });

    it('should return error when no fields provided', async () => {
      // Arrange
      const set = await createTestRecallSet(ctx.repos);

      // Act
      const response = await app.request(`/api/recall-sets/${set.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error.message).toContain('No fields');
    });

    it('should allow partial updates (only description)', async () => {
      // Arrange
      const set = await createTestRecallSet(ctx.repos, {
        name: 'Original Name',
        description: 'Original Description',
      });

      // Act
      const response = await app.request(`/api/recall-sets/${set.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: 'Updated Description' }),
      });
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(200);
      expect(json.data.name).toBe('Original Name'); // Unchanged
      expect(json.data.description).toBe('Updated Description');
    });
  });

  // ==========================================================================
  // DELETE /api/recall-sets/:id
  // ==========================================================================
  describe('DELETE /api/recall-sets/:id', () => {
    it('should archive recall set (soft delete)', async () => {
      // Arrange
      const set = await createTestRecallSet(ctx.repos, { status: 'active' });

      // Act
      const response = await app.request(`/api/recall-sets/${set.id}`, {
        method: 'DELETE',
      });
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.status).toBe('archived');
    });

    it('should return 404 for non-existent recall set', async () => {
      // Act
      const response = await app.request('/api/recall-sets/rs_nonexistent', {
        method: 'DELETE',
      });
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(404);
      expect(json.success).toBe(false);
    });

    it('should preserve recall set data after archiving', async () => {
      // Arrange
      const set = await createTestRecallSet(ctx.repos, { name: 'Test Set' });
      await createTestRecallPoint(ctx.repos, { recallSetId: set.id });

      // Act
      await app.request(`/api/recall-sets/${set.id}`, { method: 'DELETE' });

      // Verify set still exists with archived status
      const response = await app.request(`/api/recall-sets/${set.id}`);
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(200);
      expect(json.data.name).toBe('Test Set');
      expect(json.data.status).toBe('archived');
      expect(json.data.summary.totalPoints).toBe(1);
    });
  });

  // ==========================================================================
  // GET /api/recall-sets/:id/points
  // ==========================================================================
  describe('GET /api/recall-sets/:id/points', () => {
    it('should return all points for a recall set', async () => {
      // Arrange
      const set = await createTestRecallSet(ctx.repos);
      await createTestRecallPoint(ctx.repos, { recallSetId: set.id, content: 'Point 1 content here' });
      await createTestRecallPoint(ctx.repos, { recallSetId: set.id, content: 'Point 2 content here' });

      // Act
      const response = await app.request(`/api/recall-sets/${set.id}/points`);
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data).toHaveLength(2);
    });

    it('should return empty array when set has no points', async () => {
      // Arrange
      const set = await createTestRecallSet(ctx.repos);

      // Act
      const response = await app.request(`/api/recall-sets/${set.id}/points`);
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(200);
      expect(json.data).toHaveLength(0);
    });

    it('should return 404 for non-existent recall set', async () => {
      // Act
      const response = await app.request('/api/recall-sets/rs_nonexistent/points');
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(404);
      expect(json.success).toBe(false);
    });

    it('should include FSRS state for each point', async () => {
      // Arrange
      const set = await createTestRecallSet(ctx.repos);
      await createTestRecallPoint(ctx.repos, { recallSetId: set.id });

      // Act
      const response = await app.request(`/api/recall-sets/${set.id}/points`);
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(json.data[0].fsrsState).toBeDefined();
      expect(json.data[0].fsrsState.state).toBeDefined();
      expect(json.data[0].fsrsState.due).toBeDefined();
    });
  });

  // ==========================================================================
  // POST /api/recall-sets/:id/points
  // ==========================================================================
  describe('POST /api/recall-sets/:id/points', () => {
    it('should create a new point with valid data', async () => {
      // Arrange
      const set = await createTestRecallSet(ctx.repos);
      const input = {
        content: 'Closures capture variables from outer scope',
        context: 'Understanding JavaScript closures and scope',
      };

      // Act
      const response = await app.request(`/api/recall-sets/${set.id}/points`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(201);
      expect(json.success).toBe(true);
      expect(json.data.id).toBeDefined();
      expect(json.data.id).toMatch(/^rp_/);
      expect(json.data.recallSetId).toBe(set.id);
      expect(json.data.content).toBe(input.content);
      expect(json.data.context).toBe(input.context);
      expect(json.data.fsrsState).toBeDefined();
      expect(json.data.fsrsState.state).toBe('new');
    });

    it('should return 404 for non-existent recall set', async () => {
      // Arrange
      const input = {
        content: 'Test content that is long enough',
        context: 'Test context that is also long enough',
      };

      // Act
      const response = await app.request('/api/recall-sets/rs_nonexistent/points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(404);
      expect(json.success).toBe(false);
    });

    it('should return error when content is too short', async () => {
      // Arrange
      const set = await createTestRecallSet(ctx.repos);
      const input = {
        content: 'Short', // Less than 10 characters
        context: 'Valid context that is long enough',
      };

      // Act
      const response = await app.request(`/api/recall-sets/${set.id}/points`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error.message).toContain('Content');
    });

    it('should return error when context is too short', async () => {
      // Arrange
      const set = await createTestRecallSet(ctx.repos);
      const input = {
        content: 'Valid content that is long enough',
        context: 'Short', // Less than 10 characters
      };

      // Act
      const response = await app.request(`/api/recall-sets/${set.id}/points`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error.message).toContain('Context');
    });

    it('should initialize FSRS state correctly for new point', async () => {
      // Arrange
      const set = await createTestRecallSet(ctx.repos);
      const input = {
        content: 'New recall point content here',
        context: 'Context for the new recall point',
      };

      // Act
      const response = await app.request(`/api/recall-sets/${set.id}/points`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(json.data.fsrsState.state).toBe('new');
      expect(json.data.fsrsState.reps).toBe(0);
      expect(json.data.fsrsState.lapses).toBe(0);
    });
  });

  // ==========================================================================
  // PATCH /api/recall-sets/:id/points/:pointId
  // ==========================================================================
  describe('PATCH /api/recall-sets/:id/points/:pointId', () => {
    it('should update point content', async () => {
      // Arrange
      const set = await createTestRecallSet(ctx.repos);
      const point = await createTestRecallPoint(ctx.repos, { recallSetId: set.id });

      // Act
      const response = await app.request(`/api/recall-sets/${set.id}/points/${point.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Updated content that is long enough' }),
      });
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.content).toBe('Updated content that is long enough');
    });

    it('should update point context', async () => {
      // Arrange
      const set = await createTestRecallSet(ctx.repos);
      const point = await createTestRecallPoint(ctx.repos, { recallSetId: set.id });

      // Act
      const response = await app.request(`/api/recall-sets/${set.id}/points/${point.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: 'Updated context that is long enough' }),
      });
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(200);
      expect(json.data.context).toBe('Updated context that is long enough');
    });

    it('should return 404 for non-existent recall set', async () => {
      // Act
      const response = await app.request('/api/recall-sets/rs_nonexistent/points/rp_123', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Updated content' }),
      });
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(404);
      expect(json.success).toBe(false);
    });

    it('should return 404 for non-existent point', async () => {
      // Arrange
      const set = await createTestRecallSet(ctx.repos);

      // Act
      const response = await app.request(`/api/recall-sets/${set.id}/points/rp_nonexistent`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Updated content that is long enough' }),
      });
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(404);
      expect(json.success).toBe(false);
    });

    it('should return 404 when point belongs to different set', async () => {
      // Arrange
      const set1 = await createTestRecallSet(ctx.repos);
      const set2 = await createTestRecallSet(ctx.repos);
      const point = await createTestRecallPoint(ctx.repos, { recallSetId: set1.id });

      // Act: Try to update point via wrong set
      const response = await app.request(`/api/recall-sets/${set2.id}/points/${point.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Updated content that is long enough' }),
      });
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(404);
      expect(json.success).toBe(false);
    });

    it('should return error when no fields provided', async () => {
      // Arrange
      const set = await createTestRecallSet(ctx.repos);
      const point = await createTestRecallPoint(ctx.repos, { recallSetId: set.id });

      // Act
      const response = await app.request(`/api/recall-sets/${set.id}/points/${point.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error.message).toContain('No fields');
    });
  });

  // ==========================================================================
  // DELETE /api/recall-sets/:id/points/:pointId
  // ==========================================================================
  describe('DELETE /api/recall-sets/:id/points/:pointId', () => {
    it('should delete a point (hard delete)', async () => {
      // Arrange
      const set = await createTestRecallSet(ctx.repos);
      const point = await createTestRecallPoint(ctx.repos, { recallSetId: set.id });

      // Act
      const response = await app.request(`/api/recall-sets/${set.id}/points/${point.id}`, {
        method: 'DELETE',
      });
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.message).toContain('deleted');
      expect(json.data.id).toBe(point.id);

      // Verify point is actually deleted
      const pointsResponse = await app.request(`/api/recall-sets/${set.id}/points`);
      const pointsJson = await getJsonResponse<any>(pointsResponse);
      expect(pointsJson.data).toHaveLength(0);
    });

    it('should return 404 for non-existent recall set', async () => {
      // Act
      const response = await app.request('/api/recall-sets/rs_nonexistent/points/rp_123', {
        method: 'DELETE',
      });
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(404);
      expect(json.success).toBe(false);
    });

    it('should return 404 for non-existent point', async () => {
      // Arrange
      const set = await createTestRecallSet(ctx.repos);

      // Act
      const response = await app.request(`/api/recall-sets/${set.id}/points/rp_nonexistent`, {
        method: 'DELETE',
      });
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(404);
      expect(json.success).toBe(false);
    });

    it('should return 404 when point belongs to different set', async () => {
      // Arrange
      const set1 = await createTestRecallSet(ctx.repos);
      const set2 = await createTestRecallSet(ctx.repos);
      const point = await createTestRecallPoint(ctx.repos, { recallSetId: set1.id });

      // Act: Try to delete point via wrong set
      const response = await app.request(`/api/recall-sets/${set2.id}/points/${point.id}`, {
        method: 'DELETE',
      });
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(404);
      expect(json.success).toBe(false);
    });
  });
});
