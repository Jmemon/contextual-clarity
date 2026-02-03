/**
 * Recall Sets Query and Mutation Hooks
 *
 * This module provides React Query hooks for managing recall sets and their
 * recall points. Includes hooks for:
 *
 * Recall Sets:
 * - useRecallSets() - List all recall sets
 * - useRecallSet(id) - Get a single recall set
 * - useCreateRecallSet() - Create a new recall set
 * - useUpdateRecallSet() - Update an existing recall set
 * - useDeleteRecallSet() - Archive a recall set
 *
 * Recall Points:
 * - useRecallPoints(setId) - List points for a recall set
 * - useCreateRecallPoint(setId) - Add a point to a recall set
 * - useUpdateRecallPoint(setId) - Update a recall point
 * - useDeleteRecallPoint(setId) - Delete a recall point
 *
 * Mutations automatically invalidate relevant queries to keep data fresh.
 *
 * @example
 * ```tsx
 * function RecallSetsList() {
 *   const { data: sets, isLoading } = useRecallSets();
 *   const createMutation = useCreateRecallSet();
 *
 *   const handleCreate = () => {
 *     createMutation.mutate({
 *       name: 'New Set',
 *       description: 'Description',
 *       discussionSystemPrompt: 'System prompt...',
 *     });
 *   };
 *
 *   if (isLoading) return <Spinner />;
 *
 *   return (
 *     <>
 *       <button onClick={handleCreate}>Create Set</button>
 *       <ul>
 *         {sets?.map(set => <li key={set.id}>{set.name}</li>)}
 *       </ul>
 *     </>
 *   );
 * }
 * ```
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getRecallSets,
  getRecallSet,
  createRecallSet,
  updateRecallSet,
  deleteRecallSet,
  getRecallPoints,
  createRecallPoint,
  updateRecallPoint,
  deleteRecallPoint,
} from '@/lib/api-client';
import type {
  RecallSetWithSummary,
  CreateRecallSetInput,
  UpdateRecallSetInput,
  RecallPoint,
  CreateRecallPointInput,
  UpdateRecallPointInput,
  DeleteRecallPointResponse,
} from '@/types/api';
import { dashboardKeys } from './use-dashboard';

// ============================================================================
// Query Keys
// ============================================================================

/**
 * Query key factory for recall sets and points.
 * Enables targeted cache invalidation and query matching.
 */
export const recallSetKeys = {
  /** Base key for all recall set queries */
  all: ['recall-sets'] as const,

  /** Key for the recall sets list query */
  lists: () => [...recallSetKeys.all, 'list'] as const,

  /** Key for a specific recall set query */
  detail: (id: string) => [...recallSetKeys.all, 'detail', id] as const,

  /** Key for recall points of a specific set */
  points: (setId: string) => [...recallSetKeys.all, 'points', setId] as const,
};

// ============================================================================
// Recall Sets Query Hooks
// ============================================================================

/**
 * Hook to fetch all recall sets with summary statistics.
 *
 * @returns Query result with array of recall sets
 *
 * @example
 * ```tsx
 * function RecallSetsSidebar() {
 *   const { data: sets } = useRecallSets();
 *
 *   return (
 *     <nav>
 *       {sets?.map(set => (
 *         <Link key={set.id} to={`/recall-sets/${set.id}`}>
 *           {set.name} ({set.summary.duePoints} due)
 *         </Link>
 *       ))}
 *     </nav>
 *   );
 * }
 * ```
 */
export function useRecallSets() {
  return useQuery<RecallSetWithSummary[], Error>({
    queryKey: recallSetKeys.lists(),
    queryFn: getRecallSets,
  });
}

/**
 * Hook to fetch a single recall set by ID.
 *
 * @param id - Recall set identifier
 * @returns Query result with recall set data
 *
 * @example
 * ```tsx
 * function RecallSetHeader({ id }: { id: string }) {
 *   const { data: set, isLoading, error } = useRecallSet(id);
 *
 *   if (isLoading) return <Skeleton />;
 *   if (error) return <Error message="Set not found" />;
 *
 *   return <h1>{set?.name}</h1>;
 * }
 * ```
 */
export function useRecallSet(id: string) {
  return useQuery<RecallSetWithSummary, Error>({
    queryKey: recallSetKeys.detail(id),
    queryFn: () => getRecallSet(id),
    // Only fetch if we have a valid ID
    enabled: Boolean(id),
  });
}

// ============================================================================
// Recall Sets Mutation Hooks
// ============================================================================

