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
  ResourceRepository,
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
import type { ResourceSeed } from './seeds/resources';
import {
  motivationResources,
  atpResources,
  conceptualResources,
  proceduralResources,
  creativeResources,
  remainingResources,
} from './seeds/resources';

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
  resourceRepo: ResourceRepository,
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

    // Force mode: delete in FK-safe order
    console.log(`  Deleting existing "${recallSet.name}" recall set...`);

    // 1. Delete recall_point_resources (references both recall_points and resources)
    const existingPoints = await recallPointRepo.findByRecallSetId(existing.id);
    for (const point of existingPoints) {
      await resourceRepo.unlinkAllFromRecallPoint(point.id);
    }

    // 2. Delete recall_points (referenced by recall_point_resources, already cleared)
    for (const point of existingPoints) {
      await recallPointRepo.delete(point.id);
    }

    // 3. Delete resources (references recall_sets, referenced by recall_point_resources already cleared)
    await resourceRepo.deleteByRecallSetId(existing.id);

    // 4. Delete the recall_set itself
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
  const resourceRepo = new ResourceRepository(db);
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
      resourceRepo,
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

  // =========================================================================
  // Seed Resources
  // =========================================================================
  console.log('');
  console.log('Seeding resources...');

  // Combine all resource seed data into a single array
  const allResourceSeeds: ResourceSeed[] = [
    ...motivationResources,
    ...atpResources,
    ...conceptualResources,
    ...proceduralResources,
    ...creativeResources,
    ...remainingResources,
  ];

  let resourcesSeeded = 0;
  let resourcesSkipped = 0;

  for (const seed of allResourceSeeds) {
    // Find the recall set by name
    const recallSet = await recallSetRepo.findByName(seed.recallSetName);
    if (!recallSet) {
      console.log(`  WARNING: Recall set "${seed.recallSetName}" not found — skipping resources`);
      resourcesSkipped++;
      continue;
    }

    // Check if resources already exist for this recall set (skip if not forcing)
    const existingResources = await resourceRepo.findByRecallSetId(recallSet.id);
    if (existingResources.length > 0 && !force) {
      console.log(`  Skipping resources for "${seed.recallSetName}" — already exist`);
      resourcesSkipped++;
      continue;
    }

    // If force mode and resources exist, they were already deleted in the recall set force-delete above
    // (deleteByRecallSetId is called before the recall set is deleted)

    // Create all resources for this recall set
    const createdResources = await resourceRepo.createMany(
      seed.resources.map((r) => ({
        recallSetId: recallSet.id,
        title: r.title,
        type: r.type,
        content: r.content,
        url: r.url,
        imageData: r.imageData,
        mimeType: r.mimeType,
        metadata: r.metadata,
      }))
    );

    console.log(`  + ${createdResources.length} resource(s) for "${seed.recallSetName}"`);

    // Create point-level links if specified
    if (seed.pointLinks && seed.pointLinks.length > 0) {
      const recallPoints = await recallPointRepo.findByRecallSetId(recallSet.id);
      const links: Array<{ recallPointId: string; resourceId: string; relevance: string }> = [];

      for (const link of seed.pointLinks) {
        // Find the recall point whose content contains the substring
        const matchingPoint = recallPoints.find((p) =>
          p.content.includes(link.pointContentSubstring)
        );
        if (!matchingPoint) {
          console.log(`    WARNING: No recall point matching "${link.pointContentSubstring.substring(0, 40)}..." — skipping link`);
          continue;
        }

        // Find the resource by title
        const matchingResource = createdResources.find((r) => r.title === link.resourceTitle);
        if (!matchingResource) {
          console.log(`    WARNING: No resource with title "${link.resourceTitle}" — skipping link`);
          continue;
        }

        links.push({
          recallPointId: matchingPoint.id,
          resourceId: matchingResource.id,
          relevance: link.relevance,
        });
      }

      if (links.length > 0) {
        await resourceRepo.linkManyToRecallPoints(links);
        console.log(`    + ${links.length} point-level link(s)`);
      }
    }

    resourcesSeeded++;
  }

  // Print summary
  console.log('');
  console.log('Seeding complete!');
  console.log(`  Recall sets seeded: ${seededCount}`);
  console.log(`  Recall sets skipped: ${skippedCount}`);
  console.log(`  Resource sets seeded: ${resourcesSeeded}`);
  console.log(`  Resource sets skipped: ${resourcesSkipped}`);
}

// Execute the seeder
main().catch((error) => {
  console.error('Seeding failed:', error);
  process.exit(1);
});
