/**
 * Sessions Query and Mutation Hooks
 *
 * This module provides React Query hooks for managing study sessions.
 * Includes hooks for:
 *
 * Queries:
 * - useSessions(filters?) - List sessions with filtering and pagination
 * - useSession(id) - Get detailed session information
 * - useSessionTranscript(id) - Get full session transcript
 *
 * Mutations:
 * - useStartSession() - Start a new study session
 * - useAbandonSession() - Abandon an in-progress session
 *
 * Mutations automatically invalidate relevant queries to keep data fresh.
 *
 * @example
 * ```tsx
 * function SessionsList() {
 *   const { data, isLoading } = useSessions({ limit: 10 });
 *
 *   if (isLoading) return <Spinner />;
 *
 *   return (
 *     <ul>
 *       {data?.sessions.map(session => (
 *         <li key={session.id}>
 *           {session.status} - {session.metrics?.recallRate}
 *         </li>
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getSessions,
  getSession,
  getSessionTranscript,
  startSession,
  abandonSession,
} from '@/lib/api-client';
import type {
  SessionListResponse,
  SessionFilters,
  SessionDetail,
  TranscriptResponse,
  StartSessionResponse,
  AbandonSessionResponse,
} from '@/types/api';
import { dashboardKeys } from './use-dashboard';
import { recallSetKeys } from './use-recall-sets';

// ============================================================================
// Query Keys
// ============================================================================

/**
 * Query key factory for session queries.
 * Enables targeted cache invalidation and query matching.
 */
export const sessionKeys = {
  /** Base key for all session queries */
  all: ['sessions'] as const,

  /** Key for session list queries with filters */
  lists: (filters?: SessionFilters) => [...sessionKeys.all, 'list', filters ?? {}] as const,

  /** Key for a specific session detail query */
  detail: (id: string) => [...sessionKeys.all, 'detail', id] as const,

  /** Key for a session transcript query */
  transcript: (id: string) => [...sessionKeys.all, 'transcript', id] as const,
};

// ============================================================================
// Sessions Query Hooks
// ============================================================================

/**
 * Hook to fetch sessions with optional filtering and pagination.
 *
 * @param filters - Optional filter and pagination parameters
 * @returns Query result with paginated session list
 *
 * @example
 * ```tsx
 * function SessionHistory() {
 *   const [filters, setFilters] = useState<SessionFilters>({
 *     limit: 20,
 *     offset: 0,
 *   });
 *   const { data, isLoading } = useSessions(filters);
 *
 *   return (
 *     <div>
 *       <p>Showing {data?.sessions.length} of {data?.pagination.total}</p>
 *       <SessionTable sessions={data?.sessions ?? []} />
 *       <Pagination
 *         hasMore={data?.pagination.hasMore}
 *         onNext={() => setFilters(f => ({ ...f, offset: (f.offset ?? 0) + 20 }))}
 *       />
 *     </div>
 *   );
 * }
 * ```
 */
export function useSessions(filters?: SessionFilters) {
  return useQuery<SessionListResponse, Error>({
    queryKey: sessionKeys.lists(filters),
    queryFn: () => getSessions(filters),
  });
}

/**
 * Hook to fetch detailed information about a specific session.
 *
 * @param id - Session identifier
 * @returns Query result with session details and metrics
 *
 * @example
 * ```tsx
 * function SessionDetailPage({ id }: { id: string }) {
 *   const { data, isLoading, error } = useSession(id);
 *
 *   if (isLoading) return <Skeleton />;
 *   if (error) return <Error message="Session not found" />;
 *
 *   return (
 *     <div>
 *       <h1>{data?.session.recallSetName}</h1>
 *       <p>Status: {data?.session.status}</p>
 *       {data?.metrics && (
 *         <MetricsCard metrics={data.metrics} />
 *       )}
 *     </div>
 *   );
 * }
 * ```
 */
export function useSession(id: string) {
  return useQuery<SessionDetail, Error>({
    queryKey: sessionKeys.detail(id),
    queryFn: () => getSession(id),
    // Only fetch if we have a valid ID
    enabled: Boolean(id),
  });
}

