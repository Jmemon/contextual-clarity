/**
 * Branch Detector Service
 *
 * This service uses LLM analysis to detect when conversations during recall
 * sessions drift into tangential topics ("branches") and when they return
 * to the main subject. It also detects when branch conversations have
 * naturally concluded.
 *
 * Key features:
 * - Detects new branches when conversation drifts from recall points
 * - Tracks multiple concurrent branches (e.g., nested tangents)
 * - Detects when conversations return from tangents to main topics
 * - Detects when branch conversations have naturally wound down
 * - Handles session end by closing all active branches
 * - Serializes detection calls to prevent race conditions
 *
 * The detector respects a confidence threshold (default 0.6) to avoid
 * false positives. Only detections above this threshold create events.
 *
 * Usage:
 * ```typescript
 * const detector = new BranchDetector(llmClient);
 *
 * // After each message exchange, check for new branches
 * const branch = await detector.detectBranch(
 *   sessionId,
 *   messages,
 *   currentRecallPoint,
 *   allRecallPoints,
 *   branchPointMessageId
 * );
 *
 * // Also check if any active branches have concluded
 * const returns = await detector.detectReturns(
 *   messages,
 *   currentRecallPoint,
 *   branchPointMessageId
 * );
 *
 * // Check if a branch conversation has naturally wound down
 * const concluded = await detector.detectConclusion(
 *   branchConversation,
 *   topic
 * );
 *
 * // At session end, close any remaining active branches
 * const abandoned = detector.closeAllActive();
 * ```
 */

import type { AnthropicClient } from '../../llm/client';
import {
  buildBranchDetectorPrompt,
  buildBranchReturnPrompt,
  buildBranchConclusionPrompt,
  parseBranchDetectionResponse,
  parseBranchReturnResponse,
  parseBranchConclusionResponse,
} from '../../llm/prompts';
import type { SessionMessage, RecallPoint, Branch } from '../models';
import {
  type BranchDetectorConfig,
  type ActiveBranchState,
  DEFAULT_BRANCH_DETECTOR_CONFIG,
} from './types';

/**
 * Generates a unique identifier for branch events.
 * Uses crypto.randomUUID() for guaranteed uniqueness.
 *
 * @returns A unique ID string prefixed with 'br_'
 */
function generateBranchId(): string {
  return `br_${crypto.randomUUID()}`;
}

/**
 * Determines whether a message was sent by the user.
 * Used to track who initiated a branch.
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
 * BranchDetector analyzes conversations to identify when they drift
 * into tangential topics, when they return to the main subject, and
 * when branch conversations have naturally concluded.
 *
 * The detector maintains state for active branches within a session
 * and provides methods to check for new tangents, returns, and conclusions.
 */
export class BranchDetector {
  /** The LLM client used for analysis */
  private llmClient: AnthropicClient;

  /** Configuration options for detection thresholds and behavior */
  private config: BranchDetectorConfig;

  /**
   * Map of active (unreturned) branches, keyed by their ID.
   * This allows tracking multiple concurrent tangents.
   */
  private activeBranches: Map<string, ActiveBranchState> = new Map();

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
   * Creates a new BranchDetector instance.
   *
   * @param llmClient - The Anthropic client for making LLM calls
   * @param config - Optional configuration to override defaults
   *
   * @example
   * ```typescript
   * const detector = new BranchDetector(llmClient);
   *
   * // With custom config
   * const detector = new BranchDetector(llmClient, {
   *   confidenceThreshold: 0.7,
   *   messageWindowSize: 8,
   * });
   * ```
   */
  constructor(
    llmClient: AnthropicClient,
    config: Partial<BranchDetectorConfig> = {}
  ) {
    this.llmClient = llmClient;
    this.config = { ...DEFAULT_BRANCH_DETECTOR_CONFIG, ...config };
  }

