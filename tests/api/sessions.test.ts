/**
 * Sessions API Endpoint Tests
 *
 * Tests for the Sessions API endpoints that handle session lifecycle
 * and history. These tests verify the API contract, pagination, filtering,
 * and session management operations.
 *
 * Endpoints tested:
 * - GET /api/sessions - List sessions with pagination and filters
 * - GET /api/sessions/:id - Get session details
 * - GET /api/sessions/:id/transcript - Get session transcript with markers
 * - POST /api/sessions/start - Start a new session
 * - POST /api/sessions/:id/abandon - Abandon an in-progress session
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
  createTestSession,
  createTestSessionMetrics,
  createTestRecallOutcome,
  getJsonResponse,
  daysAgo,
} from '../helpers';
import type { Hono } from 'hono';

describe('Sessions API', () => {
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
  // GET /api/sessions
  // ==========================================================================
  describe('GET /api/sessions', () => {
    it('should return empty list when no sessions exist', async () => {
      // Act
      const response = await app.request('/api/sessions');
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.sessions).toHaveLength(0);
      expect(json.data.pagination.total).toBe(0);
    });

    it('should return paginated list of sessions', async () => {
      // Arrange
      const set = await createTestRecallSet(ctx.repos);
      await createTestSession(ctx.repos, { recallSetId: set.id, status: 'completed' });
      await createTestSession(ctx.repos, { recallSetId: set.id, status: 'completed' });
      await createTestSession(ctx.repos, { recallSetId: set.id, status: 'completed' });

      // Act
      const response = await app.request('/api/sessions');
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(200);
      expect(json.data.sessions).toHaveLength(3);
      expect(json.data.pagination.total).toBe(3);
      expect(json.data.pagination.limit).toBe(20); // Default limit
      expect(json.data.pagination.offset).toBe(0);
    });

    it('should respect limit parameter', async () => {
      // Arrange
      const set = await createTestRecallSet(ctx.repos);
      for (let i = 0; i < 5; i++) {
        await createTestSession(ctx.repos, { recallSetId: set.id, status: 'completed' });
      }

      // Act
      const response = await app.request('/api/sessions?limit=2');
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(json.data.sessions).toHaveLength(2);
      expect(json.data.pagination.limit).toBe(2);
      expect(json.data.pagination.hasMore).toBe(true);
    });

    it('should respect offset parameter', async () => {
      // Arrange
      const set = await createTestRecallSet(ctx.repos);
      for (let i = 0; i < 5; i++) {
        await createTestSession(ctx.repos, { recallSetId: set.id, status: 'completed' });
      }

      // Act
      const response = await app.request('/api/sessions?limit=2&offset=2');
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(json.data.sessions).toHaveLength(2);
      expect(json.data.pagination.offset).toBe(2);
      expect(json.data.pagination.total).toBe(5);
    });

    it('should cap limit at maximum (100)', async () => {
      // Act
      const response = await app.request('/api/sessions?limit=200');
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(json.data.pagination.limit).toBe(100);
    });

    it('should filter by recallSetId', async () => {
      // Arrange
      const set1 = await createTestRecallSet(ctx.repos, { name: 'Set 1' });
      const set2 = await createTestRecallSet(ctx.repos, { name: 'Set 2' });
      await createTestSession(ctx.repos, { recallSetId: set1.id });
      await createTestSession(ctx.repos, { recallSetId: set1.id });
      await createTestSession(ctx.repos, { recallSetId: set2.id });

      // Act
      const response = await app.request(`/api/sessions?recallSetId=${set1.id}`);
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(json.data.sessions).toHaveLength(2);
      expect(json.data.sessions.every((s: any) => s.recallSetId === set1.id)).toBe(true);
    });

    it('should filter by status', async () => {
      // Arrange
      const set = await createTestRecallSet(ctx.repos);
      await createTestSession(ctx.repos, { recallSetId: set.id, status: 'completed' });
      await createTestSession(ctx.repos, { recallSetId: set.id, status: 'abandoned' });
      await createTestSession(ctx.repos, { recallSetId: set.id, status: 'in_progress' });

      // Act
      const response = await app.request('/api/sessions?status=completed');
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(json.data.sessions).toHaveLength(1);
      expect(json.data.sessions[0].status).toBe('completed');
    });

    it('should return error for invalid status filter', async () => {
      // Act
      const response = await app.request('/api/sessions?status=invalid');
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error.message).toContain('Invalid status');
    });

    it('should return sessions sorted by startedAt descending', async () => {
      // Arrange
      const set = await createTestRecallSet(ctx.repos);
      await createTestSession(ctx.repos, { recallSetId: set.id, startedAt: daysAgo(3) });
      await createTestSession(ctx.repos, { recallSetId: set.id, startedAt: daysAgo(1) });
      await createTestSession(ctx.repos, { recallSetId: set.id, startedAt: daysAgo(2) });

      // Act
      const response = await app.request('/api/sessions');
      const json = await getJsonResponse<any>(response);

      // Assert
      const sessions = json.data.sessions;
      for (let i = 1; i < sessions.length; i++) {
        const prevDate = new Date(sessions[i - 1].startedAt).getTime();
        const currDate = new Date(sessions[i].startedAt).getTime();
        expect(prevDate).toBeGreaterThanOrEqual(currDate);
      }
    });

    it('should include metrics for completed sessions', async () => {
      // Arrange
      const set = await createTestRecallSet(ctx.repos);
      const session = await createTestSession(ctx.repos, {
        recallSetId: set.id,
        status: 'completed',
      });
      await createTestSessionMetrics(ctx.repos, {
        sessionId: session.id,
        durationMs: 300000,
        overallRecallRate: 0.85,
        engagementScore: 90,
      });

      // Act
      const response = await app.request('/api/sessions');
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(json.data.sessions[0].metrics).toBeDefined();
      expect(json.data.sessions[0].metrics.durationMs).toBe(300000);
      expect(json.data.sessions[0].metrics.recallRate).toBe(0.85);
    });

    it('should return null metrics for sessions without metrics', async () => {
      // Arrange
      const set = await createTestRecallSet(ctx.repos);
      await createTestSession(ctx.repos, { recallSetId: set.id, status: 'in_progress' });

      // Act
      const response = await app.request('/api/sessions');
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(json.data.sessions[0].metrics).toBeNull();
    });
  });

  // ==========================================================================
  // GET /api/sessions/:id
  // ==========================================================================
  describe('GET /api/sessions/:id', () => {
    it('should return session details with recall set name', async () => {
      // Arrange
      const set = await createTestRecallSet(ctx.repos, { name: 'JavaScript Fundamentals' });
      const point = await createTestRecallPoint(ctx.repos, { recallSetId: set.id });
      const session = await createTestSession(ctx.repos, {
        recallSetId: set.id,
        targetRecallPointIds: [point.id],
        status: 'completed',
      });

      // Act
      const response = await app.request(`/api/sessions/${session.id}`);
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.session.id).toBe(session.id);
      expect(json.data.session.recallSetName).toBe('JavaScript Fundamentals');
      expect(json.data.session.targetRecallPointIds).toContain(point.id);
    });

    it('should return 404 for non-existent session', async () => {
      // Act
      const response = await app.request('/api/sessions/sess_nonexistent');
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(404);
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('NOT_FOUND');
    });

    it('should include metrics for completed session', async () => {
      // Arrange
      const set = await createTestRecallSet(ctx.repos);
      const session = await createTestSession(ctx.repos, {
        recallSetId: set.id,
        status: 'completed',
      });
      await createTestSessionMetrics(ctx.repos, {
        sessionId: session.id,
        durationMs: 300000,
        activeTimeMs: 280000,
        overallRecallRate: 0.9,
        engagementScore: 85,
        recallPointsAttempted: 3,
        recallPointsSuccessful: 2,
        recallPointsFailed: 1,
      });

      // Act
      const response = await app.request(`/api/sessions/${session.id}`);
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(json.data.metrics).toBeDefined();
      expect(json.data.metrics.durationMs).toBe(300000);
      expect(json.data.metrics.activeTimeMs).toBe(280000);
      expect(json.data.metrics.recallRate).toBe(0.9);
      expect(json.data.metrics.engagementScore).toBe(85);
      expect(json.data.metrics.recallPointsAttempted).toBe(3);
      expect(json.data.metrics.recallPointsSuccessful).toBe(2);
      expect(json.data.metrics.recallPointsFailed).toBe(1);
    });

    it('should return null metrics for session without metrics', async () => {
      // Arrange
      const set = await createTestRecallSet(ctx.repos);
      const session = await createTestSession(ctx.repos, {
        recallSetId: set.id,
        status: 'in_progress',
      });

      // Act
      const response = await app.request(`/api/sessions/${session.id}`);
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(json.data.metrics).toBeNull();
    });
  });

  // ==========================================================================
  // GET /api/sessions/:id/transcript
  // ==========================================================================
  describe('GET /api/sessions/:id/transcript', () => {
    it('should return empty transcript for session with no messages', async () => {
      // Arrange
      const set = await createTestRecallSet(ctx.repos);
      const session = await createTestSession(ctx.repos, { recallSetId: set.id });

      // Act
      const response = await app.request(`/api/sessions/${session.id}/transcript`);
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.sessionId).toBe(session.id);
      expect(json.data.messages).toHaveLength(0);
      expect(json.data.totalMessages).toBe(0);
    });

    it('should return 404 for non-existent session', async () => {
      // Act
      const response = await app.request('/api/sessions/sess_nonexistent/transcript');
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(404);
      expect(json.success).toBe(false);
    });

    it('should return messages with required fields', async () => {
      // Arrange
      const set = await createTestRecallSet(ctx.repos);
      const session = await createTestSession(ctx.repos, { recallSetId: set.id });

      // Add some messages
      await ctx.repos.messageRepo.create({
        id: `msg_${crypto.randomUUID()}`,
        sessionId: session.id,
        role: 'assistant',
        content: 'Hello! Let us explore what you know.',
        tokenCount: 10,
        timestamp: new Date(),
      });
      await ctx.repos.messageRepo.create({
        id: `msg_${crypto.randomUUID()}`,
        sessionId: session.id,
        role: 'user',
        content: 'I think I remember this concept.',
        tokenCount: 8,
        timestamp: new Date(),
      });

      // Act
      const response = await app.request(`/api/sessions/${session.id}/transcript`);
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(json.data.messages).toHaveLength(2);
      expect(json.data.totalMessages).toBe(2);

      for (const msg of json.data.messages) {
        expect(msg.id).toBeDefined();
        expect(msg.role).toBeDefined();
        expect(msg.content).toBeDefined();
        expect(msg.timestamp).toBeDefined();
        expect(msg.messageIndex).toBeDefined();
      }
    });

    it('should include evaluation markers when recall outcomes exist', async () => {
      // Arrange
      const set = await createTestRecallSet(ctx.repos);
      const point = await createTestRecallPoint(ctx.repos, { recallSetId: set.id });
      const session = await createTestSession(ctx.repos, {
        recallSetId: set.id,
        targetRecallPointIds: [point.id],
      });

      // Add messages
      for (let i = 0; i < 6; i++) {
        await ctx.repos.messageRepo.create({
          id: `msg_${crypto.randomUUID()}`,
          sessionId: session.id,
          role: i % 2 === 0 ? 'assistant' : 'user',
          content: `Message ${i}`,
          tokenCount: 5,
          timestamp: new Date(Date.now() + i * 1000),
        });
      }

      // Add recall outcome spanning messages 0-5
      await createTestRecallOutcome(ctx.repos, {
        sessionId: session.id,
        recallPointId: point.id,
        success: true,
        confidence: 0.9,
        messageIndexStart: 0,
        messageIndexEnd: 5,
      });

      // Act
      const response = await app.request(`/api/sessions/${session.id}/transcript`);
      const json = await getJsonResponse<any>(response);

      // Assert
      const firstMessage = json.data.messages[0];
      expect(firstMessage.evaluationMarker).toBeDefined();
      expect(firstMessage.evaluationMarker.recallPointId).toBe(point.id);
      expect(firstMessage.evaluationMarker.isStart).toBe(true);

      const lastMessage = json.data.messages[5];
      expect(lastMessage.evaluationMarker).toBeDefined();
      expect(lastMessage.evaluationMarker.isEnd).toBe(true);
      expect(lastMessage.evaluationMarker.success).toBe(true);
      expect(lastMessage.evaluationMarker.confidence).toBe(0.9);
    });
  });

  // ==========================================================================
  // POST /api/sessions/start
  // ==========================================================================
  describe('POST /api/sessions/start', () => {
    it('should create new session for active recall set', async () => {
      // Arrange
      const set = await createTestRecallSet(ctx.repos, { status: 'active' });
      const point = await createTestRecallPoint(ctx.repos, { recallSetId: set.id });

      // Act
      const response = await app.request('/api/sessions/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recallSetId: set.id }),
      });
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(201);
      expect(json.success).toBe(true);
      expect(json.data.sessionId).toBeDefined();
      expect(json.data.sessionId).toMatch(/^sess_/);
      expect(json.data.message).toContain('started');
      expect(json.data.isResume).toBe(false);
      expect(json.data.targetRecallPointCount).toBe(1);
    });

    it('should return error when recallSetId is missing', async () => {
      // Act
      const response = await app.request('/api/sessions/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error.message).toContain('recallSetId');
    });

    it('should return 404 for non-existent recall set', async () => {
      // Act
      const response = await app.request('/api/sessions/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recallSetId: 'rs_nonexistent' }),
      });
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(404);
      expect(json.success).toBe(false);
    });

    it('should return error for paused recall set', async () => {
      // Arrange
      const set = await createTestRecallSet(ctx.repos, { status: 'paused' });
      await createTestRecallPoint(ctx.repos, { recallSetId: set.id });

      // Act
      const response = await app.request('/api/sessions/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recallSetId: set.id }),
      });
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error.message).toContain('paused');
    });

    it('should return error for archived recall set', async () => {
      // Arrange
      const set = await createTestRecallSet(ctx.repos, { status: 'archived' });
      await createTestRecallPoint(ctx.repos, { recallSetId: set.id });

      // Act
      const response = await app.request('/api/sessions/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recallSetId: set.id }),
      });
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error.message).toContain('archived');
    });

    it('should return error when recall set has no points', async () => {
      // Arrange
      const set = await createTestRecallSet(ctx.repos, { status: 'active' });
      // No points created

      // Act
      const response = await app.request('/api/sessions/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recallSetId: set.id }),
      });
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error.message).toContain('No recall points');
    });

    it('should resume existing in-progress session', async () => {
      // Arrange
      const set = await createTestRecallSet(ctx.repos, { status: 'active' });
      await createTestRecallPoint(ctx.repos, { recallSetId: set.id });
      const existingSession = await createTestSession(ctx.repos, {
        recallSetId: set.id,
        status: 'in_progress',
      });

      // Act
      const response = await app.request('/api/sessions/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recallSetId: set.id }),
      });
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.sessionId).toBe(existingSession.id);
      expect(json.data.isResume).toBe(true);
      expect(json.data.message).toContain('Resuming');
    });

    it('should create new session if previous was completed', async () => {
      // Arrange
      const set = await createTestRecallSet(ctx.repos, { status: 'active' });
      await createTestRecallPoint(ctx.repos, { recallSetId: set.id });
      const completedSession = await createTestSession(ctx.repos, {
        recallSetId: set.id,
        status: 'completed',
      });

      // Act
      const response = await app.request('/api/sessions/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recallSetId: set.id }),
      });
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(201);
      expect(json.data.sessionId).not.toBe(completedSession.id);
      expect(json.data.isResume).toBe(false);
    });
  });

  // ==========================================================================
  // POST /api/sessions/:id/abandon
  // ==========================================================================
  describe('POST /api/sessions/:id/abandon', () => {
    it('should abandon in-progress session', async () => {
      // Arrange
      const set = await createTestRecallSet(ctx.repos);
      const session = await createTestSession(ctx.repos, {
        recallSetId: set.id,
        status: 'in_progress',
      });

      // Act
      const response = await app.request(`/api/sessions/${session.id}/abandon`, {
        method: 'POST',
      });
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.sessionId).toBe(session.id);
      expect(json.data.status).toBe('abandoned');
      expect(json.data.message).toContain('abandoned');

      // Verify session status in database
      const updatedSession = await ctx.repos.sessionRepo.findById(session.id);
      expect(updatedSession?.status).toBe('abandoned');
    });

    it('should return 404 for non-existent session', async () => {
      // Act
      const response = await app.request('/api/sessions/sess_nonexistent/abandon', {
        method: 'POST',
      });
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(404);
      expect(json.success).toBe(false);
    });

    it('should return error for already completed session', async () => {
      // Arrange
      const set = await createTestRecallSet(ctx.repos);
      const session = await createTestSession(ctx.repos, {
        recallSetId: set.id,
        status: 'completed',
      });

      // Act
      const response = await app.request(`/api/sessions/${session.id}/abandon`, {
        method: 'POST',
      });
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error.message).toContain('already completed');
    });

    it('should return error for already abandoned session', async () => {
      // Arrange
      const set = await createTestRecallSet(ctx.repos);
      const session = await createTestSession(ctx.repos, {
        recallSetId: set.id,
        status: 'abandoned',
      });

      // Act
      const response = await app.request(`/api/sessions/${session.id}/abandon`, {
        method: 'POST',
      });
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error.message).toContain('already abandoned');
    });

    it('should set endedAt timestamp when abandoning', async () => {
      // Arrange
      const set = await createTestRecallSet(ctx.repos);
      const session = await createTestSession(ctx.repos, {
        recallSetId: set.id,
        status: 'in_progress',
      });

      const beforeAbandon = new Date();

      // Act
      await app.request(`/api/sessions/${session.id}/abandon`, {
        method: 'POST',
      });

      // Assert
      const updatedSession = await ctx.repos.sessionRepo.findById(session.id);
      expect(updatedSession?.endedAt).toBeDefined();
      expect(updatedSession?.endedAt!.getTime()).toBeGreaterThanOrEqual(beforeAbandon.getTime());
    });
  });
});
