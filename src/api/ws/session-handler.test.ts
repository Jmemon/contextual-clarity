/**
 * Unit Tests for WebSocket Session Handler
 *
 * Tests the utility functions and handler initialization for WebSocket sessions.
 */

import { describe, it, expect } from 'bun:test';
import {
  createInitialSessionData,
  extractSessionIdFromUrl,
  isWebSocketUpgradeRequest,
  DEFAULT_WS_CONFIG,
} from './session-handler';

describe('WebSocket Session Handler', () => {
  // =========================================================================
  // createInitialSessionData Tests
  // =========================================================================
  describe('createInitialSessionData', () => {
    it('should create initial session data with provided sessionId', () => {
      const sessionId = 'sess_test_123';
      const data = createInitialSessionData(sessionId);

      expect(data.sessionId).toBe(sessionId);
      expect(data.session).toBeNull();
      expect(data.recallSet).toBeNull();
      expect(data.initialized).toBe(false);
      expect(data.consecutiveErrors).toBe(0);
      expect(data.isStreaming).toBe(false);
      expect(data.currentResponseChunks).toEqual([]);
      expect(data.currentChunkIndex).toBe(0);
    });

    it('should have a recent lastMessageTime timestamp', () => {
      const before = Date.now();
      const data = createInitialSessionData('sess_test');
      const after = Date.now();

      expect(data.lastMessageTime).toBeGreaterThanOrEqual(before);
      expect(data.lastMessageTime).toBeLessThanOrEqual(after);
    });
  });

  // =========================================================================
  // extractSessionIdFromUrl Tests
  // =========================================================================
  describe('extractSessionIdFromUrl', () => {
    it('should extract valid sessionId from URL', () => {
      const url = new URL('ws://localhost:3001/api/session/ws?sessionId=sess_abc123');
      const result = extractSessionIdFromUrl(url);

      expect('sessionId' in result).toBe(true);
      if ('sessionId' in result) {
        expect(result.sessionId).toBe('sess_abc123');
      }
    });

    it('should return error when sessionId is missing', () => {
      const url = new URL('ws://localhost:3001/api/session/ws');
      const result = extractSessionIdFromUrl(url);

      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toContain('Missing');
      }
    });

    it('should return error when sessionId has invalid format', () => {
      const url = new URL('ws://localhost:3001/api/session/ws?sessionId=invalid_123');
      const result = extractSessionIdFromUrl(url);

      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toContain('Invalid');
      }
    });

    it('should accept sessionId with UUID suffix', () => {
      const url = new URL('ws://localhost:3001/api/session/ws?sessionId=sess_a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      const result = extractSessionIdFromUrl(url);

      expect('sessionId' in result).toBe(true);
      if ('sessionId' in result) {
        expect(result.sessionId).toBe('sess_a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      }
    });

    it('should handle empty sessionId parameter', () => {
      const url = new URL('ws://localhost:3001/api/session/ws?sessionId=');
      const result = extractSessionIdFromUrl(url);

      expect('error' in result).toBe(true);
    });
  });

  // =========================================================================
  // isWebSocketUpgradeRequest Tests
  // =========================================================================
  describe('isWebSocketUpgradeRequest', () => {
    it('should return true for WebSocket upgrade request', () => {
      const request = new Request('ws://localhost:3001/api/session/ws', {
        headers: {
          'Upgrade': 'websocket',
          'Connection': 'Upgrade',
        },
      });

      expect(isWebSocketUpgradeRequest(request)).toBe(true);
    });

    it('should be case-insensitive for Upgrade header', () => {
      const request = new Request('ws://localhost:3001/api/session/ws', {
        headers: {
          'Upgrade': 'WebSocket',
        },
      });

      expect(isWebSocketUpgradeRequest(request)).toBe(true);
    });

    it('should return false for regular HTTP request', () => {
      const request = new Request('http://localhost:3001/api/session/ws', {
        method: 'GET',
      });

      expect(isWebSocketUpgradeRequest(request)).toBe(false);
    });

    it('should return false when Upgrade header is missing', () => {
      const request = new Request('http://localhost:3001/api/session/ws', {
        headers: {
          'Connection': 'Upgrade',
        },
      });

      expect(isWebSocketUpgradeRequest(request)).toBe(false);
    });

    it('should return false when Upgrade header is not websocket', () => {
      const request = new Request('http://localhost:3001/api/session/ws', {
        headers: {
          'Upgrade': 'http/2.0',
        },
      });

      expect(isWebSocketUpgradeRequest(request)).toBe(false);
    });
  });

  // =========================================================================
  // DEFAULT_WS_CONFIG Tests
  // =========================================================================
  describe('DEFAULT_WS_CONFIG', () => {
    it('should have reasonable default ping interval', () => {
      // Should be 30 seconds
      expect(DEFAULT_WS_CONFIG.pingIntervalMs).toBe(30000);
    });

    it('should have reasonable pong timeout', () => {
      // Should be 10 seconds
      expect(DEFAULT_WS_CONFIG.pongTimeoutMs).toBe(10000);
    });

    it('should have reasonable max consecutive errors', () => {
      // Should be 5 errors before closing
      expect(DEFAULT_WS_CONFIG.maxConsecutiveErrors).toBe(5);
    });

    it('should have reasonable idle timeout', () => {
      // Should be 5 minutes
      expect(DEFAULT_WS_CONFIG.idleTimeoutMs).toBe(5 * 60 * 1000);
    });

    it('pong timeout should be less than ping interval', () => {
      // We need time between pong timeout and next ping
      expect(DEFAULT_WS_CONFIG.pongTimeoutMs).toBeLessThan(DEFAULT_WS_CONFIG.pingIntervalMs);
    });
  });
});
