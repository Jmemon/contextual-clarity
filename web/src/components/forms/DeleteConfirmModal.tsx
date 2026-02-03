/**
 * DeleteConfirmModal Component
 *
 * A confirmation dialog for destructive delete operations.
 * Displays a warning message and requires explicit confirmation before deletion.
 *
 * Features:
 * - Modal overlay with clear warning styling
 * - Danger button for confirmation to indicate destructive action
 * - Cancel button to abort the operation
 * - Customizable title, message, and item name
 * - Accessible with proper ARIA attributes (inherited from Modal)
 *
 * Usage:
 * ```tsx
 * <DeleteConfirmModal
 *   isOpen={showDeleteModal}
 *   onConfirm={handleDelete}
 *   onCancel={() => setShowDeleteModal(false)}
 *   title="Delete Recall Set"
 *   message="This action cannot be undone. All recall points in this set will also be deleted."
 *   itemName="JavaScript Fundamentals"
 * />
 * ```
 */

import { Button, Modal } from '@/components/ui';

export interface DeleteConfirmModalProps {
  /** Controls whether the modal is visible */
  isOpen: boolean;
  /** Callback fired when user confirms deletion */
  onConfirm: () => void;
  /** Callback fired when user cancels (closes modal without deleting) */
  onCancel: () => void;
  /** Modal title displayed in the header */
  title: string;
  /** Warning message explaining the consequences of deletion */
  message: string;
  /** Name of the item being deleted (displayed prominently) */
  itemName: string;
  /** Loading state for the confirm button (during async deletion) */
  isLoading?: boolean;
}

/**
 * Confirmation modal for delete operations.
 * Uses danger-styled button to indicate the destructive nature of the action.
 */
export function DeleteConfirmModal({
  isOpen,
  onConfirm,
  onCancel,
  title,
  message,
  itemName,
  isLoading = false,
}: DeleteConfirmModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onCancel} title={title}>
      {/* Warning content section */}
      <div className="space-y-4">
        {/* Warning icon and main message */}
        <div className="flex items-start gap-4">
          {/* Warning icon - red circle with exclamation */}
          <div className="flex-shrink-0">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-red-100">
              <svg
                className="w-6 h-6 text-red-600"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
          </div>

          {/* Message content */}
          <div className="flex-1">
            {/* Item name prominently displayed */}
            <p className="text-sm font-medium text-gray-900">
              Are you sure you want to delete{' '}
              <span className="font-semibold text-red-600">"{itemName}"</span>?
            </p>

            {/* Warning message about consequences */}
            <p className="mt-2 text-sm text-gray-500">{message}</p>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
        {/* Cancel button - allows user to abort */}
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          disabled={isLoading}
        >
          Cancel
        </Button>

        {/* Delete confirmation button - danger variant */}
        <Button
          type="button"
          variant="danger"
          onClick={onConfirm}
          isLoading={isLoading}
        >
          Delete
        </Button>
      </div>
    </Modal>
  );
}

// Display name for React DevTools
DeleteConfirmModal.displayName = 'DeleteConfirmModal';
