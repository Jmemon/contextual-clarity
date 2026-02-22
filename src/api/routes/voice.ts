/**
 * Voice API Routes
 *
 * Endpoints for voice input: batch transcription and correction.
 *
 * - POST /voice/transcribe - Upload audio, get back transcribed text
 * - POST /voice/correct    - Apply a spoken correction instruction to text
 *
 * The Deepgram API key stays server-side. The frontend uploads audio to
 * our server, which calls Deepgram's pre-recorded API and optionally
 * runs the TranscriptionPipeline (terminology correction + notation detection).
 */

import { Hono } from 'hono';
import { success, error } from '../utils/response';
import { getDeepgramApiKey } from '../../config';
import { transcribeAudio, getTerminology } from '../../core/voice';
import { processCorrection } from '../../core/transcription/correction-processor';
import { TranscriptionPipeline } from '../../core/transcription/pipeline';
import { AnthropicClient } from '../../llm/client';
import { db } from '../../storage/db';
import { SessionRepository } from '../../storage/repositories/session.repository';
import { RecallSetRepository } from '../../storage/repositories/recall-set.repository';
import { RecallPointRepository } from '../../storage/repositories/recall-point.repository';

// =============================================================================
// Constants
// =============================================================================

/** Maximum audio upload size: 5MB (~40 minutes of webm/opus) */
const MAX_AUDIO_SIZE = 5 * 1024 * 1024;

// =============================================================================
// Route Definitions
// =============================================================================

export function voiceRoutes(): Hono {
  const router = new Hono();

  // Repositories for pipeline terminology lookup
  const sessionRepo = new SessionRepository(db);
  const recallSetRepo = new RecallSetRepository(db);
  const recallPointRepo = new RecallPointRepository(db);

  // ---------------------------------------------------------------------------
  // POST /voice/transcribe - Batch transcribe uploaded audio
  // ---------------------------------------------------------------------------

  /**
   * Accepts an audio file via multipart/form-data and returns the transcript.
   * If sessionId is provided, also runs the TranscriptionPipeline (terminology
   * correction + notation detection) using that session's recall set context.
   *
   * Form fields:
   * - audio: File (required) — the audio blob from MediaRecorder
   * - sessionId: string (optional) — if provided, runs pipeline with session context
   *
   * Returns 503 if DEEPGRAM_API_KEY is not configured.
   * Returns 400 if audio file is missing or too large.
   */
  router.post('/transcribe', async (c) => {
    const apiKey = getDeepgramApiKey();

    if (!apiKey) {
      return error(
        c,
        'SERVICE_UNAVAILABLE',
        'Voice input is not configured. Set DEEPGRAM_API_KEY to enable.',
        503
      );
    }

    // Parse multipart form data
    let formData: FormData;
    try {
      formData = await c.req.formData();
    } catch {
      return error(c, 'INVALID_REQUEST', 'Request must be multipart/form-data', 400);
    }

    const audioFile = formData.get('audio');
    const sessionId = formData.get('sessionId');

    // Validate audio file exists and is a File/Blob
    if (!audioFile || !(audioFile instanceof File)) {
      return error(c, 'INVALID_REQUEST', 'audio file is required', 400);
    }

    // Validate file size
    if (audioFile.size > MAX_AUDIO_SIZE) {
      return error(c, 'INVALID_REQUEST', `Audio file too large (max ${MAX_AUDIO_SIZE / 1024 / 1024}MB)`, 400);
    }

    // Validate file size is non-zero
    if (audioFile.size === 0) {
      return error(c, 'INVALID_REQUEST', 'Audio file is empty', 400);
    }

    try {
      // Convert File to Buffer for Deepgram SDK
      const arrayBuffer = await audioFile.arrayBuffer();
      const audioBuffer = Buffer.from(arrayBuffer);

      // Transcribe via Deepgram pre-recorded API
      const rawText = await transcribeAudio(apiKey, audioBuffer);

      // If no speech detected, return early
      if (!rawText) {
        return success(c, {
          text: '',
          rawText: '',
          corrections: [],
          hasNotation: false,
        });
      }

      // If no sessionId, return raw transcription (used for voice-edit instructions)
      if (!sessionId || typeof sessionId !== 'string') {
        return success(c, {
          text: rawText,
          rawText,
          corrections: [],
          hasNotation: false,
        });
      }

      // --- Pipeline processing with session context ---

      // Look up session -> recall set -> recall points for terminology
      const session = await sessionRepo.findById(sessionId);
      if (!session) {
        // Session not found — return raw text rather than failing
        console.warn(`[voice/transcribe] Session ${sessionId} not found, skipping pipeline`);
        return success(c, {
          text: rawText,
          rawText,
          corrections: [],
          hasNotation: false,
        });
      }

      const recallSet = await recallSetRepo.findById(session.recallSetId);
      if (!recallSet) {
        console.warn(`[voice/transcribe] RecallSet ${session.recallSetId} not found, skipping pipeline`);
        return success(c, {
          text: rawText,
          rawText,
          corrections: [],
          hasNotation: false,
        });
      }

      const recallPoints = await recallPointRepo.findByRecallSetId(recallSet.id);

      // Get or extract terminology (cached per recallSetId)
      const terminology = await getTerminology(
        recallSet.id,
        recallSet.name,
        recallPoints.map((p) => ({ content: p.content, context: p.context }))
      );

      // Run pipeline: terminology correction + notation detection
      const pipelineClient = new AnthropicClient({ maxTokens: 1024, temperature: 0 });
      const pipeline = new TranscriptionPipeline(pipelineClient, {
        recallSetTerminology: terminology,
        enableNotationDetection: true,
      });

      const processed = await pipeline.process(rawText);

      return success(c, {
        text: processed.displayText,
        rawText,
        corrections: processed.corrections,
        hasNotation: processed.hasNotation,
      });
    } catch (err) {
      console.error('Error transcribing audio:', err);
      return error(c, 'INTERNAL_ERROR', 'Failed to transcribe audio', 500);
    }
  });

  // ---------------------------------------------------------------------------
  // POST /voice/correct - Apply a spoken correction instruction to text
  // ---------------------------------------------------------------------------

  /**
   * Accepts the current transcription text and a spoken correction instruction,
   * then uses the correction processor (Claude Haiku) to produce the corrected
   * text. This keeps the LLM call server-side so API keys are never exposed.
   *
   * Request body: { currentText: string, correctionInstruction: string }
   * Response:     { correctedText: string }
   */
  router.post('/correct', async (c) => {
    let body: { currentText?: unknown; correctionInstruction?: unknown };

    try {
      body = await c.req.json<{ currentText?: unknown; correctionInstruction?: unknown }>();
    } catch {
      return error(c, 'INVALID_REQUEST', 'Request body must be valid JSON', 400);
    }

    const { currentText, correctionInstruction } = body;

    if (typeof currentText !== 'string' || !currentText.trim()) {
      return error(c, 'INVALID_REQUEST', 'currentText is required and must be a non-empty string', 400);
    }

    if (typeof correctionInstruction !== 'string' || !correctionInstruction.trim()) {
      return error(c, 'INVALID_REQUEST', 'correctionInstruction is required and must be a non-empty string', 400);
    }

    try {
      const correctedText = await processCorrection(currentText, correctionInstruction);
      return success(c, { correctedText });
    } catch (err) {
      console.error('Error processing voice correction:', err);
      return error(c, 'INTERNAL_ERROR', 'Failed to process correction', 500);
    }
  });

  return router;
}

export default voiceRoutes;
