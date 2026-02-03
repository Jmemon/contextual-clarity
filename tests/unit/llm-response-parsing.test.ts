/**
 * Unit Tests: LLM Response Parsing
 *
 * This test suite rigorously tests the parsing functions that handle responses from
 * LLMs during rabbithole detection and recall evaluation. LLMs are unpredictable
 * in their output formats, so these tests cover:
 *
 * - Valid JSON responses in various formats
 * - Invalid/malformed JSON (truncated, trailing commas, single quotes, etc.)
 * - Missing required fields with appropriate defaults
 * - Invalid field values (out-of-range, wrong types, etc.)
 * - LLM quirks (preamble text, refusal responses, thinking out loud, etc.)
 * - Security considerations (injection attempts, extremely long values, etc.)
 *
 * These are pure unit tests - no database or external dependencies required.
 */

import { describe, it, expect } from 'bun:test';
import {
  parseRabbitholeDetectionResponse,
  parseRabbitholeReturnResponse,
  type RabbitholeDetectionResult,
  type RabbitholeReturnResult,
} from '../../src/llm/prompts/rabbithole-detector';
import {
  parseEnhancedRecallEvaluationResponse,
  deriveRatingFromConfidence,
  type EnhancedRecallEvaluationResult,
} from '../../src/llm/prompts/recall-evaluator';

// =============================================================================
// Helper Functions for Tests
// =============================================================================

/**
 * Creates a valid rabbithole detection JSON string for testing.
 * Allows overriding specific fields.
 */
function validRabbitholeDetectionJson(overrides: Partial<RabbitholeDetectionResult> = {}): string {
  const base: RabbitholeDetectionResult = {
    isRabbithole: true,
    topic: 'Test topic about tangential subject',
    depth: 2,
    relatedToCurrentPoint: true,
    relatedRecallPointIds: ['rp_1', 'rp_2'],
    confidence: 0.85,
    reasoning: 'The conversation drifted to discuss a tangential topic.',
  };
  return JSON.stringify({ ...base, ...overrides });
}

/**
 * Creates a valid rabbithole return JSON string for testing.
 */
function validRabbitholeReturnJson(overrides: Partial<RabbitholeReturnResult> = {}): string {
  const base: RabbitholeReturnResult = {
    hasReturned: true,
    confidence: 0.9,
    reasoning: 'The conversation returned to the main topic.',
  };
  return JSON.stringify({ ...base, ...overrides });
}

/**
 * Creates a valid enhanced recall evaluation JSON string for testing.
 */
function validEnhancedEvaluationJson(overrides: Partial<EnhancedRecallEvaluationResult> = {}): string {
  const base: EnhancedRecallEvaluationResult = {
    success: true,
    confidence: 0.8,
    reasoning: 'The learner demonstrated good understanding of the concept.',
    keyDemonstratedConcepts: ['concept A', 'concept B'],
    missedConcepts: ['concept C'],
    suggestedRating: 'good',
  };
  return JSON.stringify({ ...base, ...overrides });
}

// =============================================================================
// Section 1: Rabbithole Detection Response Parsing
// =============================================================================

