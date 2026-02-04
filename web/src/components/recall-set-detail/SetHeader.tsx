/**
 * SetHeader Component
 *
 * Displays the header section of a recall set detail page.
 * Shows the set name, description, status badge, and edit button.
 *
 * Features:
 * - Name displayed prominently as page title
 * - Description text below the title
 * - Status badge (active, paused, archived) with semantic colors
 * - Edit button to open the edit modal
 * - Delete button for removing the set
 *
 * @example
 * ```tsx
 * <SetHeader
 *   name="JavaScript Fundamentals"
 *   description="Core JavaScript concepts for interviews"
 *   status="active"
 *   onEdit={() => setEditModalOpen(true)}
 *   onDelete={() => setDeleteModalOpen(true)}
 * />
 * ```
 */

import { Badge, Button } from '@/components/ui';
import type { RecallSetStatus } from '@/types/api';

export interface SetHeaderProps {
  /** Name of the recall set */
  name: string;
  /** Description of the recall set */
  description: string;
  /** Current status of the recall set */
  status: RecallSetStatus;
  /** Callback when edit button is clicked */
  onEdit: () => void;
  /** Callback when delete button is clicked */
  onDelete: () => void;
  /** Whether the component is in a loading state */
  isLoading?: boolean;
}

/**
 * Maps recall set status to badge status for semantic coloring.
 * - active: success (green)
 * - paused: warning (amber)
 * - archived: info (blue/gray)
 */
const statusToBadge: Record<RecallSetStatus, 'success' | 'warning' | 'info'> = {
  active: 'success',
  paused: 'warning',
  archived: 'info',
};

/**
 * Header component for the recall set detail page.
 * Provides the title, description, status, and action buttons.
 */
export function SetHeader({
  name,
  description,
  status,
  onEdit,
  onDelete,
  isLoading = false,
}: SetHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
      {/* Left side: Name, status, and description */}
      <div className="flex-1">
        {/* Title row with status badge */}
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            {name}
          </h1>
          <Badge status={statusToBadge[status]}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </Badge>
        </div>

        {/* Description text */}
        <p className="text-gray-600 max-w-2xl">{description}</p>
      </div>

      {/* Right side: Action buttons */}
      <div className="flex items-center gap-2">
        {/* Edit button - primary action */}
        <Button
          variant="secondary"
          size="md"
          onClick={onEdit}
          disabled={isLoading}
        >
          <svg
            className="w-4 h-4 mr-2"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
          Edit
        </Button>

        {/* Delete button - danger action */}
        <Button
          variant="danger"
          size="md"
          onClick={onDelete}
          disabled={isLoading}
        >
          <svg
            className="w-4 h-4 mr-2"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
          Delete
        </Button>
      </div>
    </div>
  );
}

// Display name for React DevTools
SetHeader.displayName = 'SetHeader';
