/**
 * Analysis Module Types
 *
 * This module defines types specific to conversation analysis features,
 * particularly rabbithole (conversational tangent) detection and tracking.
 *
 * These types complement the core session metrics types by providing
 * additional interfaces needed for real-time analysis during active sessions.
 */

/**
 * Configuration options for the RabbitholeDetector service.
 *
 * These options control how aggressively the detector identifies tangents
 * and how it handles edge cases like rapid topic switches.
 */
export interface RabbitholeDetectorConfig {
  /**
   * Minimum confidence threshold for creating a rabbithole event.
   * Detection results below this threshold are ignored.
   * Range: 0.0 to 1.0, default: 0.6
   */
  confidenceThreshold: number;

  /**
   * Minimum confidence threshold for returning from a rabbithole.
   * Return detections below this threshold keep the rabbithole active.
   * Range: 0.0 to 1.0, default: 0.6
   */
  returnConfidenceThreshold: number;

  /**
   * Maximum number of recent messages to analyze for detection.
   * Larger windows provide more context but increase token usage.
   * Default: 10
   */
  messageWindowSize: number;

  /**
   * Whether to track relationship to other recall points.
   * When true, detection prompts include all recall points for cross-reference.
   * Default: true
   */
  trackRelatedRecallPoints: boolean;
}

/**
 * Default configuration values for RabbitholeDetector.
 * These represent sensible defaults balancing accuracy and performance.
 */
export const DEFAULT_RABBITHOLE_DETECTOR_CONFIG: RabbitholeDetectorConfig = {
  confidenceThreshold: 0.6,
  returnConfidenceThreshold: 0.6,
  messageWindowSize: 10,
  trackRelatedRecallPoints: true,
};

/**
 * Internal state for tracking an active rabbithole during a session.
 * This is used by RabbitholeDetector to manage concurrent tangents.
 */
export interface ActiveRabbitholeState {
  /**
   * Unique identifier for this rabbithole event.
   */
  id: string;

  /**
   * The topic being discussed in this tangent.
   */
  topic: string;

  /**
   * Message index where this tangent started.
   */
  triggerMessageIndex: number;

  /**
   * Depth level (1-3) indicating how far from the main topic.
   */
  depth: 1 | 2 | 3;

  /**
   * IDs of recall points related to this tangent.
   */
  relatedRecallPointIds: string[];

  /**
   * Whether the user initiated this tangent (vs the AI).
   */
  userInitiated: boolean;

  /**
   * Timestamp when this rabbithole was detected.
   */
  detectedAt: Date;
}

/**
 * Result of a detection operation, including raw LLM response data.
 * Used internally for debugging and audit trails.
 */
export interface DetectionDebugInfo {
  /**
   * The prompt sent to the LLM.
   */
  prompt: string;

  /**
   * Raw response text from the LLM.
   */
  rawResponse: string;

  /**
   * Time taken for the LLM call in milliseconds.
   */
  latencyMs: number;

  /**
   * Token usage for the detection call.
   */
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
  } | null;
}
