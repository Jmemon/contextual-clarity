/**
 * Seed Data Index
 *
 * This module re-exports all seed data for easy access from the seed runner.
 * Each recall set provides test/demo content for different subject areas.
 *
 * Available Recall Sets:
 * - Motivation: Concepts about action, resistance, and behavioral change
 * - ATP: Biochemistry fundamentals about cellular energy
 *
 * Usage:
 * ```typescript
 * import {
 *   motivationRecallSet,
 *   motivationRecallPoints,
 *   atpRecallSet,
 *   atpRecallPoints,
 * } from './seeds';
 * ```
 */

export {
  motivationRecallSet,
  motivationRecallPoints,
} from './motivation-recall-set';

export { atpRecallSet, atpRecallPoints } from './atp-recall-set';
