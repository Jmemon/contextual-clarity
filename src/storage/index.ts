/**
 * Storage Module - Barrel Export
 *
 * This file serves as the public API for the storage module.
 * It re-exports all schema definitions and types for use throughout
 * the application.
 *
 * Usage:
 *   import { recallSets, RecallSet, NewRecallSet } from '@/storage';
 */

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
