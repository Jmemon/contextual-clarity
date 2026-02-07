# Phase 4: Ingestion System - Implementation Plan

## Phase Goal

Build the standalone ingestion pipeline that takes user transcripts + raw materials and distills them into a list of **core points**. This is an AI-driven back-and-forth with the user to extract and refine core points.

By the end of this phase, you should be able to:
1. Run `bun run cli ingest <source>` to start an interactive ingestion session
2. Provide text, URL, or PDF as source material
3. Have the AI extract 5-15 core concepts from the material
4. Review, edit, approve, or reject each extracted concept interactively
5. Have approved concepts expanded into full recall points with context
6. Generate an appropriate discussion system prompt for the new recall set
7. Create the complete recall set ready for session workflows
8. Use API endpoints to manage ingestion jobs programmatically
9. Use the web interface to complete the full ingestion workflow

---

## Ingestion Flow

```
Source Material (text/url/pdf)
    │
    ▼
[Parse & Store Source] ─── Store raw content for reference
    │
    ▼
[AI Extraction] ─── Identify 5-15 core concepts
    │
    ▼
[User Review] ─── Approve/edit/remove concepts
    │
    ▼
[AI Refinement] ─── Expand into full recall points with context
    │
    ▼
[User Final Review] ─── Tweak content/context
    │
    ▼
[Generate System Prompt] ─── Create discussion prompt
    │
    ▼
[Create Recall Set] ─── Final output
```

---

## Task Overview

| ID | Title | Dependencies | Parallel Group |
|----|-------|--------------|----------------|
| P4-T01 | Ingestion Job Model | P3-T22 | A |
| P4-T02 | Source Material Types & Storage | P4-T01 | A |
| P4-T03 | Text Parser | P4-T02 | B |
| P4-T04 | URL Content Extractor | P4-T02 | B |
| P4-T05 | PDF Parser | P4-T02 | B |
| P4-T06 | Database Schema for Ingestion | P4-T01, P4-T02 | B |
| P4-T07 | Ingestion Repository | P4-T06 | C |
| P4-T08 | Concept Extraction Prompts | P4-T02 | B |
| P4-T09 | Concept Extraction Service | P4-T07, P4-T08 | D |
| P4-T10 | Concept Refinement Prompts | P4-T08 | C |
| P4-T11 | Point Generation Service | P4-T09, P4-T10 | E |
| P4-T12 | System Prompt Generator | P4-T08 | D |
| P4-T13 | Ingestion Engine | P4-T09, P4-T11, P4-T12 | F |
| P4-T14 | CLI Ingestion Command | P4-T13 | G |
| P4-T15 | Ingestion API Endpoints | P4-T13 | G |
| P4-T16 | WebSocket Ingestion Handler | P4-T13 | G |
| P4-T17 | Frontend Ingestion Wizard | P4-T15, P4-T16 | H |
| P4-T18 | Integration Tests | P4-T14, P4-T17 | I |

---

## Detailed Task Specifications

### P4-T01: Ingestion Job Model

**Description:**
Define TypeScript types for tracking ingestion workflows including job status, source material metadata, extracted concepts, and the final output.

**Dependencies:** P3-T22 (Phase 3 complete)

**Parallel Group:** A

**Files to create:**
- `src/core/models/ingestion-job.ts` - IngestionJob and related types
- `src/core/models/extracted-concept.ts` - ExtractedConcept type

**Files to modify:**
- `src/core/models/index.ts` - Add barrel exports

**Type definitions:**

```typescript
// ingestion-job.ts

export type IngestionJobStatus =
  | 'pending'           // Created, not started
  | 'parsing'           // Parsing source material
  | 'extracting'        // AI extracting concepts
  | 'reviewing'         // User reviewing concepts
  | 'refining'          // AI refining into points
  | 'finalizing'        // User final review
  | 'completed'         // Successfully created recall set
  | 'failed'            // Error occurred
  | 'cancelled';        // User cancelled

export type SourceType = 'text' | 'url' | 'pdf' | 'transcript';

export interface SourceMaterial {
  type: SourceType;
  originalInput: string;    // URL, file path, or raw text
  parsedContent: string;    // Extracted text content
  metadata: {
    title?: string;
    wordCount: number;
    charCount: number;
    sourceUrl?: string;
    fileName?: string;
    parsedAt: Date;
  };
}

export interface IngestionJob {
  id: string;
  status: IngestionJobStatus;
  source: SourceMaterial;

  // Extraction results
  extractedConcepts: ExtractedConcept[];

  // User refinements
  approvedConceptIds: string[];
  userEdits: Record<string, Partial<ExtractedConcept>>;

  // Final output
  generatedPoints: GeneratedRecallPoint[];
  generatedSystemPrompt: string | null;
  finalRecallSetId: string | null;

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  error: string | null;
}

// extracted-concept.ts

export interface ExtractedConcept {
  id: string;
  content: string;           // The core concept/idea
  importance: 'high' | 'medium' | 'low';
  category?: string;         // Optional grouping
  sourceQuote?: string;      // Supporting quote from source
  confidence: number;        // AI confidence 0-1
  status: 'pending' | 'approved' | 'rejected' | 'edited';
}

export interface GeneratedRecallPoint {
  conceptId: string;         // Links to extracted concept
  content: string;           // Recall point content
  context: string;           // Context for tutor
  status: 'pending' | 'approved' | 'edited';
}
```

**Success criteria:**
- All types compile without errors
- Types support full ingestion workflow state
- Clear separation between extraction and generation phases

**Test approach:**
Create test file importing all types, verify compilation.

---

### P4-T02: Source Material Types & Storage

**Description:**
Define storage structure for source materials and create utilities for managing them. Source materials are stored for reference and potential re-processing.

**Dependencies:** P4-T01

**Parallel Group:** A

