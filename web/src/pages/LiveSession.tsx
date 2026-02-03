/**
 * Live Session Page Component
 *
 * Full-screen study session interface for active learning.
 * This page does NOT use the MainLayout - it's designed for
 * distraction-free, focused study with the AI.
 *
 * Features to be implemented:
 * - Real-time conversation with AI tutor
 * - Item presentation and response input
 * - Progress indicator for session
 * - End session / pause controls
 * - Timer and session statistics
 *
 * The singular route (/session/:id vs /sessions/:id) distinguishes
 * active sessions from completed session history.
 *
 * @route /session/:id
 */

import { useParams, Link } from 'react-router-dom';

// ============================================================================
// Live Session Page Component
// ============================================================================

/**
 * Full-screen live session page for active study.
 *
 * This component renders without the main navigation sidebar
 * to provide a focused, distraction-free learning environment.
 *
 * Future enhancements:
 * - WebSocket connection for real-time AI conversation
 * - Audio input/output support
 * - Progress tracking within session
 * - Keyboard shortcuts for quick responses
 * - Session pause and resume
 * - Emergency exit with session save
 */
export function LiveSession() {
  // Extract the session ID from the URL
  const { id } = useParams<{ id: string }>();

  return (
    <div className="min-h-screen bg-gradient-to-br from-clarity-800 to-clarity-900 flex flex-col">
      {/* Top bar with session info and exit button */}
      <header className="flex items-center justify-between px-6 py-4 bg-clarity-900/50">
        {/* Session info */}
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 rounded-lg bg-clarity-600 flex items-center justify-center text-white text-sm font-bold">
            CC
          </div>
          <div>
            <p className="text-white font-medium">Live Session</p>
            <p className="text-clarity-300 text-sm">Session ID: {id}</p>
          </div>
        </div>

        {/* Session controls */}
        <div className="flex items-center gap-4">
          {/* Timer placeholder */}
          <div className="text-clarity-200 font-mono text-lg">
            00:00
          </div>

          {/* Progress placeholder */}
          <div className="text-clarity-300 text-sm">
            0/0 items
          </div>

          {/* Exit button */}
          <Link
            to="/"
            className="px-4 py-2 bg-clarity-700 text-white rounded-lg hover:bg-clarity-600 transition-colors text-sm"
          >
            Exit Session
          </Link>
        </div>
      </header>

      {/* Main conversation area */}
      <main className="flex-1 flex flex-col max-w-4xl mx-auto w-full px-6 py-8">
        {/* Messages container - scrollable area for conversation */}
        <div className="flex-1 overflow-auto space-y-6 pb-6">
          {/* Welcome message */}
          <div className="bg-clarity-700/50 rounded-2xl rounded-tl-sm p-6 max-w-2xl">
            <p className="text-clarity-100 leading-relaxed">
              Welcome to your study session! This is a full-screen, focused learning environment
              where you'll engage in Socratic dialogue with the AI tutor.
            </p>
            <p className="text-clarity-300 text-sm mt-4">
              This is a placeholder. The actual session conversation will load once
              the session API is connected.
            </p>
          </div>

          {/* Placeholder for AI question */}
          <div className="bg-clarity-700/50 rounded-2xl rounded-tl-sm p-6 max-w-2xl">
            <p className="text-clarity-100 leading-relaxed">
              The AI will present questions here based on your due items
              and guide you through understanding the concepts.
            </p>
          </div>

          {/* Placeholder for user response */}
          <div className="bg-clarity-500/30 rounded-2xl rounded-tr-sm p-6 max-w-2xl ml-auto">
            <p className="text-white leading-relaxed">
              Your responses will appear here. Type in the input below
              to interact with the AI tutor.
            </p>
          </div>
        </div>

        {/* Input area */}
        <div className="border-t border-clarity-700 pt-6">
          <div className="flex gap-4">
            <input
              type="text"
              placeholder="Type your response... (placeholder)"
              disabled
              className="flex-1 px-6 py-4 bg-clarity-700/50 text-white placeholder-clarity-400 rounded-xl focus:outline-none focus:ring-2 focus:ring-clarity-500 disabled:opacity-50"
            />
            <button
              type="button"
              disabled
              className="px-8 py-4 bg-clarity-600 text-white rounded-xl font-medium hover:bg-clarity-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </div>
          <p className="text-clarity-500 text-sm text-center mt-4">
            Press Enter to send your response
          </p>
        </div>
      </main>

      {/* Bottom status bar */}
      <footer className="px-6 py-3 bg-clarity-900/50 text-center">
        <p className="text-clarity-500 text-sm">
          Session interface placeholder - connect to backend to enable live sessions
        </p>
      </footer>
    </div>
  );
}

export default LiveSession;
