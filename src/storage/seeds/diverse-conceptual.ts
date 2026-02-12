/**
 * Diverse Seed Data — Conceptual Knowledge (Sets 1-17)
 *
 * Psychology & Behavior (1-5), Biology & Health (6-12),
 * Math & Information Theory (13-17).
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

export const diverseConceptualSets: SeedPair[] = [
  // 1. Atomic Habits: The Habit Loop
  {
    recallSet: {
      name: 'Atomic Habits: The Habit Loop',
      description: 'The four-step habit loop and environment design for behavior change',
      status: 'active',
      discussionSystemPrompt: `You are helping the user internalize James Clear's habit loop framework. Probe whether they can name and explain each step, and discuss environment design versus willpower.`,
    },
    recallPoints: [
      {
        content: 'Every habit follows a four-step loop: cue → craving → response → reward.',
        context: "James Clear's framework. To build a habit, make each step easier; to break one, invert each step.",
      },
      {
        content: 'Environment design beats willpower for habit change — modify surroundings to make good behaviors obvious and bad ones invisible.',
        context: 'Putting your phone in another room eliminates the cue entirely. Willpower is finite; environments are persistent.',
      },
    ],
  },

  // 2. Dunning-Kruger Effect
  {
    recallSet: {
      name: 'Dunning-Kruger Effect',
      description: 'Why low competence leads to overestimation of ability',
      status: 'active',
      discussionSystemPrompt: `You are helping the user understand the Dunning-Kruger effect. Explore the meta-cognitive mechanism and ask for examples from their own experience.`,
    },
    recallPoints: [
      {
        content: 'People with low competence in a domain overestimate their ability because the skills needed to produce a correct answer are the same skills needed to recognize one.',
        context: "Kruger and Dunning, 1999. Beginners don't know what they don't know; experts underestimate theirs.",
      },
    ],
  },

  // 3. Sunk Cost Fallacy
  {
    recallSet: {
      name: 'Sunk Cost Fallacy',
      description: 'The irrationality of factoring past investment into future decisions',
      status: 'active',
      discussionSystemPrompt: `You are helping the user internalize the sunk cost fallacy. Ask them to identify the rational decision framework and generate examples.`,
    },
    recallPoints: [
      {
        content: 'Continuing a course of action because of past investment (time, money, effort) rather than evaluating future value. Past costs are irrecoverable and irrelevant to optimal decisions.',
        context: 'The rational question is always "given where I am now, is continuing the best use of my next hour/dollar?"',
      },
    ],
  },

  // 4. Dopamine & Motivation
  {
    recallSet: {
      name: 'Dopamine & Motivation',
      description: 'How dopamine drives anticipation and variable reward schedules',
      status: 'active',
      discussionSystemPrompt: `You are helping the user understand dopamine's role in motivation. Probe the distinction between wanting and liking, and explore variable reward mechanisms.`,
    },
    recallPoints: [
      {
        content: 'Dopamine drives anticipation and wanting, not pleasure itself. It spikes before a reward, not during consumption.',
        context: "Wolfram Schultz's experiments: dopamine fires at the cue predicting a reward. Better than expected → spike; worse → dip below baseline.",
      },
      {
        content: 'Variable reward schedules (unpredictable timing/magnitude) produce the highest dopamine and most compulsive behavior — the mechanism behind slot machines and social media.',
        context: "Skinner's operant conditioning. Fixed schedules produce moderate engagement; variable schedules produce intense, persistent engagement.",
      },
    ],
  },

  // 5. The Lindy Effect
  {
    recallSet: {
      name: 'The Lindy Effect',
      description: 'Why longevity predicts future survival for non-perishable things',
      status: 'active',
      discussionSystemPrompt: `You are helping the user understand the Lindy Effect. Ask them to distinguish perishable from non-perishable and generate examples.`,
    },
    recallPoints: [
      {
        content: 'For non-perishable things (ideas, technologies, books), the longer something has survived, the longer its expected remaining lifespan.',
        context: 'Taleb. A book in print for 100 years is expected to last another 100. Things that survive long-term have demonstrated robustness.',
      },
    ],
  },

  // 6. Caffeine & Adenosine
  {
    recallSet: {
      name: 'Caffeine & Adenosine',
      description: 'How caffeine blocks sleep signals and causes tolerance',
      status: 'active',
      discussionSystemPrompt: `You are helping the user understand caffeine's mechanism of action. Probe adenosine receptor blocking, tolerance, and withdrawal.`,
    },
    recallPoints: [
      {
        content: 'Caffeine blocks adenosine receptors without activating them, preventing the drowsiness signal. It masks sleep pressure rather than creating energy.',
        context: 'Adenosine still accumulates behind the blockade — you crash when caffeine wears off.',
      },
      {
        content: 'Regular use causes the brain to grow more adenosine receptors (tolerance). Withdrawal headaches occur from sudden unblocked adenosine causing vasodilation.',
        context: 'Tolerance develops in ~7-12 days; full reset takes 2-9 days of abstinence.',
      },
    ],
  },

  // 7. How Muscle Growth Works
  {
    recallSet: {
      name: 'How Muscle Growth Works',
      description: 'Microtears, protein synthesis, and optimal training frequency',
      status: 'active',
      discussionSystemPrompt: `You are helping the user understand muscle hypertrophy. Explore the mechanism of microtears, MPS timing, and training frequency implications.`,
    },
    recallPoints: [
      {
        content: 'Resistance training causes microtears in muscle fibers. Repair via protein synthesis rebuilds them thicker and stronger (hypertrophy).',
        context: 'Progressive overload is necessary — the stimulus must exceed what the muscle is adapted to.',
      },
      {
        content: 'Muscle protein synthesis peaks ~24-48 hours post-training and returns to baseline by ~72 hours, making 2-3x/week per muscle group optimal.',
        context: 'This is why full-body or upper/lower splits often outperform bro-splits for natural lifters.',
      },
    ],
  },

  // 8. Sleep & Memory Consolidation
  {
    recallSet: {
      name: 'Sleep & Memory Consolidation',
      description: 'How sleep transfers memories and why deprivation impairs learning',
      status: 'active',
      discussionSystemPrompt: `You are helping the user understand sleep's role in memory. Explore hippocampal replay during slow-wave sleep and the impact of deprivation.`,
    },
    recallPoints: [
      {
        content: 'During slow-wave sleep, the hippocampus replays the day\'s experiences at accelerated speed, transferring memories from short-term to long-term storage.',
        context: 'Learning followed by sleep produces significantly better retention than the same period awake.',
      },
      {
        content: 'Sleep deprivation reduces the brain\'s capacity to form new memories by ~40%.',
        context: 'Matthew Walker\'s research. Sleep is needed both before learning (to prepare) and after (to consolidate).',
      },
    ],
  },

  // 9. Intermittent Fasting Mechanisms
  {
    recallSet: {
      name: 'Intermittent Fasting Mechanisms',
      description: 'Insulin-driven lipolysis and autophagy during fasting',
      status: 'active',
      discussionSystemPrompt: `You are helping the user understand the metabolic mechanisms of fasting. Distinguish lipolysis from autophagy and their different timescales.`,
    },
    recallPoints: [
      {
        content: 'During fasting, insulin drops, signaling fat cells to release stored fatty acids for energy (lipolysis). This shift enhances after ~12-16 hours.',
        context: 'Insulin is the switch: high = storage mode, low = access stores. Constant snacking keeps you in permanent storage mode.',
      },
      {
        content: 'Autophagy — cellular self-cleaning where damaged proteins are broken down and recycled — is upregulated during extended fasting (24-48+ hours) via mTOR suppression and AMPK activation.',
        context: 'Ohsumi won the 2016 Nobel Prize for autophagy mechanisms. Distinct from fat-burning benefits of shorter fasts.',
      },
    ],
  },

  // 10. Sarcomere Contraction (Sliding Filament Theory)
  {
    recallSet: {
      name: 'Sarcomere Contraction (Sliding Filament Theory)',
      description: 'How actin and myosin produce muscle contraction',
      status: 'active',
      discussionSystemPrompt: `You are helping the user understand the sliding filament theory. Explore the power stroke mechanism and why eccentric contractions cause more damage.`,
    },
    recallPoints: [
      {
        content: 'Actin and myosin filaments slide past each other within sarcomeres. Myosin heads bind to actin, pivot (power stroke), release, and repeat — powered by ATP hydrolysis.',
        context: "The filaments don't shorten — they overlap more. Without ATP, myosin stays bound to actin (rigor mortis).",
      },
      {
        content: 'Eccentric contractions (lengthening under load) cause more damage than concentric, producing greater hypertrophy stimulus and more DOMS.',
        context: 'Fewer motor units are recruited eccentrically, so each active fiber bears more load. This is why you can lower more than you can lift.',
      },
    ],
  },

  // 11. Mind-Muscle Connection
  {
    recallSet: {
      name: 'Mind-Muscle Connection',
      description: 'How internal focus increases muscle activation and growth',
      status: 'active',
      discussionSystemPrompt: `You are helping the user understand the mind-muscle connection. Discuss the EMG evidence and when internal focus is most vs least effective.`,
    },
    recallPoints: [
      {
        content: 'Consciously focusing on the target muscle during exercise increases EMG activation and, over time, greater hypertrophy versus just moving the weight.',
        context: 'Schoenfeld et al. (2018). Effect diminishes at very heavy loads (>80% 1RM). Most useful for isolation exercises.',
      },
    ],
  },

  // 12. Proprioception & Balance
  {
    recallSet: {
      name: 'Proprioception & Balance',
      description: 'The body\'s position sense and how balance training improves it',
      status: 'active',
      discussionSystemPrompt: `You are helping the user understand proprioception. Explore the sensory mechanisms and why balance training prevents injury and age-related decline.`,
    },
    recallPoints: [
      {
        content: 'Proprioception is the body\'s sense of its own position in space, mediated by muscle spindles, Golgi tendon organs, and joint receptors feeding the cerebellum.',
        context: "It's how you touch your nose with your eyes closed. Alcohol impairs proprioception — hence sobriety balance tests.",
      },
      {
        content: 'Balance training improves proprioceptive acuity by strengthening neural pathways between peripheral sensors and the cerebellum, reducing injury risk.',
        context: 'Proprioception degrades with age (fall risk) and after injury (re-injury risk without balance rehab).',
      },
    ],
  },

  // 13. Central Limit Theorem
  {
    recallSet: {
      name: 'Central Limit Theorem',
      description: 'Why sample means converge to normal regardless of population shape',
      status: 'active',
      discussionSystemPrompt: `You are helping the user understand the Central Limit Theorem. Probe why it matters for statistical inference and what the n ≥ 30 rule means.`,
    },
    recallPoints: [
      {
        content: 'The distribution of sample means approaches a normal distribution as sample size increases, regardless of the population\'s distribution. Rule of thumb: n ≥ 30.',
        context: "Foundation of statistical inference — why confidence intervals and hypothesis tests work even when raw data isn't normal.",
      },
    ],
  },

  // 14. Shannon Entropy
  {
    recallSet: {
      name: 'Shannon Entropy',
      description: 'Measuring uncertainty and the compression limit',
      status: 'active',
      discussionSystemPrompt: `You are helping the user understand Shannon entropy. Explore the formula, what high vs low entropy means, and the connection to data compression.`,
    },
    recallPoints: [
      {
        content: 'Shannon entropy H = -Σ p(x) log₂ p(x) measures average uncertainty. A fair coin has H = 1 bit; a 99% biased coin has H ≈ 0.08 bits.',
        context: 'Shannon, 1948. Higher entropy = harder to predict = more information per symbol.',
      },
      {
        content: "Data compression cannot beat the entropy rate — it's the theoretical floor on compactness. Random noise has maximum entropy and is incompressible.",
        context: 'Huffman/arithmetic coding approach this limit by assigning shorter codes to more probable symbols.',
      },
    ],
  },

  // 15. Definition of a Group (Abstract Algebra)
  {
    recallSet: {
      name: 'Definition of a Group (Abstract Algebra)',
      description: 'The four group axioms and abelian vs non-abelian groups',
      status: 'active',
      discussionSystemPrompt: `You are helping the user recall the group axioms. Ask them to state all four, test with concrete examples, and distinguish abelian from non-abelian.`,
    },
    recallPoints: [
      {
        content: 'A group is a set G with operation · satisfying: closure, associativity, identity element e, and inverses for every element.',
        context: 'The group axioms capture "reversible composition" — abstracting patterns from number systems, symmetries, and permutations.',
      },
      {
        content: '(ℤ, +) is a group (identity 0, inverse -n). (ℤ, ×) is not — most integers lack a multiplicative inverse in ℤ.',
        context: 'The same set can form a group under one operation and fail under another.',
      },
      {
        content: "If the operation is also commutative (a·b = b·a), it's abelian. Matrix multiplication GL(n) is non-abelian — AB ≠ BA in general.",
        context: 'Named after Niels Henrik Abel. Most symmetry groups in physics are non-abelian.',
      },
    ],
  },

  // 16. Fractal Dimension
  {
    recallSet: {
      name: 'Fractal Dimension',
      description: 'Non-integer dimensions and the coastline paradox',
      status: 'active',
      discussionSystemPrompt: `You are helping the user understand fractal dimension. Probe the formula, the Koch snowflake example, and the coastline paradox.`,
    },
    recallPoints: [
      {
        content: 'Fractal dimension quantifies how detail changes with scale. The Koch snowflake has dimension log(4)/log(3) ≈ 1.26 — more than a line but less than a plane.',
        context: 'Formula: d = log(N)/log(S) where N = self-similar pieces and S = scaling factor.',
      },
      {
        content: 'Britain\'s coastline has fractal dimension ~1.25 — measured length increases without bound as the ruler shrinks (the "coastline paradox").',
        context: "Mandelbrot, 1967. A straight border has dimension 1.0; a coastline's fractional dimension captures its roughness.",
      },
    ],
  },

  // 17. Persistent Homology
  {
    recallSet: {
      name: 'Persistent Homology',
      description: 'Tracking topological features across scales in data',
      status: 'active',
      discussionSystemPrompt: `You are helping the user understand persistent homology. Explore filtrations, birth/death of features, and how persistence diagrams separate signal from noise.`,
    },
    recallPoints: [
      {
        content: 'Persistent homology tracks topological features (components, loops, voids) as a distance threshold increases. Features persisting across many scales are signal; short-lived ones are noise.',
        context: 'Grow balls around points in a cloud; track births and deaths of features as balls overlap and simplices form.',
      },
      {
        content: 'Persistence diagrams plot features as (birth, death) points. Far from diagonal = robust structure; near diagonal = noise.',
        context: "Finds the \"shape\" of data without assuming a model. Detects loops and voids, not just connected clusters.",
      },
    ],
  },
];
