/**
 * Resource Seed Data Index
 *
 * Re-exports all resource seed data for the seed runner.
 * Each file contains source materials for a group of recall sets.
 *
 * Resource seed files are organized to match the recall set seed groupings:
 * - motivation-resources.ts: 1 recall set (motivation)
 * - atp-resources.ts: 1 recall set (atp)
 * - conceptual-resources.ts: 17 recall sets (diverse conceptual)
 * - procedural-resources.ts: 13 recall sets (diverse procedural)
 * - creative-resources.ts: 12 recall sets (diverse creative)
 * - remaining-resources.ts: 9 recall sets (diverse remaining)
 *
 * Total: 53 entries covering all 51 unique recall sets.
 */

/**
 * Interface describing the seed data format for resources.
 * Each entry maps a recall set (by name) to its source materials.
 */
export interface ResourceSeed {
  /**
   * Must EXACTLY match the recall set `name` field from the seed data.
   * The seed runner uses findByName() which does case-insensitive lookup,
   * but always use the exact casing from the source seed file for clarity.
   */
  recallSetName: string;

  /** Array of resources to create for this recall set */
  resources: Array<{
    /** Human-readable title of the source material */
    title: string;
    /** Classification of the resource's format */
    type: 'article' | 'excerpt' | 'book_passage' | 'image' | 'reference';
    /** Text content for articles, excerpts, book passages, and references. Null for image-only. */
    content: string | null;
    /** URL for web resources, external images, or DOI links. Null for embedded content. */
    url: string | null;
    /** Base64-encoded image data for small embedded images. Null for URL-referenced images. */
    imageData: string | null;
    /** MIME type for image resources. Null for non-image resources. */
    mimeType: string | null;
    /** Arbitrary key-value metadata (author, source, license, etc.) */
    metadata: Record<string, string> | null;
  }>;

  /**
   * Optional: link specific resources to specific recall points by content substring match.
   * The seed runner will find the recall point whose content contains the given substring
   * and create a junction table entry linking it to the specified resource.
   */
  pointLinks?: Array<{
    /** Substring of the recall point's content field to match */
    pointContentSubstring: string;
    /** Title of the resource to link (must match a title in the resources array) */
    resourceTitle: string;
    /** Brief description of why this resource is relevant to this recall point */
    relevance: string;
  }>;
}

export { motivationResources } from './motivation-resources';
export { atpResources } from './atp-resources';
export { conceptualResources } from './conceptual-resources';
export { proceduralResources } from './procedural-resources';
export { creativeResources } from './creative-resources';
export { remainingResources } from './remaining-resources';
