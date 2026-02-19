/**
 * Live Session Page Component
 *
 * Full-screen study session interface for active learning with real-time
 * WebSocket communication. This page does NOT use the MainLayout - it's
 * designed for distraction-free, focused study with the Agent.
 *
 * Features:
 * - Real-time conversation with Agent via WebSocket
 * - Streaming responses that show as they arrive
 * - Progress tracking through recall points
 * - "I've got it" button to trigger evaluation
 * - Session completion summary
 *
 * Flow:
 * 1. If sessionId is in URL, connect to existing session
 * 2. If no sessionId, show start screen to select recall set
 * 3. On selection, call startSession API and navigate to session
 *
 * The singular route (/session/:id vs /sessions/:id) distinguishes
 * active sessions from completed session history.
 *
 * @route /session (start screen)
 * @route /session/:id (active session)
 */

import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { SessionContainer } from '@/components/live-session';
import { useRecallSets, useStartSession } from '@/hooks/api';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';

// ============================================================================
// Start Session Screen Component
// ============================================================================

/**
 * Screen shown when no sessionId is provided.
 * Allows user to select a recall set and start a new session.
 */
function StartSessionScreen() {
  const navigate = useNavigate();

  // Fetch available recall sets
  const { data: recallSets, isLoading: setsLoading, error: setsError } = useRecallSets();

  // Start session mutation
  const startMutation = useStartSession();

  // Selected recall set ID
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);

  /**
   * Handle starting a new session.
   */
  const handleStartSession = async () => {
    if (!selectedSetId) return;

    try {
      const response = await startMutation.mutateAsync(selectedSetId);
      // Navigate to the live session with the new session ID
      navigate(`/session/${response.sessionId}`);
    } catch (error) {
      console.error('Failed to start session:', error);
    }
  };

  // Filter to only active sets with due points
  const availableSets = recallSets?.filter(
    (set) => set.status === 'active' && set.summary.duePoints > 0
  ) || [];

  // Sets with no due points (can still study but will use new points)
  const otherSets = recallSets?.filter(
    (set) => set.status === 'active' && set.summary.duePoints === 0 && set.summary.totalPoints > 0
  ) || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-clarity-800 to-clarity-900 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-clarity-900/50">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 rounded-lg bg-clarity-600 flex items-center justify-center text-white text-sm font-bold">
            CC
          </div>
          <div>
            <p className="text-white font-medium">Start Session</p>
            <p className="text-clarity-400 text-sm">Select a recall set to study</p>
          </div>
        </div>

        <Link
          to="/"
          className="px-4 py-2 bg-clarity-700 text-white rounded-lg hover:bg-clarity-600 transition-colors text-sm"
        >
          Back to Dashboard
        </Link>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-2xl">
          <h1 className="text-3xl font-bold text-white text-center mb-2">
            Start a Study Session
          </h1>
          <p className="text-clarity-300 text-center mb-8">
            Choose a recall set to begin your focused learning session.
          </p>

          {/* Loading state */}
          {setsLoading && (
            <div className="flex items-center justify-center py-12">
              <Spinner size="lg" label="Loading recall sets..." />
            </div>
          )}

          {/* Error state */}
          {setsError && (
            <div className="text-center py-12">
              <p className="text-red-400 mb-4">Failed to load recall sets.</p>
              <Button
                variant="secondary"
                onClick={() => window.location.reload()}
              >
                Try Again
              </Button>
            </div>
          )}

          {/* Sets with due points */}
          {!setsLoading && !setsError && (
            <>
              {availableSets.length > 0 && (
                <div className="mb-8">
                  <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 bg-amber-400 rounded-full" />
                    Due for Review
                  </h2>
                  <div className="space-y-3">
                    {availableSets.map((set) => (
                      <button
                        key={set.id}
                        onClick={() => setSelectedSetId(set.id)}
                        className={`
                          w-full p-4 rounded-xl text-left transition-all
                          ${selectedSetId === set.id
                            ? 'bg-clarity-600 ring-2 ring-clarity-400'
                            : 'bg-clarity-700/50 hover:bg-clarity-700'
                          }
                        `}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="text-white font-medium">{set.name}</h3>
                            <p className="text-clarity-400 text-sm mt-1 line-clamp-2">
                              {set.description}
                            </p>
                          </div>
                          <div className="text-right ml-4 shrink-0">
                            <p className="text-amber-400 font-semibold">
                              {set.summary.duePoints} due
                            </p>
                            <p className="text-clarity-500 text-sm">
                              of {set.summary.totalPoints} total
                            </p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Other available sets */}
              {otherSets.length > 0 && (
                <div className="mb-8">
                  <h2 className="text-lg font-semibold text-clarity-300 mb-3">
                    Other Sets
                  </h2>
                  <div className="space-y-3">
                    {otherSets.map((set) => (
                      <button
                        key={set.id}
                        onClick={() => setSelectedSetId(set.id)}
                        className={`
                          w-full p-4 rounded-xl text-left transition-all
                          ${selectedSetId === set.id
                            ? 'bg-clarity-600 ring-2 ring-clarity-400'
                            : 'bg-clarity-700/30 hover:bg-clarity-700/50'
                          }
                        `}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="text-white font-medium">{set.name}</h3>
                            <p className="text-clarity-400 text-sm mt-1 line-clamp-2">
                              {set.description}
                            </p>
                          </div>
                          <div className="text-right ml-4 shrink-0">
                            <p className="text-green-400 text-sm">
                              All caught up!
                            </p>
                            <p className="text-clarity-500 text-sm">
                              {set.summary.totalPoints} points
                            </p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {availableSets.length === 0 && otherSets.length === 0 && (
                <div className="text-center py-12 bg-clarity-700/30 rounded-xl">
                  <p className="text-clarity-300 mb-4">
                    No recall sets available for study.
                  </p>
                  <Link
                    to="/recall-sets"
                    className="text-clarity-400 hover:text-white underline"
                  >
                    Create a recall set to get started
                  </Link>
                </div>
              )}

              {/* Start button */}
              {(availableSets.length > 0 || otherSets.length > 0) && (
                <div className="flex justify-center mt-8">
                  <Button
                    variant="primary"
                    size="lg"
                    onClick={handleStartSession}
                    disabled={!selectedSetId || startMutation.isPending}
                    isLoading={startMutation.isPending}
                    className="min-w-[200px]"
                  >
                    {startMutation.isPending ? 'Starting...' : 'Start Session'}
                  </Button>
                </div>
              )}

              {/* Error message */}
              {startMutation.isError && (
                <p className="text-red-400 text-center mt-4">
                  {startMutation.error?.message || 'Failed to start session. Please try again.'}
                </p>
              )}
            </>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-3 bg-clarity-900/50 text-center">
        <p className="text-clarity-500 text-sm">
          Sessions use WebSocket for real-time communication with the Agent
        </p>
      </footer>
    </div>
  );
}

// ============================================================================
// Live Session Page Component
// ============================================================================

/**
 * Full-screen live session page for active study.
 *
 * This component renders without the main navigation sidebar
 * to provide a focused, distraction-free learning environment.
 *
 * Behavior:
 * - If sessionId is present in URL, shows the active session interface
 * - If no sessionId, shows the start screen to select a recall set
 */
export function LiveSession() {
  // Extract the session ID from the URL
  const { id: sessionId } = useParams<{ id: string }>();

  // If no session ID, show the start screen
  if (!sessionId) {
    return <StartSessionScreen />;
  }

  // Show the active session interface
  return (
    <div className="min-h-screen bg-gradient-to-br from-clarity-800 to-clarity-900">
      <SessionContainer sessionId={sessionId} />
    </div>
  );
}

export default LiveSession;
