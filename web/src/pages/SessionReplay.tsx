/**
 * Session Replay Page Component
 *
 * Displays a detailed replay of a past study session including:
 * - Session summary with key statistics
 * - Complete conversation transcript with AI
 * - Evaluation markers showing recall results
 * - Rabbithole markers for tangent conversations
 * - Auto-scroll option for navigating the transcript
 *
 * Uses React Query hooks to fetch session data and transcript.
 *
 * @route /sessions/:id
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useSession, useSessionTranscript } from '@/hooks/api/use-sessions';
import { Spinner } from '@/components/ui/Spinner';
import { Card, CardBody } from '@/components/ui/Card';
import {
  SessionSummary,
  TranscriptMessage,
  RabbitholeMarker,
} from '@/components/session-replay';
import type { TranscriptMessage as TranscriptMessageType } from '@/types/api';

// ============================================================================
// Types
// ============================================================================

/**
 * Map of recall point IDs to their content for display in evaluation markers.
 * Built from transcript data when available.
 */
type RecallPointContentMap = Record<string, string>;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Builds a map of recall point IDs to their content from evaluation markers.
 * This allows us to display which recall point was being tested.
 *
 * Note: In a real implementation, we might fetch this from a separate endpoint
 * or have it included in the transcript response.
 *
 * @param messages - Transcript messages that may contain evaluation markers
 * @returns Map of recall point ID to content
 */
function buildRecallPointContentMap(messages: TranscriptMessageType[]): RecallPointContentMap {
  const map: RecallPointContentMap = {};

  // For now, we don't have recall point content in the markers
  // This would be populated from additional API data or included in markers
  messages.forEach((message) => {
    if (message.evaluationMarker?.recallPointId) {
      // Placeholder - in real implementation, this would come from API
      // For now we leave the content empty
      if (!map[message.evaluationMarker.recallPointId]) {
        map[message.evaluationMarker.recallPointId] = '';
      }
    }
  });

  return map;
}

// ============================================================================
// Session Replay Page Component
// ============================================================================

/**
 * Session replay page for reviewing a past study session.
 *
 * Features:
 * - Fetches session data and transcript using React Query hooks
 * - Displays session summary with key statistics
 * - Renders full conversation transcript with role-based styling
 * - Shows evaluation and rabbithole markers at correct positions
 * - Supports auto-scroll to bottom of transcript
 * - Handles loading and error states gracefully
 */
