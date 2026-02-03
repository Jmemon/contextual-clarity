/**
 * Modal Component
 *
 * A dialog overlay component for displaying focused content.
 * Implements accessibility best practices including:
 * - Focus trapping within the modal
 * - Escape key to close
 * - Click outside (overlay) to close
 * - Proper ARIA attributes
 *
 * Features:
 * - Customizable title
 * - Overlay backdrop with click-to-close
 * - Keyboard navigation support
 * - Smooth transitions (can be added via className)
 */

import {
  useEffect,
  useRef,
  useCallback,
  type HTMLAttributes,
  type ReactNode,
  type KeyboardEvent,
} from 'react';

export interface ModalProps extends HTMLAttributes<HTMLDivElement> {
  /** Controls whether the modal is visible */
  isOpen: boolean;
  /** Callback fired when the modal should close */
  onClose: () => void;
  /** Modal title displayed in the header */
  title?: string;
  /** Modal content */
  children: ReactNode;
  /** Whether clicking the overlay closes the modal (default: true) */
  closeOnOverlayClick?: boolean;
  /** Whether pressing Escape closes the modal (default: true) */
  closeOnEscape?: boolean;
}

/**
 * Modal dialog component with overlay backdrop.
 * Implements focus trapping and keyboard navigation for accessibility.
 */
export function Modal({
  isOpen,
  onClose,
  title,
  children,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  className = '',
  ...props
}: ModalProps) {
  // Reference to the modal container for focus management
  const modalRef = useRef<HTMLDivElement>(null);
  // Store the element that had focus before modal opened
  const previousFocusRef = useRef<HTMLElement | null>(null);

  /**
   * Handle escape key press to close modal
   */
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (closeOnEscape && event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    },
    [closeOnEscape, onClose]
  );

  /**
   * Handle overlay click to close modal
   */
  const handleOverlayClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      // Only close if clicking the overlay itself, not the modal content
      if (closeOnOverlayClick && event.target === event.currentTarget) {
        onClose();
      }
    },
    [closeOnOverlayClick, onClose]
  );

  /**
   * Focus management: save previous focus and restore on close
   * Also handles body scroll lock
   */
  useEffect(() => {
    if (isOpen) {
      // Save the currently focused element
      previousFocusRef.current = document.activeElement as HTMLElement;

      // Focus the modal for keyboard navigation
      modalRef.current?.focus();

      // Prevent body scrolling while modal is open
      document.body.style.overflow = 'hidden';
    } else {
      // Restore body scrolling
      document.body.style.overflow = '';

      // Restore focus to the previously focused element
      if (previousFocusRef.current) {
        previousFocusRef.current.focus();
        previousFocusRef.current = null;
      }
    }

    // Cleanup on unmount
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Don't render anything if modal is closed
  if (!isOpen) {
    return null;
  }

  return (
    // Overlay backdrop - full screen, semi-transparent
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleOverlayClick}
      aria-hidden="true"
    >
      {/* Modal dialog container */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={`
          relative
          bg-white
          rounded-lg
          shadow-xl
          max-w-lg w-full mx-4
          max-h-[90vh]
          overflow-hidden
          flex flex-col
          ${className}
        `.trim()}
        {...props}
      >
        {/* Modal header with title and close button */}
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h2
              id="modal-title"
              className="text-lg font-semibold text-gray-900"
            >
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="
                text-gray-400 hover:text-gray-600
                rounded-lg p-1
                focus:outline-none focus:ring-2 focus:ring-clarity-500
                transition-colors
              "
              aria-label="Close modal"
            >
              {/* X icon for close button */}
              <svg
                className="w-5 h-5"
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        )}

        {/* Modal content area - scrollable if content is too long */}
        <div className="px-6 py-4 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}
