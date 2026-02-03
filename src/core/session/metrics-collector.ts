/**
 * Session Metrics Collector
 *
 * This module provides the SessionMetricsCollector class which collects and
 * calculates comprehensive session metrics throughout a conversation session.
 * The collector acts as an aggregator for:
 *
 * 1. **Message Timing**: Tracks when each message occurred and latency between messages
 * 2. **Recall Outcomes**: Records evaluation results for each recall point attempted
 * 3. **Rabbithole Events**: Tracks conversational tangents and their resolution
 * 4. **Token Usage**: Monitors input/output token counts for cost calculation
 *
 * The collector coordinates with the rabbithole detector and recall evaluator
 * to build complete session metrics that enable:
 *
 * - Performance analysis and learning insights
 * - Cost tracking and budget management
 * - Engagement scoring and session quality assessment
 * - Progress visualization and reporting
 *
 * @example
 * ```typescript
 * const collector = new SessionMetricsCollector();
 *
 * // Start collecting for a new session
 * collector.startSession('sess_abc123', 'claude-3-5-sonnet-20241022');
 *
 * // Record messages as they occur
 * collector.recordMessage('msg_001', 'user', 150);
 * collector.recordMessage('msg_002', 'assistant', 200, 250, 200);
 *
 * // Record recall outcomes after evaluation
 * collector.recordRecallOutcome('rp_001', evaluation, 0, 3);
 *
 * // Finalize and get complete metrics
 * const metrics = await collector.finalizeSession(session);
 * ```
 */

import type { Session } from '../models';
import type {
  SessionMetrics,
  RabbitholeEvent,
  RecallOutcome,
  TokenUsage,
  MessageTiming,
} from '../models/session-metrics';
import type { EnhancedRecallEvaluation } from '../scoring/types';
import { calculateEngagementScore } from '../models/session-metrics';
import { calculateCost, type ClaudeModel } from '../analytics/token-costs';

/**
 * Threshold in milliseconds for detecting pauses between user messages.
 * If a user takes longer than this to respond, the time is considered
 * "pause time" rather than "active time" for engagement calculation.
 *
 * 5 minutes = 300,000 ms
 */
const PAUSE_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Default model to use for cost calculations when not specified.
 * Uses Claude 3.5 Sonnet as the default since it's the most commonly
 * used model for Socratic tutoring sessions.
 */
const DEFAULT_MODEL: ClaudeModel = 'claude-3-5-sonnet-20241022';

/**
 * Collects and calculates session metrics throughout a conversation session.
 *
 * This class acts as the central aggregator for all session metrics. It tracks
 * data during the session (message timings, token usage) and stores evaluation
 * results as they become available. At session end, it calculates derived
 * metrics like engagement score, recall rates, and response time averages.
 *
 * **Usage Pattern:**
 * 1. Call `startSession()` when beginning a new session
 * 2. Call `recordMessage()` for each message in the conversation
 * 3. Call `recordRecallOutcome()` after each recall point is evaluated
 * 4. Call `recordRabbithole()` when tangents are detected
 * 5. Call `finalizeSession()` when the session completes
 *
 * The collector maintains internal state and should be reused across messages
 * within a single session, then reset for the next session.
 */
export class SessionMetricsCollector {
  /** ID of the current session being tracked */
  private sessionId: string | null = null;

  /** All message timings recorded during the session */
  private messageTimings: MessageTiming[] = [];

  /** Recall evaluation outcomes for each recall point */
  private recallOutcomes: RecallOutcome[] = [];

  /** Rabbithole (tangent) events detected during the session */
  private rabbitholes: RabbitholeEvent[] = [];

  /** Cumulative input tokens used across all LLM calls */
  private totalInputTokens: number = 0;

  /** Cumulative output tokens generated across all LLM calls */
  private totalOutputTokens: number = 0;

  /** The Claude model being used (for cost calculation) */
  private model: ClaudeModel = DEFAULT_MODEL;

  /** Timestamp of the most recent message (for latency calculation) */
  private lastMessageTime: Date | null = null;

  /**
   * Accumulated pause time in milliseconds.
   * Time is considered "pause time" when a user takes > 5 min to respond.
   * This is subtracted from total duration to calculate "active time".
   */
  private pauseTimeMs: number = 0;

