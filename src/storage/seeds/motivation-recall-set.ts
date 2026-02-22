export const motivationRecallSet = {
  name: 'motivation',
  description: 'Understanding motivation, resistance, and taking action',
  status: 'active' as const,
  discussionSystemPrompt: `You are helping the user internalize concepts about motivation, action, and overcoming resistance.
Be conversational and relate concepts to real-world examples the user might encounter.`,
};

export const motivationRecallPoints = [
  {
    content: 'Action = intent / resistance + willpower.',
    context: 'You can increase intent by bringing to mind the action you want to take.',
  },
  {
    content: 'Resistance is an emotional blockage.',
    context: 'It feels like an electric fence.',
  },
  {
    content:
      'You get through resistance by feeling into whatever emotion is causing the blockage and observing it, then moving through it.',
    context: '',
  },
  {
    content: 'You can also get through resistance using willpower.',
    context:
      'This is less elegant and uses more energy, and doesn\'t dissolve the resistance for the future.',
  },
  {
    content:
      'Willpower is keeping the battle going, not letting the thought of doing the action leave your mind.',
    context: '',
  },
  {
    content: 'Intent is pressures, desires, values, duties.',
    context: 'Pressures and desires are external. Values and duties are internal.',
  },
];
