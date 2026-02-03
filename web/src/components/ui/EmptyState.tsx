/**
 * EmptyState Component
 *
 * A placeholder component for displaying when no data is available.
 * Commonly used in lists, tables, or dashboards with no content.
 *
 * Features:
 * - Optional icon (accepts any React node)
 * - Title and description text
 * - Optional action button/element
 * - Centered, visually appealing layout
 */

import type { HTMLAttributes, ReactNode } from 'react';

export interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  /** Icon or illustration to display at the top */
  icon?: ReactNode;
  /** Main heading text */
  title: string;
  /** Descriptive text explaining the empty state */
  description?: string;
  /** Optional action element (e.g., a button to create new item) */
  action?: ReactNode;
}

/**
 * Empty state placeholder component.
 * Provides a friendly message when there's no content to display.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className = '',
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={`
        flex flex-col items-center justify-center
        py-12 px-6
        text-center
        ${className}
      `.trim()}
      {...props}
    >
      {/* Icon container with muted styling */}
      {icon && (
        <div className="mb-4 text-gray-400" aria-hidden="true">
          {icon}
        </div>
      )}

      {/* Title text - prominent but not overwhelming */}
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>

      {/* Description text - secondary, explanatory */}
      {description && (
        <p className="text-gray-500 max-w-sm mb-6">{description}</p>
      )}

      {/* Action element - typically a button */}
      {action && <div>{action}</div>}
    </div>
  );
}

/**
 * Default empty state icon - a simple document/box icon
 * Can be used when no custom icon is provided
 */
export function DefaultEmptyIcon({ className = 'w-12 h-12' }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
      />
    </svg>
  );
}
