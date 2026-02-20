/**
 * Deepgram Client Configuration
 *
 * Server-side configuration for Deepgram speech-to-text integration.
 * Provides the Deepgram SDK client factory and shared transcription config
 * constants used by both the token endpoint and any future server-side
 * transcription needs.
 *
 * The frontend does NOT use this module — it connects to Deepgram via
 * native WebSocket using a short-lived token from the /api/voice/token endpoint.
 */

import { createClient, type DeepgramClient } from '@deepgram/sdk';

// =============================================================================
// Deepgram Transcription Configuration
// =============================================================================

/**
 * Shared transcription parameters for Deepgram's streaming API.
 * These are used both server-side (if needed) and communicated to the
 * frontend to construct the WebSocket URL query string.
 */
export const DEEPGRAM_CONFIG = {
  /** Nova-2 is Deepgram's latest and most accurate model */
  model: 'nova-2',

  /** Language code for transcription */
  language: 'en',

  /** Enable smart formatting (capitalization, punctuation, numerals) */
  smart_format: true,

  /** Enable punctuation in transcription output */
  punctuate: true,

  /** Enable utterance detection for natural speech boundaries */
  utterances: true,

  /** Enable interim (partial) results for real-time display */
  interim_results: true,
} as const;

// =============================================================================
// Client Factory
// =============================================================================

/**
 * Creates a configured Deepgram SDK client instance.
 * Used server-side for project key management (token endpoint).
 *
 * @param apiKey - The Deepgram API key from server config
 * @returns Configured DeepgramClient instance
 */
export function createDeepgramClient(apiKey: string): DeepgramClient {
  return createClient(apiKey);
}
