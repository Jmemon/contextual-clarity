/**
 * Database Seed Runner
 *
 * This script populates the database with test/demo recall sets and their
 * associated recall points. It's designed to be idempotent - running it
 * multiple times won't create duplicate data unless the --force flag is used.
 *
 * Usage:
 *   bun run db:seed           # Seeds only if not already seeded
 *   bun run db:seed --force   # Deletes existing and reseeds
 *
 * The seeder:
 * 1. Checks if each recall set already exists (by name)
 * 2. Skips existing sets unless --force is provided
 * 3. Creates recall sets with prefixed UUIDs (rs_*)
 * 4. Creates recall points with initial FSRS state (rp_*)
 *
 * Each recall point starts with:
 * - FSRS state = 'new' (never reviewed)
 * - Due date = now (immediately available for first review)
 * - Empty recall history
 */

import { db } from './db';
import {
  RecallSetRepository,
  RecallPointRepository,
} from './repositories';
import { FSRSScheduler } from '@/core/fsrs';
import {
  motivationRecallSet,
  motivationRecallPoints,
  atpRecallSet,
  atpRecallPoints,
  diverseConceptualSets,
  diverseProceduralSets,
  diverseCreativeSets,
  diverseRemainingSets,
} from './seeds';

/**
 * Represents a recall set definition for seeding.
 * Matches the structure of exported seed data.
 */
interface RecallSetSeed {
  name: string;
  description: string;
  status: 'active' | 'paused' | 'archived';
  discussionSystemPrompt: string;
}

/**
 * Represents a recall point definition for seeding.
 * The content and context are the only fields needed from seed data.
 */
interface RecallPointSeed {
  content: string;
  context: string;
}

/**
 * Generates a prefixed UUID suitable for database IDs.
 *
 * @param prefix - The prefix to prepend (e.g., 'rs', 'rp')
 * @returns A string in format `{prefix}_{uuid}`
 */
function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

/**
 * Seeds a single recall set and its associated recall points.
 *
 * This function handles the complete seeding process for one recall set:
 * 1. Checks if a set with the same name already exists
 * 2. If exists and not forcing, skips the set
 * 3. If forcing, deletes the existing set and its points
 * 4. Creates the new recall set with a fresh UUID
 * 5. Creates all recall points with initial FSRS state
 *
 * @param recallSetRepo - Repository for recall set operations
 * @param recallPointRepo - Repository for recall point operations
 * @param scheduler - FSRS scheduler for creating initial state
 * @param recallSet - The recall set seed data
 * @param recallPoints - Array of recall point seed data
 * @param force - If true, delete existing and reseed
 * @returns true if seeded, false if skipped
 */
async function seedRecallSet(
  recallSetRepo: RecallSetRepository,
  recallPointRepo: RecallPointRepository,
  scheduler: FSRSScheduler,
  recallSet: RecallSetSeed,
  recallPoints: RecallPointSeed[],
  force: boolean
): Promise<boolean> {
  // Check if this recall set already exists
  const existing = await recallSetRepo.findByName(recallSet.name);

  if (existing) {
    if (!force) {
      console.log(`  Skipping "${recallSet.name}" - already exists (use --force to reseed)`);
      return false;
    }

    // Force mode: delete existing recall points first (due to foreign key constraint)
    console.log(`  Deleting existing "${recallSet.name}" recall set...`);
    const existingPoints = await recallPointRepo.findByRecallSetId(existing.id);
    for (const point of existingPoints) {
      await recallPointRepo.delete(point.id);
    }
    await recallSetRepo.delete(existing.id);
  }

  // Generate a new UUID for the recall set
  const recallSetId = generateId('rs');

  // Create the recall set
  console.log(`  Creating "${recallSet.name}" recall set (${recallSetId})...`);
  await recallSetRepo.create({
    id: recallSetId,
    name: recallSet.name,
    description: recallSet.description,
    status: recallSet.status,
    discussionSystemPrompt: recallSet.discussionSystemPrompt,
  });

  // Create each recall point with initial FSRS state
  for (const point of recallPoints) {
    const pointId = generateId('rp');

    // Create initial FSRS state - point is immediately due for first review
    const initialFsrsState = scheduler.createInitialState();

    await recallPointRepo.create({
      id: pointId,
      recallSetId: recallSetId,
      content: point.content,
      context: point.context,
      fsrsState: initialFsrsState,
    });

    // Log a truncated version of the content for readability
    const truncatedContent =
      point.content.length > 60
        ? point.content.substring(0, 57) + '...'
        : point.content;
    console.log(`    + Recall point: "${truncatedContent}"`);
  }

  return true;
}

/**
 * Main seed function that orchestrates the seeding process.
 *
 * Iterates through all defined seed data sets and creates them
 * in the database. Respects the --force flag for reseeding.
 */
async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const force = args.includes('--force');

  console.log('Seeding database...');
  if (force) {
    console.log('(--force enabled: will reseed existing data)');
  }
  console.log('');

  // Initialize repositories and scheduler
  const recallSetRepo = new RecallSetRepository(db);
  const recallPointRepo = new RecallPointRepository(db);
  const scheduler = new FSRSScheduler();

  // Define all seed data sets to process (2 original + 51 diverse = 53 total)
  const seedSets: Array<{
    recallSet: RecallSetSeed;
    recallPoints: RecallPointSeed[];
  }> = [
    {
      recallSet: motivationRecallSet,
      recallPoints: motivationRecallPoints,
    },
    {
      recallSet: atpRecallSet,
      recallPoints: atpRecallPoints,
    },
    ...diverseConceptualSets,
    ...diverseProceduralSets,
    ...diverseCreativeSets,
    ...diverseRemainingSets,
  ];

  // Track seeding results
  let seededCount = 0;
  let skippedCount = 0;

  // Process each seed set
  for (const { recallSet, recallPoints } of seedSets) {
    const wasSeeded = await seedRecallSet(
      recallSetRepo,
      recallPointRepo,
      scheduler,
      recallSet,
      recallPoints,
      force
    );

    if (wasSeeded) {
      seededCount++;
    } else {
      skippedCount++;
    }
  }

  // Print summary
  console.log('');
  console.log('Seeding complete!');
  console.log(`  Seeded: ${seededCount} recall set(s)`);
  console.log(`  Skipped: ${skippedCount} recall set(s)`);
}

// Execute the seeder
main().catch((error) => {
  console.error('Seeding failed:', error);
  process.exit(1);
});
