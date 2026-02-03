/**
 * Global Error Handler Middleware for Contextual Clarity API
 *
 * This middleware provides consistent error handling across all API endpoints.
 * All errors are transformed into a standardized JSON response format:
 *
 * ```json
 * {
 *   "success": false,
 *   "error": {
 *     "code": "ERROR_CODE",
 *     "message": "Human-readable error message",
 *     "details": { ... } // Optional additional context
 *   }
 * }
 * ```
 *
 * This ensures frontend clients can reliably parse error responses and
 * display appropriate error messages to users.
 *
 * @example
 * ```typescript
 * import { Hono } from 'hono';
 * import { errorHandler, AppError } from '@/api/middleware/error-handler';
 *
 * const app = new Hono();
 *
 * // Apply error handler as the first middleware
 * app.use('*', errorHandler());
 *
 * // Routes can throw AppError for controlled errors
 * app.get('/protected', (c) => {
 *   throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
 * });
 * ```
 */

import type { MiddlewareHandler, Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

/**
 * Standard error codes used throughout the API.
 * These provide consistent error identification for clients.
 */
export const ErrorCodes = {
  // Client errors (4xx)
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  CONFLICT: 'CONFLICT',

  // Server errors (5xx)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  LLM_ERROR: 'LLM_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * Standardized API error response structure.
 * All error responses follow this format for consistency.
 */
export interface ApiErrorResponse {
  success: false;
  error: {
    code: ErrorCode | string;
    message: string;
    details?: unknown;
  };
}

/**
 * Custom application error class for throwing controlled errors.
 *
 * Use this class to throw errors that should result in specific
 * HTTP status codes and error responses. The error handler middleware
 * will catch these and format them appropriately.
 *
 * @example
 * ```typescript
 * // Throw a 404 error
 * throw new AppError('NOT_FOUND', 'Recall set not found', 404);
 *
 * // Throw a validation error with details
 * throw new AppError(
 *   'VALIDATION_ERROR',
 *   'Invalid request parameters',
 *   400,
 *   { field: 'email', reason: 'Invalid format' }
 * );
 * ```
 */
export class AppError extends Error {
  /** Machine-readable error code */
  public readonly code: ErrorCode | string;
  /** HTTP status code to return */
  public readonly statusCode: number;
  /** Additional error context (optional) */
  public readonly details?: unknown;

  constructor(
    code: ErrorCode | string,
    message: string,
    statusCode: number = 500,
    details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;

    // Maintains proper stack trace for where error was thrown (V8 engines)
    Error.captureStackTrace?.(this, AppError);
  }
}

/**
 * Formats an error into the standard API error response structure.
 *
 * @param error - The error to format
 * @returns Standardized error response object
 */
function formatErrorResponse(error: unknown): {
  response: ApiErrorResponse;
  statusCode: number;
} {
  // Handle AppError instances (controlled/expected errors)
  if (error instanceof AppError) {
    return {
      response: {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          ...(error.details !== undefined && { details: error.details }),
        },
      },
      statusCode: error.statusCode,
    };
  }

  // Handle standard Error instances (unexpected errors)
  if (error instanceof Error) {
    // In development, include error details for debugging
    const isDev = process.env.NODE_ENV !== 'production';

    return {
      response: {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: isDev
            ? error.message
            : 'An unexpected error occurred. Please try again.',
          ...(isDev && { details: { stack: error.stack } }),
        },
      },
      statusCode: 500,
    };
  }

  // Handle non-Error throws (rare but possible)
  return {
    response: {
      success: false,
      error: {
        code: ErrorCodes.INTERNAL_ERROR,
        message: 'An unexpected error occurred',
        ...(process.env.NODE_ENV !== 'production' && {
          details: { rawError: String(error) },
        }),
      },
    },
    statusCode: 500,
  };
}

/**
 * Creates the global error handler middleware.
 *
 * This middleware should be applied early in the middleware stack
 * to catch all errors from subsequent handlers. It wraps the entire
 * request pipeline in a try-catch and formats any errors into the
 * standard API response format.
 *
 * @returns Hono middleware handler for error handling
 *
 * @example
 * ```typescript
 * const app = new Hono();
 *
 * // Apply error handler first (catches errors from all subsequent middleware)
 * app.use('*', errorHandler());
 *
 * // Then apply other middleware
 * app.use('*', logger());
 * app.use('*', cors());
 *
 * // Routes
 * app.get('/api/health', (c) => c.json({ status: 'ok' }));
 * ```
 */
export function errorHandler(): MiddlewareHandler {
  return async (c: Context, next) => {
    try {
      await next();
    } catch (error) {
      // Log the error for debugging/monitoring
      console.error('[Error Handler]', error);

      // Format the error into standard response
      const { response, statusCode } = formatErrorResponse(error);

      // Return JSON error response
      // Cast statusCode to ContentfulStatusCode for Hono's type system
      return c.json(response, statusCode as ContentfulStatusCode);
    }
  };
}

/**
 * Helper function to create a not found error for resources.
 *
 * @param resource - Name of the resource type (e.g., 'RecallSet', 'Session')
 * @param id - The ID that was not found
 * @returns AppError configured as a 404 error
 *
 * @example
 * ```typescript
 * const set = await recallSetRepo.findById(id);
 * if (!set) {
 *   throw notFoundError('RecallSet', id);
 * }
 * ```
 */
export function notFoundError(resource: string, id: string | number): AppError {
  return new AppError(
    ErrorCodes.NOT_FOUND,
    `${resource} with ID '${id}' not found`,
    404,
    { resource, id }
  );
}

/**
 * Helper function to create a validation error.
 *
 * @param message - Description of what validation failed
 * @param details - Specific validation failures
 * @returns AppError configured as a 400 error
 *
 * @example
 * ```typescript
 * const result = schema.safeParse(input);
 * if (!result.success) {
 *   throw validationError('Invalid request body', result.error.errors);
 * }
 * ```
 */
export function validationError(
  message: string,
  details?: unknown
): AppError {
  return new AppError(ErrorCodes.VALIDATION_ERROR, message, 400, details);
}
