import { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface FormattedTextProps {
  /** The text content, potentially containing LaTeX ($...$, $$...$$) and code (`...`, ```...```) */
  content: string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Segment types produced by parsing the content string.
 * Each segment is rendered differently based on its type.
 */
type Segment =
  | { type: 'text'; value: string }
  | { type: 'inlineLatex'; value: string }    // $...$
  | { type: 'blockLatex'; value: string }      // $$...$$
  | { type: 'inlineCode'; value: string }      // `...`
  | { type: 'codeBlock'; value: string };       // ```...```

/**
 * Parses a content string into segments of text, LaTeX, and code.
 *
 * Order of matching matters: block-level patterns ($$, ```) are matched first
 * to prevent inline patterns ($, `) from incorrectly splitting them.
 */
function parseSegments(content: string): Segment[] {
  // Regex matches (in priority order): $$...$$, ```...```, $...$, `...`
  // Uses a single regex with alternation groups to split correctly
  const pattern = /(\$\$[\s\S]+?\$\$|```[\s\S]+?```|\$[^$\n]+?\$|`[^`\n]+?`)/g;

  const segments: Segment[] = [];
  let lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    // Add preceding plain text if any
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: content.slice(lastIndex, match.index) });
    }

    const matched = match[1]!;

    if (matched.startsWith('$$') && matched.endsWith('$$')) {
      // Block LaTeX: strip $$ delimiters
      segments.push({ type: 'blockLatex', value: matched.slice(2, -2).trim() });
    } else if (matched.startsWith('```') && matched.endsWith('```')) {
      // Code block: strip ``` delimiters
      segments.push({ type: 'codeBlock', value: matched.slice(3, -3).trim() });
    } else if (matched.startsWith('$') && matched.endsWith('$')) {
      // Inline LaTeX: strip $ delimiters
      segments.push({ type: 'inlineLatex', value: matched.slice(1, -1).trim() });
    } else if (matched.startsWith('`') && matched.endsWith('`')) {
      // Inline code: strip ` delimiters
      segments.push({ type: 'inlineCode', value: matched.slice(1, -1) });
    }

    lastIndex = match.index + matched.length;
  }

  // Add trailing plain text if any
  if (lastIndex < content.length) {
    segments.push({ type: 'text', value: content.slice(lastIndex) });
  }

  return segments;
}

/**
 * Renders a LaTeX string to HTML using KaTeX.
 * Returns the raw HTML string for dangerouslySetInnerHTML.
 * Falls back to the raw LaTeX string on render failure.
 */
function renderLatex(latex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(latex, {
      displayMode,
      throwOnError: false,  // Render error message in red instead of throwing
      strict: false,        // Allow non-strict LaTeX input
    });
  } catch {
    // If KaTeX completely fails, show the raw LaTeX as fallback
    return `<span class="text-red-400">${latex}</span>`;
  }
}

/**
 * FormattedText component.
 *
 * Renders mixed content containing plain text, LaTeX, and code.
 * - $...$ renders as inline LaTeX via KaTeX
 * - $$...$$ renders as block (display) LaTeX via KaTeX
 * - `...` renders as inline code with monospace styling
 * - ```...``` renders as a code block with monospace styling and background
 * - Everything else renders as plain text with preserved whitespace
 *
 * NOTE: The root element is a <div> (not a <span>) because block LaTeX ($$...$$)
 * renders as a <div>, and nesting <div> inside <span> is invalid HTML.
 *
 * Usage:
 * ```tsx
 * <FormattedText content="The formula is $a^2 + b^2 = c^2$ and the code is `x + 1`" />
 * ```
 */
export function FormattedText({ content, className = '' }: FormattedTextProps) {
  // Parse content into segments, memoized to avoid re-parsing on every render
  const segments = useMemo(() => parseSegments(content), [content]);

  return (
    <div className={`leading-relaxed ${className}`}>
      {segments.map((segment, index) => {
        switch (segment.type) {
          case 'text':
            // Plain text with preserved whitespace
            return <span key={index} className="whitespace-pre-wrap">{segment.value}</span>;

          case 'inlineLatex':
            // Inline LaTeX rendered by KaTeX
            return (
              <span
                key={index}
                dangerouslySetInnerHTML={{ __html: renderLatex(segment.value, false) }}
              />
            );

          case 'blockLatex':
            // Block/display LaTeX rendered by KaTeX, shown on its own line
            return (
              <div
                key={index}
                className="my-2 text-center overflow-x-auto"
                dangerouslySetInnerHTML={{ __html: renderLatex(segment.value, true) }}
              />
            );

          case 'inlineCode':
            // Inline code with monospace styling
            return (
              <code
                key={index}
                className="px-1.5 py-0.5 bg-clarity-600/50 text-clarity-200 rounded text-sm font-mono"
              >
                {segment.value}
              </code>
            );

          case 'codeBlock':
            // Code block with background and monospace styling
            return (
              <pre
                key={index}
                className="my-2 p-3 bg-clarity-800/70 text-clarity-200 rounded-lg overflow-x-auto text-sm font-mono"
              >
                <code>{segment.value}</code>
              </pre>
            );

          default:
            return null;
        }
      })}
    </div>
  );
}

export default FormattedText;
