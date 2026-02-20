/**
 * Unit Tests: Socratic Tutor Prompt Builder
 *
 * Tests the public buildSocraticTutorPrompt() function to verify the universal
 * recall-session facilitator prompt, supplementary guidelines behavior, section
 * ordering, and empty-session edge cases. All module-private functions are tested
 * indirectly through the public API.
 *
 * T07: Updated to reflect the tone overhaul — new Socratic approach section,
 * new guidelines section, removed "Encourage elaboration" / "Celebrate recall",
 * and added "I RECALL NOTHING" and "HANDLING EVALUATOR OBSERVATIONS" sections.
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
    it('universal agent section appears before Socratic approach section', () => {
      const prompt = buildSocraticTutorPrompt(buildDefaultParams());
      const agentIdx = prompt.indexOf('recall session facilitator');
      // T07: section heading changed from "Your Socratic Approach" to "Your approach"
      const socraticIdx = prompt.indexOf('## Your approach');

      expect(agentIdx).toBeGreaterThan(-1);
      expect(socraticIdx).toBeGreaterThan(-1);
      expect(agentIdx).toBeLessThan(socraticIdx);
    });

    it('Socratic approach section appears before current focus point', () => {
      const prompt = buildSocraticTutorPrompt(buildDefaultParams());
      // T07: section heading changed from "Your Socratic Approach" to "Your approach"
      const socraticIdx = prompt.indexOf('## Your approach');
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
      // T07: section heading changed from "## Important Guidelines" to "## Guidelines"
      const guidelinesIdx = prompt.indexOf('## Guidelines');
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

  // ---------------------------------------------------------------------------
  // T07: New Socratic approach section content
  // ---------------------------------------------------------------------------

  describe('T07: Socratic approach section (new content)', () => {
    it('contains "Ask, don\'t tell"', () => {
      const prompt = buildSocraticTutorPrompt(buildDefaultParams());
      expect(prompt).toContain("Ask, don't tell");
    });

    it('contains "Direct but warm" tone spec', () => {
      const prompt = buildSocraticTutorPrompt(buildDefaultParams());
      expect(prompt).toContain('Direct but warm');
    });

    it('contains the knowledgeable friend coffee shop reference', () => {
      const prompt = buildSocraticTutorPrompt(buildDefaultParams());
      expect(prompt).toContain('knowledgeable friend at a coffee shop');
    });

    it('contains "move on" instruction after recall', () => {
      const prompt = buildSocraticTutorPrompt(buildDefaultParams());
      expect(prompt).toContain('When a point is recalled, move on');
    });

    it('does NOT contain "Encourage elaboration"', () => {
      const prompt = buildSocraticTutorPrompt(buildDefaultParams());
      expect(prompt).not.toContain('Encourage elaboration');
    });

    it('does NOT contain "Celebrate recall"', () => {
      const prompt = buildSocraticTutorPrompt(buildDefaultParams());
      expect(prompt).not.toContain('Celebrate recall');
    });

    it('does NOT contain "encouraging feedback"', () => {
      const prompt = buildSocraticTutorPrompt(buildDefaultParams());
      expect(prompt).not.toContain('encouraging feedback');
    });

    it('does NOT use the word "learner" in the Socratic approach and tone sections', () => {
      const prompt = buildSocraticTutorPrompt(buildDefaultParams());
      // Only check sections 2 (Socratic approach + tone) and 5 (Guidelines) —
      // the T07-owned sections. Section 3 (buildCurrentPointSection) is T01's
      // territory and may still contain "learner".
      const socraticStart = prompt.indexOf('## Your approach');
      const currentFocusStart = prompt.indexOf('## Current Focus Point');

      // Extract the approach+tone section (between "## Your approach" and "## Current Focus Point")
      const approachSection = prompt.slice(socraticStart, currentFocusStart);
      expect(approachSection).not.toContain('learner');
    });

    it('does NOT use the word "learner" in the Guidelines section', () => {
      const prompt = buildSocraticTutorPrompt(buildDefaultParams());
      // Extract the Guidelines section (between "## Guidelines" and end or "## Supplementary")
      const guidelinesStart = prompt.indexOf('## Guidelines');
      const supplementaryIdx = prompt.indexOf('## Supplementary guidelines');
      const endIdx = supplementaryIdx > -1 ? supplementaryIdx : prompt.length;

      const guidelinesSection = prompt.slice(guidelinesStart, endIdx);
      expect(guidelinesSection).not.toContain('learner');
    });
  });

  // ---------------------------------------------------------------------------
  // T07: New guidelines section content
  // ---------------------------------------------------------------------------

  describe('T07: Guidelines section (new content)', () => {
    it('contains "1-3 sentences" response length constraint', () => {
      const prompt = buildSocraticTutorPrompt(buildDefaultParams());
      expect(prompt).toContain('1-3 sentences');
    });

    it('contains "Don\'t congratulate" rule', () => {
      const prompt = buildSocraticTutorPrompt(buildDefaultParams());
      expect(prompt).toContain("Don't congratulate");
    });

    it('contains "no exclamation marks" rule', () => {
      const prompt = buildSocraticTutorPrompt(buildDefaultParams());
      expect(prompt).toContain('exclamation marks');
    });

    it('contains "Don\'t use bullet points" rule', () => {
      const prompt = buildSocraticTutorPrompt(buildDefaultParams());
      expect(prompt).toContain("Don't use bullet points");
    });

    it('contains the "I RECALL NOTHING" handling section', () => {
      const prompt = buildSocraticTutorPrompt(buildDefaultParams());
      expect(prompt).toContain('HANDLING "I RECALL NOTHING"');
    });

    it('contains the "HANDLING EVALUATOR OBSERVATIONS" section', () => {
      const prompt = buildSocraticTutorPrompt(buildDefaultParams());
      expect(prompt).toContain('HANDLING EVALUATOR OBSERVATIONS');
    });

    it('contains the no meta-commentary rule', () => {
      const prompt = buildSocraticTutorPrompt(buildDefaultParams());
      expect(prompt).toContain('NEVER respond with meta-commentary');
    });

    it('has at least 6 DON\'T prohibitions', () => {
      const prompt = buildSocraticTutorPrompt(buildDefaultParams());
      // Count lines starting with "- Don't" in the DON'T block
      const dontMatches = prompt.match(/- Don't/g);
      expect(dontMatches).not.toBeNull();
      expect(dontMatches!.length).toBeGreaterThanOrEqual(6);
    });

    it('instructs not to reference the evaluator to the user', () => {
      const prompt = buildSocraticTutorPrompt(buildDefaultParams());
      expect(prompt).toContain('Never reference the evaluator or the evaluation system to the user');
    });
  });

  // ---------------------------------------------------------------------------
  // T07: Removed content verification
  // ---------------------------------------------------------------------------

  describe('T07: Removed content no longer present', () => {
    it('does not contain "Important Guidelines" heading (old heading)', () => {
      const prompt = buildSocraticTutorPrompt(buildDefaultParams());
      expect(prompt).not.toContain('## Important Guidelines');
    });

    it('does not contain "Your Socratic Approach" heading (old heading)', () => {
      const prompt = buildSocraticTutorPrompt(buildDefaultParams());
      expect(prompt).not.toContain('## Your Socratic Approach');
    });

    it('does not contain "Provide encouraging feedback"', () => {
      const prompt = buildSocraticTutorPrompt(buildDefaultParams());
      expect(prompt).not.toContain('Provide encouraging feedback');
    });

    it('does not contain "Adapt your language complexity"', () => {
      const prompt = buildSocraticTutorPrompt(buildDefaultParams());
      expect(prompt).not.toContain('Adapt your language complexity');
    });
  });

  // ---------------------------------------------------------------------------
  // Integration test
  // ---------------------------------------------------------------------------

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
      // T07: New Socratic approach section present
      expect(prompt).toContain('## Your approach');
      expect(prompt).toContain("Ask, don't tell");
      expect(prompt).toContain('Direct but warm');
      // Current point present
      expect(prompt).toContain('Point two content');
      // Recalled points section present (point1 was recalled)
      expect(prompt).toContain('Already Recalled Points');
      expect(prompt).toContain('Point one content');
      // T07: New guidelines section present
      expect(prompt).toContain('## Guidelines');
      expect(prompt).toContain('1-3 sentences');
      expect(prompt).toContain('HANDLING EVALUATOR OBSERVATIONS');
      // Supplementary guidelines present
      expect(prompt).toContain('Use simple language for this set.');
      expect(prompt).toContain('<supplementary_guidelines>');
    });
  });
});
