/**
 * API Response Types
 *
 * Standardized response type definitions for the Contextual Clarity API.
 * All API endpoints return responses conforming to these types to ensure
 * consistent client-side handling.
 *
 * Two response types are defined:
 * 1. ApiResponse<T> - For successful responses with typed data
 * 2. ApiErrorResponse - For error responses with structured error info
 *
 * This type system enables:
 * - TypeScript type inference for response data
 * - Consistent error handling across all endpoints
 * - Clear API contracts for frontend development
 *
 * @example
 * ```typescript
 * // Success response
 * const response: ApiResponse<RecallSet[]> = {
 *   success: true,
 *   data: [{ id: 'rs_1', name: 'History', ... }]
 * };
 *
 * // Error response
 * const error: ApiErrorResponse = {
 *   success: false,
 *   error: {
 *     code: 'NOT_FOUND',
 *     message: 'Recall set not found',
 *   }
 * };
 * ```
 */

import { z } from 'zod';

// ============================================================================
// Success Response Types
// ============================================================================

/**
 * Standard success response wrapper for API endpoints.
 *
 * All successful API responses wrap their data in this structure,
 * allowing clients to reliably check the `success` field and access
 * strongly-typed data.
 *
 * @typeParam T - The type of data being returned
 *
 * @example
 * ```typescript
 * // Handler returning a typed response
 * app.get('/api/recall-sets', (c): ApiResponse<RecallSet[]> => {
 *   const sets = await recallSetRepo.findAll();
 *   return c.json({ success: true, data: sets });
 * });
 * ```
 */
export interface ApiResponse<T> {
  /** Indicates the request was successful */
  success: true;
  /** The response payload with type T */
  data: T;
}

// ============================================================================
// Error Response Types
// ============================================================================

/**
 * Detailed error information structure.
 *
 * Contains all information needed for clients to understand and handle
 * errors appropriately, from displaying user-friendly messages to
 * highlighting specific validation failures.
 */
export interface ApiError {
  /**
   * Machine-readable error code for programmatic handling.
   * Examples: 'VALIDATION_ERROR', 'NOT_FOUND', 'UNAUTHORIZED'
   */
  code: string;

  /**
   * Human-readable error message suitable for display.
   * Should be clear and actionable when possible.
   */
  message: string;

  /**
   * Additional error context (optional).
   * For validation errors, this contains field-level error details.
   * For other errors, may contain debugging information.
   */
  details?: unknown;
}

/**
 * Standard error response wrapper for API endpoints.
 *
 * All error responses from the API conform to this structure,
 * enabling consistent error handling on the client side.
 *
 * @example
 * ```typescript
 * // Client-side error handling
 * const response = await fetch('/api/recall-sets/123');
 * const data = await response.json();
 *
 * if (!data.success) {
 *   // TypeScript knows this is ApiErrorResponse
 *   console.error(`Error ${data.error.code}: ${data.error.message}`);
 *   if (data.error.details) {
 *     // Handle validation errors or additional context
 *   }
 * }
 * ```
 */
export interface ApiErrorResponse {
  /** Indicates the request failed */
  success: false;
  /** Error information */
  error: ApiError;
}

/**
 * Union type for any API response (success or error).
 *
 * Useful for typing generic response handlers that need to
 * discriminate between success and error cases.
 *
 * @typeParam T - The type of data for successful responses
 */
export type ApiResult<T> = ApiResponse<T> | ApiErrorResponse;

// ============================================================================
// Validation Detail Types
// ============================================================================

/**
 * Structure for individual validation error details.
 *
 * When a Zod validation fails, errors are transformed into this
 * format to provide clear, field-specific error information.
 */
export interface ValidationErrorDetail {
  /** Dot-notation path to the invalid field (e.g., 'user.email') */
  path: string;
  /** Human-readable description of the validation failure */
  message: string;
}

// ============================================================================
// Common Request Schemas (Zod)
// ============================================================================

