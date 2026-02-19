/**
 * Source Resources — Motivation Recall Set
 *
 * Source material backing the "motivation" recall set, which covers
 * action-motivation relationship, Self-Determination Theory, resistance
 * management, and identity-based habits.
 *
 * Integration points for these resources (handled by other tasks):
 * - T02: Tutor agent receives resource titles in system prompt
 * - T09: Rabbit hole agent receives full resource content
 * - T13: show_image event displays image resources in session
 */

import type { ResourceSeed } from './index';

export const motivationResources: ResourceSeed[] = [
  {
    recallSetName: 'motivation',
    resources: [
      {
        title: 'Understanding Motivation: From Action to Identity',
        type: 'article',
        content: `One of the most counterintuitive findings in behavioral psychology is that action creates motivation, not the other way around. Many people wait until they "feel motivated" before starting a task, but research consistently shows that the act of starting is what generates the motivational state. Starting is often harder than continuing — once you begin, momentum and engagement sustain effort that felt impossible moments before. This phenomenon is closely related to the Zeigarnik effect, where incomplete tasks create psychological tension that drives continuation.

Self-Determination Theory, developed by Deci and Ryan, identifies three core psychological needs that fuel sustainable motivation: autonomy (the sense of choice and volition), mastery (the drive to improve and develop competence), and purpose (connecting effort to meaningful goals). Internal motivation arising from these needs is fundamentally more sustainable than external motivation driven by rewards, punishments, or social pressure. External motivators can actually undermine intrinsic interest — a phenomenon called the overjustification effect.

Resistance — the internal force opposing productive action — increases with the perceived size of a task. When a project feels overwhelming, the brain's threat-detection systems activate, creating avoidance behavior indistinguishable from fear. Breaking tasks into smaller pieces reduces resistance dramatically. The "two-minute rule" exploits this: if the first step takes under two minutes, you bypass the resistance threshold entirely. The goal is not to complete the task in two minutes but to overcome the starting friction.

James Clear's concept of identity-based habits represents a deeper layer of motivation. Rather than setting outcome-based goals ("I want to lose 20 pounds"), identity-based habits frame behavior in terms of who you want to become ("I am someone who moves their body daily"). This shift is powerful because identity drives behavior unconsciously — every action becomes a vote for the type of person you wish to be. Outcome-based goals create a finish line after which motivation evaporates; identity-based habits create a permanent orientation toward growth.`,
        url: null,
        imageData: null,
        mimeType: null,
        metadata: {
          author: 'Contextual Clarity',
          sources: 'Deci & Ryan SDT; James Clear Atomic Habits; Zeigarnik Effect research',
          wordCount: '290',
        },
      },
    ],
    pointLinks: [
      {
        pointContentSubstring: 'Action creates motivation',
        resourceTitle: 'Understanding Motivation: From Action to Identity',
        relevance: 'Contains the action-before-motivation insight and Zeigarnik effect context',
      },
      {
        pointContentSubstring: 'Internal motivation',
        resourceTitle: 'Understanding Motivation: From Action to Identity',
        relevance: 'Covers Self-Determination Theory: autonomy, mastery, purpose',
      },
      {
        pointContentSubstring: 'Resistance increases',
        resourceTitle: 'Understanding Motivation: From Action to Identity',
        relevance: 'Explains resistance mechanics and the two-minute rule',
      },
      {
        pointContentSubstring: 'Identity-based habits',
        resourceTitle: 'Understanding Motivation: From Action to Identity',
        relevance: 'Covers identity-based habits versus outcome-based goals',
      },
    ],
  },
];
