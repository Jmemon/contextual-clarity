/**
 * Session Metrics Domain Types
 *
 * This module defines comprehensive metrics for tracking and analyzing
 * recall session performance. These metrics enable:
 *
 * 1. Performance Analytics - Track recall success rates, timing patterns, and engagement
 * 2. Cost Tracking - Monitor token usage and API costs across sessions
 * 3. Conversation Analysis - Identify patterns like "rabbitholes" (tangential discussions)
 * 4. Progress Visualization - Lightweight summaries for dashboard views
 *
 * Session metrics are computed after a session completes and stored for
 * historical analysis. They form the foundation for learning insights,
 * progress reports, and system optimization.
 *
 * This module contains only pure TypeScript types and helper functions
 * with no external runtime dependencies.
 */

/**
 * Granular recall outcome for a single recall point within a session.
 *
 * This captures the detailed result of attempting to recall a specific
 * piece of information, including whether recall was successful, how
 * confident the system is in that assessment, and timing information.
 *
 * @example
 * ```typescript
 * const outcome: RecallOutcome = {
 *   recallPointId: 'rp_treaty_versailles_001',
 *   success: true,
 *   confidence: 0.85,
 *   messageRange: { start: 3, end: 8 },
 *   durationMs: 45000,
 * };
 * ```
 */
export interface RecallOutcome {
  /**
   * ID of the recall point that was tested.
   * Links back to the RecallPoint being assessed.
   */
  recallPointId: string;

  /**
   * Whether the user successfully demonstrated recall.
   * Determined by the RecallEvaluator after analyzing the conversation.
   */
  success: boolean;

  /**
   * Confidence in the success determination (0.0 to 1.0).
   * Lower values indicate ambiguous cases where recall success was unclear.
   */
  confidence: number;

  /**
   * Range of message indices where this recall attempt occurred.
   * Allows extracting the specific conversation segment for this recall point.
   * - start: Index of first message discussing this recall point
   * - end: Index of last message (inclusive) in this recall discussion
   */
  messageRange: {
    start: number;
    end: number;
  };

  /**
   * Time in milliseconds spent on this specific recall point.
   * Calculated from timestamps of messages in the messageRange.
   */
  durationMs: number;
}

/**
 * Status of a rabbithole (conversational tangent) within a session.
 *
 * - 'active': Currently in the tangent, hasn't returned yet
 * - 'returned': Successfully returned to the main recall topic
 * - 'abandoned': Tangent was never resolved (session ended or gave up)
 */
export type RabbitholeStatus = 'active' | 'returned' | 'abandoned';

/**
 * Represents a conversational tangent ("rabbithole") during a recall session.
 *
 * Rabbitholes occur when the conversation diverges from the current recall
 * point into a related but distinct topic. These can be valuable learning
 * opportunities but may also indicate:
 *
 * - User confusion requiring clarification
 * - Natural curiosity leading to deeper exploration
 * - Potential issues with recall point scope/clarity
 *
 * Tracking rabbitholes helps identify patterns and optimize session flow.
 *
 * @example
 * ```typescript
 * const rabbithole: RabbitholeEvent = {
 *   id: 'rh_001',
 *   topic: 'Economic impacts of reparations',
 *   triggerMessageIndex: 5,
 *   returnMessageIndex: 9,
 *   depth: 1,
 *   relatedRecallPointIds: ['rp_treaty_versailles_001'],
 *   userInitiated: true,
 *   status: 'returned',
 * };
 * ```
 */
export interface RabbitholeEvent {
  /**
   * Unique identifier for this rabbithole event.
   * Format: typically prefixed UUID (e.g., 'rh_001')
   */
  id: string;

  /**
   * Brief description of the tangent topic.
   * Summarizes what the conversation diverged to discuss.
   */
  topic: string;

  /**
   * Index of the message that triggered the tangent.
   * Points to the message where the conversation started to diverge.
   */
  triggerMessageIndex: number;

  /**
   * Index of the message where conversation returned to main topic.
   * Null if the tangent is still active or was abandoned.
   */
  returnMessageIndex: number | null;

