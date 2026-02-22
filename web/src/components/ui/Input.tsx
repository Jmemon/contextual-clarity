/**
 * Input Component
 *
 * A text input field with integrated label and error state support.
 * Designed for form usage with proper accessibility attributes.
 *
 * Features:
 * - Optional label with automatic id association
 * - Error state styling and message display
 * - Helper text support
 * - Full spread of native input attributes
 */

import { forwardRef, type InputHTMLAttributes } from 'react';

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Label text displayed above the input */
  label?: string;
  /** Error message to display below the input */
  error?: string;
  /** Helper text displayed below the input (hidden when error is shown) */
  helperText?: string;
}

/**
 * Text input component with label and error handling.
 * Uses forwardRef to support form libraries and direct ref access.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, id, className = '', ...props }, ref) => {
    // Generate a stable id for label association if not provided
    const inputId = id || `input-${label?.toLowerCase().replace(/\s+/g, '-')}`;
    const hasError = Boolean(error);

    return (
      <div className="w-full">
        {/* Label element with proper for/id association */}
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-slate-300 mb-1"
          >
            {label}
          </label>
        )}

        {/* Input field with conditional error styling */}
        {/* Minimum height ensures 44px touch target on mobile */}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={hasError}
          aria-describedby={
            hasError ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined
          }
          className={`
            w-full px-3 py-2.5 sm:py-2
            min-h-[44px] sm:min-h-[40px]
            bg-slate-800 border rounded-lg
            text-base sm:text-sm text-white placeholder-slate-500
            transition-colors duration-150
            focus:outline-none focus:ring-2 focus:ring-offset-0
            disabled:bg-slate-900 disabled:text-slate-600 disabled:cursor-not-allowed
            ${
              hasError
                ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
                : 'border-slate-600 focus:border-clarity-500 focus:ring-clarity-500/20'
            }
            ${className}
          `.trim()}
          {...props}
        />

        {/* Error message with red text */}
        {hasError && (
          <p
            id={`${inputId}-error`}
            className="mt-1 text-sm text-red-400"
            role="alert"
          >
            {error}
          </p>
        )}

        {/* Helper text shown only when no error */}
        {!hasError && helperText && (
          <p
            id={`${inputId}-helper`}
            className="mt-1 text-sm text-slate-500"
          >
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

// Display name for React DevTools
Input.displayName = 'Input';
