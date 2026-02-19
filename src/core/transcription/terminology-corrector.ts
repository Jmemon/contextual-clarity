import type { AnthropicClient } from '../../llm/client';
import { HAIKU_MODEL } from './pipeline';

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
 * @param llmClient - A DEDICATED AnthropicClient instance (NOT the session's client)
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
    // Use Haiku for speed and cost
    const response = await llmClient.complete(prompt, { model: HAIKU_MODEL });
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
