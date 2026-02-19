# T03 — Transcription Processing Pipeline

| Field | Value |
|-------|-------|
| **name** | Transcription Processing Pipeline |
| **parallel-group** | A (no dependencies) |
| **depends-on** | none |

---

## Description

Build a single processing pipeline that takes raw transcription text (from voice or keyboard) and produces display-ready output. The pipeline runs two tasks in one Haiku LLM call: (1) terminology correction using domain terms extracted from the active recall set, and (2) notation detection and conversion for math, code, and formulas spoken in natural language. The frontend renders the pipeline's output using a new `FormattedText` component that handles inline/block LaTeX via KaTeX and code blocks via monospace styling.

This task does NOT add voice input (that is T10). It builds the processing layer that sits between raw input and the message flow. For typed input, the pipeline skips terminology correction but still runs notation detection. For voice input (once T10 lands), the full pipeline runs.

---

## Detailed Implementation

### 1. Pipeline Architecture (CREATE: `src/core/transcription/pipeline.ts`)

The pipeline is the single entry point for all transcription processing. It accepts raw text and returns a structured result containing both the display-ready text and the LLM-ready text (these may differ when LaTeX delimiters are present).

```typescript
import type { AnthropicClient } from '../../llm/client';

/**
 * Configuration for the transcription pipeline, initialized once per session.
 * Contains domain-specific terminology extracted from the recall set's points.
 */
interface TranscriptionPipelineConfig {
  /** Domain-specific terms extracted from the recall set's recall points (content + context fields).
   *  Used to correct common mistranscriptions of technical vocabulary. */
  recallSetTerminology: string[];

  /** Whether to detect and convert natural-language math/code into LaTeX/backtick notation.
   *  Defaults to true. Set to false for recall sets where notation is irrelevant. */
  enableNotationDetection: boolean;
}

/**
 * The result of processing a raw transcription through the pipeline.
 * Contains separate fields for display (with LaTeX/code formatting) and LLM context.
 */
interface ProcessedTranscription {
  /** The text the user sees on screen, potentially containing $...$ LaTeX and `...` code delimiters. */
  displayText: string;

  /** The text sent into the LLM conversation context.
   *  Identical to displayText in most cases, but may strip LaTeX delimiters
   *  if the tutor prompt works better with plain text. For now, same as displayText. */
  llmText: string;

  /** List of corrections applied during terminology correction.
   *  Each entry records what was changed and why. Useful for debugging and optional UI display. */
  corrections: Array<{ original: string; corrected: string }>;

  /** Whether the output contains LaTeX ($...$, $$...$$) or code (`...`, ```...```) notation. */
  hasNotation: boolean;
}

/**
 * Transcription processing pipeline.
 *
 * Takes raw transcription text (from voice or keyboard) and produces display-ready output.
 * Runs terminology correction and notation detection in a single Haiku call for efficiency.
 *
 * Usage:
 * 1. At session start: construct with extracted terminology from the recall set
 * 2. On each user message: call process() with raw text
 * 3. Use the returned displayText for UI and llmText for the LLM context
 */
class TranscriptionPipeline {
  constructor(
    private llmClient: AnthropicClient,
    private config: TranscriptionPipelineConfig
  ) {}

  /**
   * Process raw transcription text through the full pipeline.
   *
   * For voice input: runs both terminology correction and notation detection.
   * For typed input: pass skipTerminologyCorrection=true to skip step 1 (user typed it correctly).
   *
   * @param rawTranscription - The raw text from voice transcription or keyboard input
   * @param skipTerminologyCorrection - If true, skips terminology correction (for typed input)
   * @returns Processed transcription with display text, LLM text, corrections, and notation flag
   */
  async process(
    rawTranscription: string,
    skipTerminologyCorrection: boolean = false
  ): Promise<ProcessedTranscription> {
    // Short-circuit for empty input
    const trimmed = rawTranscription.trim();
    if (!trimmed) {
      return { displayText: '', llmText: '', corrections: [], hasNotation: false };
    }

    // If no terminology and notation detection is disabled, return as-is
    if (skipTerminologyCorrection && !this.config.enableNotationDetection) {
      return { displayText: trimmed, llmText: trimmed, corrections: [], hasNotation: false };
    }

    // If typed input (skip terminology) and notation detection is enabled,
    // run notation-only prompt
    if (skipTerminologyCorrection) {
      return this.processNotationOnly(trimmed);
    }

    // Full pipeline: terminology correction + notation detection in one Haiku call
    return this.processFullPipeline(trimmed);
  }

  /**
   * Runs the combined terminology + notation prompt via a single Haiku call.
   * This is the standard path for voice input.
   */
  private async processFullPipeline(rawText: string): Promise<ProcessedTranscription> {
    const terminologyList = this.config.recallSetTerminology.join(', ');

    const prompt = `You are processing a voice transcription from a recall session.