  /**
   * Initializes the collector for a new session.
   *
   * This resets all internal state and prepares the collector to track
   * a new session. Must be called before recording any messages or outcomes.
   *
   * @param sessionId - Unique identifier for the session
   * @param model - Claude model being used (optional, defaults to claude-3-5-sonnet-20241022)
   *
   * @example
   * ```typescript
   * collector.startSession('sess_abc123');
   * // Or with a specific model
   * collector.startSession('sess_abc123', 'claude-3-5-haiku-20241022');
   * ```
   */
  startSession(sessionId: string, model?: string): void {
    this.sessionId = sessionId;
    this.messageTimings = [];
    this.recallOutcomes = [];
    this.rabbitholes = [];
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    this.lastMessageTime = null;
    this.pauseTimeMs = 0;

    // Set the model if provided and valid, otherwise use default
    if (model && this.isValidClaudeModel(model)) {
      this.model = model as ClaudeModel;
    } else {
      this.model = DEFAULT_MODEL;
    }
  }

  /**
   * Records a message and its timing information.
   *
   * This method should be called for every message in the session (user,
   * assistant, and system messages). It:
   * 1. Calculates latency from the previous message
   * 2. Tracks token usage for cost calculation
   * 3. Detects pause time when user responses are delayed
   *
   * **Pause Detection:**
   * If a user message comes more than 5 minutes after the previous message,
   * the excess time is counted as "pause time" rather than active engagement.
   * This allows calculating "active time" for more accurate engagement metrics.
   *
   * @param messageId - Unique identifier for the message
   * @param role - Who sent the message ('user', 'assistant', or 'system')
   * @param tokenCount - Number of tokens in the message content
   * @param inputTokens - For assistant messages, the input tokens used in the LLM call
   * @param outputTokens - For assistant messages, the output tokens generated
   *
   * @example
   * ```typescript
   * // Record a user message
   * collector.recordMessage('msg_001', 'user', 45);
   *
   * // Record an assistant message with LLM token usage
   * collector.recordMessage('msg_002', 'assistant', 200, 1500, 200);
   * ```
   */
  recordMessage(
    _messageId: string,
    role: 'user' | 'assistant' | 'system',
    _tokenCount: number,
    inputTokens?: number,
    outputTokens?: number
  ): void {
    const now = new Date();

    // Calculate latency from the previous message
    // First message has null latency since there's nothing to measure from
    let latencyMs: number | null = null;
    if (this.lastMessageTime !== null) {
      latencyMs = now.getTime() - this.lastMessageTime.getTime();

      // Detect pauses: if user took > 5 min to respond, count excess as pause time
      // This captures scenarios where the user stepped away (AFK, distracted, etc.)
      // Only count pauses before user messages - assistant latency is system latency
      if (role === 'user' && latencyMs > PAUSE_THRESHOLD_MS) {
        // Count time beyond the threshold as pause time
        // e.g., if user took 7 min, only 2 min is counted as pause (7 - 5 = 2)
        this.pauseTimeMs += latencyMs - PAUSE_THRESHOLD_MS;
      }
    }

    // Create the timing record
    const timing: MessageTiming = {
      messageIndex: this.messageTimings.length,
      timestamp: now,
      latencyMs,
    };

    this.messageTimings.push(timing);

    // Track token usage for cost calculation
    // For assistant messages, we track the LLM call's input/output tokens
    // These represent the actual API usage, not just message content length
    if (inputTokens !== undefined) {
      this.totalInputTokens += inputTokens;
    }
    if (outputTokens !== undefined) {
      this.totalOutputTokens += outputTokens;
    }

    // Update last message time for next latency calculation
    this.lastMessageTime = now;
  }

