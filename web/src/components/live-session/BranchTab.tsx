/**
 * BranchTab Component
 *
 * Renders a single tab in the right-edge branch tab bar. Each tab represents
 * a detected or active conversation branch (tangent). Supports:
 * - Active/inactive visual state with emerald accent border (distinct from trunk's blue)
 * - Unread indicator dot for branches with new content
 * - Depth-based indentation to show branch hierarchy
 * - Close button (visible on hover) to request branch closure
 *
 * @example
 * ```tsx
 * <BranchTab
 *   branchId="branch_abc123"
 *   topic="etymology of photosynthesis"
 *   isActive={activeBranchId === 'branch_abc123'}
 *   hasUnread={false}
 *   depth={1}
 *   onActivate={(id) => activateBranch(id)}
 *   onClose={(id) => closeBranch(id)}
 * />
 * ```
 */

import type { HTMLAttributes } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface BranchTabProps extends HTMLAttributes<HTMLButtonElement> {
  /** Unique branch identifier */
  branchId: string;
  /** Short topic label for the branch */
  topic: string;
  /** Whether this tab is the currently active (viewed) branch */
  isActive: boolean;
  /** Whether the branch has unread content the user hasn't seen */
  hasUnread: boolean;
  /** Nesting depth of the branch (1 = direct child of trunk) */
  depth: number;
  /** Called when the user clicks to view this branch */
  onActivate: (branchId: string) => void;
  /** Called when the user clicks the close button on this branch */
  onClose: (branchId: string) => void;
}

// ============================================================================
// Component
// ============================================================================

export function BranchTab({
  branchId,
  topic,
  isActive,
  hasUnread,
  depth,
  onActivate,
  onClose,
  className = '',
  ...props
}: BranchTabProps) {
  // Indent nested branches 8px per depth level (depth 1 = no indent)
  const indent = (depth - 1) * 8;

  return (
    <button
      onClick={() => onActivate(branchId)}
      className={`
        group relative w-full text-left px-3 py-2 text-xs rounded-l-lg
        transition-all duration-200 border-r-2
        ${isActive
          ? 'bg-emerald-950/40 border-emerald-400 text-emerald-50'
          : 'bg-transparent border-transparent text-slate-400 hover:bg-emerald-950/20 hover:text-emerald-200'
        }
        ${className}
      `}
      style={{ paddingLeft: `${12 + indent}px` }}
      title={topic}
      {...props}
    >
      {/* Unread indicator — small dot shown on inactive tabs with new content */}
      {hasUnread && !isActive && (
        <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-emerald-400" />
      )}
      <span className="block truncate max-w-[80px]">{topic}</span>
      {/* Close button — visible on hover, stops propagation to avoid activating the tab */}
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => { e.stopPropagation(); onClose(branchId); }}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onClose(branchId); } }}
        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-slate-500 hover:text-white transition-opacity text-xs"
        aria-label={`Close branch: ${topic}`}
      >
        &times;
      </span>
    </button>
  );
}