Domain terminology that may be mistranscribed: [${terminologyList}]

Tasks:
1. Fix any mistranscribed domain terms. Common voice transcription errors include phonetically similar words replacing technical terms. Only correct terms that are clearly wrong in context — do not change correct usage.
2. If the user expressed math, code, or formulas in natural language, convert them to LaTeX (wrap in $ for inline, $$ for block) or code (wrap in backticks). Examples:
   - "A squared plus B squared equals C squared" -> "$a^2 + b^2 = c^2$"
   - "the integral of X squared from 0 to 1" -> "$\\int_0^1 x^2 \\, dx$"
   - "function that takes X and returns X plus one" -> "\`(x) => x + 1\`"
3. If no corrections or conversions are needed, return the text unchanged.
4. Return ONLY a JSON object with this exact format, no other text:
{"correctedText": "the processed text here", "corrections": [{"original": "wrong term", "corrected": "right term"}]}

If no corrections were made, the corrections array should be empty.

Raw transcription: "${rawText}"`;

    // Use Haiku for speed and cost — this runs on every voice message
    const response = await this.llmClient.complete(prompt);
    return this.parseResponse(response.text, rawText);
  }

  /**
   * Runs notation-only detection via Haiku.
   * Used for typed input where terminology correction is unnecessary.
   */
  private async processNotationOnly(rawText: string): Promise<ProcessedTranscription> {
    const prompt = `If the following text contains math, code, or formulas expressed in natural language, convert them to LaTeX (wrap in $ for inline, $$ for block) or code (wrap in backticks). If no notation is present, return the text unchanged.

Return ONLY a JSON object: {"correctedText": "the text here", "corrections": []}

Text: "${rawText}"`;

    const response = await this.llmClient.complete(prompt);
    return this.parseResponse(response.text, rawText);
  }

  /**
   * Parses the Haiku JSON response into a ProcessedTranscription.
   * Falls back to raw text on parse failure — never crashes the session.
   */
  private parseResponse(responseText: string, rawText: string): ProcessedTranscription {
    try {
      // Strip markdown code fences if present (LLMs sometimes wrap JSON in ```json ... ```)
      const cleaned = responseText
        .replace(/^```(?:json)?\n?/m, '')
        .replace(/\n?```$/m, '')
        .trim();

      const parsed = JSON.parse(cleaned) as {
        correctedText: string;
        corrections: Array<{ original: string; corrected: string }>;
      };

      const displayText = parsed.correctedText || rawText;
      const hasNotation = /\$[^$]+\$|`[^`]+`/.test(displayText);

      return {
        displayText,
        llmText: displayText,
        corrections: parsed.corrections || [],
        hasNotation,
      };
    } catch (error) {
      // On parse failure, return the raw text unchanged — don't break the session
      console.error('Failed to parse transcription pipeline response:', error);
      return {
        displayText: rawText,
        llmText: rawText,
        corrections: [],
        hasNotation: false,
      };
    }
  }
}

