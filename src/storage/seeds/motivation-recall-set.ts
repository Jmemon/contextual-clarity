/**
 * Motivation Recall Set Seed Data
 *
 * This seed file contains test data for a recall set focused on understanding
 * motivation, resistance, and taking action. It draws from behavioral psychology
 * and practical productivity wisdom.
 *
 * The recall points cover concepts from various sources including:
 * - Behavioral psychology research on motivation
 * - Self-Determination Theory
 * - James Clear's "Atomic Habits"
 * - The "two-minute rule" and similar productivity techniques
 *
 * Use Cases:
 * - Testing the application with realistic content
 * - Demonstrating the Socratic dialogue feature
 * - Onboarding users with a pre-built example set
 */

/**
 * Recall set metadata for the motivation topic.
 *
 * The discussionSystemPrompt is designed to create engaging Socratic dialogues
 * that help users internalize concepts about motivation and action-taking.
 */
export const motivationRecallSet = {
  /** Unique identifier for this recall set (human-readable for testing) */
  name: 'motivation',

  /** Description of what this recall set covers */
  description: 'Understanding motivation, resistance, and taking action',

  /** Set is active and ready for review sessions */
  status: 'active' as const,

  /** System prompt for AI-powered Socratic dialogues on motivation topics */
  discussionSystemPrompt: `You are helping the user internalize concepts about motivation, action, and overcoming resistance.
Draw on ideas from behavioral psychology and practical productivity wisdom.
Be conversational and relate concepts to real-world examples the user might encounter.`,
};

/**
 * Individual recall points for the motivation recall set.
 *
 * Each recall point contains:
 * - content: The core idea to be memorized and recalled
 * - context: Background information to guide Socratic discussions
 *
 * These points progress from the fundamental insight that action precedes
 * motivation, through types of motivation, resistance management, and
 * finally to identity-based behavioral change.
 */
export const motivationRecallPoints = [
  {
    /**
     * Core insight: Action precedes motivation, not vice versa.
     * This counterintuitive idea helps break the "waiting for motivation" trap.
     */
    content:
      'Action creates motivation, not the other way around. Starting is often harder than continuing.',
    context:
      'The user should understand that waiting to "feel motivated" is often counterproductive.',
  },
  {
    /**
     * Self-Determination Theory: Internal vs external motivation.
     * Understanding why intrinsic motivation leads to more sustainable behavior.
     */
    content:
      'Internal motivation (autonomy, mastery, purpose) is more sustainable than external motivation.',
    context: 'Reference Self-Determination Theory.',
  },
  {
    /**
     * Task sizing and resistance: Breaking down overwhelming work.
     * The relationship between perceived task size and procrastination.
     */
    content:
      'Resistance increases with the perceived size of a task. Breaking tasks into smaller pieces reduces resistance.',
    context: 'The "two-minute rule" and similar techniques.',
  },
  {
    /**
     * Identity-based habits from Atomic Habits.
     * Shifting from "what do I want to achieve?" to "who do I want to become?"
     */
    content:
      'Identity-based habits are more powerful than outcome-based goals.',
    context: "From James Clear's Atomic Habits.",
  },
];
