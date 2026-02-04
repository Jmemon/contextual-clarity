/**
 * ErrorState Component
 *
 * Displays a user-friendly error message with an optional retry button.
 * Use this component when data fetching fails or an operation encounters an error.
 *
 * Features:
 * - Error icon for visual indication
 * - Customizable title and message
 * - Optional retry button with callback
 * - Centered layout (works in containers or full-page)
 *
 * @example
 * ```tsx
 * // Basic error display
 * <ErrorState
 *   title="Failed to load data"
 *   message="Please check your connection and try again."
 * />
 *
 * // With retry functionality
 * <ErrorState
 *   title="Something went wrong"
 *   message="We couldn't load your recall sets."
 *   onRetry={() => refetch()}
 * />
 * ```
 */

import type { HTMLAttributes } from 'react';
import { Button } from './Button';

export interface ErrorStateProps extends HTMLAttributes<HTMLDivElement> {
  /** Main error title displayed prominently */
  title: string;
  /** Descriptive error message with more details */
  message: string;
  /** Optional callback to retry the failed operation */
  onRetry?: () => void;
  /** Text for the retry button (defaults to "Try again") */
  retryText?: string;
}

/**
 * Error icon component - displays a warning/error indicator.
 * Uses a circle with an exclamation mark design.
 */
function ErrorIcon({ className = 'w-12 h-12' }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      {/* Circle outline */}
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  );
}

/**
 * ErrorState component for displaying error messages.
 *
 * Provides a consistent, accessible way to show errors across the application.
 * The layout is centered and works well both in small containers and full-page views.
 */
export function ErrorState({
  title,
  message,
  onRetry,
  retryText = 'Try again',
  className = '',
  ...props
}: ErrorStateProps) {
  return (
    <div
      // Use ARIA role="alert" to announce error to screen readers
      role="alert"
      className={`
        flex flex-col items-center justify-center
        py-12 px-6
        text-center
        ${className}
      `.trim()}
      {...props}
    >
      {/* Error icon with red color for visual indication */}
      <div className="mb-4 text-red-500" aria-hidden="true">
        <ErrorIcon />
      </div>

      {/* Error title - prominent styling */}
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>

      {/* Error message - secondary, explanatory text */}
      <p className="text-gray-500 max-w-sm mb-6">{message}</p>

      {/* Optional retry button */}
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          {retryText}
        </Button>
      )}
    </div>
  );
}
