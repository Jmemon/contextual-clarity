# T04 — Source Resources with Images

| Field | Value |
|-------|-------|
| **name** | Source Resources with Images |
| **parallel-group** | A (no dependencies) |
| **depends-on** | none |

---

## Description

Back ALL 51 recall sets with raw source resources (articles, excerpts, book passages). Add image support. Resources are referenced by agents during sessions — the RSA can quote from and reference this material, the rabbit hole agent uses it for deeper exploration, and the transcription pipeline uses terminology from it.

This task creates two new database tables (`resources` and `recall_point_resources`), a repository, an API endpoint, and comprehensive seed data covering all 51 recall sets.

---

## Detailed Implementation

### 1. New DB Table: `resources` (`src/storage/schema.ts`)

Add the `resources` table after the existing `recallPoints` table definition. This table stores source materials (articles, excerpts, book passages, images, reference notes) associated with a recall set.

Indexes MUST be passed as the third argument to `sqliteTable()` — standalone `index()` calls outside `sqliteTable()` will NOT create actual SQLite indexes. This matches the pattern used by `sessionMetrics`, `recallOutcomes`, `rabbitholeEvents`, and `messageTimings` in the existing schema.

```typescript
/**
 * Resources Table
 *
 * Stores source materials that back each recall set. These resources are
 * referenced by agents during sessions — the tutor quotes from them,
 * the rabbit hole agent uses them for deeper exploration, and the
 * transcription pipeline uses their terminology.
 *
 * Resource types:
 * - 'article': A short article or blog post (200-500 words)
 * - 'excerpt': A passage from a book or paper
 * - 'book_passage': A longer excerpt from a book (with citation)
 * - 'image': A visual resource (URL or base64 encoded)
 * - 'reference': A concise reference note or summary
 */
export const resources = sqliteTable(
  'resources',
  {
    // Unique identifier for the resource (UUID format)
    id: text('id').primaryKey(),

    // Foreign key to the recall set this resource belongs to
    recallSetId: text('recall_set_id').notNull().references(() => recallSets.id),

    // Human-readable title of the source material
    title: text('title').notNull(),

    // Classification of the resource's format
    type: text('type', { enum: ['article', 'excerpt', 'book_passage', 'image', 'reference'] }).notNull(),

    // Text content for articles, excerpts, book passages, and references.
    // Null for image-only resources.
    content: text('content'),

    // URL for web resources, external images, or DOI links.
    // Null for embedded content with no external source.
    url: text('url'),

    // Base64-encoded image data for small embedded images.
    // Only used when type is 'image' and the image is stored inline.
    imageData: text('image_data'),

    // MIME type for image resources (e.g., 'image/png', 'image/jpeg', 'image/svg+xml').
    // Null for non-image resources.
    mimeType: text('mime_type'),

    // Arbitrary key-value metadata (author, source, page number, license, etc.).
    // Stored as JSON. Example: { "author": "James Clear", "source": "Atomic Habits", "page": "42" }
    metadata: text('metadata', { mode: 'json' }).$type<Record<string, string>>(),

    // Timestamp when the resource was created (milliseconds since epoch)
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),

    // Timestamp when the resource was last modified (milliseconds since epoch)
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  // Index for efficient lookups by recallSetId — third arg to sqliteTable()
  (table) => [index('resources_recall_set_idx').on(table.recallSetId)]
);
```

Add type exports immediately after the table definition, following the existing pattern (e.g., `RecallSet`/`NewRecallSet` after `recallSets`):

```typescript
export type Resource = typeof resources.$inferSelect;
export type NewResource = typeof resources.$inferInsert;
```

### 2. New Junction Table: `recall_point_resources` (`src/storage/schema.ts`)

Links specific resources to specific recall points. A resource can be relevant to multiple points, and a point can have multiple resources.

The junction table MUST include an index on `recall_point_id` for query performance, matching the pattern used by all other relationship tables in the schema (e.g., `recallOutcomes` indexes `recall_point_id`).

