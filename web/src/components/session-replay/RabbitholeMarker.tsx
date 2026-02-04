/**
 * RabbitholeMarker Component
 *
 * Displays a visual indicator when the conversation went on a tangent
 * (a "rabbithole"). These markers help users understand when they or
 * the AI diverged from the main study topic.
 *
 * Visual design:
 * - Uses a distinct style to stand out from regular messages
 * - Shows the topic of the tangent
 * - Indicates depth level for nested tangents
 * - Different styling for entering vs returning from tangent
 *
 * @example
 * ```tsx
 * <RabbitholeMarker
 *   topic="History of the French Revolution"
 *   depth={1}
 *   isReturn={false}
 * />
 * ```
 */

// ============================================================================
// Types
// ============================================================================

export interface RabbitholeMarkerProps {
  /** The topic or subject of the tangent */
  topic: string;
  /** How deep the tangent is (1 = first level, 2 = tangent within tangent, etc.) */
  depth: number;
  /** Whether this marker indicates returning FROM a tangent (vs entering one) */
  isReturn?: boolean;
}

// ============================================================================
// RabbitholeMarker Component
// ============================================================================

/**
 * Renders a visual marker indicating a conversational tangent (rabbithole).
 *
 * The marker appears centered in the transcript to distinguish it from
 * regular messages. It shows:
 * - A rabbit emoji icon (for visual recognition)
 * - The direction (entering or returning from tangent)
 * - The topic of the tangent
 * - The depth level if nested
 */
export function RabbitholeMarker({
  topic,
  depth,
  isReturn = false,
}: RabbitholeMarkerProps) {
  return (
    <div
      className={`
        inline-flex items-center gap-2
        px-4 py-2
        rounded-full
        text-sm
        border
        ${
          isReturn
            ? 'bg-purple-50 border-purple-200 text-purple-700'
            : 'bg-orange-50 border-orange-200 text-orange-700'
        }
      `}
    >
      {/* Rabbithole icon - using a down/up arrow to indicate direction */}
      <span className="flex-shrink-0" aria-hidden="true">
        {isReturn ? '\u2191' : '\u2193'} {/* Up or Down arrow */}
      </span>

      {/* Direction indicator */}
      <span className="font-medium">
        {isReturn ? 'Returned from' : 'Tangent:'}
      </span>

      {/* Topic of the tangent */}
      <span className="truncate max-w-[200px]" title={topic}>
        {topic}
      </span>

      {/* Depth indicator for nested tangents */}
      {depth > 1 && (
        <span
          className={`
            px-1.5 py-0.5
            text-xs
            rounded
            ${isReturn ? 'bg-purple-200 text-purple-800' : 'bg-orange-200 text-orange-800'}
          `}
          title={`Depth level ${depth}`}
        >
          L{depth}
        </span>
      )}
    </div>
  );
}

export default RabbitholeMarker;
