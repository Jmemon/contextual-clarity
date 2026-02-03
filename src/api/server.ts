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
import type { Server } from 'bun';
import {
  corsMiddleware,
  errorHandler,
  loggerMiddleware,
  generalRateLimiter,
  llmRateLimiter,
  getProductionCorsConfig,
  userContext,
} from './middleware';
import { createApiRouter, healthRoutes } from './routes';
import {
  createWebSocketHandlers,
  extractSessionIdFromUrl,
  isWebSocketUpgradeRequest,
  createInitialSessionData,
  type WebSocketSessionData,
  type WebSocketHandlerDependencies,
} from './ws';

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
  // Health Check Route (mounted at root, not under /api)
  // ---------------------------------------------------------------------------

  /**
   * Mount health check routes from the health module.
   * This endpoint is used by container orchestration and load balancers
   * to verify server availability.
   *
   * GET /health
   * Response: { success: true, data: { status: 'ok', timestamp, environment, version } }
   */
  app.route('/health', healthRoutes());

  // ---------------------------------------------------------------------------
  // API Routes with Rate Limiting and User Context
  // ---------------------------------------------------------------------------

  // User context middleware - injects authenticated user into all API requests
  // Future: This will validate auth tokens and fetch user from database
  app.use('/api/*', userContext());

  // General API rate limit (100 req/min) for most endpoints
  app.use('/api/*', generalRateLimiter());

  // Stricter rate limit (10 req/min) for LLM/session endpoints
  // These are expensive operations that call the LLM API
  app.use('/api/sessions/*', llmRateLimiter());
  app.use('/api/evaluate/*', llmRateLimiter());

  // ---------------------------------------------------------------------------
  // Mount API Routes from Route Modules
  // ---------------------------------------------------------------------------

  /**
   * Mount all API routes from the centralized router.
   * This includes:
   * - GET /api - API information
   * - GET /api/recall-sets - RecallSet operations (placeholder)
   * - GET /api/sessions - Session operations (placeholder)
   * - GET /api/analytics - Analytics operations (placeholder)
   *
   * Route implementations are defined in src/api/routes/
   */
  app.route('/api', createApiRouter());

  // ---------------------------------------------------------------------------
  // WebSocket Session Endpoint
  // ---------------------------------------------------------------------------

  /**
   * WebSocket endpoint for real-time session communication.
   *
   * This endpoint handles WebSocket upgrade requests for recall sessions.
   * Clients connect with a sessionId query parameter:
   *   ws://localhost:3001/api/session/ws?sessionId=sess_xxx
   *
   * The WebSocket connection enables:
   * - Real-time streaming of LLM responses
   * - Instant delivery of evaluation results
   * - Efficient bi-directional communication during sessions
   *
   * Note: The actual WebSocket handling is done by Bun's native WebSocket
   * support. This route just validates the request and initiates the upgrade.
   * The server's fetch handler will detect upgrade requests and pass them
   * to the websocket handlers defined in Bun.serve().
   *
   * @see createWebSocketHandlers for the actual message handling logic
   */
  app.get('/api/session/ws', (c) => {
    // Validate this is a WebSocket upgrade request
    if (!isWebSocketUpgradeRequest(c.req.raw)) {
      return c.json(
        {
          success: false,
          error: {
            code: 'UPGRADE_REQUIRED',
            message: 'This endpoint requires a WebSocket connection',
          },
        },
        426
      );
    }

    // Extract and validate sessionId from query parameters
    const url = new URL(c.req.url);
    const result = extractSessionIdFromUrl(url);

    if ('error' in result) {
      return c.json(
        {
          success: false,
          error: {
            code: 'INVALID_SESSION_ID',
            message: result.error,
          },
        },
        400
      );
    }

    // The actual upgrade is handled by the server's websocket configuration.
    // We need to return a response that tells Bun to perform the upgrade.
    // This is handled in the fetch wrapper in startServer().
    // Store the sessionId in a header for the fetch wrapper to extract.
    return new Response(null, {
      status: 101,
      headers: {
        'X-Session-Id': result.sessionId,
      },
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
 * Creates a mock WebSocket handler dependencies object.
 *
 * This is a temporary implementation until T06 (Sessions API) is complete.
 * In production, these would be real repository instances connected to the database.
 *
 * @returns Mock dependencies for WebSocket handler
 */
function createMockWsDependencies(): WebSocketHandlerDependencies {
  // Import repositories when T06 is complete
  // For now, create mock implementations that return placeholder data
  return {
    sessionRepo: {
      findById: async (id: string) => {
        // Mock: Return a placeholder session for testing
        console.log(`[WS Mock] Looking up session: ${id}`);
        return {
          id,
          recallSetId: 'rs_mock_001',
          status: 'in_progress' as const,
          targetRecallPointIds: ['rp_mock_001', 'rp_mock_002'],
          startedAt: new Date(),
          endedAt: null,
        };
      },
    } as unknown as WebSocketHandlerDependencies['sessionRepo'],
    recallSetRepo: {
      findById: async (id: string) => {
        // Mock: Return a placeholder recall set for testing
        console.log(`[WS Mock] Looking up recall set: ${id}`);
        return {
          id,
          name: 'Mock Recall Set',
          description: 'A mock recall set for WebSocket testing',
          systemPrompt: 'You are a helpful tutor.',
          status: 'active' as const,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      },
    } as unknown as WebSocketHandlerDependencies['recallSetRepo'],
  };
}

/**
 * Starts the HTTP server on an available port with WebSocket support.
 *
 * This function:
 * 1. Finds an available port (starting from preferred)
 * 2. Creates the Hono application with middleware
 * 3. Creates WebSocket handlers for real-time sessions
 * 4. Starts the Bun server with both HTTP and WebSocket support
 * 5. Logs startup information
 */
async function startServer(): Promise<void> {
  try {
    // Find an available port
    const port = await findAvailablePort(config.preferredPort);

    // Create the configured application
    const app = createApp();

    // Create WebSocket dependencies (mock for now, real after T06)
    const wsDeps = createMockWsDependencies();

    // Create WebSocket handlers
    const wsHandlers = createWebSocketHandlers(wsDeps);

    // Store reference to server for WebSocket upgrades
    let server: Server<WebSocketSessionData>;

    // Start the server using Bun's built-in server with WebSocket support
    server = Bun.serve<WebSocketSessionData>({
      port,

      // Custom fetch handler that handles WebSocket upgrades
      fetch(req, server) {
        const url = new URL(req.url);

        // Check if this is a WebSocket upgrade request for the session endpoint
        if (
          url.pathname === '/api/session/ws' &&
          isWebSocketUpgradeRequest(req)
        ) {
          // Extract session ID from query parameters
          const result = extractSessionIdFromUrl(url);

          if ('error' in result) {
            return new Response(JSON.stringify({
              success: false,
              error: {
                code: 'INVALID_SESSION_ID',
                message: result.error,
              },
            }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          // Perform the WebSocket upgrade
          const upgraded = server.upgrade(req, {
            data: createInitialSessionData(result.sessionId),
          });

          if (upgraded) {
            // Return undefined to indicate Bun should handle the WebSocket
            return undefined;
          }

          // Upgrade failed
          return new Response(JSON.stringify({
            success: false,
            error: {
              code: 'UPGRADE_FAILED',
              message: 'WebSocket upgrade failed',
            },
          }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // For all other requests, delegate to the Hono app
        return app.fetch(req, { server });
      },

      // WebSocket handlers from the session handler module
      websocket: wsHandlers,
    });

    // Log startup information
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║           Contextual Clarity API Server                   ║');
    console.log('╠═══════════════════════════════════════════════════════════╣');
    console.log(`║  Server running on http://localhost:${port}                 ║`);
    console.log(`║  Environment: ${config.nodeEnv.padEnd(42)}║`);
    console.log('║                                                           ║');
    console.log('║  Endpoints:                                               ║');
    console.log(`║    Health:    http://localhost:${port}/health               ║`);
    console.log(`║    API:       http://localhost:${port}/api                  ║`);
    console.log(`║    WebSocket: ws://localhost:${port}/api/session/ws         ║`);
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