```typescript
/**
 * Recall Point Resources Junction Table
 *
 * Many-to-many relationship between recall points and resources.
 * Links specific resources to the recall points they are most relevant to,
 * with an optional relevance description explaining the connection.
 */
export const recallPointResources = sqliteTable(
  'recall_point_resources',
  {
    // Unique identifier for this link (UUID format)
    id: text('id').primaryKey(),

    // Foreign key to the recall point
    recallPointId: text('recall_point_id').notNull().references(() => recallPoints.id),

    // Foreign key to the resource
    resourceId: text('resource_id').notNull().references(() => resources.id),

    // Brief description of why this resource is relevant to this specific recall point.
    // Example: "Contains the definition of the habit loop steps"
    relevance: text('relevance'),
  },
  // Index on recall_point_id for efficient lookups when querying resources for a point
  (table) => [index('recall_point_resources_rp_idx').on(table.recallPointId)]
);
```

Add type exports immediately after:

```typescript
export type RecallPointResource = typeof recallPointResources.$inferSelect;
export type NewRecallPointResource = typeof recallPointResources.$inferInsert;
```

### 3. Repository: `src/storage/repositories/resource.repository.ts`

Create a new repository following the existing pattern in `src/storage/repositories/base.ts`. The repository should use the same Drizzle ORM patterns seen in `recall-set.repository.ts` and `recall-point.repository.ts`.

**All repositories take `db: AppDatabase` as their constructor argument.** Match the existing convention:

```typescript
import { eq } from 'drizzle-orm';
import type { AppDatabase } from '../db';
import { resources, recallPointResources } from '../schema';
import type { Resource, NewResource, RecallPointResource } from '../schema';

/**
 * Extended resource type that includes the relevance description from
 * the junction table when querying resources by recall point.
 */
export interface ResourceWithRelevance extends Resource {
  relevance: string | null;
}

/**
 * Input type for creating a new resource.
 * Excludes auto-generated fields (id, createdAt, updatedAt).
 */
export type CreateResourceInput = Omit<NewResource, 'id' | 'createdAt' | 'updatedAt'>;

export class ResourceRepository {
  constructor(private readonly db: AppDatabase) {}

  /**
   * Find all resources belonging to a specific recall set.
   * Returns resources sorted by type (articles first, then excerpts, then images).
   */
  async findByRecallSetId(recallSetId: string): Promise<Resource[]>;

  /**
   * Find all resources linked to a specific recall point via the junction table.
   * Joins through recall_point_resources to get the actual resource records.
   * Includes the relevance description from the junction table.
   */
  async findByRecallPointId(recallPointId: string): Promise<ResourceWithRelevance[]>;

  /**
   * Find a single resource by its ID.
   */
  async findById(id: string): Promise<Resource | null>;

  /**
   * Create a single resource. Generates a UUID for the id field.
   * Sets createdAt and updatedAt to current timestamp.
   */
  async create(resource: CreateResourceInput): Promise<Resource>;

  /**
   * Create multiple resources in a single transaction.
   * Used by the seed runner to bulk-insert source materials.
   */
  async createMany(resources: CreateResourceInput[]): Promise<Resource[]>;

  /**
   * Create a link between a recall point and a resource.
   * Generates a UUID for the junction table id field.
   */
  async linkToRecallPoint(recallPointId: string, resourceId: string, relevance?: string): Promise<void>;

  /**
   * Create multiple links between recall points and resources in a single transaction.
   * Used by the seed runner when linking resources to all points in a set.
   */
  async linkManyToRecallPoints(links: Array<{ recallPointId: string; resourceId: string; relevance?: string }>): Promise<void>;
}
```

**Register the repository in `src/storage/repositories/index.ts`** by adding:

```typescript
// Resource repository and types
export {
  ResourceRepository,
  type ResourceWithRelevance,
  type CreateResourceInput,
} from './resource.repository';
```

### 4. Drizzle Migration

After modifying `schema.ts`, generate and apply a new Drizzle migration using the project's scripts:

```bash
bun run db:generate   # generates SQL migration file
bun run db:migrate    # applies via project's migration runner (src/storage/migrate.ts)
```

**Do NOT use `bun drizzle-kit push` or `drizzle-kit push`.** The project uses `src/storage/migrate.ts` for applying migrations.