export {
  TranscriptionPipeline,
  type TranscriptionPipelineConfig,
  type ProcessedTranscription,
};
```

### 2. Terminology Extractor (CREATE: `src/core/transcription/terminology-extractor.ts`)

Extracts domain-specific terms from a recall set's points at session start. The result is cached for the entire session duration — extract once, reuse for every message.

```typescript
import type { AnthropicClient } from '../../llm/client';
import type { RecallSet, RecallPoint } from '../session/types'; // Adjust import path to actual types location

/**
 * Extracts domain-specific terminology from a recall set's recall points.
 *
 * Given all recall points (content + context fields), sends them to Haiku
 * and asks it to identify unusual, technical, or domain-specific terms that
 * voice transcription is likely to get wrong.
 *
 * The result is a flat string array of terms. Cache this per session —
 * call once at session start and reuse for every TranscriptionPipeline.process() call.
 *
 * @param recallSet - The recall set with its populated recallPoints
 * @param llmClient - AnthropicClient instance configured for Haiku
 * @returns Array of domain-specific terms
 */
async function extractTerminology(
  recallSet: { name: string; recallPoints: Array<{ content: string; context?: string }> },
  llmClient: AnthropicClient
): Promise<string[]> {
  // Combine all recall point content and context into a single text block
  const pointTexts = recallSet.recallPoints
    .map((p, i) => {
      const parts = [`${i + 1}. ${p.content}`];
      if (p.context) parts.push(`   Context: ${p.context}`);
      return parts.join('\n');
    })
    .join('\n');

  // If no points, return empty terminology list
  if (!pointTexts.trim()) {
    return [];
  }

  const prompt = `Extract all domain-specific, technical, or unusual terms from the following recall set material. Include:
- Technical vocabulary (e.g., "phosphoanhydride", "mycelium", "eigenvalue")
- Proper nouns specific to the domain (e.g., "Krebs cycle", "Euler's formula")
- Abbreviations and acronyms (e.g., "ATP", "FSRS", "DNS")
- Any word or phrase that a voice transcription system is likely to misrecognize

Return ONLY a JSON array of strings, no other text. Example: ["ATP", "phosphoanhydride", "Krebs cycle"]

Recall set: "${recallSet.name}"

Material:
${pointTexts}`;

  try {
    const response = await llmClient.complete(prompt);

    // Strip markdown code fences if present
    const cleaned = response.text
      .replace(/^```(?:json)?\n?/m, '')
      .replace(/\n?```$/m, '')
      .trim();

    const terms: string[] = JSON.parse(cleaned);

    // Validate: must be an array of strings
    if (!Array.isArray(terms) || !terms.every(t => typeof t === 'string')) {
      console.error('Terminology extractor returned non-string-array:', terms);
      return [];
    }

    return terms;
  } catch (error) {
    // On failure, return empty list — pipeline still works, just without terminology correction
    console.error('Failed to extract terminology:', error);
    return [];
  }
}

export { extractTerminology };
```

### 3. Terminology Corrector (CREATE: `src/core/transcription/terminology-corrector.ts`)

A focused module for the terminology correction step. In the combined pipeline, this logic is inlined into the single Haiku prompt. This module exists as a standalone utility for cases where terminology correction needs to run independently (e.g., testing, or if the combined call is ever split).

```typescript
import type { AnthropicClient } from '../../llm/client';

/**
 * Corrects mistranscribed domain terminology in a raw transcription.
 *
 * Sends the raw text along with a list of known domain terms to Haiku,
 * which identifies and corrects phonetically similar mistranscriptions.
 *
 * Examples of corrections:
 * - "My selenium networks" -> "mycelium networks" (mycology domain)
 * - "phosphor and hydride bonds" -> "phosphoanhydride bonds" (biochemistry)
 * - "Oiler's formula" -> "Euler's formula" (mathematics)
 *
 * @param rawText - The raw transcription text
 * @param domainTerms - Array of domain-specific terms the transcription should contain
 * @param llmClient - AnthropicClient instance
 * @returns Object with corrected text and list of corrections made
 */
