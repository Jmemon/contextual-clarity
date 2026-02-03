/**
 * Sessions History Page Component
 *
 * Displays a list of all past study sessions with:
 * - Session date and duration
 * - Recall set(s) studied
 * - Performance metrics (items reviewed, accuracy)
 * - Link to session replay for detailed review
 *
 * Allows users to track their learning history and progress over time.
 *
 * @route /sessions
 */

import { Link } from 'react-router-dom';

// ============================================================================
// Placeholder Data
// ============================================================================

/**
 * Placeholder session data for demonstration.
 * Will be replaced with actual API data from useQuery.
 */
const PLACEHOLDER_SESSIONS = [
  {
    id: '1',
    date: '2024-01-15',
    duration: '12 min',
    setName: 'JavaScript Fundamentals',
    itemsReviewed: 15,
    accuracy: 87,
  },
  {
    id: '2',
    date: '2024-01-14',
    duration: '8 min',
    setName: 'React Hooks',
    itemsReviewed: 10,
    accuracy: 90,
  },
  {
    id: '3',
    date: '2024-01-13',
    duration: '20 min',
    setName: 'TypeScript Advanced',
    itemsReviewed: 25,
    accuracy: 76,
  },
  {
    id: '4',
    date: '2024-01-12',
    duration: '15 min',
    setName: 'CSS Grid & Flexbox',
    itemsReviewed: 18,
    accuracy: 94,
  },
];

// ============================================================================
// Session Row Component
// ============================================================================

/**
 * Table row component displaying a single session summary.
 * Links to the session replay page for detailed review.
 */
function SessionRow({
  id,
  date,
  duration,
  setName,
  itemsReviewed,
  accuracy,
}: {
  id: string;
  date: string;
  duration: string;
  setName: string;
  itemsReviewed: number;
  accuracy: number;
}) {
  // Determine accuracy color based on percentage
  const accuracyColor =
    accuracy >= 90
      ? 'text-green-600'
      : accuracy >= 70
        ? 'text-amber-600'
        : 'text-red-600';

  return (
    <tr className="border-b border-clarity-100 hover:bg-clarity-50 transition-colors">
      <td className="py-4 px-4">
        <Link
          to={`/sessions/${id}`}
          className="text-clarity-700 hover:text-clarity-900 font-medium"
        >
          {date}
        </Link>
      </td>
      <td className="py-4 px-4 text-clarity-600">{setName}</td>
      <td className="py-4 px-4 text-clarity-600">{duration}</td>
      <td className="py-4 px-4 text-clarity-600">{itemsReviewed}</td>
      <td className={`py-4 px-4 font-medium ${accuracyColor}`}>
        {accuracy}%
      </td>
      <td className="py-4 px-4">
        <Link
          to={`/sessions/${id}`}
          className="text-clarity-600 hover:text-clarity-800 text-sm"
        >
          View Replay &rarr;
        </Link>
      </td>
    </tr>
  );
}

// ============================================================================
// Sessions Page Component
// ============================================================================

/**
 * Session history page showing all past study sessions.
 *
 * Future enhancements:
 * - Fetch sessions from API using React Query
 * - Date range filtering
 * - Filter by recall set
 * - Pagination for large histories
 * - Export session data
 * - Session analytics summary
 */
export function Sessions() {
  return (
    <div className="p-8">
      {/* Page header */}
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-clarity-800 mb-2">
          Session History
        </h1>
        <p className="text-clarity-600">
          Review your past study sessions and track your learning progress.
        </p>
      </header>

      {/* Filter bar - placeholder */}
      <div className="mb-6 flex gap-4">
        <input
          type="date"
          className="px-4 py-2 border border-clarity-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-clarity-500"
          disabled
        />
        <select
          className="px-4 py-2 border border-clarity-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-clarity-500"
          disabled
        >
          <option>All Recall Sets</option>
        </select>
      </div>

      {/* Sessions table */}
      <div className="bg-white rounded-lg border border-clarity-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-clarity-50 border-b border-clarity-200">
              <th className="py-3 px-4 text-left text-sm font-medium text-clarity-700">
                Date
              </th>
              <th className="py-3 px-4 text-left text-sm font-medium text-clarity-700">
                Recall Set
              </th>
              <th className="py-3 px-4 text-left text-sm font-medium text-clarity-700">
                Duration
              </th>
              <th className="py-3 px-4 text-left text-sm font-medium text-clarity-700">
                Items
              </th>
              <th className="py-3 px-4 text-left text-sm font-medium text-clarity-700">
                Accuracy
              </th>
              <th className="py-3 px-4 text-left text-sm font-medium text-clarity-700">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {PLACEHOLDER_SESSIONS.map((session) => (
              <SessionRow
                key={session.id}
                id={session.id}
                date={session.date}
                duration={session.duration}
                setName={session.setName}
                itemsReviewed={session.itemsReviewed}
                accuracy={session.accuracy}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Placeholder note */}
      <p className="mt-8 text-sm text-clarity-400 text-center">
        Showing placeholder data. Real data will be loaded from the API.
      </p>
    </div>
  );
}

export default Sessions;