/**
 * Hook to create a new recall set.
 * Automatically invalidates the recall sets list and dashboard on success.
 *
 * @returns Mutation object with mutate/mutateAsync functions
 *
 * @example
 * ```tsx
 * function CreateSetForm() {
 *   const createMutation = useCreateRecallSet();
 *
 *   const handleSubmit = (data: CreateRecallSetInput) => {
 *     createMutation.mutate(data, {
 *       onSuccess: (newSet) => {
 *         navigate(`/recall-sets/${newSet.id}`);
 *       },
 *     });
 *   };
 *
 *   return <Form onSubmit={handleSubmit} isLoading={createMutation.isPending} />;
 * }
 * ```
 */
export function useCreateRecallSet() {
  const queryClient = useQueryClient();

  return useMutation<RecallSetWithSummary, Error, CreateRecallSetInput>({
    mutationKey: ['recall-sets', 'create'],
    mutationFn: createRecallSet,
    onSuccess: () => {
      // Invalidate recall sets list to show the new set
      queryClient.invalidateQueries({ queryKey: recallSetKeys.lists() });
      // Invalidate dashboard as it may show recall set counts
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
    },
  });
}

/**
 * Hook to update an existing recall set.
 * Automatically invalidates both the list and the specific set detail.
 *
 * @returns Mutation object with mutate/mutateAsync functions
 *
 * @example
 * ```tsx
 * function EditSetModal({ set }: { set: RecallSetWithSummary }) {
 *   const updateMutation = useUpdateRecallSet();
 *
 *   const handleSave = (changes: UpdateRecallSetInput) => {
 *     updateMutation.mutate(
 *       { id: set.id, data: changes },
 *       { onSuccess: () => closeModal() }
 *     );
 *   };
 *
 *   return <EditForm onSave={handleSave} isLoading={updateMutation.isPending} />;
 * }
 * ```
 */
export function useUpdateRecallSet() {
  const queryClient = useQueryClient();

  return useMutation<
    RecallSetWithSummary,
    Error,
    { id: string; data: UpdateRecallSetInput }
  >({
    mutationKey: ['recall-sets', 'update'],
    mutationFn: ({ id, data }) => updateRecallSet(id, data),
    onSuccess: (_, variables) => {
      // Invalidate the specific set that was updated
      queryClient.invalidateQueries({ queryKey: recallSetKeys.detail(variables.id) });
      // Invalidate the list as name/status may have changed
      queryClient.invalidateQueries({ queryKey: recallSetKeys.lists() });
      // Invalidate dashboard for potential status changes
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
    },
  });
}

/**
 * Hook to archive (soft delete) a recall set.
 * Automatically invalidates the lists and removes the detail from cache.
 *
 * @returns Mutation object with mutate/mutateAsync functions
 *
 * @example
 * ```tsx
 * function DeleteSetButton({ setId }: { setId: string }) {
 *   const deleteMutation = useDeleteRecallSet();
 *
 *   const handleDelete = () => {
 *     if (confirm('Archive this recall set?')) {
 *       deleteMutation.mutate(setId, {
 *         onSuccess: () => navigate('/recall-sets'),
 *       });
 *     }
 *   };
 *
 *   return (
 *     <button onClick={handleDelete} disabled={deleteMutation.isPending}>
 *       Archive
 *     </button>
 *   );
 * }
 * ```
 */
export function useDeleteRecallSet() {
  const queryClient = useQueryClient();

  return useMutation<RecallSetWithSummary, Error, string>({
    mutationKey: ['recall-sets', 'delete'],
    mutationFn: deleteRecallSet,
    onSuccess: (_, deletedId) => {
      // Invalidate the list to remove/update the archived set
      queryClient.invalidateQueries({ queryKey: recallSetKeys.lists() });
      // Remove the specific set from cache
      queryClient.removeQueries({ queryKey: recallSetKeys.detail(deletedId) });
      // Invalidate dashboard counts
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
    },
  });
}

// ============================================================================
// Recall Points Query Hooks
// ============================================================================

/**
 * Hook to fetch all recall points for a specific recall set.
 *
 * @param setId - Parent recall set identifier
 * @returns Query result with array of recall points
 *
 * @example
 * ```tsx
 * function RecallPointsList({ setId }: { setId: string }) {
 *   const { data: points, isLoading } = useRecallPoints(setId);
 *
 *   if (isLoading) return <SkeletonList />;
 *
 *   return (
 *     <ul>
 *       {points?.map(point => (
 *         <li key={point.id}>
 *           <strong>{point.content}</strong>
 *           <span>Due: {new Date(point.fsrsState.due).toLocaleDateString()}</span>
 *         </li>
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 */
export function useRecallPoints(setId: string) {
  return useQuery<RecallPoint[], Error>({
    queryKey: recallSetKeys.points(setId),
    queryFn: () => getRecallPoints(setId),
    // Only fetch if we have a valid set ID
    enabled: Boolean(setId),
  });
}

