/**
 * API Routes Aggregator
 *
 * Central module that combines all API route modules into a single router.
 * This provides a clean separation between route definitions and server setup,
 * making it easy to:
 * - Add new route modules without modifying server.ts
 * - Test routes in isolation
 * - Organize routes by domain (recall-sets, sessions, analytics, etc.)
 *
 * Route Structure:
 * - /health - Health check endpoint (mounted at root, not under /api)
 * - /api - API root with version info
 * - /api/recall-sets - RecallSet CRUD operations
 * - /api/sessions - Session management
 * - /api/analytics - Analytics and dashboard data
 *
 * @example
 * ```typescript
 * import { Hono } from 'hono';
 * import { createApiRouter, healthRoutes } from '@/api/routes';
 *
 * const app = new Hono();
 *
 * // Mount health check at root level
 * app.route('/health', healthRoutes());
 *
 * // Mount all API routes under /api
 * app.route('/api', createApiRouter());
 * ```
 */

import { Hono } from 'hono';
import { success } from '../utils/response';
import { recallSetsRoutes } from './recall-sets';
import { dashboardRoutes } from './dashboard';
import { sessionsRoutes } from './sessions';
import { resourcesRoutes } from './resources';
import { voiceRoutes } from './voice';

// Re-export individual route modules for direct access
export { healthRoutes, healthCheckHandler } from './health';
export { recallSetsRoutes } from './recall-sets';
export { dashboardRoutes } from './dashboard';
export { sessionsRoutes } from './sessions';
export { resourcesRoutes } from './resources';
export { voiceRoutes } from './voice';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * API information returned by the root endpoint.
 *
 * Provides basic metadata about the API including version
 * and available documentation links.
 */
export interface ApiInfo {
  /** Human-readable API name */
  name: string;

  /** Current API version */
  version: string;

  /** Path to API documentation (future: OpenAPI spec) */
  documentation: string;

  /** Available top-level endpoints */
  endpoints: {
    /** Endpoint path */
    path: string;
    /** Brief description */
    description: string;
  }[];
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * API version - should match package.json version.
 */
const API_VERSION = '0.1.0';

// ============================================================================
// API Router Factory
// ============================================================================

/**
 * Creates the main API router with all routes mounted.
 *
 * This function creates a new Hono router and mounts all API route
 * modules at their respective paths. Each route module handles its
 * own sub-routes and middleware.
 *
 * Current Routes:
 * - GET / - API information and available endpoints
 * - GET /recall-sets - List recall sets (placeholder)
 * - GET /sessions - List sessions (placeholder)
 * - GET /analytics - Analytics dashboard (placeholder)
 *
 * @returns Configured Hono router with all API routes
 *
 * @example
 * ```typescript
 * const app = new Hono();
 *
 * // Mount API routes - all routes will be prefixed with /api
 * app.route('/api', createApiRouter());
 *
 * // Routes available:
 * // GET /api           - API info
 * // GET /api/recall-sets
 * // POST /api/recall-sets
 * // etc.
 * ```
 */
export function createApiRouter(): Hono {
  const router = new Hono();

  // -------------------------------------------------------------------------
  // API Root Endpoint
  // -------------------------------------------------------------------------

  /**
   * GET /
   *
   * Returns API information including version and available endpoints.
   * This serves as a discovery endpoint for API consumers.
   */
  router.get('/', (c) => {
    const apiInfo: ApiInfo = {
      name: 'Contextual Clarity API',
      version: API_VERSION,
      documentation: '/api/docs', // Future: OpenAPI documentation
      endpoints: [
        { path: '/api/recall-sets', description: 'RecallSet CRUD operations' },
        { path: '/api/sessions', description: 'Study session management' },
        { path: '/api/dashboard', description: 'Dashboard data and analytics' },
        { path: '/api/analytics', description: 'Learning analytics and reports' },
        { path: '/api/recall-sets/:id/resources', description: 'Source resources for a recall set' },
        { path: '/api/voice/token', description: 'Deepgram voice token endpoint' },
        { path: '/api/voice/correct', description: 'Apply spoken correction instruction to transcribed text' },
        { path: '/health', description: 'Health check endpoint' },
      ],
    };

    return success(c, apiInfo);
  });

  // -------------------------------------------------------------------------
  // Route Module Mounts
  // -------------------------------------------------------------------------

  // Mount recall sets CRUD routes
  router.route('/recall-sets', recallSetsRoutes());

  // Mount dashboard data routes (overview, recent sessions, upcoming reviews)
  router.route('/dashboard', dashboardRoutes());

  // Mount sessions routes (list, details, transcript, start, abandon)
  router.route('/sessions', sessionsRoutes());

  // Mount resource routes nested under recall-sets
  router.route('/recall-sets', resourcesRoutes());

  // Mount voice routes (Deepgram token endpoint for voice input)
  router.route('/voice', voiceRoutes());

  // Future: router.route('/analytics', analyticsRoutes());

  /**
   * Placeholder for analytics routes.
   * Will be replaced by actual implementation in a future task.
   */
  router.get('/analytics', (c) => {
    return success(c, {
      message: 'Analytics endpoint - to be implemented',
      routes: [
        'GET /api/analytics/dashboard - Dashboard summary',
        'GET /api/analytics/sessions - Session analytics',
        'GET /api/analytics/recall-points - Recall point analytics',
      ],
    });
  });

  return router;
}

// ============================================================================
// Default Export
// ============================================================================

/**
 * Default export provides the API router factory.
 * This is the main entry point for mounting all API routes.
 */
export default createApiRouter;
