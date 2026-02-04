/**
 * Toast Context Provider
 *
 * React context that manages toast notifications throughout the application.
 * Provides state management for active toasts and actions to add/remove them.
 *
 * Features:
 * - Maintains array of active toasts
 * - Auto-generates unique IDs for each toast
 * - Listens to 'toast' CustomEvents from query-client for automatic error toasts
 * - Limits max number of visible toasts
 *
 * Architecture:
 * - ToastContext: React context holding toast state and actions
 * - ToastProvider: Provider component that wraps the app
 * - useToastContext: Hook for accessing raw context (prefer useToast hook)
 *
 * The query-client dispatches 'toast' CustomEvents when queries/mutations fail.
 * This provider listens for those events and automatically shows error toasts.
 *
 * @see Toast.tsx for the toast component
 * @see use-toast.ts for the preferred hook to show toasts
 *
 * @example
 * ```tsx
 * // In App.tsx
 * import { ToastProvider } from '@/context/ToastContext';
 *
 * function App() {
 *   return (
 *     <ToastProvider>
 *       <AppRouter />
 *     </ToastProvider>
 *   );
 * }
 * ```
 */

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { ToastContainer, type ToastData, type ToastType } from '../components/ui/Toast';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Input for creating a new toast.
 * ID is auto-generated, so it's not required here.
 */
export interface ToastInput {
  /** Type determines the color scheme */
  type: ToastType;
  /** Main toast title (required) */
  title: string;
  /** Optional descriptive message */
  message?: string;
  /** Auto-dismiss duration in milliseconds (default: 5000, 0 = no auto-dismiss) */
  duration?: number;
}

/**
 * Context value provided to consuming components.
 */
interface ToastContextType {
  /** Array of currently active toasts */
  toasts: ToastData[];
  /** Add a new toast notification */
  addToast: (toast: ToastInput) => string;
  /** Remove a toast by ID */
  removeToast: (id: string) => void;
  /** Remove all toasts */
  clearToasts: () => void;
}

// ============================================================================
// Context Creation
// ============================================================================

/**
 * React context for toast state.
 * Initialized as undefined to detect usage outside provider.
 */
const ToastContext = createContext<ToastContextType | undefined>(undefined);

// ============================================================================
// Constants
// ============================================================================

/** Maximum number of toasts visible at once */
const MAX_TOASTS = 5;

/** Counter for generating unique toast IDs */
let toastIdCounter = 0;

/**
 * Generates a unique ID for a toast.
 * Uses a simple incrementing counter combined with timestamp.
 */
function generateToastId(): string {
  toastIdCounter += 1;
  return `toast-${Date.now()}-${toastIdCounter}`;
}

// ============================================================================
// Provider Component
// ============================================================================

interface ToastProviderProps {
  children: ReactNode;
  /** Position of the toast container (default: 'top-right') */
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
}

/**
 * Toast context provider component.
 *
 * Wrap your application with this provider to enable toast notifications.
 * This provider also renders the ToastContainer component that displays toasts.
 *
 * Automatic Error Handling:
 * The provider listens for 'toast' CustomEvents dispatched by the query-client
 * when API errors occur. These events are automatically converted to error toasts.
 */
export function ToastProvider({ children, position = 'top-right' }: ToastProviderProps) {
  // State to hold active toasts
  const [toasts, setToasts] = useState<ToastData[]>([]);

  /**
   * Adds a new toast to the stack.
   * Limits the number of visible toasts to MAX_TOASTS.
   * Returns the generated toast ID for optional reference.
   */
  const addToast = useCallback((input: ToastInput): string => {
    const id = generateToastId();
    const newToast: ToastData = {
      id,
      type: input.type,
      title: input.title,
      message: input.message,
      duration: input.duration,
    };

    setToasts((prev) => {
      // Add new toast at the beginning (newest first)
      const updated = [newToast, ...prev];
      // Limit to MAX_TOASTS
      return updated.slice(0, MAX_TOASTS);
    });

    return id;
  }, []);

  /**
   * Removes a toast by its ID.
   */
  const removeToast = useCallback((id: string): void => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  /**
   * Removes all toasts.
   */
  const clearToasts = useCallback((): void => {
    setToasts([]);
  }, []);

  /**
   * Listen for 'toast' CustomEvents from the query-client.
   * These events are dispatched when queries or mutations fail.
   */
  useEffect(() => {
    /**
     * Event handler for 'toast' CustomEvents.
     * Converts the event detail to a toast and displays it.
     */
    function handleToastEvent(event: Event) {
      // Type assertion for CustomEvent with our expected detail shape
      const customEvent = event as CustomEvent<{
        type: 'error' | 'success' | 'info' | 'warning';
        title: string;
        description?: string;
      }>;

      const { type, title, description } = customEvent.detail;

      addToast({
        type,
        title,
        message: description,
      });
    }

    // Add event listener for toast events
    window.addEventListener('toast', handleToastEvent);

    // Clean up listener on unmount
    return () => {
      window.removeEventListener('toast', handleToastEvent);
    };
  }, [addToast]);

  // Context value to provide
  const value: ToastContextType = {
    toasts,
    addToast,
    removeToast,
    clearToasts,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Render the toast container - it handles its own visibility */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} position={position} />
    </ToastContext.Provider>
  );
}

// ============================================================================
// Context Hook
// ============================================================================

/**
 * Hook to access the toast context directly.
 *
 * For most use cases, prefer the useToast hook which provides
 * convenient shorthand methods (success, error, warning, info).
 *
 * @returns Toast context with state and actions
 * @throws Error if used outside of ToastProvider
 *
 * @see use-toast.ts for the preferred hook with shorthand methods
 */
export function useToastContext(): ToastContextType {
  const context = useContext(ToastContext);

  if (context === undefined) {
    throw new Error(
      'useToastContext must be used within a ToastProvider. ' +
      'Make sure your component is wrapped with <ToastProvider>.'
    );
  }

  return context;
}