**Files to create:**
- `src/core/ingestion/source-storage.ts` - Source material storage utilities
- `src/core/ingestion/types.ts` - Shared ingestion types
- `src/core/ingestion/index.ts` - Barrel export

**Implementation:**

```typescript
// source-storage.ts
import { mkdir, writeFile, readFile, rm } from 'fs/promises';
import { join, normalize } from 'path';

const STORAGE_DIR = './data/sources';

// UUID v4 regex pattern
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class SourceStorage {
  private validateJobId(jobId: string): void {
    if (!UUID_PATTERN.test(jobId)) {
      throw new Error(`Invalid job ID format: ${jobId}. Must be a valid UUID.`);
    }
  }

  private getSafePath(jobId: string): string {
    this.validateJobId(jobId);
    const safePath = normalize(join(STORAGE_DIR, jobId));

    // Ensure path is within STORAGE_DIR (prevent directory traversal)
    if (!safePath.startsWith(normalize(STORAGE_DIR))) {
      throw new Error('Invalid path: directory traversal detected');
    }

    return safePath;
  }

  async store(jobId: string, content: string, metadata: object): Promise<string> {
    const dir = this.getSafePath(jobId);
    await mkdir(dir, { recursive: true });

    const contentPath = join(dir, 'content.txt');
    await writeFile(contentPath, content, 'utf-8');

    const metadataPath = join(dir, 'metadata.json');
    await writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');

    return contentPath;
  }

  async retrieve(jobId: string): Promise<{ content: string; metadata: object }> {
    const dir = this.getSafePath(jobId);
    const content = await readFile(join(dir, 'content.txt'), 'utf-8');
    const metadata = JSON.parse(await readFile(join(dir, 'metadata.json'), 'utf-8'));
    return { content, metadata };
  }

  async delete(jobId: string): Promise<void> {
    const dir = this.getSafePath(jobId);
    await rm(dir, { recursive: true, force: true });
  }
}
```

**Success criteria:**
- Source materials stored in organized directory structure
- Content and metadata retrievable by job ID
- Storage directory created automatically

**Test approach:**
Store and retrieve sample content, verify file creation.

---

### P4-T03: Text Parser

**Description:**
Parser for plain text and transcript input. Handles text cleanup, formatting normalization, and metadata extraction.

**Dependencies:** P4-T02

**Parallel Group:** B

**Files to create:**
- `src/core/ingestion/parsers/text-parser.ts`
- `src/core/ingestion/parsers/index.ts`

**Implementation:**

```typescript
// text-parser.ts

import type { SourceMaterial } from '../models';

export interface TextParserOptions {
  maxLength?: number;        // Truncate if too long
  cleanWhitespace?: boolean; // Normalize whitespace
}

export class TextParser {
  async parse(input: string, options: TextParserOptions = {}): Promise<SourceMaterial> {
    let content = input;

    // Clean whitespace
    if (options.cleanWhitespace !== false) {
      content = content
        .replace(/\r\n/g, '\n')
        .replace(/\t/g, '  ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }

    // Truncate if needed
    if (options.maxLength && content.length > options.maxLength) {
      content = content.slice(0, options.maxLength);
    }

    return {
      type: 'text',
      originalInput: input.slice(0, 500), // Store preview
      parsedContent: content,
      metadata: {
        wordCount: content.split(/\s+/).length,
        charCount: content.length,
        parsedAt: new Date(),
      },
    };
  }
}
```

**Success criteria:**
- Handles multiline text
- Normalizes whitespace
- Extracts word/char counts
- Handles empty input gracefully

**Test approach:**
Parse various text samples, verify output format.

---

### P4-T04: URL Content Extractor

**Description:**
Extract readable content from web URLs. Uses fetch and basic HTML parsing to extract main content.

**Dependencies:** P4-T02

**Parallel Group:** B

**Files to create:**
- `src/core/ingestion/parsers/url-parser.ts`

**Dependencies to install:**
```bash
bun add linkedom  # Lightweight DOM parser
```

**Implementation:**

```typescript
// url-parser.ts
import { parseHTML } from 'linkedom';
import type { SourceMaterial } from '../models';

const FETCH_TIMEOUT_MS = 30000;  // 30 seconds
const MAX_CONTENT_SIZE = 5 * 1024 * 1024;  // 5MB

export class UrlParser {
  async parse(url: string): Promise<SourceMaterial> {
    // Validate URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new Error(`Invalid URL: ${url}`);
    }

    // Only allow http/https
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error(`Unsupported protocol: ${parsedUrl.protocol}`);
    }

    // Set up timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ContextualClarity/1.0)',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
      }

      // Check content length before downloading
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > MAX_CONTENT_SIZE) {
        throw new Error(`Content too large: ${contentLength} bytes (max ${MAX_CONTENT_SIZE})`);
      }

      // Stream response to check size as we go
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const chunks: Uint8Array[] = [];
      let totalSize = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        totalSize += value.length;
        if (totalSize > MAX_CONTENT_SIZE) {
          reader.cancel();
          throw new Error(`Content exceeds size limit during download`);
        }
        chunks.push(value);
      }

      const html = new TextDecoder().decode(
        Uint8Array.from(chunks.flatMap(chunk => [...chunk]))
      );

      const { document } = parseHTML(html);

      // Extract title
      const title = document.querySelector('title')?.textContent?.trim() || '';

      // Remove script, style, nav, footer elements
      ['script', 'style', 'nav', 'footer', 'header', 'aside'].forEach(tag => {
        document.querySelectorAll(tag).forEach(el => el.remove());
      });

      // Try to find main content
      const mainContent =
        document.querySelector('article') ||
        document.querySelector('main') ||
        document.querySelector('.content') ||
        document.body;

      // Extract text
      const content = mainContent?.textContent
        ?.replace(/\s+/g, ' ')
        .trim() || '';

      return {
        type: 'url',
        originalInput: url,
        parsedContent: content,
        metadata: {
          title,
          sourceUrl: url,
          wordCount: content.split(/\s+/).length,
          charCount: content.length,
          parsedAt: new Date(),
        },
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
```

