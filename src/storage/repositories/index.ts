/**
 * Repository Layer - Barrel Export
 *
 * This module re-exports all repository classes and their input types
 * for convenient importing. The repository pattern abstracts data access
 * operations, allowing business logic to work with domain models without
 * knowing the specifics of the underlying data store.
 *
 * Each repository provides:
 * - Standard CRUD operations (findById, findAll, create, update, delete)
 * - Entity-specific queries (e.g., findDuePoints, findInProgress)
 * - Automatic mapping between DB rows and domain models
 *
 * @example
 * ```typescript
 * import {
 *   RecallSetRepository,
 *   RecallPointRepository,
 *   SessionRepository,
 *   SessionMessageRepository,
 * } from '@/storage/repositories';
 *
 * // Create repository instances with a database connection
 * const recallSetRepo = new RecallSetRepository(db);
 * const recallPointRepo = new RecallPointRepository(db);
 * const sessionRepo = new SessionRepository(db);
 * const messageRepo = new SessionMessageRepository(db);
 * ```
 */

// Base repository interface
export type { Repository } from './base';

// RecallSet repository and types
export {
  RecallSetRepository,
  type CreateRecallSetInput,
  type UpdateRecallSetInput,
} from './recall-set.repository';

// RecallPoint repository and types
export {
  RecallPointRepository,
  type CreateRecallPointInput,
  type UpdateRecallPointInput,
} from './recall-point.repository';

// Session repository and types
export {
  SessionRepository,
  type CreateSessionInput,
  type UpdateSessionInput,
} from './session.repository';

// SessionMessage repository and types
export {
  SessionMessageRepository,
  type CreateSessionMessageInput,
  type UpdateSessionMessageInput,
} from './session-message.repository';
