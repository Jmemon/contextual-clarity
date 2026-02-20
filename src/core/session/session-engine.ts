/**
 * Session Engine - Core Orchestrator for Recall Sessions
 *
 * The SessionEngine manages the complete lifecycle of a recall study session:
 *
 * 1. **Session Initialization**: Loads due recall points, creates session record,
 *    sets up LLM with appropriate prompts.
 *
 * 2. **Conversation Management**: Tracks messages, maintains context, coordinates
 *    between user input and AI tutor responses.
 *
 * 3. **Recall Evaluation**: Continuously evaluates all unchecked recall points after
 *    every user message using LLM-powered evaluation.
 *
 * 4. **Progress Tracking**: Advances through recall points, updates FSRS scheduling
 *    state based on evaluation results.
 *
 * 5. **Session Completion**: Handles graceful completion when all points are reviewed
 *    or session is abandoned.
 *
 * Session Flow:
 * ```
 * startSession() -> getOpeningMessage() -> [processUserMessage() loop] -> completion
 *                                               |
 *                                               v
 *                                    [continuous evaluation of all unchecked points]
 *                                               |
 *                                               v
 *                                    [mark recalled points, inject feedback, or complete]
 * ```
 *
 * @example
 * ```typescript
 * const engine = new SessionEngine(dependencies);
 *
 * // Start a new session
 * const session = await engine.startSession(recallSet);
 *
 * // Get the opening message from the tutor
 * const opening = await engine.getOpeningMessage();
 * console.log('Tutor:', opening);
 *
 * // Process user messages in a loop
 * while (true) {
 *   const userInput = await getUserInput();
 *   const result = await engine.processUserMessage(userInput);
 *   console.log('Tutor:', result.response);
 *
 *   if (result.completed) {
 *     console.log('Session complete!');
 *     break;
 *   }
 * }
 * ```
 */

import type {
  RecallSet,
  RecallPoint,
  Session,
  SessionMessage,
} from '../models';
import type { RecallEvaluation } from '../scoring/types';
import type { RecallRating } from '../fsrs/types';
import type { LLMMessage } from '../../llm/types';
import { buildSocraticTutorPrompt } from '../../llm/prompts';
import {
  type SessionEngineDependencies,
  type SessionEngineConfig,
  type ProcessMessageResult,
  type SessionEvent,
  type SessionState,
  DEFAULT_SESSION_CONFIG,
} from './types';
import type { SessionMetricsCollector } from './metrics-collector';
import type { RabbitholeDetector } from '../analysis/rabbithole-detector';
import type {
  SessionMetricsRepository,
  RecallOutcomeRepository,
  RabbitholeEventRepository,
} from '../../storage/repositories';

/**
 * Generates a unique ID with a prefix.
 * Uses crypto.randomUUID() for uniqueness.
 *
 * @param prefix - The prefix for the ID (e.g., 'sess', 'msg')
 * @returns A unique ID string like 'sess_abc123...'
 */
function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

/**
 * SessionEngine orchestrates recall study sessions.
 *
 * This class is the central coordinator for the Contextual Clarity learning
 * experience. It brings together:
 * - FSRS scheduling for optimal review timing
 * - LLM-powered Socratic tutoring for guided recall
 * - Evaluation for assessing recall success
 * - Persistence for session history and progress
 *
 * The engine maintains stateful session context between calls, allowing
 * for natural conversational flow across multiple user interactions.
 */
export class SessionEngine {
  // === Dependencies (injected) ===

  /** FSRS scheduler for calculating review intervals based on performance */
  private scheduler: SessionEngineDependencies['scheduler'];

  /** LLM-powered evaluator for assessing recall from conversation */
  private evaluator: SessionEngineDependencies['evaluator'];

  /** Anthropic client for generating tutor responses */
  private llmClient: SessionEngineDependencies['llmClient'];

  /**
   * Repository for RecallSet data access.
   * Currently not used but available for future features like
   * updating recall set statistics after sessions.
   */
  // @ts-expect-error - Intentionally unused, kept for future features
  private recallSetRepo: SessionEngineDependencies['recallSetRepo'];

  /** Repository for RecallPoint data access */
  private recallPointRepo: SessionEngineDependencies['recallPointRepo'];

  /** Repository for Session data access */
  private sessionRepo: SessionEngineDependencies['sessionRepo'];

  /** Repository for SessionMessage data access */
  private messageRepo: SessionEngineDependencies['messageRepo'];

  // === Phase 2: Metrics Collection Dependencies (Optional) ===
  // These enable comprehensive session metrics tracking when provided.

  /**
   * Collector for aggregating session metrics during conversations.
   * When provided, enables tracking of message timing, token usage,
   * recall outcomes, and engagement scoring.
   */
  private metricsCollector: SessionMetricsCollector | null = null;

  /**
   * Detector for identifying conversational tangents (rabbitholes).
   * When provided, enables real-time detection of topic drift.
   */
  private rabbitholeDetector: RabbitholeDetector | null = null;

  /** Repository for persisting session-level metrics */
  private metricsRepo: SessionMetricsRepository | null = null;

  /** Repository for persisting individual recall outcomes */
  private recallOutcomeRepo: RecallOutcomeRepository | null = null;

  /** Repository for persisting rabbithole events */
  private rabbitholeRepo: RabbitholeEventRepository | null = null;

  // === Configuration ===

  /** Engine configuration settings */
  private config: SessionEngineConfig;

  // === Session State ===

  /** The currently active session, or null if no session is active */
  private currentSession: Session | null = null;

  /** The RecallSet being studied in the current session */
  private currentRecallSet: RecallSet | null = null;

  /** Recall points targeted for review in this session */
  private targetPoints: RecallPoint[] = [];

  // Tracks whether each recall point has been recalled during this session.
  // Keyed by recall point ID. Values: 'pending' = not yet recalled, 'recalled' = demonstrated by user.
  private pointChecklist: Map<string, 'pending' | 'recalled'> = new Map();