**Success criteria:**
- Fetches URL content
- Extracts readable text
- Removes navigation/scripts
- Handles fetch errors gracefully

**Test approach:**
Parse several URLs (Wikipedia, blog posts), verify content extraction.

---

### P4-T05: PDF Parser

**Description:**
Extract text content from PDF files. Uses pdf-parse for text extraction.

**Dependencies:** P4-T02

**Parallel Group:** B

**Files to create:**
- `src/core/ingestion/parsers/pdf-parser.ts`

**Dependencies to install:**
```bash
bun add pdf-parse
```

**Implementation:**

```typescript
// pdf-parser.ts
import pdf from 'pdf-parse';
import { readFile, stat } from 'fs/promises';
import type { SourceMaterial } from '../models';

const MAX_PDF_SIZE = 50 * 1024 * 1024;  // 50MB
const MAX_PAGES = 500;

export class PdfParser {
  async parse(filePath: string): Promise<SourceMaterial> {
    // Check file exists and size
    const stats = await stat(filePath);
    if (!stats.isFile()) {
      throw new Error(`Not a file: ${filePath}`);
    }
    if (stats.size > MAX_PDF_SIZE) {
      throw new Error(`PDF too large: ${stats.size} bytes (max ${MAX_PDF_SIZE})`);
    }

    const buffer = await readFile(filePath);

    // First pass: check page count
    const data = await pdf(buffer, {
      max: 1,  // Just get metadata first
    });

    if (data.numpages > MAX_PAGES) {
      throw new Error(`PDF has too many pages: ${data.numpages} (max ${MAX_PAGES})`);
    }

    // Full extraction
    const fullData = await pdf(buffer);

    const content = fullData.text
      .replace(/\s+/g, ' ')
      .trim();

    return {
      type: 'pdf',
      originalInput: filePath,
      parsedContent: content,
      metadata: {
        title: fullData.info?.Title || filePath.split('/').pop(),
        fileName: filePath.split('/').pop(),
        wordCount: content.split(/\s+/).length,
        charCount: content.length,
        parsedAt: new Date(),
        pageCount: fullData.numpages,
        author: fullData.info?.Author,
      },
    };
  }
}
```

**Success criteria:**
- Extracts text from PDFs
- Handles multi-page documents
- Extracts PDF metadata
- Handles corrupt PDFs gracefully

**Test approach:**
Parse sample PDFs, verify text extraction.

---

### P4-T06: Database Schema for Ingestion

**Description:**
Extend Drizzle schema to store ingestion jobs, extracted concepts, and generated points.

**Dependencies:** P4-T01, P4-T02

**Parallel Group:** B

**Files to modify:**
- `src/storage/schema.ts` - Add ingestion tables

**Schema additions:**

```typescript
// Add to schema.ts

export const ingestionJobs = sqliteTable('ingestion_jobs', {
  id: text('id').primaryKey(),
  status: text('status', {
    enum: ['pending', 'parsing', 'extracting', 'reviewing', 'refining', 'finalizing', 'completed', 'failed', 'cancelled']
  }).notNull().default('pending'),

  // Source material
  sourceType: text('source_type', { enum: ['text', 'url', 'pdf', 'transcript'] }).notNull(),
  sourceInput: text('source_input').notNull(),
  sourcePath: text('source_path'),  // Path to stored content
  sourceMetadata: text('source_metadata', { mode: 'json' }).$type<object>().notNull(),

  // Processing state
  extractedConceptsJson: text('extracted_concepts', { mode: 'json' }).$type<ExtractedConcept[]>().notNull().default([]),
  approvedConceptIds: text('approved_concept_ids', { mode: 'json' }).$type<string[]>().notNull().default([]),
  userEditsJson: text('user_edits', { mode: 'json' }).$type<Record<string, object>>().notNull().default({}),

  // Generated output
  generatedPointsJson: text('generated_points', { mode: 'json' }).$type<GeneratedRecallPoint[]>().notNull().default([]),
  generatedSystemPrompt: text('generated_system_prompt'),
  finalRecallSetId: text('final_recall_set_id').references(() => recallSets.id),

  // Metadata
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
  error: text('error'),
});
```

**Success criteria:**
- Schema compiles
- Migration generates successfully
- All workflow states storable

**Test approach:**
Generate migration, apply, verify table structure.

---

### P4-T07: Ingestion Repository

**Description:**
Repository for ingestion job CRUD operations with methods for state transitions.

**Dependencies:** P4-T06

**Parallel Group:** C

**Files to create:**
- `src/storage/repositories/ingestion-job.repository.ts`

**Files to modify:**
- `src/storage/repositories/index.ts` - Add export

**Key methods:**

```typescript
export class IngestionJobRepository {
  async create(input: CreateIngestionJobInput): Promise<IngestionJob>;
  async findById(id: string): Promise<IngestionJob | null>;
  async findByStatus(status: IngestionJobStatus): Promise<IngestionJob[]>;
  async updateStatus(id: string, status: IngestionJobStatus): Promise<void>;
  async setExtractedConcepts(id: string, concepts: ExtractedConcept[]): Promise<void>;
  async updateConceptStatus(jobId: string, conceptId: string, status: string): Promise<void>;
  async setGeneratedPoints(id: string, points: GeneratedRecallPoint[]): Promise<void>;
  async setSystemPrompt(id: string, prompt: string): Promise<void>;
  async complete(id: string, recallSetId: string): Promise<void>;
  async fail(id: string, error: string): Promise<void>;
}
```

**Success criteria:**
- All CRUD operations work
- State transitions update correctly
- Partial updates work (concepts, points, etc.)

**Test approach:**
Unit tests for each operation.

---

### P4-T08: Concept Extraction Prompts

