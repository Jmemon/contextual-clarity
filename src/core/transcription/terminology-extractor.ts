import { AnthropicClient } from '../../llm/client';
// RecallSet lives at src/core/models/recall-set.ts — only name is used here.
// RecallPoint lives at src/core/models/recall-point.ts — only content + context are used here.
// Points must be fetched separately via RecallPointRepository.findByRecallSetId().

import { HAIKU_MODEL } from './pipeline';

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
 * NOTE: RecallSet does NOT have an embedded `recallPoints` array. Points are stored
 * in a separate table with a `recallSetId` FK. The caller must fetch points separately
 * and pass them as the second argument via RecallPointRepository.findByRecallSetId().
 *
 * NOTE: RecallPoint.context is a required field (type: string, NOT optional).
 *
 * @param recallSet - The recall set (only name is used)
 * @param recallPoints - Array of recall points fetched separately from the recall point table
 * @param llmClient - A DEDICATED AnthropicClient instance (NOT the session's client)
 * @returns Array of domain-specific terms
 */
async function extractTerminology(
  recallSet: { name: string },
  recallPoints: Array<{ content: string; context: string }>,
  llmClient: AnthropicClient
): Promise<string[]> {
  // Combine all recall point content and context into a single text block.
  // RecallPoint.context is required (not optional), so it is always present.
  const pointTexts = recallPoints
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
    // Use Haiku for speed and cost
    const response = await llmClient.complete(prompt, { model: HAIKU_MODEL });

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
