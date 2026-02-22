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
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        <div className="text-9xl font-bold text-slate-800 mb-4">
          404
        </div>

        <h1 className="text-2xl font-bold text-white mb-4">
          Page Not Found
        </h1>

        <p className="text-slate-400 mb-2">
          Sorry, we couldn't find the page you're looking for.
        </p>
        <p className="text-sm text-slate-500 mb-8">
          Attempted path: <code className="bg-slate-800 px-2 py-1 rounded text-slate-300">{location.pathname}</code>
        </p>

        <div className="space-y-4">
          <Link
            to="/"
            className="block w-full px-6 py-3 bg-clarity-600 text-white rounded-lg hover:bg-clarity-500 transition-all duration-200 font-medium"
          >
            Go Home
          </Link>

          <div className="flex justify-center gap-4 text-sm">
            <Link
              to="/sessions"
              className="text-clarity-400 hover:text-clarity-300 transition-colors"
            >
              Sessions
            </Link>
            <span className="text-slate-700">|</span>
            <Link
              to="/dashboard"
              className="text-clarity-400 hover:text-clarity-300 transition-colors"
            >
              Dashboard
            </Link>
          </div>
        </div>

        <p className="mt-8 text-xs text-slate-600">
          If you believe this is an error, please contact support.
        </p>
      </div>
    </div>
  );
}

export default NotFound;