**Description:**
LLM prompts for extracting core concepts from source material. Prompt designed to identify 5-15 key concepts with importance ranking.

**Dependencies:** P4-T02

**Parallel Group:** B

**Files to create:**
- `src/llm/prompts/concept-extraction.ts`

**Files to modify:**
- `src/llm/prompts/index.ts` - Add export

**Implementation:**

```typescript
// concept-extraction.ts

function truncateAtSentenceBoundary(content: string, maxLength: number): string {
  if (content.length <= maxLength) return content;

  // Find the last sentence ending before maxLength
  const truncated = content.slice(0, maxLength);
  const lastSentenceEnd = Math.max(
    truncated.lastIndexOf('. '),
    truncated.lastIndexOf('! '),
    truncated.lastIndexOf('? '),
    truncated.lastIndexOf('.\n'),
  );

  if (lastSentenceEnd > maxLength * 0.7) {
    // Found a reasonable sentence boundary
    return content.slice(0, lastSentenceEnd + 1);
  }

  // Fall back to word boundary
  const lastSpace = truncated.lastIndexOf(' ');
  return content.slice(0, lastSpace) + '...';
}

export interface ConceptExtractionParams {
  content: string;
  sourceType: SourceType;
  title?: string;
  targetCount?: number;  // Default 5-15
}

export function buildConceptExtractionPrompt(params: ConceptExtractionParams): string {
  const { content, sourceType, title, targetCount = 10 } = params;
  const maxContentLength = 15000;
  const truncatedContent = truncateAtSentenceBoundary(content, maxContentLength);
  const wasTruncated = content.length > maxContentLength;

  return `You are an expert at identifying the core concepts and key ideas from educational material.

## Source Material
Type: ${sourceType}
${title ? `Title: ${title}` : ''}

Content:
${truncatedContent}
${wasTruncated ? `\n[Content truncated at ${maxContentLength} characters - ${Math.round((maxContentLength / content.length) * 100)}% of original]` : ''}

## Your Task
Identify ${targetCount} core concepts that someone should remember and internalize from this material.

For each concept:
1. State the concept clearly and concisely (1-2 sentences)
2. Rate its importance (high/medium/low)
3. Optionally provide a category/theme
4. Include a supporting quote from the source if relevant
5. Rate your confidence in this being a core concept (0.0-1.0)

Focus on:
- Fundamental principles and mental models
- Key facts that enable deeper understanding
- Actionable insights
- Counter-intuitive or surprising findings
- Connections between ideas

Avoid:
- Trivial or obvious points
- Highly specific details that don't generalize
- Opinions without supporting evidence

## Response Format
Respond with a JSON array:
[
  {
    "content": "The core concept statement",
    "importance": "high" | "medium" | "low",
    "category": "optional category",
    "sourceQuote": "optional supporting quote",
    "confidence": 0.0-1.0
  }
]`;
}
```

**Success criteria:**
- Prompt produces structured JSON
- Extracts meaningful concepts
- Handles various content types

**Test approach:**
Test with sample content, verify concept quality.

---

### P4-T09: Concept Extraction Service

**Description:**
Service that orchestrates concept extraction using the LLM client and extraction prompts.

**Dependencies:** P4-T07, P4-T08

**Parallel Group:** D

**Files to create:**
- `src/core/ingestion/extraction-service.ts`

**Implementation:**

```typescript
// extraction-service.ts

import { AnthropicClient } from '../../llm/client';
import { buildConceptExtractionPrompt } from '../../llm/prompts/concept-extraction';
import type { SourceMaterial, ExtractedConcept } from '../models';
import { randomUUID } from 'crypto';

// Retry utility for LLM calls
interface RetryOptions {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors?: string[];
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableErrors: ['rate_limit', 'overloaded', 'timeout', 'ECONNRESET'],
};

async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error;
  let delay = opts.initialDelayMs;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      const errorMessage = lastError.message.toLowerCase();

      const isRetryable = opts.retryableErrors?.some(e =>
        errorMessage.includes(e.toLowerCase())
      );

      if (!isRetryable || attempt === opts.maxAttempts) {
        throw lastError;
      }

      console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelayMs);
    }
  }

  throw lastError!;
}

export class ConceptExtractionService {
  private llmClient: AnthropicClient;

  constructor(llmClient: AnthropicClient) {
    this.llmClient = llmClient;
  }

  async extract(source: SourceMaterial, targetCount: number = 10): Promise<ExtractedConcept[]> {
    return withRetry(async () => {
      const prompt = buildConceptExtractionPrompt({
        content: source.parsedContent,
        sourceType: source.type,
        title: source.metadata.title,
        targetCount,
      });

      const response = await this.llmClient.complete(
        'You are a precise extraction assistant. Respond only with valid JSON.',
        [{ role: 'user', content: prompt }],
        { temperature: 0.3, maxTokens: 4000 }
      );

      try {
        const concepts = JSON.parse(response);
        return concepts.map((c: any) => ({
          id: randomUUID(),
          content: c.content,
          importance: c.importance || 'medium',
          category: c.category || undefined,
          sourceQuote: c.sourceQuote || undefined,
          confidence: c.confidence || 0.7,
          status: 'pending',
        }));
      } catch {
        throw new Error('Failed to parse extraction response');
      }
    }, { maxAttempts: 3 });
  }
}
```

**Success criteria:**
- Extracts concepts from source material
- Assigns unique IDs to concepts
- Handles LLM errors gracefully

**Test approach:**
Extract from sample content, verify concept structure.

---

### P4-T10: Concept Refinement Prompts

**Description:**
Prompts for refining approved concepts into full recall points with content and context.

**Dependencies:** P4-T08

**Parallel Group:** C

**Files to create:**
- `src/llm/prompts/concept-refinement.ts`

**Implementation:**

