/**
 * Diverse Seed Data — Math, Philosophy, Psychology, History & Culinary (Sets 43-51)
 *
 * Math continued (43-45), Philosophy & Literature continued (46-48),
 * Psychology continued (49), History & Economics (50), Culinary (51).
 *
 * Each entry pairs a recall set with its recall points.
 * Exported as an array for the seed runner to spread into its seedSets list.
 */

interface SeedPair {
  recallSet: {
    name: string;
    description: string;
    status: 'active';
    discussionSystemPrompt: string;
  };
  recallPoints: Array<{ content: string; context: string }>;
}

export const diverseRemainingSets: SeedPair[] = [
  // 43. Gödel's Incompleteness Theorems
  {
    recallSet: {
      name: "Gödel's Incompleteness Theorems",
      description: 'Why formal systems cannot be both complete and consistent',
      status: 'active',
      discussionSystemPrompt: `You are helping the user understand Gödel's incompleteness theorems. Probe the self-referential proof structure and why the second theorem killed Hilbert's program.`,
    },
    recallPoints: [
      {
        content: 'First theorem: any consistent formal system powerful enough for arithmetic contains true statements that cannot be proven within the system.',
        context: 'Gödel constructs a self-referential statement: "this statement is not provable." If provable → inconsistent; if unprovable → true. Either way, incomplete.',
      },
      {
        content: "Second theorem: no such system can prove its own consistency. You always need a stronger system — which then can't prove its own consistency either.",
        context: "Killed Hilbert's program. Connects to the halting problem — computability and provability have the same limits.",
      },
    ],
  },

  // 44. Eigenvectors Geometrically
  {
    recallSet: {
      name: 'Eigenvectors Geometrically',
      description: 'Natural axes of transformations and PCA',
      status: 'active',
      discussionSystemPrompt: `You are helping the user understand eigenvectors geometrically. Probe what it means for a vector to only be scaled, and how PCA uses eigenvectors for dimensionality reduction.`,
    },
    recallPoints: [
      {
        content: 'An eigenvector of matrix A only gets scaled, not rotated: Av = λv. Eigenvectors reveal the "natural axes" of a linear transformation.',
        context: 'Most vectors change direction under a matrix. A 2D stretch doubling horizontally and halving vertically has eigenvectors along H and V axes (λ = 2, 0.5).',
      },
      {
        content: "PCA finds eigenvectors of the covariance matrix. The largest eigenvalue's eigenvector points in the direction of greatest variance — the most informative axis.",
        context: '1000 features → 50 principal components capturing 95% of variance. The eigenvalue tells you how much each component explains.',
      },
    ],
  },

  // 45. How the Fourier Transform Decomposes Signals
  {
    recallSet: {
      name: 'How the Fourier Transform Decomposes Signals',
      description: 'Time-to-frequency domain conversion and the FFT algorithm',
      status: 'active',
      discussionSystemPrompt: `You are helping the user understand the Fourier transform. Probe the decomposition into sine waves and why FFT's O(n log n) made modern signal processing possible.`,
    },
    recallPoints: [
      {
        content: 'The Fourier transform decomposes any signal into sine waves at different frequencies, converting time-domain to frequency-domain.',
        context: 'Fourier, 1807: any periodic function = infinite sum of sines and cosines. The transform generalizes to non-periodic signals.',
      },
      {
        content: "FFT computes the discrete Fourier transform in O(n log n) instead of O(n²). It's behind MP3, JPEG, OFDM, MRI, and speech recognition.",
        context: 'Cooley-Tukey, 1965. Without FFT, digital audio and image processing would be computationally infeasible.',
      },
    ],
  },

  // 46. Borges & The Library of Babel
  {
    recallSet: {
      name: 'Borges & The Library of Babel',
      description: 'Why containing all possible books means containing no information',
      status: 'active',
      discussionSystemPrompt: `You are helping the user understand Borges' Library of Babel. Explore the paradox: total information = no information, and what it reveals about the difference between data and knowledge.`,
    },
    recallPoints: [
      {
        content: 'The Library of Babel contains every possible 410-page book using 25 symbols — every true statement, every false one, and every gibberish string. Total information = no information.',
        context: 'If every possible book exists, finding a specific true one is impossible. A thought experiment about the difference between information and knowledge.',
      },
    ],
  },

  // 47. Negative Capability (Keats)
  {
    recallSet: {
      name: 'Negative Capability (Keats)',
      description: 'The capacity to remain in uncertainty without forcing closure',
      status: 'active',
      discussionSystemPrompt: `You are helping the user understand Keats' Negative Capability. Explore what it means to tolerate ambiguity and why Shakespeare exemplifies it.`,
    },
    recallPoints: [
      {
        content: 'Negative Capability (Keats, 1817): "being in uncertainties, mysteries, doubts, without any irritable reaching after fact and reason." The capacity to remain in ambiguity without forcing closure.',
        context: 'Keats identified Shakespeare as the example — characters embody contradictory truths without resolution. Resonates with mindfulness and creative process.',
      },
    ],
  },

  // 48. Heidegger's Ready-to-Hand vs Present-at-Hand
  {
    recallSet: {
      name: "Heidegger's Ready-to-Hand vs Present-at-Hand",
      description: 'Absorbed practical engagement vs detached theoretical observation',
      status: 'active',
      discussionSystemPrompt: `You are helping the user understand Heidegger's distinction. Probe what it means for a tool to "withdraw" in use and why breakdown reveals the present-at-hand.`,
    },
    recallPoints: [
      {
        content: '"Ready-to-hand": equipment in use withdraws from attention (a hammer used is an extension of the body). "Present-at-hand": equipment noticed as a detached object (the hammer examined when broken).',
        context: 'Primary engagement with the world is absorbed activity, not detached observation. We encounter things first as tools-in-use, not objects-with-properties.',
      },
    ],
  },

  // 49. Transference in Psychoanalysis
  {
    recallSet: {
      name: 'Transference in Psychoanalysis',
      description: 'Projected relational patterns and countertransference as diagnostic data',
      status: 'active',
      discussionSystemPrompt: `You are helping the user understand transference and countertransference. Probe how the therapist becomes a screen for projection and why the therapist's emotional reactions are diagnostic.`,
    },
    recallPoints: [
      {
        content: 'Transference: the patient unconsciously redirects relational patterns from early caregivers onto the therapist. The therapist becomes a screen for projected dynamics.',
        context: "Freud realized it wasn't an obstacle but the treatment — live reenactment provides material for insight.",
      },
      {
        content: "Countertransference: the therapist's unconscious emotional reaction to the patient. Modern practice treats it as diagnostic data — the therapist's feelings mirror what others in the patient's life feel.",
        context: 'If a therapist consistently feels bored or controlled with a patient, that likely reflects the dynamic the patient creates everywhere.',
      },
    ],
  },

  // 50. The Bretton Woods System & Its Collapse
  {
    recallSet: {
      name: 'The Bretton Woods System & Its Collapse',
      description: 'The dollar-gold peg, its collapse, and floating exchange rates',
      status: 'active',
      discussionSystemPrompt: `You are helping the user understand Bretton Woods. Probe the dollar-gold peg structure, why it collapsed (Triffin's dilemma), and what replaced it.`,
    },
    recallPoints: [
      {
        content: 'Bretton Woods (1944): USD pegged to gold at $35/oz, all major currencies pegged to USD. Created the IMF and World Bank.',
        context: '44 allied nations, near end of WWII. Goal: prevent competitive devaluations that worsened the Great Depression.',
      },
      {
        content: "Collapsed 1971 (Nixon Shock): US ended gold convertibility because reserves couldn't cover dollars held abroad. Triggered today's floating exchange rate system.",
        context: "Triffin's dilemma: US had to run deficits to supply dollars, but deficits eroded confidence in the gold backing.",
      },
    ],
  },

  // 51. How to Make a Phenomenal Beef Ragù
  {
    recallSet: {
      name: 'How to Make a Phenomenal Beef Ragù',
      description: 'Collagen-rich cuts, slow braising, and the pasta-in-sauce technique',
      status: 'active',
      discussionSystemPrompt: `You are helping the user recall the key principles of beef ragù. Probe why collagen-rich cuts matter, the braising process, and why pasta is finished in the sauce.`,
    },
    recallPoints: [
      {
        content: "Collagen-rich cuts (chuck, short rib) are essential — collagen converts to gelatin during slow braising (3+ hours), creating body that lean cuts can't produce.",
        context: 'Large chunks, hard-sear in batches for fond, deglaze with red wine. Soffritto base. Braise in wine + crushed tomato until fork-tender.',
      },
      {
        content: 'Toss pasta *in* the ragù (never sauce on top), using starchy pasta water to emulsify into a glossy glaze that clings to every strand.',
        context: 'Wide textured pasta (pappardelle, tagliatelle). Reserve pasta water before draining. Finish with Parmigiano and olive oil off heat.',
      },
    ],
  },
];
