/**
 * PointsList Component
 *
 * Displays a table of all recall points in a recall set.
 * Provides functionality to:
 * - View all points with their content, context, and FSRS state
 * - Add new recall points
 * - Edit existing recall points
 * - Delete recall points with confirmation
 *
 * Features:
 * - Sortable/filterable table view
 * - FSRS state badges (new, learning, review, relearning)
 * - Due date display
 * - Action buttons for edit and delete
 * - Loading and empty states
 *
 * @example
 * ```tsx
 * <PointsList
 *   points={recallPoints}
 *   isLoading={isLoading}
 *   onAddPoint={() => setAddModalOpen(true)}
 *   onEditPoint={(point) => { setSelectedPoint(point); setEditModalOpen(true); }}
 *   onDeletePoint={(point) => { setSelectedPoint(point); setDeleteModalOpen(true); }}
 * />
 * ```
 */

import { useMemo } from 'react';
import {
  Card,
  CardHeader,
  CardBody,
  Button,
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Spinner,
  EmptyState,
} from '@/components/ui';
import type { RecallPoint, FSRSLearningState } from '@/types/api';

export interface PointsListProps {
  /** Array of recall points to display */
  points: RecallPoint[];
  /** Whether the data is currently loading */
  isLoading?: boolean;
  /** Callback when add point button is clicked */
  onAddPoint: () => void;
  /** Callback when edit button is clicked for a point */
  onEditPoint: (point: RecallPoint) => void;
  /** Callback when delete button is clicked for a point */
  onDeletePoint: (point: RecallPoint) => void;
}

/**
 * Maps FSRS learning state to badge status for semantic coloring.
 * - new: info (blue)
 * - learning: warning (amber)
 * - review: success (green)
 * - relearning: error (red)
 */
const stateToBadge: Record<FSRSLearningState, 'info' | 'warning' | 'success' | 'error'> = {
  new: 'info',
  learning: 'warning',
  review: 'success',
  relearning: 'error',
};

/**
 * Human-readable labels for FSRS learning states.
 */
const stateLabels: Record<FSRSLearningState, string> = {
  new: 'New',
  learning: 'Learning',
  review: 'Review',
  relearning: 'Relearning',
};

/**
 * Formats a date string for display.
 * Shows relative time for dates close to today.
 */
function formatDueDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffDays = Math.floor((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return `${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? '' : 's'} overdue`;
  } else if (diffDays === 0) {
    return 'Due today';
  } else if (diffDays === 1) {
    return 'Due tomorrow';
  } else if (diffDays <= 7) {
    return `Due in ${diffDays} days`;
  } else {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  }
}

/**
 * Truncates text to a maximum length with ellipsis.
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + '...';
}

/**
 * Points list table component.
 * Shows all recall points with actions for add/edit/delete.
 */
export function PointsList({
  points,
  isLoading = false,
  onAddPoint,
  onEditPoint,
  onDeletePoint,
}: PointsListProps) {
  // Sort points by due date (most urgent first)
  const sortedPoints = useMemo(() => {
    return [...points].sort((a, b) => {
      const dateA = new Date(a.fsrsState.due).getTime();
      const dateB = new Date(b.fsrsState.due).getTime();
      return dateA - dateB;
    });
  }, [points]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <span>Recall Points ({points.length})</span>
          {/* Add point button in header */}
          <Button variant="primary" size="sm" onClick={onAddPoint}>
            <svg
              className="w-4 h-4 mr-1"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 6v6m0 0v6m0-6h6m-6 0H6"
              />
            </svg>
            Add Point
          </Button>
        </div>
      </CardHeader>
      <CardBody className="p-0">
        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Spinner size="lg" label="Loading recall points..." />
          </div>
        )}

        {/* Empty state when no points exist */}
        {!isLoading && points.length === 0 && (
          <div className="py-12">
            <EmptyState
              title="No recall points yet"
              description="Add your first recall point to start learning with spaced repetition."
              action={
                <Button variant="primary" onClick={onAddPoint}>
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
                      d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                    />
                  </svg>
                  Add First Point
                </Button>
              }
            />
          </div>
        )}

        {/* Points table */}
        {!isLoading && points.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow hoverable={false}>
                <TableHead>Content</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Reps</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedPoints.map((point) => (
                <TableRow key={point.id}>
                  {/* Content cell - truncated with tooltip */}
                  <TableCell>
                    <div className="max-w-md">
                      <p className="font-medium text-gray-900" title={point.content}>
                        {truncateText(point.content, 60)}
                      </p>
                      <p className="text-sm text-gray-500 mt-1" title={point.context}>
                        {truncateText(point.context, 80)}
                      </p>
                    </div>
                  </TableCell>

                  {/* Status badge cell */}
                  <TableCell>
                    <Badge status={stateToBadge[point.fsrsState.state]}>
                      {stateLabels[point.fsrsState.state]}
                    </Badge>
                  </TableCell>

                  {/* Due date cell */}
                  <TableCell>
                    <span
                      className={`text-sm ${
                        new Date(point.fsrsState.due) < new Date()
                          ? 'text-red-600 font-medium'
                          : 'text-gray-600'
                      }`}
                    >
                      {formatDueDate(point.fsrsState.due)}
                    </span>
                  </TableCell>

                  {/* Repetitions count cell */}
                  <TableCell>
                    <span className="text-sm text-gray-600">{point.fsrsState.reps}</span>
                  </TableCell>

                  {/* Actions cell */}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {/* Edit button */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onEditPoint(point)}
                        aria-label={`Edit ${truncateText(point.content, 20)}`}
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
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                      </Button>

                      {/* Delete button */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDeletePoint(point)}
                        aria-label={`Delete ${truncateText(point.content, 20)}`}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
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
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardBody>
    </Card>
  );
}

// Display name for React DevTools
PointsList.displayName = 'PointsList';
