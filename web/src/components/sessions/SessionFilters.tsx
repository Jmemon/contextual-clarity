/**
 * SessionFilters Component
 *
 * Provides filtering controls for the session history list.
 * Allows users to filter sessions by:
 * - Recall set (dropdown with "All" option)
 * - Date range (start and end date inputs)
 *
 * Features:
 * - Integrates with useRecallSets hook for dynamic recall set options
 * - Controlled inputs for filter state management
 * - Apply and Clear buttons for explicit filter actions
 * - Responsive layout that works on mobile and desktop
 *
 * @example
 * ```tsx
 * const [filters, setFilters] = useState<SessionFilters>({});
 *
 * <SessionFilters
 *   recallSetId={filters.recallSetId}
 *   startDate={filters.startDate}
 *   endDate={filters.endDate}
 *   onApply={(newFilters) => setFilters({ ...filters, ...newFilters })}
 *   onClear={() => setFilters({})}
 * />
 * ```
 */

import { useState } from 'react';
import { Select, Input, Button } from '@/components/ui';
import { useRecallSets } from '@/hooks/api/use-recall-sets';

// ============================================================================
// Types
// ============================================================================

/**
 * Filter values that can be applied to session queries.
 * Matches a subset of SessionFilters from the API types.
 */
export interface SessionFilterValues {
  /** Filter by recall set ID (undefined means "all") */
  recallSetId?: string;
  /** Filter sessions started on or after this date (YYYY-MM-DD format) */
  startDate?: string;
  /** Filter sessions started on or before this date (YYYY-MM-DD format) */
  endDate?: string;
}

export interface SessionFiltersProps {
  /** Current recall set filter value */
  recallSetId?: string;
  /** Current start date filter value (YYYY-MM-DD format) */
  startDate?: string;
  /** Current end date filter value (YYYY-MM-DD format) */
  endDate?: string;
  /** Callback when user clicks Apply to submit filters */
  onApply: (filters: SessionFilterValues) => void;
  /** Callback when user clicks Clear to reset all filters */
  onClear: () => void;
  /** Whether the filters are currently being applied (loading state) */
  isLoading?: boolean;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Filter controls for the session history page.
 *
 * Maintains internal state for filter inputs and only commits changes
 * when the user explicitly clicks Apply. This prevents excessive API calls
 * while the user is still adjusting filters.
 */
export function SessionFilters({
  recallSetId,
  startDate,
  endDate,
  onApply,
  onClear,
  isLoading = false,
}: SessionFiltersProps) {
  // Fetch available recall sets for the dropdown filter
  const { data: recallSets, isLoading: isLoadingRecallSets } = useRecallSets();

  // Internal state for filter inputs (mirrors props initially)
  // This allows users to adjust filters without immediate API calls
  const [internalRecallSetId, setInternalRecallSetId] = useState(recallSetId ?? '');
  const [internalStartDate, setInternalStartDate] = useState(startDate ?? '');
  const [internalEndDate, setInternalEndDate] = useState(endDate ?? '');

  /**
   * Handle Apply button click.
   * Collects current filter values and calls the onApply callback.
   * Empty strings are converted to undefined for cleaner filter objects.
   */
  const handleApply = () => {
    onApply({
      recallSetId: internalRecallSetId || undefined,
      startDate: internalStartDate || undefined,
      endDate: internalEndDate || undefined,
    });
  };

  /**
   * Handle Clear button click.
   * Resets all internal filter state and calls the onClear callback.
   */
  const handleClear = () => {
    setInternalRecallSetId('');
    setInternalStartDate('');
    setInternalEndDate('');
    onClear();
  };

  /**
   * Check if any filters are currently set (for enabling Clear button).
   */
  const hasFilters =
    internalRecallSetId !== '' ||
    internalStartDate !== '' ||
    internalEndDate !== '';

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4 mb-4 sm:mb-6">
      {/* Filter controls grid - responsive layout */}
      {/* Stacks fully on mobile, 2 cols on tablet, 4 cols on desktop */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Recall Set Filter Dropdown */}
        <Select
          label="Recall Set"
          value={internalRecallSetId}
          onChange={(e) => setInternalRecallSetId(e.target.value)}
          disabled={isLoadingRecallSets}
        >
          {/* "All" option returns all sessions regardless of recall set */}
          <option value="">All Recall Sets</option>
          {/* Map through available recall sets to create dropdown options */}
          {recallSets?.map((set) => (
            <option key={set.id} value={set.id}>
              {set.name}
            </option>
          ))}
        </Select>

        {/* Start Date Filter Input */}
        <Input
          type="date"
          label="Start Date"
          value={internalStartDate}
          onChange={(e) => setInternalStartDate(e.target.value)}
          // Prevent selecting end date before start date
          max={internalEndDate || undefined}
        />

        {/* End Date Filter Input */}
        <Input
          type="date"
          label="End Date"
          value={internalEndDate}
          onChange={(e) => setInternalEndDate(e.target.value)}
          // Prevent selecting start date after end date
          min={internalStartDate || undefined}
        />

        {/* Action Buttons - Apply and Clear */}
        {/* Full width on mobile, aligns to bottom on larger screens */}
        <div className="flex items-end gap-2 mt-2 sm:mt-0">
          <Button
            variant="primary"
            onClick={handleApply}
            isLoading={isLoading}
            className="flex-1 min-h-[44px]"
          >
            Apply
          </Button>
          <Button
            variant="secondary"
            onClick={handleClear}
            disabled={!hasFilters || isLoading}
            className="flex-1 min-h-[44px]"
          >
            Clear
          </Button>
        </div>
      </div>
    </div>
  );
}
