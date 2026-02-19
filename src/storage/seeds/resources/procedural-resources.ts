/**
 * Source Resources — Diverse Procedural Recall Sets (Sets 18-30)
 *
 * Source material for all 13 procedural recall sets covering philosophy,
 * literature, finance, hardware, audio, learning science, programming, and more.
 *
 * Integration points for these resources (handled by other tasks):
 * - T02: Tutor agent receives resource titles in system prompt
 * - T09: Rabbit hole agent receives full resource content
 * - T13: show_image event displays image resources in session
 */

import type { ResourceSeed } from './index';

export const proceduralResources: ResourceSeed[] = [
  // 18. Existentialism: Radical Freedom
  {
    recallSetName: 'Existentialism: Radical Freedom',
    resources: [
      {
        title: 'Sartre\'s Existentialism: Existence Precedes Essence and Bad Faith',
        type: 'excerpt',
        content: `Jean-Paul Sartre's existentialism rests on a radical claim: existence precedes essence. For manufactured objects — a knife, a chair — essence (purpose, design) comes first. Someone conceives the object's function before it exists. But for humans, Sartre argues, this is reversed. You exist first, thrown into the world without a predefined nature or purpose, and only then define yourself through your choices and actions. There is no human nature that precedes individual existence; you are what you make of yourself.

This freedom is both liberating and terrifying. If there is no predetermined essence, there are no excuses. You cannot blame your nature, your upbringing, or your circumstances for your choices — you are condemned to be free. Every moment presents a choice, and every choice defines who you are. This radical responsibility extends to all of humanity: in choosing for yourself, Sartre argues, you choose an image of what you believe a human should be.

"Bad faith" (mauvaise foi) is Sartre's term for the act of denying your own freedom by pretending you have no choice. The waiter who plays at being a waiter, performing the role as if it were his fixed nature rather than a chosen activity, acts in bad faith. A person who says "I had no choice" when they did have options — even if all options were terrible — denies their freedom. Acknowledging freedom means accepting that you could always choose otherwise, even when the consequences of alternative choices are severe. Bad faith is the flight from the anxiety of freedom into the comfort of determinism or role-playing.`,
        url: null,
        imageData: null,
        mimeType: null,
        metadata: {
          author: 'Paraphrased from Sartre',
          source: 'Being and Nothingness (1943); Existentialism is a Humanism (1946)',
          wordCount: '260',
        },
      },
    ],
    pointLinks: [
      {
        pointContentSubstring: 'existence precedes essence',
        resourceTitle: 'Sartre\'s Existentialism: Existence Precedes Essence and Bad Faith',
        relevance: 'Explains the core claim with the knife/chair contrast and its implications',
      },
      {
        pointContentSubstring: 'Bad faith',
        resourceTitle: 'Sartre\'s Existentialism: Existence Precedes Essence and Bad Faith',
        relevance: 'Defines bad faith with the waiter example and the flight from freedom',
      },
    ],
  },

  // 19. Kafka's Metamorphosis as Alienation
  {
    recallSetName: "Kafka's Metamorphosis as Alienation",
    resources: [
      {
        title: 'Kafka\'s Metamorphosis: The Literalization of Alienation',
        type: 'excerpt',
        content: `Franz Kafka's The Metamorphosis (1915) opens with one of literature's most famous first lines: Gregor Samsa wakes one morning to find himself transformed into a monstrous insect. The critical insight is that Gregor's transformation externalizes an alienation he already experienced as a dehumanized wage earner valued only for his income. Before the metamorphosis, Gregor was already treated as non-human by his family and employer — a traveling salesman working a job he despises to pay off his parents' debt, unappreciated and isolated despite living under the same roof as his family.

The true horror of the story is not the physical transformation but how little changes socially after it. The family's concern is primarily financial — who will pay the bills? Their care for Gregor degrades over time from grudging accommodation to active hostility. His sister Grete, initially his caretaker, eventually declares "it has to go." The insect body makes literal what was already metaphorically true: Gregor was never seen as a full person. The transformation merely removes the pretense. Kafka's genius is the flat, bureaucratic tone — Gregor's immediate concern upon waking as a giant bug is that he will be late for work. The mundane framing heightens the absurdity and forces the reader to confront how normalized dehumanization can become.`,
        url: null,
        imageData: null,
        mimeType: null,
        metadata: {
          author: 'Contextual Clarity',
          sources: 'Kafka, The Metamorphosis (1915); Nabokov lectures on Kafka',
          wordCount: '225',
        },
      },
    ],
  },

  // 20. Compound Interest
  {
    recallSetName: 'Compound Interest',
    resources: [
      {
        title: 'Compound Interest: Exponential Growth and the Rule of 72',
        type: 'article',
        content: `Compound interest is the mechanism by which investment earnings themselves generate further earnings, creating exponential growth. The formula is A = P(1 + r/n)^(nt), where A is the final amount, P is the principal, r is the annual interest rate, n is the number of compounding periods per year, and t is time in years. The critical insight is that most growth is back-loaded — the final decade of a long investment period dominates all prior decades combined. Ten thousand dollars invested at 7 percent annual return grows to approximately 76,000 dollars over 30 years, but to approximately 150,000 dollars over 40 years. The last 10 years nearly doubles the prior 30. Time in the market dominates all other variables.

The Rule of 72 is a mental math shortcut: divide 72 by the annual interest rate to estimate the number of years required to double your money. At 8 percent, money doubles in approximately 9 years. At 12 percent, approximately 6 years. The rule works because the natural logarithm of 2 is approximately 0.693, and 72 provides a convenient integer close to 69.3 that is divisible by many common rates. The approximation is accurate within about 1 percent for interest rates between 4 and 15 percent. The Rule of 72 makes compound growth intuitive: at 8 percent, your money doubles roughly every 9 years — so over 36 years, it doubles four times, multiplying by 16.`,
        url: null,
        imageData: null,
        mimeType: null,
        metadata: {
          author: 'Contextual Clarity',
          sources: 'Standard financial mathematics; Luca Pacioli first documented Rule of 72 in 1494',
          wordCount: '240',
        },
      },
    ],
    pointLinks: [
      {
        pointContentSubstring: 'Compound interest earns interest on interest',
        resourceTitle: 'Compound Interest: Exponential Growth and the Rule of 72',
        relevance: 'Contains the formula and the back-loaded growth insight with dollar examples',
      },
      {
        pointContentSubstring: 'Rule of 72',
        resourceTitle: 'Compound Interest: Exponential Growth and the Rule of 72',
        relevance: 'Explains the Rule of 72 derivation from ln(2) and its accuracy range',
      },
    ],
  },

  // 21. How SSDs Store Data
  {
    recallSetName: 'How SSDs Store Data',
    resources: [
      {
        title: 'SSD Architecture: NAND Flash, Bit Density, and Wear Management',
        type: 'article',
        content: `Solid-state drives store data using NAND flash memory, which encodes bits by trapping electrons in floating-gate transistors. Each transistor cell is a tiny capacitor with an insulated gate that retains charge even without power. The number of distinct charge levels stored per cell determines the bit density: SLC (single-level cell) stores 1 bit per cell using two charge levels, making it the fastest and most durable. TLC (triple-level cell) stores 3 bits using eight charge levels, and QLC (quad-level cell) stores 4 bits using sixteen charge levels. More bits per cell means cheaper storage per gigabyte, but the tradeoff is slower read/write speeds and reduced durability — distinguishing between sixteen charge levels is inherently less reliable than distinguishing between two.

Flash cells have a finite lifespan measured in program/erase (P/E) cycles. Each write-erase cycle slightly degrades the oxide insulation around the floating gate, eventually preventing reliable charge retention. SLC endures approximately 100,000 P/E cycles, while QLC endures only about 1,000. The SSD controller mitigates this through wear leveling — an algorithm that distributes writes evenly across all cells to prevent any single cell from wearing out prematurely. TRIM is a command that allows the operating system to inform the SSD which data blocks are no longer in use, enabling the controller to erase them proactively during idle periods. Without TRIM, the SSD cannot distinguish used from unused blocks, leading to unnecessary write amplification — extra internal writes that accelerate wear.`,
        url: null,
        imageData: null,
        mimeType: null,
        metadata: {
          author: 'Contextual Clarity',
          sources: 'Micheloni et al., Inside NAND Flash Memories; Agrawal et al., USENIX ATC',
          wordCount: '255',
        },
      },
    ],
    pointLinks: [
      {
        pointContentSubstring: 'SSDs store bits by trapping electrons',
        resourceTitle: 'SSD Architecture: NAND Flash, Bit Density, and Wear Management',
        relevance: 'Explains floating-gate transistors and the SLC/TLC/QLC bit density tradeoffs',
      },
      {
        pointContentSubstring: 'Flash cells wear out',
        resourceTitle: 'SSD Architecture: NAND Flash, Bit Density, and Wear Management',
        relevance: 'Covers P/E cycle limits, wear leveling, and TRIM command purpose',
      },
    ],
  },

  // 22. How Vinyl Records Encode Stereo Sound
  {
    recallSetName: 'How Vinyl Records Encode Stereo Sound',
    resources: [
      {
        title: 'Vinyl Encoding: The 45/45 Stereo System and RIAA Equalization',
        type: 'article',
        content: `Vinyl records encode audio as a continuous spiral groove cut into the surface. For stereo sound, the industry adopted the 45/45 system: the groove walls are angled at 45 degrees from vertical, with the left channel encoded in the inner wall's modulation and the right channel in the outer wall. The stylus rides in the groove and is displaced simultaneously in two perpendicular directions — lateral (side to side) for the sum signal (L+R) and vertical (up and down) for the difference signal (L-R). This elegant design is backwards-compatible with mono players, which read only the lateral (L+R) component. The system was invented by Alan Blumlein and standardized for commercial release in 1958.

The characteristic "warmth" of vinyl sound has specific technical origins. The physical contact between stylus and groove introduces even-order harmonic distortion — gentle overtones that many listeners perceive as pleasing. Additionally, RIAA equalization shapes the frequency response at both cutting and playback stages. During cutting, the engineer applies RIAA equalization that boosts bass frequencies and cuts treble. During playback, the phono preamplifier applies the inverse curve — cutting bass and boosting treble — to restore flat response. The bass reduction during cutting prevents the groove from becoming physically too wide (low frequencies create large lateral excursions), while treble boosting during cutting improves the signal-to-noise ratio for high frequencies. Digital recording is more accurate; vinyl's characteristic coloration is a matter of aesthetic preference rather than technical superiority.`,
        url: null,
        imageData: null,
        mimeType: null,
        metadata: {
          author: 'Contextual Clarity',
          sources: 'Blumlein patent; RIAA standard; Borwick, Loudspeaker and Headphone Handbook',
          wordCount: '255',
        },
      },
    ],
    pointLinks: [
      {
        pointContentSubstring: 'Stereo vinyl uses a 45/45 system',
        resourceTitle: 'Vinyl Encoding: The 45/45 Stereo System and RIAA Equalization',
        relevance: 'Details the 45/45 groove wall encoding and mono backwards-compatibility',
      },
      {
        pointContentSubstring: 'Vinyl "warmth" comes from',
        resourceTitle: 'Vinyl Encoding: The 45/45 Stereo System and RIAA Equalization',
        relevance: 'Explains even-order harmonic distortion and the RIAA equalization curve',
      },
    ],
  },

  // 23. Spaced Repetition: The Forgetting Curve
  {
    recallSetName: 'Spaced Repetition: The Forgetting Curve',
    resources: [
      {
        title: 'The Forgetting Curve and Spaced Repetition',
        type: 'article',
        content: `Hermann Ebbinghaus, a German psychologist, discovered in 1885 that memory decays exponentially following initial learning. His forgetting curve shows that approximately 50 percent of newly learned information is forgotten within one hour, and approximately 70 percent within 24 hours, without any review. Meaningful, well-connected information decays more slowly than nonsense syllables (which Ebbinghaus used), but the general exponential pattern holds across all types of learning material.

The key insight of spaced repetition is that each review at the point of near-forgetting resets the forgetting curve with a shallower decay rate. The first review might be needed after one day; if successful, the next review can wait three days, then seven, then twenty-one days. Each successful recall strengthens the memory trace, making it more resistant to future decay. This expanding schedule is precisely what algorithms like FSRS calculate — they estimate the optimal moment to review each item, maximizing retention while minimizing total review time. Reviewing too early wastes time (the memory is still strong); reviewing too late wastes the prior learning investment (the memory has already decayed beyond recovery). The sweet spot is reviewing just as the memory is about to fall below the threshold of reliable recall.`,
        url: null,
        imageData: null,
        mimeType: null,
        metadata: {
          author: 'Contextual Clarity',
          sources: 'Ebbinghaus, 1885; Pimsleur, 1967; Wozniak & Gorzelanczyk, 1994',
          wordCount: '215',
        },
      },
    ],
    pointLinks: [
      {
        pointContentSubstring: 'forgetting curve: memory decays exponentially',
        resourceTitle: 'The Forgetting Curve and Spaced Repetition',
        relevance: 'Contains the 50% in an hour, 70% in 24 hours decay rates',
      },
      {
        pointContentSubstring: 'Each review at the point of near-forgetting',
        resourceTitle: 'The Forgetting Curve and Spaced Repetition',
        relevance: 'Explains the expanding interval schedule and why timing matters',
      },
    ],
  },

  // 24. TypeScript Generics
  {
    recallSetName: 'TypeScript Generics',
    resources: [
      {
        title: 'TypeScript Generics: Type-Safe Polymorphism',
        type: 'article',
        content: `TypeScript generics allow you to write functions, classes, and interfaces that work across multiple types while preserving full type safety. The syntax uses angle brackets with a type parameter: function identity<T>(arg: T): T returns the same type it receives. Unlike using "any," which discards type information entirely, generics maintain the relationship between input and output types. The compiler knows that identity<string>("hello") returns a string, not an unknown value. Without generics, you face a false dichotomy: either write separate functions for each type (safe but redundant) or use "any" (flexible but unsafe). Generics give you both safety and flexibility.

Generic constraints, specified with the "extends" keyword, restrict what types a generic parameter can accept. The declaration <T extends { length: number }> limits T to types that have a numeric length property — strings, arrays, and objects with a length field all qualify, but numbers and booleans do not. Without constraints, T could be anything and you cannot safely access any properties on it. Common constraint patterns include T extends string for string subtypes, K extends keyof T for valid property keys of another type, and T extends (...args: any[]) => any for function types. Constraints are essential for writing generic code that actually does something useful with the generic values rather than merely passing them through.`,
        url: null,
        imageData: null,
        mimeType: null,
        metadata: {
          author: 'Contextual Clarity',
          sources: 'TypeScript Handbook; Effective TypeScript by Dan Vanderkam',
          wordCount: '225',
        },
      },
    ],
    pointLinks: [
      {
        pointContentSubstring: 'Generics let you write functions',
        resourceTitle: 'TypeScript Generics: Type-Safe Polymorphism',
        relevance: 'Explains the identity<T> example and the safety vs flexibility tradeoff',
      },
      {
        pointContentSubstring: '`extends` constrains generics',
        resourceTitle: 'TypeScript Generics: Type-Safe Polymorphism',
        relevance: 'Details the extends keyword, length constraint example, and common patterns',
      },
    ],
  },

  // 25. Git Rebase vs Merge
  {
    recallSetName: 'Git Rebase vs Merge',
    resources: [
      {
        title: 'Git Rebase vs Merge: Linear History and the Golden Rule',
        type: 'article',
        content: `Git rebase and merge both integrate changes from one branch into another, but they produce fundamentally different history shapes. Running "git rebase main" replays your branch's commits on top of the latest main, creating a clean, linear history as if your work happened after all of main's changes. The operation rewrites commit hashes — every replayed commit gets a new SHA — which is why the golden rule of rebasing exists: never rebase commits that have been pushed to a shared remote. Rewriting shared history causes other developers' branches to diverge from the rewritten commits, creating painful conflicts and confusion.

Merge commits, by contrast, preserve the full branching history. Running "git merge feature" creates a new merge commit with two parents — one from each branch — documenting that parallel development occurred. The merge approach is non-destructive: no existing commits are modified. The resulting history looks like a railroad track with branches splitting and rejoining. Merge commits are preferable when you want to document the context of parallel development — for example, preserving that a feature was developed on its own branch and integrated on a specific date. Rebase is preferable for keeping a clean, readable main branch where each commit tells a clear story. Many teams use both: rebase local work before sharing (to clean up history), then merge feature branches into main (to preserve the integration point).`,
        url: null,
        imageData: null,
        mimeType: null,
        metadata: {
          author: 'Contextual Clarity',
          sources: 'Pro Git by Scott Chacon; Git documentation',
          wordCount: '235',
        },
      },
    ],
    pointLinks: [
      {
        pointContentSubstring: 'git rebase main',
        resourceTitle: 'Git Rebase vs Merge: Linear History and the Golden Rule',
        relevance: 'Explains rebase mechanics, hash rewriting, and the golden rule',
      },
      {
        pointContentSubstring: 'Merge commits preserve branching history',
        resourceTitle: 'Git Rebase vs Merge: Linear History and the Golden Rule',
        relevance: 'Covers merge commits, railroad track metaphor, and when each is appropriate',
      },
    ],
  },

  // 26. Git Reflog & Recovery
  {
    recallSetName: 'Git Reflog & Recovery',
    resources: [
      {
        title: 'Git Reflog: Your Undo History for Destructive Operations',
        type: 'article',
        content: `The git reflog (reference log) records every movement of HEAD — every commit, checkout, rebase, reset, merge, and cherry-pick. It functions as a complete undo history for the repository, persisting references to commits for at least 30 days even after operations that appear to destroy them. The reflog is local only — it is not pushed to remote repositories and reflects only your local HEAD movements.

When a destructive operation like "git reset --hard" or a rebase goes wrong and commits appear lost, the reflog is the recovery tool. Running "git reflog" displays a chronological list of HEAD positions with timestamps and descriptions. To recover "lost" commits, find the desired commit hash in the reflog output, then either checkout that hash directly with "git checkout <hash>" to inspect the state, or use "git reset --hard <hash>" to restore the branch to that point. Commits referenced in the reflog are protected from garbage collection. Only after a reference expires (default: 30 days for unreachable commits, 90 days for reachable ones) and garbage collection runs will a commit be truly deleted. In practice, this means you have at least a month to recover from most destructive operations.`,
        url: null,
        imageData: null,
        mimeType: null,
        metadata: {
          author: 'Contextual Clarity',
          sources: 'Pro Git by Scott Chacon; Git documentation',
          wordCount: '210',
        },
      },
    ],
    pointLinks: [
      {
        pointContentSubstring: 'git reflog',
        resourceTitle: 'Git Reflog: Your Undo History for Destructive Operations',
        relevance: 'Explains what reflog records, the 30-day retention, and local-only nature',
      },
      {
        pointContentSubstring: 'recover "lost" commits',
        resourceTitle: 'Git Reflog: Your Undo History for Destructive Operations',
        relevance: 'Details the recovery workflow: find hash in reflog, checkout or reset',
      },
    ],
  },

  // 27. React Re-rendering Mental Model
  {
    recallSetName: 'React Re-rendering Mental Model',
    resources: [
      {
        title: 'React Re-rendering: State, Props, and Referential Equality',
        type: 'article',
        content: `Understanding React's re-rendering behavior is essential for building performant applications. A component re-renders in two situations: when its own state changes (via useState setter or useReducer dispatch), or when its parent re-renders and passes it new props. A common misconception is that props independently trigger re-renders — they do not. The parent's re-render causes it to re-execute, which re-evaluates the child's props and passes them down, causing the child to re-render. This means state should live as close as possible to where it is used; lifting state high in the tree causes unnecessary cascading re-renders of all descendants.

Referential equality is a frequent source of bugs in React. JavaScript compares objects, arrays, and functions by reference, not by value. Two objects with identical content — {a: 1} and {a: 1} — are not equal because they are different references in memory. This matters critically in dependency arrays for useEffect, useMemo, and useCallback. If a dependency is a new object reference on every render, the effect or memo will re-execute every time, even though the content has not changed. This is a common source of infinite loops: useEffect creates an object, which triggers a re-render, which creates a new object reference, which triggers the effect again. The solution is useMemo (for stabilizing object and array references) and useCallback (for stabilizing function references) to ensure that dependencies only change when their underlying values actually change.`,
        url: null,
        imageData: null,
        mimeType: null,
        metadata: {
          author: 'Contextual Clarity',
          sources: 'React documentation; Dan Abramov blog posts; Kent C. Dodds',
          wordCount: '240',
        },
      },
    ],
    pointLinks: [
      {
        pointContentSubstring: 'component re-renders when its state changes',
        resourceTitle: 'React Re-rendering: State, Props, and Referential Equality',
        relevance: 'Explains state change and parent re-render as the two re-render triggers',
      },
      {
        pointContentSubstring: 'Referential equality matters',
        resourceTitle: 'React Re-rendering: State, Props, and Referential Equality',
        relevance: 'Covers object reference comparison, dependency array pitfalls, and useMemo/useCallback',
      },
    ],
  },

  // 28. Backpropagation & Computational Graphs
  {
    recallSetName: 'Backpropagation & Computational Graphs',
    resources: [
      {
        title: 'Backpropagation: Forward Graphs, Chain Rule, and Vanishing Gradients',
        type: 'article',
        content: `Backpropagation is the algorithm that makes deep learning possible by efficiently computing gradients for all weights in a neural network. The process begins with the forward pass, which builds a directed acyclic graph (DAG) where each node represents a mathematical operation and each edge carries a tensor. The graph records every computation performed on the input data, preserving the information needed for gradient computation. PyTorch builds this graph dynamically during each forward pass; TensorFlow historically used static graph construction.

Backpropagation applies the chain rule of calculus in reverse through the graph. Starting from the loss function, each node multiplies its local gradient (the derivative of its operation with respect to its inputs) by the downstream gradient flowing back from the loss. This propagation computes the partial derivative of the loss with respect to every weight in the network in a single backward pass — the efficiency that makes training networks with millions of parameters feasible.

The vanishing gradient problem occurs when repeated multiplication of small derivatives through many layers shrinks gradients toward zero. Activation functions like sigmoid and tanh saturate in regions where their derivative approaches zero, causing gradients to vanish as they propagate through deep networks. Two key innovations mitigate this: ReLU activation (derivative is either 0 or 1, avoiding saturation) and skip connections (as in ResNets), which provide shortcut paths for gradients, effectively reducing the chain length. Skip connections are why ResNets can scale to hundreds of layers deep without vanishing gradients.`,
        url: null,
        imageData: null,
        mimeType: null,
        metadata: {
          author: 'Contextual Clarity',
          sources: 'Rumelhart et al., 1986; He et al., Deep Residual Learning, 2015',
          wordCount: '255',
        },
      },
    ],
    pointLinks: [
      {
        pointContentSubstring: 'forward pass builds a DAG',
        resourceTitle: 'Backpropagation: Forward Graphs, Chain Rule, and Vanishing Gradients',
        relevance: 'Describes the DAG construction and PyTorch dynamic vs TensorFlow static graphs',
      },
      {
        pointContentSubstring: 'Backprop applies the chain rule backwards',
        resourceTitle: 'Backpropagation: Forward Graphs, Chain Rule, and Vanishing Gradients',
        relevance: 'Explains the reverse chain rule propagation and single-pass efficiency',
      },
      {
        pointContentSubstring: 'Vanishing gradients',
        resourceTitle: 'Backpropagation: Forward Graphs, Chain Rule, and Vanishing Gradients',
        relevance: 'Covers sigmoid/tanh saturation and ReLU/skip connection mitigations',
      },
    ],
  },

  // 29. How Espresso Extraction Works
  {
    recallSetName: 'How Espresso Extraction Works',
    resources: [
      {
        title: 'Espresso Extraction: The 1:2 Ratio, Diagnostics, and Grind Control',
        type: 'article',
        content: `Espresso extraction is a precise balance of pressure, time, temperature, and grind size. The standard recipe uses approximately 18 grams of ground coffee, subjected to approximately 9 bars of pressure, producing approximately 36 grams of liquid espresso in 25 to 30 seconds — the classic 1:2 ratio of dose to yield. Shot time is the primary diagnostic for dialing in: if the shot runs too fast (under 20 seconds), the water passes through without extracting enough solubles, and you need to grind finer. If it runs too slow (over 35 seconds), over-extraction occurs, and you should grind coarser. Grind size, dose, and yield all interact, but grind size is the primary lever.

The flavors extracted from coffee follow a predictable sequence. Acids dissolve first, giving early extraction a bright, sour character. Sugars and caramelized compounds follow, providing sweetness and body. Bitter compounds — heavy phenolics and tannins — extract last. Under-extraction (below about 18 percent of coffee mass dissolved) tastes sour because only acids have been extracted. Over-extraction (above about 22 percent) tastes bitter because undesirable compounds dominate. The target extraction range of 18 to 22 percent balances all flavor categories. Grind size is the primary lever because finer grounds expose more surface area to water, accelerating the rate at which all compounds dissolve. Adjusting grind by small increments — often just a single notch on the grinder — can shift a sour, under-extracted shot into a balanced, sweet espresso.`,
        url: null,
        imageData: null,
        mimeType: null,
        metadata: {
          author: 'Contextual Clarity',
          sources: 'Scott Rao, Everything but Espresso; James Hoffmann, The World Atlas of Coffee',
          wordCount: '255',
        },
      },
    ],
    pointLinks: [
      {
        pointContentSubstring: 'Standard espresso: ~18g coffee',
        resourceTitle: 'Espresso Extraction: The 1:2 Ratio, Diagnostics, and Grind Control',
        relevance: 'Contains the 18g/9bar/36g/25-30s standard recipe and timing diagnostics',
      },
      {
        pointContentSubstring: 'Under-extraction → sour',
        resourceTitle: 'Espresso Extraction: The 1:2 Ratio, Diagnostics, and Grind Control',
        relevance: 'Explains the extraction sequence and the 18-22% target range',
      },
    ],
  },

  // 30. The Ralph Wiggum Loop
  {
    recallSetName: 'The Ralph Wiggum Loop',
    resources: [
      {
        title: 'The Ralph Wiggum Loop: Brute-Force Agent Iteration',
        type: 'article',
        content: `The Ralph Wiggum Loop is an agentic coding pattern named by Geoffrey Huntley after the Simpsons character Ralph Wiggum, known for naive persistence. The pattern is a bash loop that runs a fresh LLM agent instance against a specification or task, checks whether the task is complete, and if not, retries — piping the full output of the previous attempt (including error messages, stack traces, and partial results) back as input context for the next attempt.

The key insight is that each retry starts with a fresh agent context but inherits the previous attempt's complete output as unsanitized failure feedback. This creates a "contextual pressure cooker" where each iteration benefits from knowledge of what went wrong without being polluted by the accumulated context and assumptions of the prior conversation. Because LLMs are stochastic — the same prompt produces different outputs — each attempt explores a different solution path. Combined with detailed failure feedback, the loop progressively narrows the solution space until it converges.

The power of the pattern comes from brute-force iteration with fresh context. Traditional agent loops accumulate conversation context that can lead to circular reasoning or entrenchment in a failing approach. The Ralph Wiggum Loop avoids this by giving each attempt a clean slate while providing full observability into prior failures. The pattern is most effective for tasks with clear pass/fail criteria (test suites, type checks, build scripts) where the output provides actionable diagnostic information.`,
        url: null,
        imageData: null,
        mimeType: null,
        metadata: {
          author: 'Contextual Clarity',
          sources: 'Geoffrey Huntley; agentic coding community',
          wordCount: '235',
        },
      },
    ],
    pointLinks: [
      {
        pointContentSubstring: 'bash loop that runs a fresh agent instance',
        resourceTitle: 'The Ralph Wiggum Loop: Brute-Force Agent Iteration',
        relevance: 'Describes the loop structure, failure feedback piping, and naming origin',
      },
      {
        pointContentSubstring: 'brute-force iteration with fresh context',
        resourceTitle: 'The Ralph Wiggum Loop: Brute-Force Agent Iteration',
        relevance: 'Explains the stochastic LLM advantage and context pollution avoidance',
      },
    ],
  },
];