Verify the migration SQL creates:
- `resources` table with all columns
- `recall_point_resources` junction table
- Index on `resources.recall_set_id` (via third arg to `sqliteTable`)
- Index on `recall_point_resources.recall_point_id` (via third arg to `sqliteTable`)
- Foreign key constraints

### 5. Source Materials for ALL 51 Recall Sets

Create seed files in `src/storage/seeds/resources/`. Organize by the same groupings as the recall set seed files:

- `src/storage/seeds/resources/motivation-resources.ts` — for the `motivation` recall set
- `src/storage/seeds/resources/atp-resources.ts` — for the `atp` recall set
- `src/storage/seeds/resources/conceptual-resources.ts` — for sets 1-17 (diverseConceptualSets)
- `src/storage/seeds/resources/procedural-resources.ts` — for sets 18-30 (diverseProceduralSets)
- `src/storage/seeds/resources/creative-resources.ts` — for sets 31-42 (diverseCreativeSets)
- `src/storage/seeds/resources/remaining-resources.ts` — for sets 43-51 (diverseRemainingSets)
- `src/storage/seeds/resources/index.ts` — re-exports all resource seed data

**For EACH of the 51 recall sets**, write a short (200-500 word) source passage that contains the information the recall points were derived from. The passage should read like it comes from a reference text — factual, clear, and dense with the specific terminology and facts the recall points test. Here are concrete guidelines:

**Content requirements per resource:**
- MUST contain every fact referenced in the recall set's `recallPoints[].content` fields
- MUST use the same terminology the recall points use (so the evaluator and tutor can cross-reference)
- SHOULD read as a coherent article/excerpt, not a list of bullet points
- Length: 200-500 words. Shorter for single-point sets, longer for multi-point sets.
- For sets based on real books (Atomic Habits, etc.): write a concise paraphrase, attributed properly in metadata. Do NOT copy verbatim from copyrighted text.
- For academic topics (Central Limit Theorem, etc.): write a textbook-style explanation passage
- For technical topics (Git Reflog, SSDs, etc.): write a technical reference excerpt

**Seed data structure:**

Each seed file exports an array of objects matching the recall set names exactly:

```typescript
export interface ResourceSeed {
  // Must EXACTLY match the recall set `name` field from the seed data.
  // The seed runner uses findByName() which does case-insensitive lookup,
  // but always use the exact casing from the source seed file for clarity.
  recallSetName: string;
  resources: Array<{
    title: string;
    type: 'article' | 'excerpt' | 'book_passage' | 'image' | 'reference';
    content: string | null;
    url: string | null;
    imageData: string | null;
    mimeType: string | null;
    metadata: Record<string, string> | null;
  }>;
  // Optional: link specific resources to specific recall points by content substring match
  pointLinks?: Array<{
    pointContentSubstring: string;  // substring of the recall point's content field to match
    resourceTitle: string;          // title of the resource to link
    relevance: string;              // why this resource is relevant
  }>;
}
```

**The 51 recall set names (EXACT values from seed files):**

From `motivation-recall-set.ts` (1 set):
1. `motivation`

From `atp-recall-set.ts` (1 set):
2. `atp`

From `diverse-conceptual.ts` (17 sets):
3. `Atomic Habits: The Habit Loop`
4. `Dunning-Kruger Effect`
5. `Sunk Cost Fallacy`
6. `Dopamine & Motivation`
7. `The Lindy Effect`
8. `Caffeine & Adenosine`
9. `How Muscle Growth Works`
10. `Sleep & Memory Consolidation`
11. `Intermittent Fasting Mechanisms`
12. `Sarcomere Contraction (Sliding Filament Theory)`
13. `Mind-Muscle Connection`
14. `Proprioception & Balance`
15. `Central Limit Theorem`
16. `Shannon Entropy`
17. `Definition of a Group (Abstract Algebra)`
18. `Fractal Dimension`
19. `Persistent Homology`

