/**
 * FSRS Type Definitions and Conversions
 *
 * This module defines the application-level rating types used throughout
 * Contextual Clarity and provides mappings to/from the ts-fsrs library types.
 *
 * The RecallRating type uses human-readable string literals that are more
 * meaningful in the application domain than the numeric Rating enum from ts-fsrs.
 *
 * @see https://github.com/open-spaced-repetition/ts-fsrs for algorithm details
 */

import { Rating, State, type Grade } from 'ts-fsrs';
import type { FSRSLearningState } from '../models';

/**
 * User-facing rating for a recall attempt.
 *
 * These ratings map to the FSRS algorithm's grade scale:
 * - 'forgot': Complete failure to recall (FSRS Rating.Again)
 * - 'hard': Recalled with significant difficulty (FSRS Rating.Hard)
 * - 'good': Recalled successfully with some effort (FSRS Rating.Good)
 * - 'easy': Recalled effortlessly (FSRS Rating.Easy)
 *
 * The FSRS algorithm uses these ratings to adjust the memory model:
 * - 'forgot' and 'hard' decrease stability and shorten the next interval
 * - 'good' maintains the expected learning curve
 * - 'easy' increases stability and lengthens the next interval significantly
 */
export type RecallRating = 'forgot' | 'hard' | 'good' | 'easy';

/**
 * Maps application RecallRating to ts-fsrs Grade type.
 *
 * This conversion allows the application to use intuitive string ratings
 * while the FSRS algorithm receives the numeric values it expects.
 *
 * Note: The Grade type in ts-fsrs excludes Rating.Manual, which is not
 * a user-selectable option. Our RecallRating type maps directly to the
 * four valid grades: Again, Hard, Good, and Easy.
 *
 * @param rating - The user's recall rating
 * @returns The corresponding ts-fsrs Grade value (excludes Manual)
 */
export function toFSRSRating(rating: RecallRating): Grade {
  const ratingMap: Record<RecallRating, Grade> = {
    forgot: Rating.Again,
    hard: Rating.Hard,
    good: Rating.Good,
    easy: Rating.Easy,
  };
  return ratingMap[rating];
}

/**
 * Maps ts-fsrs Rating enum to application RecallRating.
 *
 * Used when converting review logs or other FSRS data back to application types.
 * Note: Rating.Manual is not used in this application and will throw an error.
 *
 * @param rating - The ts-fsrs Rating value
 * @returns The corresponding RecallRating string
 * @throws Error if Rating.Manual is provided (not supported in this application)
 */
export function fromFSRSRating(rating: Rating): RecallRating {
  const ratingMap: Record<Rating, RecallRating | null> = {
    [Rating.Manual]: null, // Manual ratings are not used in this application
    [Rating.Again]: 'forgot',
    [Rating.Hard]: 'hard',
    [Rating.Good]: 'good',
    [Rating.Easy]: 'easy',
  };
  const result = ratingMap[rating];
  if (result === null) {
    throw new Error(
      `Rating.Manual is not supported in Contextual Clarity. Received rating: ${rating}`
    );
  }
  return result;
}

/**
 * Maps application FSRSLearningState to ts-fsrs State enum.
 *
 * Our application uses lowercase string literals for readability in JSON storage,
 * while ts-fsrs uses a numeric enum internally.
 *
 * @param state - The application's learning state string
 * @returns The corresponding ts-fsrs State value
 */
export function toFSRSState(state: FSRSLearningState): State {
  const stateMap: Record<FSRSLearningState, State> = {
    new: State.New,
    learning: State.Learning,
    review: State.Review,
    relearning: State.Relearning,
  };
  return stateMap[state];
}

/**
 * Maps ts-fsrs State enum to application FSRSLearningState.
 *
 * Converts the numeric enum values back to human-readable strings
 * for storage and display purposes.
 *
 * @param state - The ts-fsrs State value
 * @returns The corresponding FSRSLearningState string
 */
export function fromFSRSState(state: State): FSRSLearningState {
  const stateMap: Record<State, FSRSLearningState> = {
    [State.New]: 'new',
    [State.Learning]: 'learning',
    [State.Review]: 'review',
    [State.Relearning]: 'relearning',
  };
  return stateMap[state];
}
