/**
 * Progress Component
 *
 * A horizontal progress bar for displaying completion status.
 * Commonly used for loading states, task completion, or quotas.
 *
 * Features:
 * - Configurable value (0-100)
 * - Optional label
 * - Optional value display
 * - Multiple color variants
 * - Accessible with ARIA attributes
 */

import type { HTMLAttributes } from 'react';

/** Color variants for the progress bar */
type ProgressVariant = 'primary' | 'success' | 'warning' | 'error';

export interface ProgressProps extends HTMLAttributes<HTMLDivElement> {
  /** Current progress value (0-100) */
  value: number;
  /** Maximum value (default: 100) */
  max?: number;
  /** Optional label displayed above the progress bar */
  label?: string;
  /** Whether to show the percentage value */
  showValue?: boolean;
  /** Color variant of the progress bar */
  variant?: ProgressVariant;
  /** Size of the progress bar */
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Tailwind classes for progress bar fill colors
 */
const variantClasses: Record<ProgressVariant, string> = {
  primary: 'bg-clarity-600',
  success: 'bg-green-600',
  warning: 'bg-amber-500',
  error: 'bg-red-600',
};

/**
 * Tailwind classes for progress bar sizes
 */
const sizeClasses: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'h-1',
  md: 'h-2',
  lg: 'h-3',
};

/**
 * Progress bar component.
 * Displays a horizontal bar showing progress toward a goal.
 */
export function Progress({
  value,
  max = 100,
  label,
  showValue = false,
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ProgressProps) {
  // Calculate percentage, clamped between 0 and 100
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className={className} {...props}>
      {/* Header with label and value */}
      {(label || showValue) && (
        <div className="flex justify-between items-center mb-1">
          {/* Label on the left */}
          {label && (
            <span className="text-sm font-medium text-gray-700">{label}</span>
          )}

          {/* Percentage value on the right */}
          {showValue && (
            <span className="text-sm font-medium text-gray-500">
              {Math.round(percentage)}%
            </span>
          )}
        </div>
      )}

      {/* Progress bar container */}
      <div
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label || 'Progress'}
        className={`
          w-full
          bg-gray-200
          rounded-full
          overflow-hidden
          ${sizeClasses[size]}
        `}
      >
        {/* Filled portion of the progress bar */}
        <div
          className={`
            ${sizeClasses[size]}
            ${variantClasses[variant]}
            rounded-full
            transition-all duration-300 ease-out
          `}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
