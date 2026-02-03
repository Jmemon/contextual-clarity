/**
 * Not Found (404) Page Component
 *
 * Displays when the user navigates to a route that doesn't exist.
 * Provides a friendly message and navigation back to known routes.
 *
 * @route * (catch-all for unmatched routes)
 */

import { Link, useLocation } from 'react-router-dom';

// ============================================================================
// Not Found Page Component
// ============================================================================

/**
 * 404 Not Found page for unmatched routes.
 *
 * Shows:
 * - Clear 404 error indication
 * - The attempted URL path
 * - Helpful links to navigate back to the app
 */
export function NotFound() {
  // Get the current location to show what URL was attempted
  const location = useLocation();

  return (
    <div className="min-h-screen bg-clarity-50 flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        {/* Large 404 indicator */}
        <div className="text-9xl font-bold text-clarity-200 mb-4">
          404
        </div>

        {/* Error title */}
        <h1 className="text-2xl font-bold text-clarity-800 mb-4">
          Page Not Found
        </h1>

        {/* Error description with attempted path */}
        <p className="text-clarity-600 mb-2">
          Sorry, we couldn't find the page you're looking for.
        </p>
        <p className="text-sm text-clarity-500 mb-8">
          Attempted path: <code className="bg-clarity-100 px-2 py-1 rounded">{location.pathname}</code>
        </p>

        {/* Navigation options */}
        <div className="space-y-4">
          {/* Primary action - go home */}
          <Link
            to="/"
            className="block w-full px-6 py-3 bg-clarity-600 text-white rounded-lg hover:bg-clarity-700 transition-colors font-medium"
          >
            Go to Dashboard
          </Link>

          {/* Secondary navigation links */}
          <div className="flex justify-center gap-4 text-sm">
            <Link
              to="/recall-sets"
              className="text-clarity-600 hover:text-clarity-800 transition-colors"
            >
              Recall Sets
            </Link>
            <span className="text-clarity-300">|</span>
            <Link
              to="/sessions"
              className="text-clarity-600 hover:text-clarity-800 transition-colors"
            >
              Sessions
            </Link>
          </div>
        </div>

        {/* Help text */}
        <p className="mt-8 text-xs text-clarity-400">
          If you believe this is an error, please contact support.
        </p>
      </div>
    </div>
  );
}

export default NotFound;
