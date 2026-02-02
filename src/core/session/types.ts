/**
 * Session Engine Types
 *
 * This module defines the types used by the SessionEngine for managing
 * recall session state and events. These types support:
 *
 * 1. **Event tracking**: SessionEvent allows monitoring session flow for
 *    debugging, analytics, and UI updates.
 *
 * 2. **Configuration**: SessionEngineConfig enables customization of
 *    session behavior like message limits and evaluation timing.
 *
 * 3. **Dependencies**: SessionEngineDependencies defines the injectable
 *    services required by the SessionEngine.
 */

import type { AnthropicClient } from '../../llm/client';
import type { FSRSScheduler } from '../fsrs/scheduler';
import type { RecallEvaluator } from '../scoring/recall-evaluator';
import type {
  RecallPointRepository,
  SessionRepository,
  SessionMessageRepository,
  RecallSetRepository,
} from '../../storage/repositories';

/**
 * Types of events that can occur during a session.
 *
 * These events trace the lifecycle of a session from start to finish,
 * including point-level progression and message exchanges.
 *
 * Event flow for a typical session:
 * 1. session_started - Session initialized with target points
 * 2. point_started - Begin discussing first recall point
 * 3. assistant_message - AI asks initial question
 * 4. user_message - User responds
 * 5. assistant_message - AI follows up
 * 6. ... (conversation continues)
 * 7. point_evaluated - User's recall is assessed
 * 8. point_completed - FSRS state updated, ready for next point
 * 9. point_started - Begin next point (if any)
 * 10. ... (repeat for each point)
 * 11. session_completed - All points reviewed
 */
export type SessionEventType =
  | 'session_started'      // Session initialized with target recall points
  | 'point_started'        // Started discussing a new recall point
  | 'user_message'         // User sent a message
  | 'assistant_message'    // AI tutor responded
  | 'point_evaluated'      // Recall evaluation completed for current point
  | 'point_completed'      // FSRS state updated, moving to next point
  | 'session_completed';   // All target points reviewed

/**
 * Represents an event that occurred during a session.
 *
 * Events provide visibility into session flow for:
 * - Debugging and logging
 * - Analytics and learning insights
 * - UI updates and progress indicators
 * - Integration with external systems
 *
 * @example
 * ```typescript
 * const event: SessionEvent = {
 *   type: 'point_evaluated',
 *   data: {
 *     pointId: 'rp_xyz789',
 *     success: true,
 *     confidence: 0.85,
 *     rating: 'good',
 *   },
 *   timestamp: new Date(),
 * };
 * ```
 */
export interface SessionEvent {
  /** The type of event that occurred */
  type: SessionEventType;

  /**
   * Event-specific data payload.
   * The shape depends on the event type - see individual event handlers
   * for documentation of expected data structures.
   */
  data: unknown;

  /** When the event occurred */
  timestamp: Date;
}

/**
 * Configuration options for the SessionEngine.
 *
 * These settings control session behavior and can be adjusted to
 * optimize the learning experience for different use cases.
 */
export interface SessionEngineConfig {
  /**
   * Maximum number of message exchanges per recall point.
   * After this limit, evaluation is triggered automatically.
   * Prevents excessively long discussions that might indicate
   * the point needs to be broken down or clarified.
   *
   * Default: 10 messages
   */
  maxMessagesPerPoint: number;

  /**
   * Number of message exchanges after which to auto-evaluate.
   * This triggers periodic evaluation checks to identify when
   * the user has demonstrated recall, even if they don't
   * explicitly indicate completion.
   *
   * Default: 6 messages
   */
  autoEvaluateAfter: number;

  /**
   * Temperature setting for the LLM during tutoring conversations.
   * Higher values (0.7-0.9) encourage more creative, varied responses.
   * Lower values (0.3-0.5) produce more consistent, focused responses.
   *
   * Default: 0.7
   */
  tutorTemperature: number;

  /**
   * Maximum tokens for tutor responses.
   * Controls response length - shorter responses feel more
   * conversational, longer responses provide more guidance.
   *
   * Default: 512
   */
  tutorMaxTokens: number;
}

/**
 * Default configuration for SessionEngine.
 *
 * These defaults are tuned for a balanced learning experience
 * that encourages active recall while preventing frustration.
 */
export const DEFAULT_SESSION_CONFIG: SessionEngineConfig = {
  maxMessagesPerPoint: 10,
  autoEvaluateAfter: 6,
  tutorTemperature: 0.7,
  tutorMaxTokens: 512,
};

/**
 * Dependencies required by SessionEngine.
 *
 * Using dependency injection makes the engine testable and
 * allows swapping implementations (e.g., mock LLM for testing).
 *
 * @example
 * ```typescript
 * const deps: SessionEngineDependencies = {
 *   scheduler: new FSRSScheduler(),
 *   evaluator: new RecallEvaluator(llmClient),
 *   llmClient: new AnthropicClient(),
 *   recallSetRepo: new RecallSetRepository(db),
 *   recallPointRepo: new RecallPointRepository(db),
 *   sessionRepo: new SessionRepository(db),
 *   messageRepo: new SessionMessageRepository(db),
 * };
 *
 * const engine = new SessionEngine(deps);
 * ```
 */
export interface SessionEngineDependencies {
  /** FSRS scheduler for calculating review intervals */
  scheduler: FSRSScheduler;

  /** Evaluator for assessing recall success from conversations */
  evaluator: RecallEvaluator;

  /** LLM client for generating tutor responses */
  llmClient: AnthropicClient;

  /** Repository for RecallSet data access */
  recallSetRepo: RecallSetRepository;

  /** Repository for RecallPoint data access */
  recallPointRepo: RecallPointRepository;

  /** Repository for Session data access */
  sessionRepo: SessionRepository;

  /** Repository for SessionMessage data access */
  messageRepo: SessionMessageRepository;
}

/**
 * Result returned when processing a user message.
 *
 * This interface provides the information needed to:
 * - Display the AI's response to the user
 * - Track session progress
 * - Handle session completion
 */
export interface ProcessMessageResult {
  /** The AI tutor's response to display */
  response: string;

  /** Whether the session has completed (all points reviewed) */
  completed: boolean;

  /** Whether the current point was just evaluated and advanced */
  pointAdvanced: boolean;

  /** The current recall point index (0-based) */
  currentPointIndex: number;

  /** Total number of recall points in the session */
  totalPoints: number;
}

/**
 * Phrases that might indicate the user is ready to move on.
 *
 * These are checked (case-insensitive) to trigger evaluation.
 * The evaluation may still determine the user hasn't fully
 * demonstrated recall, in which case discussion continues.
 */
export const EVALUATION_TRIGGER_PHRASES = [
  'i think i understand',
  'i understand',
  'got it',
  'i get it',
  'makes sense',
  'that makes sense',
  'next topic',
  'next point',
  'move on',
  "let's move on",
  'next',
  'i remember',
  'i recall',
  'oh right',
  'oh yeah',
  'of course',
];