async function correctTerminology(
  rawText: string,
  domainTerms: string[],
  llmClient: AnthropicClient
): Promise<{ correctedText: string; corrections: Array<{ original: string; corrected: string }> }> {
  // If no domain terms, return unchanged
  if (domainTerms.length === 0) {
    return { correctedText: rawText, corrections: [] };
  }

  const prompt = `Given these domain-specific terms: [${domainTerms.join(', ')}]

Correct any mistranscriptions in the following text. Only fix terms that are clearly phonetically similar to a domain term and wrong in context. Do not change anything else.

Return ONLY a JSON object: {"correctedText": "...", "corrections": [{"original": "wrong", "corrected": "right"}]}

Text: "${rawText}"`;

  try {
    const response = await llmClient.complete(prompt);
    const cleaned = response.text
      .replace(/^```(?:json)?\n?/m, '')
      .replace(/\n?```$/m, '')
      .trim();

    const parsed = JSON.parse(cleaned);
    return {
      correctedText: parsed.correctedText || rawText,
      corrections: parsed.corrections || [],
    };
  } catch (error) {
    console.error('Terminology correction failed:', error);
    return { correctedText: rawText, corrections: [] };
  }
}

export { correctTerminology };
```

### 4. Notation Converter (CREATE: `src/core/transcription/notation-converter.ts`)

A focused module for the notation detection and conversion step. Like the terminology corrector, this exists standalone for independent use and testing, though the combined pipeline inlines both tasks into one call.

```typescript
import type { AnthropicClient } from '../../llm/client';

/**
 * Detects and converts natural-language math, code, and formulas into proper notation.
 *
 * Conversions:
 * - Math expressions -> LaTeX wrapped in $ (inline) or $$ (block) delimiters
 *   "A squared plus B squared equals C squared" -> "$a^2 + b^2 = c^2$"
 *   "the integral of X squared from 0 to 1" -> "$\int_0^1 x^2 \, dx$"
 *
 * - Code expressions -> backtick-wrapped code
 *   "function that takes X and returns X plus one" -> "`(x) => x + 1`"
 *   "for loop from 1 to N" -> "`for (let i = 1; i <= n; i++)`"
 *
 * If no notation is detected in the input, returns the text unchanged.
 *
 * @param text - The text to check for natural-language notation
 * @param llmClient - AnthropicClient instance
 * @returns Object with converted text and whether any notation was found
 */
async function convertNotation(
  text: string,
  llmClient: AnthropicClient
): Promise<{ convertedText: string; hasNotation: boolean }> {
  const prompt = `If the following text contains math, code, or formulas expressed in natural language, convert them to:
- LaTeX notation wrapped in $ for inline or $$ for block display
- Code wrapped in backticks (\`) for inline or triple backticks for blocks

If no notation is present, return the text unchanged.

Return ONLY a JSON object: {"convertedText": "...", "hasNotation": true/false}

Text: "${text}"`;

  try {
    const response = await llmClient.complete(prompt);
    const cleaned = response.text
      .replace(/^```(?:json)?\n?/m, '')
      .replace(/\n?```$/m, '')
      .trim();

    const parsed = JSON.parse(cleaned);
    return {
      convertedText: parsed.convertedText || text,
      hasNotation: parsed.hasNotation ?? false,
    };
  } catch (error) {
    console.error('Notation conversion failed:', error);
    return { convertedText: text, hasNotation: false };
  }
}

export { convertNotation };
```

### 5. Barrel Export (CREATE: `src/core/transcription/index.ts`)

```typescript
export { TranscriptionPipeline, type TranscriptionPipelineConfig, type ProcessedTranscription } from './pipeline';
export { extractTerminology } from './terminology-extractor';
export { correctTerminology } from './terminology-corrector';
export { convertNotation } from './notation-converter';
```

### 6. Frontend: FormattedText Component (CREATE: `web/src/components/shared/FormattedText.tsx`)

A React component that renders text containing mixed content: plain text, inline LaTeX ($...$), block LaTeX ($$...$$), inline code (`...`), and code blocks (```...```). Uses the `katex` package for LaTeX rendering.

```tsx
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

    const matched = match[1];

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
 * Usage:
 * ```tsx
 * <FormattedText content="The formula is $a^2 + b^2 = c^2$ and the code is `x + 1`" />
 * ```
 */