  /**
   * Nesting depth of the rabbithole (1-3 scale).
   * - 1: Direct tangent from main topic
   * - 2: Tangent within a tangent
   * - 3: Maximum tracked depth (deeper nesting is capped at 3)
   */
  depth: 1 | 2 | 3;

  /**
   * IDs of recall points that relate to this tangent.
   * Helps identify which recall topics tend to spawn tangential discussions.
   */
  relatedRecallPointIds: string[];

  /**
   * Whether the user initiated this tangent (true) or the AI did (false).
   * User-initiated tangents often indicate genuine curiosity or confusion.
   */
  userInitiated: boolean;

  /**
   * Current status of the rabbithole.
   * Tracks whether the conversation successfully returned to topic.
   */
  status: RabbitholeStatus;
}

/**
 * Token usage tracking for cost analysis.
 *
 * Tracks the number of tokens consumed during a session, broken down
 * by input (prompts sent to the model) and output (model responses).
 * This enables accurate API cost calculation and usage monitoring.
 *
 * @example
 * ```typescript
 * const usage: TokenUsage = {
 *   inputTokens: 2500,
 *   outputTokens: 1800,
 *   totalTokens: 4300,
 * };
 * ```
 */
export interface TokenUsage {
  /**
   * Number of tokens in prompts sent to the model.
   * Includes system prompts, conversation history, and user messages.
   */
  inputTokens: number;

  /**
   * Number of tokens in model responses.
   * The content generated by the AI assistant.
   */
  outputTokens: number;

  /**
   * Sum of input and output tokens.
   * Convenience field: totalTokens = inputTokens + outputTokens
   */
  totalTokens: number;
}

/**
 * Message timing information for analyzing conversation flow.
 *
 * Captures when each message occurred and the latency between messages,
 * which helps identify patterns like:
 * - User response times (indicating difficulty or engagement)
 * - AI response latency (for performance monitoring)
 * - Conversation pacing throughout the session
 *
 * @example
 * ```typescript
 * const timing: MessageTiming = {
 *   messageIndex: 3,
 *   timestamp: new Date('2024-01-20T10:30:15Z'),
 *   latencyMs: 3500,
 * };
 * ```
 */
export interface MessageTiming {
  /**
   * Index of the message in the session's message array.
   * Zero-based index into Session.messages.
   */
  messageIndex: number;

  /**
   * When the message was created/sent.
   * UTC timestamp for consistent cross-timezone analysis.
   */
  timestamp: Date;

  /**
   * Time in milliseconds since the previous message.
   * Null for the first message in the session.
   * Measures the gap between this message and the prior one.
   */
  latencyMs: number | null;
}

/**
 * Comprehensive metrics for a single recall session.
 *
 * SessionMetrics captures everything needed to analyze session performance,
 * including recall outcomes, timing data, token usage, and engagement metrics.
 * These are computed when a session completes and stored for historical analysis.
 *
 * @example
 * ```typescript
 * const metrics: SessionMetrics = {
 *   sessionId: 'sess_abc123',
 *   recallOutcomes: [
 *     { recallPointId: 'rp_001', success: true, confidence: 0.9, ... },
 *     { recallPointId: 'rp_002', success: false, confidence: 0.75, ... },
 *   ],
 *   rabbitholes: [],
 *   tokenUsage: { inputTokens: 2500, outputTokens: 1800, totalTokens: 4300 },
 *   costUsd: 0.042,
 *   messageTimings: [...],
 *   totalDurationMs: 180000,
 *   averageRecallTimeMs: 45000,
 *   engagementScore: 78,
 *   computedAt: new Date('2024-01-20T11:00:00Z'),
 * };
 * ```
 */
export interface SessionMetrics {
  /**
   * ID of the session these metrics describe.
   * Links to the Session entity for full conversation access.
   */
  sessionId: string;

  /**
   * Detailed outcomes for each recall point attempted in the session.
   * Ordered by the sequence they were addressed in the conversation.
   */
  recallOutcomes: RecallOutcome[];

  /**
   * All rabbithole events that occurred during the session.
   * Empty array if the conversation stayed focused throughout.
   */
  rabbitholes: RabbitholeEvent[];

  /**
   * Token usage breakdown for the session.
   * Used for cost calculation and usage analytics.
   */
  tokenUsage: TokenUsage;

