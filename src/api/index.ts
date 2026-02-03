/**
 * API Module - Barrel Export
 *
 * This module exports the main API server components and middleware
 * for the Contextual Clarity application.
 *
 * The API server is built on Hono, a lightweight web framework that
 * runs efficiently on Bun. It provides REST endpoints for:
 *
 * - Recall Sets: CRUD operations for study materials
 * - Sessions: Managing study sessions with Socratic tutoring
 * - Analytics: Dashboard data and learning statistics
 *
 * @example
 * ```typescript
 * // Import the server factory for custom configuration
 * import { createApp, findAvailablePort } from '@/api';
 *
 * // Create a custom app instance
 * const app = createApp();
 *
 * // Or import specific middleware
 * import {
 *   corsMiddleware,
 *   errorHandler,
 *   rateLimiter,
 * } from '@/api/middleware';
 * ```
 *
 * @example
 * ```bash
 * # Start the server
 * bun run server
 *
 * # The server will automatically find an available port
 * # Default: 3001, will increment if unavailable
 * ```
 */

// Server factory and utilities
export { createApp, findAvailablePort, config } from './server';

// Re-export all middleware for convenient access
export {
  // CORS
  corsMiddleware,
  getProductionCorsConfig,
  DEFAULT_CORS_CONFIG,
  type CorsConfig,

  // Error handling
  errorHandler,
  AppError,
  ErrorCodes,
  notFoundError,
  validationError,
  type ErrorCode,
  type ApiErrorResponse,

  // Logging
  loggerMiddleware,
  DEFAULT_LOGGER_CONFIG,
  type LoggerConfig,

  // Rate limiting
  rateLimiter,
  generalRateLimiter,
  llmRateLimiter,
  clearRateLimitStore,
  RATE_LIMITS,
  type RateLimitConfig,
} from './middleware';
