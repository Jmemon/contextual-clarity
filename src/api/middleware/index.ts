/**
 * API Middleware - Barrel Export
 *
 * This module exports all middleware components for the Contextual Clarity API.
 * Middleware is applied in a specific order to ensure proper request handling:
 *
 * 1. Error Handler - Catches and formats all errors
 * 2. Logger - Logs request information
 * 3. CORS - Handles cross-origin requests
 * 4. Rate Limiter - Protects against abuse
 *
 * @example
 * ```typescript
 * import {
 *   corsMiddleware,
 *   errorHandler,
 *   loggerMiddleware,
 *   rateLimiter,
 *   RATE_LIMITS,
 * } from '@/api/middleware';
 *
 * const app = new Hono();
 *
 * // Apply middleware in order
 * app.use('*', errorHandler());
 * app.use('*', loggerMiddleware());
 * app.use('*', corsMiddleware());
 * app.use('/api/*', rateLimiter(RATE_LIMITS.GENERAL));
 * ```
 */

// CORS middleware for cross-origin request handling
export {
  corsMiddleware,
  getProductionCorsConfig,
  DEFAULT_CORS_CONFIG,
  type CorsConfig,
} from './cors';

// Error handler for consistent error responses
export {
  errorHandler,
  AppError,
  ErrorCodes,
  notFoundError,
  validationError,
  type ErrorCode,
  type ApiErrorResponse,
} from './error-handler';

// Request logger for debugging and monitoring
export {
  loggerMiddleware,
  DEFAULT_LOGGER_CONFIG,
  type LoggerConfig,
} from './logger';

// Rate limiter for API protection
export {
  rateLimiter,
  generalRateLimiter,
  llmRateLimiter,
  clearRateLimitStore,
  RATE_LIMITS,
  type RateLimitConfig,
} from './rate-limit';

// User context middleware for authentication and authorization
export {
  userContext,
  getUser,
  getUserOptional,
  isAuthenticated,
} from './user-context';

// Request body validation with Zod schemas
export {
  validate,
  validateQuery,
  getValidatedBody,
  getValidatedQuery,
} from './validate';
