/**
 * Table Component
 *
 * A basic table component for displaying tabular data.
 * Provides styled wrapper components for semantic table elements.
 *
 * Components:
 * - Table: Main table container with styling
 * - TableHeader: Container for header row(s)
 * - TableBody: Container for data rows
 * - TableRow: Individual row
 * - TableHead: Header cell (th)
 * - TableCell: Data cell (td)
 *
 * Usage:
 * ```tsx
 * <Table>
 *   <TableHeader>
 *     <TableRow>
 *       <TableHead>Name</TableHead>
 *       <TableHead>Status</TableHead>
 *     </TableRow>
 *   </TableHeader>
 *   <TableBody>
 *     <TableRow>
 *       <TableCell>Item 1</TableCell>
 *       <TableCell>Active</TableCell>
 *     </TableRow>
 *   </TableBody>
 * </Table>
 * ```
 */

import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';

// ============================================================================
// Table Container
// ============================================================================

export interface TableProps extends HTMLAttributes<HTMLTableElement> {
  children: React.ReactNode;
}

/**
 * Main table container with responsive wrapper and base styling.
 * Features horizontal scroll on mobile for wide tables and smooth scrolling.
 */
export function Table({ children, className = '', ...props }: TableProps) {
  return (
    <div className="w-full overflow-x-auto -webkit-overflow-scrolling-touch scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
      <table
        className={`
          w-full
          border-collapse
          text-xs sm:text-sm
          min-w-[600px]
          ${className}
        `.trim()}
        {...props}
      >
        {children}
      </table>
    </div>
  );
}

// ============================================================================
// Table Header
// ============================================================================

export interface TableHeaderProps
  extends HTMLAttributes<HTMLTableSectionElement> {
  children: React.ReactNode;
}

/**
 * Table header section (thead) with background styling.
 */
export function TableHeader({
  children,
  className = '',
  ...props
}: TableHeaderProps) {
  return (
    <thead
      className={`
        bg-gray-50
        border-b border-gray-200
        ${className}
      `.trim()}
      {...props}
    >
      {children}
    </thead>
  );
}

// ============================================================================
// Table Body
// ============================================================================

export interface TableBodyProps
  extends HTMLAttributes<HTMLTableSectionElement> {
  children: React.ReactNode;
}

/**
 * Table body section (tbody) for data rows.
 */
export function TableBody({
  children,
  className = '',
  ...props
}: TableBodyProps) {
  return (
    <tbody
      className={`
        divide-y divide-gray-200
        ${className}
      `.trim()}
      {...props}
    >
      {children}
    </tbody>
  );
}

// ============================================================================
// Table Row
// ============================================================================

export interface TableRowProps extends HTMLAttributes<HTMLTableRowElement> {
  children: React.ReactNode;
  /** Whether this row should have hover highlighting */
  hoverable?: boolean;
}

/**
 * Table row (tr) with optional hover state.
 * Includes transition for smooth hover effect.
 */
export function TableRow({
  children,
  hoverable = true,
  className = '',
  ...props
}: TableRowProps) {
  return (
    <tr
      className={`
        ${hoverable ? 'hover:bg-gray-50 transition-colors duration-150' : ''}
        ${className}
      `.trim()}
      {...props}
    >
      {children}
    </tr>
  );
}

// ============================================================================
// Table Head Cell
// ============================================================================

export interface TableHeadProps extends ThHTMLAttributes<HTMLTableCellElement> {
  children: React.ReactNode;
}

/**
 * Table header cell (th) with proper styling.
 * Responsive padding for mobile screens.
 */
export function TableHead({
  children,
  className = '',
  ...props
}: TableHeadProps) {
  return (
    <th
      className={`
        px-3 sm:px-4 py-2 sm:py-3
        text-left
        text-[10px] sm:text-xs font-semibold
        text-gray-600
        uppercase tracking-wider
        whitespace-nowrap
        ${className}
      `.trim()}
      {...props}
    >
      {children}
    </th>
  );
}

// ============================================================================
// Table Cell
// ============================================================================

export interface TableCellProps extends TdHTMLAttributes<HTMLTableCellElement> {
  children: React.ReactNode;
}

/**
 * Table data cell (td) with consistent padding.
 * Responsive padding for mobile screens.
 */
export function TableCell({
  children,
  className = '',
  ...props
}: TableCellProps) {
  return (
    <td
      className={`
        px-3 sm:px-4 py-2 sm:py-3
        text-gray-900
        ${className}
      `.trim()}
      {...props}
    >
      {children}
    </td>
  );
}
