/**
 * User Types for Contextual Clarity
 *
 * Defines the User interface and default user for the application.
 * Currently implements a single-user system with hardcoded default user.
 *
 * Future Auth Integration Points:
 * - Add authentication fields (email, passwordHash, etc.)
 * - Add user preferences/settings interface
 * - Add user roles/permissions enum
 * - Consider moving to a separate auth module when implementing JWT/session auth
 *
 * @example
 * ```typescript
 * import { User, DEFAULT_USER } from '@/api/types/user';
 *
 * function processUserData(user: User) {
 *   console.log(`Processing data for user: ${user.name}`);
 * }
 * ```
 */

/**
 * User interface representing a Contextual Clarity user.
 *
 * This interface defines the core user properties needed across the application.
 * All user-related data (recall sets, sessions, analytics) is associated with a user ID.
 *
 * Future fields to consider when adding auth:
 * - email: string
 * - passwordHash?: string (for internal auth)
 * - provider?: 'local' | 'google' | 'github' (for OAuth)
 * - role?: 'user' | 'admin'
 * - settings?: UserSettings
 * - lastLoginAt?: Date
 */
export interface User {
  /** Unique identifier for the user */
  id: string;

  /** Display name for the user */
  name: string;

  /** When the user account was created */
  createdAt: Date;
}

/**
 * Default single user for the application.
 *
 * This is used as a placeholder until multi-user authentication is implemented.
 * All data in the current single-user system is associated with this user ID.
 *
 * IMPORTANT: When implementing auth, ensure migration strategy:
 * 1. Keep 'default-user' ID for backwards compatibility
 * 2. Associate existing data with the first authenticated user OR
 * 3. Prompt user to claim existing data during first login
 */
export const DEFAULT_USER: User = {
  id: 'default-user',
  name: 'Default User',
  createdAt: new Date('2024-01-01'),
};

/**
 * Type guard to check if an object is a valid User
 *
 * Useful for runtime validation of user objects from external sources
 * (e.g., JWT payload, API responses).
 *
 * @param obj - Object to validate
 * @returns True if the object conforms to the User interface
 */
export function isUser(obj: unknown): obj is User {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const maybeUser = obj as Record<string, unknown>;

  return (
    typeof maybeUser.id === 'string' &&
    typeof maybeUser.name === 'string' &&
    (maybeUser.createdAt instanceof Date ||
      typeof maybeUser.createdAt === 'string')
  );
}
