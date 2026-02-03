/**
 * Contextual Clarity API Server
 *
 * Main Hono web server for the Contextual Clarity application.
 * This server provides REST API endpoints for the frontend and handles
 * WebSocket connections for real-time session communication.
 *
 * Features:
 * - Automatic port discovery (finds available port if preferred is in use)
 * - CORS configuration for frontend dev server
 * - Request logging with response times
 * - Rate limiting (100 req/min general, 10 req/min for LLM endpoints)
 * - Consistent JSON error responses
 * - Health check endpoint
 *
 * Usage:
 *   bun run server
 *
 * Environment Variables:
 *   PORT - Preferred port (default: 3001)
 *   NODE_ENV - Environment mode (development/production/test)
 *   ALLOWED_ORIGINS - Comma-separated list of allowed CORS origins
 *
 * @example
 * ```bash
 * # Start the server
 * bun run server
 *
 * # With custom port
 * PORT=8080 bun run server
 * ```
 */

import { Hono } from 'hono';
import {
  corsMiddleware,
  errorHandler,
  loggerMiddleware,
  generalRateLimiter,
  llmRateLimiter,
  getProductionCorsConfig,
} from './middleware';

// ============================================================================
// Server Configuration
// ============================================================================

/**
 * Server configuration loaded from environment variables with defaults.
 */
const config = {
  /** Preferred port for the server (will find alternative if unavailable) */
  preferredPort: parseInt(process.env.PORT || '3001', 10),
  /** Maximum port to try before giving up */
  maxPort: 3100,
  /** Environment mode */
  nodeEnv: process.env.NODE_ENV || 'development',
  /** Whether we're in production mode */
  isProduction: process.env.NODE_ENV === 'production',
};

// ============================================================================
// Port Availability Check
// ============================================================================

/**
 * Finds an available port starting from the preferred port.
 *
 * This function attempts to bind to the preferred port, and if that fails
 * (e.g., port already in use), it recursively tries the next port until
 * it finds one that's available or reaches the maximum port number.
 *
 * Uses Node.js net module to test port availability by creating a temporary
 * server, checking if it can listen, then immediately closing it.
 *
 * @param preferredPort - The port to try first
 * @param maxPort - Maximum port number to try before giving up (default: 3100)
 * @returns Promise resolving to an available port number
 * @throws Error if no available port is found within the range
 *
 * @example
 * ```typescript
 * const port = await findAvailablePort(3000);
 * console.log(`Using port ${port}`);
 * ```
 */
async function findAvailablePort(
  preferredPort: number,
  maxPort: number = config.maxPort
): Promise<number> {
  // Safety check: don't exceed maximum port
  if (preferredPort > maxPort) {
    throw new Error(
      `No available port found in range ${config.preferredPort}-${maxPort}`
    );
  }

  // Import Node.js net module for low-level port checking
  const net = await import('net');

  return new Promise((resolve) => {
    // Create a temporary server to test if the port is available
    const server = net.createServer();

    // Try to listen on the port
    server.listen(preferredPort, () => {
      // Success! Port is available. Close the test server and return the port.
      server.close(() => {
        resolve(preferredPort);
      });
    });

    // If we get an error (port in use, permission denied, etc.),
    // try the next port
    server.on('error', () => {
      console.log(`[Server] Port ${preferredPort} is in use, trying ${preferredPort + 1}...`);
      resolve(findAvailablePort(preferredPort + 1, maxPort));
    });
  });
}

// ============================================================================
// Hono Application Setup
// ============================================================================

/**
 * Creates and configures the Hono application with all middleware.
 *
 * Middleware is applied in this order:
 * 1. Error Handler - Must be first to catch all errors
 * 2. Logger - Logs all requests with timing
 * 3. CORS - Handles cross-origin requests
 * 4. Rate Limiters - Applied to specific route groups
 *
 * @returns Configured Hono application instance
 */
