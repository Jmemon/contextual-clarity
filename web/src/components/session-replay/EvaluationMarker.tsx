/**
 * EvaluationMarker Component
 *
 * Displays an inline marker showing the result of a recall point evaluation.
 * Used in the session transcript to indicate when and how a user was evaluated
 * on a particular recall point.
 *
 * Color coding:
 * - Green: Successful recall (user correctly remembered the content)
 * - Red: Failed recall (user did not remember the content)
 * - Yellow: Partial recall (user partially remembered with some gaps)
 *
 * @example
 * ```tsx
 * <EvaluationMarker
 *   outcome="success"
 *   recallPointContent="The mitochondria is the powerhouse of the cell"
 *   confidence={0.85}
 * />
 * ```
 */

import { Badge } from '@/components/ui/Badge';

// ============================================================================
// Types
// ============================================================================

/** Possible evaluation outcomes */
export type EvaluationOutcome = 'success' | 'fail' | 'partial';

export interface EvaluationMarkerProps {
  /** The outcome of the evaluation */
  outcome: EvaluationOutcome;
  /** The content of the recall point that was evaluated (optional) */
  recallPointContent?: string;
  /** Confidence score from 0 to 1 (optional) */
  confidence?: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Maps evaluation outcome to badge status and display label.
 *
 * @param outcome - The evaluation outcome
 * @returns Object with badge status and display text
 */
function getOutcomeConfig(outcome: EvaluationOutcome): {
  status: 'success' | 'error' | 'warning';
  label: string;
  icon: string;
} {
  switch (outcome) {
    case 'success':
      return {
        status: 'success',
        label: 'Recalled',
        icon: 'check-circle', // Checkmark icon representation
      };
    case 'fail':
      return {
        status: 'error',
        label: 'Not Recalled',
        icon: 'x-circle', // X icon representation
      };
    case 'partial':
      return {
        status: 'warning',
        label: 'Partial Recall',
        icon: 'minus-circle', // Partial icon representation
      };
    default:
      return {
        status: 'warning',
        label: 'Unknown',
        icon: 'question-circle',
      };
  }
}

/**
 * Formats a confidence score as a percentage string.
 *
 * @param confidence - Confidence value from 0 to 1
 * @returns Formatted percentage string
 */
function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}% confidence`;
}

// ============================================================================
// EvaluationMarker Component
// ============================================================================

/**
 * Renders an inline evaluation marker showing the result of a recall evaluation.
 *
 * The marker is color-coded based on outcome:
 * - Green for success
 * - Red for failure
 * - Yellow for partial recall
 *
 * Optionally displays the evaluated recall point content and confidence score.
 */
export function EvaluationMarker({
  outcome,
  recallPointContent,
  confidence,
}: EvaluationMarkerProps) {
  const config = getOutcomeConfig(outcome);

  return (
    <div className="inline-flex items-start gap-2 p-3 rounded-lg bg-opacity-50 border border-opacity-30 w-full max-w-md"
      style={{
        // Dynamic background based on outcome
        backgroundColor:
          outcome === 'success'
            ? 'rgba(34, 197, 94, 0.1)' // green-500 with opacity
            : outcome === 'fail'
            ? 'rgba(239, 68, 68, 0.1)' // red-500 with opacity
            : 'rgba(234, 179, 8, 0.1)', // yellow-500 with opacity
        borderColor:
          outcome === 'success'
            ? 'rgba(34, 197, 94, 0.3)'
            : outcome === 'fail'
            ? 'rgba(239, 68, 68, 0.3)'
            : 'rgba(234, 179, 8, 0.3)',
      }}
    >
      {/* Evaluation icon - using text representation */}
      <span
        className={`text-lg flex-shrink-0 ${
          outcome === 'success'
            ? 'text-green-600'
            : outcome === 'fail'
            ? 'text-red-600'
            : 'text-yellow-600'
        }`}
        aria-hidden="true"
      >
        {outcome === 'success' ? '\u2713' : outcome === 'fail' ? '\u2717' : '\u25CB'}
      </span>

      {/* Marker content */}
      <div className="flex-1 min-w-0">
        {/* Outcome badge */}
        <div className="flex items-center gap-2 mb-1">
          <Badge status={config.status}>{config.label}</Badge>
          {/* Show confidence if available */}
          {confidence !== undefined && (
            <span className="text-xs text-gray-500">{formatConfidence(confidence)}</span>
          )}
        </div>

        {/* Recall point content - truncated if too long */}
        {recallPointContent && (
          <p className="text-sm text-gray-600 truncate" title={recallPointContent}>
            <span className="font-medium">Tested:</span> {recallPointContent}
          </p>
        )}
      </div>
    </div>
  );
}

export default EvaluationMarker;
