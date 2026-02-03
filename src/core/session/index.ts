/**
 * Session Module - Barrel Export
 *
 * This module provides the SessionEngine and related types for managing
 * recall study sessions in Contextual Clarity. The SessionEngine is the
 * core orchestrator that brings together:
 *
 * - FSRS scheduling for optimal review timing
 * - LLM-powered Socratic tutoring for guided recall
 * - Evaluation for assessing recall success
 * - Persistence for session history and progress
 *
 * @example
 * ```typescript
 * import {
 *   SessionEngine,
 *   type SessionEngineConfig,
 *   type SessionEngineDependencies,
 *   type ProcessMessageResult,
 * } from '@/core/session';
 *
 * // Create the engine with dependencies
 * const engine = new SessionEngine({
 *   scheduler: new FSRSScheduler(),
 *   evaluator: new RecallEvaluator(llmClient),
 *   llmClient: new AnthropicClient(),
 *   recallSetRepo: new RecallSetRepository(db),
 *   recallPointRepo: new RecallPointRepository(db),
 *   sessionRepo: new SessionRepository(db),
 *   messageRepo: new SessionMessageRepository(db),
 * });
 *
 * // Start a session
 * const session = await engine.startSession(recallSet);
 * const opening = await engine.getOpeningMessage();
 *
 * // Process user messages
 * const result = await engine.processUserMessage(userInput);
 * if (result.completed) {
 *   console.log('Session complete!');
 * }
 * ```
 */

// Main SessionEngine class
export { SessionEngine } from './session-engine';

// Metrics collection
export { SessionMetricsCollector } from './metrics-collector';

// Type exports
export type {
  SessionEventType,
  SessionEvent,
  SessionEngineConfig,
  SessionEngineDependencies,
  ProcessMessageResult,
} from './types';

// Constants
export {
  DEFAULT_SESSION_CONFIG,
  EVALUATION_TRIGGER_PHRASES,
} from './types';
