/**
 * FSRS Scheduler - Spaced Repetition Scheduling Engine
 *
 * This module wraps the ts-fsrs library to provide a clean, domain-specific
 * interface for scheduling recall points in Contextual Clarity. It handles:
 *
 * 1. Converting between our domain types (FSRSState) and ts-fsrs types (Card)
 * 2. Creating initial states for new recall points
 * 3. Scheduling reviews based on user ratings
 * 4. Checking if recall points are due for review
 *
 * The FSRS (Free Spaced Repetition Scheduler) algorithm is a modern spaced
 * repetition algorithm that uses a memory model to predict optimal review times.
 * It considers factors like difficulty, stability, and past performance to
 * minimize forgetting while reducing unnecessary reviews.
 *
 * @see https://github.com/open-spaced-repetition/ts-fsrs for algorithm details
 */

import {
  FSRS,
  createEmptyCard,
  generatorParameters,
  type Card,
} from 'ts-fsrs';
import type { FSRSState } from '../models';
import { toFSRSRating, toFSRSState, fromFSRSState, type RecallRating } from './types';

/**
 * Configuration options for the FSRSScheduler.
 *
 * These parameters tune the FSRS algorithm behavior for the application's needs.
 */
export interface FSRSSchedulerConfig {
  /**
   * Maximum interval between reviews in days.
   * Caps how far into the future a review can be scheduled.
   * Default: 365 days (1 year)
   */
  maximumInterval: number;

  /**
   * Target retention rate (0-1).
   * Higher values mean more frequent reviews but better retention.
   * Default: 0.9 (90% target recall probability)
   */
  requestRetention: number;
}

/**
 * Default scheduler configuration values.
 *
 * These defaults provide a balanced experience for most users:
 * - 365-day maximum interval prevents overly long gaps
 * - 90% retention is the standard FSRS recommendation
 */
const DEFAULT_CONFIG: FSRSSchedulerConfig = {
  maximumInterval: 365,
  requestRetention: 0.9,
};

/**
 * FSRSScheduler provides a domain-specific interface for FSRS scheduling.
 *
 * This class encapsulates all interaction with the ts-fsrs library, providing
 * a clean API that works with our application's domain types. It handles:
 *
 * - Type conversions between FSRSState and ts-fsrs Card
 * - Creation of initial states for new recall points
 * - Scheduling decisions based on user ratings
 * - Due date calculations for review prioritization
 *
 * @example
 * ```typescript
 * const scheduler = new FSRSScheduler();
 *
 * // Create initial state for a new recall point
 * const initialState = scheduler.createInitialState();
 *
 * // After the user reviews and rates their recall
 * const newState = scheduler.schedule(initialState, 'good');
 *
 * // Check if it's time for another review
 * if (scheduler.isDue(newState)) {
 *   // Present the recall point to the user
 * }
 * ```
 */
export class FSRSScheduler {
  /** The underlying ts-fsrs FSRS instance that performs calculations */
  private fsrs: FSRS;

  /** Current configuration for the scheduler */
  private config: FSRSSchedulerConfig;

  /**
   * Creates a new FSRSScheduler with the specified configuration.
   *
   * @param config - Optional partial configuration to override defaults
   */
  constructor(config?: Partial<FSRSSchedulerConfig>) {
    // Merge provided config with defaults
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize the FSRS algorithm with our parameters
    const params = generatorParameters({
      maximum_interval: this.config.maximumInterval,
      request_retention: this.config.requestRetention,
    });
    this.fsrs = new FSRS(params);
  }

  /**
   * Converts our application's FSRSState to a ts-fsrs Card.
   *
   * The ts-fsrs library uses a Card type with slightly different field names
   * and some additional fields we don't persist. This method creates a Card
   * that the library can work with from our stored FSRSState.
   *
   * @param state - Our application's FSRSState
   * @returns A ts-fsrs Card ready for scheduling operations
   */
  private toCard(state: FSRSState): Card {
    return {
      due: state.due,
      stability: state.stability,
      difficulty: state.difficulty,
      // elapsed_days is calculated from last_review during scheduling;
      // we use 0 as a placeholder since ts-fsrs recalculates this
      elapsed_days: 0,
      // scheduled_days represents the interval that was scheduled for this review;
      // we use 0 as placeholder since ts-fsrs manages this internally
      scheduled_days: 0,
      reps: state.reps,
      lapses: state.lapses,
      state: toFSRSState(state.state),
      last_review: state.lastReview ?? undefined,
    };
  }

  /**
   * Converts a ts-fsrs Card back to our application's FSRSState.
   *
   * After the FSRS algorithm calculates the next state, this method
   * extracts the relevant fields into our simpler FSRSState format
   * for storage and application use.
   *
   * @param card - The ts-fsrs Card returned from scheduling
   * @returns Our application's FSRSState with updated values
   */
  private fromCard(card: Card): FSRSState {
    return {
      difficulty: card.difficulty,
      stability: card.stability,
      due: card.due,
      lastReview: card.last_review ?? null,
      reps: card.reps,
      lapses: card.lapses,
      state: fromFSRSState(card.state),
    };
  }