```typescript
// concept-refinement.ts

export interface ConceptRefinementParams {
  concept: ExtractedConcept;
  sourceContext: string;  // Relevant portion of source
  recallSetTheme: string; // Overall theme for consistency
}

export function buildConceptRefinementPrompt(params: ConceptRefinementParams): string {
  const { concept, sourceContext, recallSetTheme } = params;

  return `You are creating a recall point for a spaced repetition system.

## Concept to Expand
"${concept.content}"

Importance: ${concept.importance}
${concept.sourceQuote ? `Supporting quote: "${concept.sourceQuote}"` : ''}

## Source Context
${sourceContext.slice(0, 3000)}

## Recall Set Theme
${recallSetTheme}

## Your Task
Create a recall point that:
1. States the core concept in a way that's memorable and precise
2. Provides context that helps a Socratic tutor guide discussion

The recall point should:
- Be stated as a fact or principle, not a question
- Be self-contained (understandable without the source)
- Be specific enough to evaluate recall accurately
- Avoid jargon unless essential

The context should:
- Explain WHY this concept matters
- Provide background the tutor needs
- Suggest angles for Socratic questioning
- NOT be shown to the user directly

## Response Format
{
  "content": "The recall point statement (1-3 sentences)",
  "context": "Tutor context (2-4 sentences)"
}`;
}
```

**Success criteria:**
- Produces well-structured recall points
- Context is useful for tutoring
- Maintains theme consistency

---

### P4-T11: Point Generation Service

**Description:**
Service that generates full recall points from approved concepts.

**Dependencies:** P4-T09, P4-T10

**Parallel Group:** E

**Files to create:**
- `src/core/ingestion/point-generation-service.ts`

**Implementation:**

```typescript
// point-generation-service.ts

export class PointGenerationService {
  private llmClient: AnthropicClient;

  constructor(llmClient: AnthropicClient) {
    this.llmClient = llmClient;
  }

  async generatePoints(
    concepts: ExtractedConcept[],
    sourceContent: string,
    theme: string
  ): Promise<GeneratedRecallPoint[]> {
    const points: GeneratedRecallPoint[] = [];

    for (const concept of concepts) {
      if (concept.status !== 'approved' && concept.status !== 'edited') {
        continue;
      }

      const prompt = buildConceptRefinementPrompt({
        concept,
        sourceContext: this.findRelevantContext(concept, sourceContent),
        recallSetTheme: theme,
      });

      const response = await this.llmClient.complete(
        'You are a precise generation assistant. Respond only with valid JSON.',
        [{ role: 'user', content: prompt }],
        { temperature: 0.4 }
      );

      try {
        const generated = JSON.parse(response);
        points.push({
          conceptId: concept.id,
          content: generated.content,
          context: generated.context,
          status: 'pending',
        });
      } catch {
        console.error(`Failed to generate point for concept ${concept.id}`);
      }
    }

    return points;
  }

  private findRelevantContext(concept: ExtractedConcept, source: string): string {
    // Try exact match first
    if (concept.sourceQuote) {
      const exactIndex = source.indexOf(concept.sourceQuote);
      if (exactIndex >= 0) {
        return this.extractSurroundingContext(source, exactIndex, concept.sourceQuote.length);
      }

      // Try fuzzy match - normalize whitespace and punctuation
      const normalizedQuote = concept.sourceQuote
        .replace(/\s+/g, ' ')
        .replace(/[""'']/g, '"')
        .toLowerCase();
      const normalizedSource = source
        .replace(/\s+/g, ' ')
        .replace(/[""'']/g, '"')
        .toLowerCase();

      const fuzzyIndex = normalizedSource.indexOf(normalizedQuote);
      if (fuzzyIndex >= 0) {
        return this.extractSurroundingContext(source, fuzzyIndex, concept.sourceQuote.length);
      }

      // Try partial match (first 50 chars of quote)
      const partialQuote = normalizedQuote.slice(0, 50);
      const partialIndex = normalizedSource.indexOf(partialQuote);
      if (partialIndex >= 0) {
        return this.extractSurroundingContext(source, partialIndex, 500);
      }
    }

    // Fallback: search for key terms from concept content
    const keyTerms = this.extractKeyTerms(concept.content);
    for (const term of keyTerms) {
      const termIndex = source.toLowerCase().indexOf(term.toLowerCase());
      if (termIndex >= 0) {
        return this.extractSurroundingContext(source, termIndex, 100);
      }
    }

    // Final fallback: return beginning of source
    return source.slice(0, 2000);
  }

  private extractSurroundingContext(source: string, index: number, matchLength: number): string {
    const contextPadding = 500;
    const start = Math.max(0, index - contextPadding);
    const end = Math.min(source.length, index + matchLength + contextPadding);
    return source.slice(start, end);
  }

  private extractKeyTerms(content: string): string[] {
    // Extract significant words (nouns, verbs) - simple heuristic
    return content
      .split(/\s+/)
      .filter(word => word.length > 5)
      .filter(word => !['which', 'where', 'there', 'their', 'would', 'could', 'should'].includes(word.toLowerCase()))
      .slice(0, 5);
  }
}
```

**Success criteria:**
- Generates points for all approved concepts
- Context is relevant and useful
- Handles generation failures gracefully

---

### P4-T12: System Prompt Generator

**Description:**
Generate appropriate discussion system prompts for new recall sets based on the content theme.

**Dependencies:** P4-T08

**Parallel Group:** D

**Files to create:**
- `src/core/ingestion/system-prompt-generator.ts`

**Files to modify:**
- `src/llm/prompts/index.ts` - Add system prompt generation prompt

**Implementation:**

```typescript
// system-prompt-generator.ts

export class SystemPromptGenerator {
  private llmClient: AnthropicClient;

  async generate(params: {
    title: string;
    description: string;
    concepts: ExtractedConcept[];
    sampleContent: string;
  }): Promise<string> {
    const prompt = `You are creating a system prompt for a Socratic tutor AI.

