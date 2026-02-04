/**
 * Session Controls Component for Live Sessions
 *
 * Provides control buttons for managing the live session:
 * - "I've got it" button to trigger recall evaluation
 * - "End Session" button to end the session early
 *
 * Features:
 * - Loading states for async operations
 * - Disabled states when waiting for response
 * - Confirmation for ending session early
 *
 * @example
 * ```tsx
 * <SessionControls
 *   onTriggerEvaluation={triggerEvaluation}
 *   onEndSession={endSession}
 *   disabled={isWaitingForResponse}
 * />
 * ```
 */

import { useState, type HTMLAttributes } from 'react';
import { Button } from '@/components/ui/Button';

// ============================================================================
// Types
// ============================================================================

export interface SessionControlsProps extends HTMLAttributes<HTMLDivElement> {
  /** Callback when "I've got it" is clicked */
  onTriggerEvaluation: () => void;
  /** Callback when "End Session" is clicked (after confirmation) */
  onEndSession: () => void;
  /** Whether controls are disabled (e.g., waiting for response) */
  disabled?: boolean;
  /** Whether evaluation is in progress */
  isEvaluating?: boolean;
  /** Whether the session has completed */
  isSessionComplete?: boolean;
}

// ============================================================================
// Component Implementation
// ============================================================================

/**
 * Control buttons for live session actions.
 * Includes "I've got it" for triggering evaluation and "End Session" for early exit.
 */
export function SessionControls({
  onTriggerEvaluation,
  onEndSession,
  disabled = false,
  isEvaluating = false,
  isSessionComplete = false,
  className = '',
  ...props
}: SessionControlsProps) {
  // State for showing end session confirmation
  const [showEndConfirm, setShowEndConfirm] = useState(false);

  /**
   * Handle "I've got it" click.
   */
  const handleTriggerEvaluation = () => {
    if (!disabled && !isEvaluating) {
      onTriggerEvaluation();
    }
  };

  /**
   * Handle end session request.
   * Shows confirmation first if not already shown.
   */
  const handleEndSessionClick = () => {
    if (showEndConfirm) {
      onEndSession();
      setShowEndConfirm(false);
    } else {
      setShowEndConfirm(true);
    }
  };

  /**
   * Cancel ending session and hide confirmation.
   */
  const handleCancelEnd = () => {
    setShowEndConfirm(false);
  };

  // Don't show controls if session is complete
  if (isSessionComplete) {
    return null;
  }

  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`} {...props}>
      {/* "I've got it" button - main action */}
      <Button
        variant="primary"
        size="md"
        onClick={handleTriggerEvaluation}
        disabled={disabled || isEvaluating}
        isLoading={isEvaluating}
        className="bg-green-600 hover:bg-green-700 focus:ring-green-500"
      >
        {isEvaluating ? 'Evaluating...' : "I've got it!"}
      </Button>

      {/* End session button/confirmation */}
      {showEndConfirm ? (
        <div className="flex items-center gap-2">
          <span className="text-sm text-clarity-300">End session?</span>
          <Button
            variant="danger"
            size="sm"
            onClick={handleEndSessionClick}
          >
            Yes, End
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCancelEnd}
            className="text-clarity-300 hover:text-white hover:bg-clarity-700"
          >
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          variant="secondary"
          size="md"
          onClick={handleEndSessionClick}
          disabled={disabled}
          className="bg-clarity-700 border-clarity-600 text-clarity-200 hover:bg-clarity-600 hover:text-white"
        >
          End Session
        </Button>
      )}
    </div>
  );
}

export default SessionControls;
