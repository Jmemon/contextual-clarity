import type { AnthropicClient } from '../../llm/client';
import { HAIKU_MODEL } from './pipeline';

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
 * @param llmClient - A DEDICATED AnthropicClient instance (NOT the session's client)
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
    // Use Haiku for speed and cost
    const response = await llmClient.complete(prompt, { model: HAIKU_MODEL });
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
