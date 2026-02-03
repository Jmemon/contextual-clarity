/**
 * Recall Sets List Page Component
 *
 * Displays a list of all recall sets (collections of items to learn).
 * Each recall set contains related concepts/facts organized together.
 *
 * Features to be implemented:
 * - List view of all recall sets with metadata
 * - Search and filter functionality
 * - Create new recall set action
 * - Quick stats (item count, due count, retention rate)
 * - Click through to individual recall set details
 *
 * @route /recall-sets
 */

import { Link } from 'react-router-dom';

// ============================================================================
// Placeholder Data
// ============================================================================

/**
 * Placeholder recall sets for demonstration.
 * Will be replaced with actual API data from useQuery.
 */
const PLACEHOLDER_SETS = [
  { id: '1', name: 'JavaScript Fundamentals', itemCount: 42, dueCount: 5 },
  { id: '2', name: 'React Hooks', itemCount: 18, dueCount: 3 },
  { id: '3', name: 'TypeScript Advanced', itemCount: 35, dueCount: 0 },
  { id: '4', name: 'CSS Grid & Flexbox', itemCount: 24, dueCount: 8 },
];

// ============================================================================
// Recall Set Card Component
// ============================================================================

/**
 * Card component displaying a single recall set summary.
 * Links to the detail page for that set.
 */
function RecallSetCard({
  id,
  name,
  itemCount,
  dueCount,
}: {
  id: string;
  name: string;
  itemCount: number;
  dueCount: number;
}) {
  return (
    <Link
      to={`/recall-sets/${id}`}
      className="block bg-white rounded-lg border border-clarity-200 p-6 hover:border-clarity-400 hover:shadow-sm transition-all duration-150"
    >
      {/* Set name */}
      <h3 className="text-lg font-medium text-clarity-800 mb-2">{name}</h3>

      {/* Stats row */}
      <div className="flex gap-4 text-sm">
        <span className="text-clarity-500">
          {itemCount} items
        </span>
        {dueCount > 0 && (
          <span className="text-amber-600 font-medium">
            {dueCount} due
          </span>
        )}
      </div>
    </Link>
  );
}

// ============================================================================
// Recall Sets Page Component
// ============================================================================

/**
 * Recall sets list page showing all available sets.
 *
 * Future enhancements:
 * - Fetch recall sets from API using React Query
 * - Search/filter functionality
 * - Create new set modal or page
 * - Sorting options (alphabetical, due count, last studied)
 * - Empty state when no sets exist
 */
export function RecallSets() {
  return (
    <div className="p-8">
      {/* Page header with title and actions */}
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-clarity-800 mb-2">
            Recall Sets
          </h1>
          <p className="text-clarity-600">
            Organize your learning materials into themed collections.
          </p>
        </div>

        {/* Create new set button - placeholder for now */}
        <button
          type="button"
          className="px-4 py-2 bg-clarity-600 text-white rounded-lg hover:bg-clarity-700 transition-colors font-medium"
          onClick={() => alert('Create set functionality coming soon!')}
        >
          + New Set
        </button>
      </header>

      {/* Search and filter bar - placeholder */}
      <div className="mb-6">
        <input
          type="search"
          placeholder="Search recall sets..."
          className="w-full max-w-md px-4 py-2 border border-clarity-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-clarity-500 focus:border-transparent"
          disabled
        />
      </div>

      {/* Recall sets grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {PLACEHOLDER_SETS.map((set) => (
          <RecallSetCard
            key={set.id}
            id={set.id}
            name={set.name}
            itemCount={set.itemCount}
            dueCount={set.dueCount}
          />
        ))}
      </section>

      {/* Placeholder note */}
      <p className="mt-8 text-sm text-clarity-400 text-center">
        Showing placeholder data. Real data will be loaded from the API.
      </p>
    </div>
  );
}

export default RecallSets;
