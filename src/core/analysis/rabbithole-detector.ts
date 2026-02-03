/**
 * Rabbithole Detector Service
 *
 * This service uses LLM analysis to detect when conversations during recall
 * sessions drift into tangential topics ("rabbitholes") and when they return
 * to the main subject.
 *
 * Key features:
 * - Detects new rabbitholes when conversation drifts from recall points
 * - Tracks multiple concurrent rabbitholes (e.g., nested tangents)
 * - Detects when conversations return from tangents to main topics
 * - Handles session end by closing all active rabbitholes
 * - Serializes detection calls to prevent race conditions
 *
 * The detector respects a confidence threshold (default 0.6) to avoid
 * false positives. Only detections above this threshold create events.
 *
 * Usage:
 * ```typescript
 * const detector = new RabbitholeDetector(llmClient);
 *
 * // After each message exchange, check for new rabbitholes
 * const event = await detector.detectRabbithole(
 *   sessionId,
 *   messages,
 *   currentRecallPoint,
 *   allRecallPoints,
 *   messageIndex
 * );
 *
 * // Also check if any active rabbitholes have concluded
 * const returns = await detector.detectReturns(
 *   messages,
 *   currentRecallPoint,
 *   messageIndex
 * );
 *
 * // At session end, close any remaining active rabbitholes
 * const abandoned = detector.closeAllActive(finalMessageIndex);
 * ```
 */

import type { AnthropicClient } from '../../llm/client';
import {
  buildRabbitholeDetectorPrompt,
  buildRabbitholeReturnPrompt,
  parseRabbitholeDetectionResponse,
  parseRabbitholeReturnResponse,
} from '../../llm/prompts';
import type { SessionMessage, RecallPoint, RabbitholeEvent } from '../models';
import {
  type RabbitholeDetectorConfig,
  type ActiveRabbitholeState,
  DEFAULT_RABBITHOLE_DETECTOR_CONFIG,
} from './types';

/**
 * Generates a unique identifier for rabbithole events.
 * Uses crypto.randomUUID() for guaranteed uniqueness.
 *
 * @returns A unique ID string prefixed with 'rh_'
 */
function generateRabbitholeId(): string {
  return `rh_${crypto.randomUUID()}`;
}

/**
 * Determines whether a message was sent by the user.
 * Used to track who initiated a rabbithole.
 *
 * @param messages - Array of session messages
 * @param triggerIndex - Index of the message that triggered the tangent
 * @returns true if the user sent the triggering message
 */
function wasUserInitiated(messages: SessionMessage[], triggerIndex: number): boolean {
  // If trigger index is out of bounds, default to user-initiated
  if (triggerIndex < 0 || triggerIndex >= messages.length) {
    return true;
  }
  return messages[triggerIndex].role === 'user';
}

/**
 * RabbitholeDetector analyzes conversations to identify when they drift
 * into tangential topics and when they return to the main subject.
 *
 * The detector maintains state for active rabbitholes within a session
 * and provides methods to check for new tangents and returns.
 */
export class RabbitholeDetector {
  /** The LLM client used for analysis */
  private llmClient: AnthropicClient;

  /** Configuration options for detection thresholds and behavior */
  private config: RabbitholeDetectorConfig;

  /**
   * Map of active (unreturned) rabbitholes, keyed by their ID.
   * This allows tracking multiple concurrent tangents.
   */
  private activeRabbitholes: Map<string, ActiveRabbitholeState> = new Map();

  /**
   * Flag indicating whether a detection operation is in progress.
   * Used by the lock mechanism to serialize concurrent calls.
   */
  private detectionInProgress: boolean = false;

  /**
   * Queue of pending detection operations waiting for the lock.
   * Each entry is a function that returns a promise to be executed.
   */
  private detectionQueue: Array<{
    fn: () => Promise<void>;
    resolve: () => void;
    reject: (error: Error) => void;
  }> = [];