export function FormattedText({ content, className = '' }: FormattedTextProps) {
  // Parse content into segments, memoized to avoid re-parsing on every render
  const segments = useMemo(() => parseSegments(content), [content]);

  return (
    <span className={`leading-relaxed ${className}`}>
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
    </span>
  );
}

export default FormattedText;
```

### 7. Frontend Integration: MessageList.tsx (MODIFY)

Replace the raw `<p>` text rendering in `MessageBubble` with `FormattedText`:

**Current code in `MessageBubble` (line 77):**
```tsx
<p className="leading-relaxed whitespace-pre-wrap">{message.content}</p>
```

**Change to:**
```tsx
<FormattedText content={message.content} />
```

Add import at the top of the file:
```tsx
import { FormattedText } from '../shared/FormattedText';
```

### 8. Frontend Integration: StreamingMessage.tsx (MODIFY)

Replace the raw `<p>` text rendering with `FormattedText`:

**Current code (line 50-54):**
```tsx
<p className="leading-relaxed whitespace-pre-wrap">
  {content}
  <span className="inline-block w-2 h-4 ml-0.5 bg-clarity-300 animate-pulse" />
</p>
```

**Change to:**
```tsx
<div className="leading-relaxed whitespace-pre-wrap">
  <FormattedText content={content} />
  <span className="inline-block w-2 h-4 ml-0.5 bg-clarity-300 animate-pulse" />
</div>
```

Add import at the top of the file:
```tsx
import { FormattedText } from '../shared/FormattedText';
```

### 9. Install KaTeX Dependency

Run: `bun add katex`
Run: `bun add -d @types/katex` (if types are separate; check if katex ships its own types)

### 10. Pipeline Initialization at Session Start

When a session starts (in `SessionEngine.startSession()` or wherever the session is initialized), the transcription pipeline should be constructed:

1. Call `extractTerminology(recallSet, haiku LLM client)` to get the term list
2. Construct `new TranscriptionPipeline(llmClient, { recallSetTerminology: terms, enableNotationDetection: true })`
3. Store the pipeline instance for the session's lifetime

This initialization step is the integration point for T10 (voice input) — when voice input lands, it will call `pipeline.process(rawVoiceText)` before sending the message. For now, the pipeline is constructed but not yet wired into the message flow. The integration point is documented so T10 knows exactly where to call it.

### 11. Integration Point Documentation

The pipeline sits between input and the WebSocket send. The flow once T10 is integrated:

```
raw input (voice or typed)
  -> TranscriptionPipeline.process(rawText, skipTerminology)
  -> displayText shown to user in the input field for review
  -> llmText sent to server via sendUserMessage(llmText)