## Recall Set Details
Title: ${params.title}
Description: ${params.description}

## Core Concepts (${params.concepts.length} total)
${params.concepts.slice(0, 5).map(c => `- ${c.content}`).join('\n')}

## Sample Source Content
${params.sampleContent.slice(0, 2000)}

## Your Task
Write a system prompt (3-5 paragraphs) that instructs an AI tutor how to:
1. Guide discussion about these topics
2. Use appropriate analogies and examples
3. Connect concepts to real-world applications
4. Match the tone/style appropriate for this subject

The prompt should be conversational but not sycophantic.

Respond with ONLY the system prompt text, no JSON wrapper.`;

    return this.llmClient.complete(
      'You write clear, effective AI prompts.',
      [{ role: 'user', content: prompt }],
      { temperature: 0.6 }
    );
  }
}
```

**Success criteria:**
- Generates relevant system prompts
- Tone matches content type
- Prompts produce good conversations

---

### P4-T13: Ingestion Engine

**Description:**
Core orchestrator that manages the entire ingestion workflow, coordinating parsing, extraction, refinement, and recall set creation.

**Dependencies:** P4-T09, P4-T11, P4-T12

**Parallel Group:** F

**Files to create:**
- `src/core/ingestion/ingestion-engine.ts`

**Implementation:**

```typescript
// ingestion-engine.ts

export interface IngestionEngineConfig {
  targetConceptCount: number;
  autoApproveHighConfidence: boolean;
  confidenceThreshold: number;
}

export class IngestionEngine {
  private sourceStorage: SourceStorage;
  private extractionService: ConceptExtractionService;
  private pointGenerationService: PointGenerationService;
  private systemPromptGenerator: SystemPromptGenerator;
  private ingestionRepo: IngestionJobRepository;
  private recallSetRepo: RecallSetRepository;
  private recallPointRepo: RecallPointRepository;

  constructor(deps: {...}) {
    // Initialize all dependencies
  }

  // Start new ingestion job
  async createJob(source: { type: SourceType; input: string }): Promise<IngestionJob> {
    const job = await this.ingestionRepo.create({
      id: randomUUID(),
      status: 'pending',
      sourceType: source.type,
      sourceInput: source.input,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return job;
  }

  // Parse source material
  async parseSource(jobId: string): Promise<SourceMaterial> {
    await this.ingestionRepo.updateStatus(jobId, 'parsing');
    const job = await this.ingestionRepo.findById(jobId);

    const parser = this.getParser(job.sourceType);
    const source = await parser.parse(job.sourceInput);

    // Store source content
    const path = await this.sourceStorage.store(jobId, source.parsedContent, source.metadata);
    await this.ingestionRepo.update(jobId, { sourcePath: path, sourceMetadata: source.metadata });

    return source;
  }

  // Extract concepts from source
  async extractConcepts(jobId: string): Promise<ExtractedConcept[]> {
    await this.ingestionRepo.updateStatus(jobId, 'extracting');
    const job = await this.ingestionRepo.findById(jobId);
    const { content } = await this.sourceStorage.retrieve(jobId);

    const concepts = await this.extractionService.extract({
      ...job.source,
      parsedContent: content,
    });

    await this.ingestionRepo.setExtractedConcepts(jobId, concepts);
    await this.ingestionRepo.updateStatus(jobId, 'reviewing');

    return concepts;
  }

  // User approves/rejects/edits concepts
  async updateConcept(
    jobId: string,
    conceptId: string,
    update: { status?: string; content?: string }
  ): Promise<void> {
    await this.ingestionRepo.updateConceptStatus(jobId, conceptId, update);
  }

  // Mark review complete, move to refinement
  async completeReview(jobId: string): Promise<void> {
    const job = await this.ingestionRepo.findById(jobId);
    const approvedConcepts = job.extractedConcepts.filter(
      c => c.status === 'approved' || c.status === 'edited'
    );

    if (approvedConcepts.length === 0) {
      throw new Error('No concepts approved');
    }

    await this.ingestionRepo.updateStatus(jobId, 'refining');
  }

  // Generate recall points from approved concepts
  async generatePoints(jobId: string, theme: string): Promise<GeneratedRecallPoint[]> {
    const job = await this.ingestionRepo.findById(jobId);
    const { content } = await this.sourceStorage.retrieve(jobId);

    const approvedConcepts = job.extractedConcepts.filter(
      c => c.status === 'approved' || c.status === 'edited'
    );

    const points = await this.pointGenerationService.generatePoints(
      approvedConcepts,
      content,
      theme
    );

    await this.ingestionRepo.setGeneratedPoints(jobId, points);
    await this.ingestionRepo.updateStatus(jobId, 'finalizing');

    return points;
  }

  // Generate system prompt
  async generateSystemPrompt(jobId: string, title: string, description: string): Promise<string> {
    const job = await this.ingestionRepo.findById(jobId);
    const { content } = await this.sourceStorage.retrieve(jobId);

    const prompt = await this.systemPromptGenerator.generate({
      title,
      description,
      concepts: job.extractedConcepts.filter(c => c.status === 'approved'),
      sampleContent: content,
    });

    await this.ingestionRepo.setSystemPrompt(jobId, prompt);
    return prompt;
  }

  // Create final recall set
  async createRecallSet(
    jobId: string,
    name: string,
    description: string
  ): Promise<RecallSet> {
    const job = await this.ingestionRepo.findById(jobId);

    // Create recall set
    const recallSet = await this.recallSetRepo.create({
      id: randomUUID(),
      name,
      description,
      status: 'active',
      discussionSystemPrompt: job.generatedSystemPrompt || '',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Create recall points
    const scheduler = new FSRSScheduler();
    for (const point of job.generatedPoints) {
      if (point.status === 'approved' || point.status === 'edited') {
        await this.recallPointRepo.create({
          id: randomUUID(),
          recallSetId: recallSet.id,
          content: point.content,
          context: point.context,
          fsrsState: scheduler.createInitialState(),
          recallHistory: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

    // Mark job complete
    await this.ingestionRepo.complete(jobId, recallSet.id);

    return recallSet;
  }
}
```

