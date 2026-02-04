/**
 * LoadingState Component
 *
 * A flexible loading indicator that can be used either as a full-page
 * loading screen or as an inline loading indicator within a section.
 *
 * Features:
 * - Uses the existing Spinner component for consistency
 * - Optional loading message
 * - Full-page mode: Centers in viewport with minimum height
 * - Inline mode: Centers in its container
 *
 * @example
 * ```tsx
 * // Full-page loading (e.g., initial page load)
 * <LoadingState fullPage message="Loading your dashboard..." />
 *
 * // Inline loading (e.g., within a card or section)
 * <LoadingState message="Loading items..." />
 *
 * // Minimal loading (just the spinner)
 * <LoadingState />
 * ```
 */

import type { HTMLAttributes } from 'react';
import { Spinner } from './Spinner';

export interface LoadingStateProps extends HTMLAttributes<HTMLDivElement> {
  /** Optional message displayed below the spinner */
  message?: string;
  /**
   * When true, centers the loading state in the viewport.
   * When false (default), centers in its container.
   */
  fullPage?: boolean;
  /** Size of the spinner (passed to Spinner component) */
  spinnerSize?: 'sm' | 'md' | 'lg';
}

/**
 * LoadingState component for consistent loading indicators.
 *
 * Use fullPage mode when loading an entire page or route.
 * Use inline mode (default) when loading a section within a page.
 */
export function LoadingState({
  message,
  fullPage = false,
  spinnerSize = 'lg',
  className = '',
  ...props
}: LoadingStateProps) {
  // Base classes for centering and layout
  const baseClasses = 'flex flex-col items-center justify-center';

  // Full-page mode: fixed height to center in viewport
  // Inline mode: padding for spacing within containers
  const modeClasses = fullPage
    ? 'min-h-[80vh]' // Leave room for header/nav if present
    : 'py-12 px-6';

  return (
    <div
      // Use role="status" and aria-live for accessibility
      role="status"
      aria-live="polite"
      className={`
        ${baseClasses}
        ${modeClasses}
        ${className}
      `.trim()}
      {...props}
    >
      {/* Spinner component with configurable size */}
      <Spinner size={spinnerSize} label={message || 'Loading...'} />

      {/* Optional message displayed below spinner */}
      {message && (
        <p className="mt-4 text-gray-500 text-sm">{message}</p>
      )}
    </div>
  );
}