  // Index into targetPoints[] for the next point the tutor should probe.
  // This is a suggestion, not a constraint — the evaluator (T06) can mark any point as recalled at any time.
  private currentProbeIndex: number = 0;

  /** Messages in the current session, loaded from DB and kept in sync */
  private messages: SessionMessage[] = [];

  /** Optional event listener for session events */
  private eventListener?: (event: SessionEvent) => void;

  // === Phase 2: Metrics Tracking State ===

  /**
   * Tracks the starting message index for the current recall point.
   * Used to determine the message range when recording recall outcomes.
   */
  private currentPointStartIndex: number = 0;

  /**
   * Flag indicating whether metrics collection is enabled for this session.
   * True when metricsCollector is provided in dependencies.
   */
  private metricsEnabled: boolean = false;

  /**
   * The LLM model being used for this session.
   * Tracked for metrics cost calculation.
   */
  private currentModel: string = 'claude-3-5-sonnet-20241022';

  /**
   * Creates a new SessionEngine instance.
   *
   * @param deps - Injectable dependencies (repositories, services, etc.)
   * @param config - Optional configuration to override defaults
   *
   * @example
   * ```typescript
   * const engine = new SessionEngine({
   *   scheduler: new FSRSScheduler(),
   *   evaluator: new RecallEvaluator(llmClient),
   *   llmClient: new AnthropicClient(),
   *   recallSetRepo: new RecallSetRepository(db),
   *   recallPointRepo: new RecallPointRepository(db),
   *   sessionRepo: new SessionRepository(db),
   *   messageRepo: new SessionMessageRepository(db),
   * });
   * ```
   */
  constructor(
    deps: SessionEngineDependencies,
    config?: Partial<SessionEngineConfig>
  ) {
    // Assign core dependencies
    this.scheduler = deps.scheduler;
    this.evaluator = deps.evaluator;
    this.llmClient = deps.llmClient;
    this.recallSetRepo = deps.recallSetRepo;
    this.recallPointRepo = deps.recallPointRepo;
    this.sessionRepo = deps.sessionRepo;
    this.messageRepo = deps.messageRepo;

    // === Phase 2: Initialize metrics collection dependencies ===
    // These are optional - if not provided, metrics collection is disabled
    if (deps.metricsCollector) {
      this.metricsCollector = deps.metricsCollector;
      this.metricsEnabled = true;
    }
    if (deps.rabbitholeDetector) {
      this.rabbitholeDetector = deps.rabbitholeDetector;
    }
    if (deps.metricsRepo) {
      this.metricsRepo = deps.metricsRepo;
    }
    if (deps.recallOutcomeRepo) {
      this.recallOutcomeRepo = deps.recallOutcomeRepo;
    }
    if (deps.rabbitholeRepo) {
      this.rabbitholeRepo = deps.rabbitholeRepo;
    }

    // Merge provided config with defaults
    this.config = { ...DEFAULT_SESSION_CONFIG, ...config };
  }

  /**
   * Sets an event listener to receive session events.
   *
   * Only one listener is supported at a time. Setting a new listener
   * replaces the previous one. Pass undefined to remove the listener.
   *
   * @param listener - Function to call when events occur, or undefined to remove
   *
   * @example
   * ```typescript
   * engine.setEventListener((event) => {
   *   console.log(`[${event.type}]`, event.data);
   * });
   * ```
   */
  setEventListener(listener: ((event: SessionEvent) => void) | undefined): void {
    this.eventListener = listener;
  }

  /**
   * Emits an event to the registered listener (if any).
   *
   * @param type - The type of event
   * @param data - Event-specific data payload
   */
  private emitEvent(type: SessionEvent['type'], data: unknown): void {
    if (this.eventListener) {
      this.eventListener({
        type,
        data,
        timestamp: new Date(),
      });
    }
  }

  /**
   * Starts a new recall session for a RecallSet.
   *
   * This method:
   * 1. Checks for existing in-progress sessions (resumes if found)
   * 2. Finds all recall points due for review in the set
   * 3. Creates a new session record in the database
   * 4. Initializes the engine state for the session
   *
   * If there are no due points, an error is thrown - the caller should
   * check for due points before starting a session.
   *
   * @param recallSet - The RecallSet to study
   * @returns The created (or resumed) Session
   * @throws Error if no recall points are due for review
   *
   * @example
   * ```typescript
   * const duePoints = await recallPointRepo.findDuePoints(recallSet.id);
   * if (duePoints.length > 0) {
   *   const session = await engine.startSession(recallSet);
   *   console.log(`Starting session with ${session.targetRecallPointIds.length} points`);
   * }
   * ```
   */
  async startSession(recallSet: RecallSet): Promise<Session> {
    // Check for existing in-progress session to resume
    const existingSession = await this.sessionRepo.findInProgress(recallSet.id);
    if (existingSession) {
      // Resume the existing session instead of creating a new one
      return this.resumeSession(existingSession, recallSet);
    }

    // Find all recall points due for review in this set
    const duePoints = await this.recallPointRepo.findDuePoints(recallSet.id);

    // Validate that there are points to review
    if (duePoints.length === 0) {
      throw new Error(
        `No recall points are due for review in RecallSet '${recallSet.name}'. ` +
        'Check due dates before starting a session.'
      );
    }

    // Create the session record in the database
    const session = await this.sessionRepo.create({
      id: generateId('sess'),
      recallSetId: recallSet.id,
      targetRecallPointIds: duePoints.map((p) => p.id),
    });

    // Initialize engine state for the new session
    this.currentSession = session;
    this.currentRecallSet = recallSet;
    this.targetPoints = duePoints;
    this.pointChecklist = new Map(
      this.targetPoints.map(p => [p.id, 'pending'])
    );
    this.currentProbeIndex = 0;
    this.messages = [];
    this.currentPointStartIndex = 0;

    // === Phase 2: Initialize metrics collection for the new session ===
    // Start tracking session metrics if the collector is available
    if (this.metricsCollector) {
      this.metricsCollector.startSession(session.id, this.currentModel);
    }

    // Reset rabbithole detector state for the new session
    if (this.rabbitholeDetector) {
      this.rabbitholeDetector.reset();
    }

    // Configure the LLM with the Socratic tutor prompt for the first point
    this.updateLLMPrompt();

    // Emit session started event
    this.emitEvent('session_started', {
      sessionId: session.id,
      recallSetId: recallSet.id,
      targetPointCount: duePoints.length,
      targetPointIds: duePoints.map((p) => p.id),
    });

    return session;
  }

