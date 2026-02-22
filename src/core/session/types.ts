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
import type { RecallPoint, RecallSet, Session } from '../models';
import type {
  RecallPointRepository,
  SessionRepository,
  SessionMessageRepository,
  RecallSetRepository,
  SessionMetricsRepository,
  RecallOutcomeRepository,
  RabbitholeEventRepository,
} from '../../storage/repositories';
import type { SessionMetricsCollector } from './metrics-collector';
import type { RabbitholeDetector } from '../analysis/rabbithole-detector';

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
  | 'session_started'          // Session initialized with target recall points
  | 'point_started'            // Started discussing a new recall point
  | 'point_recalled'           // A specific recall point was marked as recalled
  | 'user_message'             // User sent a message
  | 'assistant_message'        // AI tutor responded
  | 'point_evaluated'          // Recall evaluation completed for current point
  | 'point_completed'          // FSRS state updated, moving to next point
  | 'session_completed'        // All target points reviewed (session finalized)
  | 'session_complete_overlay' // T08: All points recalled — show completion overlay (before finalizing)
  | 'session_paused'           // T08: Session paused via Leave Session
  | 'rabbithole_detected'      // T09: A tangent was detected — user must opt in
  | 'rabbithole_entered'       // T09: User opted into a rabbit hole
  | 'rabbithole_exited';       // T09: User exited a rabbit hole

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
  tutorTemperature: 0.7,
  tutorMaxTokens: 512,
};

/**
 * Dependencies required by SessionEngine.
 *
 * Using dependency injection makes the engine testable and
 * allows swapping implementations (e.g., mock LLM for testing).
 *
 * Phase 2 additions include optional metrics-related dependencies.
 * If metrics components are not provided, metrics collection is disabled.
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
 *   // Phase 2: Metrics collection (optional)
 *   metricsCollector: new SessionMetricsCollector(),
 *   rabbitholeDetector: new RabbitholeDetector(llmClient),
 *   metricsRepo: new SessionMetricsRepository(db),
 *   recallOutcomeRepo: new RecallOutcomeRepository(db),
 *   rabbitholeRepo: new RabbitholeEventRepository(db),
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

  // === Phase 2: Metrics Collection Dependencies (Optional) ===
  // These enable comprehensive session metrics tracking when provided.
  // If omitted, the engine operates without metrics collection.

  /**
   * Collector for aggregating session metrics during conversations.
   * When provided, enables tracking of message timing, token usage,
   * recall outcomes, and engagement scoring.
   * @since Phase 2
   */
  metricsCollector?: SessionMetricsCollector;

  /**
   * Detector for identifying conversational tangents (rabbitholes).
   * When provided, enables real-time detection and tracking of when
   * conversations drift from the main recall topic.
   * @since Phase 2
   */
  rabbitholeDetector?: RabbitholeDetector;

  /**
   * Repository for persisting session-level metrics.
   * Required if metricsCollector is provided.
   * @since Phase 2
   */
  metricsRepo?: SessionMetricsRepository;

  /**
   * Repository for persisting individual recall outcomes.
   * Required if metricsCollector is provided.
   * @since Phase 2
   */
  recallOutcomeRepo?: RecallOutcomeRepository;

  /**
   * Repository for persisting rabbithole events.
   * Required if rabbitholeDetector is provided.
   * @since Phase 2
   */
  rabbitholeRepo?: RabbitholeEventRepository;
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

  /** Number of recall points that have been recalled so far */
  recalledCount: number;

  /** Total number of recall points in the session */
  totalPoints: number;

  /** List of point IDs recalled in this turn by the continuous evaluator */
  pointsRecalledThisTurn: string[];
}

/**
 * Represents the current state of a session for UI display and external consumers.
 * Returned by SessionEngine.getSessionState().
 */
export interface SessionState {
  /** The currently active session */
  session: Session;
  /** The RecallSet being studied */
  recallSet: RecallSet;
  /** Checklist of all points and their recall status, keyed by point ID */
  pointChecklist: Record<string, 'pending' | 'recalled'>;
  /** Index into targetPoints[] for the next point the tutor should probe */
  currentProbeIndex: number;
  /** The next point the tutor should probe, or null if all recalled */
  currentProbePoint: RecallPoint | null;
  /** Total number of recall points in this session */
  totalPoints: number;
  /** Number of points recalled so far */
  recalledCount: number;
  /** Points that have NOT been recalled yet, in original order */
  uncheckedPoints: RecallPoint[];
  /** Number of messages in the session so far */
  messageCount: number;
  /** Whether all points have been recalled */
  isComplete: boolean;
}