  /**
   * Records the evaluation result for a recall point.
   *
   * This method converts an EnhancedRecallEvaluation (from the evaluator)
   * into a RecallOutcome for the metrics. It calculates the time spent
   * on this recall point based on the message range timings.
   *
   * @param recallPointId - ID of the recall point that was evaluated
   * @param evaluation - The evaluation result from the RecallEvaluator
   * @param messageIndexStart - Index of the first message discussing this recall point
   * @param messageIndexEnd - Index of the last message (inclusive) for this recall point
   *
   * @example
   * ```typescript
   * const evaluation: EnhancedRecallEvaluation = {
   *   success: true,
   *   confidence: 0.85,
   *   reasoning: 'User demonstrated good recall...',
   *   keyDemonstratedConcepts: ['date', 'significance'],
   *   missedConcepts: ['specific terms'],
   *   suggestedRating: 'good'
   * };
   *
   * collector.recordRecallOutcome('rp_001', evaluation, 0, 5);
   * ```
   */
  recordRecallOutcome(
    recallPointId: string,
    evaluation: EnhancedRecallEvaluation,
    messageIndexStart: number,
    messageIndexEnd: number
  ): void {
    // Calculate time spent on this recall point from message timings
    // This sums the latencies of all messages in the range
    const durationMs = this.calculateDurationForMessageRange(
      messageIndexStart,
      messageIndexEnd
    );

    // Convert the evaluation to a RecallOutcome
    const outcome: RecallOutcome = {
      recallPointId,
      success: evaluation.success,
      confidence: evaluation.confidence,
      messageRange: {
        start: messageIndexStart,
        end: messageIndexEnd,
      },
      durationMs,
    };

    this.recallOutcomes.push(outcome);
  }

  /**
   * Records a rabbithole (conversational tangent) event.
   *
   * Rabbitholes are detected by the RabbitholeDetector when the conversation
   * diverges from the current recall topic. This method records the event
   * for inclusion in the final session metrics.
   *
   * @param event - The rabbithole event to record
   *
   * @example
   * ```typescript
   * const rabbithole: RabbitholeEvent = {
   *   id: 'rh_001',
   *   topic: 'Economic impacts of reparations',
   *   triggerMessageIndex: 5,
   *   returnMessageIndex: null,
   *   depth: 1,
   *   relatedRecallPointIds: ['rp_001'],
   *   userInitiated: true,
   *   status: 'active'
   * };
   *
   * collector.recordRabbithole(rabbithole);
   * ```
   */
  recordRabbithole(event: RabbitholeEvent): void {
    this.rabbitholes.push(event);
  }

  /**
   * Updates a rabbithole when the conversation returns to the main topic.
   *
   * When a rabbithole concludes (conversation returns to main topic), this
   * method updates the rabbithole record with the return message index and
   * changes the status to 'returned'.
   *
   * @param rabbitholeId - ID of the rabbithole to update
   * @param returnIndex - Message index where conversation returned to topic
   *
   * @example
   * ```typescript
   * // Mark rabbithole as returned when conversation gets back on track
   * collector.updateRabbitholeReturn('rh_001', 9);
   * ```
   */
  updateRabbitholeReturn(rabbitholeId: string, returnIndex: number): void {
    const rabbithole = this.rabbitholes.find((rh) => rh.id === rabbitholeId);
    if (rabbithole) {
      rabbithole.returnMessageIndex = returnIndex;
      rabbithole.status = 'returned';
    }
  }

