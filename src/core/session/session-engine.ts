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
  type SessionEventData,
  type SessionState,
  DEFAULT_SESSION_CONFIG,
} from './types';
import type { SessionMetricsCollector } from './metrics-collector';
import type { BranchDetector } from '../analysis/branch-detector';
import type {
  SessionMetricsRepository,
  RecallOutcomeRepository,
} from '../../storage/repositories';
import type { BranchRepository } from '../../storage/repositories';
import { BranchAgent } from './branch-agent';
import { buildBranchContext, buildTrunkContext } from './context-builder';

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
   * Detector for identifying conversational branches (tangents).
   * When provided, enables real-time detection of topic drift.
   */
  private branchDetector: BranchDetector | null = null;

  /** Repository for persisting session-level metrics */
  private metricsRepo: SessionMetricsRepository | null = null;

  /** Repository for persisting individual recall outcomes */
  private recallOutcomeRepo: RecallOutcomeRepository | null = null;

  /** Repository for persisting branch records */
  private branchRepo: BranchRepository | null = null;

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

  // ============================================================================
  // Multi-Branch State
  // ============================================================================

  /**
   * Map of active branch agents, keyed by branchId.
   * Multiple branches can be active concurrently, each with its own agent.
   */
  private branchAgents: Map<string, BranchAgent> = new Map();

  /**
   * Per-branch points recalled count for metrics.
   * Tracks how many recall points were recalled while each branch was active.
   */
  private branchPointsRecalled: Map<string, number> = new Map();

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
    if (deps.branchDetector) {
      this.branchDetector = deps.branchDetector;
    }
    if (deps.metricsRepo) {
      this.metricsRepo = deps.metricsRepo;
    }
    if (deps.recallOutcomeRepo) {
      this.recallOutcomeRepo = deps.recallOutcomeRepo;
    }
    if (deps.branchRepo) {
      this.branchRepo = deps.branchRepo;
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
   * Emits a typed event to the registered listener (if any).
   * The data parameter must match the SessionEventData discriminated union.
   *
   * @param data - Typed event data with discriminant `type` field
   */
  private emitEvent(data: SessionEventData): void {
    if (this.eventListener) {
      this.eventListener({
        type: data.type,
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

    // Reset branch detector state for the new session
    if (this.branchDetector) {
      this.branchDetector.reset();
    }

    // Configure the LLM with the Socratic tutor prompt for the first point
    this.updateLLMPrompt();

    // Emit session started event
    this.emitEvent({
      type: 'session_started',
      sessionId: session.id,
      recallSetId: recallSet.id,
      targetPointCount: duePoints.length,
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

    // Reset branch detector state for the resumed session
    if (this.branchDetector) {
      this.branchDetector.reset();
    }

    // Configure the LLM with the appropriate prompt
    this.updateLLMPrompt();

    // Emit session started event (as a resume)
    this.emitEvent({
      type: 'session_started',
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

    // T13: Removed emitEvent('point_started') — replaced by checklist model from T01.
    // The tutor probes the next unchecked point via prompt, not a discrete event.

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
    this.emitEvent({
      type: 'assistant_message',
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
  async processUserMessage(content: string, branchId?: string): Promise<ProcessMessageResult> {
    this.validateActiveSession();

    // If a branchId is provided, route to the dedicated branch agent
    if (branchId) {
      return this.processBranchMessage(branchId, content);
    }

    // Save the user message
    await this.saveMessage('user', content);

    // Emit user message event
    this.emitEvent({
      type: 'user_message',
      content,
    });

    // === Phase 2: Detect branches after user message ===
    // Check if the user's message indicates a conversational tangent
    await this.detectAndRecordBranch();

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

    // === Phase 2: Check for branch returns after assistant response ===
    // Check if any active branches have concluded (returned to main topic)
    await this.detectBranchReturns();

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

      // T13: Removed emitEvent('point_evaluated') and emitEvent('point_completed').
      // These are replaced by point_recalled (emitted in markPointRecalled) and
      // FSRS updates happen inside markPointRecalled() via recordRecallOutcome().

      // Confidence >= 0.6: point is recalled
      if (evaluation.success && evaluation.confidence >= 0.6) {
        recalledPointIds.push(point.id);

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
   * @param evalResult - The evaluation result from the last evaluateUncheckedPoints() call
   * @returns ProcessMessageResult with a continuation response (not marked completed yet)
   */
  private async handleAllPointsRecalled(evalResult: ContinuousEvalResult): Promise<ProcessMessageResult> {
    const recalledCount = this.getRecalledCount();
    const totalPoints = this.targetPoints.length;

    // Emit the overlay event — frontend will show completion overlay
    this.emitEvent({
      type: 'session_complete_overlay',
      sessionId: this.currentSession!.id,
      recalledCount,
      totalPoints,
      message: "You've covered everything!",
      canContinue: true,
    });

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

  // ============================================================================
  // Multi-Branch Methods
  // ============================================================================

  /**
   * Activates a branch by creating a dedicated BranchAgent with frozen parent context.
   *
   * Called when the user engages with a detected branch tab. Loads the branch
   * record and all sibling branches from the DB, builds the parent context
   * snapshot using the context builder, creates a BranchAgent, and generates
   * the opening message.
   *
   * @param branchId - The ID of the branch to activate
   * @returns The agent's opening message to display to the user
   * @throws Error if the branch already has an active agent, or the branch is not found
   */
  async activateBranch(branchId: string): Promise<string> {
    this.validateActiveSession();

    if (this.branchAgents.has(branchId)) {
      throw new Error(`Branch ${branchId} already has an active agent`);
    }

    // Load branch record from DB
    const branch = await this.branchRepo?.findById(branchId);
    if (!branch) throw new Error(`Branch ${branchId} not found`);

    // Load all branches for this session (needed for context building)
    const allBranches = await this.branchRepo!.findBySessionId(this.currentSession!.id);

    // Build frozen parent context using the context builder.
    // This walks up the ancestry chain from the target branch to the trunk,
    // giving the agent full awareness of the conversation that led here.
    const parentContext = buildBranchContext(
      {
        id: branch.id,
        parentBranchId: branch.parentBranchId,
        branchPointMessageId: branch.branchPointMessageId,
        conversation: branch.conversation as Array<{ id?: string; role: string; content: string }> | null,
      },
      allBranches.map(b => ({
        id: b.id,
        parentBranchId: b.parentBranchId,
        branchPointMessageId: b.branchPointMessageId,
        conversation: b.conversation as Array<{ id?: string; role: string; content: string }> | null,
      })),
      this.messages // trunk messages
    );

    // Create agent with frozen parent context snapshot
    const agent = new BranchAgent({
      topic: branch.topic,
      recallSetName: this.currentRecallSet!.name,
      recallSetDescription: this.currentRecallSet!.description,
      parentContext: parentContext.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    });

    this.branchAgents.set(branchId, agent);
    this.branchPointsRecalled.set(branchId, 0);

    // Update status to active in DB
    await this.branchRepo!.activate(branchId);

    this.emitEvent({ type: 'branch_activated', branchId, topic: branch.topic });

    // Generate and return opening message from the branch agent
    const openingMessage = await agent.generateOpeningMessage();
    return openingMessage;
  }

  /**
   * Closes a branch, persists its conversation, generates a summary, and cleans up.
   *
   * Saves the full conversation to the DB, generates an LLM summary of what was
   * explored, closes the branch record, destroys the agent, and emits events
   * for the UI (branch_closed + branch_summary_injected at the fork point).
   *
   * @param branchId - The ID of the branch to close
   * @returns The generated summary string
   * @throws Error if no active agent exists for the branch
   */
  async closeBranch(branchId: string): Promise<string> {
    const agent = this.branchAgents.get(branchId);
    if (!agent) throw new Error(`No active agent for branch ${branchId}`);

    // Persist conversation to DB before destroying the agent
    const conversation = agent.getConversationHistory();
    await this.branchRepo?.updateConversation(branchId, conversation);

    // Generate a concise LLM summary of what was explored in the branch
    const summary = await this.generateBranchSummary(conversation, agent.getTopic());

    // Close in DB with summary
    await this.branchRepo?.close(branchId, summary);

    // Destroy agent and metrics tracking
    this.branchAgents.delete(branchId);
    this.branchPointsRecalled.delete(branchId);

    this.emitEvent({ type: 'branch_closed', branchId, summary });

    // Emit summary injection event so the UI can display the summary at the branch point
    const branch = await this.branchRepo?.findById(branchId);
    if (branch) {
      this.emitEvent({
        type: 'branch_summary_injected',
        branchId,
        summary,
        branchPointMessageId: branch.branchPointMessageId,
      });
    }

    return summary;
  }

  /**
   * Generates a concise summary of a branch conversation via the LLM.
   *
   * @param conversation - The branch conversation messages
   * @param topic - The branch topic for context
   * @returns A 1-2 sentence summary of what was explored
   */
  private async generateBranchSummary(
    conversation: Array<{ role: string; content: string }>,
    topic: string
  ): Promise<string> {
    const summaryPrompt = `Summarize this tangent exploration about "${topic}" in 1-2 sentences. Focus on what was clarified, discovered, or changed. Be concise unless something directly relevant to the main session was discussed.\n\nConversation:\n${conversation.map(m => `${m.role}: ${m.content}`).join('\n')}`;

    const response = await this.llmClient.complete(summaryPrompt, {
      temperature: 0.3,
      maxTokens: 128,
    });

    return response.text;
  }

  /**
   * Processes a user message within a specific branch.
   *
   * Routes the message to the branch's dedicated BranchAgent. The continuous
   * evaluator still runs silently — recall points can be marked during branch
   * exploration, just without steering feedback.
   *
   * @param branchId - The ID of the branch to send the message to
   * @param content - The user's message content
   * @returns Result containing the agent's response and session status
   * @throws Error if no active agent exists for the branch
   */
  private async processBranchMessage(branchId: string, content: string): Promise<ProcessMessageResult> {
    const agent = this.branchAgents.get(branchId);
    if (!agent) throw new Error(`No active agent for branch ${branchId}`);

    // Run evaluator silently — can still mark points recalled during branches
    const evalResult = await this.evaluateUncheckedPoints();

    const currentCount = this.branchPointsRecalled.get(branchId) ?? 0;
    this.branchPointsRecalled.set(branchId, currentCount + evalResult.recalledPointIds.length);

    for (const pointId of evalResult.recalledPointIds) {
      this.markPointRecalled(pointId);
      const confidence = evalResult.confidencePerPoint.get(pointId) ?? 0.5;
      await this.recordRecallOutcome(pointId, {
        success: true,
        confidence,
        reasoning: `Recalled during branch exploration (confidence: ${confidence})`,
      });
    }

    // Route to the BranchAgent for the actual response
    const response = await agent.generateResponse(content);

    return {
      response,
      completed: false,
      recalledCount: this.getRecalledCount(),
      totalPoints: this.targetPoints.length,
      pointsRecalledThisTurn: evalResult.recalledPointIds,
    };
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
    this.emitEvent({
      type: 'session_paused',
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
   * Extracts a short topic label from recall point content.
   * Takes the first sentence or first 50 characters, whichever is shorter.
   * Used to provide human-readable keywords in point_recalled events.
   */
  private extractPointLabel(pointId: string): string {
    const point = this.targetPoints.find(p => p.id === pointId);
    if (!point) return 'Unknown';
    const content = point.content;
    const firstSentence = content.split(/[.\n?]/)[0].trim();
    return firstSentence.length > 50 ? firstSentence.substring(0, 47) + '...' : firstSentence;
  }

  /**
   * Marks a recall point as recalled. Idempotent — if the point is already recalled, this is a no-op.
   * Also advances currentProbeIndex past this point if it was the current probe target.
   * Emits a point_recalled event with progress data and a short topic label.
   */
  markPointRecalled(pointId: string): void {
    if (this.pointChecklist.get(pointId) !== 'pending') return; // already recalled or unknown ID

    this.pointChecklist.set(pointId, 'recalled');

    this.emitEvent({
      type: 'point_recalled',
      pointId,
      label: this.extractPointLabel(pointId),
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
   * FIX 4: Returns false when the checklist is empty to prevent false-positive
   * completions before the session has loaded any target points.
   */
  allPointsRecalled(): boolean {
    if (this.pointChecklist.size === 0) return false;
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
    this.emitEvent({
      type: 'assistant_message',
      content: response.text,
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

    // Mark all active/detected branches as abandoned on session end
    await this.branchRepo?.markActiveAsAbandoned(this.currentSession!.id);
    // Destroy all branch agents
    this.branchAgents.clear();
    this.branchPointsRecalled.clear();

    // === Phase 2: Finalize and persist session metrics ===
    await this.finalizeAndPersistMetrics();

    // Emit session completed event
    this.emitEvent({
      type: 'session_completed',
      sessionId: this.currentSession!.id,
      summary: {
        sessionId: this.currentSession!.id,
        totalPointsReviewed: this.targetPoints.length,
        successfulRecalls: this.getRecalledCount(),
        recallRate: this.targetPoints.length > 0 ? this.getRecalledCount() / this.targetPoints.length : 1.0,
        durationMs: 0, // Calculated at the WS layer
        branchCount: 0, // Tracked by metrics collector
        recalledPointIds: this.getRecalledPointIds(),
        recalledPointLabels: this.getRecalledPointIds().map(id => this.extractPointLabel(id)),
        engagementScore: 80,
        estimatedCostUsd: 0.05,
      },
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

    // Destroy all active branch agents and clear metrics
    this.branchAgents.clear();
    this.branchPointsRecalled.clear();

    // === Phase 2: Reset metrics collection state ===
    this.currentPointStartIndex = 0;
    if (this.metricsCollector) {
      this.metricsCollector.reset();
    }
    if (this.branchDetector) {
      this.branchDetector.reset();
    }
  }

  // ============================================================================
  // Phase 2: Metrics Collection Helper Methods
  // ============================================================================

  /**
   * Detects and records a new branch (conversational tangent).
   *
   * Called after each user message to check if the conversation has
   * diverged from the current recall topic. If a branch is detected,
   * it is recorded in the database and emitted as an event.
   *
   * @private
   */
  private async detectAndRecordBranch(): Promise<void> {
    // Skip if branch detection is not enabled
    if (!this.branchDetector || !this.currentSession) {
      return;
    }

    const currentPoint = this.getNextProbePoint() ?? this.targetPoints[this.targetPoints.length - 1];
    const lastMessage = this.messages[this.messages.length - 1];
    const branchPointMessageId = lastMessage?.id ?? '';

    // Detect if the conversation has entered a new branch
    const branch = await this.branchDetector.detectBranch(
      this.currentSession.id,
      this.messages,
      currentPoint,
      this.targetPoints,
      branchPointMessageId
    );

    // If a branch was detected, record it
    if (branch) {
      // Persist to database via BranchRepository
      if (this.branchRepo) {
        await this.branchRepo.create({
          id: branch.id,
          sessionId: this.currentSession.id,
          branchPointMessageId: branch.branchPointMessageId,
          topic: branch.topic,
          depth: branch.depth,
          relatedRecallPointIds: branch.relatedRecallPointIds,
          userInitiated: branch.userInitiated,
        });
      }

      // Emit 'branch_detected' so the handler can forward it to the frontend
      this.emitEvent({
        type: 'branch_detected',
        branchId: branch.id,
        topic: branch.topic,
        depth: branch.depth,
      });
    }
  }

  /**
   * Detects when active branches have concluded (returned to main topic).
   *
   * Called after generating tutor responses to check if any active
   * branches have been resolved. Updates the database when returns
   * are detected.
   *
   * @private
   */
  private async detectBranchReturns(): Promise<void> {
    // Skip if branch detection is not enabled
    if (!this.branchDetector || !this.currentSession) {
      return;
    }

    const currentPoint = this.getNextProbePoint() ?? this.targetPoints[this.targetPoints.length - 1];
    const lastMessage = this.messages[this.messages.length - 1];
    const branchPointMessageId = lastMessage?.id ?? '';

    // Detect if any active branches have concluded
    const returnedBranches = await this.branchDetector.detectReturns(
      this.messages,
      currentPoint,
      branchPointMessageId
    );

    // Close each returned branch in the database
    for (const branch of returnedBranches) {
      if (this.branchRepo) {
        await this.branchRepo.close(branch.id, branch.summary ?? '');
      }
    }
  }

  /**
   * Finalizes and persists all session metrics.
   *
   * This method is called when the session completes. It:
   * 1. Closes any active branches as abandoned
   * 2. Calculates final session metrics
   * 3. Persists metrics to the session_metrics table
   * 4. Persists recall outcomes to the recall_outcomes table
   *
   * @private
   */
  private async finalizeAndPersistMetrics(): Promise<void> {
    // Skip if metrics collection is not enabled
    if (!this.metricsCollector || !this.currentSession) {
      return;
    }

    // Close any active branches as abandoned since session is ending
    if (this.branchDetector) {
      this.branchDetector.closeAllActive();
      // Branch abandonment is already handled via branchRepo.markActiveAsAbandoned()
      // in completeSession() — no need to duplicate here.
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
