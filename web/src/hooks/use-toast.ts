/**
 * useToast Hook
 *
 * A convenient hook for showing toast notifications.
 * Provides shorthand methods for common toast types.
 *
 * This hook wraps the ToastContext and provides a simpler API
 * for the most common use cases.
 *
 * Methods:
 * - toast({ type, title, message?, duration? }) - Full control
 * - success(title, message?) - Green success toast
 * - error(title, message?) - Red error toast
 * - warning(title, message?) - Yellow warning toast
 * - info(title, message?) - Blue info toast
 *
 * @example
 * ```tsx
 * function SaveButton() {
 *   const { success, error } = useToast();
 *
 *   async function handleSave() {
 *     try {
 *       await saveData();
 *       success('Saved!', 'Your changes have been saved.');
 *     } catch (err) {
 *       error('Save failed', 'Please try again later.');
 *     }
 *   }
 *
 *   return <button onClick={handleSave}>Save</button>;
 * }
 * ```
 */

import { useCallback } from 'react';
import { useToastContext, type ToastInput } from '../context/ToastContext';
import type { ToastType } from '../components/ui/Toast';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Return type for the useToast hook.
 * Includes both the full toast function and shorthand methods.
 */
interface UseToastReturn {
  /**
   * Show a toast with full control over options.
   * @returns The toast ID for optional reference
   */
  toast: (options: ToastInput) => string;

  /**
   * Show a success toast (green).
   * @param title - Main toast title
   * @param message - Optional descriptive message
   * @param duration - Optional auto-dismiss duration in ms
   * @returns The toast ID
   */
  success: (title: string, message?: string, duration?: number) => string;

  /**
   * Show an error toast (red).
   * @param title - Main toast title
   * @param message - Optional descriptive message
   * @param duration - Optional auto-dismiss duration in ms
   * @returns The toast ID
   */
  error: (title: string, message?: string, duration?: number) => string;

  /**
   * Show a warning toast (yellow).
   * @param title - Main toast title
   * @param message - Optional descriptive message
   * @param duration - Optional auto-dismiss duration in ms
   * @returns The toast ID
   */
  warning: (title: string, message?: string, duration?: number) => string;

  /**
   * Show an info toast (blue).
   * @param title - Main toast title
   * @param message - Optional descriptive message
   * @param duration - Optional auto-dismiss duration in ms
   * @returns The toast ID
   */
  info: (title: string, message?: string, duration?: number) => string;

  /**
   * Dismiss a specific toast by ID.
   */
  dismiss: (id: string) => void;

  /**
   * Dismiss all toasts.
   */
  dismissAll: () => void;
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for showing toast notifications.
 *
 * Provides both a full `toast()` function for complete control
 * and shorthand methods for common toast types.
 *
 * Must be used within a ToastProvider.
 */
export function useToast(): UseToastReturn {
  const { addToast, removeToast, clearToasts } = useToastContext();

  /**
   * Show a toast with full control over options.
   */
  const toast = useCallback(
    (options: ToastInput): string => {
      return addToast(options);
    },
    [addToast]
  );

  /**
   * Factory function to create shorthand methods for each toast type.
   * Returns a function that creates a toast of the specified type.
   */
  const createShorthand = useCallback(
    (type: ToastType) => {
      return (title: string, message?: string, duration?: number): string => {
        return addToast({ type, title, message, duration });
      };
    },
    [addToast]
  );

  // Create shorthand methods for each toast type
  const success = useCallback(
    (title: string, message?: string, duration?: number) =>
      createShorthand('success')(title, message, duration),
    [createShorthand]
  );

  const error = useCallback(
    (title: string, message?: string, duration?: number) =>
      createShorthand('error')(title, message, duration),
    [createShorthand]
  );

  const warning = useCallback(
    (title: string, message?: string, duration?: number) =>
      createShorthand('warning')(title, message, duration),
    [createShorthand]
  );

  const info = useCallback(
    (title: string, message?: string, duration?: number) =>
      createShorthand('info')(title, message, duration),
    [createShorthand]
  );

  /**
   * Dismiss a specific toast.
   */
  const dismiss = useCallback(
    (id: string): void => {
      removeToast(id);
    },
    [removeToast]
  );

  /**
   * Dismiss all toasts.
   */
  const dismissAll = useCallback((): void => {
    clearToasts();
  }, [clearToasts]);

  return {
    toast,
    success,
    error,
    warning,
    info,
    dismiss,
    dismissAll,
  };
}