function createApp(): Hono {
  const app = new Hono();

  // ---------------------------------------------------------------------------
  // Global Middleware (applied to all routes)
  // ---------------------------------------------------------------------------

  // Error handler MUST be first to catch errors from all subsequent middleware
  app.use('*', errorHandler());

  // Request logging for debugging and monitoring
  app.use('*', loggerMiddleware());

  // CORS configuration - use production config if available
  const corsConfig = config.isProduction ? getProductionCorsConfig() : {};
  app.use('*', corsMiddleware(corsConfig));

  // ---------------------------------------------------------------------------
  // Health Check Endpoint
  // ---------------------------------------------------------------------------

  /**
   * Health check endpoint for container orchestration and load balancers.
   * Returns basic server status information.
   *
   * GET /health
   * Response: { status: 'ok', timestamp: string, environment: string }
   */
  app.get('/health', (c) => {
    return c.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: config.nodeEnv,
      version: '0.1.0',
    });
  });

  // ---------------------------------------------------------------------------
  // API Routes with Rate Limiting
  // ---------------------------------------------------------------------------

  // General API rate limit (100 req/min) for most endpoints
  app.use('/api/*', generalRateLimiter());

  // Stricter rate limit (10 req/min) for LLM/session endpoints
  // These are expensive operations that call the LLM API
  app.use('/api/sessions/*', llmRateLimiter());
  app.use('/api/evaluate/*', llmRateLimiter());

  // ---------------------------------------------------------------------------
  // Placeholder API Routes (to be implemented in subsequent tasks)
  // ---------------------------------------------------------------------------

  /**
   * Root API endpoint - returns API information
   */
  app.get('/api', (c) => {
    return c.json({
      name: 'Contextual Clarity API',
      version: '0.1.0',
      documentation: '/api/docs', // Future: OpenAPI documentation
    });
  });

  /**
   * Placeholder for recall sets routes (P3-T02)
   */
  app.get('/api/recall-sets', (c) => {
    return c.json({
      message: 'Recall sets endpoint - to be implemented in P3-T02',
      routes: [
        'GET /api/recall-sets - List all recall sets',
        'GET /api/recall-sets/:id - Get a specific recall set',
        'POST /api/recall-sets - Create a new recall set',
        'PUT /api/recall-sets/:id - Update a recall set',
        'DELETE /api/recall-sets/:id - Delete a recall set',
      ],
    });
  });

  /**
   * Placeholder for sessions routes (P3-T03)
   */
  app.get('/api/sessions', (c) => {
    return c.json({
      message: 'Sessions endpoint - to be implemented in P3-T03',
      routes: [
        'GET /api/sessions - List all sessions',
        'POST /api/sessions - Start a new session',
        'GET /api/sessions/:id - Get session details',
        'POST /api/sessions/:id/messages - Send a message',
      ],
    });
  });

  /**
   * Placeholder for analytics routes (P3-T04)
   */
  app.get('/api/analytics', (c) => {
    return c.json({
      message: 'Analytics endpoint - to be implemented in P3-T04',
      routes: [
        'GET /api/analytics/dashboard - Dashboard summary',
        'GET /api/analytics/sessions - Session analytics',
        'GET /api/analytics/recall-points - Recall point analytics',
      ],
    });
  });

  // ---------------------------------------------------------------------------
  // 404 Handler for unmatched routes
  // ---------------------------------------------------------------------------

  app.notFound((c) => {
    return c.json(
      {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Route ${c.req.method} ${c.req.path} not found`,
        },
      },
      404
    );
  });

  return app;
}

// ============================================================================
// Server Startup
// ============================================================================

/**
 * Starts the HTTP server on an available port.
 *
 * This function:
 * 1. Finds an available port (starting from preferred)
 * 2. Creates the Hono application with middleware
 * 3. Starts the Bun server
 * 4. Logs startup information
 */
async function startServer(): Promise<void> {
  try {
    // Find an available port
    const port = await findAvailablePort(config.preferredPort);

    // Create the configured application
    const app = createApp();

    // Start the server using Bun's built-in server
    const server = Bun.serve({
      port,
      fetch: app.fetch,
    });

    // Log startup information
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║           Contextual Clarity API Server                   ║');
    console.log('╠═══════════════════════════════════════════════════════════╣');
    console.log(`║  🚀 Server running on http://localhost:${port}              ║`);
    console.log(`║  📝 Environment: ${config.nodeEnv.padEnd(39)}║`);
    console.log('║                                                           ║');
    console.log('║  Endpoints:                                               ║');
    console.log(`║    Health:    http://localhost:${port}/health               ║`);
    console.log(`║    API:       http://localhost:${port}/api                  ║`);
    console.log('║                                                           ║');
    console.log('║  Rate Limits:                                             ║');
    console.log('║    General:   100 requests/minute                         ║');
    console.log('║    LLM:       10 requests/minute                          ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log('');

    // Graceful shutdown handler
    process.on('SIGINT', () => {
      console.log('\n[Server] Shutting down gracefully...');
      server.stop();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      console.log('\n[Server] Received SIGTERM, shutting down...');
      server.stop();
      process.exit(0);
    });
  } catch (error) {
    console.error('[Server] Failed to start:', error);
    process.exit(1);
  }
}

// Start the server when this file is run directly
startServer();

// Export for testing and programmatic use
export { createApp, findAvailablePort, config };