  /**
   * Estimated API cost in US dollars for this session.
   * Calculated from tokenUsage and current model pricing.
   */
  costUsd: number;

  /**
   * Timing information for each message in the session.
   * Enables analysis of conversation pacing and response patterns.
   */
  messageTimings: MessageTiming[];

  /**
   * Total session duration in milliseconds.
   * Time from first message to last message.
   */
  totalDurationMs: number;

  /**
   * Average time spent per recall point in milliseconds.
   * Calculated as totalDurationMs / number of recall points.
   */
  averageRecallTimeMs: number;

  /**
   * Computed engagement score from 0-100.
   * Higher scores indicate more engaged, productive sessions.
   * See calculateEngagementScore() for the calculation methodology.
   */
  engagementScore: number;

  /**
   * When these metrics were computed.
   * Typically shortly after the session completes.
   */
  computedAt: Date;
}

/**
 * Lightweight summary of session metrics for list views and dashboards.
 *
 * Contains the essential metrics without the full detail, suitable for
 * displaying session history lists or aggregate analytics without loading
 * complete metric data.
 *
 * @example
 * ```typescript
 * const summary: SessionMetricsSummary = {
 *   sessionId: 'sess_abc123',
 *   recallSuccessRate: 0.75,
 *   totalRecallPoints: 4,
 *   successfulRecalls: 3,
 *   totalDurationMs: 180000,
 *   costUsd: 0.042,
 *   engagementScore: 78,
 *   rabbitholeCount: 1,
 * };
 * ```
 */
export interface SessionMetricsSummary {
  /**
   * ID of the session this summary describes.
   */
  sessionId: string;

  /**
   * Proportion of recall points successfully recalled (0.0 to 1.0).
   * Calculated as successfulRecalls / totalRecallPoints.
   */
  recallSuccessRate: number;

  /**
   * Total number of recall points attempted in the session.
   */
  totalRecallPoints: number;

  /**
   * Number of recall points successfully recalled.
   */
  successfulRecalls: number;

  /**
   * Total session duration in milliseconds.
   */
  totalDurationMs: number;

  /**
   * Estimated API cost in US dollars.
   */
  costUsd: number;

  /**
   * Computed engagement score from 0-100.
   */
  engagementScore: number;

  /**
   * Number of rabbithole tangents that occurred.
   */
  rabbitholeCount: number;
}

/**
 * Calculates the variance in response times from a set of message timings.
 *
 * Response time variance helps assess conversation consistency:
 * - Low variance suggests steady, consistent engagement
 * - High variance may indicate periods of confusion or distraction
 *
 * Used as a component in the engagement score calculation.
 *
 * @param timings - Array of message timing data
 * @returns Variance of response times in milliseconds squared, or 0 if insufficient data
 *
 * @example
 * ```typescript
 * const timings: MessageTiming[] = [
 *   { messageIndex: 0, timestamp: new Date(), latencyMs: null },
 *   { messageIndex: 1, timestamp: new Date(), latencyMs: 2000 },
 *   { messageIndex: 2, timestamp: new Date(), latencyMs: 3000 },
 * ];
 * const variance = calculateResponseTimeVariance(timings);
 * // Returns variance of [2000, 3000] = 250000
 * ```
 */
export function calculateResponseTimeVariance(
  timings: MessageTiming[]
): number {
  // Extract valid latencies (excluding null for first message)
  const latencies = timings
    .map((t) => t.latencyMs)
    .filter((l): l is number => l !== null);

  // Need at least 2 data points to calculate variance
  if (latencies.length < 2) {
    return 0;
  }

  // Calculate mean latency
  const mean = latencies.reduce((sum, l) => sum + l, 0) / latencies.length;

  // Calculate variance: average of squared differences from mean
  const squaredDiffs = latencies.map((l) => Math.pow(l - mean, 2));
  const variance = squaredDiffs.reduce((sum, d) => sum + d, 0) / latencies.length;

  return variance;
}