  /**
   * Resumes an existing in-progress session.
   *
   * Called internally by startSession when an in-progress session exists.
   * Loads existing messages and determines the current point index.
   *
   * @param session - The existing session to resume
   * @param recallSet - The RecallSet being studied
   * @returns The resumed Session
   */
  private async resumeSession(
    session: Session,
    recallSet: RecallSet
  ): Promise<Session> {
    // Load the recall points for this session
    const points: RecallPoint[] = [];
    for (const pointId of session.targetRecallPointIds) {
      const point = await this.recallPointRepo.findById(pointId);
      if (point) {
        points.push(point);
      }
    }

    // Load existing messages
    const existingMessages = await this.messageRepo.findBySessionId(session.id);

    // Initialize engine state
    this.currentSession = session;
    this.currentRecallSet = recallSet;
    this.targetPoints = points;
    this.messages = existingMessages;

    // TODO (T08): When resuming a paused session, populate recalled state from session.recalledPointIds
    this.pointChecklist = new Map(
      this.targetPoints.map(p => [p.id, 'pending'])
    );
    this.currentProbeIndex = 0;
    this.currentPointStartIndex = 0;

    // === Phase 2: Initialize metrics collection for resumed session ===
    // Note: When resuming, we start fresh with metrics collection
    // Historical messages from before the resume are not re-analyzed
    if (this.metricsCollector) {
      this.metricsCollector.startSession(session.id, this.currentModel);
    }

    // Reset rabbithole detector state for the resumed session
    if (this.rabbitholeDetector) {
      this.rabbitholeDetector.reset();
    }

    // Configure the LLM with the appropriate prompt
    this.updateLLMPrompt();

    // Emit session started event (as a resume)
    this.emitEvent('session_started', {
      sessionId: session.id,
      recallSetId: recallSet.id,
      targetPointCount: points.length,
      resumed: true,
      existingMessageCount: existingMessages.length,
    });

    return session;
  }

  /**
   * Gets the opening message from the tutor.
   *
   * This generates the initial question that starts the recall discussion.
   * Should be called after startSession() to get the first tutor message.
   *
   * @returns The tutor's opening message
   * @throws Error if no session is active
   *
   * @example
   * ```typescript
   * const session = await engine.startSession(recallSet);
   * const opening = await engine.getOpeningMessage();
   * console.log('Tutor:', opening);
   * ```
   */
  async getOpeningMessage(): Promise<string> {
    this.validateActiveSession();

    // Emit point started event for the first probe point
    const firstProbePoint = this.getNextProbePoint();
    this.emitEvent('point_started', {
      pointIndex: this.currentProbeIndex,
      pointId: firstProbePoint?.id ?? '',
      totalPoints: this.targetPoints.length,
    });

    // Generate the opening question from the LLM
    // The prompt is already configured to focus on the current recall point
    const response = await this.llmClient.complete(
      'Begin the recall discussion. Ask an opening question that prompts the learner to recall the target information.',
      {
        temperature: this.config.tutorTemperature,
        maxTokens: this.config.tutorMaxTokens,
      }
    );

    // Save the assistant message to the database with token usage (Phase 2: metrics tracking)
    await this.saveMessage(
      'assistant',
      response.text,
      response.usage?.inputTokens,
      response.usage?.outputTokens
    );

    // Emit assistant message event
    this.emitEvent('assistant_message', {
      content: response.text,
      isOpening: true,
    });

    return response.text;
  }

  /**
   * Processes a user message and generates the tutor's response.
   *
   * This is the main interaction loop method. It:
   * 1. Saves the user message
   * 2. Runs continuous evaluation against all unchecked points
   * 3. For each recalled point, records the outcome and marks it recalled
   * 4. If all points recalled, completes the session
   * 5. Otherwise generates a tutor response with evaluator feedback injected
   *
   * The continuous evaluator runs after every user message — no trigger phrases
   * or message-count thresholds are needed.
   *
   * @param content - The user's message content
   * @returns Result containing the response and session status
   * @throws Error if no session is active
   */
  async processUserMessage(content: string): Promise<ProcessMessageResult> {
    this.validateActiveSession();

    // Save the user message
    await this.saveMessage('user', content);

    // Emit user message event
    this.emitEvent('user_message', {
      content,
    });

    // === Phase 2: Detect rabbitholes after user message ===
    // Check if the user's message indicates a conversational tangent
    await this.detectAndRecordRabbithole();

    // === T06: Continuous evaluation — evaluate ALL unchecked points after every user message ===
    const evalResult = await this.evaluateUncheckedPoints();

    // Mark each recalled point and record FSRS outcome
    for (const pointId of evalResult.recalledPointIds) {
      this.markPointRecalled(pointId);
      const confidence = evalResult.confidencePerPoint.get(pointId) ?? 0.5;
      await this.recordRecallOutcome(pointId, {
        success: true,
        confidence,
        reasoning: `Continuous evaluation detected recall with confidence ${confidence}`,
      });
    }

    // If all points are recalled, handle session completion
    if (this.allPointsRecalled()) {
      return this.handleSessionCompletion(evalResult);
    }

    // Update the LLM prompt to reflect newly recalled points (if any)
    if (evalResult.recalledPointIds.length > 0) {
      this.updateLLMPrompt();
    }

    // Generate a follow-up response from the tutor, injecting evaluator feedback
    const response = await this.generateTutorResponse(evalResult.feedback || undefined);

    // === Phase 2: Check for rabbithole returns after assistant response ===
    // Check if any active rabbitholes have concluded (returned to main topic)
    await this.detectRabbitholeReturns();

    return {
      response,
      completed: false,
      recalledCount: this.getRecalledCount(),
      totalPoints: this.targetPoints.length,
      pointsRecalledThisTurn: evalResult.recalledPointIds,
    };
  }