From `diverse-procedural.ts` (13 sets):
20. `Existentialism: Radical Freedom`
21. `Kafka's Metamorphosis as Alienation`
22. `Compound Interest`
23. `How SSDs Store Data`
24. `How Vinyl Records Encode Stereo Sound`
25. `Spaced Repetition: The Forgetting Curve`
26. `TypeScript Generics`
27. `Git Rebase vs Merge`
28. `Git Reflog & Recovery`
29. `React Re-rendering Mental Model`
30. `Backpropagation & Computational Graphs`
31. `How Espresso Extraction Works`
32. `The Ralph Wiggum Loop`

From `diverse-creative.ts` (12 sets):
33. `The Rule of Thirds in Composition`
34. `Color Temperature in Lighting`
35. `Why Minor Keys Sound Sad`
36. `How Mushroom Mycelium Networks Work`
37. `Ujjayi Breath & Vagal Tone`
38. `How LLM Tokenization Works`
39. `Superposition & Mechanistic Interpretability`
40. `How B-Tree Indexes Work`
41. `How Docker Containers Actually Isolate`
42. `The Gut-Brain Axis`
43. `Contour Drawing & Negative Space`
44. `How Chiaroscuro Creates Depth`

From `diverse-remaining.ts` (9 sets):
45. `Gödel's Incompleteness Theorems`
46. `Eigenvectors Geometrically`
47. `How the Fourier Transform Decomposes Signals`
48. `Borges & The Library of Babel`
49. `Negative Capability (Keats)`
50. `Heidegger's Ready-to-Hand vs Present-at-Hand`
51. `Transference in Psychoanalysis`
52. `The Bretton Woods System & Its Collapse` (note: numbering is 50 in seed file comments but this is the 50th diverse set)
53. `How to Make a Phenomenal Beef Ragù` (note: numbering is 51 in seed file comments; this is the last set)

> **Total: 2 original + 49 diverse = 51 recall sets.** The numbering above goes to 53 because the two original sets (motivation, atp) are listed first before the 49 diverse sets numbered 3-51 in the seed files. The actual count is 51 unique recall sets.

### 6. Image Resources for Visual Sets

For recall sets with visual content, include image resources in addition to text resources:

