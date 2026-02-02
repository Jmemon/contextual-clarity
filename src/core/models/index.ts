/**
 * Core Domain Models - Barrel Export
 *
 * This module re-exports all domain types for convenient importing.
 * These types form the contract between all modules in Contextual Clarity
 * and have no runtime dependencies.
 *
 * @example
 * ```typescript
 * import {
 *   RecallSet,
 *   RecallPoint,
 *   Session,
 *   FSRSState,
 * } from '@/core/models';
 * ```
 */

// RecallSet types - thematic collections of recall points
export type { RecallSetStatus, RecallSet } from './recall-set';

// RecallPoint types - individual knowledge items with FSRS scheduling
export type {
  FSRSLearningState,
  FSRSState,
  RecallAttempt,
  RecallPoint,
} from './recall-point';

// Session types - study sessions with conversational history
export type {
  SessionStatus,
  MessageRole,
  SessionMessage,
  Session,
} from './session';
