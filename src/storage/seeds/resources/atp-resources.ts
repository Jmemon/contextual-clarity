/**
 * Source Resources — ATP Recall Set
 *
 * Source material backing the "atp" recall set, covering ATP structure,
 * energy transfer, regeneration pathways, and daily turnover.
 *
 * Integration points for these resources (handled by other tasks):
 * - T02: Tutor agent receives resource titles in system prompt
 * - T09: Rabbit hole agent receives full resource content
 * - T13: show_image event displays image resources in session
 */

import type { ResourceSeed } from './index';

export const atpResources: ResourceSeed[] = [
  {
    recallSetName: 'atp',
    resources: [
      {
        title: 'ATP: The Universal Energy Currency of Life',
        type: 'article',
        content: `Adenosine triphosphate (ATP) is the primary energy currency of all living cells. It consists of an adenosine molecule bonded to three phosphate groups, and it stores and transfers energy through the breaking of its phosphate bonds. When the terminal phosphate bond is hydrolyzed — cleaved by water — ATP releases approximately 7.3 kcal/mol of free energy and becomes adenosine diphosphate (ADP). This energy drives virtually every cellular process: muscle contraction, nerve impulse propagation, protein synthesis, and active transport across membranes.

The cell does not maintain large reserves of ATP. Instead, it continuously regenerates ATP from ADP through three interconnected metabolic pathways. Glycolysis, occurring in the cytoplasm, splits glucose into two pyruvate molecules and yields a net gain of 2 ATP per glucose. The citric acid cycle (Krebs cycle), operating in the mitochondrial matrix, processes acetyl-CoA derived from pyruvate and generates electron carriers (NADH, FADH2) along with 2 additional ATP. The major payoff comes from oxidative phosphorylation, where the electron transport chain in the inner mitochondrial membrane uses those electron carriers to generate a proton gradient, driving ATP synthase to produce approximately 30-32 ATP per glucose. Together, these pathways extract about 34-36 ATP from a single glucose molecule.

The turnover rate of ATP is remarkable. The human body contains only about 250 grams of ATP at any moment — roughly the weight of a large apple. Yet the body recycles its own weight in ATP every single day, consuming and regenerating between 40 and 75 kilograms of ATP daily. During intense exercise, the rate of ATP consumption can exceed 0.5 kg per minute. This astonishing recycling efficiency means each ATP molecule is regenerated from ADP hundreds of times per day. ATP is not stored in large quantities because it is not a fuel reserve — it is a transient energy shuttle, constantly being spent and remade to match the cell's moment-to-moment energy demands.`,
        url: null,
        imageData: null,
        mimeType: null,
        metadata: {
          author: 'Contextual Clarity',
          sources: 'Alberts et al. Molecular Biology of the Cell; Lehninger Principles of Biochemistry',
          wordCount: '305',
        },
      },
    ],
    pointLinks: [
      {
        pointContentSubstring: 'ATP stores and transfers energy',
        resourceTitle: 'ATP: The Universal Energy Currency of Life',
        relevance: 'Details the phosphate bond hydrolysis mechanism and 7.3 kcal/mol energy release',
      },
      {
        pointContentSubstring: 'glycolysis, citric acid cycle',
        resourceTitle: 'ATP: The Universal Energy Currency of Life',
        relevance: 'Covers all three regeneration pathways and their ATP yields',
      },
      {
        pointContentSubstring: 'ATP is not stored in large quantities',
        resourceTitle: 'ATP: The Universal Energy Currency of Life',
        relevance: 'Contains the 250g reserve and 40-75 kg daily recycling figures',
      },
    ],
  },
];
