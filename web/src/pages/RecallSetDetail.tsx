/**
 * Recall Set Detail Page Component
 *
 * Displays detailed information about a single recall set including:
 * - Set metadata (name, description, status) with edit/delete actions
 * - Summary statistics (total points, due points, new points, sessions)
 * - Point status breakdown chart (pie chart by FSRS state)
 * - Recall rate over time chart (line chart)
 * - List of all recall points with add/edit/delete functionality
 * - Session history for this set
 *
 * Uses route parameter `:id` to fetch the specific recall set.
 * All data operations are handled via React Query hooks with automatic
 * cache invalidation.
 *
 * @route /recall-sets/:id
 */

import { useState, useCallback, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Modal, Spinner } from '@/components/ui';
import {
  RecallSetForm,
  RecallPointForm,
  DeleteConfirmModal,
  type RecallSetFormData,
  type RecallPointFormData,
} from '@/components/forms';
import {
  SetHeader,
  StatsOverview,
  PointStatusBreakdown,
  RecallRateChart,
  PointsList,
  SessionHistoryTable,
} from '@/components/recall-set-detail';
import {
  useRecallSet,
  useRecallPoints,
  useUpdateRecallSet,
  useDeleteRecallSet,
  useCreateRecallPoint,
  useUpdateRecallPoint,
  useDeleteRecallPoint,
} from '@/hooks/api/use-recall-sets';
import { useSessions } from '@/hooks/api/use-sessions';
import type { RecallPoint } from '@/types/api';

// ============================================================================
// Modal State Types
// ============================================================================

/** Possible modal states for the page */
type ModalState =
  | { type: 'none' }
  | { type: 'editSet' }
  | { type: 'deleteSet' }
  | { type: 'addPoint' }
  | { type: 'editPoint'; point: RecallPoint }
  | { type: 'deletePoint'; point: RecallPoint };

// ============================================================================
// Recall Set Detail Page Component
// ============================================================================

/**
 * Detail page for a single recall set.
 * Composes multiple sub-components to display comprehensive set information
 * with full CRUD functionality for the set and its recall points.
 */