**Success criteria:**
- Full workflow from source to recall set
- State transitions tracked correctly
- Error handling at each stage
- Resumable after interruption

---

### P4-T14: CLI Ingestion Command

**Description:**
CLI command for testing and running ingestion interactively.

**Dependencies:** P4-T13

**Parallel Group:** G

**Files to create:**
- `src/cli/commands/ingest.ts`

**Files to modify:**
- `src/cli/index.ts` - Add ingest command

**Usage:**
```bash
bun run cli ingest --text "content..."
bun run cli ingest --url https://example.com/article
bun run cli ingest --pdf ./document.pdf
```

**Implementation:**

```typescript
// ingest.ts

export async function runIngestCommand(
  engine: IngestionEngine,
  args: { text?: string; url?: string; pdf?: string }
): Promise<void> {
  // Determine source type
  const sourceType = args.text ? 'text' : args.url ? 'url' : 'pdf';
  const input = args.text || args.url || args.pdf!;

  console.log(bold(`\n=== Starting Ingestion ===\n`));
  console.log(`Source type: ${sourceType}`);

  // Create job
  const job = await engine.createJob({ type: sourceType, input });
  console.log(`Job created: ${job.id}\n`);

  // Parse source
  console.log('Parsing source material...');
  const source = await engine.parseSource(job.id);
  console.log(`Parsed: ${source.metadata.wordCount} words\n`);

  // Extract concepts
  console.log('Extracting concepts...');
  const concepts = await engine.extractConcepts(job.id);
  console.log(`Found ${concepts.length} concepts:\n`);

  // Show concepts for review
  for (let i = 0; i < concepts.length; i++) {
    const c = concepts[i];
    console.log(`${i + 1}. [${c.importance}] ${c.content}`);
    if (c.sourceQuote) {
      console.log(dim(`   "${c.sourceQuote.slice(0, 100)}..."`));
    }
  }

  // Interactive review
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log('\nReview concepts (a=approve, r=reject, e=edit, s=skip, d=done):');

  for (const concept of concepts) {
    const action = await prompt(rl, `[${concept.id.slice(0, 8)}] ${concept.content.slice(0, 50)}... > `);

    switch (action.toLowerCase()) {
      case 'a':
        await engine.updateConcept(job.id, concept.id, { status: 'approved' });
        break;
      case 'r':
        await engine.updateConcept(job.id, concept.id, { status: 'rejected' });
        break;
      case 'e':
        const newContent = await prompt(rl, 'New content: ');
        await engine.updateConcept(job.id, concept.id, { status: 'edited', content: newContent });
        break;
      case 'd':
        break;
    }
  }

  // Complete review
  await engine.completeReview(job.id);

  // Get recall set details
  const name = await prompt(rl, 'Recall set name: ');
  const description = await prompt(rl, 'Description: ');

  // Generate points
  console.log('\nGenerating recall points...');
  const points = await engine.generatePoints(job.id, description);
  console.log(`Generated ${points.length} recall points\n`);

  // Show points for final review
  for (const point of points) {
    console.log(`- ${point.content}`);
    console.log(dim(`  Context: ${point.context.slice(0, 100)}...`));
  }

  // Generate system prompt
  console.log('\nGenerating system prompt...');
  const systemPrompt = await engine.generateSystemPrompt(job.id, name, description);
  console.log(dim(systemPrompt.slice(0, 200) + '...\n'));

  // Create recall set
  const confirm = await prompt(rl, 'Create recall set? (y/n) > ');
  if (confirm.toLowerCase() === 'y') {
    const recallSet = await engine.createRecallSet(job.id, name, description);
    console.log(green(`\nRecall set created: ${recallSet.id}`));
    console.log(`Run: bun run cli session ${name}`);
  }

  rl.close();
}
```

**Success criteria:**
- Text ingestion works
- URL ingestion works
- PDF ingestion works
- Interactive review works
- Creates functional recall set

---

### P4-T15: Ingestion API Endpoints

**Description:**
REST API endpoints for managing ingestion jobs.

**Dependencies:** P4-T13

**Parallel Group:** G

**Files to create:**
- `src/api/routes/ingestion.ts`

**Files to modify:**
- `src/api/routes/index.ts` - Mount ingestion routes

**Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/ingestion/jobs` | Create new job |
| GET | `/api/ingestion/jobs` | List jobs |
| GET | `/api/ingestion/jobs/:id` | Get job details |
| POST | `/api/ingestion/jobs/:id/parse` | Parse source |
| POST | `/api/ingestion/jobs/:id/extract` | Extract concepts |
| PATCH | `/api/ingestion/jobs/:id/concepts/:conceptId` | Update concept |
| POST | `/api/ingestion/jobs/:id/complete-review` | Complete review |
| POST | `/api/ingestion/jobs/:id/generate-points` | Generate points |
| POST | `/api/ingestion/jobs/:id/generate-prompt` | Generate system prompt |
| POST | `/api/ingestion/jobs/:id/create-set` | Create recall set |
| DELETE | `/api/ingestion/jobs/:id` | Cancel job |

**Success criteria:**
- All endpoints work
- Proper error handling
- Job state validated before operations

---

### P4-T16: WebSocket Ingestion Handler

**Description:**
WebSocket support for interactive ingestion with streaming feedback.

**Dependencies:** P4-T13

**Parallel Group:** G

**Files to create:**
- `src/api/ws/ingestion-handler.ts`

**Message types:**

```typescript
// Client -> Server
type IngestionClientMessage =
  | { type: 'start_parse' }
  | { type: 'start_extract' }
  | { type: 'update_concept'; conceptId: string; update: object }
  | { type: 'complete_review' }
  | { type: 'generate_points'; theme: string }
  | { type: 'generate_prompt'; title: string; description: string }
  | { type: 'create_set'; name: string; description: string };

