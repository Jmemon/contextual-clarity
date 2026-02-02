/**
 * FSRS Module - Barrel Export
 *
 * This module provides the FSRS (Free Spaced Repetition Scheduler) integration
 * for Contextual Clarity. It wraps the ts-fsrs library with domain-specific
 * types and a clean API for scheduling recall point reviews.
 *
 * Exports:
 * - FSRSScheduler: The main scheduler class for managing review timing
 * - FSRSSchedulerConfig: Configuration options for the scheduler
 * - RecallRating: User-facing rating type ('forgot' | 'hard' | 'good' | 'easy')
 * - Type conversion utilities for interoperating with ts-fsrs
 *
 * @example
 * ```typescript
 * import { FSRSScheduler, type RecallRating } from '@/core/fsrs';
 *
 * const scheduler = new FSRSScheduler();
 * const initialState = scheduler.createInitialState();
 *
 * // After user review
 * const rating: RecallRating = 'good';
 * const newState = scheduler.schedule(initialState, rating);
 * ```
 *
 * @see https://github.com/open-spaced-repetition/ts-fsrs for algorithm documentation
 */

// Main scheduler class and configuration
export { FSRSScheduler, type FSRSSchedulerConfig } from './scheduler';

// Rating type and conversion utilities
export {
  type RecallRating,
  toFSRSRating,
  fromFSRSRating,
  toFSRSState,
  fromFSRSState,
} from './types';
