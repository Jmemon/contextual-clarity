/**
 * Card Component
 *
 * A container component for grouping related content.
 * Supports optional header and footer sections.
 *
 * Structure:
 * - Card: Main container with shadow and rounded corners
 * - CardHeader: Optional header section with border
 * - CardBody: Main content area with padding
 * - CardFooter: Optional footer section with border
 *
 * Usage:
 * ```tsx
 * <Card>
 *   <CardHeader>Title</CardHeader>
 *   <CardBody>Content</CardBody>
 *   <CardFooter>Actions</CardFooter>
 * </Card>
 * ```
 */

import type { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Card content */
  children: ReactNode;
}

export interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {
  /** Header content */
  children: ReactNode;
}

export interface CardBodyProps extends HTMLAttributes<HTMLDivElement> {
  /** Body content */
  children: ReactNode;
}

export interface CardFooterProps extends HTMLAttributes<HTMLDivElement> {
  /** Footer content */
  children: ReactNode;
}

/**
 * Main Card container component.
 * Provides a white background, shadow, and rounded corners.
 * Includes transition for smooth hover/state changes.
 */
export function Card({ children, className = '', ...props }: CardProps) {
  return (
    <div
      className={`
        bg-white
        rounded-lg
        shadow-md
        border border-gray-200
        overflow-hidden
        transition-shadow duration-200
        ${className}
      `.trim()}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * Card header section.
 * Typically contains a title or heading with a bottom border.
 * Responsive padding for mobile screens.
 */
export function CardHeader({
  children,
  className = '',
  ...props
}: CardHeaderProps) {
  return (
    <div
      className={`
        px-4 sm:px-6 py-3 sm:py-4
        border-b border-gray-200
        bg-gray-50
        font-semibold text-gray-900
        ${className}
      `.trim()}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * Card body section.
 * Main content area with consistent padding.
 * Responsive padding for mobile screens.
 */
export function CardBody({ children, className = '', ...props }: CardBodyProps) {
  return (
    <div
      className={`
        px-4 sm:px-6 py-3 sm:py-4
        ${className}
      `.trim()}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * Card footer section.
 * Typically contains action buttons with a top border.
 * Responsive padding for mobile screens.
 */
export function CardFooter({
  children,
  className = '',
  ...props
}: CardFooterProps) {
  return (
    <div
      className={`
        px-4 sm:px-6 py-3 sm:py-4
        border-t border-gray-200
        bg-gray-50
        ${className}
      `.trim()}
      {...props}
    >
      {children}
    </div>
  );
}
