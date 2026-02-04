/**
 * Recall Sets List Page Component
 *
 * Displays a list of all recall sets (collections of items to learn).
 * Each recall set contains related concepts/facts organized together.
 *
 * Features:
 * - Grid layout of recall set cards (responsive: 1/2/3 columns)
 * - Filter by status (All, Active, Paused, Archived)
 * - Quick stats on each card (total, due, new points)
 * - Start Session button for quick access to studying
 * - Loading state with spinner
 * - Empty state when no sets match the current filter
 * - Link to create new recall set
 *
 * @route /recall-sets
 */

import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useRecallSets } from '@/hooks/api/use-recall-sets';
import { Spinner, EmptyState, DefaultEmptyIcon, Button } from '@/components/ui';
import {
  RecallSetCard,
  RecallSetFilters,
  type RecallSetFilterValue,
} from '@/components/recall-sets';

// ============================================================================
// Recall Sets Page Component
// ============================================================================

/**
 * Main page component for the recall sets list.
 *
 * Fetches all recall sets using the useRecallSets hook and displays them
 * in a responsive grid. Users can filter by status and quickly start
 * study sessions from this page.
 */
export function RecallSets() {
  // Track the current filter selection (defaults to showing all sets)
  const [filter, setFilter] = useState<RecallSetFilterValue>('all');

  // Fetch all recall sets from the API
  const { data: recallSets, isLoading, error } = useRecallSets();

  // Calculate counts for each filter category
  // This allows the filter component to display count badges
  const filterCounts = useMemo(() => {
    if (!recallSets) {
      return { all: 0, active: 0, paused: 0, archived: 0 };
    }

    return {
      all: recallSets.length,
      active: recallSets.filter((set) => set.status === 'active').length,
      paused: recallSets.filter((set) => set.status === 'paused').length,
      archived: recallSets.filter((set) => set.status === 'archived').length,
    };
  }, [recallSets]);

  // Filter recall sets based on the current filter selection
  // When filter is 'all', show everything; otherwise filter by status
  const filteredSets = useMemo(() => {
    if (!recallSets) {
      return [];
    }

    if (filter === 'all') {
      return recallSets;
    }

    return recallSets.filter((set) => set.status === filter);
  }, [recallSets, filter]);

  // -------------------------------------------------------------------------
  // Loading State
  // -------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="p-8">
        {/* Page header shown during loading */}
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-clarity-800 mb-2">
            Recall Sets
          </h1>
          <p className="text-clarity-600">
            Organize your learning materials into themed collections.
          </p>
        </header>

        {/* Centered spinner with accessible label */}
        <div className="flex justify-center items-center py-16">
          <Spinner size="lg" label="Loading recall sets..." />
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Error State
  // -------------------------------------------------------------------------

  if (error) {
    return (
      <div className="p-8">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-clarity-800 mb-2">
            Recall Sets
          </h1>
        </header>

        <EmptyState
          icon={<DefaultEmptyIcon className="w-12 h-12" />}
          title="Failed to load recall sets"
          description={error.message || 'An unexpected error occurred. Please try again later.'}
          action={
            <Button
              variant="primary"
              onClick={() => window.location.reload()}
            >
              Retry
            </Button>
          }
        />
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Main Render
  // -------------------------------------------------------------------------

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Page header with title and create button - stacks on mobile */}
      <header className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-clarity-800 mb-1 sm:mb-2">
            Recall Sets
          </h1>
          <p className="text-sm sm:text-base text-clarity-600">
            Organize your learning materials into themed collections.
          </p>
        </div>

        {/* Create new set button - full width on mobile, auto width on larger screens */}
        <Link to="/recall-sets/new" className="sm:shrink-0">
          <Button variant="primary" className="w-full sm:w-auto min-h-[44px]">+ New Set</Button>
        </Link>
      </header>

      {/* Filter bar for status filtering - scrolls horizontally on mobile if needed */}
      <div className="mb-4 sm:mb-6 -mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto">
        <RecallSetFilters
          value={filter}
          onChange={setFilter}
          counts={filterCounts}
        />
      </div>

      {/* Recall sets grid or empty state */}
      {/* Responsive: 1 col mobile, 2 cols tablet, 3 cols desktop */}
      {filteredSets.length > 0 ? (
        <section
          id="recall-sets-list"
          role="tabpanel"
          aria-label={`${filter === 'all' ? 'All' : filter} recall sets`}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4"
        >
          {filteredSets.map((recallSet) => (
            <RecallSetCard key={recallSet.id} recallSet={recallSet} />
          ))}
        </section>
      ) : (
        // Empty state when no sets match the current filter
        <EmptyState
          icon={<DefaultEmptyIcon className="w-12 h-12" />}
          title={getEmptyStateTitle(filter)}
          description={getEmptyStateDescription(filter)}
          action={
            filter === 'all' ? (
              <Link to="/recall-sets/new">
                <Button variant="primary">Create Your First Set</Button>
              </Link>
            ) : (
              <Button
                variant="secondary"
                onClick={() => setFilter('all')}
              >
                Show All Sets
              </Button>
            )
          }
        />
      )}
    </div>
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Returns the empty state title based on the current filter.
 * Provides context-specific messaging for better UX.
 */
function getEmptyStateTitle(filter: RecallSetFilterValue): string {
  switch (filter) {
    case 'all':
      return 'No recall sets yet';
    case 'active':
      return 'No active recall sets';
    case 'paused':
      return 'No paused recall sets';
    case 'archived':
      return 'No archived recall sets';
    default:
      return 'No recall sets found';
  }
}

/**
 * Returns the empty state description based on the current filter.
 * Guides users on what to do next.
 */
function getEmptyStateDescription(filter: RecallSetFilterValue): string {
  switch (filter) {
    case 'all':
      return 'Create your first recall set to start organizing your learning materials.';
    case 'active':
      return 'You have no active recall sets. Activate a paused set or create a new one.';
    case 'paused':
      return 'You have no paused recall sets. Pause an active set to see it here.';
    case 'archived':
      return 'You have no archived recall sets. Archive a set to see it here.';
    default:
      return 'No recall sets match the current filter.';
  }
}

export default RecallSets;
