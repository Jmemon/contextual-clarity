/**
 * Root Application Component
 *
 * This is the main App component that serves as the entry point for the
 * Contextual Clarity frontend. Currently displays a simple placeholder.
 *
 * Future enhancements will add:
 * - React Router for navigation
 * - React Query provider for data fetching
 * - Layout components with navigation
 * - Authentication context
 */

/**
 * Main application component
 * Renders a centered placeholder with the app name
 */
function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-clarity-50 to-clarity-100 flex items-center justify-center">
      <div className="text-center">
        {/* Main heading with app name */}
        <h1 className="text-4xl font-bold text-clarity-800 mb-4">
          Contextual Clarity
        </h1>

        {/* Tagline describing the application */}
        <p className="text-clarity-600 text-lg max-w-md mx-auto">
          A conversational spaced repetition system combining FSRS scheduling
          with Socratic AI dialogs.
        </p>

        {/* Status indicator showing the app is working */}
        <div className="mt-8 inline-flex items-center gap-2 px-4 py-2 bg-clarity-200 text-clarity-700 rounded-full text-sm">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          Frontend Ready
        </div>
      </div>
    </div>
  );
}

export default App;
