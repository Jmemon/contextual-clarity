/**
 * Voice API Routes
 *
 * Provides a token endpoint for Deepgram voice transcription.
 * The Deepgram API key stays server-side — this endpoint creates
 * short-lived (60s) project keys that the frontend uses to open
 * a direct WebSocket connection to Deepgram for real-time STT.
 *
 * Endpoints:
 * - POST /voice/token - Create a short-lived Deepgram project key
 */

import { Hono } from 'hono';
import { success, error } from '../utils/response';
import { getDeepgramApiKey } from '../../config';
import { createDeepgramClient } from '../../core/voice';

// =============================================================================
// Route Definitions
// =============================================================================

/**
 * Creates the voice router with the token endpoint.
 *
 * @returns Hono router instance with voice routes
 */
export function voiceRoutes(): Hono {
  const router = new Hono();

  // -------------------------------------------------------------------------
  // POST /voice/token - Create a short-lived Deepgram token
  // -------------------------------------------------------------------------

  /**
   * Creates a temporary Deepgram API key for client-side WebSocket connections.
   * The key expires after 60 seconds and has only `usage:write` scope
   * (enough for transcription, but not account management).
   *
   * Returns 503 Service Unavailable if DEEPGRAM_API_KEY is not configured.
   */
  router.post('/token', async (c) => {
    const apiKey = getDeepgramApiKey();

    if (!apiKey) {
      return error(
        c,
        'SERVICE_UNAVAILABLE',
        'Voice input is not configured. Set DEEPGRAM_API_KEY to enable.',
        503
      );
    }

    try {
      const deepgram = createDeepgramClient(apiKey);

      // Get the first project associated with this API key
      const { result: projects, error: projectsError } = await deepgram.manage.getProjects();

      if (projectsError || !projects?.projects?.length) {
        console.error('Failed to fetch Deepgram projects:', projectsError);
        return error(
          c,
          'DEEPGRAM_ERROR',
          'Failed to retrieve Deepgram project information',
          500
        );
      }

      const projectId = projects.projects[0]!.project_id;

      // Create a short-lived key with minimal scope (60 seconds TTL)
      const { result: keyResult, error: keyError } = await deepgram.manage.createProjectKey(
        projectId,
        {
          comment: 'Temporary voice input token',
          scopes: ['usage:write'],
          time_to_live_in_seconds: 60,
        }
      );

      if (keyError || !keyResult?.key) {
        console.error('Failed to create Deepgram project key:', keyError);
        return error(
          c,
          'DEEPGRAM_ERROR',
          'Failed to create temporary voice token',
          500
        );
      }

      const expiresAt = new Date(Date.now() + 60 * 1000).toISOString();

      return success(c, {
        token: keyResult.key,
        expiresAt,
      });
    } catch (err) {
      console.error('Error creating voice token:', err);
      return error(
        c,
        'INTERNAL_ERROR',
        'Failed to create voice token',
        500
      );
    }
  });

  return router;
}

export default voiceRoutes;
