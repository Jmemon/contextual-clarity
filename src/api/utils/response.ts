/**
 * API Response Utilities
 *
 * Helper functions for creating consistent API responses throughout
 * the Contextual Clarity application. These utilities ensure all endpoints
 * return responses in the standardized format defined in types.ts.
 *
 * Two main helpers are provided:
 * - success(): Creates a successful response with typed data
 * - error(): Creates an error response with code, message, and optional details
 *
 * Using these helpers instead of raw c.json() calls provides:
 * - Automatic type inference for response structure
 * - Consistent response format across all endpoints
 * - Reduced boilerplate in route handlers
 *
 * @example
 * ```typescript
 * import { success, error } from '@/api/utils/response';
 *
 * app.get('/api/recall-sets/:id', async (c) => {
 *   const id = c.req.param('id');
 *   const set = await recallSetRepo.findById(id);
 *
 *   if (!set) {
 *     return error(c, 'NOT_FOUND', `Recall set ${id} not found`, 404);
 *   }
 *
 *   return success(c, set);
 * });
 * ```
 */

import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ApiResponse, ApiErrorResponse } from '../types';

// ============================================================================
// Success Response Helper
// ============================================================================

/**
 * Creates a standardized success response.
 *
 * Wraps the provided data in the ApiResponse structure and returns
 * it as a JSON response with the specified status code.
 *
 * @typeParam T - Type of the data being returned
 * @param c - Hono context object
 * @param data - The data to include in the response
 * @param statusCode - HTTP status code (default: 200)
 * @returns Hono Response object with JSON body
 *
 * @example
 * ```typescript
 * // Simple success response (200)
 * app.get('/api/health', (c) => {
 *   return success(c, { status: 'ok' });
 * });
 *
 * // Success with custom status code (201 Created)
 * app.post('/api/recall-sets', async (c) => {
 *   const newSet = await createRecallSet(input);
 *   return success(c, newSet, 201);
 * });
 *
 * // Response type is inferred
 * app.get('/api/recall-sets', async (c) => {
 *   const sets: RecallSet[] = await recallSetRepo.findAll();
 *   return success(c, sets); // ApiResponse<RecallSet[]>
 * });
 * ```
 */
export function success<T>(
  c: Context,
  data: T,
  statusCode: number = 200
): Response {
  const response: ApiResponse<T> = {
    success: true,
    data,
  };

  // Cast statusCode to ContentfulStatusCode for Hono's type system
  return c.json(response, statusCode as ContentfulStatusCode);
}

// ============================================================================
// Error Response Helper
// ============================================================================

/**
 * Creates a standardized error response.
 *
 * Constructs an ApiErrorResponse with the provided error details and
 * returns it as a JSON response with the specified status code.
 *
 * @param c - Hono context object
 * @param code - Machine-readable error code (e.g., 'NOT_FOUND', 'VALIDATION_ERROR')
 * @param message - Human-readable error message
 * @param statusCode - HTTP status code (default: 400)
 * @param details - Optional additional error context
 * @returns Hono Response object with JSON body
 *
 * @example
 * ```typescript
 * // Basic error response
 * app.get('/api/recall-sets/:id', async (c) => {
 *   const set = await recallSetRepo.findById(id);
 *   if (!set) {
 *     return error(c, 'NOT_FOUND', 'Recall set not found', 404);
 *   }
 *   return success(c, set);
 * });
 *
 * // Error with details (e.g., validation errors)
 * app.post('/api/recall-sets', async (c) => {
 *   const result = schema.safeParse(body);
 *   if (!result.success) {
 *     return error(c, 'VALIDATION_ERROR', 'Invalid request', 400, {
 *       errors: result.error.errors,
 *     });
 *   }
 *   // ...
 * });
 *
 * // Server error (500)
 * app.get('/api/data', async (c) => {
 *   try {
 *     const data = await fetchData();
 *     return success(c, data);
 *   } catch (err) {
 *     return error(c, 'INTERNAL_ERROR', 'Failed to fetch data', 500);
 *   }
 * });
 * ```
 */