  /**
   * Finalizes the session and calculates all derived metrics.
   *
   * This method computes the complete SessionMetrics by:
   * 1. Calculating total and active duration
   * 2. Computing response time averages
   * 3. Calculating recall success rates
   * 4. Summarizing rabbithole statistics
   * 5. Computing token usage and costs
   * 6. Calculating the engagement score
   *
   * Any rabbitholes still in 'active' status are marked as 'abandoned'
   * since the session is ending without them being resolved.
   *
   * @param session - The Session entity for additional context (e.g., recall point count)
   * @returns Complete SessionMetrics ready for storage and analysis
   *
   * @example
   * ```typescript
   * const metrics = await collector.finalizeSession(session);
   * console.log(`Engagement: ${metrics.engagementScore}/100`);
   * console.log(`Cost: $${metrics.costUsd.toFixed(4)}`);
   * ```
   */
  async finalizeSession(session: Session): Promise<SessionMetrics> {
    // Mark any still-active rabbitholes as abandoned
    // If the session ends while in a tangent, it means we never returned
    this.rabbitholes.forEach((rh) => {
      if (rh.status === 'active') {
        rh.status = 'abandoned';
      }
    });

    // Calculate total session duration
    // Duration is from first message to last message timestamp
    const totalDurationMs = this.calculateTotalDuration();

    // Calculate active time (total minus pauses > 5 min)
    // This gives a more accurate picture of actual engagement time
    const activeTimeMs = Math.max(0, totalDurationMs - this.pauseTimeMs);

    // Calculate recall statistics for average time calculation
    const recallPointsAttempted = this.recallOutcomes.length;

    // Calculate average time per recall point
    // This tells us how long users typically spend on each point
    // Uses active time (excluding pauses) for more accurate engagement measurement
    const averageRecallTimeMs =
      recallPointsAttempted > 0 ? activeTimeMs / recallPointsAttempted : 0;

    // Build token usage summary
    const tokenUsage: TokenUsage = {
      inputTokens: this.totalInputTokens,
      outputTokens: this.totalOutputTokens,
      totalTokens: this.totalInputTokens + this.totalOutputTokens,
    };

    // Calculate cost using the model's pricing
    const costUsd = calculateCost(
      this.model,
      this.totalInputTokens,
      this.totalOutputTokens
    );

    // Build the metrics object (without engagement score yet)
    // Note: Additional derived metrics like avgUserResponseTimeMs, overallRecallRate,
    // avgConfidence, totalRabbitholeTimeMs, etc. can be computed from the raw data
    // stored in recallOutcomes, messageTimings, and rabbitholes arrays.
    // These are available through the private helper methods for future use.
    const metrics: SessionMetrics = {
      sessionId: this.sessionId || session.id,
      recallOutcomes: [...this.recallOutcomes],
      rabbitholes: [...this.rabbitholes],
      tokenUsage,
      costUsd,
      messageTimings: [...this.messageTimings],
      totalDurationMs,
      averageRecallTimeMs,
      engagementScore: 0, // Placeholder, calculated below
      computedAt: new Date(),
    };

    // Calculate engagement score using the helper function
    // This considers recall success, consistency, rabbithole management, and completion
    metrics.engagementScore = calculateEngagementScore(metrics);

    return metrics;
  }

  /**
   * Returns current statistics for debugging and progress tracking.
   *
   * This method provides a snapshot of the collector's current state,
   * useful for debugging and displaying progress during a session.
   *
   * @returns Object with current message count, outcome count, active rabbitholes, and tokens
   *
   * @example
   * ```typescript
   * const stats = collector.getCurrentStats();
   * console.log(`Messages: ${stats.messagesRecorded}`);
   * console.log(`Outcomes: ${stats.outcomesRecorded}`);
   * console.log(`Active rabbitholes: ${stats.activeRabbitholes}`);
   * console.log(`Tokens used: ${stats.tokensUsed}`);
   * ```
   */
  getCurrentStats(): {
    messagesRecorded: number;
    outcomesRecorded: number;
    activeRabbitholes: number;
    tokensUsed: number;
  } {
    return {
      messagesRecorded: this.messageTimings.length,
      outcomesRecorded: this.recallOutcomes.length,
      activeRabbitholes: this.rabbitholes.filter((rh) => rh.status === 'active')
        .length,
      tokensUsed: this.totalInputTokens + this.totalOutputTokens,
    };
  }

