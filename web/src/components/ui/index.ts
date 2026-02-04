/**
 * UI Component Library - Barrel Export
 *
 * This file re-exports all UI components from a single entry point.
 * Import components like:
 *
 * ```typescript
 * import { Button, Card, Badge } from '@/components/ui';
 * ```
 *
 * Available components:
 * - Button: Versatile button with variants and loading state
 * - Badge: Status indicator badges
 * - Card, CardHeader, CardBody, CardFooter: Container components
 * - Input: Text input with label and error support
 * - Textarea: Multi-line text input
 * - Select: Dropdown select input
 * - Modal: Dialog overlay component
 * - Spinner: Loading indicator
 * - EmptyState, DefaultEmptyIcon: Empty content placeholder
 * - StatCard: Statistics display card
 * - Progress: Progress bar component
 * - Table components: Table, TableHeader, TableBody, TableRow, TableHead, TableCell
 * - ErrorState: Error display with retry button
 * - LoadingState: Full-page or section loading indicator
 * - Toast, ToastContainer: Notification components
 */

// Button component with variants and loading state
export { Button, type ButtonProps } from './Button';

// Badge component for status indicators
export { Badge, type BadgeProps } from './Badge';

// Card components for content containers
export {
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  type CardProps,
  type CardHeaderProps,
  type CardBodyProps,
  type CardFooterProps,
} from './Card';

// Input component for single-line text entry
export { Input, type InputProps } from './Input';

// Textarea component for multi-line text entry
export { Textarea, type TextareaProps } from './Textarea';

// Select component for dropdown selection
export { Select, type SelectProps } from './Select';

// Modal component for dialog overlays
export { Modal, type ModalProps } from './Modal';

// Spinner component for loading states
export { Spinner, type SpinnerProps } from './Spinner';

// EmptyState component for empty content placeholders
export {
  EmptyState,
  DefaultEmptyIcon,
  type EmptyStateProps,
} from './EmptyState';

// StatCard component for statistics display
export { StatCard, type StatCardProps } from './StatCard';

// Progress component for progress bars
export { Progress, type ProgressProps } from './Progress';

// Table components for tabular data
export {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  type TableProps,
  type TableHeaderProps,
  type TableBodyProps,
  type TableRowProps,
  type TableHeadProps,
  type TableCellProps,
} from './Table';

// ErrorState component for error displays with retry
export { ErrorState, type ErrorStateProps } from './ErrorState';

// LoadingState component for loading indicators
export { LoadingState, type LoadingStateProps } from './LoadingState';

// Toast components for notifications
export {
  Toast,
  ToastContainer,
  type ToastData,
  type ToastType,
  type ToastProps,
  type ToastContainerProps,
} from './Toast';
