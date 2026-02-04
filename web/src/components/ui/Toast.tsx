/**
 * Toast Component
 *
 * A notification component that displays temporary messages to users.
 * Toasts appear in a fixed position and can be dismissed manually or auto-dismiss.
 *
 * Features:
 * - Four types: success (green), error (red), warning (yellow), info (blue)
 * - Auto-dismiss after configurable duration
 * - Manual dismiss button
 * - Slide-in animation
 * - Accessible with ARIA attributes
 *
 * This component is used by ToastContainer and should not be used directly.
 * Use the useToast hook to trigger toasts.
 *
 * @see ToastContext.tsx for the provider and container
 * @see use-toast.ts for the hook to show toasts
 */

import { useEffect, useState, type HTMLAttributes } from 'react';

// ============================================================================
// Type Definitions
// ============================================================================

/** Available toast types that determine styling */
export type ToastType = 'success' | 'error' | 'warning' | 'info';

/** Toast data structure */
export interface ToastData {
  /** Unique identifier for the toast */
  id: string;
  /** Type determines the color scheme */
  type: ToastType;
  /** Main toast title (required) */
  title: string;
  /** Optional descriptive message */
  message?: string;
  /** Auto-dismiss duration in milliseconds (0 = no auto-dismiss) */
  duration?: number;
}

export interface ToastProps extends HTMLAttributes<HTMLDivElement> {
  /** Toast data to display */
  toast: ToastData;
  /** Callback when toast should be dismissed */
  onDismiss: (id: string) => void;
}

// ============================================================================
// Styling Configuration
// ============================================================================

/**
 * Color schemes for each toast type.
 * Includes background, border, icon, and text colors.
 */
const typeStyles: Record<ToastType, string> = {
  success: 'bg-green-50 border-green-200 text-green-800',
  error: 'bg-red-50 border-red-200 text-red-800',
  warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  info: 'bg-blue-50 border-blue-200 text-blue-800',
};

/**
 * Icon colors for each toast type.
 */
const iconColors: Record<ToastType, string> = {
  success: 'text-green-500',
  error: 'text-red-500',
  warning: 'text-yellow-500',
  info: 'text-blue-500',
};

// ============================================================================
// Icon Components
// ============================================================================

/** Success checkmark icon */
function SuccessIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

/** Error X icon */
function ErrorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

/** Warning exclamation icon */
function WarningIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}

/** Info circle icon */
function InfoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

/** Close X icon for dismiss button */
function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

/**
 * Returns the appropriate icon component for a toast type.
 */
function ToastIcon({ type }: { type: ToastType }) {
  const iconClass = `w-5 h-5 ${iconColors[type]}`;

  switch (type) {
    case 'success':
      return <SuccessIcon className={iconClass} />;
    case 'error':
      return <ErrorIcon className={iconClass} />;
    case 'warning':
      return <WarningIcon className={iconClass} />;
    case 'info':
      return <InfoIcon className={iconClass} />;
  }
}

// ============================================================================
// Toast Component
// ============================================================================

/** Default auto-dismiss duration in milliseconds */
const DEFAULT_DURATION = 5000;

/**
 * Individual toast notification component.
 *
 * Handles its own auto-dismiss timer and provides a manual dismiss button.
 * Uses a slide-in animation when appearing.
 */
export function Toast({ toast, onDismiss, className = '', ...props }: ToastProps) {
  const { id, type, title, message, duration = DEFAULT_DURATION } = toast;

  // Track visibility for exit animation (not currently animated but prepared for future)
  const [isVisible, setIsVisible] = useState(false);

  // Trigger enter animation on mount
  useEffect(() => {
    // Small delay to ensure CSS transition works
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  // Auto-dismiss timer
  useEffect(() => {
    // If duration is 0 or negative, don't auto-dismiss
    if (duration <= 0) return;

    const timer = setTimeout(() => {
      onDismiss(id);
    }, duration);

    // Clean up timer on unmount or if id changes
    return () => clearTimeout(timer);
  }, [id, duration, onDismiss]);

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`
        ${typeStyles[type]}
        border rounded-lg shadow-lg
        p-4
        flex items-start gap-3
        min-w-[300px] max-w-[400px]
        transform transition-all duration-300 ease-out
        ${isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}
        ${className}
      `.trim()}
      {...props}
    >
      {/* Toast type icon */}
      <div className="flex-shrink-0" aria-hidden="true">
        <ToastIcon type={type} />
      </div>

      {/* Toast content */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{title}</p>
        {message && <p className="mt-1 text-sm opacity-80">{message}</p>}
      </div>

      {/* Dismiss button */}
      <button
        type="button"
        onClick={() => onDismiss(id)}
        className="flex-shrink-0 rounded-md p-1 hover:bg-black/5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-current"
        aria-label="Dismiss notification"
      >
        <CloseIcon className="w-4 h-4" />
      </button>
    </div>
  );
}

// ============================================================================
// Toast Container Component
// ============================================================================

export interface ToastContainerProps {
  /** Array of active toasts to display */
  toasts: ToastData[];
  /** Callback when a toast should be removed */
  onDismiss: (id: string) => void;
  /** Position of the toast container */
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
}

/**
 * Position classes for the toast container.
 */
const positionClasses: Record<string, string> = {
  'top-right': 'top-4 right-4',
  'top-left': 'top-4 left-4',
  'bottom-right': 'bottom-4 right-4',
  'bottom-left': 'bottom-4 left-4',
};

/**
 * Container component that renders and positions multiple toasts.
 *
 * Toasts are stacked vertically with the newest at the top.
 * The container has a high z-index to appear above all other content.
 */
export function ToastContainer({
  toasts,
  onDismiss,
  position = 'top-right',
}: ToastContainerProps) {
  // Don't render anything if no toasts
  if (toasts.length === 0) return null;

  return (
    <div
      className={`
        fixed ${positionClasses[position]}
        z-50
        flex flex-col gap-2
        pointer-events-none
      `.trim()}
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <Toast toast={toast} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  );
}
