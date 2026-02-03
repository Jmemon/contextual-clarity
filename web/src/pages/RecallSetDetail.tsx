/**
 * Recall Set Detail Page Component
 *
 * Displays detailed information about a single recall set including:
 * - Set metadata (name, description, creation date)
 * - List of all items in the set
 * - Statistics (total items, due items, retention rate)
 * - Actions (edit set, add items, start session)
 *
 * Uses route parameter `:id` to fetch the specific recall set.
 *
 * @route /recall-sets/:id
 */

import { useParams, Link } from 'react-router-dom';

// ============================================================================
// Recall Set Detail Page Component
// ============================================================================

/**
 * Detail page for a single recall set.
 *
 * Reads the set ID from the URL parameters and will fetch
 * the corresponding data from the API.
 *
 * Future enhancements:
 * - Fetch recall set data using React Query
 * - Display list of items with their FSRS states
 * - Edit set metadata
 * - Add/remove items
 * - Start a study session for this set
 * - Delete set with confirmation
 */
export function RecallSetDetail() {
  // Extract the recall set ID from the URL
  const { id } = useParams<{ id: string }>();

  return (
    <div className="p-8">
      {/* Breadcrumb navigation */}
      <nav className="mb-4">
        <Link
          to="/recall-sets"
          className="text-clarity-600 hover:text-clarity-800 transition-colors"
        >
          &larr; Back to Recall Sets
        </Link>
      </nav>

      {/* Page header */}
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-clarity-800 mb-2">
          Recall Set Detail
        </h1>
        <p className="text-clarity-600">
          Viewing recall set with ID: <code className="bg-clarity-100 px-2 py-1 rounded text-sm font-mono">{id}</code>
        </p>
      </header>

      {/* Placeholder content card */}
      <div className="bg-white rounded-lg border border-clarity-200 p-6 mb-6">
        <h2 className="text-xl font-semibold text-clarity-700 mb-4">
          Set Information
        </h2>
        <p className="text-clarity-500 mb-4">
          This page will display the recall set's details, items, and allow you to:
        </p>
        <ul className="list-disc list-inside text-clarity-600 space-y-2">
          <li>View and edit set name and description</li>
          <li>Browse all items in this set</li>
          <li>See FSRS scheduling state for each item</li>
          <li>Add new items to the set</li>
          <li>Start a study session with this set</li>
        </ul>
      </div>

      {/* Stats row placeholder */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold text-clarity-700 mb-4">
          Set Statistics
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg border border-clarity-200 p-4">
            <p className="text-sm text-clarity-500 mb-1">Total Items</p>
            <p className="text-2xl font-bold text-clarity-700">--</p>
          </div>
          <div className="bg-white rounded-lg border border-clarity-200 p-4">
            <p className="text-sm text-clarity-500 mb-1">Due Now</p>
            <p className="text-2xl font-bold text-clarity-700">--</p>
          </div>
          <div className="bg-white rounded-lg border border-clarity-200 p-4">
            <p className="text-sm text-clarity-500 mb-1">Retention Rate</p>
            <p className="text-2xl font-bold text-clarity-700">--</p>
          </div>
          <div className="bg-white rounded-lg border border-clarity-200 p-4">
            <p className="text-sm text-clarity-500 mb-1">Last Studied</p>
            <p className="text-2xl font-bold text-clarity-700">--</p>
          </div>
        </div>
      </section>

      {/* Items list placeholder */}
      <section>
        <h2 className="text-xl font-semibold text-clarity-700 mb-4">
          Items in Set
        </h2>
        <div className="bg-white rounded-lg border border-clarity-200 p-8 text-center">
          <p className="text-clarity-500">
            Items list will be displayed here once API integration is complete.
          </p>
        </div>
      </section>

      {/* Action buttons */}
      <div className="mt-8 flex gap-4">
        <button
          type="button"
          className="px-4 py-2 bg-clarity-600 text-white rounded-lg hover:bg-clarity-700 transition-colors font-medium"
          onClick={() => alert('Start session functionality coming soon!')}
        >
          Start Session
        </button>
        <button
          type="button"
          className="px-4 py-2 border border-clarity-300 text-clarity-700 rounded-lg hover:bg-clarity-50 transition-colors font-medium"
          onClick={() => alert('Add item functionality coming soon!')}
        >
          Add Item
        </button>
      </div>
    </div>
  );
}

export default RecallSetDetail;