- **The Rule of Thirds in Composition** (set #33): Include an image resource with `type: 'image'` showing a 3x3 grid overlay example. Use a public domain or CC0-licensed image URL. Set `url` to a freely-usable image. Example: a Wikimedia Commons rule-of-thirds grid image. Set `metadata` to include `{ license: 'CC0', source: 'Wikimedia Commons' }`.

- **Color Temperature in Lighting** (set #34): Include an image showing the Kelvin scale from warm to cool.

- **How Chiaroscuro Creates Depth** (set #44): Include an image showing chiaroscuro technique example.

- **Contour Drawing & Negative Space** (set #43): Include an image showing gestural line and negative space examples.

- **How the Fourier Transform Decomposes Signals** (set #47): Include an image showing the Fourier decomposition or frequency-domain representation.

For image resources:
- Prefer `url` pointing to stable, freely-licensed images (Wikimedia Commons, Unsplash, Pexels)
- Set `mimeType` appropriately ('image/jpeg', 'image/png', 'image/svg+xml')
- Only use `imageData` (base64) for very small images (< 10KB, such as simple SVG diagrams)
- Always include `metadata` with license information

### 7. Agent Integration Point (Documentation Only)

Resources are NOT wired into agents in this task. This task creates the data layer. Later tasks will wire it:

- T02 (Universal Agent): Tutor prompt can reference: "Source material available: [titles]"
- T09 (Rabbit Holes): Rabbit hole agent gets full resource content for deeper exploration
- T13 (Events): `show_image` event tells frontend to display an image resource
- T11 (Progress): Resource titles could appear in session metadata

Add a comment at the top of each resource seed file:
```typescript
/**
 * Integration points for these resources (handled by other tasks):
 * - T02: Tutor agent receives resource titles in system prompt
 * - T09: Rabbit hole agent receives full resource content
 * - T13: show_image event displays image resources in session
 */
```

### 8. API Endpoint: Resources Routes

Create `src/api/routes/resources.ts` using the **factory function pattern** (matching `recallSetsRoutes()`, `sessionsRoutes()`, `dashboardRoutes()`):

```typescript
import { Hono } from 'hono';
import { db } from '@/storage/db';
import { ResourceRepository } from '@/storage/repositories/resource.repository';
import { success } from '../utils/response';

/**
 * Creates the resources API router.
 *
 * Provides endpoints for fetching resources associated with recall sets
 * and recall points. Uses the factory function pattern consistent with
 * all other route modules in the codebase.
 *
 * Routes (relative to mount point):
 * - GET /:recallSetId/resources — resources for a recall set
 * - GET /by-point/:recallPointId — resources linked to a recall point
 */
export function resourcesRoutes(): Hono {
  const router = new Hono();

  // Repository initialized with the shared db instance
  const repo = new ResourceRepository(db);

  /**
   * GET /:recallSetId/resources
   *
   * Returns all resources associated with a recall set.
   * Response includes text content, image URLs, and metadata.
   * Image base64 data is excluded by default (use ?includeImageData=true to include).
   */
  router.get('/:recallSetId/resources', async (c) => {
    const recallSetId = c.req.param('recallSetId');
    const includeImageData = c.req.query('includeImageData') === 'true';

    const resources = await repo.findByRecallSetId(recallSetId);

    // Strip base64 image data unless explicitly requested (large payloads)
    const responseResources = includeImageData
      ? resources
      : resources.map(r => ({ ...r, imageData: r.imageData ? '[base64 omitted]' : null }));

    return success(c, responseResources);
  });

  /**
   * GET /by-point/:recallPointId
   *
   * Returns all resources linked to a specific recall point.
   * Includes the relevance description from the junction table.
   */
  router.get('/by-point/:recallPointId', async (c) => {
    const recallPointId = c.req.param('recallPointId');

    const resources = await repo.findByRecallPointId(recallPointId);

    return success(c, resources);
  });

  return router;
}
```

**Route mount strategy explained:**

The router is mounted in `createApiRouter()` at `/recall-sets`, so the full paths become:
- `GET /api/recall-sets/:recallSetId/resources` — resources for a recall set
- `GET /api/recall-sets/by-point/:recallPointId` — resources linked to a recall point

This nests naturally under the existing `/api/recall-sets` namespace. The `by-point` sub-path avoids collision with recall set IDs because IDs use the `rs_` prefix format.

**Register in `src/api/routes/index.ts`:**

1. Add import:
```typescript
import { resourcesRoutes } from './resources';
```

2. Add to re-export block:
```typescript
export { resourcesRoutes } from './resources';
```

3. Mount in `createApiRouter()` alongside existing routes:
```typescript
// Mount resource routes nested under recall-sets
router.route('/recall-sets', resourcesRoutes());
```

> **Note:** This does NOT conflict with the existing `router.route('/recall-sets', recallSetsRoutes())` call because Hono merges routes from multiple `.route()` calls at the same path prefix. The existing recall-sets routes handle `GET /`, `POST /`, `GET /:id`, etc., while resource routes handle `GET /:recallSetId/resources` and `GET /by-point/:recallPointId` — no path collisions.

4. Add to the `endpoints` array in the API root endpoint:
```typescript
{ path: '/api/recall-sets/:id/resources', description: 'Source resources for a recall set' },
```

### 9. Seed Runner Update

Modify `src/storage/seed.ts` (the existing seed runner where `motivationRecallSet` and `diverseConceptualSets` are imported and inserted) to also seed resources:

1. Import the `ResourceRepository` and resource seed data
2. After seeding recall sets and recall points, seed resources
3. For each resource seed entry, use `recallSetRepo.findByName(recallSetName)` to get the recall set ID
4. Insert resource records with generated UUIDs using `ResourceRepository.createMany()`
5. If `pointLinks` are provided, match `pointContentSubstring` against recall point `content` fields to find the correct recall point IDs, then insert junction table records using `ResourceRepository.linkManyToRecallPoints()`

**CRITICAL: FK constraint handling in `--force` mode.**

After T04 adds FK constraints (`resources.recall_set_id` references `recallSets.id`, `recall_point_resources.recall_point_id` references `recallPoints.id`, `recall_point_resources.resource_id` references `resources.id`), the delete order in the `--force` path of `seedRecallSet()` MUST be updated. The correct delete order is:

1. Delete `recall_point_resources` rows for all recall points in this set
2. Delete `recall_points` rows for this recall set
3. Delete `resources` rows for this recall set
4. Delete the `recall_set` row itself

The current code (lines 108-112 of `seed.ts`) only deletes recall points then the recall set. After T04, it must also delete resources and junction table entries first. Update the force-delete block to:

```typescript
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
```

This requires adding two helper methods to `ResourceRepository`:
- `unlinkAllFromRecallPoint(recallPointId: string): Promise<void>` — deletes all `recall_point_resources` rows for a given recall point
- `deleteByRecallSetId(recallSetId: string): Promise<void>` — deletes all `resources` rows for a given recall set

---

## Relevant Files

| Action | File | What Changes |
|--------|------|-------------|
| MODIFY | `src/storage/schema.ts` | Add `resources` table (with index as 3rd arg), `recallPointResources` junction table (with index as 3rd arg), and type exports (`Resource`, `NewResource`, `RecallPointResource`, `NewRecallPointResource`) |
| CREATE | Migration file (auto-generated by `bun run db:generate`) | SQL for new tables, indexes, and FK constraints |
| CREATE | `src/storage/repositories/resource.repository.ts` | Repository with `findByRecallSetId`, `findByRecallPointId`, `findById`, `create`, `createMany`, `linkToRecallPoint`, `linkManyToRecallPoints`, `unlinkAllFromRecallPoint`, `deleteByRecallSetId` |
| MODIFY | `src/storage/repositories/index.ts` | Export `ResourceRepository`, `ResourceWithRelevance`, `CreateResourceInput` |
| CREATE | `src/storage/seeds/resources/motivation-resources.ts` | Source material for `motivation` set |
| CREATE | `src/storage/seeds/resources/atp-resources.ts` | Source material for `atp` set |
| CREATE | `src/storage/seeds/resources/conceptual-resources.ts` | Source material for sets 3-19 (diverseConceptualSets) |
| CREATE | `src/storage/seeds/resources/procedural-resources.ts` | Source material for sets 20-32 (diverseProceduralSets) |
| CREATE | `src/storage/seeds/resources/creative-resources.ts` | Source material for sets 33-44 (diverseCreativeSets) |
| CREATE | `src/storage/seeds/resources/remaining-resources.ts` | Source material for sets 45-51 (diverseRemainingSets) |
| CREATE | `src/storage/seeds/resources/index.ts` | Re-exports all resource seed data |
| CREATE | `src/api/routes/resources.ts` | API endpoints using factory function pattern (`resourcesRoutes()`) with `success()` helper |
| MODIFY | `src/api/routes/index.ts` | Import `resourcesRoutes`, add to re-export block, mount with `router.route('/recall-sets', resourcesRoutes())` |
| MODIFY | `src/storage/seed.ts` | Import ResourceRepository + resource seeds, add resource seeding after recall point seeding, update `--force` delete order to handle FK constraints |

---

## Success Criteria

1. **Schema**: `resources` table exists with columns: `id`, `recall_set_id`, `title`, `type`, `content`, `url`, `image_data`, `mime_type`, `metadata`, `created_at`, `updated_at`. All column types and constraints match the specification.
2. **Schema**: `recall_point_resources` junction table exists with columns: `id`, `recall_point_id`, `resource_id`, `relevance`. Foreign keys reference the correct parent tables.
3. **Index**: An index exists on `resources.recall_set_id` defined as the third argument to `sqliteTable()`, NOT as a standalone export.
4. **Index**: An index exists on `recall_point_resources.recall_point_id` defined as the third argument to `sqliteTable()`.
5. **Migration**: Drizzle migration generates and applies cleanly with `bun run db:generate` and `bun run db:migrate`. No errors.
6. **Type exports**: `Resource`, `NewResource`, `RecallPointResource`, `NewRecallPointResource` are exported from `schema.ts` using `$inferSelect`/`$inferInsert` pattern.
7. **Repository**: `ResourceRepository` constructor takes `db: AppDatabase` as its argument (not no-arg constructor). Instantiated as `new ResourceRepository(db)`.
8. **Repository**: `ResourceRepository` implements all eight methods: `findByRecallSetId`, `findByRecallPointId`, `findById`, `create`, `createMany`, `linkToRecallPoint`, `linkManyToRecallPoints`, `unlinkAllFromRecallPoint`, `deleteByRecallSetId`.
9. **Repository**: `findByRecallSetId` returns an empty array (not null, not error) for a recall set with no resources.
10. **Repository**: `findByRecallPointId` joins through the junction table and includes the `relevance` field.
11. **Repository**: `createMany` uses a transaction so either all resources are created or none.
12. **Coverage**: ALL 51 recall sets have at least one source resource seeded. Zero sets are left without a resource. Every `recallSetName` in resource seed data exactly matches a `name` field from the recall set seed files.
13. **Content quality**: Each source resource is 200-500 words, reads as a coherent article/excerpt (not bullet points), and contains every fact referenced in the corresponding recall set's recall points.
14. **Content accuracy**: The terminology in each resource matches the terminology in the recall points it backs. If a recall point says "cue, craving, response, reward", the resource uses those exact terms.
15. **Image resources**: At least 5 visual recall sets have image resources with valid URLs pointing to freely-licensed images. Each image resource has `mimeType` set and `metadata` containing license info.
16. **Junction table**: Resources are linked to specific recall points via `recall_point_resources` where a clear relationship exists. Not every resource needs to be linked to specific points (set-level resources are fine), but multi-point sets should have at least some point-level links.
17. **API endpoint**: `GET /api/recall-sets/:id/resources` returns the correct resources for a given recall set ID, wrapped in `{ success: true, data: [...] }` format via the `success()` helper.
18. **API endpoint**: `GET /api/recall-sets/by-point/:id` returns resources linked to a specific recall point, including the `relevance` field, wrapped in `{ success: true, data: [...] }` format.
19. **API endpoint**: The `?includeImageData=true` query parameter controls whether base64 image data is included in the response. Without it, `imageData` is replaced with `'[base64 omitted]'`.
20. **Route registration**: `resourcesRoutes` is a factory function exported from `src/api/routes/resources.ts`, re-exported from `src/api/routes/index.ts`, and mounted in `createApiRouter()`.
21. **Seed runner**: Running `bun run db:seed` creates all resources and junction table links without errors. Resources are correctly associated with their recall sets by name matching.
22. **Seed runner FK safety**: Running `bun run db:seed --force` deletes in the correct order: (1) recall_point_resources, (2) recall_points, (3) resources, (4) recall_set. No FK constraint violations.
23. **No regressions**: Existing recall set and recall point seeding still works. No existing tests break.
24. **Repository registered**: `ResourceRepository` is exported from `src/storage/repositories/index.ts` alongside existing repositories.

---

## Implementation Warnings

> **WARNING: Recall set names must match EXACTLY**
> The list of 51 recall set names in Section 5 was extracted directly from the seed files. Every `recallSetName` in the resource seed data MUST use one of these exact values. The seed runner uses `recallSetRepo.findByName()` which does case-insensitive lookup, but using the exact casing from the source files avoids any ambiguity. If a name is wrong, that recall set will get no resources.

> **WARNING: FK constraints with seed re-runs**
> When `--force` mode deletes existing data before re-seeding, the delete order is critical. After T04 adds FK constraints, the seed runner MUST delete in this exact order: (1) `recall_point_resources` (junction table), (2) `recall_points`, (3) `resources`, (4) `recall_sets`. Violating this order will cause FK constraint errors. See Section 9 for the exact code.

> **WARNING: Do NOT use standalone index exports**
> Indexes defined as `export const fooIdx = index(...)` outside `sqliteTable()` will NOT create actual SQLite indexes. Always define indexes as the third argument to `sqliteTable()`. See the `sessionMetrics`, `recallOutcomes`, `rabbitholeEvents`, and `messageTimings` tables in `schema.ts` for the correct pattern.

> **WARNING: Use `success()` helper, not raw `c.json()`**
> All API responses must use `success(c, data)` from `src/api/utils/response.ts`, returning `{ success: true, data: T }`. Never return raw `c.json({ resources: [] })` or other custom shapes.
