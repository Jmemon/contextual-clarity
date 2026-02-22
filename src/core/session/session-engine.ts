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

/**
 * Aggregated result of evaluating all unchecked points against the latest user message.
 * Internal to session-engine.ts — not exported.
 */
interface ContinuousEvalResult {
  recalledPointIds: string[];
  confidencePerPoint: Map<string, number>;
  feedback: string;
}
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
import { RabbitholeAgent } from './rabbithole-agent';

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
   * T08: Set to true when all points are recalled while the user is in a rabbit hole.
   * The completion overlay is deferred until the rabbit hole exits via exitRabbithole().
   */
  private completionPending: boolean = false;

  // ============================================================================
  // T09: Rabbit Hole UX Mode State
  // ============================================================================

  /**
   * T09: Current session mode.
   * 'recall' = normal Socratic tutoring mode
   * 'rabbithole' = user is exploring a tangent with the RabbitholeAgent
   */
  private currentMode: 'recall' | 'rabbithole' = 'recall';

  /**
   * T09: The active RabbitholeAgent instance, or null if not in a rabbit hole.
   * Each rabbit hole gets its own dedicated agent instance with its own LLM client.
   */
  private activeRabbitholeAgent: RabbitholeAgent | null = null;

  /**
   * T09: The rabbithole event ID currently being explored, or null if not in a rabbit hole.
   * Used to persist the conversation to the correct DB record on exit.
   */
  private activeRabbitholeEventId: string | null = null;

  /**
   * T09: The topic being explored in the current rabbit hole, or null if not active.
   */
  private activeRabbitholeTopic: string | null = null;

  /**
   * T09: Number of recall points that were recalled WHILE in the current rabbit hole.
   * Reported in the rabbithole_exited event payload.
   */
  private rabbitholePointsRecalled: number = 0;

  /**
   * T09: Flag set to true when all points are recalled while inside a rabbit hole.
   * Mirrors completionPending semantics — the overlay fires when the rabbit hole exits.
   */
  private completionPendingAfterRabbithole: boolean = false;

  /**
   * T09: Cooldown counter for rabbit hole detection.
   * Set to 3 when the user declines a rabbit hole; decremented on each user message.
   * While > 0, detectAndRecordRabbithole() is suppressed.
   */
  private rabbitholeDeclineCooldown: number = 0;

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
    // T08: Check for any active session (in_progress OR paused) to resume.
    // Previously only found 'in_progress' sessions; now also resumes paused ones.
    const existingSession = await this.sessionRepo.findActiveSession(recallSet.id);
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

    // T08: Reconstruct checklist from persisted recalledPointIds for paused sessions.
    // This restores progress without re-evaluating the conversation history.
    const recalledSet = new Set(session.recalledPointIds ?? []);
    this.pointChecklist = new Map(
      this.targetPoints.map(p => [p.id, recalledSet.has(p.id) ? 'recalled' : 'pending'])
    );
    this.completionPending = false;

    // Set currentProbeIndex to the first still-pending point
    this.currentProbeIndex = 0;
    for (let i = 0; i < this.targetPoints.length; i++) {
      if (this.pointChecklist.get(this.targetPoints[i].id) === 'pending') {
        this.currentProbeIndex = i;
        break;
      }
    }
    this.currentPointStartIndex = 0;

    // T08: If the session was paused, transition it back to 'in_progress' on resume.
    if (session.status === 'paused') {
      await this.sessionRepo.update(session.id, {
        status: 'in_progress',
        resumedAt: new Date(),
      });
      this.currentSession = { ...session, status: 'in_progress', resumedAt: new Date() };
    }

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

    // T09: If the user is currently in a rabbit hole, route to the dedicated agent.
    // The main session (Socratic tutor) is frozen while in rabbit hole mode.
    if (this.currentMode === 'rabbithole') {
      return this.processRabbitholeMessage(content);
    }

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

    // T08: If all points are recalled, emit overlay event instead of immediately completing.
    // The session is only finalized when the user leaves via leave_session / "Done" button.
    if (this.allPointsRecalled()) {
      return this.handleAllPointsRecalled(evalResult);
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
  private async evaluateUncheckedPoints(): Promise<ContinuousEvalResult> {
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
   * T08: Handles the moment all points have been recalled.
   *
   * Instead of immediately completing the session (which would prevent further discussion),
   * this emits 'session_complete_overlay' to prompt the UI to show the completion overlay.
   * The session is only finalized when the user clicks "Done" (which sends leave_session)
   * or when finalizeSession() is called explicitly.
   *
   * Edge case: if the user is currently in a rabbit hole, set completionPending = true
   * and defer the overlay until onRabbitHoleExit() is called.
   *
   * @param evalResult - The evaluation result from the last evaluateUncheckedPoints() call
   * @returns ProcessMessageResult with a continuation response (not marked completed yet)
   */
  private async handleAllPointsRecalled(evalResult: ContinuousEvalResult): Promise<ProcessMessageResult> {
    const recalledCount = this.getRecalledCount();
    const totalPoints = this.targetPoints.length;

    if (this.isInRabbitHole()) {
      // Defer the overlay until the rabbit hole exits
      this.completionPending = true;
    } else {
      // Emit the overlay event — frontend will show completion overlay
      this.emitEvent('session_complete_overlay', {
        sessionId: this.currentSession!.id,
        recalledCount,
        totalPoints,
      });
    }

    // Generate a brief continuation response — the user can still keep talking
    const response = await this.generateTutorResponse(evalResult.feedback || undefined);

    return {
      response,
      completed: false, // Session is NOT finalized yet — user must click Done
      recalledCount,
      totalPoints,
      pointsRecalledThisTurn: evalResult.recalledPointIds,
    };
  }

  /**
   * T08: Called when the user exits a rabbit hole.
   * If completionPending is true (all points recalled while in rabbit hole),
   * now emits the session_complete_overlay event that was deferred.
   */
  onRabbitHoleExit(): void {
    if (this.completionPending && this.currentSession) {
      this.completionPending = false;
      this.emitEvent('session_complete_overlay', {
        sessionId: this.currentSession.id,
        recalledCount: this.getRecalledCount(),
        totalPoints: this.targetPoints.length,
      });
    }
  }

  /**
   * T09: Returns true if the user is currently inside a rabbit hole tangent.
   * Replaces the T08 stub — now checks the actual mode state.
   */
  private isInRabbitHole(): boolean {
    return this.currentMode === 'rabbithole';
  }

  // ============================================================================
  // T09: Rabbit Hole UX Mode Methods
  // ============================================================================

  /**
   * T09: Enters a rabbit hole for the given topic.
   *
   * Called when the user opts in after a 'rabbithole_detected' event.
   * Creates a dedicated RabbitholeAgent with its own AnthropicClient,
   * switches mode to 'rabbithole', and emits 'rabbithole_entered'.
   *
   * @param topic - The tangent topic to explore
   * @param eventId - The rabbithole event ID from the detection (for DB tracking)
   * @returns The agent's opening message to display to the user
   * @throws Error if no session is active
   */
  async enterRabbithole(topic: string, eventId: string): Promise<string> {
    this.validateActiveSession();

    if (this.currentMode === 'rabbithole') {
      throw new Error('Already in a rabbit hole — sequential only, not nested');
    }

    // Switch mode before creating the agent
    this.currentMode = 'rabbithole';
    this.activeRabbitholeEventId = eventId;
    this.activeRabbitholeTopic = topic;
    this.rabbitholePointsRecalled = 0;

    // Create the dedicated agent with a fresh AnthropicClient
    this.activeRabbitholeAgent = new RabbitholeAgent({
      topic,
      recallSetName: this.currentRecallSet!.name,
      recallSetDescription: this.currentRecallSet!.description,
    });

    // Emit the entered event BEFORE generating the opening message
    this.emitEvent('rabbithole_entered', { topic });

    // Generate and return the opening message from the agent
    const openingMessage = await this.activeRabbitholeAgent.generateOpeningMessage();

    return openingMessage;
  }

  /**
   * T09: Exits the current rabbit hole and returns to the main recall session.
   *
   * Stores the full conversation to the DB, resets rabbit hole state,
   * switches mode back to 'recall', and emits 'rabbithole_exited'.
   *
   * If all points were recalled during the rabbit hole (completionPendingAfterRabbithole),
   * the session_complete_overlay event is fired immediately after exiting.
   *
   * @throws Error if not currently in a rabbit hole
   */
  async exitRabbithole(): Promise<void> {
    if (this.currentMode !== 'rabbithole' || !this.activeRabbitholeAgent) {
      throw new Error('Not currently in a rabbit hole');
    }

    const topic = this.activeRabbitholeTopic ?? 'Unknown topic';
    const eventId = this.activeRabbitholeEventId;
    const pointsRecalledDuring = this.rabbitholePointsRecalled;
    const completionPending = this.completionPendingAfterRabbithole;

    // Persist conversation to DB before clearing state
    if (this.rabbitholeRepo && eventId) {
      const conversation = this.activeRabbitholeAgent.getConversationHistory();
      await this.rabbitholeRepo.updateConversation(eventId, conversation);

      // Update status to 'returned' since the user exited intentionally
      await this.rabbitholeRepo.update(eventId, {
        returnMessageIndex: this.messages.length - 1,
        status: 'returned',
      });
    }

    // Reset rabbit hole state
    this.currentMode = 'recall';
    this.activeRabbitholeAgent = null;
    this.activeRabbitholeEventId = null;
    this.activeRabbitholeTopic = null;
    this.rabbitholePointsRecalled = 0;
    this.completionPendingAfterRabbithole = false;

    // Emit exited event
    this.emitEvent('rabbithole_exited', {
      label: topic,
      pointsRecalledDuring,
      completionPending,
    });

    // T09/T08: If all points were recalled during the rabbit hole,
    // now that we've exited, fire the deferred completion overlay.
    if (completionPending && this.currentSession) {
      this.emitEvent('session_complete_overlay', {
        sessionId: this.currentSession.id,
        recalledCount: this.getRecalledCount(),
        totalPoints: this.targetPoints.length,
      });
    }
  }

  /**
   * T09: Processes a user message while in rabbit hole mode.
   *
   * Routes the message to the RabbitholeAgent instead of the Socratic tutor.
   * The continuous evaluator still runs silently — it can still mark points as
   * recalled, but provides no steering feedback to the user.
   *
   * NOTE: Messages in rabbit hole mode are NOT saved to the main session message
   * store (this.messages / DB session_messages table). The rabbit hole has its own
   * conversation history in the RabbitholeAgent.
   *
   * @param content - The user's message content
   * @returns Result containing the agent's response and session status
   */
  private async processRabbitholeMessage(content: string): Promise<ProcessMessageResult> {
    if (!this.activeRabbitholeAgent) {
      throw new Error('No active rabbit hole agent');
    }

    // Run the evaluator silently — can still mark points as recalled
    // even during rabbit holes (T06 continuous evaluation continues)
    const evalResult = await this.evaluateUncheckedPoints();

    // Count points recalled during this rabbit hole
    this.rabbitholePointsRecalled += evalResult.recalledPointIds.length;

    // Mark each recalled point and record FSRS outcome
    for (const pointId of evalResult.recalledPointIds) {
      this.markPointRecalled(pointId);
      const confidence = evalResult.confidencePerPoint.get(pointId) ?? 0.5;
      await this.recordRecallOutcome(pointId, {
        success: true,
        confidence,
        reasoning: `Recalled during rabbit hole exploration (confidence: ${confidence})`,
      });
    }

    // If all points are recalled while in a rabbit hole, defer the overlay
    if (this.allPointsRecalled() && !this.completionPendingAfterRabbithole) {
      this.completionPendingAfterRabbithole = true;
      // Also set the main completionPending flag so onRabbitHoleExit() works
      this.completionPending = true;
    }

    // Route to the RabbitholeAgent for the actual response
    // The evaluator feedback is NOT injected here — the agent has its own persona
    const response = await this.activeRabbitholeAgent.generateResponse(content);

    return {
      response,
      completed: false, // Session never completes while in a rabbit hole
      recalledCount: this.getRecalledCount(),
      totalPoints: this.targetPoints.length,
      pointsRecalledThisTurn: evalResult.recalledPointIds,
    };
  }

  /**
   * T09: Declines the current rabbit hole prompt.
   *
   * Sets a cooldown of 3 messages during which detection is suppressed,
   * preventing rapid repeated prompts after the user says no.
   */
  declineRabbithole(): void {
    this.rabbitholeDeclineCooldown = 3;
  }

  /**
   * T08: Pauses the current session (user clicked "Leave Session").
   *
   * This is the non-destructive alternative to abandonSession(). It:
   * 1. Persists the current recalledPointIds to the DB
   * 2. Sets session status to 'paused' with pausedAt timestamp
   * 3. Emits 'session_paused' event for the WebSocket handler to forward
   * 4. Resets engine state so the engine is ready for a new session
   *
   * @throws Error if no session is active
   */
  async pauseSession(): Promise<void> {
    this.validateActiveSession();

    const sessionId = this.currentSession!.id;
    const recalledCount = this.getRecalledCount();
    const totalPoints = this.targetPoints.length;

    // Persist final recalledPointIds before pausing
    const recalledIds = this.getRecalledPointIds();
    await this.sessionRepo.updateRecalledPointIds(sessionId, recalledIds);

    // Set status to 'paused'
    await this.sessionRepo.pause(sessionId);

    // Emit paused event BEFORE resetting state (so we have the data)
    this.emitEvent('session_paused', {
      sessionId,
      recalledCount,
      totalPoints,
    });

    // Reset engine state — the session is now paused in the DB
    this.resetState();
  }

  /**
   * T08: Public wrapper that finalizes the session as 'completed'.
   *
   * This is used when the overlay logic requires session finalization from outside
   * the engine (e.g. session-handler could call this if needed in future).
   * Currently the session is completed automatically via completeSession().
   *
   * @throws Error if no session is active
   */
  async finalizeSession(): Promise<void> {
    this.validateActiveSession();
    await this.completeSession();
    this.resetState();
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

    // T08: Fire-and-forget persist recalledPointIds to DB so paused sessions can resume accurately.
    // We don't await to avoid blocking the message processing loop.
    if (this.currentSession) {
      const recalledIds = this.getRecalledPointIds();
      this.sessionRepo.updateRecalledPointIds(this.currentSession.id, recalledIds).catch((err) => {
        console.error('[SessionEngine] Failed to persist recalledPointIds:', err);
      });
    }

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
   * Returns the IDs of all recalled points in their original target order.
   * Used by T08 to persist checklist state to the database.
   */
  getRecalledPointIds(): string[] {
    return this.targetPoints
      .filter(p => this.pointChecklist.get(p.id) === 'recalled')
      .map(p => p.id);
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
    // Build appropriate prompt based on evaluation and whether there's a next point.
    // T07: No praise, no congratulatory language — the UI handles positive reinforcement.
    const successPrompt = hasNextPoint
      ? 'The user recalled this point. Transition to the next topic by asking an opening question about it. Do not congratulate or praise — just move on naturally.'
      : 'The user recalled the final point. Wrap up briefly — no congratulations, no praise.';

    const strugglePrompt = hasNextPoint
      ? 'The user struggled with this point. Briefly note the key idea they missed, then move on to the next topic with an opening question. No pity, no excessive encouragement.'
      : 'The user struggled with the final point. Briefly note the key idea, then wrap up. No pity, no excessive encouragement.';

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
   * Provides a brief wrap-up when the user finishes all recall points.
   *
   * Phase 2: Now tracks token usage for metrics collection.
   *
   * @param lastEvaluation - The evaluation result from the final point
   * @returns The completion message
   */
  private async generateCompletionMessage(
    lastEvaluation: RecallEvaluation
  ): Promise<string> {
    // T07: No warm congratulations, no "learning journey" language — matter-of-fact wrap-up only.
    const feedbackPrompt = lastEvaluation.success
      ? `The user has finished all ${this.targetPoints.length} recall points. Provide a brief, matter-of-fact wrap-up. No warm congratulations, no exclamation marks, no "learning journey" language.`
      : `The user has finished all ${this.targetPoints.length} recall points, though they struggled with the last one. Provide a brief wrap-up noting the key idea they missed. No pity, no excessive encouragement.`;

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
    this.completionPending = false; // T08: reset deferred overlay flag
    this.llmClient.setSystemPrompt(undefined);

    // T09: Reset rabbit hole UX mode state
    this.currentMode = 'recall';
    this.activeRabbitholeAgent = null;
    this.activeRabbitholeEventId = null;
    this.activeRabbitholeTopic = null;
    this.rabbitholePointsRecalled = 0;
    this.completionPendingAfterRabbithole = false;
    this.rabbitholeDeclineCooldown = 0;

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

    // T09: Skip detection if the user recently declined a rabbit hole (cooldown)
    if (this.rabbitholeDeclineCooldown > 0) {
      this.rabbitholeDeclineCooldown--;
      return;
    }

    // T09: Don't detect a new rabbit hole if we're already in one
    if (this.currentMode === 'rabbithole') {
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

      // Persist to database with 'active' status — will be updated when user enters/declines
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

      // T09: Emit 'rabbithole_detected' (NOT 'point_evaluated') so the handler can
      // forward it to the frontend as a prompt for the user to opt in.
      this.emitEvent('rabbithole_detected', {
        topic: rabbitholeEvent.topic,
        rabbitholeEventId: rabbitholeEvent.id,
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