/**
 * Hook to fetch the full transcript for a session.
 * Includes evaluation markers and rabbithole markers.
 *
 * @param id - Session identifier
 * @returns Query result with transcript messages and markers
 *
 * @example
 * ```tsx
 * function SessionReplay({ id }: { id: string }) {
 *   const { data, isLoading } = useSessionTranscript(id);
 *
 *   if (isLoading) return <Skeleton />;
 *
 *   return (
 *     <div className="transcript">
 *       {data?.messages.map(message => (
 *         <MessageBubble
 *           key={message.id}
 *           role={message.role}
 *           content={message.content}
 *           evaluationMarker={message.evaluationMarker}
 *           rabbitholeMarker={message.rabbitholeMarker}
 *         />
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function useSessionTranscript(id: string) {
  return useQuery<TranscriptResponse, Error>({
    queryKey: sessionKeys.transcript(id),
    queryFn: () => getSessionTranscript(id),
    // Only fetch if we have a valid ID
    enabled: Boolean(id),
  });
}

// ============================================================================
// Sessions Mutation Hooks
// ============================================================================

/**
 * Hook to start a new study session for a recall set.
 * Returns the session ID for WebSocket connection.
 *
 * If an in-progress session exists for the recall set, the existing
 * session is returned instead of creating a new one.
 *
 * Automatically invalidates sessions list and dashboard on success.
 *
 * @returns Mutation object with mutate/mutateAsync functions
 *
 * @example
 * ```tsx
 * function StartSessionButton({ recallSetId }: { recallSetId: string }) {
 *   const startMutation = useStartSession();
 *   const navigate = useNavigate();
 *
 *   const handleStart = () => {
 *     startMutation.mutate(recallSetId, {
 *       onSuccess: (data) => {
 *         // Navigate to live session with the session ID
 *         navigate(`/session/${data.sessionId}`);
 *       },
 *     });
 *   };
 *
 *   return (
 *     <button onClick={handleStart} disabled={startMutation.isPending}>
 *       {startMutation.isPending ? 'Starting...' : 'Start Session'}
 *     </button>
 *   );
 * }
 * ```
 */
export function useStartSession() {
  const queryClient = useQueryClient();

  return useMutation<StartSessionResponse, Error, string>({
    mutationKey: ['sessions', 'start'],
    mutationFn: startSession,
    onSuccess: (data) => {
      // Invalidate sessions list to show the new/resumed session
      queryClient.invalidateQueries({ queryKey: sessionKeys.all });
      // Invalidate dashboard recent sessions
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all });

      // If this was a new session (not resume), recall set due counts changed
      if (!data.isResume) {
        queryClient.invalidateQueries({ queryKey: recallSetKeys.all });
      }
    },
  });
}

/**
 * Hook to abandon an in-progress session.
 * Marks the session as abandoned and ends it.
 *
 * Automatically invalidates sessions list and dashboard on success.
 *
 * @returns Mutation object with mutate/mutateAsync functions
 *
 * @example
 * ```tsx
 * function AbandonSessionButton({ sessionId }: { sessionId: string }) {
 *   const abandonMutation = useAbandonSession();
 *   const navigate = useNavigate();
 *
 *   const handleAbandon = () => {
 *     if (confirm('Abandon this session? Progress will be saved.')) {
 *       abandonMutation.mutate(sessionId, {
 *         onSuccess: () => navigate('/sessions'),
 *       });
 *     }
 *   };
 *
 *   return (
 *     <button
 *       onClick={handleAbandon}
 *       disabled={abandonMutation.isPending}
 *       className="text-red-600"
 *     >
 *       {abandonMutation.isPending ? 'Abandoning...' : 'Abandon Session'}
 *     </button>
 *   );
 * }
 * ```
 */
export function useAbandonSession() {
  const queryClient = useQueryClient();

  return useMutation<AbandonSessionResponse, Error, string>({
    mutationKey: ['sessions', 'abandon'],
    mutationFn: abandonSession,
    onSuccess: (_, sessionId) => {
      // Invalidate the specific session detail
      queryClient.invalidateQueries({ queryKey: sessionKeys.detail(sessionId) });
      // Invalidate sessions list to update the status
      queryClient.invalidateQueries({ queryKey: sessionKeys.all });
      // Invalidate dashboard recent sessions
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
    },
  });
}
