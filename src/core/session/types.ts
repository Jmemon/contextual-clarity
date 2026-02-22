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
 * Complete catalog of session engine events.
 *
 * These events are emitted by SessionEngine and consumed by:
 * 1. WebSocketSessionHandler — translates to ServerMessage and sends to client
 * 2. MetricsCollector — records event timing and outcomes
 * 3. Any future event listeners (analytics, logging)
 *
 * Event categories:
 * - Session lifecycle: start, pause, complete overlay, complete
 * - Recall point: recalled, near miss
 * - Rabbit hole: detected, entered, exited, declined
 * - Resources: show image, show resource
 * - Messages: user, assistant, streaming start/end
 *
 * IMPORTANT: This is the SINGLE SOURCE OF TRUTH for all session events.
 * If you add a new event type, you must also:
 * 1. Add a corresponding entry in SessionEventData (below)
 * 2. Add a corresponding ServerMessage payload in src/api/ws/types.ts
 * 3. Handle it in src/api/ws/session-handler.ts
 * 4. Handle it in web/src/hooks/use-session-websocket.ts
 * 5. Render it in the appropriate frontend component
 *
 * REMOVED (T13): point_started, point_evaluated, point_completed
 * - point_started: replaced by checklist model from T01
 * - point_evaluated: replaced by point_recalled / near-miss feedback
 * - point_completed: replaced by point_recalled + FSRS in markPointRecalled()
 */
export type SessionEventType =
  // === Session Lifecycle ===
  | 'session_started'           // Session initialized, opening message generated
  | 'session_paused'            // Session paused by user (Leave Session from T08)
  | 'session_complete_overlay'  // All points recalled — show completion overlay (T08)
  | 'session_completed'         // Session fully ended (user exited after completion or left)

  // === Recall Point Events ===
  | 'point_recalled'            // A specific recall point was marked as recalled (T01 — keep existing name)

  // === Rabbit Hole Events ===
  | 'rabbithole_detected'       // Tangent detected, prompt user to explore (T09)
  | 'rabbithole_entered'        // User accepted, entering rabbit hole mode (T09)
  | 'rabbithole_exited'         // User returned to main session (T09)
  | 'rabbithole_declined'       // User declined to explore the tangent (T09)

  // === Message Events ===
  | 'user_message'              // User sent a message
  | 'assistant_message';        // Agent response complete (full text)

/**
 * Summary of a completed session. Used in the session_completed event
 * and the session_complete WS payload.
 *
 * Field naming convention: uses server-side names (totalPointsReviewed,
 * successfulRecalls) consistently across backend AND frontend.
 */
export interface SessionCompletionSummary {
  sessionId: string;
  /** Total number of recall points that were reviewed in this session */
  totalPointsReviewed: number;
  /** Number of successfully recalled points */
  successfulRecalls: number;
  /** Recall success rate (0.0 to 1.0) */
  recallRate: number;
  /** Total session duration in milliseconds */
  durationMs: number;
  /** Number of rabbit holes entered during the session */
  rabbitholeCount: number;
  /** IDs of all recall points that were successfully recalled */
  recalledPointIds: string[];
  /** Engagement score (0-100) */
  engagementScore: number;
  /** Estimated API cost in USD */
  estimatedCostUsd: number;
}

/**
 * Typed event data payloads for each SessionEventType.
 * Using a discriminated union on `type` ensures type safety at every handler.
 *
 * Each variant corresponds exactly to one SessionEventType value.
 * When adding a new event type, add a corresponding variant here.
 */
export type SessionEventData =
  | { type: 'session_started'; sessionId: string; recallSetId: string; targetPointCount: number; resumed?: boolean; existingMessageCount?: number }
  | { type: 'session_paused'; sessionId: string; recalledCount: number; totalPoints: number }
  | { type: 'session_complete_overlay'; sessionId: string; recalledCount: number; totalPoints: number; message: string; canContinue: boolean }
  | { type: 'session_completed'; sessionId: string; summary: SessionCompletionSummary }
  | { type: 'point_recalled'; pointId: string; recalledCount: number; totalPoints: number }
  | { type: 'rabbithole_detected'; topic: string; rabbitholeEventId: string }
  | { type: 'rabbithole_entered'; topic: string }
  | { type: 'rabbithole_exited'; label: string; pointsRecalledDuring: number; completionPending: boolean }
  | { type: 'rabbithole_declined'; topic?: string }
  | { type: 'user_message'; content: string }
  | { type: 'assistant_message'; content: string; isOpening?: boolean };

/**
 * A session event with typed payload.
 * Replaces the previous definition that used `data: unknown`.
 */
export interface SessionEvent {
  /** The type of event that occurred */
  type: SessionEventType;

  /**
   * Typed event-specific data payload.
   * The shape is determined by `type` via the SessionEventData discriminated union.
   */
  data: SessionEventData;

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

