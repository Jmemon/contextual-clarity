/**
 * Storage Module - Barrel Export
 *
 * This file serves as the public API for the storage module.
 * It re-exports all schema definitions, types, and database utilities
 * for use throughout the application.
 *
 * Usage:
 *   import { db, recallSets, RecallSet } from '@/storage';
 *   const sets = await db.select().from(recallSets);
 */

// Export database connection factory and default instance
export { db, createDatabase } from './db';
export type { AppDatabase } from './db';

// Export all table definitions
export {
  recallSets,
  recallPoints,
  sessions,
  sessionMessages,
} from './schema';

// Export all inferred types for type-safe database operations
export type {
  RecallSet,
  NewRecallSet,
  RecallPoint,
  NewRecallPoint,
  Session,
  NewSession,
  SessionMessage,
  NewSessionMessage,
} from './schema';