export function SessionReplay() {
  // Extract the session ID from the URL parameters
  const { id } = useParams<{ id: string }>();

  // State for auto-scroll feature
  const [autoScroll, setAutoScroll] = useState(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Fetch session details and transcript data
  const {
    data: sessionData,
    isLoading: isLoadingSession,
    error: sessionError,
  } = useSession(id ?? '');

  const {
    data: transcriptData,
    isLoading: isLoadingTranscript,
    error: transcriptError,
  } = useSessionTranscript(id ?? '');

  // Build recall point content map for evaluation markers
  const recallPointContentMap = useMemo(() => {
    if (!transcriptData?.messages) return {};
    return buildRecallPointContentMap(transcriptData.messages);
  }, [transcriptData?.messages]);

  // Auto-scroll effect - scrolls to bottom when enabled and transcript changes
  useEffect(() => {
    if (autoScroll && transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [autoScroll, transcriptData?.messages]);

  // Combined loading state
  const isLoading = isLoadingSession || isLoadingTranscript;

  // Combined error state
  const error = sessionError || transcriptError;

  // ============================================================================
  // Render Loading State
  // ============================================================================

  if (isLoading) {
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

        {/* Loading spinner */}
        <div className="flex flex-col items-center justify-center py-20">
          <Spinner size="lg" label="Loading session..." />
          <p className="mt-4 text-gray-500">Loading session data...</p>
        </div>
      </div>
    );
  }

  // ============================================================================
  // Render Error State
  // ============================================================================

  if (error) {
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

        {/* Error message */}
        <Card className="border-red-200 bg-red-50">
          <CardBody>
            <h2 className="text-lg font-semibold text-red-800 mb-2">
              Failed to Load Session
            </h2>
            <p className="text-red-600">
              {error.message || 'An error occurred while loading the session.'}
            </p>
            <Link
              to="/sessions"
              className="inline-block mt-4 text-red-700 hover:text-red-900 underline"
            >
              Return to sessions list
            </Link>
          </CardBody>
        </Card>
      </div>
    );
  }

  // ============================================================================
  // Render Session Not Found
  // ============================================================================

  if (!sessionData?.session) {
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

        {/* Not found message */}
        <Card>
          <CardBody className="text-center py-12">
            <h2 className="text-lg font-semibold text-gray-700 mb-2">
              Session Not Found
            </h2>
            <p className="text-gray-500">
              The session with ID <code className="bg-gray-100 px-2 py-1 rounded">{id}</code> could not be found.
            </p>
            <Link
              to="/sessions"
              className="inline-block mt-4 text-clarity-600 hover:text-clarity-800 underline"
            >
              Return to sessions list
            </Link>
          </CardBody>
        </Card>
      </div>
    );
  }

  // Extract session data for rendering
  const { session, metrics } = sessionData;
  const messages = transcriptData?.messages ?? [];

  // Find any active rabbithole at the end (for display purposes)
  const activeRabbithole = messages
    .filter((m) => m.rabbitholeMarker?.isTrigger && !m.rabbitholeMarker?.isReturn)
    .pop()?.rabbitholeMarker;

  // ============================================================================
  // Render Main Content
  // ============================================================================

  return (
    <div className="p-8 max-w-5xl mx-auto">
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
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-clarity-800 mb-2">Session Replay</h1>
        <p className="text-clarity-600">
          Review your study session from {new Date(session.startedAt).toLocaleDateString()}
        </p>
      </header>

      {/* Session Summary Card */}
      <SessionSummary
        sessionId={session.id}
        recallSetId={session.recallSetId}
        recallSetName={session.recallSetName}
        startedAt={session.startedAt}
        endedAt={session.endedAt}
        status={session.status}
        metrics={
          metrics
            ? {
                durationMs: metrics.durationMs,
                activeTimeMs: metrics.activeTimeMs,
                recallRate: metrics.recallRate,
                engagementScore: metrics.engagementScore,
                recallPointsAttempted: metrics.recallPointsAttempted,
                recallPointsSuccessful: metrics.recallPointsSuccessful,
                recallPointsFailed: metrics.recallPointsFailed,
                avgConfidence: metrics.avgConfidence,
                totalMessages: metrics.totalMessages,
                rabbitholeCount: metrics.rabbitholeCount,
              }
            : null
        }
      />

      {/* Transcript Section */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-clarity-700">
            Conversation Transcript
          </h2>

          {/* Auto-scroll toggle */}
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded border-gray-300 text-clarity-600 focus:ring-clarity-500"
            />
            Auto-scroll to bottom
          </label>
        </div>

        {/* Active rabbithole indicator (if currently in a tangent) */}
        {activeRabbithole && (
          <div className="mb-4 flex justify-center">
            <RabbitholeMarker
              topic={activeRabbithole.topic}
              depth={activeRabbithole.depth}
              isReturn={false}
            />
          </div>
        )}

        {/* Transcript container with scrollable area */}
        <Card>
          <CardBody className="max-h-[600px] overflow-y-auto">
            {messages.length === 0 ? (
              // Empty transcript state
              <div className="text-center py-12 text-gray-500">
                <p>No messages in this session transcript.</p>
              </div>
            ) : (
              // Render all transcript messages
              <div className="space-y-2">
                {messages.map((message) => (
                  <TranscriptMessage
                    key={message.id}
                    message={message}
                    recallPointContent={
                      message.evaluationMarker?.recallPointId
                        ? recallPointContentMap[message.evaluationMarker.recallPointId]
                        : undefined
                    }
                  />
                ))}

                {/* Invisible element to scroll to */}
                <div ref={transcriptEndRef} />
              </div>
            )}
          </CardBody>
        </Card>

        {/* Message count indicator */}
        {messages.length > 0 && (
          <p className="mt-2 text-sm text-gray-500 text-right">
            {messages.length} message{messages.length !== 1 ? 's' : ''} in transcript
          </p>
        )}
      </section>

      {/* Action buttons */}
      <div className="flex gap-4">
        {/* Scroll to top button */}
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="px-4 py-2 border border-clarity-300 text-clarity-700 rounded-lg hover:bg-clarity-50 transition-colors font-medium"
        >
          Scroll to Top
        </button>

        {/* Link to start a new session with the same recall set */}
        <Link
          to={`/recall-sets/${session.recallSetId}`}
          className="px-4 py-2 bg-clarity-600 text-white rounded-lg hover:bg-clarity-700 transition-colors font-medium"
        >
          View Recall Set
        </Link>
      </div>
    </div>
  );
}

export default SessionReplay;
