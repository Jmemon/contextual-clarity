/**
 * Source Resources — Diverse Conceptual Recall Sets (Sets 1-17)
 *
 * Source material for all 17 conceptual recall sets covering psychology,
 * behavior, biology, health, math, and information theory.
 *
 * Integration points for these resources (handled by other tasks):
 * - T02: Tutor agent receives resource titles in system prompt
 * - T09: Rabbit hole agent receives full resource content
 * - T13: show_image event displays image resources in session
 */

import type { ResourceSeed } from './index';

export const conceptualResources: ResourceSeed[] = [
  // 1. Atomic Habits: The Habit Loop
  {
    recallSetName: 'Atomic Habits: The Habit Loop',
    resources: [
      {
        title: 'The Four-Step Habit Loop and Environment Design',
        type: 'excerpt',
        content: `James Clear's Atomic Habits identifies a universal pattern underlying every habit: the four-step loop of cue, craving, response, and reward. The cue triggers the brain to initiate a behavior — it is a bit of information that predicts a reward. The craving is the motivational force; you do not crave the habit itself but the change in state it delivers. The response is the actual habit you perform, which can be a thought or an action. The reward is the end goal — it satisfies the craving and teaches the brain which actions are worth remembering.

To build a good habit, make each step work in your favor: make the cue obvious, the craving attractive, the response easy, and the reward satisfying. To break a bad habit, invert each step: make it invisible, unattractive, difficult, and unsatisfying.

Environment design is more powerful than willpower for sustained behavior change. Willpower is a finite resource that depletes throughout the day, but environmental modifications persist without effort. Putting your phone in another room eliminates the cue for mindless scrolling entirely. Placing a water bottle on your desk makes hydration the default action. The key insight is that you do not need to be the kind of person who has iron discipline — you need to be the kind of person who structures their surroundings so that the desired behavior is the path of least resistance.`,
        url: null,
        imageData: null,
        mimeType: null,
        metadata: {
          author: 'Paraphrased from James Clear',
          source: 'Atomic Habits (2018)',
          wordCount: '230',
        },
      },
    ],
    pointLinks: [
      {
        pointContentSubstring: 'cue → craving → response → reward',
        resourceTitle: 'The Four-Step Habit Loop and Environment Design',
        relevance: 'Details the four-step loop and how to build/break habits by manipulating each step',
      },
      {
        pointContentSubstring: 'Environment design beats willpower',
        resourceTitle: 'The Four-Step Habit Loop and Environment Design',
        relevance: 'Explains why environment design outperforms willpower with concrete examples',
      },
    ],
  },

  // 2. Dunning-Kruger Effect
  {
    recallSetName: 'Dunning-Kruger Effect',
    resources: [
      {
        title: 'The Dunning-Kruger Effect: Metacognitive Blindness',
        type: 'article',
        content: `The Dunning-Kruger effect, documented by psychologists David Dunning and Justin Kruger in 1999, describes a cognitive bias where people with low competence in a domain systematically overestimate their ability. The mechanism is metacognitive: the skills needed to produce a correct answer are the same skills needed to recognize what a correct answer looks like. Beginners lack the framework to evaluate their own performance — they literally do not know what they do not know.

Conversely, experts tend to underestimate their relative competence. Because tasks feel easy to them, they assume others find them equally straightforward. This creates a dual distortion: novices think they are better than they are, and experts think they are less exceptional than they are.

The effect is not about intelligence — it is about the gap between actual competence and self-assessment in a specific domain. A chess grandmaster might drastically overestimate their cooking ability while underestimating their chess skill relative to peers. The remedy is calibrated feedback and deliberate exposure to the full complexity of a domain, which builds the metacognitive awareness needed for accurate self-assessment.`,
        url: null,
        imageData: null,
        mimeType: null,
        metadata: {
          author: 'Contextual Clarity',
          sources: 'Kruger & Dunning, 1999, Journal of Personality and Social Psychology',
          wordCount: '195',
        },
      },
    ],
  },

  // 3. Sunk Cost Fallacy
  {
    recallSetName: 'Sunk Cost Fallacy',
    resources: [
      {
        title: 'The Sunk Cost Fallacy: Why Past Investment Distorts Future Decisions',
        type: 'article',
        content: `The sunk cost fallacy is the tendency to continue a course of action because of past investment — time, money, or effort — rather than evaluating whether continuing is the best use of future resources. Past costs are irrecoverable and therefore irrelevant to optimal decision-making. The rational question is always: "Given where I am now, is continuing the best use of my next hour or dollar?"

This fallacy appears everywhere. A person sits through a terrible movie because they paid for the ticket. A company continues funding a failing project because millions have already been spent. A student stays in a degree program they dislike because they have already completed two years. In each case, the decision-maker confuses "I have invested a lot" with "I should keep investing."

The psychological root is loss aversion — the brain weights losses more heavily than equivalent gains. Abandoning a sunk cost feels like crystallizing a loss, even though the investment is already gone regardless of the next decision. Rational decision-making requires evaluating only the marginal costs and benefits going forward. The money is spent whether you stay for the second half of the movie or leave. The only question that matters is whether the next two hours of your life are better spent watching or doing something else.`,
        url: null,
        imageData: null,
        mimeType: null,
        metadata: {
          author: 'Contextual Clarity',
          sources: 'Kahneman & Tversky, Prospect Theory; Arkes & Blumer, 1985',
          wordCount: '220',
        },
      },
    ],
  },

  // 4. Dopamine & Motivation
  {
    recallSetName: 'Dopamine & Motivation',
    resources: [
      {
        title: 'Dopamine: The Molecule of Anticipation and Variable Reward',
        type: 'article',
        content: `Dopamine is widely mischaracterized as the "pleasure chemical," but neuroscience reveals a more nuanced role. Dopamine drives anticipation and wanting, not pleasure itself. It spikes before a reward, not during consumption. Wolfram Schultz's landmark experiments showed that dopamine neurons fire at the cue predicting a reward, not when the reward arrives. When the outcome is better than expected, dopamine spikes above baseline; when worse than expected, it dips below baseline. This reward prediction error signal is how the brain learns which cues are worth pursuing.

The distinction between wanting (dopamine-driven motivation) and liking (opioid-mediated pleasure) explains why addicts can desperately want something they no longer enjoy. Dopamine creates the drive to pursue, not the satisfaction of having.

Variable reward schedules produce the highest dopamine and most compulsive behavior. When reward timing or magnitude is unpredictable, the brain cannot predict accurately, so dopamine remains chronically elevated. This is the mechanism behind slot machines — each pull could pay out, and the uncertainty itself is addictive. Social media exploits the same circuit: refreshing a feed delivers unpredictable social validation. B.F. Skinner's operant conditioning research demonstrated that fixed schedules (same reward every time) produce moderate, predictable engagement, while variable schedules produce intense, persistent engagement that resists extinction.`,
        url: null,
        imageData: null,
        mimeType: null,
        metadata: {
          author: 'Contextual Clarity',
          sources: 'Wolfram Schultz reward prediction error; Berridge wanting vs liking; Skinner operant conditioning',
          wordCount: '230',
        },
      },
    ],
    pointLinks: [
      {
        pointContentSubstring: 'Dopamine drives anticipation',
        resourceTitle: 'Dopamine: The Molecule of Anticipation and Variable Reward',
        relevance: 'Covers Schultz experiments and the wanting vs liking distinction',
      },
      {
        pointContentSubstring: 'Variable reward schedules',
        resourceTitle: 'Dopamine: The Molecule of Anticipation and Variable Reward',
        relevance: 'Explains variable reward mechanisms, slot machines, and social media',
      },
    ],
  },

  // 5. The Lindy Effect
  {
    recallSetName: 'The Lindy Effect',
    resources: [
      {
        title: 'The Lindy Effect: Longevity as a Predictor of Future Survival',
        type: 'excerpt',
        content: `The Lindy Effect, popularized by Nassim Nicholas Taleb in Antifragile, states that for non-perishable things — ideas, technologies, books, cultural practices — the longer something has survived, the longer its expected remaining lifespan. A book that has been in print for 100 years is expected to remain in print for another 100 years. A technology that has lasted 50 years can be expected to last another 50. The key is the distinction between perishable and non-perishable. A human is perishable: the older you get, the shorter your remaining life expectancy. But an idea is non-perishable: the older it gets, the more robust it has proven itself against the test of time.

The mechanism is survivorship through adversity. Things that survive long-term have demonstrated robustness to changing conditions, cultural shifts, and competition. A book still read after 200 years has survived revolutions, technological disruptions, and changing tastes. It has something that resonates beyond its specific era. Conversely, most new things — books, startups, technologies — fail quickly. The Lindy Effect does not say old things are good; it says that survival is information about robustness.`,
        url: null,
        imageData: null,
        mimeType: null,
        metadata: {
          author: 'Paraphrased from Nassim Nicholas Taleb',
          source: 'Antifragile (2012)',
          wordCount: '200',
        },
      },
    ],
  },

  // 6. Caffeine & Adenosine
  {
    recallSetName: 'Caffeine & Adenosine',
    resources: [
      {
        title: 'Caffeine and the Adenosine System: Mechanism, Tolerance, and Withdrawal',
        type: 'article',
        content: `Caffeine is the world's most widely consumed psychoactive substance, and its mechanism of action centers on the adenosine system. Adenosine is a neuromodulator that accumulates in the brain during waking hours, progressively binding to adenosine receptors and promoting drowsiness — this is the biochemical basis of "sleep pressure." Caffeine blocks adenosine receptors without activating them, preventing the drowsiness signal from being transmitted. It masks sleep pressure rather than creating energy. The adenosine molecules still accumulate behind the blockade, which is why you experience a crash when caffeine wears off — the accumulated adenosine floods the now-unblocked receptors.

With regular caffeine consumption, the brain adapts by growing more adenosine receptors, a process called upregulation. This is the basis of caffeine tolerance — you need more caffeine to block the increased number of receptors for the same effect. Tolerance typically develops within 7 to 12 days of consistent use.

Withdrawal occurs when a habitual user stops abruptly. The surplus of adenosine receptors, now unblocked, allows adenosine to bind aggressively. One prominent effect is vasodilation of cerebral blood vessels (adenosine dilates blood vessels), causing the characteristic withdrawal headache. Other symptoms include fatigue, irritability, and difficulty concentrating. A full reset of adenosine receptor density takes approximately 2 to 9 days of abstinence.`,
        url: null,
        imageData: null,
        mimeType: null,
        metadata: {
          author: 'Contextual Clarity',
          sources: 'Ribeiro & Sebastião, 2010; Fredholm et al., Pharmacological Reviews',
          wordCount: '230',
        },
      },
    ],
    pointLinks: [
      {
        pointContentSubstring: 'Caffeine blocks adenosine receptors',
        resourceTitle: 'Caffeine and the Adenosine System: Mechanism, Tolerance, and Withdrawal',
        relevance: 'Details the receptor-blocking mechanism and adenosine accumulation crash',
      },
      {
        pointContentSubstring: 'Regular use causes the brain to grow more adenosine receptors',
        resourceTitle: 'Caffeine and the Adenosine System: Mechanism, Tolerance, and Withdrawal',
        relevance: 'Explains tolerance via receptor upregulation and withdrawal headache mechanism',
      },
    ],
  },

  // 7. How Muscle Growth Works
  {
    recallSetName: 'How Muscle Growth Works',
    resources: [
      {
        title: 'Muscle Hypertrophy: Microtears, Protein Synthesis, and Training Frequency',
        type: 'article',
        content: `Muscle hypertrophy — the increase in muscle fiber size — begins with mechanical damage from resistance training. When muscles are subjected to loads exceeding their current adaptation, microscopic tears form in the muscle fibers (microtears). This damage triggers a repair cascade: satellite cells activate, fuse with damaged fibers, and donate their nuclei. Protein synthesis rebuilds the damaged fibers thicker and stronger than before. This process requires progressive overload — the training stimulus must continually exceed what the muscle has adapted to, or growth stalls.

Muscle protein synthesis (MPS) is the molecular driver of growth. After a resistance training session, MPS peaks approximately 24 to 48 hours post-training and returns to baseline by approximately 72 hours. This timeline has direct implications for training frequency: since the growth stimulus is largely exhausted by 72 hours, training each muscle group 2 to 3 times per week keeps MPS chronically elevated. This is why full-body routines or upper/lower splits often produce superior hypertrophy compared to traditional "bro splits" (one muscle per day, once per week) for natural lifters. The bro split allows five to six days of zero growth stimulus per muscle group between sessions — wasted potential.`,
        url: null,
        imageData: null,
        mimeType: null,
        metadata: {
          author: 'Contextual Clarity',
          sources: 'Schoenfeld, 2010; Damas et al., 2015; Wernbom et al., 2007',
          wordCount: '205',
        },
      },
    ],
    pointLinks: [
      {
        pointContentSubstring: 'Resistance training causes microtears',
        resourceTitle: 'Muscle Hypertrophy: Microtears, Protein Synthesis, and Training Frequency',
        relevance: 'Covers the microtear-repair-hypertrophy mechanism and progressive overload',
      },
      {
        pointContentSubstring: 'Muscle protein synthesis peaks',
        resourceTitle: 'Muscle Hypertrophy: Microtears, Protein Synthesis, and Training Frequency',
        relevance: 'Details MPS timing window and the 2-3x/week training frequency implication',
      },
    ],
  },

  // 8. Sleep & Memory Consolidation
  {
    recallSetName: 'Sleep & Memory Consolidation',
    resources: [
      {
        title: 'Sleep and Memory: Hippocampal Replay and the Cost of Deprivation',
        type: 'article',
        content: `Sleep is not a passive state — it is an active phase of memory processing critical for learning. During slow-wave sleep (the deepest phase of non-REM sleep), the hippocampus replays the day's experiences at accelerated speed. Sharp-wave ripples in the hippocampus fire in coordinated bursts, transferring episodic memories from short-term hippocampal storage to long-term neocortical storage. This replay process strengthens synaptic connections and integrates new information with existing knowledge networks. Research consistently shows that learning followed by sleep produces significantly better retention than the same period spent awake.

Sleep deprivation has a devastating impact on the brain's capacity to form new memories. Matthew Walker's research at UC Berkeley demonstrated that sleep deprivation reduces the brain's capacity to form new memories by approximately 40 percent. The hippocampus, which functions as the brain's short-term memory inbox, becomes less receptive to new input without adequate sleep. Sleep is needed both before learning — to prepare the hippocampus to receive new information — and after learning — to consolidate and stabilize those memories for long-term retention. A single night of poor sleep can impair next-day learning capacity, while chronic sleep restriction compounds the deficit over time.`,
        url: null,
        imageData: null,
        mimeType: null,
        metadata: {
          author: 'Contextual Clarity',
          sources: 'Walker, Why We Sleep (2017); Rasch & Born, 2013, Physiological Reviews',
          wordCount: '215',
        },
      },
    ],
    pointLinks: [
      {
        pointContentSubstring: 'slow-wave sleep, the hippocampus replays',
        resourceTitle: 'Sleep and Memory: Hippocampal Replay and the Cost of Deprivation',
        relevance: 'Details hippocampal replay during slow-wave sleep and the memory transfer process',
      },
      {
        pointContentSubstring: 'Sleep deprivation reduces',
        resourceTitle: 'Sleep and Memory: Hippocampal Replay and the Cost of Deprivation',
        relevance: 'Covers the 40% memory formation reduction and the before/after learning requirement',
      },
    ],
  },

  // 9. Intermittent Fasting Mechanisms
  {
    recallSetName: 'Intermittent Fasting Mechanisms',
    resources: [
      {
        title: 'Metabolic Mechanisms of Fasting: Lipolysis and Autophagy',
        type: 'article',
        content: `Intermittent fasting triggers two distinct metabolic processes operating on different timescales. The first is lipolysis — the mobilization of stored fat for energy. During fasting, insulin levels drop significantly. Since insulin is the primary signal for energy storage, low insulin tells fat cells to release stored fatty acids into the bloodstream for use as fuel. This metabolic shift enhances after approximately 12 to 16 hours of fasting, when liver glycogen stores are substantially depleted. Constant snacking keeps insulin chronically elevated, locking the body in permanent storage mode and preventing access to fat reserves.

The second mechanism is autophagy, a cellular self-cleaning process where damaged proteins, dysfunctional organelles, and other cellular debris are broken down and recycled. Autophagy is upregulated during extended fasting — typically 24 to 48 or more hours — through the suppression of mTOR (mechanistic target of rapamycin, a nutrient sensor that promotes growth) and the activation of AMPK (AMP-activated protein kinase, an energy sensor that promotes catabolic pathways). Yoshinori Ohsumi won the 2016 Nobel Prize in Physiology or Medicine for elucidating the mechanisms of autophagy. Autophagy is a distinct benefit from the fat-burning effects of shorter fasts and is thought to contribute to cellular rejuvenation, reduced inflammation, and potentially longevity.`,
        url: null,
        imageData: null,
        mimeType: null,
        metadata: {
          author: 'Contextual Clarity',
          sources: 'Ohsumi Nobel Prize work; de Cabo & Mattson, NEJM 2019',
          wordCount: '225',
        },
      },
    ],
    pointLinks: [
      {
        pointContentSubstring: 'insulin drops, signaling fat cells',
        resourceTitle: 'Metabolic Mechanisms of Fasting: Lipolysis and Autophagy',
        relevance: 'Covers insulin-driven lipolysis mechanism and the 12-16 hour shift',
      },
      {
        pointContentSubstring: 'Autophagy — cellular self-cleaning',
        resourceTitle: 'Metabolic Mechanisms of Fasting: Lipolysis and Autophagy',
        relevance: 'Details autophagy via mTOR suppression and AMPK activation at 24-48+ hours',
      },
    ],
  },

  // 10. Sarcomere Contraction (Sliding Filament Theory)
  {
    recallSetName: 'Sarcomere Contraction (Sliding Filament Theory)',
    resources: [
      {
        title: 'The Sliding Filament Theory: How Muscles Contract at the Molecular Level',
        type: 'article',
        content: `Muscle contraction at the molecular level is explained by the sliding filament theory. Within each sarcomere — the basic contractile unit of muscle — two types of protein filaments interact: thick filaments composed of myosin and thin filaments composed of actin. During contraction, myosin heads bind to actin at specific binding sites, pivot in a power stroke that pulls the actin filament toward the center of the sarcomere, release, and reset to bind again. This ratcheting cycle is powered by ATP hydrolysis: each power stroke consumes one ATP molecule. The filaments themselves do not shorten — they overlap more, reducing the length of the sarcomere. Without ATP, myosin heads remain locked to actin, which is the molecular basis of rigor mortis.

Eccentric contractions — where the muscle lengthens under load (such as lowering a weight) — cause significantly more structural damage to muscle fibers than concentric contractions (shortening under load, such as lifting). The reason is that fewer motor units are recruited during eccentric work, so each active fiber bears a disproportionately higher load. This greater per-fiber stress produces more microtears, generating a stronger hypertrophy stimulus. It also explains delayed-onset muscle soreness (DOMS), which is more severe after eccentric-heavy exercise. The practical consequence: you can control more weight eccentrically than concentrically, which is why you can lower more than you can lift.`,
        url: null,
        imageData: null,
        mimeType: null,
        metadata: {
          author: 'Contextual Clarity',
          sources: 'Huxley & Niedergerke, 1954; Huxley & Hanson, 1954; Douglas et al., 2017',
          wordCount: '235',
        },
      },
    ],
    pointLinks: [
      {
        pointContentSubstring: 'Actin and myosin filaments slide past each other',
        resourceTitle: 'The Sliding Filament Theory: How Muscles Contract at the Molecular Level',
        relevance: 'Details the power stroke mechanism, ATP requirement, and rigor mortis',
      },
      {
        pointContentSubstring: 'Eccentric contractions',
        resourceTitle: 'The Sliding Filament Theory: How Muscles Contract at the Molecular Level',
        relevance: 'Explains why eccentric contractions cause more damage and greater hypertrophy stimulus',
      },
    ],
  },

  // 11. Mind-Muscle Connection
  {
    recallSetName: 'Mind-Muscle Connection',
    resources: [
      {
        title: 'The Mind-Muscle Connection: Internal Focus and EMG Activation',
        type: 'article',
        content: `The mind-muscle connection refers to the practice of consciously focusing attention on the target muscle during exercise. Research using electromyography (EMG) has demonstrated that internal focus — directing attention to the muscle being worked rather than the movement outcome — increases muscle activation. Schoenfeld and colleagues showed in a 2018 study that this increased activation translates to greater hypertrophy over time when compared to simply moving the weight from point A to point B.

The effect is most pronounced during isolation exercises at moderate loads. The mechanism involves increased motor unit recruitment in the target muscle when the lifter mentally "drives" the contraction through that specific muscle. However, the effect diminishes at very heavy loads above approximately 80% of one-rep maximum, where maximal effort naturally recruits all available motor units regardless of attentional focus. At heavy loads, external focus (thinking about moving the weight) may even be more effective for performance. The practical takeaway: use internal focus during hypertrophy-oriented isolation work at moderate loads, and shift to external focus during heavy compound lifts where performance matters more than targeted activation.`,
        url: null,
        imageData: null,
        mimeType: null,
        metadata: {
          author: 'Contextual Clarity',
          sources: 'Schoenfeld et al., 2018, European Journal of Sport Science; Calatayud et al., 2016',
          wordCount: '200',
        },
      },
    ],
  },

  // 12. Proprioception & Balance
  {
    recallSetName: 'Proprioception & Balance',
    resources: [
      {
        title: 'Proprioception: The Body\'s Hidden Sense of Position',
        type: 'article',
        content: `Proprioception is the body's sense of its own position, movement, and spatial orientation — often called the "sixth sense." It operates largely below conscious awareness and is mediated by three types of mechanoreceptors: muscle spindles embedded within muscle fibers detect changes in muscle length and the rate of change; Golgi tendon organs at muscle-tendon junctions detect tension; and joint receptors in joint capsules detect position and movement. These sensors feed a continuous stream of positional data to the cerebellum, which integrates it with vestibular (balance) and visual information to coordinate smooth, accurate movement. Proprioception is how you can touch your nose with your eyes closed. Alcohol impairs proprioceptive processing, which is why sobriety tests involve balance and coordination tasks.

Balance training — exercises on unstable surfaces, single-leg stances, and perturbation drills — improves proprioceptive acuity by strengthening the neural pathways between peripheral sensors and the cerebellum. The brain becomes more efficient at processing positional signals and generating rapid corrective responses. This has direct injury-prevention benefits: enhanced proprioception allows faster stabilization of joints under unexpected loads. Proprioception degrades naturally with age, contributing significantly to fall risk in elderly populations. It also degrades after injury, particularly ankle sprains and ACL tears, which is why balance rehabilitation is essential for preventing re-injury.`,
        url: null,
        imageData: null,
        mimeType: null,
        metadata: {
          author: 'Contextual Clarity',
          sources: 'Lephart et al., 2000; Riemann & Lephart, 2002, Journal of Athletic Training',
          wordCount: '230',
        },
      },
    ],
    pointLinks: [
      {
        pointContentSubstring: 'Proprioception is the body\'s sense',
        resourceTitle: 'Proprioception: The Body\'s Hidden Sense of Position',
        relevance: 'Details the three mechanoreceptor types and cerebellar integration',
      },
      {
        pointContentSubstring: 'Balance training improves proprioceptive acuity',
        resourceTitle: 'Proprioception: The Body\'s Hidden Sense of Position',
        relevance: 'Explains how balance training strengthens neural pathways and prevents injury',
      },
    ],
  },

  // 13. Central Limit Theorem
  {
    recallSetName: 'Central Limit Theorem',
    resources: [
      {
        title: 'The Central Limit Theorem: Foundation of Statistical Inference',
        type: 'article',
        content: `The Central Limit Theorem (CLT) is arguably the most important theorem in statistics. It states that the distribution of sample means approaches a normal distribution as the sample size increases, regardless of the shape of the underlying population distribution. Whether the population is skewed, bimodal, uniform, or wildly irregular, the means of sufficiently large random samples drawn from that population will cluster into a bell curve. The standard rule of thumb is that a sample size of n greater than or equal to 30 is sufficient for the CLT to provide a good approximation, though highly skewed distributions may require larger samples.

The CLT is the foundation of statistical inference — it is the reason confidence intervals and hypothesis tests work even when the raw data is not normally distributed. Since we can assume sample means are approximately normal, we can calculate probabilities, construct confidence intervals, and conduct significance tests using the normal distribution. Without the CLT, every statistical procedure would require knowing the exact shape of the population distribution, making modern statistics effectively impossible. The standard error of the mean decreases as sample size increases (by a factor of one over the square root of n), meaning larger samples produce tighter estimates of the population mean.`,
        url: null,
        imageData: null,
        mimeType: null,
        metadata: {
          author: 'Contextual Clarity',
          sources: 'Laplace, 1810; modern treatment in Casella & Berger, Statistical Inference',
          wordCount: '210',
        },
      },
    ],
  },

  // 14. Shannon Entropy
  {
    recallSetName: 'Shannon Entropy',
    resources: [
      {
        title: 'Shannon Entropy: Measuring Uncertainty and the Compression Limit',
        type: 'article',
        content: `Claude Shannon's 1948 paper "A Mathematical Theory of Communication" introduced entropy as a precise measure of uncertainty or information content in a message source. Shannon entropy is defined as H = -Sigma p(x) log base 2 of p(x), where the sum is over all possible outcomes x with their respective probabilities p(x). The unit is bits. A fair coin has entropy H = 1 bit — each flip delivers exactly one bit of information. A 99 percent biased coin has H of approximately 0.08 bits — the outcome is almost certain, so each flip tells you very little. Higher entropy means harder to predict and more information per symbol.

The profound connection between entropy and data compression is that no lossless compression algorithm can encode a message source below its entropy rate. Entropy is the theoretical floor on how compactly information can be represented. Huffman coding and arithmetic coding approach this theoretical limit by assigning shorter codes to more probable symbols and longer codes to rarer symbols. Random noise has maximum entropy — every symbol is equally probable — and is therefore incompressible. This is why compressed files cannot be compressed further: they already approach maximum information density. Encryption produces output that is statistically indistinguishable from random noise, which is why encrypted data also resists compression.`,
        url: null,
        imageData: null,
        mimeType: null,
        metadata: {
          author: 'Contextual Clarity',
          sources: 'Shannon, 1948, Bell System Technical Journal',
          wordCount: '220',
        },
      },
    ],
    pointLinks: [
      {
        pointContentSubstring: 'Shannon entropy H = -Σ p(x)',
        resourceTitle: 'Shannon Entropy: Measuring Uncertainty and the Compression Limit',
        relevance: 'Defines the entropy formula with concrete examples of fair vs biased coin',
      },
      {
        pointContentSubstring: 'Data compression cannot beat the entropy rate',
        resourceTitle: 'Shannon Entropy: Measuring Uncertainty and the Compression Limit',
        relevance: 'Explains the entropy floor on compression and why random noise is incompressible',
      },
    ],
  },

  // 15. Definition of a Group (Abstract Algebra)
  {
    recallSetName: 'Definition of a Group (Abstract Algebra)',
    resources: [
      {
        title: 'Groups in Abstract Algebra: Axioms, Examples, and Commutativity',
        type: 'article',
        content: `A group is a fundamental algebraic structure consisting of a set G equipped with a binary operation (dot) satisfying four axioms. Closure: for all a, b in G, the product a dot b is also in G. Associativity: for all a, b, c in G, (a dot b) dot c = a dot (b dot c). Identity element: there exists an element e in G such that e dot a = a dot e = a for all a. Inverses: for every element a in G, there exists an element a-inverse such that a dot a-inverse = a-inverse dot a = e. These four axioms capture the essence of "reversible composition" — they abstract the common structure found in number systems, symmetry transformations, and permutations.

The integers under addition, (Z, +), form a group: the identity is 0, and the inverse of any integer n is -n. However, the integers under multiplication, (Z, x), do not form a group — most integers lack a multiplicative inverse within the integers (there is no integer you can multiply 3 by to get 1). The same set can form a group under one operation and fail under another.

If the group operation is also commutative — meaning a dot b = b dot a for all elements — the group is called abelian, named after the Norwegian mathematician Niels Henrik Abel. Matrix multiplication under the general linear group GL(n) is non-abelian because AB does not equal BA in general. Most symmetry groups arising in physics are non-abelian, making this distinction practically important.`,
        url: null,
        imageData: null,
        mimeType: null,
        metadata: {
          author: 'Contextual Clarity',
          sources: 'Dummit & Foote, Abstract Algebra; Artin, Algebra',
          wordCount: '250',
        },
      },
    ],
    pointLinks: [
      {
        pointContentSubstring: 'A group is a set G with operation',
        resourceTitle: 'Groups in Abstract Algebra: Axioms, Examples, and Commutativity',
        relevance: 'States all four group axioms with the reversible composition interpretation',
      },
      {
        pointContentSubstring: '(ℤ, +) is a group',
        resourceTitle: 'Groups in Abstract Algebra: Axioms, Examples, and Commutativity',
        relevance: 'Provides (Z,+) as group example and (Z,x) as non-group counterexample',
      },
      {
        pointContentSubstring: 'abelian',
        resourceTitle: 'Groups in Abstract Algebra: Axioms, Examples, and Commutativity',
        relevance: 'Defines abelian groups and gives GL(n) as a non-abelian example',
      },
    ],
  },

  // 16. Fractal Dimension
  {
    recallSetName: 'Fractal Dimension',
    resources: [
      {
        title: 'Fractal Dimension: Measuring Roughness Across Scales',
        type: 'article',
        content: `Fractal dimension quantifies how the level of detail in a pattern changes with the scale at which it is measured. Unlike classical Euclidean geometry where objects have integer dimensions — a line is 1D, a plane is 2D, a volume is 3D — fractals can have non-integer dimensions that capture their complexity. The formula for self-similar fractals is d = log(N) / log(S), where N is the number of self-similar pieces and S is the scaling factor.

The Koch snowflake illustrates this elegantly. Each iteration replaces every line segment with four segments, each one-third the original length. The dimension is log(4) / log(3), which is approximately 1.26. The Koch snowflake is more than a line (dimension 1) but less than a plane (dimension 2) — it is too complex to be one-dimensional but does not fill two-dimensional space.

The "coastline paradox," introduced by Benoit Mandelbrot in 1967, demonstrates fractal geometry in nature. Measuring a coastline with a shorter ruler reveals more detail — inlets, coves, and irregularities that a longer ruler bridges over. As the measuring unit shrinks, the measured length increases without bound. Britain's coastline has a fractal dimension of approximately 1.25. A straight border has dimension 1.0; a coastline's fractional dimension quantifies its roughness. The more irregular the coastline, the higher the fractal dimension and the more dramatically its measured length increases with finer measurement resolution.`,
        url: null,
        imageData: null,
        mimeType: null,
        metadata: {
          author: 'Contextual Clarity',
          sources: 'Mandelbrot, 1967; Falconer, Fractal Geometry',
          wordCount: '240',
        },
      },
    ],
    pointLinks: [
      {
        pointContentSubstring: 'Koch snowflake has dimension log(4)/log(3)',
        resourceTitle: 'Fractal Dimension: Measuring Roughness Across Scales',
        relevance: 'Derives the Koch snowflake dimension and explains the d = log(N)/log(S) formula',
      },
      {
        pointContentSubstring: 'coastline has fractal dimension',
        resourceTitle: 'Fractal Dimension: Measuring Roughness Across Scales',
        relevance: 'Explains the coastline paradox and Mandelbrot 1967 measurement argument',
      },
    ],
  },

  // 17. Persistent Homology
  {
    recallSetName: 'Persistent Homology',
    resources: [
      {
        title: 'Persistent Homology: Finding the Shape of Data',
        type: 'article',
        content: `Persistent homology is a tool from topological data analysis that tracks topological features — connected components, loops, and voids — as a distance threshold parameter increases. The core idea is to build a growing sequence of simplicial complexes (a filtration) by expanding balls around data points. As the radius increases, balls overlap, forming edges, triangles, and higher-dimensional simplices. Topological features are born when new structures appear and die when they merge or fill in. Features that persist across many scales of the threshold parameter represent genuine structure in the data; features that appear and disappear quickly are noise.

The output is typically visualized as a persistence diagram: a scatter plot where each feature is represented as a point with coordinates (birth, death). Points far from the diagonal — where birth and death are close — represent robust, long-lived features. Points near the diagonal represent transient noise. This separation provides a principled way to distinguish signal from noise without assuming any particular model for the data.

Persistent homology detects features that other methods miss. Clustering algorithms find connected components but cannot detect loops or voids. Persistent homology naturally captures all of these topological features. The method is coordinate-free — it depends only on distances between points, not on an embedding in a particular space. Applications range from neuroscience (brain connectivity networks) to materials science (pore structure in materials) to genomics (shape of gene expression landscapes).`,
        url: null,
        imageData: null,
        mimeType: null,
        metadata: {
          author: 'Contextual Clarity',
          sources: 'Edelsbrunner & Harer, 2010; Ghrist, 2008, Bulletin of the AMS',
          wordCount: '240',
        },
      },
    ],
    pointLinks: [
      {
        pointContentSubstring: 'Persistent homology tracks topological features',
        resourceTitle: 'Persistent Homology: Finding the Shape of Data',
        relevance: 'Describes the filtration process and the signal-vs-noise persistence principle',
      },
      {
        pointContentSubstring: 'Persistence diagrams plot features as (birth, death)',
        resourceTitle: 'Persistent Homology: Finding the Shape of Data',
        relevance: 'Explains persistence diagrams and the diagonal proximity interpretation',
      },
    ],
  },
];
