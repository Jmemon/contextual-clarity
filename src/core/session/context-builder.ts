/**
 * Context Builder — Constructs LLM context for tree-structured sessions
 *
 * Two functions build the message arrays that get sent to the LLM:
 *
 * 1. **buildTrunkContext()** — For the main Socratic tutor. Takes the trunk's
 *    message history and injects closed-branch summaries as system messages at
 *    the exact point where each branch forked. Open/detected branches contribute
 *    nothing to the trunk context.
 *
 * 2. **buildBranchContext()** — For a branch agent. Walks up the parent chain
 *    from the target branch to the trunk, collecting ancestor messages up to
 *    each fork point. Returns a frozen context snapshot the branch agent can
 *    prepend to its own conversation.
 *
 * Key design decisions:
 * - Summaries are synthesized at context-build time, NOT stored as real messages.
 *   This keeps the message table clean and avoids phantom system messages.
 * - buildTrunkContext only injects summaries for direct trunk forks (parentBranchId
 *   is null). Nested branch summaries belong in their parent branch's context.
 * - buildBranchContext strips message IDs from the result — the branch agent only
 *   needs role+content for the LLM, not database identifiers.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * A single message in the context array.
 * `id` is optional and only present on trunk/persisted messages.
 */
export interface ContextMessage {
  id?: string;
  role: string;
  content: string;
}

/**
 * Minimal branch info needed by the context builder.
 * This is a projection of the full Branch model — callers should map
 * their domain objects to this shape before calling the builder.
 */
export interface BranchInfo {
  id: string;
  parentBranchId: string | null;
  branchPointMessageId: string;
  status?: string;
  summary?: string | null;
  topic?: string;
  conversation?: Array<{ id?: string; role: string; content: string }> | null;
}

// ============================================================================
// buildTrunkContext
// ============================================================================

/**
 * Builds LLM context for the trunk (main session).
 *
 * Copies all trunk messages into a new array. After each message that is a
 * branch point for a closed branch, a synthetic system message is injected
 * containing the branch's summary. This gives the tutor awareness of what
 * was explored in the branch without polluting the persisted message history.
 *
 * Only branches that fork directly from the trunk (parentBranchId is null)
 * are considered. Nested branch summaries are injected into their parent
 * branch's context by the branch agent, not the trunk tutor.
 *
 * Branches that are open, detected, or missing a summary are silently skipped.
 *
 * @param trunkMessages - The ordered trunk conversation messages
 * @param branches - All branches in this session (any status)
 * @returns A new message array with branch summaries injected
 */
export function buildTrunkContext(
  trunkMessages: ContextMessage[],
  branches: BranchInfo[]
): ContextMessage[] {
  // Only closed trunk-level branches with summaries contribute to context
  const closedTrunkBranches = branches.filter(
    (b) => b.status === 'closed' && b.summary && !b.parentBranchId
  );

  // Fast path: nothing to inject
  if (closedTrunkBranches.length === 0) return [...trunkMessages];

  const result: ContextMessage[] = [];

  for (const msg of trunkMessages) {
    result.push(msg);

    // After the branch point message, inject summaries of all closed branches
    // that forked at this exact message
    for (const branch of closedTrunkBranches) {
      if (branch.branchPointMessageId === msg.id) {
        result.push({
          role: 'system',
          content: `[Branch: ${branch.topic}] ${branch.summary}`,
        });
      }
    }
  }

  return result;
}

// ============================================================================
// buildBranchContext
// ============================================================================

/**
 * Builds frozen parent context for a branch agent.
 *
 * Walks up the ancestry chain from the target branch to the trunk, collecting
 * messages at each level up to (and including) the fork point. The result is
 * a chronologically ordered array of {role, content} messages that the branch
 * agent prepends to its own conversation when calling the LLM.
 *
 * For a direct trunk branch:
 *   Returns trunk messages from the start up to and including the branch point.
 *
 * For a nested branch (branch off a branch):
 *   Returns trunk messages up to the root ancestor's fork point, THEN each
 *   intermediate ancestor's conversation messages up to the next child's fork
 *   point, forming a continuous conversational thread from trunk to parent.
 *
 * Message IDs are intentionally stripped from the result — the branch agent
 * only needs role+content for the LLM prompt.
 *
 * @param branch - The branch to build context for
 * @param allBranches - All branches in this session (needed to resolve ancestry)
 * @param trunkMessages - The ordered trunk conversation messages
 * @returns Frozen context snapshot as role+content message pairs
 */
export function buildBranchContext(
  branch: BranchInfo,
  allBranches: BranchInfo[],
  trunkMessages: ContextMessage[]
): ContextMessage[] {
  // Build ancestry chain from root (closest to trunk) to the target branch.
  // ancestry[0] is the branch that forks directly from the trunk.
  // ancestry[ancestry.length - 1] is the target branch itself.
  const ancestry: BranchInfo[] = [];
  let current: BranchInfo | undefined = branch;
  while (current) {
    ancestry.unshift(current);
    current = current.parentBranchId
      ? allBranches.find((b) => b.id === current!.parentBranchId)
      : undefined;
  }

  const result: ContextMessage[] = [];

  // Step 1: Trunk messages up to the root ancestor's fork point.
  // The root ancestor is the first branch in the chain that forks from the trunk.
  const rootBranch = ancestry[0];
  for (const msg of trunkMessages) {
    result.push({ role: msg.role, content: msg.content });
    if (msg.id === rootBranch.branchPointMessageId) break;
  }

  // Step 2: For each intermediate ancestor, append its conversation messages
  // up to the next child's fork point. This threads through nested branches.
  for (let i = 0; i < ancestry.length - 1; i++) {
    const parentBranch = ancestry[i];
    const childBranch = ancestry[i + 1];
    const parentConversation = parentBranch.conversation ?? [];
    for (const msg of parentConversation) {
      result.push({ role: msg.role, content: msg.content });
      if (msg.id === childBranch.branchPointMessageId) break;
    }
  }

  return result;
}
