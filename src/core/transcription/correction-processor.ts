/**
 * Voice Correction Processor
 *
 * Processes voice correction instructions to modify existing text.
 * When a user records a correction (e.g., "change the second word to 'quantum'"),
 * this processor applies the instruction to the current transcription text.
 *
 * Uses a DEDICATED AnthropicClient instance with no system prompt.
 * This is intentional — AnthropicClient is stateful (system prompt is
 * per-instance state), so sharing the session's client would corrupt
 * the tutor's system prompt.
 */

import { AnthropicClient } from '../../llm/client';

/** The Haiku model for fast, low-cost text corrections */
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

/**
 * Process a voice correction instruction against the current transcription text.
 *
 * The user speaks a correction instruction (e.g., "replace photosynthesis with
 * chemosynthesis" or "delete the last sentence"), and this function applies
 * that instruction to produce the corrected text.
 *
 * @param currentText - The transcription text to correct
 * @param correctionInstruction - The spoken correction instruction
 * @returns The corrected text after applying the instruction
 */
export async function processCorrection(
  currentText: string,
  correctionInstruction: string
): Promise<string> {
  // Dedicated client with no system prompt — intentionally separate from session client
  const client = new AnthropicClient({ model: HAIKU_MODEL, maxTokens: 1024, temperature: 0 });

  const prompt = `You are a text editor. Apply the following correction instruction to the given text. Return ONLY the corrected text, nothing else.

Current text: "${currentText}"

Correction instruction: "${correctionInstruction}"

Corrected text:`;

  const response = await client.complete(prompt, { model: HAIKU_MODEL });
  return response.text.trim();
}
