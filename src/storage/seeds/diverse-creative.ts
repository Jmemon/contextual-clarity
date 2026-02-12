/**
 * Diverse Seed Data — Creative, Science & Specialized (Sets 31-42)
 *
 * Creative/Design (31-32), Music Theory (33), Ecology (34),
 * Yoga & Breathwork (35), AI & ML (36-37), Databases & Infrastructure (38-39),
 * Neuroscience (40), Drawing & Visual Art (41-42).
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

export const diverseCreativeSets: SeedPair[] = [
  // 31. The Rule of Thirds in Composition
  {
    recallSet: {
      name: 'The Rule of Thirds in Composition',
      description: 'Using a 3×3 grid for dynamic visual compositions',
      status: 'active',
      discussionSystemPrompt: `You are helping the user understand the rule of thirds. Ask them how placement along grid lines creates dynamic tension and when centering works instead.`,
    },
    recallPoints: [
      {
        content: 'Divide the frame into a 3×3 grid. Placing subjects along lines or at intersections creates more dynamic compositions than centering.',
        context: 'Breaking this rule works when symmetry is intentional.',
      },
    ],
  },

  // 32. Color Temperature in Lighting
  {
    recallSet: {
      name: 'Color Temperature in Lighting',
      description: 'Kelvin scale, warm vs cool light, and circadian effects',
      status: 'active',
      discussionSystemPrompt: `You are helping the user understand color temperature. Probe the Kelvin scale, warm vs cool associations, and melatonin suppression.`,
    },
    recallPoints: [
      {
        content: 'Color temperature in Kelvin: warm (~2700K) is yellow-orange/intimate, cool (~5000-6500K) is blue-white/alert. Directly affects circadian rhythm and mood.',
        context: 'Blue-rich cool light suppresses melatonin; warm light supports natural melatonin onset.',
      },
    ],
  },

  // 33. Why Minor Keys Sound Sad
  {
    recallSet: {
      name: 'Why Minor Keys Sound Sad',
      description: 'The flattened third and variants of the minor scale',
      status: 'active',
      discussionSystemPrompt: `You are helping the user understand minor tonality. Probe the interval difference between major and minor thirds, and the emotional qualities of natural, harmonic, and melodic minor.`,
    },
    recallPoints: [
      {
        content: 'The minor scale\'s defining feature is a flattened third — 3 semitones (minor third) instead of 4 (major third). This smaller interval creates a "darker" quality.',
        context: 'Major third (5:4 ratio) is more consonant than minor third (6:5). Whether the sad association is psychoacoustic or cultural is debated.',
      },
      {
        content: 'Minor keys also flatten the 6th and 7th degrees (natural minor). Harmonic minor raises the 7th, adding urgency; melodic minor raises both 6th and 7th ascending.',
        context: 'Natural minor feels resigned, harmonic minor dramatic, melodic minor bittersweet.',
      },
    ],
  },

  // 34. How Mushroom Mycelium Networks Work
  {
    recallSet: {
      name: 'How Mushroom Mycelium Networks Work',
      description: 'Hyphal decomposition and the mycorrhizal "wood wide web"',
      status: 'active',
      discussionSystemPrompt: `You are helping the user understand mycelium. Distinguish the mycelial network from the fruiting body, and explore the mycorrhizal symbiosis with trees.`,
    },
    recallPoints: [
      {
        content: 'Mycelium is a network of thread-like hyphae that decomposes organic matter by secreting enzymes externally and absorbing nutrients. The mushroom is just the fruiting body.',
        context: "A single honey fungus in Oregon covers 2,385 acres — one of Earth's largest organisms.",
      },
      {
        content: 'Mycorrhizal fungi form the "wood wide web" — symbiosis where fungus provides trees water/phosphorus and trees provide carbon/sugars. Trees can transfer nutrients to each other through the network.',
        context: 'Suzanne Simard showed "mother trees" send carbon to struggling seedlings through these connections.',
      },
    ],
  },

  // 35. Ujjayi Breath & Vagal Tone
  {
    recallSet: {
      name: 'Ujjayi Breath & Vagal Tone',
      description: 'Glottal constriction, vagus nerve stimulation, and HRV',
      status: 'active',
      discussionSystemPrompt: `You are helping the user understand ujjayi pranayama. Probe the physiological mechanism — glottal constriction, extended exhale, vagal tone — and how HRV measures it.`,
    },
    recallPoints: [
      {
        content: 'Ujjayi involves constricting the glottis, creating an "ocean" sound that slows breathing and extends the exhale — stimulating the vagus nerve toward parasympathetic dominance.',
        context: "Longer exhales increase vagal tone and lower heart rate. It's a physiological brake, not just a mental one.",
      },
      {
        content: 'Vagal tone (measured by HRV) indicates parasympathetic strength. Higher HRV = greater stress resilience. Regular breathwork increases resting HRV over time.',
        context: 'Slow breathing at ~6 breaths/minute maximizes HRV by synchronizing with the baroreflex.',
      },
    ],
  },

  // 36. How LLM Tokenization Works
  {
    recallSet: {
      name: 'How LLM Tokenization Works',
      description: 'Byte Pair Encoding and why token count matters',
      status: 'active',
      discussionSystemPrompt: `You are helping the user understand LLM tokenization. Probe BPE merge rules, why token ≠ word, and the efficiency gap for non-English languages.`,
    },
    recallPoints: [
      {
        content: 'LLMs split text into tokens via Byte Pair Encoding: start with characters, iteratively merge the most frequent pair until reaching target vocab size (~100K for GPT-4).',
        context: 'Common words become single tokens; rare words split into subwords. This handles misspellings and neologisms.',
      },
      {
        content: 'Token count ≠ word count (~1 token ≈ ¾ word in English). Context windows and pricing are measured in tokens. Non-English text tokenizes less efficiently.',
        context: 'Less efficient tokenization means LLMs are effectively less capable in non-English — more context consumed per concept.',
      },
    ],
  },

  // 37. Superposition & Mechanistic Interpretability
  {
    recallSet: {
      name: 'Superposition & Mechanistic Interpretability',
      description: 'Polysemantic neurons, sparse autoencoders, and circuit-level analysis',
      status: 'active',
      discussionSystemPrompt: `You are helping the user understand superposition and mechanistic interpretability. Probe why neurons are polysemantic, how SAEs extract features, and what circuits are.`,
    },
    recallPoints: [
      {
        content: 'Superposition: networks represent more features than dimensions by encoding concepts in overlapping, near-orthogonal patterns. Individual neurons are polysemantic (multiple unrelated features).',
        context: 'Works because most features are sparse (rarely active), so interference is tolerable.',
      },
      {
        content: 'Sparse autoencoders decompose internal activations into interpretable features by training an overcomplete autoencoder with a sparsity penalty on the residual stream.',
        context: "Anthropic's research: SAE features can steer model behavior — amplify or suppress concepts at inference time.",
      },
      {
        content: 'Mechanistic interpretability reverse-engineers networks into circuits — small subgraphs implementing specific behaviors. Goal: move from "what" (behavioral testing) to "how" (internal mechanism).',
        context: 'Key finding: induction heads implement in-context learning. Matters for safety — detect deception or bias before deployment.',
      },
    ],
  },

  // 38. How B-Tree Indexes Work
  {
    recallSet: {
      name: 'How B-Tree Indexes Work',
      description: 'O(log n) lookups and B+ tree range query optimization',
      status: 'active',
      discussionSystemPrompt: `You are helping the user understand B-tree indexes. Probe lookup complexity, the B+ tree leaf chain for range queries, and the read/write trade-off.`,
    },
    recallPoints: [
      {
        content: 'B-tree: self-balancing tree with sorted keys per node. Lookups are O(log n) — 1 billion rows needs only 3-4 disk reads.',
        context: 'Without an index, the database scans every row (O(n)). All leaf nodes at the same depth ensures consistent performance.',
      },
      {
        content: 'B+ trees (used by SQLite, Postgres, MySQL) store data pointers only in leaf nodes, linked in a chain — making range queries efficient via leaf-to-leaf traversal.',
        context: 'Indexes speed reads but slow writes (every INSERT/UPDATE must also update the index).',
      },
    ],
  },

  // 39. How Docker Containers Actually Isolate
  {
    recallSet: {
      name: 'How Docker Containers Actually Isolate',
      description: 'Linux namespaces, cgroups, and the layered filesystem',
      status: 'active',
      discussionSystemPrompt: `You are helping the user understand container isolation. Probe the difference from VMs, what namespaces provide, and how cgroups enforce resource limits.`,
    },
    recallPoints: [
      {
        content: "Containers share the host kernel. Isolation comes from Linux namespaces (PID, network, mount, user) — each container gets its own view of processes, network, and filesystem.",
        context: "A container's PID 1 is only PID 1 inside its namespace; on the host it has a different PID.",
      },
      {
        content: 'Resource limits via cgroups (CPU, memory, I/O). Layered filesystem (overlay2) stacks read-only image layers with a thin writable layer — images are immutable, containers start instantly.',
        context: 'Layers are shared between containers using the same base image. The writable layer is discarded on stop unless volumes are used.',
      },
    ],
  },

  // 40. The Gut-Brain Axis
  {
    recallSet: {
      name: 'The Gut-Brain Axis',
      description: 'Bidirectional gut-CNS communication and microbiome effects on mood',
      status: 'active',
      discussionSystemPrompt: `You are helping the user understand the gut-brain axis. Probe vagus nerve communication, gut serotonin production, and how microbiome composition affects mood.`,
    },
    recallPoints: [
      {
        content: "The gut-brain axis: bidirectional communication between 100M+ gut neurons and the CNS via the vagus nerve. ~95% of the body's serotonin is produced in the gut.",
        context: 'The enteric nervous system operates independently of the CNS. GI symptoms frequently accompany anxiety and depression.',
      },
      {
        content: 'Microbiome composition directly influences mood. Germ-free mice show exaggerated stress responses that normalize with specific Lactobacillus strains.',
        context: 'Diet changes can shift microbiome composition within days. "Gut feelings" are more than metaphor — interoceptive signals genuinely inform emotional processing.',
      },
    ],
  },

  // 41. Contour Drawing & Negative Space
  {
    recallSet: {
      name: 'Contour Drawing & Negative Space',
      description: 'Bypassing symbolic processing to draw what you actually see',
      status: 'active',
      discussionSystemPrompt: `You are helping the user understand perceptual drawing techniques. Probe how blind contour and negative space bypass the brain's symbolic system.`,
    },
    recallPoints: [
      {
        content: "Blind contour drawing — drawing without looking at the paper — bypasses the brain's symbolic system and engages direct perceptual processing.",
        context: 'Betty Edwards\' framework. The symbolic brain draws what it "knows"; blind contour trains you to draw what you actually see.',
      },
      {
        content: "Drawing negative space (shapes around/between objects) produces accurate proportions because the brain has no symbolic template for empty space.",
        context: "Draw the air between a chair's legs and the chair emerges accurately. The brain can't interfere with shapes it has no schema for.",
      },
    ],
  },

  // 42. How Chiaroscuro Creates Depth
  {
    recallSet: {
      name: 'How Chiaroscuro Creates Depth',
      description: 'Using light-dark contrast to model 3D form',
      status: 'active',
      discussionSystemPrompt: `You are helping the user understand chiaroscuro. Explore how value range creates the illusion of volume and why it's more powerful than color or line for depth.`,
    },
    recallPoints: [
      {
        content: 'Chiaroscuro uses strong light-dark contrasts to model 3D form on a flat surface by simulating how light wraps around volume.',
        context: "Caravaggio's tenebrism: figures from near-total darkness. Value range (lightest to darkest) creates volume illusion more effectively than color or line.",
      },
    ],
  },
];