  /**
   * Returns extended metrics that can be derived from the collected data.
   *
   * These metrics complement the SessionMetrics returned by finalizeSession()
   * and provide additional insight into session dynamics:
   *
   * - Response time analysis for identifying engagement patterns
   * - Recall success statistics for learning analytics
   * - Rabbithole metrics for conversation flow analysis
   *
   * @returns Object with extended metric calculations
   *
   * @example
   * ```typescript
   * const extended = collector.getExtendedMetrics();
   * console.log(`User avg response: ${extended.avgUserResponseTimeMs}ms`);
   * console.log(`Recall rate: ${(extended.overallRecallRate * 100).toFixed(1)}%`);
   * console.log(`Rabbithole time: ${extended.totalRabbitholeTimeMs}ms`);
   * ```
   */
  getExtendedMetrics(): {
    avgUserResponseTimeMs: number;
    avgAssistantResponseTimeMs: number;
    recallPointsAttempted: number;
    recallPointsSuccessful: number;
    recallPointsFailed: number;
    overallRecallRate: number;
    avgConfidence: number;
    totalMessages: number;
    rabbitholeCount: number;
    totalRabbitholeTimeMs: number;
    avgRabbitholeDepth: number;
    activeTimeMs: number;
  } {
    const totalDurationMs = this.calculateTotalDuration();
    const activeTimeMs = Math.max(0, totalDurationMs - this.pauseTimeMs);

    const recallPointsAttempted = this.recallOutcomes.length;
    const recallPointsSuccessful = this.recallOutcomes.filter(
      (o) => o.success
    ).length;
    const recallPointsFailed = recallPointsAttempted - recallPointsSuccessful;

    return {
      avgUserResponseTimeMs: this.calculateAverageResponseTime('user'),
      avgAssistantResponseTimeMs: this.calculateAverageResponseTime('assistant'),
      recallPointsAttempted,
      recallPointsSuccessful,
      recallPointsFailed,
      overallRecallRate:
        recallPointsAttempted > 0
          ? recallPointsSuccessful / recallPointsAttempted
          : 0,
      avgConfidence: this.calculateAverageConfidence(),
      totalMessages: this.messageTimings.length,
      rabbitholeCount: this.rabbitholes.length,
      totalRabbitholeTimeMs: this.calculateTotalRabbitholeTime(),
      avgRabbitholeDepth: this.calculateAverageRabbitholeDepth(),
      activeTimeMs,
    };
  }

