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
export const resources = sqliteTable('resources', {
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
});
```

Also add an index for efficient lookups by `recallSetId`:
```typescript
// At the bottom of schema.ts, alongside other index definitions:
export const resourcesRecallSetIdx = index('resources_recall_set_idx').on(resources.recallSetId);
```

### 2. New Junction Table: `recall_point_resources` (`src/storage/schema.ts`)

Links specific resources to specific recall points. A resource can be relevant to multiple points, and a point can have multiple resources.

```typescript
/**
 * Recall Point Resources Junction Table
 *
 * Many-to-many relationship between recall points and resources.
 * Links specific resources to the recall points they are most relevant to,
 * with an optional relevance description explaining the connection.
 */
export const recallPointResources = sqliteTable('recall_point_resources', {
  // Unique identifier for this link (UUID format)
  id: text('id').primaryKey(),

  // Foreign key to the recall point
  recallPointId: text('recall_point_id').notNull().references(() => recallPoints.id),

  // Foreign key to the resource
  resourceId: text('resource_id').notNull().references(() => resources.id),

  // Brief description of why this resource is relevant to this specific recall point.
  // Example: "Contains the definition of the habit loop steps"
  relevance: text('relevance'),
});
```

### 3. Repository: `src/storage/repositories/resource.repository.ts`

Create a new repository following the existing pattern in `src/storage/repositories/base.ts`. The repository should use the same Drizzle ORM patterns seen in `recall-set.repository.ts` and `recall-point.repository.ts`.

**Required methods:**

```typescript
import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import { resources, recallPointResources } from '../schema';