  /**
   * Creates a new RabbitholeDetector instance.
   *
   * @param llmClient - The Anthropic client for making LLM calls
   * @param config - Optional configuration to override defaults
   *
   * @example
   * ```typescript
   * const detector = new RabbitholeDetector(llmClient);
   *
   * // With custom config
   * const detector = new RabbitholeDetector(llmClient, {
   *   confidenceThreshold: 0.7,
   *   messageWindowSize: 8,
   * });
   * ```
   */
  constructor(
    llmClient: AnthropicClient,
    config: Partial<RabbitholeDetectorConfig> = {}
  ) {
    this.llmClient = llmClient;
    this.config = { ...DEFAULT_RABBITHOLE_DETECTOR_CONFIG, ...config };
  }

  /**
   * Serializes detection calls to prevent race conditions.
   *
   * Multiple detection calls may happen rapidly during a session (e.g.,
   * quick message exchanges). This lock ensures they execute sequentially
   * to maintain consistent state in the activeRabbitholes map.
   *
   * @param fn - The async function to execute with lock protection
   * @returns Promise resolving to the function's return value
   */
  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      // Wrap the function to capture its result
      const wrappedFn = async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      };

      // If no operation in progress, execute immediately
      if (!this.detectionInProgress) {
        this.detectionInProgress = true;
        wrappedFn().finally(() => this.processQueue());
      } else {
        // Queue the operation for later execution
        this.detectionQueue.push({
          fn: wrappedFn,
          resolve: () => {}, // Resolve is handled by wrappedFn
          reject: () => {}, // Reject is handled by wrappedFn
        });
      }
    });
  }

  /**
   * Processes the next item in the detection queue.
   * Called after each detection operation completes.
   */
  private processQueue(): void {
    const next = this.detectionQueue.shift();
    if (next) {
      next.fn().finally(() => this.processQueue());
    } else {
      this.detectionInProgress = false;
    }
  }

  /**
   * Checks if the conversation has entered a new rabbithole.
   *
   * This method should be called after each message exchange to detect
   * when the conversation drifts into a tangential topic. It uses the
   * LLM to analyze recent messages against the current recall point.
   *
   * Detection only creates an event if:
   * 1. The LLM determines a rabbithole exists (isRabbithole: true)
   * 2. The confidence is above the configured threshold (default 0.6)
   * 3. The topic hasn't already been flagged as an active rabbithole
   *
   * @param sessionId - ID of the current session (used for event tracking)
   * @param messages - All messages in the session so far
   * @param currentRecallPoint - The recall point currently being discussed
   * @param allRecallPoints - All recall points in the session for cross-reference
   * @param messageIndex - Index of the current message (used as trigger index)
   * @returns A RabbitholeEvent if a new rabbithole was detected, null otherwise
   *
   * @example
   * ```typescript
   * const event = await detector.detectRabbithole(
   *   'sess_abc123',
   *   sessionMessages,
   *   currentPoint,
   *   allPoints,
   *   messages.length - 1
   * );
   * if (event) {
   *   console.log(`Detected tangent: ${event.topic}`);
   * }
   * ```
   */
  async detectRabbithole(
    _sessionId: string, // Kept for API consistency; may be used for session-specific logging
    messages: SessionMessage[],
    currentRecallPoint: RecallPoint,
    allRecallPoints: RecallPoint[],
    messageIndex: number
  ): Promise<RabbitholeEvent | null> {
    return this.withLock(async () => {
      // Get recent messages within the configured window size
      const recentMessages = this.getRecentMessages(messages);

      // Skip detection if there aren't enough messages to analyze
      if (recentMessages.length < 2) {
        return null;
      }

      // Get topics of currently active rabbitholes to avoid re-flagging
      const existingTopics = Array.from(this.activeRabbitholes.values()).map(
        (rh) => rh.topic
      );

      // Build the detection prompt with all necessary context
      const prompt = buildRabbitholeDetectorPrompt({
        recentMessages,
        currentRecallPoint,
        allRecallPoints: this.config.trackRelatedRecallPoints ? allRecallPoints : [],
        existingRabbitholes: existingTopics,
      });

      // Call the LLM to analyze the conversation
      const response = await this.llmClient.complete(prompt, {
        temperature: 0.3, // Lower temperature for more consistent detection
        maxTokens: 512, // Detection responses are relatively short
      });

      // Parse the LLM response into structured data
      const result = parseRabbitholeDetectionResponse(response.text);

      // Only create an event if confidence threshold is met and rabbithole detected
      if (!result.isRabbithole || result.confidence < this.config.confidenceThreshold) {
        return null;
      }

      // Check if this topic is already being tracked (avoid duplicates)
      const normalizedTopic = result.topic?.toLowerCase().trim() ?? '';
      const isDuplicate = existingTopics.some(
        (existing) => existing.toLowerCase().trim() === normalizedTopic
      );
      if (isDuplicate) {
        return null;
      }

      // Generate a unique ID for this rabbithole event
      const id = generateRabbitholeId();

      // Create the active state for tracking
      const activeState: ActiveRabbitholeState = {
        id,
        topic: result.topic ?? 'Unknown tangent',
        triggerMessageIndex: messageIndex,
        depth: result.depth,
        relatedRecallPointIds: result.relatedRecallPointIds,
        userInitiated: wasUserInitiated(messages, messageIndex),
        detectedAt: new Date(),
      };

      // Add to the active rabbitholes map
      this.activeRabbitholes.set(id, activeState);

      // Create and return the RabbitholeEvent
      const event: RabbitholeEvent = {
        id,
        topic: activeState.topic,
        triggerMessageIndex: activeState.triggerMessageIndex,
        returnMessageIndex: null, // Not yet returned
        depth: activeState.depth,
        relatedRecallPointIds: activeState.relatedRecallPointIds,
        userInitiated: activeState.userInitiated,
        status: 'active',
      };

      return event;
    });
  }

  /**
   * Checks if any active rabbitholes have concluded (returned to main topic).
   *
   * This method iterates through all active rabbitholes and uses the LLM
   * to determine if the conversation has returned from each tangent.
   * Returned rabbitholes are removed from active tracking.
   *
   * @param messages - All messages in the session so far
   * @param currentRecallPoint - The recall point the conversation should return to
   * @param messageIndex - Index of the current message (used as return index)
   * @returns Array of RabbitholeEvents that have returned (may be empty)
   *
   * @example
   * ```typescript
   * const returns = await detector.detectReturns(
   *   sessionMessages,
   *   currentPoint,
   *   messages.length - 1
   * );
   * for (const event of returns) {
   *   console.log(`Returned from: ${event.topic}`);
   * }
   * ```
   */
  async detectReturns(
    messages: SessionMessage[],
    currentRecallPoint: RecallPoint,
    messageIndex: number
  ): Promise<RabbitholeEvent[]> {
    // Get recent messages for return detection
    const recentMessages = this.getRecentMessages(messages);

    // Skip if no active rabbitholes to check
    if (this.activeRabbitholes.size === 0) {
      return [];
    }

    // Skip if not enough messages to analyze
    if (recentMessages.length < 2) {
      return [];
    }

    const returnedEvents: RabbitholeEvent[] = [];

    // Check each active rabbithole for return
    // Note: We process sequentially to maintain state consistency
    for (const [id, activeState] of this.activeRabbitholes.entries()) {
      // Build the return detection prompt
      const prompt = buildRabbitholeReturnPrompt(
        activeState.topic,
        currentRecallPoint,
        recentMessages
      );

      // Call the LLM to check for return
      const response = await this.llmClient.complete(prompt, {
        temperature: 0.3,
        maxTokens: 256, // Return detection responses are short
      });

      // Parse the response
      const result = parseRabbitholeReturnResponse(response.text);

      // Only mark as returned if confidence threshold is met
      if (result.hasReturned && result.confidence >= this.config.returnConfidenceThreshold) {
        // Create the completed event
        const event: RabbitholeEvent = {
          id,
          topic: activeState.topic,
          triggerMessageIndex: activeState.triggerMessageIndex,
          returnMessageIndex: messageIndex,
          depth: activeState.depth,
          relatedRecallPointIds: activeState.relatedRecallPointIds,
          userInitiated: activeState.userInitiated,
          status: 'returned',
        };

        returnedEvents.push(event);

        // Remove from active tracking
        this.activeRabbitholes.delete(id);
      }
    }

    return returnedEvents;
  }

  /**
   * Force-closes all active rabbitholes at session end.
   *
   * When a session ends (either completed or abandoned), any remaining
   * active rabbitholes should be closed with 'abandoned' status. This
   * ensures the session metrics include all rabbithole events.
   *
   * @param finalMessageIndex - Index of the last message in the session
   * @returns Array of closed RabbitholeEvents (may be empty)
   *
   * @example
   * ```typescript
   * // At session end
   * const abandoned = detector.closeAllActive(messages.length - 1);
   * sessionMetrics.rabbitholes.push(...abandoned);
   * ```
   */
  closeAllActive(finalMessageIndex: number): RabbitholeEvent[] {
    const closedEvents: RabbitholeEvent[] = [];

    // Convert each active rabbithole to an abandoned event
    for (const [id, activeState] of this.activeRabbitholes.entries()) {
      const event: RabbitholeEvent = {
        id,
        topic: activeState.topic,
        triggerMessageIndex: activeState.triggerMessageIndex,
        returnMessageIndex: finalMessageIndex, // Mark where we stopped
        depth: activeState.depth,
        relatedRecallPointIds: activeState.relatedRecallPointIds,
        userInitiated: activeState.userInitiated,
        status: 'abandoned', // Session ended without return
      };

      closedEvents.push(event);
    }

    // Clear all active rabbitholes
    this.activeRabbitholes.clear();

    return closedEvents;
  }

  /**
   * Returns all currently active (unreturned) rabbitholes.
   *
   * Useful for checking the current state of tangents during a session.
   *
   * @returns Array of RabbitholeEvents representing active tangents
   *
   * @example
   * ```typescript
   * const active = detector.getActiveRabbitholes();
   * if (active.length > 2) {
   *   console.log('Multiple tangents detected, may need redirection');
   * }
   * ```
   */
  getActiveRabbitholes(): RabbitholeEvent[] {
    return Array.from(this.activeRabbitholes.values()).map((activeState) => ({
      id: activeState.id,
      topic: activeState.topic,
      triggerMessageIndex: activeState.triggerMessageIndex,
      returnMessageIndex: null,
      depth: activeState.depth,
      relatedRecallPointIds: activeState.relatedRecallPointIds,
      userInitiated: activeState.userInitiated,
      status: 'active' as const,
    }));
  }

  /**
   * Resets all detector state for starting a new session.
   *
   * This should be called when beginning a new session to ensure
   * no state from previous sessions affects detection.
   *
   * @example
   * ```typescript
   * // Before starting a new session
   * detector.reset();
   * ```
   */
  reset(): void {
    this.activeRabbitholes.clear();
    this.detectionQueue = [];
    this.detectionInProgress = false;
  }

  /**
   * Returns the count of currently active rabbitholes.
   *
   * A quick way to check if there are any active tangents without
   * getting the full event data.
   *
   * @returns Number of active rabbitholes
   */
  getActiveCount(): number {
    return this.activeRabbitholes.size;
  }

  /**
   * Checks if a specific rabbithole is still active.
   *
   * @param rabbitholeId - ID of the rabbithole to check
   * @returns true if the rabbithole is still active
   */
  isActive(rabbitholeId: string): boolean {
    return this.activeRabbitholes.has(rabbitholeId);
  }

  /**
   * Gets the recent messages within the configured window size.
   *
   * This helper extracts the most recent messages for analysis,
   * ensuring we don't send too much context to the LLM.
   *
   * @param messages - All session messages
   * @returns The most recent messages up to windowSize
   */
  private getRecentMessages(messages: SessionMessage[]): SessionMessage[] {
    const windowSize = this.config.messageWindowSize;
    if (messages.length <= windowSize) {
      return messages;
    }
    return messages.slice(-windowSize);
  }

  /**
   * Gets the current configuration.
   *
   * @returns A copy of the current configuration
   */
  getConfig(): RabbitholeDetectorConfig {
    return { ...this.config };
  }

  /**
   * Updates the configuration.
   *
   * This allows runtime adjustment of thresholds and other settings.
   *
   * @param config - Partial configuration to merge with current settings
   */
  updateConfig(config: Partial<RabbitholeDetectorConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
