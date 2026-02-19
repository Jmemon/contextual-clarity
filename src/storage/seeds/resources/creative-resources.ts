/**
 * Source Resources — Diverse Creative Recall Sets (Sets 31-42)
 *
 * Source material for all 12 creative recall sets covering design, music,
 * ecology, breathwork, AI/ML, databases, infrastructure, neuroscience,
 * and visual art. Includes image resources for visual sets.
 *
 * Integration points for these resources (handled by other tasks):
 * - T02: Tutor agent receives resource titles in system prompt
 * - T09: Rabbit hole agent receives full resource content
 * - T13: show_image event displays image resources in session
 */

import type { ResourceSeed } from './index';

export const creativeResources: ResourceSeed[] = [
  // 31. The Rule of Thirds in Composition
  {
    recallSetName: 'The Rule of Thirds in Composition',
    resources: [
      {
        title: 'The Rule of Thirds: Dynamic Visual Composition',
        type: 'article',
        content: `The rule of thirds is one of the most widely used compositional guidelines in photography, painting, and cinematography. The principle is simple: divide the frame into a 3x3 grid of nine equal rectangles by placing two equally spaced horizontal lines and two equally spaced vertical lines. Placing the primary subject along one of these lines — or better, at one of the four intersections — creates a more dynamic and visually engaging composition than centering the subject.

The mechanism is perceptual. A centered subject creates a static, symmetrical composition. Placing it off-center introduces visual tension and creates relationships between the subject and the surrounding negative space. The viewer's eye is drawn naturally to the intersection points, making subjects placed there feel intentionally and pleasingly positioned. Landscape photographers often place the horizon along the upper or lower third line rather than splitting the frame in half, allocating more visual weight to either the sky or the foreground.

Breaking the rule is effective when symmetry is the intentional artistic statement — formal architectural photography, reflections, or when conveying stillness and order. The rule of thirds is a starting point, not a constraint. Its power lies in training the eye to see dynamic relationships within the frame rather than defaulting to the center.`,
        url: null,
        imageData: null,
        mimeType: null,
        metadata: {
          author: 'Contextual Clarity',
          sources: 'John Thomas Smith, 1797, Remarks on Rural Scenery; general photography theory',
          wordCount: '205',
        },
      },
      {
        title: 'Rule of Thirds Grid Overlay Example',
        type: 'image',
        content: null,
        url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f0/RuleOfThirds-SideBySide.gif/640px-RuleOfThirds-SideBySide.gif',
        imageData: null,
        mimeType: 'image/gif',
        metadata: {
          license: 'CC BY-SA 3.0',
          source: 'Wikimedia Commons',
          description: 'Side-by-side comparison showing a centered vs rule-of-thirds composition with grid overlay',
        },
      },
    ],
  },

  // 32. Color Temperature in Lighting
  {
    recallSetName: 'Color Temperature in Lighting',
    resources: [
      {
        title: 'Color Temperature: The Kelvin Scale and Circadian Effects',
        type: 'article',
        content: `Color temperature measures the hue of a light source along a warm-to-cool spectrum, expressed in degrees Kelvin (K). Counterintuitively, lower Kelvin values indicate warmer colors and higher values indicate cooler colors. At approximately 2700K, light appears yellow-orange, evoking warmth, intimacy, and relaxation — the color of candles and incandescent bulbs. At 5000 to 6500K, light is blue-white, creating an alert, energizing atmosphere similar to midday sunlight.

The physiological impact of color temperature is mediated through the circadian rhythm. Specialized retinal ganglion cells containing the photopigment melanopsin are most sensitive to blue-rich light in the 460-480 nanometer wavelength range. When these cells detect blue-rich cool light, they signal the suprachiasmatic nucleus to suppress melatonin production, promoting wakefulness. Warm light, which contains less blue spectrum energy, does not significantly suppress melatonin and supports the body's natural sleep onset process.

This has practical implications for lighting design. Cool white light (5000K+) in workspaces promotes alertness and focus. Warm light (2700-3000K) in living spaces and bedrooms supports relaxation and healthy sleep patterns. Exposure to cool, blue-rich light from screens and LED fixtures in the evening disrupts circadian timing and delays sleep onset. Many devices now include "night shift" modes that reduce blue light emission, shifting the display toward warmer color temperatures after sunset.`,
        url: null,
        imageData: null,
        mimeType: null,
        metadata: {
          author: 'Contextual Clarity',
          sources: 'Brainard et al., 2001; Czeisler et al., 1995; IES Lighting Handbook',
          wordCount: '225',
        },
      },
      {
        title: 'Color Temperature Kelvin Scale',
        type: 'image',
        content: null,
        url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/ba/PlanckianLocus.png/640px-PlanckianLocus.png',
        imageData: null,
        mimeType: 'image/png',
        metadata: {
          license: 'Public Domain',
          source: 'Wikimedia Commons',
          description: 'Planckian locus showing the color temperature spectrum from warm (low K) to cool (high K)',
        },
      },
    ],
  },

  // 33. Why Minor Keys Sound Sad
  {
    recallSetName: 'Why Minor Keys Sound Sad',
    resources: [
      {
        title: 'Minor Tonality: The Flattened Third and Scale Variants',
        type: 'article',
        content: `The distinction between major and minor tonality centers on one interval: the third degree of the scale. A major third spans 4 semitones (frequency ratio approximately 5:4), while a minor third spans only 3 semitones (ratio approximately 6:5). This smaller interval is the defining characteristic of the minor scale, and it creates what listeners in Western music traditions consistently describe as a "darker," "sadder," or more introspective quality compared to the brightness of the major scale. Whether this association is psychoacoustic (rooted in the physics of the intervals) or culturally learned is still debated, though cross-cultural studies suggest some universal component.

The minor scale comes in three variants, each with a distinct emotional character. The natural minor scale flattens the 3rd, 6th, and 7th degrees relative to major, creating a resigned, settled quality. The harmonic minor scale raises the 7th degree back to its major position, creating a characteristic augmented second interval between the 6th and 7th that sounds dramatic and urgent — commonly heard in Middle Eastern and Eastern European music. The melodic minor scale raises both the 6th and 7th degrees when ascending (for smoother voice leading) and reverts to natural minor when descending. Its ascending form has a bittersweet quality — almost major but not quite. These variants give composers a rich palette of emotional nuances within the broader "minor key" category.`,
        url: null,
        imageData: null,
        mimeType: null,
        metadata: {
          author: 'Contextual Clarity',
          sources: 'Temperley, The Cognition of Basic Musical Structures; Huron, Sweet Anticipation',
          wordCount: '230',
        },
      },
    ],
    pointLinks: [
      {
        pointContentSubstring: 'flattened third',
        resourceTitle: 'Minor Tonality: The Flattened Third and Scale Variants',
        relevance: 'Explains the 3 vs 4 semitone interval difference and frequency ratios',
      },
      {
        pointContentSubstring: 'Minor keys also flatten the 6th and 7th',
        resourceTitle: 'Minor Tonality: The Flattened Third and Scale Variants',
        relevance: 'Covers natural, harmonic, and melodic minor variants with emotional qualities',
      },
    ],
  },

  // 34. How Mushroom Mycelium Networks Work
  {
    recallSetName: 'How Mushroom Mycelium Networks Work',
    resources: [
      {
        title: 'Mycelium Networks: Decomposition and the Wood Wide Web',
        type: 'article',
        content: `Mycelium is the vegetative body of a fungus, consisting of a vast network of thread-like filaments called hyphae. Each hypha is only a few micrometers in diameter, but collectively they can span enormous areas — a single honey fungus (Armillaria ostoyae) in Oregon's Blue Mountains covers 2,385 acres, making it one of Earth's largest living organisms. The mushroom that appears above ground is merely the fruiting body, analogous to an apple on a tree. The true organism is the underground mycelial network.

Mycelium functions as nature's primary decomposer. Hyphae secrete digestive enzymes externally (exoenzymes) that break down complex organic matter — cellulose, lignin, chitin — into simpler molecules that the hyphae then absorb. This external digestion process is essential for nutrient cycling in ecosystems, converting dead organic material into forms that other organisms can use.

Mycorrhizal fungi form symbiotic partnerships with approximately 90 percent of plant species, creating what Suzanne Simard famously termed the "wood wide web." In this mutualistic relationship, the fungal mycelium extends the effective root system of trees, providing water and mineral nutrients (especially phosphorus) that hyphae can reach but roots cannot. In exchange, the tree provides the fungus with carbon and sugars produced through photosynthesis. Simard's research demonstrated that "mother trees" can transfer carbon to struggling seedlings through mycorrhizal connections, suggesting a cooperative forest ecology far more interconnected than previously understood. Trees linked by the same mycorrhizal network can share nutrients, chemical warning signals, and even transfer resources to dying neighbors.`,
        url: null,
        imageData: null,
        mimeType: null,
        metadata: {
          author: 'Contextual Clarity',
          sources: 'Simard et al., 1997, Nature; Stamets, Mycelium Running',
          wordCount: '265',
        },
      },
    ],
    pointLinks: [
      {
        pointContentSubstring: 'Mycelium is a network of thread-like hyphae',
        resourceTitle: 'Mycelium Networks: Decomposition and the Wood Wide Web',
        relevance: 'Covers hyphal structure, external digestion, and the Oregon fungus size',
      },
      {
        pointContentSubstring: 'Mycorrhizal fungi form the "wood wide web"',
        resourceTitle: 'Mycelium Networks: Decomposition and the Wood Wide Web',
        relevance: 'Details the tree-fungus symbiosis and Simard mother tree research',
      },
    ],
  },

  // 35. Ujjayi Breath & Vagal Tone
  {
    recallSetName: 'Ujjayi Breath & Vagal Tone',
    resources: [
      {
        title: 'Ujjayi Pranayama: Glottal Constriction and Vagal Tone',
        type: 'article',
        content: `Ujjayi pranayama is a yogic breathing technique involving partial constriction of the glottis — the opening between the vocal cords — during both inhalation and exhalation. This constriction creates a characteristic "ocean" or whispering sound and serves a physiological purpose beyond auditory feedback. The narrowed airway slows the breath rate and particularly extends the exhalation phase. Extended exhalation is the key mechanism: it directly stimulates the vagus nerve, the primary conduit of the parasympathetic nervous system, shifting the autonomic balance toward parasympathetic dominance (rest-and-digest mode).

Vagal tone is a measure of vagus nerve activity, most commonly assessed through heart rate variability (HRV) — the variation in time intervals between successive heartbeats. Higher HRV indicates stronger vagal tone and greater parasympathetic influence on the heart. People with high HRV demonstrate greater stress resilience, emotional regulation, and cardiovascular health. Conversely, low HRV correlates with chronic stress, anxiety, and increased cardiac risk.

Regular breathwork practice, including ujjayi, increases resting HRV over time. Research shows that slow breathing at approximately 6 breaths per minute maximizes HRV by synchronizing with the baroreflex — the body's blood-pressure regulation mechanism. At this frequency, breathing and blood pressure oscillations resonate, amplifying vagal activation. The effect is not merely a subjective feeling of calm but a measurable physiological brake on the sympathetic (fight-or-flight) nervous system. Longer exhales activate the vagus nerve directly, lowering heart rate within a single breath cycle.`,
        url: null,
        imageData: null,
        mimeType: null,
        metadata: {
          author: 'Contextual Clarity',
          sources: 'Lehrer & Gevirtz, 2014; Porges Polyvagal Theory; Mason et al., 2013',
          wordCount: '245',
        },
      },
    ],
    pointLinks: [
      {
        pointContentSubstring: 'Ujjayi involves constricting the glottis',
        resourceTitle: 'Ujjayi Pranayama: Glottal Constriction and Vagal Tone',
        relevance: 'Details the glottal constriction mechanism and vagus nerve stimulation',
      },
      {
        pointContentSubstring: 'Vagal tone (measured by HRV)',
        resourceTitle: 'Ujjayi Pranayama: Glottal Constriction and Vagal Tone',
        relevance: 'Covers HRV as vagal tone measure and the 6 breaths/minute resonance frequency',
      },
    ],
  },

  // 36. How LLM Tokenization Works
  {
    recallSetName: 'How LLM Tokenization Works',
    resources: [
      {
        title: 'LLM Tokenization: Byte Pair Encoding and Token Economics',
        type: 'article',
        content: `Large language models do not process text as words or characters — they process tokens, subword units created through a statistical compression algorithm. The dominant method is Byte Pair Encoding (BPE), which starts with individual characters (or bytes) and iteratively merges the most frequently occurring pair of adjacent symbols until reaching a target vocabulary size. GPT-4 uses a vocabulary of approximately 100,000 tokens. Common English words like "the" and "hello" become single tokens, while rare or compound words are split into subword pieces. The word "tokenization" might be split into "token" + "ization." This approach gracefully handles misspellings, neologisms, and morphological variations without needing them in the vocabulary.

The practical consequence is that token count does not equal word count. In English, one token corresponds to roughly three-quarters of a word. Context windows (the maximum input length a model can process) and API pricing are both measured in tokens, making token efficiency directly relevant to cost and capability. A 128,000-token context window holds approximately 96,000 English words — but the same window holds fewer words in most other languages.

Non-English text tokenizes less efficiently because BPE vocabularies are trained predominantly on English text. A Chinese character might require two or three tokens to represent what a single English word token conveys. This means LLMs effectively have smaller context windows and higher per-concept costs for non-English languages — a practical equity concern that tokenizer design continues to address.`,
        url: null,
        imageData: null,
        mimeType: null,
        metadata: {
          author: 'Contextual Clarity',
          sources: 'Sennrich et al., 2016, BPE; OpenAI tiktoken documentation',
          wordCount: '245',
        },
      },
    ],
    pointLinks: [
      {
        pointContentSubstring: 'LLMs split text into tokens via Byte Pair Encoding',
        resourceTitle: 'LLM Tokenization: Byte Pair Encoding and Token Economics',
        relevance: 'Explains the BPE merge algorithm and the ~100K vocabulary size',
      },
      {
        pointContentSubstring: 'Token count ≠ word count',
        resourceTitle: 'LLM Tokenization: Byte Pair Encoding and Token Economics',
        relevance: 'Covers the 3/4 word-per-token ratio and non-English efficiency gap',
      },
    ],
  },

  // 37. Superposition & Mechanistic Interpretability
  {
    recallSetName: 'Superposition & Mechanistic Interpretability',
    resources: [
      {
        title: 'Superposition, Sparse Autoencoders, and Circuits in Neural Networks',
        type: 'article',
        content: `Superposition is the phenomenon where neural networks represent more features than they have dimensions by encoding concepts in overlapping, near-orthogonal patterns across neurons. Individual neurons are polysemantic — they respond to multiple unrelated features rather than cleanly encoding a single concept. This works because most features are sparse (rarely active simultaneously), making interference between overlapping representations tolerable in practice. The network trades perfect separation for the ability to represent an enormous number of features in a limited-dimensional space.

Sparse autoencoders (SAEs) are a key tool for decomposing these superimposed representations into interpretable features. An SAE is trained as an overcomplete autoencoder (more hidden units than input dimensions) with a sparsity penalty on activations in the residual stream. The sparsity constraint forces the autoencoder to discover a dictionary of atomic features, each corresponding to a human-interpretable concept. Anthropic's research demonstrated that SAE features can be used to steer model behavior at inference time — amplifying or suppressing specific concepts by manipulating the corresponding feature activations.

Mechanistic interpretability aims to reverse-engineer neural networks into circuits — small subgraphs of connected components that implement specific, identifiable behaviors. The goal is to move beyond behavioral testing ("what does the model do?") to mechanistic understanding ("how does it work internally?"). A landmark finding is induction heads — a specific two-attention-head circuit that implements in-context learning by copying patterns from earlier in the context. This level of understanding matters for AI safety because it could enable detection of deceptive or biased behaviors at the mechanism level rather than relying on behavioral probes that sophisticated models might circumvent.`,
        url: null,
        imageData: null,
        mimeType: null,
        metadata: {
          author: 'Contextual Clarity',
          sources: 'Elhage et al., 2022, Toy Models of Superposition; Cunningham et al., SAE features; Olsson et al., Induction Heads',
          wordCount: '270',
        },
      },
    ],
    pointLinks: [
      {
        pointContentSubstring: 'Superposition: networks represent more features than dimensions',
        resourceTitle: 'Superposition, Sparse Autoencoders, and Circuits in Neural Networks',
        relevance: 'Explains polysemantic neurons and the sparsity mechanism enabling superposition',
      },
      {
        pointContentSubstring: 'Sparse autoencoders decompose internal activations',
        resourceTitle: 'Superposition, Sparse Autoencoders, and Circuits in Neural Networks',
        relevance: 'Details SAE training with sparsity penalty and behavior steering capability',
      },
      {
        pointContentSubstring: 'Mechanistic interpretability reverse-engineers networks into circuits',
        resourceTitle: 'Superposition, Sparse Autoencoders, and Circuits in Neural Networks',
        relevance: 'Covers circuit analysis, induction heads finding, and safety implications',
      },
    ],
  },

  // 38. How B-Tree Indexes Work
  {
    recallSetName: 'How B-Tree Indexes Work',
    resources: [
      {
        title: 'B-Tree and B+ Tree Indexes: Logarithmic Lookups and Range Queries',
        type: 'article',
        content: `B-trees are self-balancing tree data structures that maintain sorted data and enable logarithmic-time lookups, insertions, and deletions. Each node contains multiple sorted keys and child pointers, keeping all leaf nodes at the same depth. This balanced structure ensures consistent O(log n) performance — a table with one billion rows requires only 3 to 4 disk reads to locate any record, compared to O(n) for a full table scan. The branching factor of a B-tree is typically large (hundreds of keys per node), which keeps the tree shallow and minimizes disk I/O.

Most relational databases — including SQLite, PostgreSQL, and MySQL — actually use B+ trees, a variant where data pointers are stored only in leaf nodes (not in internal nodes). Internal nodes contain only keys and child pointers, maximizing the branching factor and keeping the tree even shallower. Crucially, B+ tree leaf nodes are linked together in a chain (a doubly-linked list), which makes range queries extremely efficient. To find all records between values A and B, the database performs a single tree traversal to find A, then follows leaf-to-leaf pointers sequentially to B — no additional tree traversals needed.

The tradeoff is write performance: every INSERT, UPDATE, or DELETE that affects indexed columns must also update the index structure, maintaining sort order and balance. This overhead means indexes speed reads but slow writes. The database designer must balance the number of indexes against write performance requirements. Unused or redundant indexes waste both write time and disk space.`,
        url: null,
        imageData: null,
        mimeType: null,
        metadata: {
          author: 'Contextual Clarity',
          sources: 'Bayer & McCreight, 1972; Use the Index, Luke (use-the-index-luke.com)',
          wordCount: '250',
        },
      },
    ],
    pointLinks: [
      {
        pointContentSubstring: 'B-tree: self-balancing tree with sorted keys',
        resourceTitle: 'B-Tree and B+ Tree Indexes: Logarithmic Lookups and Range Queries',
        relevance: 'Explains B-tree structure, O(log n) lookups, and the billion-row example',
      },
      {
        pointContentSubstring: 'B+ trees (used by SQLite',
        resourceTitle: 'B-Tree and B+ Tree Indexes: Logarithmic Lookups and Range Queries',
        relevance: 'Details B+ tree leaf chain for range queries and the read/write tradeoff',
      },
    ],
  },

  // 39. How Docker Containers Actually Isolate
  {
    recallSetName: 'How Docker Containers Actually Isolate',
    resources: [
      {
        title: 'Container Isolation: Namespaces, Cgroups, and Layered Filesystems',
        type: 'article',
        content: `Docker containers are not virtual machines — they share the host operating system's kernel. The isolation is achieved through three Linux kernel features working together: namespaces, cgroups, and a layered filesystem.

Linux namespaces provide the illusion of independent system resources for each container. PID namespaces give each container its own process ID space — a container's PID 1 is the container's init process, but on the host it has an entirely different PID. Network namespaces provide each container with its own network stack, including interfaces, routing tables, and port space. Mount namespaces isolate the filesystem view. User namespaces can map container root to an unprivileged host user. Together, these namespaces create the illusion that each container is a standalone system.

Control groups (cgroups) enforce resource limits — CPU time, memory usage, disk I/O bandwidth, and network bandwidth. Without cgroups, a single container could consume all host resources and starve others. Cgroups make resource allocation fair and predictable.

The layered filesystem (typically overlay2 on modern Linux) stacks multiple read-only image layers with a thin writable layer on top. Image layers are immutable and shared between containers using the same base image — if ten containers run from the same Ubuntu image, only one copy of the base layers exists on disk. Each container gets its own writable layer for runtime modifications. This writable layer is ephemeral — discarded when the container stops — unless the data is persisted through Docker volumes. This architecture is why containers start nearly instantly: there is no OS to boot, only a process to launch within existing namespaces.`,
        url: null,
        imageData: null,
        mimeType: null,
        metadata: {
          author: 'Contextual Clarity',
          sources: 'Docker documentation; Linux kernel namespaces documentation; Turnbull, The Docker Book',
          wordCount: '270',
        },
      },
    ],
    pointLinks: [
      {
        pointContentSubstring: 'Containers share the host kernel',
        resourceTitle: 'Container Isolation: Namespaces, Cgroups, and Layered Filesystems',
        relevance: 'Explains namespace types (PID, network, mount, user) and the isolation illusion',
      },
      {
        pointContentSubstring: 'Resource limits via cgroups',
        resourceTitle: 'Container Isolation: Namespaces, Cgroups, and Layered Filesystems',
        relevance: 'Covers cgroups, overlay2 layered filesystem, and ephemeral writable layer',
      },
    ],
  },

  // 40. The Gut-Brain Axis
  {
    recallSetName: 'The Gut-Brain Axis',
    resources: [
      {
        title: 'The Gut-Brain Axis: Bidirectional Communication and Microbiome Effects',
        type: 'article',
        content: `The gut-brain axis is a bidirectional communication network between the enteric nervous system (the gut's own network of over 100 million neurons) and the central nervous system. The primary conduit is the vagus nerve, the longest cranial nerve, which carries signals in both directions between the gut and the brain. Approximately 95 percent of the body's serotonin is produced in the gut by enterochromaffin cells — a remarkable fact given serotonin's central role in mood regulation. The enteric nervous system can operate independently of the CNS, earning the gut the nickname "the second brain." Gastrointestinal symptoms frequently accompany anxiety and depression, reflecting the intimate connection between gut and brain states.

The gut microbiome — the trillions of bacteria, fungi, and other microorganisms inhabiting the gastrointestinal tract — directly influences mood and behavior through the gut-brain axis. Germ-free mice (raised without any gut bacteria) show exaggerated stress responses, altered neurotransmitter levels, and abnormal social behavior. These deficits normalize when specific bacterial strains, particularly Lactobacillus species, are introduced. The implication is profound: the composition of gut bacteria modulates brain function.

Diet changes can shift microbiome composition within days, offering a potential mechanism for dietary effects on mental health. The phrase "gut feelings" appears to be more than metaphor — interoceptive signals from the gut genuinely inform emotional processing. The gut sends far more signals to the brain via the vagus nerve than the brain sends to the gut, making gut-to-brain communication the dominant direction of information flow.`,
        url: null,
        imageData: null,
        mimeType: null,
        metadata: {
          author: 'Contextual Clarity',
          sources: 'Mayer, The Mind-Gut Connection; Cryan & Dinan, 2012, Nature Reviews Neuroscience',
          wordCount: '255',
        },
      },
    ],
    pointLinks: [
      {
        pointContentSubstring: 'gut-brain axis: bidirectional communication',
        resourceTitle: 'The Gut-Brain Axis: Bidirectional Communication and Microbiome Effects',
        relevance: 'Covers the 100M+ neurons, vagus nerve pathway, and 95% gut serotonin production',
      },
      {
        pointContentSubstring: 'Microbiome composition directly influences mood',
        resourceTitle: 'The Gut-Brain Axis: Bidirectional Communication and Microbiome Effects',
        relevance: 'Details germ-free mice studies and Lactobacillus normalization findings',
      },
    ],
  },

  // 41. Contour Drawing & Negative Space
  {
    recallSetName: 'Contour Drawing & Negative Space',
    resources: [
      {
        title: 'Perceptual Drawing: Blind Contour and Negative Space Techniques',
        type: 'article',
        content: `Two fundamental drawing techniques — blind contour drawing and negative space drawing — share a common mechanism: they bypass the brain's symbolic processing system to engage direct perceptual observation. Betty Edwards, in Drawing on the Right Side of the Brain, identified that untrained drawers produce distorted images because the brain's symbolic system intervenes. Rather than drawing what they actually see, they draw their stored symbol for an eye, a hand, or a face. These symbols are crude abstractions that bear little resemblance to the complex visual reality in front of them.

Blind contour drawing addresses this by requiring the artist to draw without looking at the paper, keeping eyes locked on the subject while the hand traces its contours. The resulting drawings are often distorted and overlapping, but they develop the crucial skill of sustained visual attention. By removing the feedback loop (seeing what you are drawing), the brain cannot compare reality against its symbol library and "correct" the drawing toward the symbol. Over time, this practice trains the eye-hand coordination needed for accurate observational drawing.

Negative space drawing takes a different approach to the same problem. Instead of drawing the object itself, the artist draws the shapes of the empty space around and between objects. Drawing the air between a chair's legs, for instance, produces accurate proportions of the chair itself. The technique works because the brain has no symbolic template for arbitrary empty shapes. Without a schema to impose, the brain defaults to processing the actual visual information — the exact shapes, angles, and proportions present in the field of view. The chair emerges accurately as a byproduct of faithfully rendering the spaces that define it.`,
        url: null,
        imageData: null,
        mimeType: null,
        metadata: {
          author: 'Contextual Clarity',
          sources: 'Edwards, Drawing on the Right Side of the Brain (1979); Nicolaides, The Natural Way to Draw',
          wordCount: '275',
        },
      },
      {
        title: 'Negative Space Drawing Example',
        type: 'image',
        content: null,
        url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/Rubin2.jpg/440px-Rubin2.jpg',
        imageData: null,
        mimeType: 'image/jpeg',
        metadata: {
          license: 'Public Domain',
          source: 'Wikimedia Commons',
          description: 'Rubin vase illusion demonstrating figure-ground reversal — the same image shows either a vase or two faces depending on which region is perceived as figure vs negative space',
        },
      },
    ],
    pointLinks: [
      {
        pointContentSubstring: 'Blind contour drawing',
        resourceTitle: 'Perceptual Drawing: Blind Contour and Negative Space Techniques',
        relevance: 'Explains the symbolic bypass mechanism and sustained visual attention training',
      },
      {
        pointContentSubstring: 'Drawing negative space',
        resourceTitle: 'Perceptual Drawing: Blind Contour and Negative Space Techniques',
        relevance: 'Covers the chair legs example and why empty space has no symbolic template',
      },
    ],
  },

  // 42. How Chiaroscuro Creates Depth
  {
    recallSetName: 'How Chiaroscuro Creates Depth',
    resources: [
      {
        title: 'Chiaroscuro: Light, Shadow, and the Illusion of Volume',
        type: 'article',
        content: `Chiaroscuro (from the Italian "chiaro" meaning light and "scuro" meaning dark) is an artistic technique that uses strong contrasts between light and dark to model three-dimensional form on a flat surface. By simulating how light wraps around objects — bright highlights on surfaces facing the light source, progressive darkening on surfaces angled away, and deep shadows on occluded areas — the artist creates a convincing illusion of volume and depth.

Caravaggio pushed chiaroscuro to its extreme with tenebrism, a style in which figures emerge from near-total darkness with dramatic, concentrated illumination. This approach eliminates background detail, focusing the viewer's attention entirely on the lit portions of the subject. The value range — the span from the lightest highlight to the darkest shadow — is the primary vehicle for creating the illusion of three-dimensionality. A wider value range creates stronger volume illusion; a narrow range produces a flatter appearance.

Value (lightness to darkness) is more powerful than either color or line for creating the perception of depth. A grayscale painting with full value range appears more three-dimensional than a colorful painting with limited value contrast. The human visual system evolved to interpret light and shadow patterns as information about spatial structure, making value-based depth cues more fundamental to perception than color or outline.`,
        url: null,
        imageData: null,
        mimeType: null,
        metadata: {
          author: 'Contextual Clarity',
          sources: 'Gombrich, Art and Illusion; general art history',
          wordCount: '215',
        },
      },
      {
        title: 'Chiaroscuro Example: Caravaggio Technique',
        type: 'image',
        content: null,
        url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Caravaggio_-_La_vocazione_di_san_Matteo.jpg/640px-Caravaggio_-_La_vocazione_di_san_Matteo.jpg',
        imageData: null,
        mimeType: 'image/jpeg',
        metadata: {
          license: 'Public Domain',
          source: 'Wikimedia Commons',
          description: 'The Calling of Saint Matthew by Caravaggio (1599-1600), demonstrating tenebrism — dramatic chiaroscuro with figures emerging from darkness',
        },
      },
    ],
  },
];
