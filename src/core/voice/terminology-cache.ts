/**
 * Terminology Cache
 *
 * In-memory cache for domain-specific terminology extracted per recall set.
 * Avoids re-running the Haiku LLM call on every transcription request.
 *
 * Cache is keyed by recallSetId. Entries persist for the lifetime of the
 * server process — this is fine because terminology doesn't change for a
 * given recall set, and server restarts are infrequent.
 */

import { AnthropicClient } from '../../llm/client';
import { extractTerminology } from '../transcription/terminology-extractor';

const cache = new Map<string, string[]>();

/**
 * Get terminology for a recall set, extracting and caching on first access.
 *
 * @param recallSetId - The recall set ID to use as cache key
 * @param recallSetName - The recall set name (passed to extractor)
 * @param recallPoints - The recall points array (content + context fields)
 * @returns Array of domain-specific terms
 */
export async function getTerminology(
  recallSetId: string,
  recallSetName: string,
  recallPoints: Array<{ content: string; context: string }>
): Promise<string[]> {
  const cached = cache.get(recallSetId);
  if (cached) return cached;

  // Dedicated LLM client for terminology extraction — not shared with session
  const llmClient = new AnthropicClient({ maxTokens: 1024, temperature: 0 });
  const terms = await extractTerminology(
    { name: recallSetName },
    recallPoints,
    llmClient
  );

  cache.set(recallSetId, terms);
  return terms;
}

/**
 * Clear the terminology cache. Useful for testing.
 */
export function clearTerminologyCache(): void {
  cache.clear();
}