describe('parseRabbitholeDetectionResponse', () => {
  // -------------------------------------------------------------------------
  // Valid Responses
  // -------------------------------------------------------------------------

  describe('valid responses', () => {
    it('should parse valid JSON response', () => {
      const response = validRabbitholeDetectionJson();
      const result = parseRabbitholeDetectionResponse(response);

      expect(result.isRabbithole).toBe(true);
      expect(result.topic).toBe('Test topic about tangential subject');
      expect(result.depth).toBe(2);
      expect(result.relatedToCurrentPoint).toBe(true);
      expect(result.relatedRecallPointIds).toEqual(['rp_1', 'rp_2']);
      expect(result.confidence).toBe(0.85);
      expect(result.reasoning).toBe('The conversation drifted to discuss a tangential topic.');
    });

    it('should parse JSON wrapped in markdown code blocks', () => {
      const json = validRabbitholeDetectionJson();
      const response = '```json\n' + json + '\n```';
      const result = parseRabbitholeDetectionResponse(response);

      expect(result.isRabbithole).toBe(true);
      expect(result.confidence).toBe(0.85);
    });

    it('should parse JSON wrapped in plain code blocks (no language)', () => {
      const json = validRabbitholeDetectionJson();
      const response = '```\n' + json + '\n```';
      const result = parseRabbitholeDetectionResponse(response);

      expect(result.isRabbithole).toBe(true);
    });

    it('should parse JSON with extra whitespace', () => {
      const response = `

        {
          "isRabbithole": true,
          "topic": "spaced topic",
          "depth": 1,
          "relatedToCurrentPoint": false,
          "relatedRecallPointIds": [],
          "confidence": 0.7,
          "reasoning": "Some reason"
        }

      `;
      const result = parseRabbitholeDetectionResponse(response);

      expect(result.isRabbithole).toBe(true);
      expect(result.topic).toBe('spaced topic');
    });

    it('should parse response where isRabbithole is false', () => {
      const response = validRabbitholeDetectionJson({
        isRabbithole: false,
        topic: null,
        confidence: 0.95,
      });
      const result = parseRabbitholeDetectionResponse(response);

      expect(result.isRabbithole).toBe(false);
      expect(result.topic).toBeNull();
      expect(result.confidence).toBe(0.95);
    });
  });

  // -------------------------------------------------------------------------
  // Invalid JSON Handling
  // -------------------------------------------------------------------------

  describe('invalid JSON handling', () => {
    it('should handle completely invalid JSON gracefully', () => {
      const response = 'This is not JSON at all, just plain text response.';
      const result = parseRabbitholeDetectionResponse(response);

      // Should return default "not a rabbithole" result
      expect(result.isRabbithole).toBe(false);
      expect(result.confidence).toBe(0);
      expect(result.reasoning).toContain('Failed to parse');
    });

    it('should handle truncated JSON (incomplete response)', () => {
      const response = '{"isRabbithole": true, "topic": "test", "depth": 2, "related';
      const result = parseRabbitholeDetectionResponse(response);

      expect(result.isRabbithole).toBe(false);
      expect(result.reasoning).toContain('Failed to parse');
    });

    it('should handle JSON with trailing commas', () => {
      // Note: Standard JSON.parse fails on trailing commas
      const response = '{"isRabbithole": true, "topic": "test", "depth": 2,}';
      const result = parseRabbitholeDetectionResponse(response);

      // Should fail gracefully
      expect(result.isRabbithole).toBe(false);
      expect(result.reasoning).toContain('Failed to parse');
    });

    it('should handle JSON with single quotes instead of double', () => {
      // Standard JSON requires double quotes - single quotes are invalid
      const response = "{'isRabbithole': true, 'topic': 'test'}";
      const result = parseRabbitholeDetectionResponse(response);

      expect(result.isRabbithole).toBe(false);
      expect(result.reasoning).toContain('Failed to parse');
    });

    it('should handle JSON with unquoted keys', () => {
      const response = '{isRabbithole: true, topic: "test"}';
      const result = parseRabbitholeDetectionResponse(response);

      expect(result.isRabbithole).toBe(false);
      expect(result.reasoning).toContain('Failed to parse');
    });

    it('should handle JSON with comments (invalid)', () => {
      const response = `{
        // This is a comment
        "isRabbithole": true,
        "topic": "test"
      }`;
      const result = parseRabbitholeDetectionResponse(response);

      expect(result.isRabbithole).toBe(false);
    });

    it('should handle empty string response', () => {
      const result = parseRabbitholeDetectionResponse('');

      expect(result.isRabbithole).toBe(false);
      expect(result.confidence).toBe(0);
      expect(result.reasoning).toBe('Failed to parse detection response');
    });

    it('should handle null response', () => {
      // @ts-expect-error Testing null input intentionally
      const result = parseRabbitholeDetectionResponse(null);

      expect(result.isRabbithole).toBe(false);
      expect(result.confidence).toBe(0);
    });

    it('should handle undefined response', () => {
      // @ts-expect-error Testing undefined input intentionally
      const result = parseRabbitholeDetectionResponse(undefined);

      expect(result.isRabbithole).toBe(false);
      expect(result.confidence).toBe(0);
    });

    it('should handle non-string response', () => {
      // @ts-expect-error Testing non-string input intentionally
      const result = parseRabbitholeDetectionResponse(12345);

      expect(result.isRabbithole).toBe(false);
      expect(result.confidence).toBe(0);
    });

    it('should handle response that is just whitespace', () => {
      const result = parseRabbitholeDetectionResponse('   \n\t  ');

      expect(result.isRabbithole).toBe(false);
      expect(result.reasoning).toContain('Failed to parse');
    });
  });

  // -------------------------------------------------------------------------
  // Missing Fields - Default Values
  // -------------------------------------------------------------------------

  describe('missing fields - default values', () => {
    it('should provide defaults for missing isRabbithole', () => {
      const response = JSON.stringify({
        topic: 'test',
        depth: 2,
        confidence: 0.8,
        reasoning: 'test',
      });
      const result = parseRabbitholeDetectionResponse(response);

      expect(result.isRabbithole).toBe(false); // Default to not a rabbithole
    });

    it('should provide defaults for missing confidence', () => {
      const response = JSON.stringify({
        isRabbithole: true,
        topic: 'test',
        depth: 2,
        reasoning: 'test',
      });
      const result = parseRabbitholeDetectionResponse(response);

      // Missing confidence should default to 0.5 (moderate)
      expect(result.confidence).toBe(0.5);
    });

    it('should provide defaults for missing topic', () => {
      const response = JSON.stringify({
        isRabbithole: true,
        depth: 2,
        confidence: 0.8,
        reasoning: 'test',
      });
      const result = parseRabbitholeDetectionResponse(response);

      expect(result.topic).toBeNull();
    });

    it('should provide defaults for missing depth', () => {
      const response = JSON.stringify({
        isRabbithole: true,
        topic: 'test',
        confidence: 0.8,
        reasoning: 'test',
      });
      const result = parseRabbitholeDetectionResponse(response);

      expect(result.depth).toBe(1); // Default to shallow
    });

    it('should handle missing relatedRecallPointIds', () => {
      const response = JSON.stringify({
        isRabbithole: true,
        topic: 'test',
        depth: 2,
        confidence: 0.8,
        reasoning: 'test',
      });
      const result = parseRabbitholeDetectionResponse(response);

      expect(result.relatedRecallPointIds).toEqual([]);
    });

    it('should provide defaults for missing relatedToCurrentPoint', () => {
      const response = JSON.stringify({
        isRabbithole: true,
        topic: 'test',
        depth: 2,
        confidence: 0.8,
        reasoning: 'test',
      });
      const result = parseRabbitholeDetectionResponse(response);

      expect(result.relatedToCurrentPoint).toBe(false);
    });

    it('should provide defaults for missing reasoning', () => {
      const response = JSON.stringify({
        isRabbithole: true,
        topic: 'test',
        depth: 2,
        confidence: 0.8,
      });
      const result = parseRabbitholeDetectionResponse(response);

      expect(result.reasoning).toBe('No reasoning provided');
    });

    it('should handle completely empty JSON object', () => {
      const response = '{}';
      const result = parseRabbitholeDetectionResponse(response);

      expect(result.isRabbithole).toBe(false);
      expect(result.topic).toBeNull();
      expect(result.depth).toBe(1);
      expect(result.relatedToCurrentPoint).toBe(false);
      expect(result.relatedRecallPointIds).toEqual([]);
      expect(result.confidence).toBe(0.5);
      expect(result.reasoning).toBe('No reasoning provided');
    });
  });

  // -------------------------------------------------------------------------
  // Invalid Field Values
  // -------------------------------------------------------------------------

  describe('invalid field values', () => {
    it('should handle confidence > 1 but <= 100 as percentage', () => {
      // Values 1 < x <= 100 are treated as percentages and divided by 100
      const response = validRabbitholeDetectionJson({ confidence: 1.5 });
      const result = parseRabbitholeDetectionResponse(response);

      // 1.5 is in range (1, 100], so it's divided by 100
      expect(result.confidence).toBeCloseTo(0.015, 3);
    });

    it('should clamp confidence > 100 after percentage conversion', () => {
      const response = validRabbitholeDetectionJson({ confidence: 150 });
      const result = parseRabbitholeDetectionResponse(response);

      // 150 > 100, so it's NOT treated as percentage, just clamped to 1
      expect(result.confidence).toBe(1);
    });

    it('should clamp confidence to 0-1 range (negative value)', () => {
      const response = validRabbitholeDetectionJson({ confidence: -0.5 });
      const result = parseRabbitholeDetectionResponse(response);

      expect(result.confidence).toBe(0);
    });

    it('should convert percentage-style confidence (0-100) to 0-1', () => {
      const response = validRabbitholeDetectionJson({ confidence: 85 });
      const result = parseRabbitholeDetectionResponse(response);

      expect(result.confidence).toBe(0.85);
    });

    it('should handle confidence of exactly 100', () => {
      const response = validRabbitholeDetectionJson({ confidence: 100 });
      const result = parseRabbitholeDetectionResponse(response);

      expect(result.confidence).toBe(1);
    });

    it('should normalize depth to 1 (values <= 1)', () => {
      const response = validRabbitholeDetectionJson({ depth: 0 });
      const result = parseRabbitholeDetectionResponse(response);

      expect(result.depth).toBe(1);
    });

    it('should normalize depth to 3 (values >= 3)', () => {
      const response = validRabbitholeDetectionJson({ depth: 5 });
      const result = parseRabbitholeDetectionResponse(response);

      expect(result.depth).toBe(3);
    });

    it('should normalize depth to 2 for intermediate values', () => {
      const response = validRabbitholeDetectionJson({ depth: 1.5 });
      const result = parseRabbitholeDetectionResponse(response);

      expect(result.depth).toBe(2);
    });

    it('should handle depth as string "2" (coerce if needed)', () => {
      // LLM might return "2" as a string instead of number
      const response = '{"isRabbithole": true, "topic": "test", "depth": "2", "confidence": 0.8, "reasoning": "test"}';
      const result = parseRabbitholeDetectionResponse(response);

      // Non-number depth should default to 1
      expect(result.depth).toBe(1);
    });

    it('should handle non-boolean isRabbithole (truthy string)', () => {
      const response = '{"isRabbithole": "true", "topic": "test", "depth": 2, "confidence": 0.8, "reasoning": "test"}';
      const result = parseRabbitholeDetectionResponse(response);

      // String "true" is not === true, so should default to false
      expect(result.isRabbithole).toBe(false);
    });

    it('should handle non-boolean isRabbithole (number 1)', () => {
      const response = '{"isRabbithole": 1, "topic": "test", "depth": 2, "confidence": 0.8, "reasoning": "test"}';
      const result = parseRabbitholeDetectionResponse(response);

      // Number 1 is not === true, so should default to false
      expect(result.isRabbithole).toBe(false);
    });

    it('should handle topic as number (convert scenario)', () => {
      // LLM might mistakenly return topic as a number
      const response = '{"isRabbithole": true, "topic": 12345, "depth": 2, "confidence": 0.8, "reasoning": "test"}';
      const result = parseRabbitholeDetectionResponse(response);

      // Non-string topic should be null
      expect(result.topic).toBeNull();
    });

    it('should handle topic as object (should become null)', () => {
      const response = '{"isRabbithole": true, "topic": {"nested": "object"}, "depth": 2, "confidence": 0.8, "reasoning": "test"}';
      const result = parseRabbitholeDetectionResponse(response);

      expect(result.topic).toBeNull();
    });

    it('should handle relatedRecallPointIds as string instead of array', () => {
      const response = '{"isRabbithole": true, "relatedRecallPointIds": "rp_1,rp_2", "confidence": 0.8, "reasoning": "test"}';
      const result = parseRabbitholeDetectionResponse(response);

      // Non-array should become empty array
      expect(result.relatedRecallPointIds).toEqual([]);
    });

    it('should filter non-string elements from relatedRecallPointIds', () => {
      const response = '{"isRabbithole": true, "relatedRecallPointIds": ["rp_1", 123, null, "rp_2", {"obj": true}], "confidence": 0.8, "reasoning": "test"}';
      const result = parseRabbitholeDetectionResponse(response);

      expect(result.relatedRecallPointIds).toEqual(['rp_1', 'rp_2']);
    });

    it('should handle NaN confidence', () => {
      // This is tricky - JSON.parse can't produce NaN, but let's test the normalization
      const response = '{"isRabbithole": true, "confidence": "not a number", "reasoning": "test"}';
      const result = parseRabbitholeDetectionResponse(response);

      // Non-numeric confidence should default to 0.5
      expect(result.confidence).toBe(0.5);
    });

    it('should handle Infinity confidence', () => {
      // JSON doesn't support Infinity, but the normalization should handle extreme values
      const response = validRabbitholeDetectionJson({ confidence: Number.MAX_VALUE });
      const result = parseRabbitholeDetectionResponse(response);

      // Should be clamped to 1
      expect(result.confidence).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // LLM Quirks - Common Response Patterns
  // -------------------------------------------------------------------------

  describe('LLM quirks', () => {
    it('should handle response with explanatory text before JSON', () => {
      const response = `Based on my analysis of the conversation, here is my assessment:

${validRabbitholeDetectionJson()}`;
      const result = parseRabbitholeDetectionResponse(response);

      expect(result.isRabbithole).toBe(true);
      expect(result.confidence).toBe(0.85);
    });

    it('should handle response with text after JSON (current limitation)', () => {
      // IMPORTANT: Current implementation limitation - when JSON starts the response,
      // trailing text causes parse failure because extraction doesn't truncate at last }
      // This documents the actual behavior for awareness.
      const response = `${validRabbitholeDetectionJson()}

I hope this evaluation helps. Let me know if you need any clarification.`;
      const result = parseRabbitholeDetectionResponse(response);

      // Currently fails to parse due to trailing text
      // This test documents the limitation - ideally this would succeed
      expect(result.isRabbithole).toBe(false);
      expect(result.reasoning).toContain('Failed to parse');
    });

    it('should handle response with explanatory text after JSON in code block', () => {
      // Wrapping JSON in code blocks works because the code block regex extracts cleanly
      const response = `\`\`\`json
${validRabbitholeDetectionJson()}
\`\`\`

I hope this evaluation helps. Let me know if you need any clarification.`;
      const result = parseRabbitholeDetectionResponse(response);

      expect(result.isRabbithole).toBe(true);
    });

    it('should extract JSON from mixed text/JSON response', () => {
      const response = `I'll analyze the conversation now.

After careful consideration, I believe:

${validRabbitholeDetectionJson()}

This assessment is based on the topic drift observed.`;
      const result = parseRabbitholeDetectionResponse(response);

      expect(result.isRabbithole).toBe(true);
      expect(result.topic).toBe('Test topic about tangential subject');
    });

    it('should handle multiple JSON objects by extracting first to last brace', () => {
      // Note: The current implementation finds first { to LAST }, which can create issues
      // when there are multiple JSON objects. This tests the actual behavior.
      const response = `${validRabbitholeDetectionJson({ topic: 'First topic' })}

Also, here's another perspective:

${validRabbitholeDetectionJson({ topic: 'Second topic' })}`;
      const result = parseRabbitholeDetectionResponse(response);

      // The extractor grabs from first { to last }, which creates invalid JSON
      // because it spans across two JSON objects. This results in parse failure.
      // This documents the current behavior - ideally it would extract the first valid JSON.
      expect(result.isRabbithole).toBe(false);
      expect(result.reasoning).toContain('Failed to parse');
    });

    it('should handle "I cannot" refusal responses', () => {
      const response = "I cannot analyze this conversation as it contains inappropriate content.";
      const result = parseRabbitholeDetectionResponse(response);

      expect(result.isRabbithole).toBe(false);
      expect(result.reasoning).toContain('Failed to parse');
    });

    it('should handle response that starts with "Here is..."', () => {
      const response = `Here is my analysis of the conversation:

\`\`\`json
${validRabbitholeDetectionJson()}
\`\`\``;
      const result = parseRabbitholeDetectionResponse(response);

      expect(result.isRabbithole).toBe(true);
    });

    it('should handle response with thinking/reasoning before JSON', () => {
      const response = `<thinking>
Let me analyze this step by step:
1. The user asked about mitochondria
2. The conversation shifted to ATP
3. This seems like a tangent
</thinking>

${validRabbitholeDetectionJson()}`;
      const result = parseRabbitholeDetectionResponse(response);

      expect(result.isRabbithole).toBe(true);
    });

    it('should handle response that apologizes then gives JSON', () => {
      const response = `I apologize for any confusion in my previous response. Let me provide the correct analysis:

${validRabbitholeDetectionJson()}`;
      const result = parseRabbitholeDetectionResponse(response);

      expect(result.isRabbithole).toBe(true);
    });

    it('should handle response with markdown formatting around JSON', () => {
      const response = `## Analysis Result

**Classification:** Rabbithole detected

\`\`\`json
${validRabbitholeDetectionJson()}
\`\`\`

---
*Generated by AI*`;
      const result = parseRabbitholeDetectionResponse(response);

      expect(result.isRabbithole).toBe(true);
    });
  });
});

// =============================================================================
// Section 2: Rabbithole Return Response Parsing
// =============================================================================

describe('parseRabbitholeReturnResponse', () => {
  describe('valid responses', () => {
    it('should parse valid return detection response', () => {
      const response = validRabbitholeReturnJson();
      const result = parseRabbitholeReturnResponse(response);

      expect(result.hasReturned).toBe(true);
      expect(result.confidence).toBe(0.9);
      expect(result.reasoning).toBe('The conversation returned to the main topic.');
    });

    it('should parse response where hasReturned is false', () => {
      const response = validRabbitholeReturnJson({
        hasReturned: false,
        reasoning: 'Still discussing the tangent.',
      });
      const result = parseRabbitholeReturnResponse(response);

      expect(result.hasReturned).toBe(false);
    });

    it('should parse JSON wrapped in code blocks', () => {
      const response = '```json\n' + validRabbitholeReturnJson() + '\n```';
      const result = parseRabbitholeReturnResponse(response);

      expect(result.hasReturned).toBe(true);
    });
  });

  describe('missing fields', () => {
    it('should handle missing hasReturned (default false)', () => {
      const response = JSON.stringify({
        confidence: 0.8,
        reasoning: 'test',
      });
      const result = parseRabbitholeReturnResponse(response);

      expect(result.hasReturned).toBe(false);
    });

    it('should handle missing confidence (default 0.5)', () => {
      const response = JSON.stringify({
        hasReturned: true,
        reasoning: 'test',
      });
      const result = parseRabbitholeReturnResponse(response);

      expect(result.confidence).toBe(0.5);
    });

    it('should handle missing reasoning', () => {
      const response = JSON.stringify({
        hasReturned: true,
        confidence: 0.8,
      });
      const result = parseRabbitholeReturnResponse(response);

      expect(result.reasoning).toBe('No reasoning provided');
    });
  });

  describe('invalid values', () => {
    it('should handle boolean-like strings ("true", "false")', () => {
      const response = '{"hasReturned": "true", "confidence": 0.8, "reasoning": "test"}';
      const result = parseRabbitholeReturnResponse(response);

      // String "true" !== boolean true, so default to false
      expect(result.hasReturned).toBe(false);
    });

    it('should clamp confidence to valid range', () => {
      const response = validRabbitholeReturnJson({ confidence: 150 });
      const result = parseRabbitholeReturnResponse(response);

      // 150 is > 100, so it's clamped to 1 (after potential /100 conversion)
      // Actually, 150 > 100, so it gets divided by 100 = 1.5, then clamped to 1
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('invalid JSON', () => {
    it('should handle all invalid JSON cases from detection tests', () => {
      // Empty response
      expect(parseRabbitholeReturnResponse('').hasReturned).toBe(false);

      // Null
      // @ts-expect-error Testing null input
      expect(parseRabbitholeReturnResponse(null).hasReturned).toBe(false);

      // Plain text
      expect(parseRabbitholeReturnResponse('Not JSON').hasReturned).toBe(false);

      // Truncated JSON
      expect(parseRabbitholeReturnResponse('{"hasReturned": true, "conf').hasReturned).toBe(false);
    });

    it('should include truncated response in reasoning on parse failure', () => {
      const longResponse = 'This is a very long response that does not contain any JSON...'.repeat(10);
      const result = parseRabbitholeReturnResponse(longResponse);

      expect(result.reasoning).toContain('Failed to parse');
      // Reasoning should contain truncated version of response
      expect(result.reasoning.length).toBeLessThan(longResponse.length);
    });
  });
});

// =============================================================================
// Section 3: Enhanced Recall Evaluation Response Parsing
// =============================================================================

describe('parseEnhancedRecallEvaluationResponse', () => {
  // -------------------------------------------------------------------------
  // Valid Responses
  // -------------------------------------------------------------------------

  describe('valid responses', () => {
    it('should parse valid evaluation response', () => {
      const response = validEnhancedEvaluationJson();
      const result = parseEnhancedRecallEvaluationResponse(response);

      expect(result.success).toBe(true);
      expect(result.confidence).toBe(0.8);
      expect(result.reasoning).toBe('The learner demonstrated good understanding of the concept.');
      expect(result.keyDemonstratedConcepts).toEqual(['concept A', 'concept B']);
      expect(result.missedConcepts).toEqual(['concept C']);
      expect(result.suggestedRating).toBe('good');
    });

    it('should parse response in markdown code block', () => {
      const response = '```json\n' + validEnhancedEvaluationJson() + '\n```';
      const result = parseEnhancedRecallEvaluationResponse(response);

      expect(result.success).toBe(true);
      expect(result.suggestedRating).toBe('good');
    });

    it('should parse response with all rating types', () => {
      const ratings: Array<'forgot' | 'hard' | 'good' | 'easy'> = ['forgot', 'hard', 'good', 'easy'];

      for (const rating of ratings) {
        const response = validEnhancedEvaluationJson({ suggestedRating: rating });
        const result = parseEnhancedRecallEvaluationResponse(response);
        expect(result.suggestedRating).toBe(rating);
      }
    });

    it('should parse failed evaluation response', () => {
      const response = validEnhancedEvaluationJson({
        success: false,
        confidence: 0.2,
        keyDemonstratedConcepts: [],
        missedConcepts: ['all concepts'],
        suggestedRating: 'forgot',
      });
      const result = parseEnhancedRecallEvaluationResponse(response);

      expect(result.success).toBe(false);
      expect(result.confidence).toBe(0.2);
      expect(result.suggestedRating).toBe('forgot');
    });
  });

  // -------------------------------------------------------------------------
  // Field Validation
  // -------------------------------------------------------------------------

  describe('field validation', () => {
    it('should validate success as boolean', () => {
      const response = '{"success": "yes", "confidence": 0.8, "reasoning": "test", "suggestedRating": "good"}';
      const result = parseEnhancedRecallEvaluationResponse(response);

      // String "yes" !== boolean true
      expect(result.success).toBe(false);
    });

    it('should handle success as number 1 (non-boolean)', () => {
      const response = '{"success": 1, "confidence": 0.8, "reasoning": "test", "suggestedRating": "good"}';
      const result = parseEnhancedRecallEvaluationResponse(response);

      expect(result.success).toBe(false);
    });

    it('should handle confidence in percentage range (1 < x <= 100)', () => {
      // Values 1 < x <= 100 are treated as percentages
      const response = validEnhancedEvaluationJson({ confidence: 2.5 });
      const result = parseEnhancedRecallEvaluationResponse(response);

      // 2.5 is in (1, 100] so it's divided by 100
      expect(result.confidence).toBeCloseTo(0.025, 3);
    });

    it('should clamp confidence > 100 to 1', () => {
      const response = validEnhancedEvaluationJson({ confidence: 150 });
      const result = parseEnhancedRecallEvaluationResponse(response);

      // 150 > 100, so NOT treated as percentage, just clamped
      expect(result.confidence).toBe(1);
    });

    it('should clamp confidence to 0-1 (negative)', () => {
      const response = validEnhancedEvaluationJson({ confidence: -0.3 });
      const result = parseEnhancedRecallEvaluationResponse(response);

      expect(result.confidence).toBe(0);
    });

    it('should convert percentage confidence (0-100) to 0-1', () => {
      const response = validEnhancedEvaluationJson({ confidence: 75 });
      const result = parseEnhancedRecallEvaluationResponse(response);

      expect(result.confidence).toBe(0.75);
    });

    it('should validate suggestedRating is valid FSRS rating', () => {
      const response = validEnhancedEvaluationJson({
        // @ts-expect-error Testing invalid rating
        suggestedRating: 'excellent',
        confidence: 0.9,
      });
      const result = parseEnhancedRecallEvaluationResponse(response);

      // Invalid rating should be derived from confidence
      // 0.9 confidence => 'easy'
      expect(result.suggestedRating).toBe('easy');
    });

    it('should default invalid rating based on confidence', () => {
      // Test various confidence levels with invalid ratings
      const testCases = [
        { confidence: 0.9, expectedRating: 'easy' },
        { confidence: 0.7, expectedRating: 'good' },
        { confidence: 0.45, expectedRating: 'hard' },
        { confidence: 0.1, expectedRating: 'forgot' },
      ];

      for (const { confidence, expectedRating } of testCases) {
        const response = validEnhancedEvaluationJson({
          // @ts-expect-error Testing invalid rating
          suggestedRating: 'invalid',
          confidence,
        });
        const result = parseEnhancedRecallEvaluationResponse(response);
        expect(result.suggestedRating).toBe(expectedRating);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Array Fields
  // -------------------------------------------------------------------------

  describe('array fields', () => {
    it('should handle keyDemonstratedConcepts as string (should become empty array)', () => {
      const response = '{"success": true, "confidence": 0.8, "keyDemonstratedConcepts": "concept A, concept B", "reasoning": "test", "suggestedRating": "good"}';
      const result = parseEnhancedRecallEvaluationResponse(response);

      // Non-array should become empty array
      expect(result.keyDemonstratedConcepts).toEqual([]);
    });

    it('should handle missedConcepts as string (should become empty array)', () => {
      const response = '{"success": true, "confidence": 0.8, "missedConcepts": "missed one", "reasoning": "test", "suggestedRating": "good"}';
      const result = parseEnhancedRecallEvaluationResponse(response);

      expect(result.missedConcepts).toEqual([]);
    });

    it('should handle empty arrays', () => {
      const response = validEnhancedEvaluationJson({
        keyDemonstratedConcepts: [],
        missedConcepts: [],
      });
      const result = parseEnhancedRecallEvaluationResponse(response);

      expect(result.keyDemonstratedConcepts).toEqual([]);
      expect(result.missedConcepts).toEqual([]);
    });

    it('should handle null arrays', () => {
      const response = '{"success": true, "confidence": 0.8, "keyDemonstratedConcepts": null, "missedConcepts": null, "reasoning": "test", "suggestedRating": "good"}';
      const result = parseEnhancedRecallEvaluationResponse(response);

      expect(result.keyDemonstratedConcepts).toEqual([]);
      expect(result.missedConcepts).toEqual([]);
    });

    it('should filter empty strings from concept arrays', () => {
      const response = validEnhancedEvaluationJson({
        keyDemonstratedConcepts: ['concept A', '', '  ', 'concept B', ''],
        missedConcepts: ['', 'missed one', '   '],
      });
      const result = parseEnhancedRecallEvaluationResponse(response);

      expect(result.keyDemonstratedConcepts).toEqual(['concept A', 'concept B']);
      expect(result.missedConcepts).toEqual(['missed one']);
    });

    it('should filter non-string elements from arrays', () => {
      const response = '{"success": true, "confidence": 0.8, "keyDemonstratedConcepts": ["valid", 123, null, "also valid", {"obj": true}], "reasoning": "test", "suggestedRating": "good"}';
      const result = parseEnhancedRecallEvaluationResponse(response);

      expect(result.keyDemonstratedConcepts).toEqual(['valid', 'also valid']);
    });

    it('should trim whitespace from concept strings', () => {
      const response = validEnhancedEvaluationJson({
        keyDemonstratedConcepts: ['  concept with spaces  ', '\ttabbed\t', '\nnewlined\n'],
      });
      const result = parseEnhancedRecallEvaluationResponse(response);

      expect(result.keyDemonstratedConcepts).toEqual(['concept with spaces', 'tabbed', 'newlined']);
    });
  });

  // -------------------------------------------------------------------------
  // Rating Derivation
  // -------------------------------------------------------------------------

  describe('rating derivation', () => {
    it('should derive "easy" for confidence >= 0.85', () => {
      expect(deriveRatingFromConfidence(0.85)).toBe('easy');
      expect(deriveRatingFromConfidence(0.9)).toBe('easy');
      expect(deriveRatingFromConfidence(1.0)).toBe('easy');
    });

    it('should derive "good" for confidence 0.6-0.85', () => {
      expect(deriveRatingFromConfidence(0.6)).toBe('good');
      expect(deriveRatingFromConfidence(0.7)).toBe('good');
      expect(deriveRatingFromConfidence(0.84)).toBe('good');
    });

    it('should derive "hard" for confidence 0.3-0.6', () => {
      expect(deriveRatingFromConfidence(0.3)).toBe('hard');
      expect(deriveRatingFromConfidence(0.45)).toBe('hard');
      expect(deriveRatingFromConfidence(0.59)).toBe('hard');
    });

    it('should derive "forgot" for confidence < 0.3', () => {
      expect(deriveRatingFromConfidence(0.0)).toBe('forgot');
      expect(deriveRatingFromConfidence(0.15)).toBe('forgot');
      expect(deriveRatingFromConfidence(0.29)).toBe('forgot');
    });

    it('should use derived rating when suggestedRating is invalid', () => {
      const response = validEnhancedEvaluationJson({
        // @ts-expect-error Testing invalid rating
        suggestedRating: 'super_easy',
        confidence: 0.5,
      });
      const result = parseEnhancedRecallEvaluationResponse(response);

      // 0.5 confidence => 'hard'
      expect(result.suggestedRating).toBe('hard');
    });

    it('should use derived rating when suggestedRating is missing', () => {
      const response = JSON.stringify({
        success: true,
        confidence: 0.7,
        reasoning: 'test',
        keyDemonstratedConcepts: [],
        missedConcepts: [],
        // suggestedRating omitted
      });
      const result = parseEnhancedRecallEvaluationResponse(response);

      expect(result.suggestedRating).toBe('good');
    });

    it('should handle boundary values precisely', () => {
      // Test exact boundaries
      expect(deriveRatingFromConfidence(0.85)).toBe('easy'); // >= 0.85
      expect(deriveRatingFromConfidence(0.8499999)).toBe('good'); // < 0.85
      expect(deriveRatingFromConfidence(0.6)).toBe('good'); // >= 0.6
      expect(deriveRatingFromConfidence(0.5999999)).toBe('hard'); // < 0.6
      expect(deriveRatingFromConfidence(0.3)).toBe('hard'); // >= 0.3
      expect(deriveRatingFromConfidence(0.2999999)).toBe('forgot'); // < 0.3
    });
  });

  // -------------------------------------------------------------------------
  // Reasoning Field
  // -------------------------------------------------------------------------

  describe('reasoning field', () => {
    it('should handle missing reasoning (provide default)', () => {
      const response = JSON.stringify({
        success: true,
        confidence: 0.8,
        keyDemonstratedConcepts: [],
        missedConcepts: [],
        suggestedRating: 'good',
      });
      const result = parseEnhancedRecallEvaluationResponse(response);

      expect(result.reasoning).toBe('No reasoning provided');
    });

    it('should handle very long reasoning (preserve it)', () => {
      const veryLongReasoning = 'This is a detailed explanation. '.repeat(1000);
      const response = validEnhancedEvaluationJson({ reasoning: veryLongReasoning });
      const result = parseEnhancedRecallEvaluationResponse(response);

      // Current implementation doesn't truncate reasoning
      expect(result.reasoning).toBe(veryLongReasoning);
    });

    it('should handle reasoning with special characters', () => {
      const specialReasoning = 'The learner said "I don\'t know" but then recalled it. <important>Key point</important> & more.';
      const response = validEnhancedEvaluationJson({ reasoning: specialReasoning });
      const result = parseEnhancedRecallEvaluationResponse(response);

      expect(result.reasoning).toBe(specialReasoning);
    });

    it('should handle reasoning with newlines', () => {
      const multilineReasoning = 'Line 1\nLine 2\nLine 3';
      const response = validEnhancedEvaluationJson({ reasoning: multilineReasoning });
      const result = parseEnhancedRecallEvaluationResponse(response);

      expect(result.reasoning).toBe(multilineReasoning);
    });

    it('should handle reasoning as number (convert scenario)', () => {
      const response = '{"success": true, "confidence": 0.8, "reasoning": 12345, "suggestedRating": "good"}';
      const result = parseEnhancedRecallEvaluationResponse(response);

      expect(result.reasoning).toBe('No reasoning provided');
    });
  });

  // -------------------------------------------------------------------------
  // Complete Failures
  // -------------------------------------------------------------------------

  describe('complete failures', () => {
    it('should return safe defaults for empty response', () => {
      const result = parseEnhancedRecallEvaluationResponse('');

      expect(result.success).toBe(false);
      expect(result.confidence).toBe(0);
      expect(result.reasoning).toBe('Failed to parse enhanced evaluation response');
      expect(result.keyDemonstratedConcepts).toEqual([]);
      expect(result.missedConcepts).toEqual([]);
      expect(result.suggestedRating).toBe('forgot');
    });

    it('should return safe defaults for "I cannot evaluate" response', () => {
      const response = "I cannot evaluate this response as it appears to be inappropriate or harmful content.";
      const result = parseEnhancedRecallEvaluationResponse(response);

      expect(result.success).toBe(false);
      expect(result.confidence).toBe(0);
      expect(result.suggestedRating).toBe('forgot');
    });

    it('should return safe defaults for completely garbled response', () => {
      // Note: This response contains {} which gets extracted as empty JSON object
      // An empty object parses successfully but has no valid fields
      const response = '!@#$%^&*()_+{}|:<>?asdfghjkl;';
      const result = parseEnhancedRecallEvaluationResponse(response);

      expect(result.success).toBe(false);
      // Empty JSON object {} parses, and missing confidence defaults to 0.5
      expect(result.confidence).toBe(0.5);
      // With 0.5 confidence, rating is derived as 'hard'
      expect(result.suggestedRating).toBe('hard');
    });

    it('should return safe defaults for truly unparseable response', () => {
      // Response with no braces at all
      const response = '!@#$%^&*_+|:<>?asdfghjkl;';
      const result = parseEnhancedRecallEvaluationResponse(response);

      expect(result.success).toBe(false);
      expect(result.confidence).toBe(0);
      expect(result.suggestedRating).toBe('forgot');
    });

    it('should return safe defaults for null input', () => {
      // @ts-expect-error Testing null input
      const result = parseEnhancedRecallEvaluationResponse(null);

      expect(result.success).toBe(false);
      expect(result.confidence).toBe(0);
      expect(result.suggestedRating).toBe('forgot');
    });

    it('should return safe defaults for undefined input', () => {
      // @ts-expect-error Testing undefined input
      const result = parseEnhancedRecallEvaluationResponse(undefined);

      expect(result.success).toBe(false);
      expect(result.confidence).toBe(0);
    });

    it('should return safe defaults for array input', () => {
      // @ts-expect-error Testing wrong type
      const result = parseEnhancedRecallEvaluationResponse(['not', 'a', 'string']);

      expect(result.success).toBe(false);
    });
  });
});

// =============================================================================
// Section 4: JSON Extraction Helpers (tested indirectly through parsing)
// =============================================================================

describe('JSON extraction behavior', () => {
  it('should extract JSON from plain JSON string', () => {
    const response = '{"isRabbithole": true, "confidence": 0.9, "reasoning": "test"}';
    const result = parseRabbitholeDetectionResponse(response);

    expect(result.isRabbithole).toBe(true);
  });

  it('should extract JSON from ```json code block', () => {
    const response = '```json\n{"isRabbithole": true, "confidence": 0.9, "reasoning": "test"}\n```';
    const result = parseRabbitholeDetectionResponse(response);

    expect(result.isRabbithole).toBe(true);
  });

  it('should extract JSON from ``` code block without language', () => {
    const response = '```\n{"isRabbithole": true, "confidence": 0.9, "reasoning": "test"}\n```';
    const result = parseRabbitholeDetectionResponse(response);

    expect(result.isRabbithole).toBe(true);
  });

  it('should handle nested JSON objects', () => {
    // The extractor uses first { to last }, which works for nested objects
    const response = '{"isRabbithole": true, "nested": {"key": "value"}, "confidence": 0.9, "reasoning": "test"}';
    const result = parseRabbitholeDetectionResponse(response);

    expect(result.isRabbithole).toBe(true);
  });

  it('should handle JSON arrays at root (return default for non-object)', () => {
    const response = '[{"isRabbithole": true}, {"isRabbithole": false}]';
    const result = parseRabbitholeDetectionResponse(response);

    // Arrays at root won't parse as expected object
    expect(result.isRabbithole).toBe(false);
  });

  it('should return default for no JSON found', () => {
    const response = 'This response contains no JSON at all.';
    const result = parseRabbitholeDetectionResponse(response);

    expect(result.isRabbithole).toBe(false);
    expect(result.reasoning).toContain('Failed to parse');
  });

  it('should handle response with only opening brace', () => {
    const response = 'Here is my analysis { but I never closed it';
    const result = parseRabbitholeDetectionResponse(response);

    expect(result.isRabbithole).toBe(false);
  });

  it('should handle response with only closing brace', () => {
    const response = 'I started somewhere } and here is the end';
    const result = parseRabbitholeDetectionResponse(response);

    expect(result.isRabbithole).toBe(false);
  });
});

// =============================================================================
// Section 5: Real-World LLM Response Examples
// =============================================================================

describe('real-world LLM responses', () => {
  it('should handle Claude response with preamble', () => {
    const response = `Based on the conversation, here is my analysis:

\`\`\`json
{
  "isRabbithole": true,
  "topic": "etymology of mitochondria",
  "depth": 2,
  "relatedToCurrentPoint": true,
  "relatedRecallPointIds": ["rp_bio_1"],
  "confidence": 0.82,
  "reasoning": "The conversation shifted from cellular respiration to discussing the Greek origins of the word mitochondria."
}
\`\`\``;
    const result = parseRabbitholeDetectionResponse(response);

    expect(result.isRabbithole).toBe(true);
    expect(result.topic).toBe('etymology of mitochondria');
    expect(result.depth).toBe(2);
  });

  it('should handle response that starts with "Here is..."', () => {
    const response = `Here is my evaluation of the recall attempt:

{
  "success": true,
  "confidence": 0.85,
  "reasoning": "The learner correctly identified the key components.",
  "keyDemonstratedConcepts": ["ATP structure", "phosphate bonds"],
  "missedConcepts": ["electron transport chain detail"],
  "suggestedRating": "good"
}`;
    const result = parseEnhancedRecallEvaluationResponse(response);

    expect(result.success).toBe(true);
    expect(result.suggestedRating).toBe('good');
  });

  it('should handle response with thinking/reasoning before JSON', () => {
    const response = `Let me think about this carefully...

The user mentioned several key points about photosynthesis. They correctly identified the chloroplast as the organelle involved, and they mentioned light-dependent reactions.

However, they seemed confused about the Calvin cycle.

{
  "success": true,
  "confidence": 0.65,
  "reasoning": "Partial recall - understood light reactions but confused about Calvin cycle.",
  "keyDemonstratedConcepts": ["chloroplast location", "light-dependent reactions"],
  "missedConcepts": ["Calvin cycle steps"],
  "suggestedRating": "hard"
}`;
    const result = parseEnhancedRecallEvaluationResponse(response);

    expect(result.success).toBe(true);
    expect(result.confidence).toBe(0.65);
    expect(result.suggestedRating).toBe('hard');
  });

  it('should handle response that apologizes then gives JSON', () => {
    const response = `I apologize for any confusion. Let me provide a clear analysis:

\`\`\`json
{
  "hasReturned": true,
  "confidence": 0.88,
  "reasoning": "The tutor successfully redirected the conversation back to the main topic of cellular respiration."
}
\`\`\`

I hope this helps!`;
    const result = parseRabbitholeReturnResponse(response);

    expect(result.hasReturned).toBe(true);
    expect(result.confidence).toBe(0.88);
  });

  it('should handle actual Claude response pattern with multiple paragraphs', () => {
    const response = `I've analyzed the conversation between the tutor and learner.

The conversation started on topic but then shifted when the learner asked about the historical discovery of DNA. This led to a discussion about Rosalind Franklin and the controversy around her contributions.

While this is related to the topic of genetics, it represents a tangent from the specific recall point about DNA structure.

\`\`\`json
{
  "isRabbithole": true,
  "topic": "historical discovery of DNA and Rosalind Franklin",
  "depth": 2,
  "relatedToCurrentPoint": true,
  "relatedRecallPointIds": [],
  "confidence": 0.78,
  "reasoning": "The conversation shifted from discussing DNA structure to exploring the historical and social context of its discovery, which is interesting but tangential to the recall target."
}
\`\`\`

Let me know if you need any clarification on this analysis.`;
    const result = parseRabbitholeDetectionResponse(response);

    expect(result.isRabbithole).toBe(true);
    expect(result.topic).toBe('historical discovery of DNA and Rosalind Franklin');
    expect(result.confidence).toBeCloseTo(0.78, 2);
  });
});

// =============================================================================
// Section 6: Security/Injection Considerations
// =============================================================================

describe('input sanitization and security', () => {
  it('should handle JSON with script tags in strings', () => {
    const response = validRabbitholeDetectionJson({
      topic: '<script>alert("xss")</script>',
      reasoning: 'Contains <script>malicious()</script> content',
    });
    const result = parseRabbitholeDetectionResponse(response);

    // Should parse successfully and preserve the content
    expect(result.topic).toBe('<script>alert("xss")</script>');
    expect(result.reasoning).toContain('<script>');
  });

  it('should handle JSON with SQL injection attempts in strings', () => {
    const response = validRabbitholeDetectionJson({
      topic: "'; DROP TABLE users; --",
      reasoning: "Robert'); DROP TABLE students;--",
    });
    const result = parseRabbitholeDetectionResponse(response);

    // Should parse successfully - SQL injection is not a concern for JSON parsing
    expect(result.topic).toBe("'; DROP TABLE users; --");
  });

  it('should handle extremely long field values', () => {
    const veryLongTopic = 'A'.repeat(100000);
    const response = validRabbitholeDetectionJson({ topic: veryLongTopic });
    const result = parseRabbitholeDetectionResponse(response);

    expect(result.topic).toBe(veryLongTopic);
    expect(result.topic!.length).toBe(100000);
  });

  it('should handle unicode and emoji in responses', () => {
    const response = validRabbitholeDetectionJson({
      topic: 'Discussion about emoji usage: 😀🎉🚀',
      reasoning: 'The learner used emoji: 👍 and unicode: über, café, 日本語',
    });
    const result = parseRabbitholeDetectionResponse(response);

    expect(result.topic).toBe('Discussion about emoji usage: 😀🎉🚀');
    expect(result.reasoning).toContain('日本語');
  });

  it('should handle escaped null bytes in response', () => {
    // Null bytes in JSON strings must be escaped as \\u0000
    // Testing with escaped form which is valid JSON
    const response = '{"isRabbithole": true, "topic": "test\\u0000topic", "confidence": 0.8, "reasoning": "test\\u0000reason"}';
    const result = parseRabbitholeDetectionResponse(response);

    // Should parse and preserve null bytes
    expect(result.topic).not.toBeNull();
    expect(result.topic!.includes('\u0000')).toBe(true);
  });

  it('should handle literal null bytes in response (causes parse failure)', () => {
    // Literal null bytes in JSON strings are invalid and cause parse failure
    // This documents the expected behavior
    const response = '{"isRabbithole": true, "topic": "test' + '\u0000' + 'topic", "confidence": 0.8, "reasoning": "test"}';
    const result = parseRabbitholeDetectionResponse(response);

    // Parse fails due to invalid JSON
    expect(result.isRabbithole).toBe(false);
    expect(result.reasoning).toContain('Failed to parse');
  });

  it('should handle backslash escapes in strings', () => {
    const response = '{"isRabbithole": true, "topic": "path\\\\to\\\\file", "confidence": 0.8, "reasoning": "test"}';
    const result = parseRabbitholeDetectionResponse(response);

    expect(result.topic).toBe('path\\to\\file');
  });

  it('should handle JSON with prototype pollution attempts', () => {
    // Attempting to pollute __proto__ through JSON
    const response = '{"isRabbithole": true, "__proto__": {"polluted": true}, "confidence": 0.8, "reasoning": "test"}';
    const result = parseRabbitholeDetectionResponse(response);

    // Should parse but not cause pollution
    expect(result.isRabbithole).toBe(true);
    // @ts-expect-error Checking for unintended property
    expect(result.polluted).toBeUndefined();
  });

  it('should handle response with constructor property', () => {
    const response = '{"isRabbithole": true, "constructor": {"name": "evil"}, "confidence": 0.8, "reasoning": "test"}';
    const result = parseRabbitholeDetectionResponse(response);

    expect(result.isRabbithole).toBe(true);
    expect(typeof result.constructor).toBe('function'); // Should be the Object constructor, not overwritten
  });

  it('should handle deeply nested JSON (potential DoS)', () => {
    // Create deeply nested JSON - this could cause stack overflow if not handled
    let nested = '{"value": true}';
    for (let i = 0; i < 100; i++) {
      nested = `{"nested": ${nested}}`;
    }

    // Wrap in a valid detection format
    const response = `{"isRabbithole": true, "deep": ${nested}, "confidence": 0.8, "reasoning": "test"}`;
    const result = parseRabbitholeDetectionResponse(response);

    // Should parse successfully (100 levels is within JSON.parse limits)
    expect(result.isRabbithole).toBe(true);
  });

  it('should handle response with BOM (Byte Order Mark)', () => {
    const response = '\uFEFF{"isRabbithole": true, "confidence": 0.8, "reasoning": "test"}';
    const result = parseRabbitholeDetectionResponse(response);

    // BOM should be handled gracefully
    expect(result.isRabbithole).toBe(true);
  });

  it('should handle mixed encoding issues', () => {
    // UTF-8 encoded content that might be misinterpreted
    const response = validRabbitholeDetectionJson({
      topic: 'Caffè Müller über Østergaard',
      reasoning: '日本語とעברית混合テスト',
    });
    const result = parseRabbitholeDetectionResponse(response);

    expect(result.topic).toBe('Caffè Müller über Østergaard');
    expect(result.reasoning).toContain('日本語');
  });
});

// =============================================================================
// Section 7: Edge Cases and Boundary Conditions
// =============================================================================

describe('edge cases and boundary conditions', () => {
  it('should handle confidence of exactly 0', () => {
    const response = validRabbitholeDetectionJson({ confidence: 0 });
    const result = parseRabbitholeDetectionResponse(response);

    expect(result.confidence).toBe(0);
  });

  it('should handle confidence of exactly 1', () => {
    const response = validRabbitholeDetectionJson({ confidence: 1 });
    const result = parseRabbitholeDetectionResponse(response);

    expect(result.confidence).toBe(1);
  });

  it('should handle empty topic string', () => {
    const response = validRabbitholeDetectionJson({ topic: '' });
    const result = parseRabbitholeDetectionResponse(response);

    expect(result.topic).toBe('');
  });

  it('should handle whitespace-only topic', () => {
    const response = validRabbitholeDetectionJson({ topic: '   ' });
    const result = parseRabbitholeDetectionResponse(response);

    expect(result.topic).toBe('   ');
  });

  it('should handle very small confidence values', () => {
    const response = validRabbitholeDetectionJson({ confidence: 0.0000001 });
    const result = parseRabbitholeDetectionResponse(response);

    expect(result.confidence).toBeCloseTo(0.0000001, 7);
  });

  it('should handle response with only required minimum fields', () => {
    const response = '{"isRabbithole": false}';
    const result = parseRabbitholeDetectionResponse(response);

    expect(result.isRabbithole).toBe(false);
    expect(result.depth).toBe(1);
    expect(result.confidence).toBe(0.5);
  });

  it('should handle response with extra unknown fields', () => {
    const response = JSON.stringify({
      isRabbithole: true,
      topic: 'test',
      depth: 2,
      confidence: 0.8,
      reasoning: 'test',
      extraField1: 'ignored',
      extraField2: 12345,
      relatedToCurrentPoint: true,
      relatedRecallPointIds: [],
    });
    const result = parseRabbitholeDetectionResponse(response);

    // Extra fields should be ignored
    expect(result.isRabbithole).toBe(true);
    // @ts-expect-error Checking for unintended property
    expect(result.extraField1).toBeUndefined();
  });

  it('should handle response with fields in different order', () => {
    const response = JSON.stringify({
      reasoning: 'test reason',
      confidence: 0.9,
      isRabbithole: true,
      relatedRecallPointIds: ['a', 'b'],
      depth: 3,
      topic: 'out of order',
      relatedToCurrentPoint: false,
    });
    const result = parseRabbitholeDetectionResponse(response);

    expect(result.isRabbithole).toBe(true);
    expect(result.topic).toBe('out of order');
    expect(result.depth).toBe(3);
  });

  it('should handle JSON number edge cases (scientific notation)', () => {
    const response = '{"isRabbithole": true, "confidence": 8.5e-1, "reasoning": "test"}';
    const result = parseRabbitholeDetectionResponse(response);

    expect(result.confidence).toBeCloseTo(0.85, 2);
  });

  it('should handle boolean false vs missing field correctly', () => {
    // Explicit false
    const response1 = '{"isRabbithole": false, "relatedToCurrentPoint": false}';
    const result1 = parseRabbitholeDetectionResponse(response1);
    expect(result1.isRabbithole).toBe(false);
    expect(result1.relatedToCurrentPoint).toBe(false);

    // Missing fields (should also be false)
    const response2 = '{}';
    const result2 = parseRabbitholeDetectionResponse(response2);
    expect(result2.isRabbithole).toBe(false);
    expect(result2.relatedToCurrentPoint).toBe(false);
  });
});