```

For typed input before T10 exists: the pipeline can optionally run on typed text (for notation detection), but this is not required for T03. The pipeline just needs to exist and be tested independently.

---

## Relevant Files

| Action | File | What Changes |
|--------|------|-------------|
| CREATE | `src/core/transcription/pipeline.ts` | Main pipeline class: `TranscriptionPipeline` with `process()` method, combined Haiku call for terminology + notation |
| CREATE | `src/core/transcription/terminology-extractor.ts` | `extractTerminology()` function: sends recall point content to Haiku, returns domain term list |
| CREATE | `src/core/transcription/terminology-corrector.ts` | `correctTerminology()` standalone function for terminology correction |
| CREATE | `src/core/transcription/notation-converter.ts` | `convertNotation()` standalone function for notation detection and conversion |
| CREATE | `src/core/transcription/index.ts` | Barrel export for all transcription module exports |
| CREATE | `web/src/components/shared/FormattedText.tsx` | React component rendering mixed text/LaTeX/code content via KaTeX |
| MODIFY | `web/src/components/live-session/MessageList.tsx` | Replace raw `<p>` in `MessageBubble` with `FormattedText` component; add import |
| MODIFY | `web/src/components/live-session/StreamingMessage.tsx` | Replace raw `<p>` with `FormattedText` component; add import |
| MODIFY | `package.json` (via `bun add katex`) | Add `katex` as a runtime dependency |

---

## Success Criteria

1. **Pipeline processes voice transcription**: `TranscriptionPipeline.process("My selenium networks use phosphor and hydride bonds")` with mycology/biochemistry terminology returns `displayText` containing "mycelium networks" and "phosphoanhydride bonds". The `corrections` array lists both corrections with original and corrected values.

2. **Pipeline processes notation**: `TranscriptionPipeline.process("A squared plus B squared equals C squared")` returns `displayText` containing `$a^2 + b^2 = c^2$` (LaTeX notation). `hasNotation` is `true`.

3. **Pipeline processes code expressions**: `TranscriptionPipeline.process("function that takes X and returns X plus one")` returns `displayText` containing backtick-wrapped code like `` `(x) => x + 1` ``. `hasNotation` is `true`.

4. **Combined call efficiency**: The full pipeline (terminology + notation) makes exactly ONE Haiku LLM call, not two. The prompt combines both tasks.

5. **Typed input skips terminology**: `TranscriptionPipeline.process("A squared plus B squared", true)` (with `skipTerminologyCorrection=true`) skips terminology correction but still detects and converts notation.

6. **Terminology extraction**: `extractTerminology(recallSet, llmClient)` given a recall set with biochemistry recall points returns an array containing terms like "ATP", "phosphoanhydride", "adenosine". The function handles empty recall sets by returning `[]`.

7. **Terminology extraction caching**: The extractor is called once at session start. The pipeline reuses the same terminology list for every `process()` call during the session. No re-extraction per message.

8. **Parse failure resilience**: If Haiku returns malformed JSON, the pipeline returns the raw input text unchanged. No crash, no exception propagated to caller. Error is logged to console.

9. **Empty input handled**: `TranscriptionPipeline.process("")` returns `{ displayText: '', llmText: '', corrections: [], hasNotation: false }` without making any LLM call.

10. **KaTeX renders inline math**: The `FormattedText` component renders `"The formula is $a^2 + b^2 = c^2$ here"` with the LaTeX portion rendered as formatted math (not raw text) and the surrounding text as plain text.

11. **KaTeX renders block math**: The `FormattedText` component renders `"Consider: $$\\int_0^1 x^2 \\, dx = \\frac{1}{3}$$"` with the LaTeX rendered as centered display math on its own line.

12. **Inline code renders correctly**: The `FormattedText` component renders `` "Use the `map` function" `` with "map" in a monospace code span with distinct background.

13. **Code blocks render correctly**: The `FormattedText` component renders triple-backtick code blocks as `<pre><code>` with monospace styling and dark background.

14. **Mixed content renders correctly**: A single string containing plain text, inline LaTeX, block LaTeX, inline code, and a code block renders all segments with their correct styling. No segment bleeds into another.

15. **FormattedText used in MessageBubble**: The `MessageBubble` component in `MessageList.tsx` uses `<FormattedText content={message.content} />` instead of raw `<p>` text. Both user and assistant messages render formatted content.

16. **FormattedText used in StreamingMessage**: The `StreamingMessage` component uses `<FormattedText content={content} />`. The blinking cursor still appears after the formatted content.

17. **KaTeX failure graceful**: If KaTeX fails to render a LaTeX expression (e.g., malformed LaTeX), the component shows the raw LaTeX string in a styled error span rather than crashing the component tree.

18. **Pipeline uses Haiku model**: All LLM calls in the pipeline (terminology extraction, combined processing, notation-only processing) explicitly use the Haiku model for speed and cost. Not Sonnet.

19. **Corrections tracked**: Every correction made by the pipeline is recorded in the `corrections` array with `{original, corrected}`. This allows optional display of "Did you mean X? Changed from Y." in the UI (not required for this task, but the data must be available).

20. **No regression in text-only messages**: Messages that contain no LaTeX or code render identically to the current behavior — plain text with preserved whitespace. The `FormattedText` component does not alter the appearance of plain text messages.
