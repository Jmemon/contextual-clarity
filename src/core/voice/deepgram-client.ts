/**
 * Deepgram Client — Server-side batch transcription
 *
 * Provides a single function to transcribe an audio buffer via Deepgram's
 * pre-recorded (REST) API. Replaces the old streaming WebSocket approach.
 *
 * The Deepgram API key stays server-side — the frontend never talks to
 * Deepgram directly. Audio is uploaded to our server, transcribed here,
 * and the text is returned.
 */

import { createClient } from '@deepgram/sdk';

/**
 * Transcribe an audio buffer using Deepgram's pre-recorded API.
 *
 * @param apiKey - Deepgram API key (from server config, never exposed to client)
 * @param audioBuffer - Raw audio data as a Buffer (webm, mp4, wav, etc.)
 * @returns The full transcript string, or empty string if no speech detected
 * @throws Error if Deepgram API call fails
 */
export async function transcribeAudio(
  apiKey: string,
  audioBuffer: Buffer
): Promise<string> {
  const deepgram = createClient(apiKey);

  const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
    audioBuffer,
    {
      model: 'nova-2',
      language: 'en',
      smart_format: true,
      punctuate: true,
    }
  );

  if (error) {
    throw new Error(`Deepgram transcription failed: ${error.message}`);
  }

  // Extract the transcript from the first channel's first alternative.
  // Deepgram always returns at least one channel with one alternative,
  // but we guard against unexpected response shapes.
  const transcript =
    result?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';

  return transcript.trim();
}