  /**
   * Manually triggers evaluation and advancement.
   *
   * Kept for backward compatibility with WS protocol (T13 will remove the WS trigger_eval type).
   * Uses the same continuous evaluation logic as processUserMessage.
   *
   * @returns Result containing the response and session status
   * @throws Error if no session is active
   */
  async triggerEvaluation(): Promise<ProcessMessageResult> {
    this.validateActiveSession();

    // Run the same continuous evaluation as processUserMessage
    const evalResult = await this.evaluateUncheckedPoints();

    for (const pointId of evalResult.recalledPointIds) {
      this.markPointRecalled(pointId);
      const confidence = evalResult.confidencePerPoint.get(pointId) ?? 0.5;
      await this.recordRecallOutcome(pointId, {
        success: true,
        confidence,
        reasoning: `Manual trigger evaluation detected recall with confidence ${confidence}`,
      });
    }

    if (this.allPointsRecalled()) {
      return this.handleSessionCompletion(evalResult);
    }

    if (evalResult.recalledPointIds.length > 0) {
      this.updateLLMPrompt();
    }

    const response = await this.generateTutorResponse(evalResult.feedback || undefined);

    return {
      response,
      completed: false,
      recalledCount: this.getRecalledCount(),
      totalPoints: this.targetPoints.length,
      pointsRecalledThisTurn: evalResult.recalledPointIds,
    };
  }

  /**
   * Abandons the current session.
   *
   * Marks the session as abandoned and clears engine state.
   * Use this when the user wants to stop before completing all points.
   *
   * @throws Error if no session is active
   *
   * @example
   * ```typescript
   * if (userWantsToQuit) {
   *   await engine.abandonSession();
   *   console.log('Session abandoned');
   * }
   * ```
   */
  async abandonSession(): Promise<void> {
    this.validateActiveSession();

    // Mark session as abandoned in the database
    await this.sessionRepo.abandon(this.currentSession!.id);

    // Clear engine state
    this.resetState();
  }

  /**
   * Gets the current session state for UI display.
   *
   * @returns SessionState object with checklist-based progress data, or null if no session
   */
  getSessionState(): SessionState | null {
    if (!this.currentSession || !this.currentRecallSet) {
      return null;
    }

    return {
      session: this.currentSession,
      recallSet: this.currentRecallSet,
      // New checklist fields — replace currentPointIndex
      pointChecklist: Object.fromEntries(this.pointChecklist),
      currentProbeIndex: this.currentProbeIndex,
      currentProbePoint: this.getNextProbePoint(),
      totalPoints: this.targetPoints.length,
      recalledCount: this.getRecalledCount(),
      uncheckedPoints: this.getUncheckedPoints(),
      // Keep existing fields
      messageCount: this.messages.length,
      isComplete: this.allPointsRecalled(),
    };
  }

  // ============================================================================
  // T06: Continuous Evaluation Methods
  // ============================================================================

  /**
   * Aggregated result from running continuous evaluation against all unchecked points.
   * This is a local interface — not exported.
   */
  // (ContinuousEvalResult is defined inline below as a return type)

  /**
   * Evaluates all unchecked recall points against the current conversation.
   *
   * Iterates over every unchecked point and calls the existing evaluator API.
   * Points with confidence >= 0.6 are marked as recalled. Points with confidence
   * >= 0.3 but < 0.6 produce feedback for the tutor (near-miss observation).
   *
   * Uses evaluateEnhanced() when metrics are enabled, otherwise basic evaluate().
   *
   * @returns Aggregated result with recalled point IDs, confidence map, and feedback string
   */
  private async evaluateUncheckedPoints(): Promise<{
    recalledPointIds: string[];
    confidencePerPoint: Map<string, number>;
    feedback: string;
  }> {
    const unchecked = this.getUncheckedPoints();
    const recalledPointIds: string[] = [];
    const confidencePerPoint = new Map<string, number>();
    const feedbackParts: string[] = [];

    for (const point of unchecked) {
      let evaluation: RecallEvaluation;

      // Use enhanced evaluation when metrics are enabled for richer data
      if (this.metricsEnabled) {
        const enhancedEvaluation = await this.evaluator.evaluateEnhanced(
          point,
          this.messages,
          {
            attemptNumber: point.fsrsState?.reps ?? 1,
            previousSuccesses: point.fsrsState?.reps ?? 0,
            topic: this.currentRecallSet?.name ?? 'Unknown',
          }
        );

        // Record in metrics collector
        if (this.metricsCollector) {
          const messageEndIndex = this.messages.length - 1;
          this.metricsCollector.recordRecallOutcome(
            point.id,
            enhancedEvaluation,
            this.currentPointStartIndex,
            messageEndIndex
          );
        }

        evaluation = enhancedEvaluation;
      } else {
        evaluation = await this.evaluator.evaluate(point, this.messages);
      }

      confidencePerPoint.set(point.id, evaluation.confidence);

      // Emit evaluation event for each point
      this.emitEvent('point_evaluated', {
        pointId: point.id,
        success: evaluation.success,
        confidence: evaluation.confidence,
        reasoning: evaluation.reasoning,
      });

      // Confidence >= 0.6: point is recalled
      if (evaluation.success && evaluation.confidence >= 0.6) {
        recalledPointIds.push(point.id);

        // Emit point_completed event with FSRS data
        const rating = this.evaluationToRating(evaluation);
        const newState = this.scheduler.schedule(point.fsrsState, rating);
        this.emitEvent('point_completed', {
          pointId: point.id,
          rating,
          newDueDate: newState.due,
          success: evaluation.success,
        });

        feedbackParts.push(
          `The user demonstrated recall of "${point.content.substring(0, 60)}..." (confidence: ${evaluation.confidence.toFixed(2)}).`
        );
      } else if (evaluation.confidence >= 0.3) {
        // Near-miss: provide feedback to help the tutor guide the user
        feedbackParts.push(
          `The user is close to recalling "${point.content.substring(0, 60)}..." but hasn't fully demonstrated it yet (confidence: ${evaluation.confidence.toFixed(2)}). ${evaluation.reasoning}`
        );
      }
      // Below 0.3: no feedback — point is not close to being recalled
    }

    return {
      recalledPointIds,
      confidencePerPoint,
      feedback: feedbackParts.join(' '),
    };
  }

