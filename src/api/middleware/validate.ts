/**
 * Zod Validation Middleware
 *
 * Provides request body validation using Zod schemas for the Contextual Clarity API.
 * This middleware intercepts requests, validates the JSON body against a provided
 * schema, and either passes the validated data to the route handler or returns
 * a structured error response.
 *
 * Key features:
 * - Type-safe validation with Zod schemas
 * - Automatic 400 error responses for invalid requests
 * - Detailed field-level error messages
 * - Validated data accessible via c.get('validatedBody')
 *
 * @example
 * ```typescript
 * import { Hono } from 'hono';
 * import { validate } from '@/api/middleware/validate';
 * import { createRecallSetSchema } from '@/api/types';
 *
 * const app = new Hono();
 *
 * app.post('/api/recall-sets', validate(createRecallSetSchema), async (c) => {
 *   // TypeScript knows the shape of validatedBody
 *   const body = c.get('validatedBody');
 *   const newSet = await createRecallSet(body);
 *   return c.json({ success: true, data: newSet }, 201);
 * });
 * ```
 */

import type { Context, Next, MiddlewareHandler } from 'hono';
import { z } from 'zod';
import type { ValidationErrorDetail, ApiErrorResponse } from '../types';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Extends Hono's context variables to include validated body.
 *
 * This allows TypeScript to recognize c.get('validatedBody') and
 * provide type inference when used with the validate middleware.
 */
declare module 'hono' {
  interface ContextVariableMap {
    /**
     * The validated request body after passing through validate middleware.
     * Type is `unknown` by default; cast to specific schema type in handlers.
     */
    validatedBody: unknown;
  }
}

// ============================================================================
// Validation Middleware
// ============================================================================

/**
 * Creates a validation middleware for the given Zod schema.
 *
 * This middleware:
 * 1. Parses the request body as JSON
 * 2. Validates it against the provided Zod schema
 * 3. If valid: stores result in context and calls next()
 * 4. If invalid: returns 400 with detailed error messages
 *
 * The validated body is accessible in route handlers via:
 * `c.get('validatedBody')` or by using the typed helper `getValidatedBody(c, schema)`
 *
 * @typeParam T - Zod schema type (inferred from parameter)
 * @param schema - Zod schema to validate the request body against
 * @returns Hono middleware handler
 *
 * @example
 * ```typescript
 * // Define a schema
 * const createUserSchema = z.object({
 *   name: z.string().min(1),
 *   email: z.string().email(),
 * });
 *
 * // Apply middleware to route
 * app.post('/api/users', validate(createUserSchema), async (c) => {
 *   const body = c.get('validatedBody') as z.infer<typeof createUserSchema>;
 *   // body is now typed as { name: string; email: string }
 *   return success(c, await createUser(body), 201);
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Error response for invalid input
 * // POST /api/users with body: { name: '', email: 'not-an-email' }
 * // Returns 400:
 * // {
 * //   "success": false,
 * //   "error": {
 * //     "code": "VALIDATION_ERROR",
 * //     "message": "Invalid request body",
 * //     "details": [
 * //       { "path": "name", "message": "String must contain at least 1 character(s)" },
 * //       { "path": "email", "message": "Invalid email" }
 * //     ]
 * //   }
 * // }
 * ```
 */
export function validate<T extends z.ZodType>(schema: T): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    try {
      // Attempt to parse the request body as JSON
      const body = await c.req.json();

      // Validate the body against the provided schema
      const validated = schema.parse(body);

      // Store the validated body in context for the route handler
      c.set('validatedBody', validated);

      // Continue to the next middleware/handler
      await next();
    } catch (err) {
      // Handle Zod validation errors specifically
      if (err instanceof z.ZodError) {
        // Transform Zod errors into our standard error detail format
        const details: ValidationErrorDetail[] = err.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
        }));

        // Return structured validation error response
        const response: ApiErrorResponse = {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details,
          },
        };

        return c.json(response, 400);
      }

      // Handle JSON parse errors (malformed JSON)
      if (err instanceof SyntaxError) {
        const response: ApiErrorResponse = {
          success: false,
          error: {
            code: 'INVALID_JSON',
            message: 'Request body must be valid JSON',
          },
        };

        return c.json(response, 400);
      }

      // Re-throw unexpected errors to be caught by error handler middleware
      throw err;
    }
  };
}

// ============================================================================
// Query Parameter Validation
// ============================================================================

/**
 * Creates a validation middleware for URL query parameters.
 *
 * Similar to validate() but operates on query parameters instead of request body.
 * Useful for validating pagination, filters, and other query-based inputs.
 *
 * @typeParam T - Zod schema type
 * @param schema - Zod schema to validate query parameters against
 * @returns Hono middleware handler
 *
 * @example
 * ```typescript
 * const listQuerySchema = z.object({
 *   page: z.coerce.number().int().positive().default(1),
 *   limit: z.coerce.number().int().min(1).max(100).default(20),
 *   status: z.enum(['active', 'paused', 'archived']).optional(),
 * });
 *
 * app.get('/api/recall-sets', validateQuery(listQuerySchema), async (c) => {
 *   const query = c.get('validatedQuery');
 *   const sets = await recallSetRepo.findAll(query);
 *   return success(c, sets);
 * });
 * ```
 */
export function validateQuery<T extends z.ZodType>(schema: T): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    try {
      // Get all query parameters as an object
      const query = c.req.query();

      // Validate query parameters against the schema
      const validated = schema.parse(query);

      // Store validated query in context
      // Note: Using a different key than 'validatedBody' to distinguish
      c.set('validatedQuery' as 'validatedBody', validated);

      await next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        const details: ValidationErrorDetail[] = err.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
        }));

        const response: ApiErrorResponse = {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid query parameters',
            details,
          },
        };

        return c.json(response, 400);
      }

      throw err;
    }
  };
}

// ============================================================================
// Type-Safe Getter Helper
// ============================================================================

/**
 * Type-safe helper to get the validated body from context.
 *
 * Provides proper TypeScript inference based on the schema type,
 * eliminating the need for manual type casting in route handlers.
 *
 * @typeParam T - Zod schema type
 * @param c - Hono context object
 * @param _schema - The schema used for validation (used only for type inference)
 * @returns The validated body with proper TypeScript type
 *
 * @example
 * ```typescript
 * app.post('/api/recall-sets', validate(createRecallSetSchema), async (c) => {
 *   // body is typed as z.infer<typeof createRecallSetSchema>
 *   const body = getValidatedBody(c, createRecallSetSchema);
 *
 *   const newSet = await recallSetRepo.create({
 *     ...body,
 *     status: 'active',
 *   });
 *
 *   return success(c, newSet, 201);
 * });
 * ```
 */
export function getValidatedBody<T extends z.ZodType>(
  c: Context,
  _schema: T
): z.infer<T> {
  return c.get('validatedBody') as z.infer<T>;
}

/**
 * Type-safe helper to get validated query parameters from context.
 *
 * @typeParam T - Zod schema type
 * @param c - Hono context object
 * @param _schema - The schema used for validation (used only for type inference)
 * @returns The validated query with proper TypeScript type
 */
export function getValidatedQuery<T extends z.ZodType>(
  c: Context,
  _schema: T
): z.infer<T> {
  return c.get('validatedQuery' as 'validatedBody') as z.infer<T>;
}
