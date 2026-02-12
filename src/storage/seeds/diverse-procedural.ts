/**
 * Diverse Seed Data — Philosophy, Finance, Physics, Learning, & Procedural (Sets 18-30)
 *
 * Philosophy & Literature (18-19), Finance (20), Physics & Engineering (21-22),
 * Learning Science (23), Procedural/Technical (24-30).
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

export const diverseProceduralSets: SeedPair[] = [
  // 18. Existentialism: Radical Freedom
  {
    recallSet: {
      name: 'Existentialism: Radical Freedom',
      description: "Sartre's existence precedes essence and bad faith",
      status: 'active',
      discussionSystemPrompt: `You are helping the user internalize Sartre's existentialism. Probe "existence precedes essence" and ask them to identify bad faith in everyday examples.`,
    },
    recallPoints: [
      {
        content: 'Sartre\'s "existence precedes essence" — humans have no predefined purpose. You exist first, then define yourself through choices and actions.',
        context: 'Contrasts with essentialism (a knife is designed to cut). Both liberating and terrifying — no excuses.',
      },
      {
        content: '"Bad faith" (mauvaise foi) is denying your own freedom by pretending you have no choice — hiding behind roles or determinism.',
        context: 'Acknowledging freedom means acknowledging you could always choose otherwise, even if consequences are severe.',
      },
    ],
  },

  // 19. Kafka's Metamorphosis as Alienation
  {
    recallSet: {
      name: "Kafka's Metamorphosis as Alienation",
      description: 'How the transformation externalizes pre-existing dehumanization',
      status: 'active',
      discussionSystemPrompt: `You are helping the user understand the alienation metaphor in Kafka's Metamorphosis. Explore what changes — and what doesn't — after the transformation.`,
    },
    recallPoints: [
      {
        content: "Gregor Samsa's transformation externalizes alienation he already felt as a dehumanized wage earner valued only for his income.",
        context: "The horror isn't the transformation — it's how little changes. The family already treated him as non-human; the insect body makes the metaphor literal.",
      },
    ],
  },

  // 20. Compound Interest
  {
    recallSet: {
      name: 'Compound Interest',
      description: 'Exponential growth mechanics and the Rule of 72',
      status: 'active',
      discussionSystemPrompt: `You are helping the user understand compound interest. Probe the formula, back-loaded growth, and the Rule of 72 mental math shortcut.`,
    },
    recallPoints: [
      {
        content: 'Compound interest earns interest on interest, creating exponential growth: A = P(1 + r/n)^(nt). Most growth is back-loaded — the last decade dominates.',
        context: '$10K at 7% for 30 years ≈ $76K; for 40 years ≈ $150K. Time in the market dominates all other variables.',
      },
      {
        content: 'Rule of 72: divide 72 by the annual rate to estimate doubling time. 8% → ~9 years. 12% → ~6 years.',
        context: 'Works because ln(2) ≈ 0.693. Accurate within ~1% for rates between 4-15%.',
      },
    ],
  },

  // 21. How SSDs Store Data
  {
    recallSet: {
      name: 'How SSDs Store Data',
      description: 'NAND flash cells, bit density trade-offs, and wear leveling',
      status: 'active',
      discussionSystemPrompt: `You are helping the user understand SSD storage. Explore floating-gate transistors, SLC vs QLC trade-offs, and why TRIM matters.`,
    },
    recallPoints: [
      {
        content: 'SSDs store bits by trapping electrons in floating-gate transistors. SLC = 1 bit/cell (fast, durable), TLC = 3 bits, QLC = 4 bits (cheap, less durable).',
        context: 'More bits per cell = cheaper but slower. Charge levels get harder to distinguish as you pack more bits.',
      },
      {
        content: 'Flash cells wear out after finite write cycles. The controller uses wear leveling to distribute writes; TRIM lets the OS report unused blocks.',
        context: 'SLC endures ~100K cycles, QLC ~1K. Without TRIM, unnecessary write amplification occurs.',
      },
    ],
  },

  // 22. How Vinyl Records Encode Stereo Sound
  {
    recallSet: {
      name: 'How Vinyl Records Encode Stereo Sound',
      description: 'The 45/45 groove system and RIAA equalization',
      status: 'active',
      discussionSystemPrompt: `You are helping the user understand vinyl encoding. Probe the 45/45 stereo mechanism and RIAA equalization curve.`,
    },
    recallPoints: [
      {
        content: 'Stereo vinyl uses a 45/45 system: groove walls angled at 45° encode left and right channels separately. The stylus reads both simultaneously.',
        context: 'Backwards-compatible with mono (stylus reads the lateral sum L+R). Invented by Blumlein, standardized 1958.',
      },
      {
        content: 'Vinyl "warmth" comes from even-order harmonic distortion from the physical stylus, plus RIAA equalization that shapes frequency response.',
        context: "RIAA eq boosts bass and cuts treble during cutting, reverses during playback. Digital is more accurate; vinyl's color is preference.",
      },
    ],
  },

  // 23. Spaced Repetition: The Forgetting Curve
  {
    recallSet: {
      name: 'Spaced Repetition: The Forgetting Curve',
      description: "Ebbinghaus's exponential decay and how spaced review resets it",
      status: 'active',
      discussionSystemPrompt: `You are helping the user understand the forgetting curve and spaced repetition. Probe the decay rates and why timing reviews at the point of near-forgetting is optimal.`,
    },
    recallPoints: [
      {
        content: "Ebbinghaus's forgetting curve: memory decays exponentially — ~50% forgotten within an hour, ~70% within 24 hours without review.",
        context: 'Discovered 1885. Meaningful information decays more slowly but follows the general pattern.',
      },
      {
        content: 'Each review at the point of near-forgetting resets the curve with a shallower decay rate. This is the basis of spaced repetition.',
        context: 'Spacing increases after each success: 1 day → 3 → 7 → 21 days. This is what FSRS calculates.',
      },
    ],
  },

  // 24. TypeScript Generics
  {
    recallSet: {
      name: 'TypeScript Generics',
      description: 'Type-safe polymorphism and generic constraints',
      status: 'active',
      discussionSystemPrompt: `You are helping the user understand TypeScript generics. Ask them to explain how generics differ from \`any\` and when to use constraints.`,
    },
    recallPoints: [
      {
        content: 'Generics let you write functions/types across multiple types while preserving type safety: `function identity<T>(arg: T): T` — unlike `any`, the type info is preserved.',
        context: 'Without generics, you choose between safety (separate functions per type) and flexibility (`any`). Generics give both.',
      },
      {
        content: '`extends` constrains generics: `<T extends { length: number }>` restricts to types with a `length` property.',
        context: 'Without constraints, `T` could be anything and you can\'t access properties. Common: `T extends string`, `K extends keyof T`.',
      },
    ],
  },

  // 25. Git Rebase vs Merge
  {
    recallSet: {
      name: 'Git Rebase vs Merge',
      description: 'Linear vs branching history and when to use each',
      status: 'active',
      discussionSystemPrompt: `You are helping the user understand the trade-offs between rebase and merge. Probe the golden rule of rebasing and when merge commits are preferable.`,
    },
    recallPoints: [
      {
        content: '`git rebase main` replays your commits on top of latest main, creating linear history. It rewrites hashes — never rebase pushed/shared commits.',
        context: 'Golden rule: rebase local work before sharing, never rebase shared work.',
      },
      {
        content: 'Merge commits preserve branching history and are non-destructive. Use when you want to document parallel development.',
        context: 'Merge = "railroad track" graph; rebase = straight line.',
      },
    ],
  },

  // 26. Git Reflog & Recovery
  {
    recallSet: {
      name: 'Git Reflog & Recovery',
      description: 'Using reflog to recover from destructive git operations',
      status: 'active',
      discussionSystemPrompt: `You are helping the user understand git reflog. Ask them how to find and recover "lost" commits after a reset or rebase.`,
    },
    recallPoints: [
      {
        content: '`git reflog` records every HEAD movement — commits, checkouts, rebases, resets. References persist at least 30 days even after destructive operations.',
        context: "Local only (not pushed). It's an undo history for the entire repo.",
      },
      {
        content: 'To recover "lost" commits: find the hash in reflog, then `git checkout <hash>` or `git reset --hard <hash>`.',
        context: 'Commits are only truly deleted after garbage collection (~30 days unreachable).',
      },
    ],
  },

  // 27. React Re-rendering Mental Model
  {
    recallSet: {
      name: 'React Re-rendering Mental Model',
      description: 'What triggers re-renders and referential equality pitfalls',
      status: 'active',
      discussionSystemPrompt: `You are helping the user understand React re-rendering. Probe what triggers re-renders and why referential equality matters in dependency arrays.`,
    },
    recallPoints: [
      {
        content: "A component re-renders when its state changes or when its parent re-renders. Props don't independently trigger re-renders — the parent's re-render passes new props.",
        context: 'State should live as close as possible to where it\'s used to minimize cascading re-renders.',
      },
      {
        content: 'Referential equality matters in dependency arrays: `{a:1} !== {a:1}` (different references). `useMemo`/`useCallback` stabilize references to prevent unnecessary effects.',
        context: 'Objects/arrays/functions compare by reference, not value. This is a common source of infinite loops in useEffect.',
      },
    ],
  },

  // 28. Backpropagation & Computational Graphs
  {
    recallSet: {
      name: 'Backpropagation & Computational Graphs',
      description: 'Forward pass DAGs, the chain rule backwards, and vanishing gradients',
      status: 'active',
      discussionSystemPrompt: `You are helping the user understand backpropagation. Walk through the forward pass graph, reverse-mode differentiation, and the vanishing gradient problem.`,
    },
    recallPoints: [
      {
        content: 'The forward pass builds a DAG where each node is an operation and edges carry tensors, recording everything for reverse-mode gradient computation.',
        context: 'PyTorch builds this dynamically; TensorFlow historically built it statically.',
      },
      {
        content: 'Backprop applies the chain rule backwards: each node multiplies its local gradient by the downstream gradient, computing ∂Loss/∂weight for all weights in one pass.',
        context: 'One backward pass computes all gradients simultaneously — this efficiency is why neural networks are trainable at scale.',
      },
      {
        content: 'Vanishing gradients: repeated multiplication of small derivatives through many layers shrinks gradients to near-zero. ReLU and skip connections mitigate this.',
        context: 'Sigmoid/tanh saturate where derivative → 0. Skip connections reduce the chain length. This is why ResNets can be hundreds of layers deep.',
      },
    ],
  },

  // 29. How Espresso Extraction Works
  {
    recallSet: {
      name: 'How Espresso Extraction Works',
      description: 'The 1:2 ratio, extraction diagnostics, and grind as primary lever',
      status: 'active',
      discussionSystemPrompt: `You are helping the user understand espresso extraction. Probe the standard recipe parameters and how to diagnose under- vs over-extraction.`,
    },
    recallPoints: [
      {
        content: 'Standard espresso: ~18g coffee, ~9 bars pressure, ~36g liquid in 25-30 seconds (1:2 ratio). Time is the primary diagnostic for dialing in.',
        context: 'Too fast = grind finer, too slow = grind coarser. Grind size, dose, and yield interact.',
      },
      {
        content: 'Under-extraction → sour (acids extract first); over-extraction → bitter (bitter compounds extract last). Target: ~18-22% extraction.',
        context: 'Grind size is the primary lever — finer = more surface area = faster extraction.',
      },
    ],
  },

  // 30. The Ralph Wiggum Loop
  {
    recallSet: {
      name: 'The Ralph Wiggum Loop',
      description: 'Brute-force agent iteration with failure feedback',
      status: 'active',
      discussionSystemPrompt: `You are helping the user understand the Ralph Wiggum Loop pattern. Explore why fresh context + failure feedback converges and how stochastic LLM outputs make it work.`,
    },
    recallPoints: [
      {
        content: 'A bash loop that runs a fresh agent instance against a spec, checks for completion, and retries — piping full output (failures, stack traces) back as input.',
        context: 'Geoffrey Huntley. Named for Ralph Wiggum\'s naive persistence. Unsanitized failure feedback creates a "contextual pressure cooker."',
      },
      {
        content: "Power comes from brute-force iteration with fresh context: each retry avoids context pollution but inherits the previous attempt's full output.",
        context: 'LLMs are stochastic — same prompt, different outputs. Combined with failure feedback, the loop eventually converges on a solution.',
      },
    ],
  },
];
