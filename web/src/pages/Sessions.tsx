/**
 * Sessions History Page Component
 *
 * Displays a paginated list of all past study sessions with filtering capabilities.
 * Users can filter by:
 * - Recall set (dropdown with all available sets)
 * - Date range (start and end date pickers)
 *
 * Features:
 * - Pagination with Previous/Next controls
 * - Real-time data from the API via React Query
 * - Loading states with spinner
 * - Empty states when no sessions match filters
 * - Links to session replay for detailed review
 *
 * @route /sessions
 */

import { useState, useCallback } from 'react';
import { useSessions } from '@/hooks/api/use-sessions';
import { useRecallSets } from '@/hooks/api/use-recall-sets';
import { Spinner, Button } from '@/components/ui';
import {
  SessionFilters,
  SessionTable,
  type SessionFilterValues,
} from '@/components/sessions';
import type { SessionFilters as SessionFiltersType } from '@/types/api';

// ============================================================================
// Constants
// ============================================================================

/**
 * Default number of sessions to show per page.
 * Can be adjusted based on UX preferences and screen real estate.
 */
const PAGE_SIZE = 10;

// ============================================================================
// Sessions Page Component
// ============================================================================

/**
 * Session history page showing all past study sessions.
 *
 * Uses useSessions hook with filters and pagination to fetch session data.
 * Composed of:
 * - SessionFilters: For filtering by recall set and date range
 * - SessionTable: For displaying the session list
 * - Pagination controls: For navigating through pages of sessions
 */
export function Sessions() {
  // ============================================================================
  // Filter State
  // ============================================================================

  /**
   * Combined filter state including pagination.
   * Starts with just pagination, filters are added when user applies them.
   */
  const [filters, setFilters] = useState<SessionFiltersType>({
    limit: PAGE_SIZE,
    offset: 0,
  });

  // ============================================================================
  // Data Fetching
  // ============================================================================

  /**
   * Fetch sessions with current filters and pagination.
   * React Query handles caching, deduplication, and background updates.
   */
  const {
    data: sessionsData,
    isLoading: isLoadingSessions,
    isFetching: isFetchingSessions,
  } = useSessions(filters);

  /**
   * Fetch all recall sets for the filter dropdown and table display.
   * This provides the mapping from recall set IDs to names.
   */
  const { data: recallSets } = useRecallSets();

  // ============================================================================
  // Pagination Helpers
  // ============================================================================

  /**
   * Calculate current page number (1-indexed for display).
   */
  const currentPage = Math.floor((filters.offset ?? 0) / PAGE_SIZE) + 1;

  /**
   * Calculate total number of pages based on total sessions.
   */
  const totalPages = sessionsData?.pagination
    ? Math.ceil(sessionsData.pagination.total / PAGE_SIZE)
    : 0;

  /**
   * Check if there's a previous page to navigate to.
   */
  const hasPreviousPage = (filters.offset ?? 0) > 0;

  /**
   * Check if there's a next page to navigate to.
   * Uses the hasMore flag from the API pagination response.
   */
  const hasNextPage = sessionsData?.pagination?.hasMore ?? false;

  // ============================================================================
  // Event Handlers
  // ============================================================================

  /**
   * Handle filter application from SessionFilters component.
   * Resets pagination to page 1 when filters change to show relevant results.
   */
  const handleApplyFilters = useCallback((newFilters: SessionFilterValues) => {
    setFilters((prev) => ({
      ...prev,
      // Apply new filter values
      recallSetId: newFilters.recallSetId,
      startDate: newFilters.startDate,
      endDate: newFilters.endDate,
      // Reset to first page when filters change
      offset: 0,
    }));
  }, []);

  /**
   * Handle filter clear from SessionFilters component.
   * Removes all filter criteria and resets to first page.
   */
  const handleClearFilters = useCallback(() => {
    setFilters({
      limit: PAGE_SIZE,
      offset: 0,
      // Clear all filter fields
      recallSetId: undefined,
      startDate: undefined,
      endDate: undefined,
    });
  }, []);

  /**
   * Navigate to the previous page of results.
   */
  const handlePreviousPage = useCallback(() => {
    setFilters((prev) => ({
      ...prev,
      offset: Math.max(0, (prev.offset ?? 0) - PAGE_SIZE),
    }));
  }, []);

  /**
   * Navigate to the next page of results.
   */
  const handleNextPage = useCallback(() => {
    setFilters((prev) => ({
      ...prev,
      offset: (prev.offset ?? 0) + PAGE_SIZE,
    }));
  }, []);

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="p-8">
      {/* Page Header */}
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">
          Session History
        </h1>
        <p className="text-gray-600">
          Review your past study sessions and track your learning progress.
        </p>
      </header>

      {/* Filter Controls */}
      <SessionFilters
        recallSetId={filters.recallSetId}
        startDate={filters.startDate}
        endDate={filters.endDate}
        onApply={handleApplyFilters}
        onClear={handleClearFilters}
        isLoading={isFetchingSessions}
      />

      {/* Loading State - Show spinner during initial load */}
      {isLoadingSessions ? (
        <div className="flex items-center justify-center py-16">
          <Spinner size="lg" label="Loading sessions..." />
        </div>
      ) : (
        <>
          {/* Session Table */}
          <SessionTable
            sessions={sessionsData?.sessions ?? []}
            recallSets={recallSets}
          />

          {/* Pagination Controls */}
          {sessionsData && sessionsData.pagination.total > 0 && (
            <div className="mt-6 flex items-center justify-between">
              {/* Results Summary */}
              <p className="text-sm text-gray-600">
                Showing{' '}
                <span className="font-medium">
                  {(filters.offset ?? 0) + 1}
                </span>{' '}
                to{' '}
                <span className="font-medium">
                  {Math.min(
                    (filters.offset ?? 0) + PAGE_SIZE,
                    sessionsData.pagination.total
                  )}
                </span>{' '}
                of{' '}
                <span className="font-medium">
                  {sessionsData.pagination.total}
                </span>{' '}
                sessions
              </p>

              {/* Page Navigation Buttons */}
              <div className="flex items-center gap-4">
                {/* Page Indicator */}
                <span className="text-sm text-gray-600">
                  Page {currentPage} of {totalPages}
                </span>

                {/* Navigation Buttons */}
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handlePreviousPage}
                    disabled={!hasPreviousPage || isFetchingSessions}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleNextPage}
                    disabled={!hasNextPage || isFetchingSessions}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* No Results Message - Only show when filters are applied but no results */}
          {sessionsData &&
            sessionsData.pagination.total === 0 &&
            (filters.recallSetId || filters.startDate || filters.endDate) && (
              <p className="mt-4 text-center text-sm text-gray-500">
                No sessions match your current filters. Try adjusting your
                search criteria.
              </p>
            )}
        </>
      )}
    </div>
  );
}

export default Sessions;
