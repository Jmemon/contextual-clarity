import type { ResourceSeed } from './index';

export const motivationResources: ResourceSeed[] = [
  {
    recallSetName: 'motivation',
    resources: [
      {
        title: 'The Action Equation',
        type: 'article',
        content: `Action = intent / resistance + willpower.

Resistance is an emotional blockage. It feels like an electric fence.

You get through resistance by feeling into whatever emotion is causing the blockage and observing it, then moving through it.

You can also get through resistance using willpower. This is less elegant and uses more energy, and doesn't dissolve the resistance for the future.

Willpower is keeping the battle going, not letting the thought of doing the action leave your mind.

Intent is pressures, desires, values, duties. Pressures and desires are external. Values and duties are internal.`,
        url: null,
        imageData: null,
        mimeType: null,
        metadata: {},
      },
    ],
    pointLinks: [
      {
        pointContentSubstring: 'Action = intent / resistance',
        resourceTitle: 'The Action Equation',
        relevance: 'The core equation',
      },
      {
        pointContentSubstring: 'Resistance is an emotional blockage',
        resourceTitle: 'The Action Equation',
        relevance: 'What resistance is',
      },
      {
        pointContentSubstring: 'feeling into whatever emotion',
        resourceTitle: 'The Action Equation',
        relevance: 'Getting through resistance elegantly',
      },
      {
        pointContentSubstring: 'get through resistance using willpower',
        resourceTitle: 'The Action Equation',
        relevance: 'The willpower path',
      },
      {
        pointContentSubstring: 'Willpower is keeping the battle going',
        resourceTitle: 'The Action Equation',
        relevance: 'What willpower is',
      },
      {
        pointContentSubstring: 'Intent is pressures',
        resourceTitle: 'The Action Equation',
        relevance: 'Components of intent',
      },
    ],
  },
];