  /**
   * Handles session completion when all points have been recalled.
   * Completes the session, generates a completion message, and returns the result.
   *
   * @param evalResult - The evaluation result from the last evaluateUncheckedPoints() call
   * @returns ProcessMessageResult indicating session completion
   */
  private async handleSessionCompletion(evalResult: {
    recalledPointIds: string[];
    confidencePerPoint: Map<string, number>;
    feedback: string;
  }): Promise<ProcessMessageResult> {
    await this.completeSession();

    // Build a synthetic evaluation for the completion message
    const lastEvaluation: RecallEvaluation = {
      success: true,
      confidence: 0.85,
      reasoning: 'All points recalled via continuous evaluation.',
    };
    const completionResponse = await this.generateCompletionMessage(lastEvaluation);

    return {
      response: completionResponse,
      completed: true,
      recalledCount: this.getRecalledCount(),
      totalPoints: this.targetPoints.length,
      pointsRecalledThisTurn: evalResult.recalledPointIds,
    };
  }

  // ============================================================================
  // Checklist Helper Methods
  // ============================================================================

  /**
   * Returns all recall points that have NOT been recalled yet, in their original order.
   * Used by the evaluator (T06) to know which points to evaluate against.
   */
  getUncheckedPoints(): RecallPoint[] {
    return this.targetPoints.filter(p => this.pointChecklist.get(p.id) === 'pending');
  }

  /**
   * Returns the next point the tutor should probe, starting from currentProbeIndex.
   * Skips already-recalled points. Wraps around if needed.
   * Returns null if all points are recalled.
   */
  getNextProbePoint(): RecallPoint | null {
    if (this.allPointsRecalled()) return null;

    const total = this.targetPoints.length;
    for (let offset = 0; offset < total; offset++) {
      const idx = (this.currentProbeIndex + offset) % total;
      const point = this.targetPoints[idx];
      if (this.pointChecklist.get(point.id) === 'pending') {
        return point;
      }
    }
    return null; // Should not reach here if allPointsRecalled() is false
  }

  /**
   * Marks a recall point as recalled. Idempotent — if the point is already recalled, this is a no-op.
   * Also advances currentProbeIndex past this point if it was the current probe target.
   * Emits a point_recalled event with progress data.
   */
  markPointRecalled(pointId: string): void {
    if (this.pointChecklist.get(pointId) !== 'pending') return; // already recalled or unknown ID

    this.pointChecklist.set(pointId, 'recalled');

    this.emitEvent('point_recalled', {
      pointId,
      recalledCount: this.getRecalledCount(),
      totalPoints: this.targetPoints.length,
    });

    // Advance probe index if this was the current probe target
    const currentProbePoint = this.targetPoints[this.currentProbeIndex];
    if (currentProbePoint && currentProbePoint.id === pointId) {
      this.advanceProbeIndex();
    }
  }

  /**
   * Returns true if every point in the checklist has been recalled.
   */
  allPointsRecalled(): boolean {
    for (const status of this.pointChecklist.values()) {
      if (status === 'pending') return false;
    }
    return true;
  }

  /**
   * Returns the count of points that have been recalled so far.
   */
  getRecalledCount(): number {
    let count = 0;
    for (const status of this.pointChecklist.values()) {
      if (status === 'recalled') count++;
    }
    return count;
  }

  /**
   * Advances currentProbeIndex to the next unchecked point.
   * Called internally after marking a point as recalled.
   */
  private advanceProbeIndex(): void {
    const total = this.targetPoints.length;
    for (let offset = 1; offset <= total; offset++) {
      const idx = (this.currentProbeIndex + offset) % total;
      if (this.pointChecklist.get(this.targetPoints[idx].id) === 'pending') {
        this.currentProbeIndex = idx;
        return;
      }
    }
    // All recalled — probe index doesn't matter anymore, but set to length as sentinel
    this.currentProbeIndex = total;
  }

  /**
   * Records a recall outcome for a specific point: maps evaluation result to FSRS rating,
   * runs the FSRS scheduler, persists the updated FSRS state, and records the recall attempt
   * in the point's recall history.
   * Extracted from the old advanceToNextPoint() so it can be called for any point at any time.
   */
  private async recordRecallOutcome(
    pointId: string,
    evaluation: RecallEvaluation // { success: boolean; confidence: number; reasoning: string }
  ): Promise<void> {
    const rating = this.evaluationToRating(evaluation);
    const point = this.targetPoints.find(p => p.id === pointId);
    if (!point) return;

    // Update FSRS scheduling state
    const schedulingResult = this.scheduler.schedule(point.fsrsState, rating);
    await this.recallPointRepo.updateFSRSState(pointId, schedulingResult);

    // Persist recall attempt in history (mirrors old advanceToNextPoint behavior)
    await this.recallPointRepo.addRecallAttempt(pointId, {
      timestamp: new Date(),
      success: evaluation.success,
      latencyMs: 0, // We don't track latency in conversational recall
    });
  }