  /**
   * Resets all internal state for reuse with a new session.
   *
   * This method clears all collected data, preparing the collector
   * for tracking a completely new session.
   *
   * @example
   * ```typescript
   * // After finalizing a session, reset for the next one
   * collector.reset();
   * collector.startSession('sess_new_001');
   * ```
   */
  reset(): void {
    this.sessionId = null;
    this.messageTimings = [];
    this.recallOutcomes = [];
    this.rabbitholes = [];
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    this.model = DEFAULT_MODEL;
    this.lastMessageTime = null;
    this.pauseTimeMs = 0;
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Validates that a model string is a known ClaudeModel.
   *
   * @param model - The model string to validate
   * @returns True if the model is a valid ClaudeModel
   */
  private isValidClaudeModel(model: string): boolean {
    const validModels: ClaudeModel[] = [
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307',
      'claude-3-5-sonnet-20240620',
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
    ];
    return validModels.includes(model as ClaudeModel);
  }

  /**
   * Calculates the duration in milliseconds for a range of messages.
   *
   * This sums the latencies of all messages from start to end (inclusive).
   * Used to determine how long was spent discussing a particular recall point.
   *
   * @param startIndex - First message index in the range
   * @param endIndex - Last message index in the range (inclusive)
   * @returns Total duration in milliseconds
   */
  private calculateDurationForMessageRange(
    startIndex: number,
    endIndex: number
  ): number {
    // Clamp indices to valid range
    const start = Math.max(0, startIndex);
    const end = Math.min(this.messageTimings.length - 1, endIndex);

    // If range is invalid, return 0
    if (start > end || end < 0) {
      return 0;
    }

    // Sum latencies for messages in the range (excluding the first message's null latency)
    let duration = 0;
    for (let i = start; i <= end; i++) {
      const timing = this.messageTimings[i];
      if (timing && timing.latencyMs !== null) {
        duration += timing.latencyMs;
      }
    }

    // If we have timestamp data, we can also calculate from timestamps
    // This is more accurate when the range starts at index 0
    if (start === 0 && this.messageTimings[start] && this.messageTimings[end]) {
      const startTime = this.messageTimings[start].timestamp.getTime();
      const endTime = this.messageTimings[end].timestamp.getTime();
      return Math.max(0, endTime - startTime);
    }

    return duration;
  }

  /**
   * Calculates the total session duration from message timestamps.
   *
   * Duration is measured from the first message timestamp to the last.
   * Returns 0 if there are fewer than 2 messages.
   *
   * @returns Total duration in milliseconds
   */
  private calculateTotalDuration(): number {
    if (this.messageTimings.length < 2) {
      return 0;
    }

    const firstMessage = this.messageTimings[0];
    const lastMessage = this.messageTimings[this.messageTimings.length - 1];

    return lastMessage.timestamp.getTime() - firstMessage.timestamp.getTime();
  }

  /**
   * Calculates the average response time for messages of a specific role.
   *
   * This helps identify:
   * - User response time: How long users take to think and respond
   * - Assistant response time: LLM latency for generating responses
   *
   * The role is inferred from message index patterns:
   * - Even indices (0, 2, 4, ...): Typically assistant messages
   * - Odd indices (1, 3, 5, ...): Typically user messages
   *
   * Note: This is a simplification. In practice, the actual message roles
   * would be tracked alongside timings for perfect accuracy.
   *
   * @param role - 'user' or 'assistant'
   * @returns Average response time in milliseconds, or 0 if no data
   */
  private calculateAverageResponseTime(
    role: 'user' | 'assistant'
  ): number {
    // In a typical conversation pattern:
    // Index 0: System message (setup)
    // Index 1: Assistant (greeting/question)
    // Index 2: User (response)
    // Index 3: Assistant (follow-up)
    // Index 4: User (response)
    // ... and so on
    //
    // So user messages are at even indices (2, 4, 6, ...)
    // And assistant messages are at odd indices (1, 3, 5, ...)
    // We determine role by checking if index mod 2 matches expected pattern

    // Collect latencies for the specified role
    const latencies: number[] = [];

    for (let i = 1; i < this.messageTimings.length; i++) {
      const timing = this.messageTimings[i];
      if (timing.latencyMs === null) continue;

      // Determine role based on typical conversation pattern
      // User messages typically have even indices (2, 4, 6, ...)
      // Assistant messages typically have odd indices (1, 3, 5, ...)
      const isUserMessage = i % 2 === 0;

      if ((role === 'user' && isUserMessage) || (role === 'assistant' && !isUserMessage)) {
        latencies.push(timing.latencyMs);
      }
    }

    // Calculate average, return 0 if no data
    if (latencies.length === 0) {
      return 0;
    }

    const sum = latencies.reduce((total, latency) => total + latency, 0);
    return Math.round(sum / latencies.length);
  }

  /**
   * Calculates the average confidence score across all recall outcomes.
   *
   * This provides insight into how certain the evaluations were:
   * - High average (> 0.8): Clear recall outcomes, well-designed recall points
   * - Medium average (0.6 - 0.8): Normal variation in recall quality
   * - Low average (< 0.6): May indicate ambiguous recall points or evaluation issues
   *
   * @returns Average confidence from 0 to 1, or 0 if no outcomes recorded
   */
  private calculateAverageConfidence(): number {
    if (this.recallOutcomes.length === 0) {
      return 0;
    }

    const totalConfidence = this.recallOutcomes.reduce(
      (sum, outcome) => sum + outcome.confidence,
      0
    );

    return totalConfidence / this.recallOutcomes.length;
  }

  /**
   * Calculates the total time spent in rabbitholes.
   *
   * For each rabbithole, calculates the time from trigger message to either:
   * - Return message (if resolved)
   * - Last message in session (if abandoned)
   *
   * This metric helps identify how much session time was spent on tangents
   * vs. focused recall practice.
   *
   * @returns Total rabbithole time in milliseconds
   */
  private calculateTotalRabbitholeTime(): number {
    let totalTime = 0;

    for (const rabbithole of this.rabbitholes) {
      const startIndex = rabbithole.triggerMessageIndex;
      const endIndex =
        rabbithole.returnMessageIndex !== null
          ? rabbithole.returnMessageIndex
          : this.messageTimings.length - 1;

      // Calculate duration for this rabbithole's message range
      totalTime += this.calculateDurationForMessageRange(startIndex, endIndex);
    }

    return totalTime;
  }

  /**
   * Calculates the average depth of rabbitholes in the session.
   *
   * Depth indicates how "nested" tangents got:
   * - Depth 1: Direct tangent from main topic
   * - Depth 2: Tangent within a tangent
   * - Depth 3: Maximum tracked (deeper tangents are rare)
   *
   * Higher average depth may indicate:
   * - Complex topics that naturally branch
   * - User curiosity leading to exploration
   * - Session structure issues needing attention
   *
   * @returns Average depth (1-3 scale), or 0 if no rabbitholes
   */
  private calculateAverageRabbitholeDepth(): number {
    if (this.rabbitholes.length === 0) {
      return 0;
    }

    const totalDepth = this.rabbitholes.reduce((sum, rh) => sum + rh.depth, 0);
    return totalDepth / this.rabbitholes.length;
  }
}
