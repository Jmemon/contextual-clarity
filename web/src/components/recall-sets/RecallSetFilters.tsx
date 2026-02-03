/**
 * RecallSetFilters Component
 *
 * Filter controls for the recall sets list page.
 * Allows users to filter recall sets by their status:
 * - All: Shows all recall sets regardless of status
 * - Active: Shows only actively studied sets
 * - Paused: Shows only temporarily paused sets
 * - Archived: Shows only archived/inactive sets
 *
 * Uses a tab-style button group for intuitive navigation between filter states.
 * The active filter is visually highlighted with a different background color.
 */

import type { RecallSetStatus } from '@/types/api';

// ============================================================================
// Types
// ============================================================================

/** The filter value can be a specific status or 'all' for no filtering */
export type RecallSetFilterValue = RecallSetStatus | 'all';

export interface RecallSetFiltersProps {
  /** The currently selected filter value */
  value: RecallSetFilterValue;
  /** Callback fired when the filter value changes */
  onChange: (value: RecallSetFilterValue) => void;
  /** Optional counts for each filter category (for badge display) */
  counts?: {
    all: number;
    active: number;
    paused: number;
    archived: number;
  };
}

// ============================================================================
// Filter Configuration
// ============================================================================

/**
 * Configuration for each filter option.
 * Defines the label shown to users and the filter value used internally.
 */
interface FilterOption {
  label: string;
  value: RecallSetFilterValue;
}

const FILTER_OPTIONS: FilterOption[] = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Paused', value: 'paused' },
  { label: 'Archived', value: 'archived' },
];

// ============================================================================
// RecallSetFilters Component
// ============================================================================

/**
 * Tab-style filter component for recall sets.
 *
 * Renders a horizontal button group where each button represents a filter option.
 * The currently selected filter is highlighted with a filled background.
 * Optional count badges can be displayed next to each filter label.
 *
 * @param value - The currently selected filter value
 * @param onChange - Callback when filter selection changes
 * @param counts - Optional counts for badge display
 */
export function RecallSetFilters({
  value,
  onChange,
  counts,
}: RecallSetFiltersProps) {
  return (
    <nav
      className="flex gap-1 p-1 bg-gray-100 rounded-lg"
      role="tablist"
      aria-label="Filter recall sets by status"
    >
      {FILTER_OPTIONS.map((option) => {
        // Check if this option is currently selected
        const isSelected = value === option.value;

        // Get the count for this filter option if counts are provided
        const count = counts?.[option.value];

        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={isSelected}
            aria-controls="recall-sets-list"
            onClick={() => onChange(option.value)}
            className={`
              px-4 py-2 text-sm font-medium rounded-md
              transition-colors duration-150
              focus:outline-none focus:ring-2 focus:ring-clarity-500 focus:ring-offset-1
              ${
                isSelected
                  ? 'bg-white text-clarity-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }
            `}
          >
            {option.label}
            {/* Show count badge if counts are provided */}
            {count !== undefined && (
              <span
                className={`
                  ml-2 px-1.5 py-0.5 text-xs rounded-full
                  ${
                    isSelected
                      ? 'bg-clarity-100 text-clarity-700'
                      : 'bg-gray-200 text-gray-600'
                  }
                `}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

export default RecallSetFilters;
