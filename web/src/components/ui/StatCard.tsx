/**
 * StatCard Component
 *
 * A card component designed for displaying statistics and metrics.
 * Commonly used in dashboards for KPIs and summary data.
 *
 * Features:
 * - Large, prominent value display
 * - Label describing the statistic
 * - Optional icon
 * - Optional trend indicator (up/down/neutral)
 * - Optional change percentage
 */

import type { HTMLAttributes, ReactNode } from 'react';

/** Trend direction for change indicator */
type TrendDirection = 'up' | 'down' | 'neutral';

export interface StatCardProps extends HTMLAttributes<HTMLDivElement> {
  /** The main statistic value to display */
  value: string | number;
  /** Label describing what the value represents */
  label: string;
  /** Optional icon to display alongside the stat */
  icon?: ReactNode;
  /** Direction of change trend */
  trend?: TrendDirection;
  /** Change value or percentage to display */
  change?: string;
}

/**
 * Color classes for trend indicators
 * - up: green (positive)
 * - down: red (negative)
 * - neutral: gray (no change)
 */
const trendColors: Record<TrendDirection, string> = {
  up: 'text-green-600',
  down: 'text-red-600',
  neutral: 'text-gray-500',
};

/**
 * Trend arrow icons for each direction
 */
function TrendIcon({ direction }: { direction: TrendDirection }) {
  if (direction === 'up') {
    return (
      <svg
        className="w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M5 10l7-7m0 0l7 7m-7-7v18"
        />
      </svg>
    );
  }

  if (direction === 'down') {
    return (
      <svg
        className="w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M19 14l-7 7m0 0l-7-7m7 7V3"
        />
      </svg>
    );
  }

  // Neutral - horizontal line
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 12h14"
      />
    </svg>
  );
}

/**
 * Statistics display card component.
 * Shows a value with label and optional trend indicator.
 *
 * Features responsive padding and typography:
 * - Compact on mobile for better information density
 * - Full padding on larger screens for spacious feel
 * - Smooth hover transition for visual feedback
 */
export function StatCard({
  value,
  label,
  icon,
  trend,
  change,
  className = '',
  ...props
}: StatCardProps) {
  return (
    <div
      className={`
        bg-white
        rounded-lg
        shadow-md
        border border-gray-200
        p-4 sm:p-6
        transition-shadow duration-200 hover:shadow-lg
        ${className}
      `.trim()}
      {...props}
    >
      <div className="flex items-start justify-between">
        {/* Main content area */}
        <div className="flex-1 min-w-0">
          {/* Label - smaller, secondary text with truncation */}
          <p className="text-xs sm:text-sm font-medium text-gray-500 mb-1 truncate">{label}</p>

          {/* Value - responsive text size, prominent display */}
          <p className="text-2xl sm:text-3xl font-bold text-gray-900 truncate">{value}</p>

          {/* Trend indicator with change value */}
          {trend && change && (
            <div
              className={`
                flex items-center mt-2
                text-xs sm:text-sm font-medium
                ${trendColors[trend]}
              `}
            >
              <TrendIcon direction={trend} />
              <span className="ml-1">{change}</span>
            </div>
          )}
        </div>

        {/* Optional icon on the right side - hidden on very small screens */}
        {icon && (
          <div className="ml-3 sm:ml-4 p-2 sm:p-3 bg-clarity-100 rounded-lg text-clarity-600 shrink-0">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
