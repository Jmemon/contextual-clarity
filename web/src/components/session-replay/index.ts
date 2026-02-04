/**
 * Session Replay Components
 *
 * This module exports all components used in the session replay feature.
 * Components are designed to display past study sessions with:
 * - Full conversation transcripts
 * - Evaluation markers showing recall results
 * - Rabbithole markers indicating tangent conversations
 * - Session summary statistics
 *
 * @example
 * ```tsx
 * import {
 *   SessionSummary,
 *   TranscriptMessage,
 *   EvaluationMarker,
 *   RabbitholeMarker,
 * } from '@/components/session-replay';
 * ```
 */

// Main transcript message component for rendering individual messages
export { TranscriptMessage } from './TranscriptMessage';
export type { TranscriptMessageProps } from './TranscriptMessage';

// Evaluation marker for showing recall evaluation results
export { EvaluationMarker } from './EvaluationMarker';
export type { EvaluationMarkerProps, EvaluationOutcome } from './EvaluationMarker';

// Rabbithole marker for indicating conversational tangents
export { RabbitholeMarker } from './RabbitholeMarker';
export type { RabbitholeMarkerProps } from './RabbitholeMarker';

// Session summary card for displaying key statistics
export { SessionSummary } from './SessionSummary';
export type { SessionSummaryProps, SessionMetrics } from './SessionSummary';