/**
 * Calculates an engagement score (0-100) for a session based on various metrics.
 *
 * The engagement score is a composite metric that considers:
 * - Recall success rate (higher success = more engaged)
 * - Response time consistency (lower variance = more focused)
 * - Rabbithole behavior (some tangents show curiosity, too many show distraction)
 * - Session completion (finishing all recall points indicates commitment)
 *
 * Score interpretation:
 * - 90-100: Excellent engagement, focused and successful
 * - 70-89: Good engagement, mostly productive
 * - 50-69: Moderate engagement, room for improvement
 * - Below 50: Low engagement, consider session restructuring
 *
 * @param metrics - The complete session metrics to analyze
 * @returns Engagement score from 0 to 100
 *
 * @example
 * ```typescript
 * const metrics: SessionMetrics = {
 *   sessionId: 'sess_abc123',
 *   recallOutcomes: [
 *     { recallPointId: 'rp_001', success: true, confidence: 0.9, ... },
 *     { recallPointId: 'rp_002', success: true, confidence: 0.85, ... },
 *   ],
 *   rabbitholes: [{ status: 'returned', ... }],
 *   ...
 * };
 * const score = calculateEngagementScore(metrics);
 * // Returns a score like 85
 * ```
 */
export function calculateEngagementScore(metrics: SessionMetrics): number {
  // Weight factors for each component (must sum to 1.0)
  const weights = {
    recallSuccess: 0.4, // 40% - Primary indicator of engagement
    consistency: 0.25, // 25% - Response time consistency
    rabbitholeManagement: 0.2, // 20% - How tangents were handled
    completion: 0.15, // 15% - Session completion behavior
  };

  // Component 1: Recall success rate (0-100)
  // Weight successful recalls by confidence for nuanced scoring
  const totalConfidenceWeightedSuccess = metrics.recallOutcomes.reduce(
    (sum, outcome) => sum + (outcome.success ? outcome.confidence : 0),
    0
  );
  const maxPossibleScore = metrics.recallOutcomes.length;
  const recallSuccessScore =
    maxPossibleScore > 0
      ? (totalConfidenceWeightedSuccess / maxPossibleScore) * 100
      : 50; // Default to neutral if no recall points

  // Component 2: Response time consistency (0-100)
  // Lower variance = higher score, normalized using a reasonable threshold
  const variance = calculateResponseTimeVariance(metrics.messageTimings);
  // Consider variance above 30 seconds squared (900000000 ms^2) as "high"
  const varianceThreshold = 900000000;
  const normalizedVariance = Math.min(variance / varianceThreshold, 1);
  const consistencyScore = (1 - normalizedVariance) * 100;

  // Component 3: Rabbithole management (0-100)
  // - Some rabbitholes (1-2) with successful returns show healthy curiosity
  // - Too many (3+) or abandoned ones indicate distraction
  const abandonedRabbitholes = metrics.rabbitholes.filter(
    (r) => r.status === 'abandoned'
  ).length;
  const totalRabbitholes = metrics.rabbitholes.length;

  let rabbitholeScore: number;
  if (totalRabbitholes === 0) {
    // No tangents: good focus, but maybe missed exploration opportunities
    rabbitholeScore = 85;
  } else if (totalRabbitholes <= 2 && abandonedRabbitholes === 0) {
    // Few tangents, all returned: excellent curiosity management
    rabbitholeScore = 100;
  } else if (abandonedRabbitholes === 0) {
    // More tangents but all returned: decent but could be more focused
    rabbitholeScore = 70;
  } else {
    // Some abandoned tangents: penalty proportional to abandonment
    const abandonmentRatio = abandonedRabbitholes / totalRabbitholes;
    rabbitholeScore = Math.max(0, 80 - abandonmentRatio * 60);
  }

  // Component 4: Completion behavior (0-100)
  // Based on whether all recall points were addressed
  const totalRecallPoints = metrics.recallOutcomes.length;
  const completionScore = totalRecallPoints > 0 ? 100 : 0;

  // Calculate weighted final score
  const finalScore =
    recallSuccessScore * weights.recallSuccess +
    consistencyScore * weights.consistency +
    rabbitholeScore * weights.rabbitholeManagement +
    completionScore * weights.completion;

  // Clamp to 0-100 range and round to whole number
  return Math.round(Math.max(0, Math.min(100, finalScore)));
}
