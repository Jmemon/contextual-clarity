/**
 * Analysis Module - Barrel Export
 *
 * This module provides conversation analysis capabilities for recall sessions,
 * including rabbithole (tangent) detection and tracking.
 *
 * The primary service is RabbitholeDetector, which uses LLM analysis to:
 * - Detect when conversations drift into tangential topics
 * - Track multiple concurrent tangents
 * - Detect when conversations return to the main topic
 * - Handle session-end cleanup of unresolved tangents
 *
 * @example
 * ```typescript
 * import {
 *   RabbitholeDetector,
 *   type RabbitholeDetectorConfig,
 *   DEFAULT_RABBITHOLE_DETECTOR_CONFIG,
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
 *
 * // Detect rabbitholes after each message
 * const event = await detector.detectRabbithole(
 *   sessionId,
 *   messages,
 *   currentRecallPoint,
 *   allRecallPoints,
 *   messageIndex
 * );
 * ```
 */

// Main rabbithole detector service
export { RabbitholeDetector } from './rabbithole-detector';

// Configuration types and defaults
export {
  type RabbitholeDetectorConfig,
  type ActiveRabbitholeState,
  type DetectionDebugInfo,
  DEFAULT_RABBITHOLE_DETECTOR_CONFIG,
} from './types';
