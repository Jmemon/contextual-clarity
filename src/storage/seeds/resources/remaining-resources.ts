/**
 * Source Resources — Diverse Remaining Recall Sets (Sets 43-51)
 *
 * Source material for the final 9 recall sets covering advanced math,
 * philosophy, literature, psychology, history, and culinary arts.
 * Includes an image resource for the Fourier transform set.
 *
 * Integration points for these resources (handled by other tasks):
 * - T02: Tutor agent receives resource titles in system prompt
 * - T09: Rabbit hole agent receives full resource content
 * - T13: show_image event displays image resources in session
 */

import type { ResourceSeed } from './index';

export const remainingResources: ResourceSeed[] = [
  // 43. Gödel's Incompleteness Theorems
  {
    recallSetName: "Gödel's Incompleteness Theorems",
    resources: [
      {
        title: 'Gödel\'s Incompleteness Theorems: The Limits of Formal Systems',
        type: 'article',
        content: `Kurt Gödel's incompleteness theorems, published in 1931, are among the most profound results in the foundations of mathematics. The first theorem states that any consistent formal system powerful enough to express basic arithmetic contains true statements that cannot be proven within the system. The proof is built on self-reference: Gödel constructs a statement equivalent to "this statement is not provable in the system." If the system could prove it, the statement would be false (because it claims to be unprovable), making the system inconsistent. If the system cannot prove it, the statement is true (it is indeed unprovable), making the system incomplete. Either way, the system fails — it is either inconsistent or incomplete.

The second incompleteness theorem is even more devastating: no such system can prove its own consistency. To establish that a formal system is consistent, you need a strictly stronger system — which itself cannot prove its own consistency. This infinite regress killed Hilbert's program, which had aimed to establish the consistency and completeness of mathematics using finitary methods. The hope that mathematics could be placed on a firm, self-justifying foundation was shown to be impossible.

Gödel's theorems connect deeply to computability theory. Alan Turing's proof that the halting problem is undecidable (1936) is structurally parallel — both show that certain self-referential questions cannot be answered within the system that poses them. Provability and computability share the same fundamental limitations.`,
        url: null,
        imageData: null,
        mimeType: null,
        metadata: {
          author: 'Contextual Clarity',
          sources: 'Gödel, 1931; Nagel & Newman, Gödel\'s Proof; Hofstadter, Gödel Escher Bach',
          wordCount: '240',
        },
      },
    ],
    pointLinks: [
      {
        pointContentSubstring: 'First theorem: any consistent formal system',
        resourceTitle: 'Gödel\'s Incompleteness Theorems: The Limits of Formal Systems',
        relevance: 'Contains the self-referential proof structure and the completeness/consistency dilemma',
      },
      {
        pointContentSubstring: 'Second theorem: no such system can prove its own consistency',
        resourceTitle: 'Gödel\'s Incompleteness Theorems: The Limits of Formal Systems',
        relevance: 'Explains the infinite regress, Hilbert program destruction, and halting problem connection',
      },
    ],
  },

  // 44. Eigenvectors Geometrically
  {
    recallSetName: 'Eigenvectors Geometrically',
    resources: [
      {
        title: 'Eigenvectors: Natural Axes of Linear Transformations',
        type: 'article',
        content: `An eigenvector of a matrix A is a non-zero vector v that, when multiplied by A, only gets scaled — not rotated or otherwise transformed. Mathematically, Av = lambda v, where lambda (the eigenvalue) is the scaling factor. Most vectors change direction when a matrix is applied to them, but eigenvectors maintain their direction and only change magnitude. They reveal the "natural axes" of a linear transformation — the directions along which the transformation acts as simple scaling.

Consider a 2D transformation that doubles horizontal distances and halves vertical distances. The eigenvectors point along the horizontal and vertical axes, with eigenvalues 2 and 0.5 respectively. Any other vector gets both scaled and rotated by this transformation, but vectors along these two directions only get scaled.

Principal Component Analysis (PCA) leverages eigenvectors for dimensionality reduction. PCA computes the eigenvectors of the data's covariance matrix. The eigenvector associated with the largest eigenvalue points in the direction of greatest variance in the data — the most informative axis. The second-largest eigenvalue's eigenvector points in the direction of second-greatest variance, perpendicular to the first. By projecting data onto the top k eigenvectors, PCA reduces a 1000-dimensional dataset to perhaps 50 principal components while capturing 95 percent of the total variance. The eigenvalue itself tells you the proportion of variance explained by each component, providing a natural criterion for how many components to retain.`,
        url: null,
        imageData: null,
        mimeType: null,
        metadata: {
          author: 'Contextual Clarity',
          sources: 'Strang, Introduction to Linear Algebra; 3Blue1Brown, Essence of Linear Algebra',
          wordCount: '245',
        },
      },
    ],
    pointLinks: [
      {
        pointContentSubstring: 'eigenvector of matrix A only gets scaled',
        resourceTitle: 'Eigenvectors: Natural Axes of Linear Transformations',
        relevance: 'Explains Av = lambda v formula and the 2D horizontal/vertical stretch example',
      },
      {
        pointContentSubstring: 'PCA finds eigenvectors of the covariance matrix',
        resourceTitle: 'Eigenvectors: Natural Axes of Linear Transformations',
        relevance: 'Details PCA variance maximization and the 1000-to-50 dimensionality reduction example',
      },
    ],
  },

  // 45. How the Fourier Transform Decomposes Signals
  {
    recallSetName: 'How the Fourier Transform Decomposes Signals',
    resources: [
      {
        title: 'The Fourier Transform: Time to Frequency Domain',
        type: 'article',
        content: `The Fourier transform is a mathematical tool that decomposes any signal into its constituent sine waves at different frequencies, effectively converting a time-domain representation into a frequency-domain representation. Joseph Fourier demonstrated in 1807 that any periodic function can be expressed as an infinite sum of sines and cosines (a Fourier series). The Fourier transform generalizes this to non-periodic signals, decomposing an arbitrary waveform into a continuous spectrum of frequencies. The result tells you which frequencies are present in the signal and with what amplitude and phase.

The Fast Fourier Transform (FFT), published by Cooley and Tukey in 1965, computes the discrete Fourier transform in O(n log n) operations instead of the naive O(n squared). This algorithmic breakthrough made digital signal processing computationally feasible and is the foundation of virtually every modern audio and image technology. MP3 and AAC audio compression use FFT to identify which frequencies the human ear can and cannot perceive, discarding inaudible components. JPEG image compression applies a related transform (DCT) to identify spatial frequencies the eye cannot resolve. OFDM (Orthogonal Frequency Division Multiplexing), the basis of WiFi and 4G/5G, uses FFT to multiplex data across many frequencies simultaneously. MRI scanners, speech recognition systems, and seismographs all depend on FFT. Without the FFT algorithm, digital audio, video compression, and modern telecommunications would be computationally infeasible with available hardware.`,
        url: null,
        imageData: null,
        mimeType: null,
        metadata: {
          author: 'Contextual Clarity',
          sources: 'Fourier, 1807; Cooley & Tukey, 1965; Brigham, The Fast Fourier Transform',
          wordCount: '240',
        },
      },
      {
        title: 'Fourier Transform Frequency Decomposition',
        type: 'image',
        content: null,
        url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/72/Fourier_transform_time_and_frequency_domains_%28small%29.gif/320px-Fourier_transform_time_and_frequency_domains_%28small%29.gif',
        imageData: null,
        mimeType: 'image/gif',
        metadata: {
          license: 'CC BY-SA 3.0',
          source: 'Wikimedia Commons',
          description: 'Animated visualization showing how a complex waveform decomposes into individual sine wave components at different frequencies',
        },
      },
    ],
    pointLinks: [
      {
        pointContentSubstring: 'Fourier transform decomposes any signal into sine waves',
        resourceTitle: 'The Fourier Transform: Time to Frequency Domain',
        relevance: 'Covers the core decomposition concept and Fourier 1807 origin',
      },
      {
        pointContentSubstring: 'FFT computes the discrete Fourier transform in O(n log n)',
        resourceTitle: 'The Fourier Transform: Time to Frequency Domain',
        relevance: 'Details the FFT algorithm and its applications in MP3, JPEG, OFDM, MRI',
      },
    ],
  },

  // 46. Borges & The Library of Babel
  {
    recallSetName: 'Borges & The Library of Babel',
    resources: [
      {
        title: 'The Library of Babel: Total Information Equals No Information',
        type: 'excerpt',
        content: `Jorge Luis Borges' short story "The Library of Babel" (1941) describes an infinite library containing every possible 410-page book composed from 25 orthographic symbols (22 letters, the period, the comma, and the space). The library contains every book that has ever been written and every book that could ever be written — every true statement, every false statement, every coherent argument, and every possible sequence of gibberish characters. Somewhere in the library are the answers to every question humanity has ever asked, the cure for every disease, and the complete biography of every person who will ever live.

The paradox Borges illuminates is that total information equals no information. When every possible book exists, the probability of finding a specific meaningful book is vanishingly small — lost among the incomprehensibly vast majority of nonsensical volumes. A library that contains everything communicates nothing, because there is no way to distinguish the true from the false, the meaningful from the random. The library is a thought experiment about the difference between information and knowledge. Data (all possible arrangements of symbols) is not knowledge (meaningful, true, useful arrangements) without the ability to filter, evaluate, and select.

The story anticipates concepts in information theory and computational complexity: the library's content has maximum Shannon entropy (all symbol sequences equally likely), making it incompressible and unsearchable. Knowledge requires not just possession of information but the capacity to distinguish signal from noise.`,
        url: null,
        imageData: null,
        mimeType: null,
        metadata: {
          author: 'Paraphrased from Borges',
          source: 'The Library of Babel, from Ficciones (1941)',
          wordCount: '245',
        },
      },
    ],
  },

  // 47. Negative Capability (Keats)
  {
    recallSetName: 'Negative Capability (Keats)',
    resources: [
      {
        title: 'Negative Capability: Embracing Uncertainty Without Reaching for Closure',
        type: 'excerpt',
        content: `In a letter to his brothers George and Thomas in December 1817, John Keats coined the term "Negative Capability" to describe the creative capacity to remain "in uncertainties, mysteries, doubts, without any irritable reaching after fact and reason." The concept identifies a quality that Keats believed was essential to great literature and art: the ability to hold contradictions, tolerate ambiguity, and resist the impulse to force premature resolution or systematic explanation.

Keats identified Shakespeare as the supreme example of Negative Capability. Shakespeare's characters embody contradictory truths simultaneously — they are complex, inconsistent, and irreducible to a single philosophical position. Shakespeare does not impose a thesis on his material; he lets the tensions stand. Compare this to poets and philosophers who, in Keats's view, reach irritably after certainty — systematizing experience into neat conclusions at the expense of lived complexity.

The concept resonates far beyond literary criticism. In mindfulness practice, sitting with discomfort without reacting is a form of Negative Capability. In psychotherapy, the capacity to tolerate not-knowing rather than rushing to diagnosis enables deeper understanding. In creative work, the willingness to stay in ambiguity — to keep the question open rather than forcing an answer — often leads to more original and honest results. Negative Capability is the opposite of intellectual impatience; it is the discipline of remaining present with uncertainty long enough for genuine insight to emerge.`,
        url: null,
        imageData: null,
        mimeType: null,
        metadata: {
          author: 'Paraphrased from Keats',
          source: 'Letter to George and Thomas Keats, December 21, 1817',
          wordCount: '235',
        },
      },
    ],
  },

  // 48. Heidegger's Ready-to-Hand vs Present-at-Hand
  {
    recallSetName: "Heidegger's Ready-to-Hand vs Present-at-Hand",
    resources: [
      {
        title: 'Heidegger: Ready-to-Hand and Present-at-Hand Modes of Being',
        type: 'excerpt',
        content: `Martin Heidegger, in Being and Time (1927), distinguishes two fundamental modes of encountering things in the world. "Ready-to-hand" (Zuhandenheit) describes equipment in use — a tool that withdraws from conscious attention and becomes an extension of the user's purposeful activity. When you use a hammer to drive nails, the hammer itself disappears from awareness; you are absorbed in the activity of hammering. The tool is transparent — you experience the nail going in, not the hammer in your hand. Similarly, a skilled typist does not attend to individual keys but to the words and ideas flowing through the keyboard.

"Present-at-hand" (Vorhandenheit) is the mode of detached theoretical observation — encountering something as an object with properties to be examined. The hammer becomes present-at-hand when it breaks, when it is too heavy, or when you simply stop to inspect it. Breakdown is the paradigmatic occasion for the shift from ready-to-hand to present-at-hand. When a tool fails, it suddenly becomes conspicuous as an object.

Heidegger's insight is that our primary engagement with the world is absorbed practical activity, not detached observation. We encounter things first as tools-in-use, not as objects-with-properties. The theoretical, scientific stance — examining objects as collections of measurable properties — is derivative, arising only when practical engagement is disrupted. This reverses the traditional philosophical assumption (dating to Descartes) that detached observation is primary and practical engagement secondary.`,
        url: null,
        imageData: null,
        mimeType: null,
        metadata: {
          author: 'Paraphrased from Heidegger',
          source: 'Being and Time (Sein und Zeit), 1927, Division I',
          wordCount: '240',
        },
      },
    ],
  },

  // 49. Transference in Psychoanalysis
  {
    recallSetName: 'Transference in Psychoanalysis',
    resources: [
      {
        title: 'Transference and Countertransference: Projected Relational Patterns',
        type: 'article',
        content: `Transference is a psychoanalytic concept describing the patient's unconscious redirection of feelings and relational patterns — originally formed with early caregivers — onto the therapist. The patient does not simply talk about past relationships; they reenact them in the therapeutic relationship. A patient who experienced a controlling parent may perceive the therapist as controlling, or may behave in submissive ways that invite the therapist to take control. Freud initially viewed transference as an obstacle to treatment, but came to realize it was the treatment — the live reenactment of relational patterns in the room provides material for insight that abstract recollection cannot match. The therapist becomes a screen onto which the patient projects internalized relational dynamics.

Countertransference is the therapist's unconscious emotional reaction to the patient. Modern psychoanalytic practice treats the therapist's emotional responses not as clinical errors to be suppressed but as valuable diagnostic data. The therapist's feelings often mirror what other people in the patient's life experience. If a therapist consistently feels bored during sessions with a particular patient, that boredom likely reflects the patient's unconscious strategy of keeping others at emotional distance. If a therapist feels controlled or manipulated, that likely reflects the patient's characteristic relational pattern. By attending to and analyzing countertransference, the therapist gains direct access to the patient's interpersonal dynamics — not through the patient's self-report (which is filtered by defenses) but through the therapist's own lived experience in the relationship.`,
        url: null,
        imageData: null,
        mimeType: null,
        metadata: {
          author: 'Contextual Clarity',
          sources: 'Freud, Observations on Transference-Love; Heimann, 1950, On Counter-Transference',
          wordCount: '240',
        },
      },
    ],
    pointLinks: [
      {
        pointContentSubstring: 'Transference: the patient unconsciously redirects',
        resourceTitle: 'Transference and Countertransference: Projected Relational Patterns',
        relevance: 'Explains transference as live reenactment and the screen projection metaphor',
      },
      {
        pointContentSubstring: 'Countertransference: the therapist\'s unconscious emotional reaction',
        resourceTitle: 'Transference and Countertransference: Projected Relational Patterns',
        relevance: 'Covers countertransference as diagnostic data with the boredom/control examples',
      },
    ],
  },

  // 50. The Bretton Woods System & Its Collapse
  {
    recallSetName: 'The Bretton Woods System & Its Collapse',
    resources: [
      {
        title: 'Bretton Woods: The Dollar-Gold Peg and Its Collapse',
        type: 'article',
        content: `The Bretton Woods system, established in 1944 at a conference of 44 allied nations near the end of World War II, created the international monetary framework that governed global finance for nearly three decades. The core structure was a dollar-gold peg: the United States dollar was pegged to gold at a fixed rate of 35 dollars per ounce, and all other major currencies were pegged to the dollar at fixed exchange rates. The system also created two new international institutions — the International Monetary Fund (IMF) to manage exchange rate adjustments and provide emergency lending, and the World Bank to fund post-war reconstruction. The goal was to prevent the competitive currency devaluations that had deepened the Great Depression.

The system collapsed in 1971 when President Nixon unilaterally ended the dollar's convertibility to gold — an event known as the "Nixon Shock." The fundamental problem was Triffin's dilemma, identified by economist Robert Triffin in 1960. As the world's reserve currency, the US had to run persistent balance-of-payments deficits to supply enough dollars for global trade and reserves. But those same deficits gradually eroded confidence in the gold backing, because the total dollars held abroad increasingly exceeded the US gold reserves available to redeem them. The system contained its own destruction: fulfilling its role as reserve currency undermined the gold convertibility that gave it credibility.

After the collapse, the world transitioned to the floating exchange rate system still in use today, where currency values are determined by market supply and demand rather than fixed government pegs.`,
        url: null,
        imageData: null,
        mimeType: null,
        metadata: {
          author: 'Contextual Clarity',
          sources: 'Eichengreen, Globalizing Capital; Triffin, Gold and the Dollar Crisis (1960)',
          wordCount: '260',
        },
      },
    ],
    pointLinks: [
      {
        pointContentSubstring: 'Bretton Woods (1944): USD pegged to gold',
        resourceTitle: 'Bretton Woods: The Dollar-Gold Peg and Its Collapse',
        relevance: 'Details the 44-nation conference, $35/oz peg, and IMF/World Bank creation',
      },
      {
        pointContentSubstring: 'Collapsed 1971 (Nixon Shock)',
        resourceTitle: 'Bretton Woods: The Dollar-Gold Peg and Its Collapse',
        relevance: 'Explains Triffin dilemma and the transition to floating exchange rates',
      },
    ],
  },

  // 51. How to Make a Phenomenal Beef Ragù
  {
    recallSetName: 'How to Make a Phenomenal Beef Ragù',
    resources: [
      {
        title: 'Beef Ragù: Collagen, Braising, and the Pasta-in-Sauce Technique',
        type: 'article',
        content: `A phenomenal beef ragù depends on three fundamental principles: the right cut of meat, patient braising, and finishing the pasta in the sauce. The choice of cut is paramount — collagen-rich cuts like chuck roast and short ribs are essential because collagen, the connective tissue protein, converts to gelatin during prolonged cooking at temperatures between 160 and 180 degrees Fahrenheit. This conversion requires at least 3 hours of slow braising and produces the characteristic body and unctuous texture that lean cuts cannot replicate no matter how long they cook. Lean cuts simply dry out and tighten.

The process begins with cutting the meat into large chunks and hard-searing them in batches in a hot, heavy pot. The sear develops fond — the caramelized proteins stuck to the pot bottom that form the flavor base. After removing the meat, the soffritto (finely diced onion, carrot, and celery) cooks in the rendered fat. The pot is deglazed with red wine, dissolving the fond. Crushed tomatoes and the seared meat return to the pot, which then braises at a low simmer — either on the stovetop or in a 300-degree oven — for 3 to 4 hours until the meat is fork-tender and the collagen has fully converted to gelatin.

The final critical step: toss the cooked pasta directly in the ragù, never ladle sauce on top. Wide, textured pasta like pappardelle or tagliatelle catches and holds the sauce. Reserve starchy pasta water before draining and add it in splashes while tossing — the starch emulsifies with the fats in the ragù, creating a glossy glaze that clings to every strand rather than pooling at the bottom of the bowl. Finish with grated Parmigiano-Reggiano and a drizzle of good olive oil off the heat.`,
        url: null,
        imageData: null,
        mimeType: null,
        metadata: {
          author: 'Contextual Clarity',
          sources: 'Marcella Hazan, Essentials of Classic Italian Cooking; Kenji López-Alt, The Food Lab',
          wordCount: '300',
        },
      },
    ],
    pointLinks: [
      {
        pointContentSubstring: 'Collagen-rich cuts',
        resourceTitle: 'Beef Ragù: Collagen, Braising, and the Pasta-in-Sauce Technique',
        relevance: 'Explains why collagen-rich cuts are essential and the gelatin conversion process',
      },
      {
        pointContentSubstring: 'Toss pasta *in* the ragù',
        resourceTitle: 'Beef Ragù: Collagen, Braising, and the Pasta-in-Sauce Technique',
        relevance: 'Covers the pasta-in-sauce technique and starchy water emulsification',
      },
    ],
  },
];
