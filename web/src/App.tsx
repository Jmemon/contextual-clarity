/**
 * Root Application Component
 *
 * This is the main App component that serves as the entry point for the
 * Contextual Clarity frontend. It renders the application router which
 * handles all page navigation and routing.
 *
 * The router configuration includes:
 * - MainLayout wrapped routes (Dashboard, Recall Sets, Sessions)
 * - Full-screen routes (Live Session)
 * - 404 catch-all for unknown routes
 *
 * @see router.tsx for route configuration details
 */

import { AppRouter } from './router';

/**
 * Main application component.
 *
 * Simply renders the AppRouter which handles all routing logic.
 * The UserProvider context is already wrapped in main.tsx.
 */
function App() {
  return <AppRouter />;
}

export default App;
