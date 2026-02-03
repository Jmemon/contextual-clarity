/**
 * Session Replay Page Component
 *
 * Displays a detailed replay of a past study session including:
 * - Complete conversation history with the AI
 * - Timeline of items reviewed
 * - Performance breakdown per item
 * - FSRS state changes from the session
 *
 * Allows users to review their learning interactions and understand
 * how well they performed on each item.
 *
 * @route /sessions/:id
 */

import { useParams, Link } from 'react-router-dom';

// ============================================================================
// Session Replay Page Component
// ============================================================================

/**
 * Session replay page for reviewing a past study session.
 *
 * Reads the session ID from URL parameters and will fetch
 * the full session data including conversation history.
 *
 * Future enhancements:
 * - Fetch session data using React Query
 * - Display full conversation transcript
 * - Show item-by-item performance
 * - Timeline navigation
 * - Performance analytics graphs
 * - Export session transcript
 */
export function SessionReplay() {
  // Extract the session ID from the URL
  const { id } = useParams<{ id: string }>();

  return (
    <div className="p-8">
      {/* Breadcrumb navigation */}
      <nav className="mb-4">
        <Link
          to="/sessions"
          className="text-clarity-600 hover:text-clarity-800 transition-colors"
        >
          &larr; Back to Sessions
        </Link>
      </nav>

      {/* Page header */}
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-clarity-800 mb-2">
          Session Replay
        </h1>
        <p className="text-clarity-600">
          Reviewing session with ID: <code className="bg-clarity-100 px-2 py-1 rounded text-sm font-mono">{id}</code>
        </p>
      </header>

      {/* Session summary card */}
      <div className="bg-white rounded-lg border border-clarity-200 p-6 mb-6">
        <h2 className="text-xl font-semibold text-clarity-700 mb-4">
          Session Summary
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-clarity-500">Date</p>
            <p className="text-lg font-medium text-clarity-700">--</p>
          </div>
          <div>
            <p className="text-sm text-clarity-500">Duration</p>
            <p className="text-lg font-medium text-clarity-700">--</p>
          </div>
          <div>
            <p className="text-sm text-clarity-500">Items Reviewed</p>
            <p className="text-lg font-medium text-clarity-700">--</p>
          </div>
          <div>
            <p className="text-sm text-clarity-500">Accuracy</p>
            <p className="text-lg font-medium text-clarity-700">--</p>
          </div>
        </div>
      </div>

      {/* Timeline placeholder */}
      <section className="mb-6">
        <h2 className="text-xl font-semibold text-clarity-700 mb-4">
          Session Timeline
        </h2>
        <div className="bg-white rounded-lg border border-clarity-200 p-4">
          <div className="h-16 bg-clarity-50 rounded flex items-center justify-center">
            <span className="text-clarity-400 text-sm">
              Interactive timeline will be displayed here
            </span>
          </div>
        </div>
      </section>

      {/* Conversation transcript placeholder */}
      <section className="mb-6">
        <h2 className="text-xl font-semibold text-clarity-700 mb-4">
          Conversation Transcript
        </h2>
        <div className="bg-white rounded-lg border border-clarity-200 p-6">
          <p className="text-clarity-500 mb-4">
            This section will display the full conversation history:
          </p>
          <ul className="list-disc list-inside text-clarity-600 space-y-2">
            <li>AI questions and prompts</li>
            <li>Your responses</li>
            <li>AI feedback and explanations</li>
            <li>Item-by-item breakdown</li>
            <li>FSRS state changes after each review</li>
          </ul>

          {/* Sample conversation placeholder */}
          <div className="mt-6 space-y-4">
            <div className="p-4 bg-clarity-50 rounded-lg">
              <p className="text-xs text-clarity-500 mb-1">AI</p>
              <p className="text-clarity-700">Sample AI question will appear here...</p>
            </div>
            <div className="p-4 bg-blue-50 rounded-lg ml-8">
              <p className="text-xs text-blue-500 mb-1">You</p>
              <p className="text-blue-700">Your response will appear here...</p>
            </div>
            <div className="p-4 bg-clarity-50 rounded-lg">
              <p className="text-xs text-clarity-500 mb-1">AI</p>
              <p className="text-clarity-700">AI feedback will appear here...</p>
            </div>
          </div>
        </div>
      </section>

      {/* Performance breakdown placeholder */}
      <section>
        <h2 className="text-xl font-semibold text-clarity-700 mb-4">
          Performance Breakdown
        </h2>
        <div className="bg-white rounded-lg border border-clarity-200 p-8 text-center">
          <p className="text-clarity-500">
            Item-by-item performance metrics will be displayed here once API integration is complete.
          </p>
        </div>
      </section>

      {/* Action buttons */}
      <div className="mt-8 flex gap-4">
        <button
          type="button"
          className="px-4 py-2 border border-clarity-300 text-clarity-700 rounded-lg hover:bg-clarity-50 transition-colors font-medium"
          onClick={() => alert('Export functionality coming soon!')}
        >
          Export Transcript
        </button>
      </div>
    </div>
  );
}

export default SessionReplay;
