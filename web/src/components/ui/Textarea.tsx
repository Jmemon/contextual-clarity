/**
 * Textarea Component
 *
 * A multi-line text input with integrated label and error state support.
 * Shares styling patterns with the Input component for consistency.
 *
 * Features:
 * - Optional label with automatic id association
 * - Error state styling and message display
 * - Helper text support
 * - Configurable rows for height control
 * - Resize control via className
 */

import { forwardRef, type TextareaHTMLAttributes } from 'react';

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Label text displayed above the textarea */
  label?: string;
  /** Error message to display below the textarea */
  error?: string;
  /** Helper text displayed below the textarea (hidden when error is shown) */
  helperText?: string;
}

/**
 * Multi-line text input component with label and error handling.
 * Uses forwardRef to support form libraries and direct ref access.
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    { label, error, helperText, id, rows = 4, className = '', ...props },
    ref
  ) => {
    // Generate a stable id for label association if not provided
    const textareaId =
      id || `textarea-${label?.toLowerCase().replace(/\s+/g, '-')}`;
    const hasError = Boolean(error);

    return (
      <div className="w-full">
        {/* Label element with proper for/id association */}
        {label && (
          <label
            htmlFor={textareaId}
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            {label}
          </label>
        )}

        {/* Textarea field with conditional error styling */}
        <textarea
          ref={ref}
          id={textareaId}
          rows={rows}
          aria-invalid={hasError}
          aria-describedby={
            hasError
              ? `${textareaId}-error`
              : helperText
              ? `${textareaId}-helper`
              : undefined
          }
          className={`
            w-full px-3 py-2
            border rounded-lg
            text-gray-900 placeholder-gray-400
            transition-colors duration-150
            focus:outline-none focus:ring-2 focus:ring-offset-0
            disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed
            resize-y
            ${
              hasError
                ? 'border-red-500 focus:border-red-500 focus:ring-red-200'
                : 'border-gray-300 focus:border-clarity-500 focus:ring-clarity-200'
            }
            ${className}
          `.trim()}
          {...props}
        />

        {/* Error message with red text */}
        {hasError && (
          <p
            id={`${textareaId}-error`}
            className="mt-1 text-sm text-red-600"
            role="alert"
          >
            {error}
          </p>
        )}

        {/* Helper text shown only when no error */}
        {!hasError && helperText && (
          <p
            id={`${textareaId}-helper`}
            className="mt-1 text-sm text-gray-500"
          >
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

// Display name for React DevTools
Textarea.displayName = 'Textarea';
