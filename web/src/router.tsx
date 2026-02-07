/**
 * Router Configuration
 *
 * Defines all application routes using React Router v6.
 *
 * Route Structure:
 * - Routes using MainLayout (with sidebar navigation):
 *   - / (Dashboard)
 *   - /recall-sets (Recall Sets list)
 *   - /recall-sets/new (Create new Recall Set)
 *   - /recall-sets/:id (Recall Set detail)
 *   - /sessions (Session history)
 *   - /sessions/:id (Session replay)
 *
 * - Routes without MainLayout (full-screen):
 *   - /session/:id (Live session - note singular "session")
 *
 * - Catch-all:
 *   - * (404 Not Found)
 *
 * Note: The distinction between /sessions/:id (plural, for replay)
 * and /session/:id (singular, for live) is intentional to clearly
 * separate completed vs active sessions.
 */

import {
  createBrowserRouter,
  RouterProvider,
} from 'react-router-dom';

// Layout component wrapping routes that need sidebar navigation
import { MainLayout } from './layouts/MainLayout';

// Page components for each route
import { Dashboard } from './pages/Dashboard';
import { RecallSets } from './pages/RecallSets';
import { RecallSetDetail } from './pages/RecallSetDetail';
import { Sessions } from './pages/Sessions';
import { SessionReplay } from './pages/SessionReplay';
import { LiveSession } from './pages/LiveSession';
import { NotFound } from './pages/NotFound';
import { CreateRecallSet } from './pages/CreateRecallSet';

// ============================================================================
// Router Configuration
// ============================================================================

/**
 * Application router configuration.
 *
 * Uses createBrowserRouter for better data loading capabilities
 * (even though we're not using loaders yet, this sets us up for it).
 *
 * Structure:
 * 1. MainLayout routes - wrapped in layout with sidebar
 * 2. Full-screen routes - render without layout chrome
 * 3. Catch-all 404 - handles unknown routes
 */
const router = createBrowserRouter([
  // -------------------------------------------------------------------------
  // Routes with MainLayout (sidebar navigation)
  // -------------------------------------------------------------------------
  {
    // Parent route with layout wrapper
    // Child routes render inside the <Outlet /> component
    element: <MainLayout />,
    children: [
      {
        // Dashboard - main landing page
        path: '/',
        element: <Dashboard />,
      },
      {
        // Recall Sets list - all available sets
        path: '/recall-sets',
        element: <RecallSets />,
      },
      {
        // Create new Recall Set - must come before :id to take precedence
        path: '/recall-sets/new',
        element: <CreateRecallSet />,
      },
      {
        // Recall Set detail - single set with its items
        // :id parameter captures the set ID from URL
        path: '/recall-sets/:id',
        element: <RecallSetDetail />,
      },
      {
        // Sessions history - list of completed sessions
        path: '/sessions',
        element: <Sessions />,
      },
      {
        // Session replay - detailed view of past session
        // Note: plural "sessions" for completed sessions
        path: '/sessions/:id',
        element: <SessionReplay />,
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Full-screen routes (no MainLayout)
  // -------------------------------------------------------------------------
  {
    // Live session - active study session (full-screen)
    // Note: singular "session" for active/live sessions
    // This route renders directly without the sidebar wrapper
    path: '/session/:id',
    element: <LiveSession />,
  },

  // -------------------------------------------------------------------------
  // Catch-all route for 404
  // -------------------------------------------------------------------------
  {
    // Any unmatched route shows the 404 page
    // Must be last in the route config
    path: '*',
    element: <NotFound />,
  },
]);

// ============================================================================
// Router Provider Component
// ============================================================================

/**
 * AppRouter component that provides routing to the application.
 *
 * This wraps RouterProvider and should be rendered at the top level
 * of the application (in App.tsx).
 *
 * @example
 * ```tsx
 * // In App.tsx
 * function App() {
 *   return <AppRouter />;
 * }
 * ```
 */
export function AppRouter() {
  return <RouterProvider router={router} />;
}

export default AppRouter;