// ============================================================================
// Recall Points Mutation Hooks
// ============================================================================

/**
 * Hook to create a new recall point within a recall set.
 * Automatically invalidates the points list and parent set summary.
 *
 * @param setId - Parent recall set identifier
 * @returns Mutation object with mutate/mutateAsync functions
 *
 * @example
 * ```tsx
 * function AddPointForm({ setId }: { setId: string }) {
 *   const createMutation = useCreateRecallPoint(setId);
 *
 *   const handleSubmit = (data: CreateRecallPointInput) => {
 *     createMutation.mutate(data, {
 *       onSuccess: () => resetForm(),
 *     });
 *   };
 *
 *   return <Form onSubmit={handleSubmit} isLoading={createMutation.isPending} />;
 * }
 * ```
 */
export function useCreateRecallPoint(setId: string) {
  const queryClient = useQueryClient();

  return useMutation<RecallPoint, Error, CreateRecallPointInput>({
    mutationKey: ['recall-points', 'create', setId],
    mutationFn: (data) => createRecallPoint(setId, data),
    onSuccess: () => {
      // Invalidate the points list for this set
      queryClient.invalidateQueries({ queryKey: recallSetKeys.points(setId) });
      // Invalidate the parent set detail (summary counts changed)
      queryClient.invalidateQueries({ queryKey: recallSetKeys.detail(setId) });
      // Invalidate the sets list (due counts may have changed)
      queryClient.invalidateQueries({ queryKey: recallSetKeys.lists() });
      // Invalidate dashboard (due today counts may have changed)
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
    },
  });
}

/**
 * Hook to update an existing recall point.
 * Automatically invalidates the points list for the parent set.
 *
 * @param setId - Parent recall set identifier
 * @returns Mutation object with mutate/mutateAsync functions
 *
 * @example
 * ```tsx
 * function EditPointModal({ setId, point }: Props) {
 *   const updateMutation = useUpdateRecallPoint(setId);
 *
 *   const handleSave = (changes: UpdateRecallPointInput) => {
 *     updateMutation.mutate(
 *       { pointId: point.id, data: changes },
 *       { onSuccess: () => closeModal() }
 *     );
 *   };
 *
 *   return <EditForm onSave={handleSave} isLoading={updateMutation.isPending} />;
 * }
 * ```
 */
export function useUpdateRecallPoint(setId: string) {
  const queryClient = useQueryClient();

  return useMutation<
    RecallPoint,
    Error,
    { pointId: string; data: UpdateRecallPointInput }
  >({
    mutationKey: ['recall-points', 'update', setId],
    mutationFn: ({ pointId, data }) => updateRecallPoint(setId, pointId, data),
    onSuccess: () => {
      // Invalidate the points list for this set
      queryClient.invalidateQueries({ queryKey: recallSetKeys.points(setId) });
    },
  });
}

/**
 * Hook to permanently delete a recall point.
 * Automatically invalidates points list and parent set summary.
 *
 * @param setId - Parent recall set identifier
 * @returns Mutation object with mutate/mutateAsync functions
 *
 * @example
 * ```tsx
 * function DeletePointButton({ setId, pointId }: Props) {
 *   const deleteMutation = useDeleteRecallPoint(setId);
 *
 *   const handleDelete = () => {
 *     if (confirm('Delete this recall point?')) {
 *       deleteMutation.mutate(pointId);
 *     }
 *   };
 *
 *   return (
 *     <button onClick={handleDelete} disabled={deleteMutation.isPending}>
 *       Delete
 *     </button>
 *   );
 * }
 * ```
 */
export function useDeleteRecallPoint(setId: string) {
  const queryClient = useQueryClient();

  return useMutation<DeleteRecallPointResponse, Error, string>({
    mutationKey: ['recall-points', 'delete', setId],
    mutationFn: (pointId) => deleteRecallPoint(setId, pointId),
    onSuccess: () => {
      // Invalidate the points list for this set
      queryClient.invalidateQueries({ queryKey: recallSetKeys.points(setId) });
      // Invalidate the parent set detail (summary counts changed)
      queryClient.invalidateQueries({ queryKey: recallSetKeys.detail(setId) });
      // Invalidate the sets list (due counts may have changed)
      queryClient.invalidateQueries({ queryKey: recallSetKeys.lists() });
      // Invalidate dashboard (due today counts may have changed)
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
    },
  });
}
