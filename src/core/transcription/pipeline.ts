import { AnthropicClient } from '../../llm/client';

/**
 * The exact model ID for Claude Haiku 4.5, used for all pipeline LLM calls.
 * Haiku is chosen for speed and low cost — this runs on every voice message.
 */
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

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
 * 1. At session start: create a DEDICATED AnthropicClient instance for the pipeline
 *    (do NOT share the session's client — systemPrompt is private instance state)
 * 2. Construct with extracted terminology from the recall set
 * 3. On each user message: call process() with raw text
 * 4. Use the returned displayText for UI and llmText for the LLM context
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

    // Use Haiku for speed and cost — this runs on every voice message.
    // Pass the Haiku model explicitly via LLMConfig to ensure it's not overridden.
    const response = await this.llmClient.complete(prompt, { model: HAIKU_MODEL });
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

    // Use Haiku for speed and cost
    const response = await this.llmClient.complete(prompt, { model: HAIKU_MODEL });
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
  HAIKU_MODEL,
  type TranscriptionPipelineConfig,
  type ProcessedTranscription,
};
