/**
 * Spinner Component
 *
 * A loading spinner indicator with configurable size.
 * Uses CSS animation for smooth rotation.
 *
 * Accessibility:
 * - Includes screen reader text via aria-label
 * - Hidden from assistive technology when used decoratively
 */

import type { HTMLAttributes } from 'react';

/** Available spinner sizes */
type SpinnerSize = 'sm' | 'md' | 'lg';

export interface SpinnerProps extends HTMLAttributes<HTMLDivElement> {
  /** Size of the spinner */
  size?: SpinnerSize;
  /** Accessible label for screen readers */
  label?: string;
}

/**
 * Tailwind classes for spinner sizes
 * Sizes are designed to work well inline with text or standalone
 */
const sizeClasses: Record<SpinnerSize, string> = {
  sm: 'w-4 h-4 border-2',
  md: 'w-6 h-6 border-2',
  lg: 'w-8 h-8 border-3',
};

/**
 * Animated loading spinner component.
 * Renders a circular spinner with a visible arc that rotates.
 */
export function Spinner({
  size = 'md',
  label = 'Loading...',
  className = '',
  ...props
}: SpinnerProps) {
  return (
    <div
      role="status"
      aria-label={label}
      className={`
        inline-block
        ${sizeClasses[size]}
        border-clarity-200
        border-t-clarity-600
        rounded-full
        animate-spin
        ${className}
      `.trim()}
      {...props}
    >
      {/* Screen reader only text for accessibility */}
      <span className="sr-only">{label}</span>
    </div>
  );
}
