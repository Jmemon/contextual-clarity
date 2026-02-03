/**
 * User Context Middleware
 *
 * Middleware that injects user context into all API route handlers.
 * This enables user-aware operations throughout the API layer.
 *
 * Current Implementation:
 * - Single hardcoded default user for all requests
 * - No authentication required
 *
 * Future Auth Implementation:
 * When adding authentication (JWT/session-based), this middleware will:
 * 1. Extract auth token from Authorization header or cookies
 * 2. Validate the token (JWT verification or session lookup)
 * 3. Fetch user data from database
 * 4. Set user in context (or throw 401 if invalid)
 *
 * @example
 * ```typescript
 * // In server.ts
 * import { userContext, getUser } from '@/api/middleware/user-context';
 *
 * app.use('/api/*', userContext());
 *
 * // In route handlers
 * app.get('/api/recall-sets', (c) => {
 *   const user = getUser(c);
 *   // Fetch recall sets for user.id
 * });
 * ```
 */

import type { Context, Next } from 'hono';
import { DEFAULT_USER, type User } from '../types/user';

// ============================================================================
// Context Variable Type Declaration
// ============================================================================

/**
 * Extend Hono's context variables to include user.
 * This provides type safety when accessing c.get('user').
 *
 * Note: In a larger application, this would be in a central types file
 * that extends the Hono Environment type globally.
 */
declare module 'hono' {
  interface ContextVariableMap {
    user: User;
  }
}

// ============================================================================
// User Context Middleware
// ============================================================================

/**
 * Creates middleware that adds user context to all requests.
 *
 * This middleware injects a user object into the Hono context, making
 * it available to all subsequent route handlers via `c.get('user')` or
 * the type-safe `getUser(c)` helper.
 *
 * @returns Hono middleware function
 *
 * @example
 * ```typescript
 * // Apply to all API routes
 * app.use('/api/*', userContext());
 *
 * // Or apply globally
 * app.use('*', userContext());
 * ```
 *
 * Future Auth Integration:
 * ```typescript
 * export function userContext() {
 *   return async (c: Context, next: Next) => {
 *     const token = c.req.header('Authorization')?.replace('Bearer ', '');
 *
 *     if (!token) {
 *       // Allow unauthenticated requests for public routes
 *       c.set('user', null);
 *       await next();
 *       return;
 *     }
 *
 *     try {
 *       const payload = await verifyJWT(token);
 *       const user = await getUserById(payload.userId);
 *       c.set('user', user);
 *     } catch (error) {
 *       return c.json({ error: 'Invalid token' }, 401);
 *     }
 *
 *     await next();
 *   };
 * }
 * ```
 */
export function userContext() {
  return async (c: Context, next: Next) => {
    // ---------------------------------------------------------------------------
    // Future: Extract and validate authentication token
    // ---------------------------------------------------------------------------
    // const authHeader = c.req.header('Authorization');
    // if (authHeader) {
    //   const token = authHeader.replace('Bearer ', '');
    //   try {
    //     const payload = await verifyJWT(token, process.env.JWT_SECRET);
    //     const user = await getUserFromDatabase(payload.userId);
    //     c.set('user', user);
    //   } catch (error) {
    //     // Token invalid or expired
    //     return c.json({
    //       success: false,
    //       error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' }
    //     }, 401);
    //   }
    // }

    // ---------------------------------------------------------------------------
    // Current: Use default single user for all requests
    // ---------------------------------------------------------------------------
    c.set('user', DEFAULT_USER);

    await next();
  };
}

// ============================================================================
// User Context Helpers
// ============================================================================

/**
 * Type-safe getter for user from Hono context.
 *
 * Use this helper instead of directly calling `c.get('user')` to ensure
 * the user context middleware has been applied and the user exists.
 *
 * @param c - Hono context object
 * @returns The authenticated user
 * @throws Error if user context middleware was not applied
 *
 * @example
 * ```typescript
 * app.get('/api/profile', (c) => {
 *   const user = getUser(c);
 *   return c.json({ id: user.id, name: user.name });
 * });
 * ```
 */
export function getUser(c: Context): User {
  const user = c.get('user');

  if (!user) {
    throw new Error(
      'User context not initialized. Ensure userContext() middleware is applied to this route.'
    );
  }

  return user;
}

/**
 * Optional user getter that returns null instead of throwing.
 *
 * Useful for routes that work both with and without authentication,
 * such as public endpoints that show additional data for logged-in users.
 *
 * @param c - Hono context object
 * @returns The authenticated user, or null if not authenticated
 *
 * @example
 * ```typescript
 * app.get('/api/public-data', (c) => {
 *   const user = getUserOptional(c);
 *   const data = getPublicData();
 *
 *   if (user) {
 *     // Add user-specific data for authenticated users
 *     data.savedItems = getUserSavedItems(user.id);
 *   }
 *
 *   return c.json(data);
 * });
 * ```
 */
export function getUserOptional(c: Context): User | null {
  return c.get('user') || null;
}

/**
 * Check if a user is authenticated in the current request.
 *
 * @param c - Hono context object
 * @returns True if user is authenticated
 */
export function isAuthenticated(c: Context): boolean {
  return c.get('user') !== null && c.get('user') !== undefined;
}