// Server -> Client
type IngestionServerMessage =
  | { type: 'status_update'; status: IngestionJobStatus }
  | { type: 'parse_complete'; metadata: object }
  | { type: 'concept_extracted'; concept: ExtractedConcept }  // Streaming
  | { type: 'extraction_complete'; concepts: ExtractedConcept[] }
  | { type: 'point_generated'; point: GeneratedRecallPoint }
  | { type: 'generation_complete'; points: GeneratedRecallPoint[] }
  | { type: 'prompt_generated'; prompt: string }
  | { type: 'set_created'; recallSet: RecallSet }
  | { type: 'error'; message: string };
```

**Success criteria:**
- Real-time status updates
- Streaming concept extraction
- Supports full workflow

---

### P4-T17: Frontend Ingestion Wizard

**Description:**
Multi-step wizard UI for the ingestion process.

**Dependencies:** P4-T15, P4-T16

**Parallel Group:** H

**Files to create:**
- `web/src/pages/Ingest.tsx` - Main ingestion page
- `web/src/components/ingestion/SourceInput.tsx` - Step 1: Source input
- `web/src/components/ingestion/ConceptReview.tsx` - Step 2: Review concepts
- `web/src/components/ingestion/PointReview.tsx` - Step 3: Review points
- `web/src/components/ingestion/FinalizeSet.tsx` - Step 4: Create set
- `web/src/components/ingestion/IngestionProgress.tsx` - Progress indicator
- `web/src/hooks/use-ingestion-websocket.ts` - WebSocket hook

**Wizard steps:**

1. **Source Input**
   - Text area for pasting content
   - URL input field
   - PDF file upload
   - Start button

2. **Concept Review**
   - List of extracted concepts
   - Approve/reject/edit each
   - Bulk actions
   - Continue button

3. **Point Review**
   - Generated recall points
   - Edit content/context
   - Approve button

4. **Finalize**
   - Name and description input
   - System prompt preview/edit
   - Create button

**Success criteria:**
- All steps work
- Progress indicator shows current step
- Can go back to previous steps
- Creates functional recall set

---

### P4-T18: Integration Tests

**Description:**
End-to-end tests for the ingestion pipeline.

**Dependencies:** P4-T14, P4-T17

**Parallel Group:** I

**Files to create:**
- `tests/integration/ingestion-flow.test.ts`
- `tests/integration/ingestion-api.test.ts`

**Test coverage:**
- Text ingestion full flow
- URL extraction
- Concept approval/rejection
- Point generation
- Recall set creation

**Success criteria:**
- All tests pass
- Coverage of happy path and errors

---

## Final Checklist

- [ ] `bun run cli ingest --text "..."` works
- [ ] `bun run cli ingest --url <url>` works
- [ ] `bun run cli ingest --pdf <file>` works
- [ ] API endpoints functional
- [ ] WebSocket streaming works
- [ ] Web wizard completes full flow
- [ ] Creates valid recall sets
- [ ] Tests pass

---

## File Tree Summary (Phase 4 Additions)

```
contextual-clarity/
├── data/
│   └── sources/                              # NEW - Source material storage
├── src/
│   ├── core/
│   │   ├── models/
│   │   │   ├── ingestion-job.ts              # NEW
│   │   │   ├── extracted-concept.ts          # NEW
│   │   │   └── index.ts                      # MODIFIED
│   │   └── ingestion/
│   │       ├── source-storage.ts             # NEW
│   │       ├── extraction-service.ts         # NEW
│   │       ├── point-generation-service.ts   # NEW
│   │       ├── system-prompt-generator.ts    # NEW
│   │       ├── ingestion-engine.ts           # NEW
│   │       ├── parsers/
│   │       │   ├── text-parser.ts            # NEW
│   │       │   ├── url-parser.ts             # NEW
│   │       │   ├── pdf-parser.ts             # NEW
│   │       │   └── index.ts                  # NEW
│   │       ├── types.ts                      # NEW
│   │       └── index.ts                      # NEW
│   ├── llm/
│   │   └── prompts/
│   │       ├── concept-extraction.ts         # NEW
│   │       ├── concept-refinement.ts         # NEW
│   │       └── index.ts                      # MODIFIED
│   ├── storage/
│   │   ├── schema.ts                         # MODIFIED
│   │   └── repositories/
│   │       ├── ingestion-job.repository.ts   # NEW
│   │       └── index.ts                      # MODIFIED
│   ├── api/
│   │   ├── routes/
│   │   │   ├── ingestion.ts                  # NEW
│   │   │   └── index.ts                      # MODIFIED
│   │   └── ws/
│   │       ├── ingestion-handler.ts          # NEW
│   │       └── index.ts                      # MODIFIED
│   └── cli/
│       ├── commands/
│       │   ├── ingest.ts                     # NEW
│       │   └── index.ts                      # MODIFIED
│       └── index.ts                          # MODIFIED
├── web/
│   └── src/
│       ├── pages/
│       │   ├── Ingest.tsx                    # NEW
│       │   └── index.ts                      # MODIFIED
│       ├── components/
│       │   └── ingestion/
│       │       ├── SourceInput.tsx           # NEW
│       │       ├── ConceptReview.tsx         # NEW
│       │       ├── PointReview.tsx           # NEW
│       │       ├── FinalizeSet.tsx           # NEW
│       │       ├── IngestionProgress.tsx     # NEW
│       │       └── index.ts                  # NEW
│       └── hooks/
│           ├── use-ingestion-websocket.ts    # NEW
│           └── index.ts                      # MODIFIED
└── tests/
    └── integration/
        ├── ingestion-flow.test.ts            # NEW
        └── ingestion-api.test.ts             # NEW
```