  /**
   * Serializes detection calls to prevent race conditions.
   *
   * Multiple detection calls may happen rapidly during a session (e.g.,
   * quick message exchanges). This lock ensures they execute sequentially
   * to maintain consistent state in the activeBranches map.
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
   * Checks if the conversation has entered a new branch (tangent).
   *
   * This method should be called after each message exchange to detect
   * when the conversation drifts into a tangential topic. It uses the
   * LLM to analyze recent messages against the current recall point.
   *
   * Detection only creates a Branch if:
   * 1. The LLM determines a branch exists (isRabbithole: true)
   * 2. The confidence is above the configured threshold (default 0.6)
   * 3. The topic hasn't already been flagged as an active branch
   *
   * @param sessionId - ID of the current session (used for event tracking)
   * @param messages - All messages in the session so far
   * @param currentRecallPoint - The recall point currently being discussed
   * @param allRecallPoints - All recall points in the session for cross-reference
   * @param branchPointMessageId - ID of the message that triggered detection
   * @param parentBranchId - ID of the parent branch, or null if from main conversation
   * @returns A Branch if a new branch was detected, null otherwise
   *
   * @example
   * ```typescript
   * const branch = await detector.detectBranch(
   *   'sess_abc123',
   *   sessionMessages,
   *   currentPoint,
   *   allPoints,
   *   'msg_xyz789'
   * );
   * if (branch) {
   *   console.log(`Detected tangent: ${branch.topic}`);
   * }
   * ```
   */
  async detectBranch(
    _sessionId: string, // Kept for API consistency; may be used for session-specific logging
    messages: SessionMessage[],
    currentRecallPoint: RecallPoint,
    allRecallPoints: RecallPoint[],
    branchPointMessageId: string,
    parentBranchId: string | null = null
  ): Promise<Branch | null> {
    return this.withLock(async () => {
      // Get recent messages within the configured window size
      const recentMessages = this.getRecentMessages(messages);

      // Skip detection if there aren't enough messages to analyze
      if (recentMessages.length < 2) {
        return null;
      }

      // Get topics of currently active branches to avoid re-flagging
      const existingTopics = Array.from(this.activeBranches.values()).map(
        (br) => br.topic
      );

      // Build the detection prompt with all necessary context
      const prompt = buildBranchDetectorPrompt({
        recentMessages,
        currentRecallPoint,
        allRecallPoints: this.config.trackRelatedRecallPoints ? allRecallPoints : [],
        existingBranches: existingTopics,
      });

      // Call the LLM to analyze the conversation
      const response = await this.llmClient.complete(prompt, {
        temperature: 0.3, // Lower temperature for more consistent detection
        maxTokens: 512, // Detection responses are relatively short
      });

      // Parse the LLM response into structured data
      const result = parseBranchDetectionResponse(response.text);

      // Only create a Branch if confidence threshold is met and branch detected
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

      // Generate a unique ID for this branch
      const id = generateBranchId();
      const messageIndex = messages.length - 1;

      // Create the active state for tracking
      const activeState: ActiveBranchState = {
        id,
        topic: result.topic ?? 'Unknown tangent',
        triggerMessageIndex: messageIndex,
        depth: result.depth,
        relatedRecallPointIds: result.relatedRecallPointIds,
        userInitiated: wasUserInitiated(messages, messageIndex),
        detectedAt: new Date(),
        parentBranchId,
        branchPointMessageId,
      };

      // Add to the active branches map
      this.activeBranches.set(id, activeState);

      // Create and return the Branch object
      const branch: Branch = {
        id,
        parentBranchId,
        branchPointMessageId,
        topic: activeState.topic,
        depth: activeState.depth,
        relatedRecallPointIds: activeState.relatedRecallPointIds,
        userInitiated: activeState.userInitiated,
        status: 'active',
        summary: null,
        conversation: null,
      };

      return branch;
    });
  }

