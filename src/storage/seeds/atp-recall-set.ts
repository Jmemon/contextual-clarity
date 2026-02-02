/**
 * ATP Recall Set Seed Data
 *
 * This seed file contains test data for a recall set focused on ATP
 * (Adenosine Triphosphate) and cellular energy transfer fundamentals.
 * It covers basic biochemistry concepts in an accessible way.
 *
 * The recall points explain:
 * - How ATP stores and releases energy
 * - The metabolic pathways that regenerate ATP
 * - The remarkable turnover rate of ATP in the human body
 *
 * Use Cases:
 * - Testing the application with scientific content
 * - Demonstrating how the system handles technical material
 * - Example of using analogies in the discussion prompt
 */

/**
 * Recall set metadata for the ATP topic.
 *
 * The discussionSystemPrompt emphasizes using analogies to make
 * biochemistry accessible, connecting molecular concepts to
 * observable biological phenomena the user can relate to.
 */
export const atpRecallSet = {
  /** Unique identifier for this recall set (human-readable for testing) */
  name: 'atp',

  /** Description of what this recall set covers */
  description: 'ATP and cellular energy transfer fundamentals',

  /** Set is active and ready for review sessions */
  status: 'active' as const,

  /** System prompt for AI-powered Socratic dialogues on ATP topics */
  discussionSystemPrompt: `You are helping the user understand ATP and cellular energy mechanisms.
Use analogies to make biochemistry accessible.
Connect molecular concepts to observable biological phenomena.`,
};

/**
 * Individual recall points for the ATP recall set.
 *
 * Each recall point contains:
 * - content: The core biochemistry concept to be memorized
 * - context: Specific details and numbers to support discussions
 *
 * These points cover the essential facts about ATP: what it does,
 * how it's made, and the scale at which it operates in the body.
 */
export const atpRecallPoints = [
  {
    /**
     * ATP as an energy currency: The mechanism of energy storage and release.
     * The phosphate bond hydrolysis is the fundamental energy transfer mechanism.
     */
    content:
      'ATP stores and transfers energy through the breaking of its phosphate bonds.',
    context: 'High-energy bond releases ~7.3 kcal/mol when hydrolyzed to ADP.',
  },
  {
    /**
     * ATP regeneration pathways: The three major metabolic processes.
     * Understanding how these pathways work together sequentially.
     */
    content:
      'Cells regenerate ATP through glycolysis, citric acid cycle, and oxidative phosphorylation.',
    context: 'These pathways work together in sequence.',
  },
  {
    /**
     * ATP turnover: The remarkable recycling efficiency of the body.
     * This surprising fact illustrates why continuous regeneration is essential.
     */
    content:
      'ATP is not stored in large quantities; the body recycles its weight in ATP daily.',
    context: 'Human body contains ~250g ATP but recycles 40-75 kg daily.',
  },
];
