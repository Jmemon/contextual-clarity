export const atpRecallSet = {
  name: 'atp',
  description: 'ATP and cellular energy transfer',
  status: 'active' as const,
  discussionSystemPrompt: `You are helping the user understand ATP and cellular energy mechanisms.
Use analogies to make biochemistry accessible.`,
};

export const atpRecallPoints = [
  {
    content:
      'ATP stores and transfers energy through the breaking of its phosphate bonds.',
    context: 'The phosphates are used to do cellular work.',
  },
];