  /**
   * Creates the initial FSRS state for a new recall point.
   *
   * This state represents a completely new, never-reviewed item.
   * The due date is set to the current time, meaning new items
   * are immediately available for their first review.
   *
   * Initial values:
   * - difficulty: 0 (will be set on first review based on rating)
   * - stability: 0 (will be initialized on first review)
   * - due: now (immediately due for first review)
   * - lastReview: null (never reviewed)
   * - reps: 0 (no repetitions yet)
   * - lapses: 0 (no failures yet)
   * - state: 'new' (fresh item)
   *
   * @param now - Optional timestamp for the creation time (defaults to current time)
   * @returns Initial FSRSState for a new recall point
   */
  createInitialState(now?: Date): FSRSState {
    const creationTime = now ?? new Date();
    const emptyCard = createEmptyCard(creationTime);
    return this.fromCard(emptyCard);
  }

  /**
   * Schedules the next review for a recall point based on the user's rating.
   *
   * This is the core scheduling function. It takes the current state and the
   * user's rating of their recall attempt, then calculates:
   * - Updated difficulty (adjusts based on how hard/easy the recall was)
   * - Updated stability (memory strength, affected by the rating)
   * - Next due date (when the item should be reviewed again)
   * - Updated reps/lapses counts
   * - New learning state (may transition between states)
   *
   * Rating effects:
   * - 'forgot': Resets to relearning, increases lapses, short interval
   * - 'hard': Slight difficulty increase, moderate interval
   * - 'good': Maintains expected progression, normal interval growth
   * - 'easy': Decreases difficulty, significantly longer interval
   *
   * @param currentState - The recall point's current FSRS state
   * @param rating - The user's rating of their recall attempt
   * @param reviewTime - Optional timestamp for when the review occurred (defaults to now)
   * @returns Updated FSRSState with the next due date and adjusted parameters
   *
   * @example
   * ```typescript
   * // User successfully recalled with some effort
   * const newState = scheduler.schedule(currentState, 'good');
   * // newState.due will be set to a future date based on the algorithm
   *
   * // User completely forgot
   * const forgotState = scheduler.schedule(currentState, 'forgot');
   * // forgotState.due will be very soon, forgotState.lapses will be incremented
   * ```
   */
  schedule(
    currentState: FSRSState,
    rating: RecallRating,
    reviewTime?: Date
  ): FSRSState {
    const now = reviewTime ?? new Date();
    const card = this.toCard(currentState);
    const fsrsRating = toFSRSRating(rating);

    // Use the FSRS next() method to get the scheduling result for this rating
    // This returns both the updated card and a review log (we only need the card)
    const result = this.fsrs.next(card, now, fsrsRating);

    return this.fromCard(result.card);
  }

  /**
   * Checks if a recall point is due for review.
   *
   * A recall point is considered "due" when the current time is at or past
   * its scheduled due date. This is used to determine which items should
   * be presented to the user during a study session.
   *
   * @param state - The recall point's current FSRS state
   * @param asOf - Optional timestamp to check against (defaults to current time)
   * @returns true if the recall point should be reviewed, false otherwise
   *
   * @example
   * ```typescript
   * // Find all due recall points
   * const duePoints = recallPoints.filter(point =>
   *   scheduler.isDue(point.fsrsState)
   * );
   * ```
   */
  isDue(state: FSRSState, asOf?: Date): boolean {
    const checkTime = asOf ?? new Date();
    // Due when the check time is at or after the scheduled due date
    return checkTime >= state.due;
  }

  /**
   * Gets the current scheduler configuration.
   *
   * Useful for displaying settings to users or debugging.
   *
   * @returns The current FSRSSchedulerConfig
   */
  getConfig(): FSRSSchedulerConfig {
    return { ...this.config };
  }

  /**
   * Calculates the retrievability (probability of recall) for a state.
   *
   * Retrievability represents the estimated probability that the user can
   * successfully recall this item at the given time. It decreases over time
   * following the forgetting curve.
   *
   * This can be useful for:
   * - Visualizing memory strength in the UI
   * - Prioritizing items with lower retrievability
   * - Analytics and progress tracking
   *
   * @param state - The recall point's current FSRS state
   * @param asOf - Optional timestamp to calculate retrievability at (defaults to now)
   * @returns A number between 0 and 1 representing recall probability
   *
   * @example
   * ```typescript
   * const retrievability = scheduler.getRetrievability(state);
   * // 0.95 means ~95% chance of successful recall
   * // 0.50 means ~50% chance - time to review!
   * ```
   */
  getRetrievability(state: FSRSState, asOf?: Date): number {
    const checkTime = asOf ?? new Date();
    const card = this.toCard(state);

    // Use ts-fsrs's get_retrievability method which returns a number when format is false
    return this.fsrs.get_retrievability(card, checkTime, false);
  }
}
