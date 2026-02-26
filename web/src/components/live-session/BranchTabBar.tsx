/**
 * BranchTabBar Component
 *
 * Vertical tab bar rendered on the right edge of the session container. Shows
 * a "Session" (trunk) tab plus one tab per detected/active branch. Branches
 * appear with a slide-in animation when first detected, and support unread
 * indicators for branches the user isn't currently viewing.
 *
 * Always rendered — shows the "Session" trunk tab even when no branches exist,
 * providing a consistent layout anchor for when branches appear.
 *
 * @example
 * ```tsx
 * <BranchTabBar
 *   branches={branchInfoList}
 *   activeBranchId={activeBranchId}
 *   onActivateBranch={activateBranch}
 *   onCloseBranch={closeBranch}
 *   onSwitchToTrunk={switchToTrunk}
 * />
 * ```
 */

import { useEffect, useRef, type HTMLAttributes } from 'react';
import { BranchTab } from './BranchTab';

// ============================================================================
// Types
// ============================================================================

/** Lightweight branch info projected from the hook's BranchState for the tab bar. */
export interface BranchInfo {
  branchId: string;
  topic: string;
  parentBranchId: string | null;
  depth: number;
  status: 'detected' | 'active' | 'closed';
  hasUnread: boolean;
}

export interface BranchTabBarProps extends HTMLAttributes<HTMLDivElement> {
  /** List of branches to display as tabs */
  branches: BranchInfo[];
  /** ID of the currently viewed branch, or null for trunk */
  activeBranchId: string | null;
  /** Called when a branch tab is clicked */
  onActivateBranch: (branchId: string) => void;
  /** Called when a branch tab's close button is clicked */
  onCloseBranch: (branchId: string) => void;
  /** Called when the "Session" (trunk) tab is clicked */
  onSwitchToTrunk: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function BranchTabBar({
  branches,
  activeBranchId,
  onActivateBranch,
  onCloseBranch,
  onSwitchToTrunk,
  className = '',
  ...props
}: BranchTabBarProps) {
  // Track the newest branch so we can apply the slide-in animation only once.
  const newTabRef = useRef<string | null>(null);

  useEffect(() => {
    if (branches.length > 0) {
      const newest = branches[branches.length - 1]!;
      if (newest.status === 'detected' && newest.branchId !== newTabRef.current) {
        newTabRef.current = newest.branchId;
      }
    }
  }, [branches]);

  return (
    <div
      className={`flex flex-col w-24 border-l border-slate-700 bg-slate-950/50 py-2 gap-1 overflow-y-auto ${className}`}
      role="tablist"
      aria-label="Session branches"
      {...props}
    >
      {/* Trunk tab — always present when the tab bar is visible */}
      <button
        onClick={onSwitchToTrunk}
        className={`
          px-3 py-2 text-xs rounded-l-lg transition-all duration-200 border-r-2 text-left
          ${activeBranchId === null
            ? 'bg-slate-800 border-clarity-400 text-white font-medium'
            : 'bg-transparent border-transparent text-slate-400 hover:bg-slate-800/50'
          }
        `}
        role="tab"
        aria-selected={activeBranchId === null}
      >
        Session
      </button>

      {/* Branch tabs — one per detected or active branch */}
      {branches.map((branch) => (
        <BranchTab
          key={branch.branchId}
          branchId={branch.branchId}
          topic={branch.topic}
          isActive={activeBranchId === branch.branchId}
          hasUnread={branch.hasUnread}
          depth={branch.depth}
          onActivate={onActivateBranch}
          onClose={onCloseBranch}
          role="tab"
          aria-selected={activeBranchId === branch.branchId}
          className={branch.branchId === newTabRef.current ? 'animate-slide-in-right' : ''}
        />
      ))}
    </div>
  );
}