  /**
   * Maps a recall evaluation to an FSRS rating.
   *
   * The mapping considers both success and confidence:
   * - High confidence success -> 'easy' or 'good'
   * - Low confidence success -> 'good' or 'hard'
   * - Failure -> 'forgot' or 'hard'
   *
   * @param evaluation - The recall evaluation result
   * @returns The corresponding FSRS rating
   */
  private evaluationToRating(evaluation: RecallEvaluation): RecallRating {
    if (evaluation.success) {
      // Successful recall - determine between easy, good, or hard
      if (evaluation.confidence >= 0.9) {
        // High confidence, effortless recall
        return 'easy';
      } else if (evaluation.confidence >= 0.7) {
        // Good recall with some effort
        return 'good';
      } else {
        // Recalled but with significant difficulty
        return 'hard';
      }
    } else {
      // Failed recall
      if (evaluation.confidence >= 0.7) {
        // Definitely didn't recall
        return 'forgot';
      } else {
        // Uncertain failure - might have been close
        return 'hard';
      }
    }
  }

  /**
   * Generates a tutor response for the current conversation.
   *
   * Builds the conversation history from session messages and requests
   * a follow-up response from the LLM. When evaluatorFeedback is provided,
   * it is injected as an ephemeral assistant message at the start of
   * conversation history — NOT persisted to this.messages or DB.
   * The feedback is prefixed with an instruction telling the tutor not to
   * reference it directly.
   *
   * @param evaluatorFeedback - Optional feedback from the continuous evaluator
   * @returns The tutor's response
   */
  private async generateTutorResponse(evaluatorFeedback?: string): Promise<string> {
    // Build conversation history for the LLM
    const conversationHistory = this.buildConversationHistory();

    // T06: Inject evaluator feedback as an ephemeral assistant message at the start.
    // This shapes the tutor's next response invisibly — NOT saved to messages or DB.
    if (evaluatorFeedback) {
      conversationHistory.unshift({
        role: 'assistant',
        content: `[Internal observation — do not reference or quote directly to the user]: ${evaluatorFeedback}`,
      });
    }

    // Generate response
    const response = await this.llmClient.complete(conversationHistory, {
      temperature: this.config.tutorTemperature,
      maxTokens: this.config.tutorMaxTokens,
    });

    // Save the assistant message with token usage (Phase 2: metrics tracking)
    await this.saveMessage(
      'assistant',
      response.text,
      response.usage?.inputTokens,
      response.usage?.outputTokens
    );

    // Emit assistant message event
    this.emitEvent('assistant_message', {
      content: response.text,
      isOpening: false,
    });

    return response.text;
  }

  /**
   * Generates a transition message after completing a point.
   *
   * Provides feedback on the completed point and introduces the next topic.
   *
   * Phase 2: Now tracks token usage for metrics collection.
   *
   * @param evaluation - The evaluation result from the completed point
   * @param hasNextPoint - Whether there's another point to discuss
   * @returns The transition message
   */
  private async generateTransitionMessage(
    evaluation: RecallEvaluation,
    hasNextPoint: boolean
  ): Promise<string> {
    // Build appropriate feedback prompt based on evaluation and whether there's a next point
    const successPrompt = hasNextPoint
      ? 'The learner successfully recalled the information. Provide brief positive feedback, then smoothly transition to the next topic by asking an opening question about it.'
      : 'The learner successfully recalled the final piece of information. Provide brief positive feedback.';

    const strugglePrompt = hasNextPoint
      ? 'The learner struggled with recall. Provide encouraging feedback about what they did remember, briefly reinforce the key point, then transition to the next topic.'
      : 'The learner struggled with the final recall point. Provide encouraging feedback and briefly reinforce the key information.';

    const feedbackPrompt = evaluation.success ? successPrompt : strugglePrompt;

    const response = await this.llmClient.complete(feedbackPrompt, {
      temperature: this.config.tutorTemperature,
      maxTokens: this.config.tutorMaxTokens,
    });

    // Save the transition message with token usage (Phase 2: metrics tracking)
    await this.saveMessage(
      'assistant',
      response.text,
      response.usage?.inputTokens,
      response.usage?.outputTokens
    );

    // Emit assistant message event
    this.emitEvent('assistant_message', {
      content: response.text,
      isTransition: true,
    });

    return response.text;
  }

  /**
   * Generates a session completion message.
   *
   * Celebrates the user's completion of all recall points and provides
   * a summary of their performance.
   *
   * Phase 2: Now tracks token usage for metrics collection.
   *
   * @param lastEvaluation - The evaluation result from the final point
   * @returns The completion message
   */
  private async generateCompletionMessage(
    lastEvaluation: RecallEvaluation
  ): Promise<string> {
    const feedbackPrompt = lastEvaluation.success
      ? `The learner has completed all recall points for this session! Provide a warm congratulatory message. Summarize that they've reviewed ${this.targetPoints.length} points. Encourage them to continue their learning journey.`
      : `The learner has completed all recall points for this session, though they struggled with the last one. Provide encouraging feedback about completing the session. Summarize that they've reviewed ${this.targetPoints.length} points. Encourage continued practice.`;

    const response = await this.llmClient.complete(feedbackPrompt, {
      temperature: this.config.tutorTemperature,
      maxTokens: this.config.tutorMaxTokens,
    });

    // Save the completion message with token usage (Phase 2: metrics tracking)
    await this.saveMessage(
      'assistant',
      response.text,
      response.usage?.inputTokens,
      response.usage?.outputTokens
    );

    // Emit assistant message event
    this.emitEvent('assistant_message', {
      content: response.text,
      isCompletion: true,
    });

    return response.text;
  }

