/**
 * Session Replay Components
 *
 * This module exports all components used in the session replay feature.
 * Components are designed to display past study sessions with:
 * - Full conversation transcripts
 * - Evaluation markers showing recall results
 * - Branch markers indicating tangent conversations
 * - Session summary statistics
 *
 * @example
 * ```tsx
 * import {
 *   SessionSummary,
 *   TranscriptMessage,
 *   EvaluationMarker,
 *   BranchMarker,
 * } from '@/components/session-replay';
 * ```
 */

// Main transcript message component for rendering individual messages
export { TranscriptMessage } from './TranscriptMessage';
export type { TranscriptMessageProps } from './TranscriptMessage';

// Evaluation marker for showing recall evaluation results
export { EvaluationMarker } from './EvaluationMarker';
export type { EvaluationMarkerProps, EvaluationOutcome } from './EvaluationMarker';

// Branch marker for indicating conversational tangents
export { BranchMarker } from './BranchMarker';
export type { BranchMarkerProps } from './BranchMarker';

// Session summary card for displaying key statistics
export { SessionSummary } from './SessionSummary';
export type { SessionSummaryProps, SessionMetrics } from './SessionSummary';
