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
 * 3. **Recall Evaluation**: Monitors conversation for evaluation triggers, assesses
 *    recall success using LLM-powered evaluation.
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
 *                                    [automatic evaluation when triggered]
 *                                               |
 *                                               v
 *                                    [advance to next point or complete]
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
  DEFAULT_SESSION_CONFIG,
  EVALUATION_TRIGGER_PHRASES,
} from './types';

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

  /** Index of the current recall point being discussed (0-based) */
  private currentPointIndex: number = 0;

  /** Messages in the current session, loaded from DB and kept in sync */
  private messages: SessionMessage[] = [];

  /** Count of messages exchanged for the current recall point */
  private currentPointMessageCount: number = 0;

  /** Optional event listener for session events */
  private eventListener?: (event: SessionEvent) => void;

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
    // Assign dependencies
    this.scheduler = deps.scheduler;
    this.evaluator = deps.evaluator;
    this.llmClient = deps.llmClient;
    this.recallSetRepo = deps.recallSetRepo;
    this.recallPointRepo = deps.recallPointRepo;
    this.sessionRepo = deps.sessionRepo;
    this.messageRepo = deps.messageRepo;

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
    this.currentPointIndex = 0;
    this.messages = [];
    this.currentPointMessageCount = 0;

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

    // Determine current point index by analyzing message history
    // For simplicity, we start from the beginning if resuming
    // A more sophisticated implementation could track progress in the session
    this.currentPointIndex = 0;
    this.currentPointMessageCount = existingMessages.length;

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

    // Emit point started event
    this.emitEvent('point_started', {
      pointIndex: this.currentPointIndex,
      pointId: this.targetPoints[this.currentPointIndex].id,
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

    // Save the assistant message to the database
    await this.saveMessage('assistant', response.text);

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
   * 2. Checks for evaluation triggers (phrases or message count)
   * 3. Either evaluates and advances, or generates a follow-up response
   *
   * @param content - The user's message content
   * @returns Result containing the response and session status
   * @throws Error if no session is active
   *
   * @example
   * ```typescript
   * const result = await engine.processUserMessage(userInput);
   * console.log('Tutor:', result.response);
   *
   * if (result.pointAdvanced) {
   *   console.log(`Now on point ${result.currentPointIndex + 1} of ${result.totalPoints}`);
   * }
   *
   * if (result.completed) {
   *   console.log('Session complete!');
   * }
   * ```
   */
  async processUserMessage(content: string): Promise<ProcessMessageResult> {
    this.validateActiveSession();

    // Save the user message
    await this.saveMessage('user', content);
    this.currentPointMessageCount++;

    // Emit user message event
    this.emitEvent('user_message', {
      content,
      messageCount: this.currentPointMessageCount,
    });

    // Check if we should trigger evaluation
    const shouldEvaluate =
      this.shouldTriggerEvaluation(content) ||
      this.currentPointMessageCount >= this.config.maxMessagesPerPoint;

    // If evaluation is triggered, evaluate and potentially advance
    if (shouldEvaluate) {
      return this.evaluateAndAdvance();
    }

    // Check for auto-evaluation threshold
    if (this.currentPointMessageCount >= this.config.autoEvaluateAfter) {
      // Do a "soft" evaluation check - only advance if clearly successful
      const evaluation = await this.evaluateCurrentPoint();
      if (evaluation.success && evaluation.confidence >= 0.7) {
        return this.advanceToNextPoint(evaluation);
      }
      // Otherwise, continue the conversation
    }

    // Generate a follow-up response from the tutor
    const response = await this.generateTutorResponse();

    return {
      response,
      completed: false,
      pointAdvanced: false,
      currentPointIndex: this.currentPointIndex,
      totalPoints: this.targetPoints.length,
    };
  }

  /**
   * Manually triggers evaluation and advancement.
   *
   * Use this when you want to force an evaluation, regardless of
   * trigger phrases or message count.
   *
   * @returns Result containing the response and session status
   * @throws Error if no session is active
   *
   * @example
   * ```typescript
   * // User explicitly requests to move on
   * if (userRequestedNext) {
   *   const result = await engine.triggerEvaluation();
   * }
   * ```
   */
  async triggerEvaluation(): Promise<ProcessMessageResult> {
    this.validateActiveSession();
    return this.evaluateAndAdvance();
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
   * @returns Object with current session details, or null if no session
   */
  getSessionState(): {
    session: Session;
    recallSet: RecallSet;
    currentPointIndex: number;
    totalPoints: number;
    currentPoint: RecallPoint;
    messageCount: number;
  } | null {
    if (!this.currentSession || !this.currentRecallSet) {
      return null;
    }

    return {
      session: this.currentSession,
      recallSet: this.currentRecallSet,
      currentPointIndex: this.currentPointIndex,
      totalPoints: this.targetPoints.length,
      currentPoint: this.targetPoints[this.currentPointIndex],
      messageCount: this.messages.length,
    };
  }

  /**
   * Checks if the user message contains evaluation trigger phrases.
   *
   * These phrases indicate the user believes they understand the material
   * and are ready to move on. The actual evaluation may still determine
   * they need more practice.
   *
   * @param userMessage - The user's message to check
   * @returns true if the message contains trigger phrases
   */
  private shouldTriggerEvaluation(userMessage: string): boolean {
    const lowerMessage = userMessage.toLowerCase();

    return EVALUATION_TRIGGER_PHRASES.some((phrase) =>
      lowerMessage.includes(phrase)
    );
  }

  /**
   * Evaluates the current recall point and advances to the next.
   *
   * This method:
   * 1. Evaluates the user's recall using the LLM evaluator
   * 2. Determines the appropriate FSRS rating based on evaluation
   * 3. Updates the recall point's FSRS state
   * 4. Advances to the next point or completes the session
   *
   * @returns Result with response and session status
   */
  private async evaluateAndAdvance(): Promise<ProcessMessageResult> {
    // Evaluate the current recall
    const evaluation = await this.evaluateCurrentPoint();

    // Emit evaluation event
    this.emitEvent('point_evaluated', {
      pointId: this.targetPoints[this.currentPointIndex].id,
      success: evaluation.success,
      confidence: evaluation.confidence,
      reasoning: evaluation.reasoning,
    });

    return this.advanceToNextPoint(evaluation);
  }

  /**
   * Evaluates whether the user has demonstrated recall of the current point.
   *
   * Uses the RecallEvaluator to analyze the conversation and determine
   * if the user successfully recalled the target information.
   *
   * @returns The evaluation result with success, confidence, and reasoning
   */
  private async evaluateCurrentPoint(): Promise<RecallEvaluation> {
    const currentPoint = this.targetPoints[this.currentPointIndex];

    // Use the evaluator to assess recall from the conversation
    const evaluation = await this.evaluator.evaluate(
      currentPoint,
      this.messages
    );

    return evaluation;
  }

  /**
   * Advances to the next recall point or completes the session.
   *
   * This method:
   * 1. Determines the FSRS rating from the evaluation
   * 2. Updates the recall point's scheduling state
   * 3. Records the recall attempt in history
   * 4. Either advances to next point or completes session
   *
   * @param evaluation - The evaluation result from the current point
   * @returns Result with response and session status
   */
  private async advanceToNextPoint(
    evaluation: RecallEvaluation
  ): Promise<ProcessMessageResult> {
    const currentPoint = this.targetPoints[this.currentPointIndex];

    // Map evaluation to FSRS rating
    const rating = this.evaluationToRating(evaluation);

    // Calculate new FSRS state
    const newState = this.scheduler.schedule(currentPoint.fsrsState, rating);

    // Update the recall point's FSRS state in the database
    await this.recallPointRepo.updateFSRSState(currentPoint.id, newState);

    // Record the recall attempt in history
    await this.recallPointRepo.addRecallAttempt(currentPoint.id, {
      timestamp: new Date(),
      success: evaluation.success,
      latencyMs: 0, // We don't track latency in conversational recall
    });

    // Emit point completed event
    this.emitEvent('point_completed', {
      pointId: currentPoint.id,
      rating,
      newDueDate: newState.due,
      success: evaluation.success,
    });

    // Check if there are more points to review
    const hasMorePoints = this.currentPointIndex < this.targetPoints.length - 1;

    if (hasMorePoints) {
      // Advance to the next point
      this.currentPointIndex++;
      this.currentPointMessageCount = 0;

      // Update the LLM prompt for the new point
      this.updateLLMPrompt();

      // Generate transition message and opening for next point
      const transitionResponse = await this.generateTransitionMessage(
        evaluation,
        true
      );

      // Emit point started event for the new point
      this.emitEvent('point_started', {
        pointIndex: this.currentPointIndex,
        pointId: this.targetPoints[this.currentPointIndex].id,
        totalPoints: this.targetPoints.length,
      });

      return {
        response: transitionResponse,
        completed: false,
        pointAdvanced: true,
        currentPointIndex: this.currentPointIndex,
        totalPoints: this.targetPoints.length,
      };
    } else {
      // Session complete - all points reviewed
      await this.completeSession();

      // Generate completion message
      const completionResponse = await this.generateCompletionMessage(evaluation);

      return {
        response: completionResponse,
        completed: true,
        pointAdvanced: true,
        currentPointIndex: this.currentPointIndex,
        totalPoints: this.targetPoints.length,
      };
    }
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
   * a follow-up response from the LLM.
   *
   * @returns The tutor's response
   */
  private async generateTutorResponse(): Promise<string> {
    // Build conversation history for the LLM
    const conversationHistory = this.buildConversationHistory();

    // Generate response
    const response = await this.llmClient.complete(conversationHistory, {
      temperature: this.config.tutorTemperature,
      maxTokens: this.config.tutorMaxTokens,
    });

    // Save the assistant message
    await this.saveMessage('assistant', response.text);

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

    // Save the transition message
    await this.saveMessage('assistant', response.text);

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

    // Save the completion message
    await this.saveMessage('assistant', response.text);

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
      currentPointIndex: this.currentPointIndex,
    });

    this.llmClient.setSystemPrompt(prompt);
  }

  /**
   * Saves a message to the database and local cache.
   *
   * @param role - The role of the message sender
   * @param content - The message content
   */
  private async saveMessage(
    role: 'user' | 'assistant',
    content: string
  ): Promise<void> {
    const message = await this.messageRepo.create({
      id: generateId('msg'),
      sessionId: this.currentSession!.id,
      role,
      content,
    });

    // Add to local cache for conversation history
    this.messages.push(message);
  }

  /**
   * Marks the current session as completed.
   */
  private async completeSession(): Promise<void> {
    await this.sessionRepo.complete(this.currentSession!.id);

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
   */
  private resetState(): void {
    this.currentSession = null;
    this.currentRecallSet = null;
    this.targetPoints = [];
    this.currentPointIndex = 0;
    this.messages = [];
    this.currentPointMessageCount = 0;
    this.llmClient.setSystemPrompt(undefined);
  }
}
