/**
 * RecallPoint Domain Types
 *
 * A RecallPoint represents a single piece of knowledge that the user wants to
 * commit to long-term memory through spaced repetition. Unlike traditional
 * flashcards with simple front/back pairings, RecallPoints store:
 *
 * 1. The core content to be recalled (the "what")
 * 2. Surrounding context that aids understanding (the "why" and "how")
 * 3. FSRS scheduling state for optimal review timing
 * 4. Historical recall attempts for progress tracking
 *
 * The FSRS (Free Spaced Repetition Scheduler) algorithm manages review intervals
 * based on the user's demonstrated recall ability, optimizing for long-term
 * retention while minimizing review burden.
 *
 * This module contains only pure TypeScript types with no runtime dependencies,
 * forming the contract between all modules that work with recall points.
 */

/**
 * FSRS learning states representing where a recall point is in the learning process.
 *
 * - 'new': Never reviewed; initial state for all recall points
 * - 'learning': In initial learning phase; short intervals between reviews
 * - 'review': Successfully learned; on graduated interval schedule
 * - 'relearning': Previously known but failed; re-entering learning phase
 */
export type FSRSLearningState = 'new' | 'learning' | 'review' | 'relearning';

/**
 * FSRS (Free Spaced Repetition Scheduler) state for a recall point.
 *
 * This structure contains all the parameters the FSRS algorithm needs to
 * calculate optimal review intervals. The algorithm balances the goal of
 * maximizing retention while minimizing the number of reviews required.
 *
 * The ts-fsrs library uses these values to determine when a recall point
 * should next be reviewed and how to adjust the schedule based on performance.
 *
 * @see https://github.com/open-spaced-repetition/ts-fsrs for algorithm details
 */
export interface FSRSState {
  /**
   * Intrinsic difficulty of the recall point (0-10 scale, higher = harder).
   * Initialized based on the FSRS algorithm's default and adjusted based on
   * user performance. Harder items receive more frequent reviews.
   */
  difficulty: number;

  /**
   * Memory stability - the time (in days) for the recall probability to
   * decrease from 100% to 90%. Higher stability means longer intervals
   * can be used between reviews without forgetting.
   */
  stability: number;

  /**
   * The calculated date when this recall point should next be reviewed.
   * Set by the FSRS algorithm after each review based on the rating given.
   */
  due: Date;

  /**
   * Timestamp of the most recent review, or null if never reviewed.
   * Used to calculate elapsed time for scheduling decisions.
   */
  lastReview: Date | null;

  /**
   * Total number of successful repetitions (reviews with passing grade).
   * Tracks how many times the user has successfully recalled this point.
   */
  reps: number;

  /**
   * Number of times the user "lapsed" - failed to recall after previously
   * knowing the material. High lapse counts indicate items that are
   * difficult to retain long-term.
   */
  lapses: number;

  /**
   * Current learning state of the recall point.
   * Determines which FSRS scheduling rules apply.
   */
  state: FSRSLearningState;
}

/**
 * Records a single attempt to recall a point during a session.
 *
 * RecallAttempts form the historical record of how the user has performed
 * on each recall point over time. This data enables:
 * - Progress visualization and analytics
 * - Identification of persistently difficult material
 * - Insights into optimal study patterns
 */
export interface RecallAttempt {
  /**
   * When the recall attempt occurred.
   */
  timestamp: Date;

  /**
   * Whether the user successfully recalled the material.
   * True indicates correct/passing recall; false indicates failure.
   */
  success: boolean;

  /**
   * How long (in milliseconds) the user took to respond.
   * Can be used to identify items that require more processing time,
   * potentially indicating weaker encoding even if eventually correct.
   */
  latencyMs: number;
}

/**
 * RecallPoint represents a single piece of knowledge to be memorized.
 *
 * Each RecallPoint belongs to exactly one RecallSet and contains the content
 * to be recalled along with its FSRS scheduling state and review history.
 *
 * Unlike traditional flashcards, the `context` field provides additional
 * information that helps during Socratic dialogue discussions but isn't
 * expected to be recalled verbatim.
 *
 * @example
 * ```typescript
 * const recallPoint: RecallPoint = {
 *   id: 'rp_xyz789',
 *   recallSetId: 'rs_abc123',
 *   content: 'The Treaty of Versailles was signed on June 28, 1919',
 *   context: 'Ended WWI. Germany forced to accept responsibility. Led to economic hardship and contributed to WWII.',
 *   fsrsState: {
 *     difficulty: 5.0,
 *     stability: 2.5,
 *     due: new Date('2024-01-20'),
 *     lastReview: new Date('2024-01-17'),
 *     reps: 3,
 *     lapses: 0,
 *     state: 'review',
 *   },
 *   recallHistory: [
 *     { timestamp: new Date('2024-01-15'), success: true, latencyMs: 3500 },
 *     { timestamp: new Date('2024-01-16'), success: true, latencyMs: 2800 },
 *     { timestamp: new Date('2024-01-17'), success: true, latencyMs: 2100 },
 *   ],
 *   createdAt: new Date('2024-01-14'),
 *   updatedAt: new Date('2024-01-17'),
 * };
 * ```
 */
export interface RecallPoint {
  /**
   * Unique identifier for the recall point.
   * Format: typically a prefixed UUID (e.g., 'rp_xyz789')
   */
  id: string;

  /**
   * ID of the RecallSet this point belongs to.
   * Establishes the parent-child relationship for organization.
   */
  recallSetId: string;

  /**
   * The core knowledge to be recalled.
   * This is the primary content the user is trying to memorize.
   * Should be specific, verifiable, and meaningful on its own.
   */
  content: string;

  /**
   * Additional context that supports understanding.
   * Used during Socratic dialogues to guide discussion but not expected
   * to be recalled verbatim. Provides the "why" behind the content.
   */
  context: string;

  /**
   * Current FSRS scheduling state.
   * Updated after each review to determine optimal next review time.
   */
  fsrsState: FSRSState;

  /**
   * Chronological history of all recall attempts.
   * Used for analytics, progress tracking, and identifying patterns.
   */
  recallHistory: RecallAttempt[];

  /**
   * Timestamp when the recall point was created.
   */
  createdAt: Date;

  /**
   * Timestamp of the last modification.
   * Updated when content, context, or FSRS state changes.
   */
  updatedAt: Date;
}
