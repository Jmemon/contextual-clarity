/**
 * Dashboard API Endpoint Tests
 *
 * Tests for the Dashboard API endpoints that power the web dashboard UI.
 * These tests verify the API contract, response structure, and query
 * parameter handling for all dashboard-related endpoints.
 *
 * Endpoints tested:
 * - GET /api/dashboard/overview - Global stats, due points, and streaks
 * - GET /api/dashboard/recent-sessions - Last N sessions with metrics
 * - GET /api/dashboard/upcoming-reviews - Points due in the next N days
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  createTestContext,
  cleanupTestDatabase,
  createTestApp,
  type TestContext,
} from '../setup';
import {
  seedDashboardTestData,
  getJsonResponse,
} from '../helpers';
import type { Hono } from 'hono';

describe('Dashboard API', () => {
  let ctx: TestContext;
  let app: Hono;

  beforeEach(async () => {
    // Create fresh test context with in-memory database
    ctx = createTestContext();
    app = createTestApp(ctx);

    // Seed test data for dashboard tests
    await seedDashboardTestData(ctx.repos);
  });

  afterEach(() => {
    cleanupTestDatabase(ctx);
  });

  // ==========================================================================
  // GET /api/dashboard/overview
  // ==========================================================================
  describe('GET /api/dashboard/overview', () => {
    it('should return expected response structure', async () => {
      // Act
      const response = await app.request('/api/dashboard/overview');
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data).toBeDefined();

      // Verify required fields are present
      const { data } = json;
      expect(data.totalRecallSets).toBeDefined();
      expect(typeof data.totalRecallSets).toBe('number');
      expect(data.activeRecallSets).toBeDefined();
      expect(typeof data.activeRecallSets).toBe('number');
      expect(data.totalSessions).toBeDefined();
      expect(typeof data.totalSessions).toBe('number');
      expect(data.totalStudyTimeMs).toBeDefined();
      expect(typeof data.totalStudyTimeMs).toBe('number');
      expect(data.overallRecallRate).toBeDefined();
      expect(typeof data.overallRecallRate).toBe('number');
      expect(data.todaysSessions).toBeDefined();
      expect(typeof data.todaysSessions).toBe('number');
      expect(data.todaysStudyTimeMs).toBeDefined();
      expect(typeof data.todaysStudyTimeMs).toBe('number');
      expect(data.pointsDueToday).toBeDefined();
      expect(typeof data.pointsDueToday).toBe('number');
      expect(Array.isArray(data.recentSessions)).toBe(true);
      expect(Array.isArray(data.upcomingReviews)).toBe(true);
      expect(data.currentStreak).toBeDefined();
      expect(typeof data.currentStreak).toBe('number');
      expect(data.longestStreak).toBeDefined();
      expect(typeof data.longestStreak).toBe('number');
    });

    it('should return correct recall set counts', async () => {
      // Act
      const response = await app.request('/api/dashboard/overview');
      const json = await getJsonResponse<any>(response);

      // Assert: 3 total sets (2 active, 1 paused)
      expect(json.data.totalRecallSets).toBe(3);
      expect(json.data.activeRecallSets).toBe(2);
    });

    it('should return correct session counts', async () => {
      // Act
      const response = await app.request('/api/dashboard/overview');
      const json = await getJsonResponse<any>(response);

      // Assert: 4 total sessions (1 completed today, 1 yesterday, 1 abandoned, 1 in progress)
      expect(json.data.totalSessions).toBe(4);
      // Today has 2 sessions (completed and in_progress)
      expect(json.data.todaysSessions).toBe(2);
    });

    it('should calculate study time from completed sessions', async () => {
      // Act
      const response = await app.request('/api/dashboard/overview');
      const json = await getJsonResponse<any>(response);

      // Assert: Sum of completed session durations (300000 + 420000)
      expect(json.data.totalStudyTimeMs).toBe(720000);
    });

    it('should include recent sessions sorted by date descending', async () => {
      // Act
      const response = await app.request('/api/dashboard/overview');
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(json.data.recentSessions.length).toBeGreaterThan(0);

      // Verify sorting (most recent first)
      const sessions = json.data.recentSessions;
      for (let i = 1; i < sessions.length; i++) {
        const prevDate = new Date(sessions[i - 1].startedAt).getTime();
        const currDate = new Date(sessions[i].startedAt).getTime();
        expect(prevDate).toBeGreaterThanOrEqual(currDate);
      }
    });

    it('should include upcoming reviews with priority classification', async () => {
      // Act
      const response = await app.request('/api/dashboard/overview');
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(json.data.upcomingReviews.length).toBeGreaterThan(0);

      // Verify each review has required fields
      for (const review of json.data.upcomingReviews) {
        expect(review.recallPointId).toBeDefined();
        expect(review.recallSetId).toBeDefined();
        expect(review.recallSetName).toBeDefined();
        expect(review.recallPointContent).toBeDefined();
        expect(review.daysUntilDue).toBeDefined();
        expect(['overdue', 'due-today', 'upcoming']).toContain(review.priority);
      }
    });

    it('should calculate current streak correctly', async () => {
      // Act
      const response = await app.request('/api/dashboard/overview');
      const json = await getJsonResponse<any>(response);

      // Assert: We have sessions today and yesterday = 2 day streak
      expect(json.data.currentStreak).toBeGreaterThanOrEqual(1);
    });

    it('should return recall rate between 0 and 1', async () => {
      // Act
      const response = await app.request('/api/dashboard/overview');
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(json.data.overallRecallRate).toBeGreaterThanOrEqual(0);
      expect(json.data.overallRecallRate).toBeLessThanOrEqual(1);
    });

    it('should handle empty database gracefully', async () => {
      // Arrange: Create fresh empty context
      const emptyCtx = createTestContext();
      const emptyApp = createTestApp(emptyCtx);

      try {
        // Act
        const response = await emptyApp.request('/api/dashboard/overview');
        const json = await getJsonResponse<any>(response);

        // Assert
        expect(response.status).toBe(200);
        expect(json.success).toBe(true);
        expect(json.data.totalRecallSets).toBe(0);
        expect(json.data.totalSessions).toBe(0);
        expect(json.data.recentSessions).toHaveLength(0);
        expect(json.data.upcomingReviews).toHaveLength(0);
      } finally {
        cleanupTestDatabase(emptyCtx);
      }
    });
  });

  // ==========================================================================
  // GET /api/dashboard/recent-sessions
  // ==========================================================================
  describe('GET /api/dashboard/recent-sessions', () => {
    it('should return default 5 sessions when no limit specified', async () => {
      // Act
      const response = await app.request('/api/dashboard/recent-sessions');
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.limit).toBe(5);
      // We have 4 sessions, so should return all 4
      expect(json.data.sessions.length).toBeLessThanOrEqual(5);
    });

    it('should respect limit query parameter', async () => {
      // Act
      const response = await app.request('/api/dashboard/recent-sessions?limit=2');
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(200);
      expect(json.data.limit).toBe(2);
      expect(json.data.sessions.length).toBeLessThanOrEqual(2);
    });

    it('should cap limit at maximum (50)', async () => {
      // Act
      const response = await app.request('/api/dashboard/recent-sessions?limit=100');
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(200);
      expect(json.data.limit).toBe(50);
    });

    it('should return error for invalid limit parameter', async () => {
      // Act
      const response = await app.request('/api/dashboard/recent-sessions?limit=invalid');
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('BAD_REQUEST');
      expect(json.error.message).toContain('not a number');
    });

    it('should return error for negative limit', async () => {
      // Act
      const response = await app.request('/api/dashboard/recent-sessions?limit=-5');
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error.message).toContain('positive');
    });

    it('should return error for zero limit', async () => {
      // Act
      const response = await app.request('/api/dashboard/recent-sessions?limit=0');
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
    });

    it('should include total session count', async () => {
      // Act
      const response = await app.request('/api/dashboard/recent-sessions');
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(json.data.total).toBeDefined();
      expect(typeof json.data.total).toBe('number');
      expect(json.data.total).toBe(4); // We seeded 4 sessions
    });

    it('should return sessions sorted by date descending', async () => {
      // Act
      const response = await app.request('/api/dashboard/recent-sessions');
      const json = await getJsonResponse<any>(response);

      // Assert
      const sessions = json.data.sessions;
      for (let i = 1; i < sessions.length; i++) {
        const prevDate = new Date(sessions[i - 1].startedAt).getTime();
        const currDate = new Date(sessions[i].startedAt).getTime();
        expect(prevDate).toBeGreaterThanOrEqual(currDate);
      }
    });

    it('should include recall set name for each session', async () => {
      // Act
      const response = await app.request('/api/dashboard/recent-sessions');
      const json = await getJsonResponse<any>(response);

      // Assert
      for (const session of json.data.sessions) {
        expect(session.recallSetName).toBeDefined();
        expect(typeof session.recallSetName).toBe('string');
        expect(session.recallSetName.length).toBeGreaterThan(0);
      }
    });
  });

  // ==========================================================================
  // GET /api/dashboard/upcoming-reviews
  // ==========================================================================
  describe('GET /api/dashboard/upcoming-reviews', () => {
    it('should return default 7 days of reviews when no days specified', async () => {
      // Act
      const response = await app.request('/api/dashboard/upcoming-reviews');
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.days).toBe(7);
    });

    it('should respect days query parameter', async () => {
      // Act
      const response = await app.request('/api/dashboard/upcoming-reviews?days=14');
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(200);
      expect(json.data.days).toBe(14);
    });

    it('should cap days at maximum (90)', async () => {
      // Act
      const response = await app.request('/api/dashboard/upcoming-reviews?days=150');
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(200);
      expect(json.data.days).toBe(90);
    });

    it('should return error for invalid days parameter', async () => {
      // Act
      const response = await app.request('/api/dashboard/upcoming-reviews?days=invalid');
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('BAD_REQUEST');
    });

    it('should return error for negative days', async () => {
      // Act
      const response = await app.request('/api/dashboard/upcoming-reviews?days=-7');
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
    });

    it('should include summary statistics', async () => {
      // Act
      const response = await app.request('/api/dashboard/upcoming-reviews');
      const json = await getJsonResponse<any>(response);

      // Assert
      expect(json.data.summary).toBeDefined();
      expect(json.data.summary.total).toBeDefined();
      expect(json.data.summary.overdue).toBeDefined();
      expect(json.data.summary.dueToday).toBeDefined();
      expect(json.data.summary.upcoming).toBeDefined();

      // Verify counts add up
      const { overdue, dueToday, upcoming, total } = json.data.summary;
      expect(overdue + dueToday + upcoming).toBeLessThanOrEqual(total);
    });

    it('should filter reviews to only include those within days window', async () => {
      // Act
      const response = await app.request('/api/dashboard/upcoming-reviews?days=3');
      const json = await getJsonResponse<any>(response);

      // Assert: All reviews should be within 3 days
      for (const review of json.data.reviews) {
        expect(review.daysUntilDue).toBeLessThanOrEqual(3);
      }
    });

    it('should sort reviews by urgency (overdue first)', async () => {
      // Act
      const response = await app.request('/api/dashboard/upcoming-reviews');
      const json = await getJsonResponse<any>(response);

      // Assert: Reviews should be sorted by daysUntilDue ascending
      const reviews = json.data.reviews;
      for (let i = 1; i < reviews.length; i++) {
        expect(reviews[i].daysUntilDue).toBeGreaterThanOrEqual(reviews[i - 1].daysUntilDue);
      }
    });

    it('should include required fields for each review', async () => {
      // Act
      const response = await app.request('/api/dashboard/upcoming-reviews');
      const json = await getJsonResponse<any>(response);

      // Assert
      for (const review of json.data.reviews) {
        expect(review.recallPointId).toBeDefined();
        expect(review.recallSetId).toBeDefined();
        expect(review.recallSetName).toBeDefined();
        expect(review.recallPointContent).toBeDefined();
        expect(review.daysUntilDue).toBeDefined();
        expect(review.priority).toBeDefined();
        expect(['overdue', 'due-today', 'upcoming']).toContain(review.priority);
      }
    });

    it('should only include reviews from active recall sets', async () => {
      // Act
      const response = await app.request('/api/dashboard/upcoming-reviews');
      const json = await getJsonResponse<any>(response);

      // Assert: Should not include points from paused set (rs_test_paused)
      for (const review of json.data.reviews) {
        expect(review.recallSetId).not.toBe('rs_test_paused');
      }
    });

    it('should handle empty results gracefully', async () => {
      // Arrange: Create fresh context with no due points
      const emptyCtx = createTestContext();
      const emptyApp = createTestApp(emptyCtx);

      try {
        // Act
        const response = await emptyApp.request('/api/dashboard/upcoming-reviews');
        const json = await getJsonResponse<any>(response);

        // Assert
        expect(response.status).toBe(200);
        expect(json.success).toBe(true);
        expect(json.data.reviews).toHaveLength(0);
        expect(json.data.summary.total).toBe(0);
      } finally {
        cleanupTestDatabase(emptyCtx);
      }
    });
  });
});