export class ResourceRepository {
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

**Type definitions** (in the same file or a separate types file):

```typescript
export interface Resource {
  id: string;
  recallSetId: string;
  title: string;
  type: 'article' | 'excerpt' | 'book_passage' | 'image' | 'reference';
  content: string | null;
  url: string | null;
  imageData: string | null;
  mimeType: string | null;
  metadata: Record<string, string> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ResourceWithRelevance extends Resource {
  relevance: string | null;
}

export type CreateResourceInput = Omit<Resource, 'id' | 'createdAt' | 'updatedAt'>;
```

**Register the repository in `src/storage/repositories/index.ts`** by adding the export.

### 4. Drizzle Migration

After modifying `schema.ts`, generate a new Drizzle migration:

```bash
bun drizzle-kit generate
```

This will create a migration file in the `drizzle/` or `migrations/` directory (wherever the project stores them). Verify the migration SQL creates:
- `resources` table with all columns
- `recall_point_resources` junction table
- Index on `resources.recall_set_id`
- Foreign key constraints

Apply the migration:
```bash
bun drizzle-kit push
```

### 5. Source Materials for ALL 51 Recall Sets

Create seed files in `src/storage/seeds/resources/`. Organize by the same groupings as the recall set seed files:

- `src/storage/seeds/resources/motivation-resources.ts` — for the `motivationRecallSet` (Motivation Theory, 5 sessions worth of content)
- `src/storage/seeds/resources/atp-resources.ts` — for `atpRecallSet` (ATP Biochemistry, 5 sessions worth of content)
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
  // Must match the recall set name exactly (used by seed runner to link)
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

**The 51 sets to cover** (reference the seed files for exact names):

From `motivation-recall-set.ts`: Motivation Theory (one set, 5+ recall points)
From `atp-recall-set.ts`: ATP Biochemistry (one set, 5+ recall points)
From `diverse-conceptual.ts` (sets 1-17):
1. Atomic Habits: The Habit Loop
2. Dunning-Kruger Effect
3. Sunk Cost Fallacy
4. Flow State (Csikszentmihalyi)
5. Cognitive Dissonance
6. Caffeine & Adenosine
7. How Mushroom Mycelium Networks Work
8. Gut-Brain Axis
9. Circadian Rhythm & Melatonin
10. mRNA Vaccines
11. Herd Immunity Thresholds
12. Antibiotic Resistance
13. Central Limit Theorem
14. Bayes' Theorem
15. Shannon Entropy
16. Compound Interest
17. Spaced Repetition: The Forgetting Curve

From `diverse-procedural.ts` (sets 18-30):
18. Existentialism: Radical Freedom
19. Stoicism: Dichotomy of Control
20. How SSDs Store Data
21. How Bridges Distribute Load
22. Why Airplane Wings Generate Lift
23. How Sourdough Fermentation Works
24. How Espresso Extraction Works
25. How Vinyl Records Store Sound
26. Git Reflog & Recovery
27. TCP Three-Way Handshake
28. DNS Resolution
29. Docker Container vs VM
30. OAuth 2.0 Authorization Flow

From `diverse-creative.ts` (sets 31-42):
31. The Rule of Thirds in Composition
32. Color Temperature in Lighting
33. Why Minor Keys Sound Sad
34. How Coral Reefs Form
35. Diaphragmatic Breathing
36. Gradient Descent in Neural Networks
37. Transformer Attention Mechanism
38. CAP Theorem
39. How Undersea Cables Work
40. Neuroplasticity
41. Gesture Drawing
42. Perspective Drawing: One-Point vs Two-Point

From `diverse-remaining.ts` (sets 43-51):
43. Godel's Incompleteness Theorems
44. Fibonacci Sequence in Nature
45. Monty Hall Problem
46. Allegory of the Cave
47. Kafka's Metamorphosis
48. Ship of Theseus
49. Bystander Effect
50. Tulip Mania
51. Maillard Reaction

### 6. Image Resources for Visual Sets

For recall sets with visual content, include image resources in addition to text resources:

- **The Rule of Thirds in Composition** (set 31): Include an image resource with `type: 'image'` showing a 3x3 grid overlay example. Use a public domain or CC0-licensed image URL. Set `url` to a freely-usable image. Example: a Wikimedia Commons rule-of-thirds grid image. Set `metadata` to include `{ license: 'CC0', source: 'Wikimedia Commons' }`.

- **Color Temperature in Lighting** (set 32): Include an image showing the Kelvin scale from warm to cool.

- **Perspective Drawing** (set 42): Include an image showing one-point vs two-point perspective.

- **Gesture Drawing** (set 41): Include an image showing gestural line examples.

- **Fibonacci Sequence in Nature** (set 44): Include an image showing the Fibonacci spiral in nature (nautilus shell, sunflower, etc.).

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

### 8. API Endpoint: `GET /api/recall-sets/:id/resources`

Create `src/api/routes/resources.ts`:

```typescript
import { Hono } from 'hono';
import { ResourceRepository } from '@/storage/repositories/resource.repository';

const resourceRoutes = new Hono();

/**
 * GET /api/recall-sets/:id/resources
 *
 * Returns all resources associated with a recall set.
 * Response includes text content, image URLs, and metadata.
 * Image base64 data is excluded by default (use ?includeImageData=true to include).
 */
resourceRoutes.get('/recall-sets/:id/resources', async (c) => {
  const recallSetId = c.req.param('id');
  const includeImageData = c.req.query('includeImageData') === 'true';

  const repo = new ResourceRepository();
  const resources = await repo.findByRecallSetId(recallSetId);

  if (!resources.length) {
    return c.json({ resources: [] });
  }

  // Strip base64 image data unless explicitly requested (large payloads)
  const responseResources = includeImageData
    ? resources
    : resources.map(r => ({ ...r, imageData: r.imageData ? '[base64 omitted]' : null }));

  return c.json({ resources: responseResources });
});

/**
 * GET /api/recall-points/:id/resources
 *
 * Returns all resources linked to a specific recall point.
 * Includes the relevance description from the junction table.
 */
resourceRoutes.get('/recall-points/:id/resources', async (c) => {
  const recallPointId = c.req.param('id');

  const repo = new ResourceRepository();
  const resources = await repo.findByRecallPointId(recallPointId);

  return c.json({ resources });
});

export { resourceRoutes };
```

Register in `src/api/routes/index.ts` (NOT `server.ts`):
- Import `resourceRoutes` from `./resources`
- Mount it in the `createApiRouter()` factory function (same pattern as existing routes like `recall-sets.ts` and `sessions.ts`)
- **NOTE:** All existing routes are registered in `src/api/routes/index.ts` via `createApiRouter()`, not directly in `server.ts`. Follow the existing convention.

### 9. Seed Runner Update

Modify the existing seed runner (find it by searching for where `motivationRecallSet` or `diverseConceptualSets` are imported and inserted) to also seed resources:

1. After seeding recall sets and recall points, seed resources
2. For each resource seed entry, match `recallSetName` to the recall set ID that was just inserted
3. Insert resource records with generated UUIDs
4. If `pointLinks` are provided, match `pointContentSubstring` against recall point `content` fields to find the correct recall point IDs, then insert junction table records

---

## Relevant Files

| Action | File | What Changes |
|--------|------|-------------|
| MODIFY | `src/storage/schema.ts` | Add `resources` table, `recallPointResources` junction table, and index |
| CREATE | Migration file (auto-generated by `bun drizzle-kit generate`) | SQL for new tables |
| CREATE | `src/storage/repositories/resource.repository.ts` | Repository with `findByRecallSetId`, `findByRecallPointId`, `create`, `createMany`, `linkToRecallPoint`, `linkManyToRecallPoints` |
| MODIFY | `src/storage/repositories/index.ts` | Export `ResourceRepository` |
| CREATE | `src/storage/seeds/resources/motivation-resources.ts` | Source material for Motivation Theory set |
| CREATE | `src/storage/seeds/resources/atp-resources.ts` | Source material for ATP Biochemistry set |
| CREATE | `src/storage/seeds/resources/conceptual-resources.ts` | Source material for sets 1-17 |
| CREATE | `src/storage/seeds/resources/procedural-resources.ts` | Source material for sets 18-30 |
| CREATE | `src/storage/seeds/resources/creative-resources.ts` | Source material for sets 31-42 |
| CREATE | `src/storage/seeds/resources/remaining-resources.ts` | Source material for sets 43-51 |
| CREATE | `src/storage/seeds/resources/index.ts` | Re-exports all resource seed data |
| CREATE | `src/api/routes/resources.ts` | API endpoints for fetching resources |
| MODIFY | `src/api/routes/index.ts` | Register resource routes in `createApiRouter()` (NOT `server.ts` — follow existing route registration pattern) |
| MODIFY | Seed runner file (wherever `motivationRecallSet` is inserted) | Add resource seeding logic after recall set/point seeding |

---

## Success Criteria

1. **Schema**: `resources` table exists with columns: `id`, `recall_set_id`, `title`, `type`, `content`, `url`, `image_data`, `mime_type`, `metadata`, `created_at`, `updated_at`. All column types and constraints match the specification.
2. **Schema**: `recall_point_resources` junction table exists with columns: `id`, `recall_point_id`, `resource_id`, `relevance`. Foreign keys reference the correct parent tables.
3. **Index**: An index exists on `resources.recall_set_id` for efficient lookups.
4. **Migration**: Drizzle migration generates and applies cleanly with `bun drizzle-kit generate` and `bun drizzle-kit push`. No errors.
5. **Repository**: `ResourceRepository` implements all six methods: `findByRecallSetId`, `findByRecallPointId`, `findById`, `create`, `createMany`, `linkToRecallPoint`, `linkManyToRecallPoints`.
6. **Repository**: `findByRecallSetId` returns an empty array (not null, not error) for a recall set with no resources.
7. **Repository**: `findByRecallPointId` joins through the junction table and includes the `relevance` field.
8. **Repository**: `createMany` uses a transaction so either all resources are created or none.
9. **Coverage**: ALL 51 recall sets have at least one source resource seeded. Zero sets are left without a resource.
10. **Content quality**: Each source resource is 200-500 words, reads as a coherent article/excerpt (not bullet points), and contains every fact referenced in the corresponding recall set's recall points.
11. **Content accuracy**: The terminology in each resource matches the terminology in the recall points it backs. If a recall point says "cue, craving, response, reward", the resource uses those exact terms.
12. **Image resources**: At least 5 visual recall sets have image resources with valid URLs pointing to freely-licensed images. Each image resource has `mimeType` set and `metadata` containing license info.
13. **Junction table**: Resources are linked to specific recall points via `recall_point_resources` where a clear relationship exists. Not every resource needs to be linked to specific points (set-level resources are fine), but multi-point sets should have at least some point-level links.
14. **API endpoint**: `GET /api/recall-sets/:id/resources` returns the correct resources for a given recall set ID. Returns `{ resources: [] }` for a set with no resources.
15. **API endpoint**: `GET /api/recall-points/:id/resources` returns resources linked to a specific recall point, including the `relevance` field.
16. **API endpoint**: The `?includeImageData=true` query parameter controls whether base64 image data is included in the response. Without it, `imageData` is replaced with `'[base64 omitted]'`.
17. **Seed runner**: Running the seed command (however the project seeds data) creates all resources and junction table links without errors. Resources are correctly associated with their recall sets by name matching.
18. **No regressions**: Existing recall set and recall point seeding still works. No existing tests break.
19. **Type exports**: `Resource`, `ResourceWithRelevance`, and `CreateResourceInput` types are exported and usable by other modules.
20. **Repository registered**: `ResourceRepository` is exported from `src/storage/repositories/index.ts` alongside existing repositories.

---

## Implementation Warnings

> **WARNING: Recall set names must match actual seed data**
> The list of 51 recall set names in this task (Section 5) is approximate. ~35 of the names do NOT exactly match the `name` field in the actual seed data files. The implementer MUST read the actual seed files (`src/storage/seeds/diverse-conceptual.ts`, `diverse-procedural.ts`, `diverse-creative.ts`, `diverse-remaining.ts`, `motivation-recall-set.ts`, `atp-recall-set.ts`) and use the EXACT `name` values from each seed entry. For example, the motivation recall set's name is `"motivation"` (lowercase), not `"Motivation Theory"`. The ATP set name must be verified similarly.

> **WARNING: FK constraints with seed re-runs**
> If the seed runner uses `--force` or deletes existing recall sets before re-seeding, the new `resources` and `recall_point_resources` tables will have FK constraints referencing `recallSets.id` and `recallPoints.id`. Deleting recall sets without first deleting their resources will violate FK constraints. The seed runner must delete resources and junction table entries BEFORE deleting recall sets/points, or use CASCADE delete. Add this to the seed runner update logic.
