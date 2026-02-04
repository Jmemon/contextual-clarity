/**
 * Select Component
 *
 * A dropdown select input with integrated label and error state support.
 * Shares styling patterns with Input and Textarea for consistency.
 *
 * Features:
 * - Optional label with automatic id association
 * - Error state styling and message display
 * - Helper text support
 * - Placeholder option support
 * - Custom styling with native select accessibility
 */

import { forwardRef, type SelectHTMLAttributes, type ReactNode } from 'react';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** Label text displayed above the select */
  label?: string;
  /** Error message to display below the select */
  error?: string;
  /** Helper text displayed below the select (hidden when error is shown) */
  helperText?: string;
  /** Placeholder text shown when no value is selected */
  placeholder?: string;
  /** Select options as children */
  children: ReactNode;
}

/**
 * Dropdown select component with label and error handling.
 * Uses forwardRef to support form libraries and direct ref access.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      error,
      helperText,
      placeholder,
      id,
      children,
      className = '',
      ...props
    },
    ref
  ) => {
    // Generate a stable id for label association if not provided
    const selectId = id || `select-${label?.toLowerCase().replace(/\s+/g, '-')}`;
    const hasError = Boolean(error);

    return (
      <div className="w-full">
        {/* Label element with proper for/id association */}
        {label && (
          <label
            htmlFor={selectId}
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            {label}
          </label>
        )}

        {/* Select wrapper for custom arrow styling */}
        <div className="relative">
          {/* Minimum height ensures 44px touch target on mobile */}
          <select
            ref={ref}
            id={selectId}
            aria-invalid={hasError}
            aria-describedby={
              hasError
                ? `${selectId}-error`
                : helperText
                ? `${selectId}-helper`
                : undefined
            }
            className={`
              w-full px-3 py-2.5 sm:py-2 pr-10
              min-h-[44px] sm:min-h-[40px]
              border rounded-lg
              text-base sm:text-sm text-gray-900
              bg-white
              appearance-none
              transition-colors duration-150
              focus:outline-none focus:ring-2 focus:ring-offset-0
              disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed
              cursor-pointer
              ${
                hasError
                  ? 'border-red-500 focus:border-red-500 focus:ring-red-200'
                  : 'border-gray-300 focus:border-clarity-500 focus:ring-clarity-200'
              }
              ${className}
            `.trim()}
            {...props}
          >
            {/* Placeholder option with empty value */}
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {children}
          </select>

          {/* Custom dropdown arrow icon */}
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
            <svg
              className="h-5 w-5 text-gray-400"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                clipRule="evenodd"
              />
            </svg>
          </div>
        </div>

        {/* Error message with red text */}
        {hasError && (
          <p
            id={`${selectId}-error`}
            className="mt-1 text-sm text-red-600"
            role="alert"
          >
            {error}
          </p>
        )}

        {/* Helper text shown only when no error */}
        {!hasError && helperText && (
          <p
            id={`${selectId}-helper`}
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
Select.displayName = 'Select';
