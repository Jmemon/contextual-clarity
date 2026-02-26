/**
 * Analysis Module - Barrel Export
 *
 * This module provides conversation analysis capabilities for recall sessions,
 * including branch (tangent) detection and tracking.
 *
 * The primary service is RabbitholeDetector (to be renamed BranchDetector in Task 7),
 * which uses LLM analysis to:
 * - Detect when conversations drift into tangential topics
 * - Track multiple concurrent tangents (branches)
 * - Detect when conversations return to the main topic
 * - Handle session-end cleanup of unresolved branches
 *
 * @example
 * ```typescript
 * import {
 *   RabbitholeDetector,
 *   type BranchDetectorConfig,
 *   DEFAULT_BRANCH_DETECTOR_CONFIG,
 * } from '@/core/analysis';
 *
 * // Create detector with default config
 * const detector = new RabbitholeDetector(llmClient);
 *
 * // Or with custom config
 * const detector = new RabbitholeDetector(llmClient, {
 *   confidenceThreshold: 0.7,
 *   messageWindowSize: 8,
 * });
 * ```
 */

// Main detector service (class rename to BranchDetector happens in Task 7)
export { RabbitholeDetector } from './rabbithole-detector';

// Configuration types and defaults
export {
  type BranchDetectorConfig,
  type ActiveBranchState,
  type DetectionDebugInfo,
  DEFAULT_BRANCH_DETECTOR_CONFIG,
} from './types';