/**
 * Schema for creating a new RecallSet.
 *
 * Validates:
 * - name: Required string, 1-100 characters
 * - description: Required string, max 1000 characters
 * - discussionSystemPrompt: Required string, min 10 characters (meaningful prompt)
 *
 * @example
 * ```typescript
 * const input = {
 *   name: 'JavaScript Fundamentals',
 *   description: 'Core JS concepts including closures, prototypes, and async',
 *   discussionSystemPrompt: 'You are a JavaScript expert helping students understand core concepts through Socratic dialogue.',
 * };
 *
 * const result = createRecallSetSchema.safeParse(input);
 * if (result.success) {
 *   // result.data is typed and validated
 * }
 * ```
 */
export const createRecallSetSchema = z.object({
  /** Name of the recall set (1-100 characters) */
  name: z
    .string()
    .min(1, 'Name is required')
    .max(100, 'Name must be 100 characters or less'),

  /** Description of what this recall set covers (max 1000 characters) */
  description: z
    .string()
    .max(1000, 'Description must be 1000 characters or less'),

  /** System prompt for AI discussions (min 10 characters for meaningful prompt) */
  discussionSystemPrompt: z
    .string()
    .min(10, 'System prompt must be at least 10 characters'),
});

/** TypeScript type inferred from createRecallSetSchema */
export type CreateRecallSetInput = z.infer<typeof createRecallSetSchema>;

/**
 * Schema for creating a new RecallPoint within a RecallSet.
 *
 * Validates:
 * - content: Required string, 10-2000 characters (the knowledge to recall)
 * - context: Required string, 10-2000 characters (supporting context)
 *
 * Note: recallSetId is typically provided via URL parameter, not request body.
 *
 * @example
 * ```typescript
 * const input = {
 *   content: 'Closures allow inner functions to access outer function variables',
 *   context: 'In JavaScript, closures are created every time a function is created. They enable data privacy and factory patterns.',
 * };
 *
 * const result = createRecallPointSchema.safeParse(input);
 * ```
 */
export const createRecallPointSchema = z.object({
  /** The core knowledge to be recalled (10-2000 characters) */
  content: z
    .string()
    .min(10, 'Content must be at least 10 characters')
    .max(2000, 'Content must be 2000 characters or less'),

  /** Supporting context for understanding (10-2000 characters) */
  context: z
    .string()
    .min(10, 'Context must be at least 10 characters')
    .max(2000, 'Context must be 2000 characters or less'),
});

/** TypeScript type inferred from createRecallPointSchema */
export type CreateRecallPointInput = z.infer<typeof createRecallPointSchema>;

/**
 * Schema for updating an existing RecallSet.
 *
 * All fields are optional since partial updates are supported.
 * At least one field must be provided for a meaningful update.
 */
export const updateRecallSetSchema = z.object({
  /** Updated name (1-100 characters) */
  name: z
    .string()
    .min(1, 'Name cannot be empty')
    .max(100, 'Name must be 100 characters or less')
    .optional(),

  /** Updated description (max 1000 characters) */
  description: z
    .string()
    .max(1000, 'Description must be 1000 characters or less')
    .optional(),

  /** Updated system prompt (min 10 characters) */
  discussionSystemPrompt: z
    .string()
    .min(10, 'System prompt must be at least 10 characters')
    .optional(),

  /** Updated status */
  status: z.enum(['active', 'paused', 'archived']).optional(),
});

/** TypeScript type inferred from updateRecallSetSchema */
export type UpdateRecallSetInput = z.infer<typeof updateRecallSetSchema>;

/**
 * Schema for updating an existing RecallPoint.
 *
 * All fields are optional since partial updates are supported.
 */
export const updateRecallPointSchema = z.object({
  /** Updated content (10-2000 characters) */
  content: z
    .string()
    .min(10, 'Content must be at least 10 characters')
    .max(2000, 'Content must be 2000 characters or less')
    .optional(),

  /** Updated context (10-2000 characters) */
  context: z
    .string()
    .min(10, 'Context must be at least 10 characters')
    .max(2000, 'Context must be 2000 characters or less')
    .optional(),
});

/** TypeScript type inferred from updateRecallPointSchema */
export type UpdateRecallPointInput = z.infer<typeof updateRecallPointSchema>;