export function RecallSetDetail() {
  // Extract the recall set ID from the URL
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // ============================================================================
  // Data Fetching Hooks
  // ============================================================================

  // Fetch recall set details including summary statistics
  const {
    data: recallSet,
    isLoading: isLoadingSet,
    error: setError,
  } = useRecallSet(id ?? '');

  // Fetch all recall points for this set
  const {
    data: recallPoints,
    isLoading: isLoadingPoints,
  } = useRecallPoints(id ?? '');

  // Fetch sessions filtered by this recall set
  const {
    data: sessionsData,
    isLoading: isLoadingSessions,
  } = useSessions({ recallSetId: id, limit: 10 });

  // ============================================================================
  // Mutation Hooks
  // ============================================================================

  // Recall set mutations
  const updateSetMutation = useUpdateRecallSet();
  const deleteSetMutation = useDeleteRecallSet();

  // Recall point mutations
  const createPointMutation = useCreateRecallPoint(id ?? '');
  const updatePointMutation = useUpdateRecallPoint(id ?? '');
  const deletePointMutation = useDeleteRecallPoint(id ?? '');

  // ============================================================================
  // Modal State Management
  // ============================================================================

  const [modalState, setModalState] = useState<ModalState>({ type: 'none' });

  // Helper to close any open modal
  const closeModal = useCallback(() => {
    setModalState({ type: 'none' });
  }, []);

  // ============================================================================
  // Set Action Handlers
  // ============================================================================

  /**
   * Handle editing the recall set.
   * Opens the edit modal with the current set data.
   */
  const handleEditSet = useCallback(() => {
    setModalState({ type: 'editSet' });
  }, []);

  /**
   * Handle deleting the recall set.
   * Opens the delete confirmation modal.
   */
  const handleDeleteSet = useCallback(() => {
    setModalState({ type: 'deleteSet' });
  }, []);

  /**
   * Submit handler for editing the recall set.
   * Updates the set via API and closes the modal on success.
   */
  const handleEditSetSubmit = useCallback(
    async (data: RecallSetFormData) => {
      if (!id) return;

      await updateSetMutation.mutateAsync({
        id,
        data: {
          name: data.name,
          description: data.description,
          discussionSystemPrompt: data.discussionSystemPrompt,
        },
      });

      closeModal();
    },
    [id, updateSetMutation, closeModal]
  );

  /**
   * Confirm handler for deleting the recall set.
   * Deletes the set and navigates back to the sets list.
   */
  const handleDeleteSetConfirm = useCallback(async () => {
    if (!id) return;

    await deleteSetMutation.mutateAsync(id);
    navigate('/recall-sets');
  }, [id, deleteSetMutation, navigate]);

  // ============================================================================
  // Point Action Handlers
  // ============================================================================

  /**
   * Handle adding a new recall point.
   * Opens the add point modal.
   */
  const handleAddPoint = useCallback(() => {
    setModalState({ type: 'addPoint' });
  }, []);

  /**
   * Handle editing a recall point.
   * Opens the edit modal with the selected point data.
   */
  const handleEditPoint = useCallback((point: RecallPoint) => {
    setModalState({ type: 'editPoint', point });
  }, []);

  /**
   * Handle deleting a recall point.
   * Opens the delete confirmation modal.
   */
  const handleDeletePoint = useCallback((point: RecallPoint) => {
    setModalState({ type: 'deletePoint', point });
  }, []);

  /**
   * Submit handler for adding a new recall point.
   * Creates the point via API and closes the modal on success.
   */
  const handleAddPointSubmit = useCallback(
    async (data: RecallPointFormData) => {
      await createPointMutation.mutateAsync({
        content: data.content,
        context: data.context,
      });

      closeModal();
    },
    [createPointMutation, closeModal]
  );

  /**
   * Submit handler for editing a recall point.
   * Updates the point via API and closes the modal on success.
   */
  const handleEditPointSubmit = useCallback(
    async (data: RecallPointFormData) => {
      if (modalState.type !== 'editPoint') return;

      await updatePointMutation.mutateAsync({
        pointId: modalState.point.id,
        data: {
          content: data.content,
          context: data.context,
        },
      });

      closeModal();
    },
    [modalState, updatePointMutation, closeModal]
  );

  /**
   * Confirm handler for deleting a recall point.
   * Deletes the point via API and closes the modal on success.
   */
  const handleDeletePointConfirm = useCallback(async () => {
    if (modalState.type !== 'deletePoint') return;

    await deletePointMutation.mutateAsync(modalState.point.id);
    closeModal();
  }, [modalState, deletePointMutation, closeModal]);

  // ============================================================================
  // Computed Values
  // ============================================================================

  /**
   * Calculate point status counts from the points array.
   * Groups points by their FSRS learning state.
   */
  const pointStatusCounts = useMemo(() => {
    if (!recallPoints) {
      return { new: 0, learning: 0, review: 0, relearning: 0 };
    }

    return recallPoints.reduce(
      (counts, point) => {
        const state = point.fsrsState.state;
        counts[state] = (counts[state] || 0) + 1;
        return counts;
      },
      { new: 0, learning: 0, review: 0, relearning: 0 } as Record<string, number>
    );
  }, [recallPoints]);

  // ============================================================================
  // Loading and Error States
  // ============================================================================

  // Show full-page loading spinner while set data is loading
  if (isLoadingSet) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" label="Loading recall set..." />
      </div>
    );
  }

  // Show error state if set not found or error occurred
  if (setError || !recallSet) {
    return (
      <div className="p-8">
        <nav className="mb-4">
          <Link
            to="/recall-sets"
            className="text-clarity-600 hover:text-clarity-800 transition-colors"
          >
            &larr; Back to Recall Sets
          </Link>
        </nav>
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <h2 className="text-lg font-semibold text-red-800 mb-2">
            Recall Set Not Found
          </h2>
          <p className="text-red-600">
            {setError?.message || 'The requested recall set could not be found.'}
          </p>
        </div>
      </div>
    );
  }

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      {/* Breadcrumb navigation */}
      <nav className="mb-6">
        <Link
          to="/recall-sets"
          className="text-clarity-600 hover:text-clarity-800 transition-colors inline-flex items-center gap-1"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to Recall Sets
        </Link>
      </nav>

      {/* Page header with set info and actions */}
      <header className="mb-8">
        <SetHeader
          name={recallSet.name}
          description={recallSet.description}
          status={recallSet.status}
          onEdit={handleEditSet}
          onDelete={handleDeleteSet}
        />
      </header>

      {/* Statistics overview row */}
      <section className="mb-8">
        <StatsOverview
          totalPoints={recallSet.summary.totalPoints}
          duePoints={recallSet.summary.duePoints}
          newPoints={recallSet.summary.newPoints}
          totalSessions={sessionsData?.pagination.total ?? 0}
          isLoading={isLoadingPoints}
        />
      </section>

      {/* Charts row - side by side on larger screens */}
      <section className="mb-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Point status breakdown pie chart */}
        <PointStatusBreakdown
          newCount={pointStatusCounts.new ?? 0}
          learningCount={pointStatusCounts.learning ?? 0}
          reviewCount={pointStatusCounts.review ?? 0}
          relearnCount={pointStatusCounts.relearning ?? 0}
          isLoading={isLoadingPoints}
        />

        {/* Recall rate line chart */}
        <RecallRateChart isLoading={isLoadingPoints} />
      </section>

      {/* Recall points list with CRUD actions */}
      <section className="mb-8">
        <PointsList
          points={recallPoints ?? []}
          isLoading={isLoadingPoints}
          onAddPoint={handleAddPoint}
          onEditPoint={handleEditPoint}
          onDeletePoint={handleDeletePoint}
        />
      </section>

      {/* Session history table */}
      <section className="mb-8">
        <SessionHistoryTable
          sessions={sessionsData?.sessions ?? []}
          isLoading={isLoadingSessions}
        />
      </section>

      {/* ======================================================================== */}
      {/* Modals */}
      {/* ======================================================================== */}

      {/* Edit Recall Set Modal */}
      <Modal
        isOpen={modalState.type === 'editSet'}
        onClose={closeModal}
        title="Edit Recall Set"
        className="max-w-2xl"
      >
        <RecallSetForm
          mode="edit"
          initialData={{
            name: recallSet.name,
            description: recallSet.description,
            discussionSystemPrompt: recallSet.discussionSystemPrompt,
          }}
          onSubmit={handleEditSetSubmit}
          onCancel={closeModal}
          isLoading={updateSetMutation.isPending}
        />
      </Modal>

      {/* Delete Recall Set Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={modalState.type === 'deleteSet'}
        onConfirm={handleDeleteSetConfirm}
        onCancel={closeModal}
        title="Delete Recall Set"
        message="This will permanently delete this recall set and all its recall points. This action cannot be undone."
        itemName={recallSet.name}
        isLoading={deleteSetMutation.isPending}
      />

      {/* Add Recall Point Modal */}
      <Modal
        isOpen={modalState.type === 'addPoint'}
        onClose={closeModal}
        title="Add Recall Point"
        className="max-w-2xl"
      >
        <RecallPointForm
          mode="create"
          onSubmit={handleAddPointSubmit}
          onCancel={closeModal}
          isLoading={createPointMutation.isPending}
        />
      </Modal>

      {/* Edit Recall Point Modal */}
      <Modal
        isOpen={modalState.type === 'editPoint'}
        onClose={closeModal}
        title="Edit Recall Point"
        className="max-w-2xl"
      >
        {modalState.type === 'editPoint' && (
          <RecallPointForm
            mode="edit"
            initialData={{
              content: modalState.point.content,
              context: modalState.point.context,
            }}
            onSubmit={handleEditPointSubmit}
            onCancel={closeModal}
            isLoading={updatePointMutation.isPending}
          />
        )}
      </Modal>

      {/* Delete Recall Point Confirmation Modal */}
      {modalState.type === 'deletePoint' && (
        <DeleteConfirmModal
          isOpen={true}
          onConfirm={handleDeletePointConfirm}
          onCancel={closeModal}
          title="Delete Recall Point"
          message="This will permanently delete this recall point and all associated review history. This action cannot be undone."
          itemName={modalState.point.content.slice(0, 50) + (modalState.point.content.length > 50 ? '...' : '')}
          isLoading={deletePointMutation.isPending}
        />
      )}
    </div>
  );
}

export default RecallSetDetail;
