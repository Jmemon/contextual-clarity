/**
 * Unit Tests: Socratic Tutor Prompt Builder
 *
 * Tests the public buildSocraticTutorPrompt() function to verify the universal
 * recall-session facilitator prompt, supplementary guidelines behavior, section
 * ordering, and empty-session edge cases. All module-private functions are tested
 * indirectly through the public API.
 */

import { describe, it, expect } from 'bun:test';
import { buildSocraticTutorPrompt, type SocraticTutorPromptParams } from '../../../src/llm/prompts/socratic-tutor';
import type { RecallPoint, RecallSet } from '../../../src/core/models';

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

function makeRecallSet(overrides: Partial<RecallSet> = {}): RecallSet {
  return {
    id: 'rs_test1',
    name: 'Test Recall Set',
    description: 'A test recall set',
    status: 'active',
    discussionSystemPrompt: '',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function makeRecallPoint(overrides: Partial<RecallPoint> = {}): RecallPoint {
  return {
    id: 'rp_test1',
    recallSetId: 'rs_test1',
    content: 'The speed of light is approximately 299,792,458 meters per second.',
    context: 'This is a fundamental constant in physics.',
    fsrsState: { difficulty: 5, stability: 1, due: new Date('2024-01-02') },
    recallHistory: [],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function buildDefaultParams(overrides: Partial<SocraticTutorPromptParams> = {}): SocraticTutorPromptParams {
  const point = makeRecallPoint();
  return {
    recallSet: makeRecallSet(),
    targetPoints: [point],
    uncheckedPoints: [point],
    currentProbePoint: point,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildSocraticTutorPrompt', () => {

  describe('universal agent identity', () => {
    it('contains "recall session" and "facilitator"', () => {
      const prompt = buildSocraticTutorPrompt(buildDefaultParams());
      expect(prompt).toContain('recall session');
      expect(prompt).toContain('facilitator');
    });

    it('states the user has previously learned the material', () => {
      const prompt = buildSocraticTutorPrompt(buildDefaultParams());
      expect(prompt).toContain('previously learned');
      expect(prompt).toContain('practice retrieval');
    });

    it('mentions the evaluator system', () => {
      const prompt = buildSocraticTutorPrompt(buildDefaultParams());
      expect(prompt).toContain('evaluator system');
      expect(prompt).toContain('observations');
    });

    it('states the UI handles positive reinforcement', () => {
      const prompt = buildSocraticTutorPrompt(buildDefaultParams());
      expect(prompt).toContain('UI handles all positive reinforcement');
    });

    it('does not contain "AI Tutor"', () => {
      const prompt = buildSocraticTutorPrompt(buildDefaultParams());
      expect(prompt).not.toContain('AI Tutor');
    });

    it('does not contain "patient tutor"', () => {
      const prompt = buildSocraticTutorPrompt(buildDefaultParams());
      expect(prompt).not.toContain('patient tutor');
    });

    it('does not contain "knowledgeable" fallback persona', () => {
      const prompt = buildSocraticTutorPrompt(buildDefaultParams());
      expect(prompt).not.toContain('knowledgeable and patient tutor');
    });
  });

  describe('supplementary guidelines', () => {
    it('includes supplementary guidelines when discussionSystemPrompt is non-empty', () => {
      const params = buildDefaultParams({
        recallSet: makeRecallSet({
          discussionSystemPrompt: 'Focus on physics concepts and use metric units.',
        }),
      });
      const prompt = buildSocraticTutorPrompt(params);

      expect(prompt).toContain('## Supplementary guidelines for this recall set');
      expect(prompt).toContain('<supplementary_guidelines>');
      expect(prompt).toContain('Focus on physics concepts and use metric units.');
      expect(prompt).toContain('</supplementary_guidelines>');
    });

    it('omits supplementary guidelines when discussionSystemPrompt is empty', () => {
      const params = buildDefaultParams({
        recallSet: makeRecallSet({ discussionSystemPrompt: '' }),
      });
      const prompt = buildSocraticTutorPrompt(params);

      expect(prompt).not.toContain('Supplementary guidelines');
      expect(prompt).not.toContain('<supplementary_guidelines>');
    });

    it('omits supplementary guidelines when discussionSystemPrompt is whitespace-only', () => {
      const params = buildDefaultParams({
        recallSet: makeRecallSet({ discussionSystemPrompt: '   \n\t  ' }),
      });
      const prompt = buildSocraticTutorPrompt(params);

      expect(prompt).not.toContain('Supplementary guidelines');
      expect(prompt).not.toContain('<supplementary_guidelines>');
    });

    it('preserves full content of non-empty supplementary guidelines', () => {
      const guidelinesText = 'Use formal language.\nAlways cite sources.\nAvoid analogies.';
      const params = buildDefaultParams({
        recallSet: makeRecallSet({ discussionSystemPrompt: guidelinesText }),
      });
      const prompt = buildSocraticTutorPrompt(params);

      expect(prompt).toContain(guidelinesText);
    });

    it('describes supplementary guidelines as additive, not replacing', () => {
      const params = buildDefaultParams({
        recallSet: makeRecallSet({
          discussionSystemPrompt: 'Some guidelines here.',
        }),
      });
      const prompt = buildSocraticTutorPrompt(params);

      expect(prompt).toContain('in addition to (not instead of)');
    });
  });

  describe('section ordering', () => {
    it('universal agent section appears before Socratic method section', () => {
      const prompt = buildSocraticTutorPrompt(buildDefaultParams());
      const agentIdx = prompt.indexOf('recall session facilitator');
      const socraticIdx = prompt.indexOf('Your Socratic Approach');

      expect(agentIdx).toBeGreaterThan(-1);
      expect(socraticIdx).toBeGreaterThan(-1);
      expect(agentIdx).toBeLessThan(socraticIdx);
    });

    it('Socratic method section appears before current focus point', () => {
      const prompt = buildSocraticTutorPrompt(buildDefaultParams());
      const socraticIdx = prompt.indexOf('Your Socratic Approach');
      const focusIdx = prompt.indexOf('Current Focus Point');

      expect(socraticIdx).toBeLessThan(focusIdx);
    });

    it('guidelines section appears before supplementary guidelines', () => {
      const params = buildDefaultParams({
        recallSet: makeRecallSet({
          discussionSystemPrompt: 'Extra guidelines here.',
        }),
      });
      const prompt = buildSocraticTutorPrompt(params);
      const guidelinesIdx = prompt.indexOf('## Important Guidelines');
      const supplementaryIdx = prompt.indexOf('## Supplementary guidelines');

      expect(guidelinesIdx).toBeGreaterThan(-1);
      expect(supplementaryIdx).toBeGreaterThan(-1);
      expect(guidelinesIdx).toBeLessThan(supplementaryIdx);
    });

    it('universal agent section appears before supplementary guidelines', () => {
      const params = buildDefaultParams({
        recallSet: makeRecallSet({
          discussionSystemPrompt: 'Per-set guidelines.',
        }),
      });
      const prompt = buildSocraticTutorPrompt(params);
      const agentIdx = prompt.indexOf('recall session facilitator');
      const supplementaryIdx = prompt.indexOf('## Supplementary guidelines');

      expect(agentIdx).toBeLessThan(supplementaryIdx);
    });
  });

  describe('empty session (no target points)', () => {
    it('uses universal agent framing', () => {
      const params = buildDefaultParams({
        targetPoints: [],
        uncheckedPoints: [],
        currentProbePoint: null,
      });
      const prompt = buildSocraticTutorPrompt(params);

      expect(prompt).toContain('facilitating a recall session');
    });

    it('includes the recall set name', () => {
      const params = buildDefaultParams({
        recallSet: makeRecallSet({ name: 'Quantum Mechanics' }),
        targetPoints: [],
        uncheckedPoints: [],
        currentProbePoint: null,
      });
      const prompt = buildSocraticTutorPrompt(params);

      expect(prompt).toContain('Quantum Mechanics');
    });

    it('mentions no specific recall points', () => {
      const params = buildDefaultParams({
        targetPoints: [],
        uncheckedPoints: [],
        currentProbePoint: null,
      });
      const prompt = buildSocraticTutorPrompt(params);

      expect(prompt).toContain('no specific recall points');
    });

    it('does not contain old persona text', () => {
      const params = buildDefaultParams({
        recallSet: makeRecallSet({ discussionSystemPrompt: 'You are a history teacher.' }),
        targetPoints: [],
        uncheckedPoints: [],
        currentProbePoint: null,
      });
      const prompt = buildSocraticTutorPrompt(params);

      // The old buildEmptySessionPrompt prepended discussionSystemPrompt directly.
      // The new version does NOT include it.
      expect(prompt).not.toContain('You are a history teacher.');
    });
  });

  describe('integration: full prompt with all sections', () => {
    it('produces a valid prompt with multiple target points', () => {
      const point1 = makeRecallPoint({ id: 'rp_1', content: 'Point one content' });
      const point2 = makeRecallPoint({ id: 'rp_2', content: 'Point two content' });
      const point3 = makeRecallPoint({ id: 'rp_3', content: 'Point three content' });

      const params: SocraticTutorPromptParams = {
        recallSet: makeRecallSet({
          discussionSystemPrompt: 'Use simple language for this set.',
        }),
        targetPoints: [point1, point2, point3],
        uncheckedPoints: [point2, point3],
        currentProbePoint: point2,
      };

      const prompt = buildSocraticTutorPrompt(params);

      // Universal agent section present
      expect(prompt).toContain('recall session facilitator');
      // Socratic method present
      expect(prompt).toContain('Socratic Approach');
      // Current point present
      expect(prompt).toContain('Point two content');
      // Recalled points section present (point1 was recalled)
      expect(prompt).toContain('Already Recalled Points');
      expect(prompt).toContain('Point one content');
      // Guidelines present
      expect(prompt).toContain('Important Guidelines');
      // Supplementary guidelines present
      expect(prompt).toContain('Use simple language for this set.');
      expect(prompt).toContain('<supplementary_guidelines>');
    });
  });
});
