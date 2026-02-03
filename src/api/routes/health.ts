/**
 * Health Check Route
 *
 * Provides a health check endpoint for monitoring and orchestration systems.
 * This endpoint is essential for:
 * - Container orchestration (Kubernetes, Docker Swarm) liveness/readiness probes
 * - Load balancer health checks
 * - Monitoring systems (uptime monitoring, alerting)
 * - Development debugging
 *
 * The endpoint returns basic server status information without requiring
 * authentication, making it suitable for external health monitoring.
 *
 * @example
 * ```bash
 * # Check server health
 * curl http://localhost:3001/health
 *
 * # Response:
 * # {
 * #   "success": true,
 * #   "data": {
 * #     "status": "ok",
 * #     "timestamp": "2024-01-15T10:30:00.000Z",
 * #     "environment": "development",
 * #     "version": "0.1.0"
 * #   }
 * # }
 * ```
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import { success } from '../utils/response';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Health check response data structure.
 *
 * Contains essential information about the server's current state
 * and configuration for monitoring purposes.
 */
export interface HealthCheckData {
  /** Server status indicator ('ok' when healthy) */
  status: 'ok' | 'degraded' | 'error';

  /** ISO 8601 timestamp of when the check was performed */
  timestamp: string;

  /** Current running environment (development, production, test) */
  environment: string;

  /** Application version from package.json */
  version: string;
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Application version - should match package.json version.
 * In a production system, this would be read from package.json at build time.
 */
const APP_VERSION = '0.1.0';

// ============================================================================
// Route Definition
// ============================================================================

/**
 * Creates the health check router.
 *
 * This router provides a single GET endpoint that returns the current
 * health status of the API server.
 *
 * @returns Hono router instance with health routes
 *
 * @example
 * ```typescript
 * import { Hono } from 'hono';
 * import { healthRoutes } from '@/api/routes/health';
 *
 * const app = new Hono();
 *
 * // Mount at root level (not under /api)
 * app.route('/health', healthRoutes());
 *
 * // Or directly mount the GET handler
 * app.route('/', healthRoutes());
 * ```
 */
export function healthRoutes(): Hono {
  const router = new Hono();

  /**
   * GET /
   *
   * Returns current server health status.
   *
   * This endpoint is intentionally lightweight and does not perform
   * database connectivity checks or other intensive operations.
   * For more detailed health information (including database status),
   * consider implementing a separate /ready endpoint.
   *
   * Response:
   * - 200 OK: Server is healthy
   * - Response body includes status, timestamp, environment, and version
   */
  router.get('/', (c) => {
    const healthData: HealthCheckData = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      version: APP_VERSION,
    };

    return success(c, healthData);
  });

  return router;
}

/**
 * Alternative export: standalone health check handler.
 *
 * Useful when you need to add the health check directly to an app
 * without creating a sub-router.
 *
 * @example
 * ```typescript
 * import { healthCheckHandler } from '@/api/routes/health';
 *
 * app.get('/health', healthCheckHandler);
 * ```
 */
export function healthCheckHandler(c: Context): Response {
  const healthData: HealthCheckData = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: APP_VERSION,
  };

  return success(c, healthData);
}