export function error(
  c: Context,
  code: string,
  message: string,
  statusCode: number = 400,
  details?: unknown
): Response {
  const response: ApiErrorResponse = {
    success: false,
    error: {
      code,
      message,
      // Only include details if provided (avoids undefined in JSON)
      ...(details !== undefined && { details }),
    },
  };

  // Cast statusCode to ContentfulStatusCode for Hono's type system
  return c.json(response, statusCode as ContentfulStatusCode);
}

// ============================================================================
// Convenience Error Helpers
// ============================================================================

/**
 * Creates a 404 Not Found error response for missing resources.
 *
 * @param c - Hono context object
 * @param resource - Name of the resource type (e.g., 'RecallSet')
 * @param id - The ID that was not found
 * @returns Hono Response object with 404 status
 *
 * @example
 * ```typescript
 * app.get('/api/recall-sets/:id', async (c) => {
 *   const id = c.req.param('id');
 *   const set = await recallSetRepo.findById(id);
 *
 *   if (!set) {
 *     return notFound(c, 'RecallSet', id);
 *   }
 *
 *   return success(c, set);
 * });
 * ```
 */
export function notFound(
  c: Context,
  resource: string,
  id: string | number
): Response {
  return error(
    c,
    'NOT_FOUND',
    `${resource} with ID '${id}' not found`,
    404,
    { resource, id }
  );
}

/**
 * Creates a 400 Bad Request error response.
 *
 * @param c - Hono context object
 * @param message - Description of what was wrong with the request
 * @param details - Optional additional context
 * @returns Hono Response object with 400 status
 *
 * @example
 * ```typescript
 * app.post('/api/sessions', async (c) => {
 *   const body = await c.req.json();
 *
 *   if (!body.recallSetId) {
 *     return badRequest(c, 'recallSetId is required');
 *   }
 *
 *   // ...
 * });
 * ```
 */
export function badRequest(
  c: Context,
  message: string,
  details?: unknown
): Response {
  return error(c, 'BAD_REQUEST', message, 400, details);
}

/**
 * Creates a 401 Unauthorized error response.
 *
 * @param c - Hono context object
 * @param message - Description of the authentication failure
 * @returns Hono Response object with 401 status
 *
 * @example
 * ```typescript
 * app.get('/api/protected', async (c) => {
 *   const token = c.req.header('Authorization');
 *
 *   if (!token) {
 *     return unauthorized(c, 'Authentication required');
 *   }
 *
 *   // ...
 * });
 * ```
 */
export function unauthorized(c: Context, message: string = 'Unauthorized'): Response {
  return error(c, 'UNAUTHORIZED', message, 401);
}

/**
 * Creates a 403 Forbidden error response.
 *
 * @param c - Hono context object
 * @param message - Description of why access was denied
 * @returns Hono Response object with 403 status
 *
 * @example
 * ```typescript
 * app.delete('/api/recall-sets/:id', async (c) => {
 *   const user = c.get('user');
 *   const set = await recallSetRepo.findById(id);
 *
 *   if (set.ownerId !== user.id) {
 *     return forbidden(c, 'You do not have permission to delete this recall set');
 *   }
 *
 *   // ...
 * });
 * ```
 */
export function forbidden(c: Context, message: string = 'Forbidden'): Response {
  return error(c, 'FORBIDDEN', message, 403);
}

/**
 * Creates a 500 Internal Server Error response.
 *
 * Use this for unexpected errors that should be logged and investigated.
 * In production, avoid exposing internal error details to clients.
 *
 * @param c - Hono context object
 * @param message - User-facing error message
 * @param details - Optional details (only included in development)
 * @returns Hono Response object with 500 status
 *
 * @example
 * ```typescript
 * app.get('/api/data', async (c) => {
 *   try {
 *     const data = await fetchExternalService();
 *     return success(c, data);
 *   } catch (err) {
 *     console.error('External service error:', err);
 *     return internalError(c, 'Service temporarily unavailable');
 *   }
 * });
 * ```
 */
export function internalError(
  c: Context,
  message: string = 'An internal error occurred',
  details?: unknown
): Response {
  // Only include details in non-production environments
  const safeDetails = process.env.NODE_ENV !== 'production' ? details : undefined;
  return error(c, 'INTERNAL_ERROR', message, 500, safeDetails);
}