  /**
   * Checks if any active branches have concluded (returned to main topic).
   *
   * This method iterates through all active branches and uses the LLM
   * to determine if the conversation has returned from each tangent.
   * Returned branches are removed from active tracking.
   *
   * @param messages - All messages in the session so far
   * @param currentRecallPoint - The recall point the conversation should return to
   * @param branchPointMessageId - ID of the current message for marking return point
   * @returns Array of Branches that have returned (may be empty)
   *
   * @example
   * ```typescript
   * const returns = await detector.detectReturns(
   *   sessionMessages,
   *   currentPoint,
   *   'msg_abc123'
   * );
   * for (const branch of returns) {
   *   console.log(`Returned from: ${branch.topic}`);
   * }
   * ```
   */
  async detectReturns(
    messages: SessionMessage[],
    currentRecallPoint: RecallPoint,
    _branchPointMessageId: string
  ): Promise<Branch[]> {
    // Get recent messages for return detection
    const recentMessages = this.getRecentMessages(messages);

    // Skip if no active branches to check
    if (this.activeBranches.size === 0) {
      return [];
    }

    // Skip if not enough messages to analyze
    if (recentMessages.length < 2) {
      return [];
    }

    const returnedBranches: Branch[] = [];

    // Check each active branch for return
    // Note: We process sequentially to maintain state consistency
    for (const [id, activeState] of this.activeBranches.entries()) {
      // Build the return detection prompt
      const prompt = buildBranchReturnPrompt(
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
      const result = parseBranchReturnResponse(response.text);

      // Only mark as returned if confidence threshold is met
      if (result.hasReturned && result.confidence >= this.config.returnConfidenceThreshold) {
        // Create the closed branch
        const branch: Branch = {
          id,
          parentBranchId: activeState.parentBranchId,
          branchPointMessageId: activeState.branchPointMessageId,
          topic: activeState.topic,
          depth: activeState.depth,
          relatedRecallPointIds: activeState.relatedRecallPointIds,
          userInitiated: activeState.userInitiated,
          status: 'closed',
          summary: null,
          conversation: null,
          closedAt: new Date(),
        };

        returnedBranches.push(branch);

        // Remove from active tracking
        this.activeBranches.delete(id);
      }
    }

    return returnedBranches;
  }

  /**
   * Checks if a branch conversation has naturally concluded.
   *
   * Runs after each branch message to detect winding-down signals.
   * This is distinct from return detection — conclusion checks whether
   * the tangent itself has wound down, not whether the conversation
   * returned to the main topic.
   *
   * @param branchConversation - The messages within the branch conversation
   * @param topic - The branch topic being discussed
   * @returns true if the branch conversation has naturally concluded
   */
  async detectConclusion(
    branchConversation: Array<{ role: string; content: string }>,
    topic: string
  ): Promise<boolean> {
    // Too early to conclude — need at least 4 messages for meaningful analysis
    if (branchConversation.length < 4) return false;

    const recentMessages = branchConversation.slice(-4);
    const prompt = buildBranchConclusionPrompt(topic, recentMessages);

    const response = await this.llmClient.complete(prompt, {
      temperature: 0.3,
      maxTokens: 128,
    });

    const result = parseBranchConclusionResponse(response.text);
    return result.isConcluded && result.confidence >= this.config.confidenceThreshold;
  }

  /**
   * Force-closes all active branches at session end.
   *
   * When a session ends (either completed or abandoned), any remaining
   * active branches should be closed with 'abandoned' status. This
   * ensures the session metrics include all branch events.
   *
   * @returns Array of closed Branches with 'abandoned' status (may be empty)
   *
   * @example
   * ```typescript
   * // At session end
   * const abandoned = detector.closeAllActive();
   * sessionMetrics.branches.push(...abandoned);
   * ```
   */
  closeAllActive(): Branch[] {
    const closedBranches: Branch[] = [];

    // Convert each active branch to an abandoned Branch
    for (const [id, activeState] of this.activeBranches.entries()) {
      const branch: Branch = {
        id,
        parentBranchId: activeState.parentBranchId,
        branchPointMessageId: activeState.branchPointMessageId,
        topic: activeState.topic,
        depth: activeState.depth,
        relatedRecallPointIds: activeState.relatedRecallPointIds,
        userInitiated: activeState.userInitiated,
        status: 'abandoned', // Session ended without return
        summary: null,
        conversation: null,
        closedAt: new Date(),
      };

      closedBranches.push(branch);
    }

    // Clear all active branches
    this.activeBranches.clear();

    return closedBranches;
  }

  /**
   * Returns all currently active (unreturned) branches.
   *
   * Useful for checking the current state of tangents during a session.
   *
   * @returns Array of Branches representing active tangents
   *
   * @example
   * ```typescript
   * const active = detector.getActiveBranches();
   * if (active.length > 2) {
   *   console.log('Multiple tangents detected, may need redirection');
   * }
   * ```
   */
  getActiveBranches(): Branch[] {
    return Array.from(this.activeBranches.values()).map((activeState) => ({
      id: activeState.id,
      parentBranchId: activeState.parentBranchId,
      branchPointMessageId: activeState.branchPointMessageId,
      topic: activeState.topic,
      depth: activeState.depth,
      relatedRecallPointIds: activeState.relatedRecallPointIds,
      userInitiated: activeState.userInitiated,
      status: 'active' as const,
      summary: null,
      conversation: null,
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
    this.activeBranches.clear();
    this.detectionQueue = [];
    this.detectionInProgress = false;
  }

  /**
   * Returns the count of currently active branches.
   *
   * A quick way to check if there are any active tangents without
   * getting the full event data.
   *
   * @returns Number of active branches
   */
  getActiveCount(): number {
    return this.activeBranches.size;
  }

  /**
   * Checks if a specific branch is still active.
   *
   * @param branchId - ID of the branch to check
   * @returns true if the branch is still active
   */
  isActive(branchId: string): boolean {
    return this.activeBranches.has(branchId);
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
  getConfig(): BranchDetectorConfig {
    return { ...this.config };
  }

  /**
   * Updates the configuration.
   *
   * This allows runtime adjustment of thresholds and other settings.
   *
   * @param config - Partial configuration to merge with current settings
   */
  updateConfig(config: Partial<BranchDetectorConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
