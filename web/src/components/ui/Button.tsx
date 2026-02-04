/**
 * Button Component
 *
 * A versatile button component with multiple variants and sizes.
 * Supports loading states, disabled states, and all standard button attributes.
 *
 * Variants:
 * - primary: Main call-to-action buttons (clarity blue)
 * - secondary: Secondary actions (gray)
 * - danger: Destructive actions (red)
 * - ghost: Minimal style for less prominent actions
 *
 * Sizes:
 * - sm: Small buttons for compact UIs
 * - md: Default size for most use cases
 * - lg: Large buttons for prominent actions
 */

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Spinner } from './Spinner';

/** Button visual variants */
type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

/** Button size options */
type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style variant of the button */
  variant?: ButtonVariant;
  /** Size of the button */
  size?: ButtonSize;
  /** Shows a loading spinner and disables the button */
  isLoading?: boolean;
  /** Button content */
  children: ReactNode;
}

/**
 * Tailwind classes for each button variant
 * Each variant provides distinct visual styling while maintaining accessibility
 */
const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-clarity-600 text-white hover:bg-clarity-700 focus:ring-clarity-500 disabled:bg-clarity-300',
  secondary:
    'bg-gray-100 text-gray-700 hover:bg-gray-200 focus:ring-gray-400 border border-gray-300 disabled:bg-gray-50 disabled:text-gray-400',
  danger:
    'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 disabled:bg-red-300',
  ghost:
    'bg-transparent text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus:ring-gray-400 disabled:text-gray-300',
};

/**
 * Tailwind classes for each button size
 * Includes padding, font size, and minimum width/height for consistency
 * Touch targets meet the 44x44px minimum for accessibility
 */
const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-2 text-sm min-w-[64px] min-h-[36px] sm:min-h-[32px]',
  md: 'px-4 py-2.5 text-base min-w-[80px] min-h-[44px] sm:min-h-[40px]',
  lg: 'px-6 py-3 text-lg min-w-[96px] min-h-[48px]',
};

/**
 * Button component with support for variants, sizes, and loading states.
 * Uses forwardRef to allow parent components to access the underlying button element.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      disabled,
      children,
      className = '',
      type = 'button',
      ...props
    },
    ref
  ) => {
    // Button is disabled when explicitly disabled or when loading
    const isDisabled = disabled || isLoading;

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        className={`
          inline-flex items-center justify-center
          font-medium rounded-lg
          transition-all duration-150
          focus:outline-none focus:ring-2 focus:ring-offset-2
          disabled:cursor-not-allowed
          active:scale-[0.98]
          ${variantClasses[variant]}
          ${sizeClasses[size]}
          ${className}
        `.trim()}
        aria-busy={isLoading}
        {...props}
      >
        {/* Show spinner when loading, maintaining button width */}
        {isLoading && (
          <Spinner
            size="sm"
            className="mr-2"
            aria-hidden="true"
          />
        )}
        {children}
      </button>
    );
  }
);

// Display name for React DevTools
Button.displayName = 'Button';
