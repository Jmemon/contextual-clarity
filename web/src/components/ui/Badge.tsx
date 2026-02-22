/**
 * Badge Component
 *
 * A small label used to indicate status or category.
 * Supports multiple status variants with semantic colors.
 *
 * Status variants:
 * - success: Positive outcomes (green)
 * - warning: Caution/attention needed (amber/yellow)
 * - error: Problems or failures (red)
 * - info: Neutral information (blue)
 */

import type { HTMLAttributes, ReactNode } from 'react';

/** Badge status variants */
type BadgeStatus = 'success' | 'warning' | 'error' | 'info';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** Status variant determining the badge color */
  status?: BadgeStatus;
  /** Badge content */
  children: ReactNode;
}

/**
 * Tailwind classes for each status variant
 * Uses background and text color combinations for good contrast
 */
const statusClasses: Record<BadgeStatus, string> = {
  success: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  warning: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  error: 'bg-red-500/20 text-red-400 border-red-500/30',
  info: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
};

/**
 * Badge component for displaying status indicators.
 * Compact pill-shaped design with semantic color coding.
 */
export function Badge({
  status = 'info',
  children,
  className = '',
  ...props
}: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center
        px-2.5 py-0.5
        text-xs font-medium
        rounded-full
        border
        ${statusClasses[status]}
        ${className}
      `.trim()}
      {...props}
    >
      {children}
    </span>
  );
}
