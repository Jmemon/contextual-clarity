/**
 * Unit Tests for WebSocket Message Types
 *
 * Tests the message parsing, validation, and serialization utilities
 * for WebSocket communication.
 */

import { describe, it, expect } from 'bun:test';
import {
  parseClientMessage,
  serializeServerMessage,
  isClientMessageType,
  createErrorPayload,
  CLIENT_MESSAGE_TYPES,
  WS_CLOSE_CODES,
  type ServerMessage,
} from './types';

describe('WebSocket Types', () => {
  // =========================================================================
  // isClientMessageType Tests
  // =========================================================================
  describe('isClientMessageType', () => {
    it('should return true for valid client message types', () => {
      expect(isClientMessageType('user_message')).toBe(true);
      expect(isClientMessageType('trigger_eval')).toBe(true);
      expect(isClientMessageType('leave_session')).toBe(true);  // T08: renamed from end_session
      expect(isClientMessageType('ping')).toBe(true);
    });

    it('should return false for invalid message types', () => {
      expect(isClientMessageType('invalid_type')).toBe(false);
      expect(isClientMessageType('session_started')).toBe(false); // Server message type
      expect(isClientMessageType('')).toBe(false);
      expect(isClientMessageType(null)).toBe(false);
      expect(isClientMessageType(undefined)).toBe(false);
      expect(isClientMessageType(123)).toBe(false);
    });
  });

  // =========================================================================
  // parseClientMessage Tests
  // =========================================================================
  describe('parseClientMessage', () => {
    it('should parse valid user_message', () => {
      const result = parseClientMessage(JSON.stringify({
        type: 'user_message',
        content: 'Hello, this is my response',
      }));

      expect(result.type).toBe('user_message');
      if (result.type === 'user_message') {
        expect(result.content).toBe('Hello, this is my response');
      }
    });

    it('should parse valid trigger_eval', () => {
      const result = parseClientMessage(JSON.stringify({ type: 'trigger_eval' }));
      expect(result.type).toBe('trigger_eval');
    });

    // T08: end_session renamed to leave_session (non-destructive pause)
    it('should parse valid leave_session', () => {
      const result = parseClientMessage(JSON.stringify({ type: 'leave_session' }));
      expect(result.type).toBe('leave_session');
    });

    it('should parse valid ping', () => {
      const result = parseClientMessage(JSON.stringify({ type: 'ping' }));
      expect(result.type).toBe('ping');
    });

    it('should return error for invalid JSON', () => {
      const result = parseClientMessage('not valid json');
      expect(result.type).toBe('error');
      if (result.type === 'error') {
        expect(result.code).toBe('INVALID_MESSAGE_FORMAT');
      }
    });

    it('should return error for missing type field', () => {
      const result = parseClientMessage(JSON.stringify({ content: 'test' }));
      expect(result.type).toBe('error');
      if (result.type === 'error') {
        expect(result.code).toBe('INVALID_MESSAGE_FORMAT');
      }
    });

    it('should return error for unknown message type', () => {
      const result = parseClientMessage(JSON.stringify({ type: 'unknown_type' }));
      expect(result.type).toBe('error');
      if (result.type === 'error') {
        expect(result.code).toBe('UNKNOWN_MESSAGE_TYPE');
      }
    });

    it('should return error for user_message without content', () => {
      const result = parseClientMessage(JSON.stringify({ type: 'user_message' }));
      expect(result.type).toBe('error');
      if (result.type === 'error') {
        expect(result.code).toBe('MISSING_CONTENT');
      }
    });

    it('should return error for user_message with empty content', () => {
      const result = parseClientMessage(JSON.stringify({
        type: 'user_message',
        content: '   ',
      }));
      expect(result.type).toBe('error');
      if (result.type === 'error') {
        expect(result.code).toBe('MISSING_CONTENT');
      }
    });

    it('should return error for null input parsed as JSON', () => {
      const result = parseClientMessage('null');
      expect(result.type).toBe('error');
      if (result.type === 'error') {
        expect(result.code).toBe('INVALID_MESSAGE_FORMAT');
      }
    });
  });

  // =========================================================================
  // serializeServerMessage Tests
  // =========================================================================
  describe('serializeServerMessage', () => {
    it('should serialize session_started message', () => {
      const message: ServerMessage = {
        type: 'session_started',
        sessionId: 'sess_123',
        openingMessage: 'Welcome!',
        currentPointIndex: 0,
        totalPoints: 5,
      };
      const serialized = serializeServerMessage(message);
      const parsed = JSON.parse(serialized);

      expect(parsed.type).toBe('session_started');
      expect(parsed.sessionId).toBe('sess_123');
      expect(parsed.openingMessage).toBe('Welcome!');
    });

    it('should serialize assistant_chunk message', () => {
      const message: ServerMessage = {
        type: 'assistant_chunk',
        content: 'chunk content',
        chunkIndex: 0,
      };
      const serialized = serializeServerMessage(message);
      const parsed = JSON.parse(serialized);

      expect(parsed.type).toBe('assistant_chunk');
      expect(parsed.content).toBe('chunk content');
      expect(parsed.chunkIndex).toBe(0);
    });

    it('should serialize error message', () => {
      const message: ServerMessage = {
        type: 'error',
        code: 'SESSION_NOT_FOUND',
        message: 'Session not found',
        recoverable: false,
      };
      const serialized = serializeServerMessage(message);
      const parsed = JSON.parse(serialized);

      expect(parsed.type).toBe('error');
      expect(parsed.code).toBe('SESSION_NOT_FOUND');
      expect(parsed.recoverable).toBe(false);
    });

    it('should serialize pong message', () => {
      const message: ServerMessage = {
        type: 'pong',
        timestamp: 1234567890,
      };
      const serialized = serializeServerMessage(message);
      const parsed = JSON.parse(serialized);

      expect(parsed.type).toBe('pong');
      expect(parsed.timestamp).toBe(1234567890);
    });
  });

  // =========================================================================
  // createErrorPayload Tests
  // =========================================================================
  describe('createErrorPayload', () => {
    it('should create error payload with default message', () => {
      const error = createErrorPayload('SESSION_NOT_FOUND');

      expect(error.type).toBe('error');
      expect(error.code).toBe('SESSION_NOT_FOUND');
      expect(error.message).toBe('The specified session does not exist');
      expect(error.recoverable).toBe(true);
    });

    it('should create error payload with custom message', () => {
      const error = createErrorPayload('INTERNAL_ERROR', 'Custom error message');

      expect(error.code).toBe('INTERNAL_ERROR');
      expect(error.message).toBe('Custom error message');
    });

    it('should create non-recoverable error', () => {
      const error = createErrorPayload('INTERNAL_ERROR', undefined, false);

      expect(error.recoverable).toBe(false);
    });
  });

  // =========================================================================
  // Constants Tests
  // =========================================================================
  describe('Constants', () => {
    it('should have all client message types', () => {
      expect(CLIENT_MESSAGE_TYPES).toContain('user_message');
      expect(CLIENT_MESSAGE_TYPES).toContain('trigger_eval');
      expect(CLIENT_MESSAGE_TYPES).toContain('leave_session');  // T08: renamed from end_session
      expect(CLIENT_MESSAGE_TYPES).toContain('ping');
      expect(CLIENT_MESSAGE_TYPES.length).toBe(4);
    });

    it('should have all WebSocket close codes', () => {
      expect(WS_CLOSE_CODES.NORMAL).toBe(1000);
      expect(WS_CLOSE_CODES.SESSION_ENDED).toBe(4000);
      expect(WS_CLOSE_CODES.SESSION_ABANDONED).toBe(4001);
      expect(WS_CLOSE_CODES.INVALID_SESSION).toBe(4002);
      expect(WS_CLOSE_CODES.TOO_MANY_ERRORS).toBe(4003);
      expect(WS_CLOSE_CODES.SERVER_SHUTDOWN).toBe(4004);
      expect(WS_CLOSE_CODES.IDLE_TIMEOUT).toBe(4005);
    });
  });
});