  /**
   * Builds the conversation history in LLM message format.
   *
   * Converts SessionMessage objects to the format expected by the LLM client.
   * Only includes user and assistant messages (not system messages).
   *
   * @returns Array of LLM messages representing the conversation
   */
  private buildConversationHistory(): LLMMessage[] {
    return this.messages
      .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
      .map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      }));
  }

  /**
   * Updates the LLM system prompt for the current recall point.
   *
   * Rebuilds the Socratic tutor prompt with the current point information
   * and sets it on the LLM client.
   */
  private updateLLMPrompt(): void {
    const prompt = buildSocraticTutorPrompt({
      recallSet: this.currentRecallSet!,
      targetPoints: this.targetPoints,
      uncheckedPoints: this.getUncheckedPoints(),
      currentProbePoint: this.getNextProbePoint(),
    });

    this.llmClient.setSystemPrompt(prompt);
  }

  /**
   * Saves a message to the database and local cache.
   *
   * Also records the message in the metrics collector (Phase 2) if available,
   * tracking timing and token usage for session analytics.
   *
   * @param role - The role of the message sender
   * @param content - The message content
   * @param inputTokens - For assistant messages, the input tokens used in the LLM call
   * @param outputTokens - For assistant messages, the output tokens generated
   */
  private async saveMessage(
    role: 'user' | 'assistant',
    content: string,
    inputTokens?: number,
    outputTokens?: number
  ): Promise<void> {
    const messageId = generateId('msg');
    const message = await this.messageRepo.create({
      id: messageId,
      sessionId: this.currentSession!.id,
      role,
      content,
    });

    // Add to local cache for conversation history
    this.messages.push(message);

    // === Phase 2: Record message in metrics collector ===
    // Track message timing and token usage for session analytics
    if (this.metricsCollector) {
      // Estimate token count from content length (rough approximation)
      // In a production system, this would use the actual tokenizer
      const estimatedTokenCount = Math.ceil(content.length / 4);

      this.metricsCollector.recordMessage(
        messageId,
        role,
        estimatedTokenCount,
        inputTokens,
        outputTokens
      );
    }
  }

  /**
   * Marks the current session as completed.
   *
   * Phase 2: Also finalizes and persists session metrics, including:
   * - Closing any active rabbitholes as abandoned
   * - Recording all collected metrics to the database
   * - Persisting rabbithole events and recall outcomes
   */
  private async completeSession(): Promise<void> {
    await this.sessionRepo.complete(this.currentSession!.id);

    // === Phase 2: Finalize and persist session metrics ===
    await this.finalizeAndPersistMetrics();

    // Emit session completed event
    this.emitEvent('session_completed', {
      sessionId: this.currentSession!.id,
      pointsReviewed: this.targetPoints.length,
    });

    // Update local state
    this.currentSession = {
      ...this.currentSession!,
      status: 'completed',
      endedAt: new Date(),
    };
  }

  /**
   * Validates that there is an active session.
   *
   * @throws Error if no session is active
   */
  private validateActiveSession(): void {
    if (!this.currentSession || !this.currentRecallSet) {
      throw new Error(
        'No active session. Call startSession() before using this method.'
      );
    }
  }

  /**
   * Resets the engine state to initial values.
   *
   * Phase 2: Also resets metrics collection state.
   */
  private resetState(): void {
    this.currentSession = null;
    this.currentRecallSet = null;
    this.targetPoints = [];
    this.pointChecklist = new Map();
    this.currentProbeIndex = 0;
    this.messages = [];
    this.llmClient.setSystemPrompt(undefined);

    // === Phase 2: Reset metrics collection state ===
    this.currentPointStartIndex = 0;
    if (this.metricsCollector) {
      this.metricsCollector.reset();
    }
    if (this.rabbitholeDetector) {
      this.rabbitholeDetector.reset();
    }
  }

  // ============================================================================
  // Phase 2: Metrics Collection Helper Methods
  // ============================================================================

  /**
   * Detects and records a new rabbithole (conversational tangent).
   *
   * Called after each user message to check if the conversation has
   * diverged from the current recall topic. If a rabbithole is detected,
   * it is recorded in both the metrics collector and the database.
   *
   * @private
   */
  private async detectAndRecordRabbithole(): Promise<void> {
    // Skip if rabbithole detection is not enabled
    if (!this.rabbitholeDetector || !this.currentSession) {
      return;
    }

    const currentPoint = this.getNextProbePoint() ?? this.targetPoints[this.targetPoints.length - 1];
    const messageIndex = this.messages.length - 1;

    // Detect if the conversation has entered a new rabbithole
    const rabbitholeEvent = await this.rabbitholeDetector.detectRabbithole(
      this.currentSession.id,
      this.messages,
      currentPoint,
      this.targetPoints,
      messageIndex
    );

    // If a rabbithole was detected, record it
    if (rabbitholeEvent) {
      // Record in metrics collector
      if (this.metricsCollector) {
        this.metricsCollector.recordRabbithole(rabbitholeEvent);
      }

      // Persist to database
      if (this.rabbitholeRepo) {
        await this.rabbitholeRepo.create({
          id: rabbitholeEvent.id,
          sessionId: this.currentSession.id,
          topic: rabbitholeEvent.topic,
          triggerMessageIndex: rabbitholeEvent.triggerMessageIndex,
          returnMessageIndex: null,
          depth: rabbitholeEvent.depth,
          relatedRecallPointIds: rabbitholeEvent.relatedRecallPointIds,
          userInitiated: rabbitholeEvent.userInitiated,
          status: 'active',
          createdAt: new Date(),
        });
      }

      // Emit rabbithole detected event
      this.emitEvent('point_evaluated', {
        pointId: currentPoint.id,
        rabbitholeDetected: true,
        rabbitholeId: rabbitholeEvent.id,
        rabbitholeTopic: rabbitholeEvent.topic,
      });
    }
  }

  /**
   * Detects when active rabbitholes have concluded (returned to main topic).
   *
   * Called after generating tutor responses to check if any active
   * rabbitholes have been resolved. Updates both the metrics collector
   * and the database when returns are detected.
   *
   * @private
   */
  private async detectRabbitholeReturns(): Promise<void> {
    // Skip if rabbithole detection is not enabled
    if (!this.rabbitholeDetector || !this.currentSession) {
      return;
    }

    const currentPoint = this.getNextProbePoint() ?? this.targetPoints[this.targetPoints.length - 1];
    const messageIndex = this.messages.length - 1;

    // Detect if any active rabbitholes have concluded
    const returnedEvents = await this.rabbitholeDetector.detectReturns(
      this.messages,
      currentPoint,
      messageIndex
    );

    // Record each returned rabbithole
    for (const event of returnedEvents) {
      // Update metrics collector with return information
      if (this.metricsCollector && event.returnMessageIndex !== null) {
        this.metricsCollector.updateRabbitholeReturn(
          event.id,
          event.returnMessageIndex
        );
      }

      // Update database record
      if (this.rabbitholeRepo) {
        await this.rabbitholeRepo.update(event.id, {
          returnMessageIndex: event.returnMessageIndex,
          status: 'returned',
        });
      }
    }
  }

  /**
   * Finalizes and persists all session metrics.
   *
   * This method is called when the session completes. It:
   * 1. Closes any active rabbitholes as abandoned
   * 2. Calculates final session metrics
   * 3. Persists metrics to the session_metrics table
   * 4. Persists recall outcomes to the recall_outcomes table
   * 5. Records any final rabbithole events
   *
   * @private
   */
  private async finalizeAndPersistMetrics(): Promise<void> {
    // Skip if metrics collection is not enabled
    if (!this.metricsCollector || !this.currentSession) {
      return;
    }

    const finalMessageIndex = this.messages.length - 1;

    // Close any active rabbitholes as abandoned since session is ending
    if (this.rabbitholeDetector) {
      const abandonedRabbitholes = this.rabbitholeDetector.closeAllActive(finalMessageIndex);

      // Record abandoned rabbitholes in metrics and database
      for (const event of abandonedRabbitholes) {
        this.metricsCollector.recordRabbithole(event);

        // Update database record to mark as abandoned
        if (this.rabbitholeRepo) {
          await this.rabbitholeRepo.update(event.id, {
            returnMessageIndex: finalMessageIndex,
            status: 'abandoned',
          });
        }
      }
    }

    // Finalize session metrics using the collector
    const metrics = await this.metricsCollector.finalizeSession(this.currentSession);

    // Get extended metrics for additional calculations
    const extendedMetrics = this.metricsCollector.getExtendedMetrics();

    // Persist session metrics to the database
    if (this.metricsRepo) {
      await this.metricsRepo.create({
        id: generateId('sm'),
        sessionId: this.currentSession.id,
        durationMs: metrics.totalDurationMs,
        activeTimeMs: extendedMetrics.activeTimeMs,
        avgUserResponseTimeMs: extendedMetrics.avgUserResponseTimeMs,
        avgAssistantResponseTimeMs: extendedMetrics.avgAssistantResponseTimeMs,
        recallPointsAttempted: extendedMetrics.recallPointsAttempted,
        recallPointsSuccessful: extendedMetrics.recallPointsSuccessful,
        recallPointsFailed: extendedMetrics.recallPointsFailed,
        overallRecallRate: extendedMetrics.overallRecallRate,
        avgConfidence: extendedMetrics.avgConfidence,
        totalMessages: extendedMetrics.totalMessages,
        userMessages: Math.floor(extendedMetrics.totalMessages / 2),
        assistantMessages: Math.ceil(extendedMetrics.totalMessages / 2),
        avgMessageLength: this.calculateAverageMessageLength(),
        rabbitholeCount: extendedMetrics.rabbitholeCount,
        totalRabbitholeTimeMs: extendedMetrics.totalRabbitholeTimeMs,
        avgRabbitholeDepth: extendedMetrics.avgRabbitholeDepth,
        inputTokens: metrics.tokenUsage.inputTokens,
        outputTokens: metrics.tokenUsage.outputTokens,
        totalTokens: metrics.tokenUsage.totalTokens,
        estimatedCostUsd: metrics.costUsd,
        engagementScore: metrics.engagementScore,
        calculatedAt: new Date(),
      });
    }

    // Persist recall outcomes to the database
    if (this.recallOutcomeRepo) {
      const outcomes = metrics.recallOutcomes;
      if (outcomes.length > 0) {
        const outcomeRecords = outcomes.map((outcome) => ({
          id: generateId('ro'),
          sessionId: this.currentSession!.id,
          recallPointId: outcome.recallPointId,
          success: outcome.success,
          confidence: outcome.confidence,
          rating: null, // Could be derived from confidence if needed
          reasoning: null, // Not stored in RecallOutcome model, could be added
          messageIndexStart: outcome.messageRange.start,
          messageIndexEnd: outcome.messageRange.end,
          timeSpentMs: outcome.durationMs,
          createdAt: new Date(),
        }));

        await this.recallOutcomeRepo.createMany(outcomeRecords);
      }
    }
  }

  /**
   * Calculates the average message length across all session messages.
   *
   * @returns Average message length in characters
   * @private
   */
  private calculateAverageMessageLength(): number {
    if (this.messages.length === 0) {
      return 0;
    }

    const totalLength = this.messages.reduce(
      (sum, msg) => sum + msg.content.length,
      0
    );

    return totalLength / this.messages.length;
  }
}
