# Phase 5: Integrate Ingestion into Main App - Implementation Plan

## Phase Goal

Integrate the standalone ingestion pipeline (Phase 4) into the main web application (Phase 3), creating a seamless user experience for creating recall sets from various sources.

By the end of this phase, you should be able to:
1. Start ingestion from the dashboard with one click
2. See active ingestion jobs on the dashboard
3. Access full ingestion wizard from the recall sets page
4. View source material for any recall set
5. Re-process source material for existing sets
6. Resume failed ingestion jobs
7. Complete a guided onboarding flow for new users
8. Use ingestion features on tablet devices

---

## Task Overview

| ID | Title | Dependencies | Parallel Group |
|----|-------|--------------|----------------|
| P5-T01 | Add Ingestion Nav & Routes | P4-T17 | A |
| P5-T02 | Dashboard Quick Actions | P5-T01 | B |
| P5-T03 | Active Ingestion Jobs Widget | P5-T01 | B |
| P5-T04 | Recall Set Source Link Schema | P4-T06 | A |
| P5-T05 | Source Material Viewer Component | P5-T04 | C |
| P5-T06 | Recall Set Detail Integration | P5-T05 | D |
| P5-T07 | Re-Ingestion API Endpoint | P5-T04 | C |
| P5-T08 | Re-Ingestion UI Flow | P5-T06, P5-T07 | E |
| P5-T09 | Ingestion History Page | P5-T01 | C |
| P5-T10 | Failed Job Recovery API | P4-T15 | B |
| P5-T11 | Resume Failed Ingestion UI | P5-T09, P5-T10 | D |
| P5-T12 | Onboarding Detection Hook | P5-T01 | B |
| P5-T13 | First Ingestion Onboarding Flow | P5-T12 | D |
| P5-T14 | Tablet Responsive Ingestion Wizard | P5-T01 | C |
| P5-T15 | Integration Tests | P5-T08, P5-T11, P5-T13 | F |

---

## Detailed Task Specifications

### P5-T01: Add Ingestion Nav & Routes

**Description:**
Add ingestion entry points to the main navigation and configure routes for the ingestion wizard within the main app shell.

**Dependencies:** P4-T17 (Frontend Ingestion Wizard complete)

**Parallel Group:** A

**Files to modify:**
- `web/src/router.tsx` - Add ingestion routes
- `web/src/layouts/MainLayout.tsx` - Add nav item for "Create New"
- `web/src/pages/index.ts` - Export Ingest page

**Routes to add:**
- `/ingest` - Start new ingestion
- `/ingest/:jobId` - Resume or continue job
- `/ingestion-history` - Past jobs

**Success criteria:**
- "Create New" appears in main navigation
- `/ingest` route renders ingestion wizard
- Navigation highlights correctly on ingestion pages
- Back navigation returns to previous page

---

### P5-T02: Dashboard Quick Actions

**Description:**
Add quick action buttons to the dashboard for common ingestion entry points: "New from URL", "New from Text", "Upload PDF".

**Dependencies:** P5-T01

**Parallel Group:** B

**Files to create:**
- `web/src/components/dashboard/QuickActions.tsx`

**Files to modify:**
- `web/src/pages/Dashboard.tsx` - Add QuickActions component

**Success criteria:**
- Quick action buttons visible on dashboard
- Each button navigates to ingestion with pre-selected source type
- Visual feedback on hover/click

---

### P5-T03: Active Ingestion Jobs Widget

**Description:**
Dashboard widget showing in-progress ingestion jobs with status indicators and ability to continue.

**Dependencies:** P5-T01

**Parallel Group:** B

**Files to create:**
- `web/src/components/dashboard/ActiveIngestionJobs.tsx`
- `web/src/hooks/api/use-ingestion-jobs.ts`

**Files to modify:**
- `web/src/pages/Dashboard.tsx` - Add ActiveIngestionJobs component
- `src/api/routes/dashboard.ts` - Add active jobs endpoint

**API Addition:**
- GET `/api/dashboard/active-ingestion-jobs` - Returns jobs with status in progress

**Success criteria:**
- Widget appears when jobs are in progress
- Shows job status with visual indicator
- "Continue" button resumes job at current step
- Widget hidden when no active jobs

---

### P5-T04: Recall Set Source Link Schema

**Description:**
Extend the recall sets table to maintain link to source ingestion job.

**Dependencies:** P4-T06

**Parallel Group:** A

**Files to modify:**
- `src/storage/schema.ts` - Add sourceIngestionJobId to recallSets
- `src/storage/repositories/recall-set.repository.ts` - Include source job in queries

**Schema change:**
```typescript
// The column is nullable to support recall sets created before Phase 4
sourceIngestionJobId: text('source_ingestion_job_id')
  .references(() => ingestionJobs.id)
  // Note: NOT .notNull() - existing recall sets from seeds won't have this
```

**Migration note:**
When applying this migration, existing recall sets (from Phase 1 seeds) will have NULL for this column. This is intentional. The UI and API should handle NULL gracefully:

```typescript
// In RecallSetDetail.tsx
{recallSet.sourceIngestionJobId && (
  <SourceMaterialTab sourceJobId={recallSet.sourceIngestionJobId} />
)}

// In the API
async getRecallSetWithSource(id: string): Promise<RecallSetWithSource> {
  const recallSet = await this.findById(id);
  if (!recallSet) throw new NotFoundError('Recall set not found');

  let sourceMaterial = null;
  if (recallSet.sourceIngestionJobId) {
    try {
      const job = await this.ingestionJobRepo.findById(recallSet.sourceIngestionJobId);
      if (job?.sourcePath) {
        sourceMaterial = await this.sourceStorage.retrieve(recallSet.sourceIngestionJobId);
      }
    } catch (error) {
      // Source material might have been deleted - that's okay
      console.warn(`Could not retrieve source for recall set ${id}:`, error);
    }
  }

  return { ...recallSet, sourceMaterial };
}
```

**Success criteria:**
- Migration adds column without data loss
- New recall sets created from ingestion have link
- Querying recall set includes source job data

---

### P5-T05: Source Material Viewer Component

**Description:**
Component to display the original source material for a recall set, supporting text, URL content, and PDF previews.

**Dependencies:** P5-T04

**Parallel Group:** C

**Files to create:**
- `web/src/components/source-viewer/SourceViewer.tsx`
- `web/src/components/source-viewer/TextSource.tsx`
- `web/src/components/source-viewer/UrlSource.tsx`
- `web/src/components/source-viewer/PdfSource.tsx`
- `web/src/components/source-viewer/index.ts`

**Files to modify:**
- `src/api/routes/ingestion.ts` - Add GET /api/ingestion/jobs/:id/source

**Success criteria:**
- Renders text source with formatting
- URL source shows original link and extracted content
- PDF source shows filename and extracted text
- Handles missing source gracefully

---

### P5-T06: Recall Set Detail Integration

**Description:**
Integrate source material viewer and ingestion metadata into the recall set detail page.

**Dependencies:** P5-T05

**Parallel Group:** D

**Files to modify:**
- `web/src/pages/RecallSetDetail.tsx` - Add source tab/section
- `web/src/components/recall-set-detail/SetHeader.tsx` - Add source indicator

**Success criteria:**
- Source tab appears only when sourceIngestionJobId exists
- Source content renders correctly
- Re-process button is accessible
- Tab navigation works

---

### P5-T07: Re-Ingestion API Endpoint

**Description:**
API endpoint to start a new ingestion job using the same source material as an existing recall set.

**Dependencies:** P5-T04

**Parallel Group:** C

**Files to modify:**
- `src/api/routes/ingestion.ts` - Add re-ingest endpoint

**Endpoint:**
- POST `/api/recall-sets/:id/re-ingest` - Creates new job from existing source
- Body: `{ preserveExisting?: boolean }`

**Success criteria:**
- Endpoint creates new job from existing source
- Original source material reused
- Option to link new job to existing set for merge
- Returns new job ID

---

### P5-T08: Re-Ingestion UI Flow

**Description:**
User interface for re-processing source material with options to replace or merge.

**Dependencies:** P5-T06, P5-T07

**Parallel Group:** E

**Files to create:**
- `web/src/components/ingestion/ReIngestModal.tsx`

**Files to modify:**
- `web/src/pages/RecallSetDetail.tsx` - Add re-ingest handler

**Merge vs Replace Behavior:**

```typescript
// In ingestion-engine.ts

interface ReIngestOptions {
  mode: 'replace' | 'merge';
  recallSetId: string;
}

async createFromReIngest(
  existingSetId: string,
  options: ReIngestOptions
): Promise<IngestionJob> {
  const existingSet = await this.recallSetRepo.findById(existingSetId);
  if (!existingSet) throw new NotFoundError('Recall set not found');
  if (!existingSet.sourceIngestionJobId) {
    throw new BadRequestError('Recall set has no source material to re-ingest');
  }

  const originalJob = await this.ingestionRepo.findById(existingSet.sourceIngestionJobId);
  if (!originalJob) throw new NotFoundError('Original ingestion job not found');

  // Create new job with reference to existing set
  const newJob = await this.ingestionRepo.create({
    id: randomUUID(),
    status: 'pending',
    sourceType: originalJob.sourceType,
    sourceInput: originalJob.sourceInput,
    sourcePath: originalJob.sourcePath,  // Reuse stored source
    sourceMetadata: originalJob.sourceMetadata,
    // Link to existing set for merge/replace
    targetRecallSetId: options.mode === 'merge' ? existingSetId : null,
    reIngestMode: options.mode,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return newJob;
}

// When finalizing a re-ingest job:
async finalizeReIngest(jobId: string, name: string, description: string): Promise<RecallSet> {
  const job = await this.ingestionRepo.findById(jobId);

  if (job.reIngestMode === 'replace') {
    // Delete old recall set entirely, create new one
    if (job.targetRecallSetId) {
      await this.recallSetRepo.delete(job.targetRecallSetId);
    }
    return this.createRecallSet(jobId, name, description);
  }

  if (job.reIngestMode === 'merge') {
    // Add new points to existing set, don't duplicate
    const existingSet = await this.recallSetRepo.findById(job.targetRecallSetId!);
    const existingPoints = await this.recallPointRepo.findBySetId(existingSet.id);
    const existingContents = new Set(existingPoints.map(p => p.content.toLowerCase().trim()));

    const scheduler = new FSRSScheduler();
    let addedCount = 0;

    for (const point of job.generatedPoints) {
      if (point.status !== 'approved' && point.status !== 'edited') continue;

      // Skip if similar point already exists
      const normalizedContent = point.content.toLowerCase().trim();
      if (existingContents.has(normalizedContent)) {
        console.log(`Skipping duplicate point: ${point.content.slice(0, 50)}...`);
        continue;
      }

      await this.recallPointRepo.create({
        id: randomUUID(),
        recallSetId: existingSet.id,
        content: point.content,
        context: point.context,
        fsrsState: scheduler.createInitialState(),
        recallHistory: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      addedCount++;
    }

    // Optionally update system prompt if new one is better
    if (job.generatedSystemPrompt) {
      await this.recallSetRepo.update(existingSet.id, {
        discussionSystemPrompt: job.generatedSystemPrompt,
        updatedAt: new Date(),
      });
    }

    await this.ingestionRepo.complete(jobId, existingSet.id);

    console.log(`Merged ${addedCount} new points into ${existingSet.name}`);
    return existingSet;
  }

  // No mode specified, create new set
  return this.createRecallSet(jobId, name, description);
}
```

**UI Flow for Merge/Replace:**

In `ReIngestModal.tsx`:
- Show current point count
- Explain what merge vs replace does:
  - **Replace**: Delete current recall set and points, create fresh from source
  - **Merge**: Keep existing points and their FSRS progress, add new points that don't already exist
- Warn that Replace will lose FSRS progress

**Success criteria:**
- Modal opens from recall set detail
- Mode selection (replace/merge) works
- Submitting creates job and navigates to wizard
- Loading state during submission

---

### P5-T09: Ingestion History Page

**Description:**
Page listing all past ingestion jobs with status, source type, and outcomes.

**Dependencies:** P5-T01

**Parallel Group:** C

**Files to create:**
- `web/src/pages/IngestionHistory.tsx`
- `web/src/components/ingestion-history/IngestionJobTable.tsx`
- `web/src/components/ingestion-history/IngestionJobFilters.tsx`

**Files to modify:**
- `src/api/routes/ingestion.ts` - Enhance GET /api/ingestion/jobs with pagination

**Success criteria:**
- Lists all ingestion jobs
- Filters by status and source type
- Shows linked recall set for completed jobs
- Resume action for in-progress/failed jobs

---

### P5-T10: Failed Job Recovery API

**Description:**
API endpoint to resume failed ingestion jobs from the last successful step.

**Dependencies:** P4-T15

**Parallel Group:** B

**Files to modify:**
- `src/api/routes/ingestion.ts` - Add recovery endpoint
- `src/core/ingestion/ingestion-engine.ts` - Add recovery logic

**Endpoint:**
- POST `/api/ingestion/jobs/:id/recover`

**Recovery logic:**
```typescript
// In ingestion-engine.ts

/**
 * Determines the correct step to resume a failed job from.
 * Must check the VALIDITY of data at each step, not just existence.
 */
determineRecoveryStep(job: IngestionJob): {
  step: IngestionJobStatus;
  message: string;
} {
  // Check from most complete to least complete

  // If we have generated points that are finalized, we just need to create the set
  if (job.generatedPoints.length > 0) {
    const allPointsReviewed = job.generatedPoints.every(
      p => p.status === 'approved' || p.status === 'rejected' || p.status === 'edited'
    );

    if (allPointsReviewed && job.generatedSystemPrompt) {
      return {
        step: 'finalizing',
        message: 'Resuming at final review - ready to create recall set'
      };
    }

    if (allPointsReviewed) {
      return {
        step: 'finalizing',
        message: 'Resuming at system prompt generation'
      };
    }

    return {
      step: 'refining',
      message: `Resuming point review - ${job.generatedPoints.length} points need review`
    };
  }

  // If we have approved concepts, we can generate points
  if (job.approvedConceptIds.length > 0) {
    const approvedConcepts = job.extractedConcepts.filter(
      c => job.approvedConceptIds.includes(c.id) || c.status === 'approved' || c.status === 'edited'
    );

    if (approvedConcepts.length === 0) {
      // approvedConceptIds might be stale, fall back to concept review
      return {
        step: 'reviewing',
        message: 'Resuming concept review - no valid approved concepts found'
      };
    }

    return {
      step: 'refining',
      message: `Resuming point generation - ${approvedConcepts.length} approved concepts`
    };
  }

  // If we have extracted concepts, user needs to review them
  if (job.extractedConcepts.length > 0) {
    const pendingConcepts = job.extractedConcepts.filter(c => c.status === 'pending');
    return {
      step: 'reviewing',
      message: `Resuming concept review - ${pendingConcepts.length} concepts pending`
    };
  }

  // If we have parsed source, we can extract concepts
  if (job.sourcePath) {
    // Verify source file still exists
    try {
      await this.sourceStorage.retrieve(job.id);
      return {
        step: 'extracting',
        message: 'Resuming concept extraction from saved source'
      };
    } catch {
      // Source file missing, need to re-parse
      return {
        step: 'parsing',
        message: 'Source file missing - restarting from parsing'
      };
    }
  }

  // Need to start from scratch
  return {
    step: 'parsing',
    message: 'Starting from the beginning'
  };
}

// Recovery endpoint handler
async recoverJob(jobId: string): Promise<{ step: IngestionJobStatus; message: string }> {
  const job = await this.ingestionRepo.findById(jobId);
  if (!job) throw new NotFoundError('Job not found');

  if (job.status === 'completed') {
    throw new BadRequestError('Job already completed');
  }

  if (job.status === 'cancelled') {
    throw new BadRequestError('Job was cancelled - create a new job instead');
  }

  const recovery = await this.determineRecoveryStep(job);

  // Clear error and update status
  await this.ingestionRepo.update(jobId, {
    status: recovery.step,
    error: null,
    updatedAt: new Date(),
  });

  return recovery;
}
```

**Success criteria:**
- Correctly identifies recovery step
- Resets job to appropriate status
- Preserves existing progress

---

### P5-T11: Resume Failed Ingestion UI

**Description:**
User interface for resuming failed ingestion jobs with error display and recovery options.

**Dependencies:** P5-T09, P5-T10

**Parallel Group:** D

**Files to create:**
- `web/src/components/ingestion/FailedJobRecovery.tsx`

**Files to modify:**
- `web/src/pages/Ingest.tsx` - Handle failed job recovery flow

**Success criteria:**
- Shows clear error message
- Displays preserved progress
- Resume button triggers recovery
- Wizard continues from recovered step

---

### P5-T12: Onboarding Detection Hook

**Description:**
React hook to detect if user is new (no recall sets) and should see onboarding flow.

**Dependencies:** P5-T01

**Parallel Group:** B

**Files to create:**
- `web/src/hooks/use-onboarding.ts`

**Files to modify:**
- `src/api/routes/dashboard.ts` - Add onboarding status to overview

**Implementation:**

```typescript
// web/src/hooks/use-onboarding.ts

const ONBOARDING_STORAGE_KEY = 'contextual-clarity-onboarding';

interface OnboardingState {
  dismissed: boolean;
  completedSteps: string[];
  firstSetCreatedAt: string | null;
}

export function useOnboarding() {
  // Store in localStorage for persistence without auth
  const [state, setStateInternal] = useState<OnboardingState>(() => {
    const stored = localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        // Corrupted storage, reset
      }
    }
    return {
      dismissed: false,
      completedSteps: [],
      firstSetCreatedAt: null,
    };
  });

  const setState = useCallback((newState: Partial<OnboardingState>) => {
    setStateInternal(prev => {
      const updated = { ...prev, ...newState };
      localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Also check server-side for recall set count
  const { data: dashboardData } = useDashboard();

  const isNewUser = useMemo(() => {
    if (state.dismissed) return false;
    if (state.firstSetCreatedAt) return false;
    return dashboardData?.totalRecallSets === 0;
  }, [state, dashboardData]);

  const dismissOnboarding = useCallback(() => {
    setState({ dismissed: true });
  }, [setState]);

  const completeStep = useCallback((step: string) => {
    setState({ completedSteps: [...state.completedSteps, step] });
  }, [state.completedSteps, setState]);

  const markFirstSetCreated = useCallback(() => {
    setState({ firstSetCreatedAt: new Date().toISOString() });
  }, [setState]);

  // For testing: reset onboarding
  const resetOnboarding = useCallback(() => {
    localStorage.removeItem(ONBOARDING_STORAGE_KEY);
    setStateInternal({
      dismissed: false,
      completedSteps: [],
      firstSetCreatedAt: null,
    });
  }, []);

  return {
    isNewUser,
    state,
    dismissOnboarding,
    completeStep,
    markFirstSetCreated,
    resetOnboarding,
  };
}
```

Note: When authentication is added in the future, this should migrate to user preferences stored server-side.

**Success criteria:**
- Detects new user (0 recall sets)
- Respects dismissed state
- Persists across sessions
- Can be reset for testing

---

### P5-T13: First Ingestion Onboarding Flow

**Description:**
Guided onboarding flow that helps new users create their first recall set.

**Dependencies:** P5-T12

**Parallel Group:** D

**Files to create:**
- `web/src/components/onboarding/OnboardingWrapper.tsx`
- `web/src/components/onboarding/OnboardingStep.tsx`
- `web/src/components/onboarding/WelcomeModal.tsx`

**Files to modify:**
- `web/src/pages/Dashboard.tsx` - Show welcome modal for new users
- `web/src/pages/Ingest.tsx` - Wrap with onboarding hints

**Success criteria:**
- Welcome modal shows for new users
- Hints appear at each ingestion step
- Can skip onboarding
- Completes after first set created

---

### P5-T14: Tablet Responsive Ingestion Wizard

**Description:**
Ensure ingestion wizard works well on tablet devices.

**Dependencies:** P5-T01

**Parallel Group:** C

**Files to modify:**
- `web/src/pages/Ingest.tsx` - Responsive layout
- `web/src/components/ingestion/*.tsx` - Touch-friendly adjustments

**Requirements:**
- Works on 768px+ width
- Touch targets minimum 44x44px
- Text inputs scale appropriately
- Progress indicator visible

**Success criteria:**
- Works on iPad/tablet portrait
- All interactions functional via touch
- No horizontal scrolling

---

### P5-T15: Integration Tests

**Description:**
End-to-end tests for integrated ingestion flows.

**Dependencies:** P5-T08, P5-T11, P5-T13

**Parallel Group:** F

**Files to create:**
- `tests/integration/ingestion-integration.test.ts`
- `tests/e2e/ingestion-flow.test.ts`

**Test coverage:**
- Dashboard quick actions navigation
- Active jobs widget show/hide
- Source material viewer display
- Re-ingestion flow
- Failed job recovery
- Onboarding flow

**Success criteria:**
- All tests pass
- Coverage includes error cases
- Tests run in CI

---

## Final Checklist

- [ ] "Create New" nav item works
- [ ] Quick actions on dashboard work
- [ ] Active jobs widget shows/hides correctly
- [ ] Source material viewable for ingested sets
- [ ] Re-ingestion creates new job from source
- [ ] Failed jobs can be recovered
- [ ] Ingestion history page works
- [ ] Onboarding shows for new users
- [ ] Ingestion wizard works on tablet
- [ ] Integration tests pass

---

## File Tree Summary (Phase 5 Additions)

```
contextual-clarity/
├── src/
│   ├── api/routes/
│   │   ├── dashboard.ts               # MODIFIED
│   │   ├── ingestion.ts               # MODIFIED
│   │   └── recall-sets.ts             # MODIFIED
│   ├── core/ingestion/
│   │   └── ingestion-engine.ts        # MODIFIED
│   └── storage/
│       ├── schema.ts                  # MODIFIED
│       └── repositories/
│           └── recall-set.repository.ts # MODIFIED
├── web/src/
│   ├── router.tsx                     # MODIFIED
│   ├── layouts/MainLayout.tsx         # MODIFIED
│   ├── pages/
│   │   ├── Dashboard.tsx              # MODIFIED
│   │   ├── RecallSetDetail.tsx        # MODIFIED
│   │   ├── Ingest.tsx                 # MODIFIED
│   │   └── IngestionHistory.tsx       # NEW
│   ├── components/
│   │   ├── dashboard/
│   │   │   ├── QuickActions.tsx       # NEW
│   │   │   └── ActiveIngestionJobs.tsx # NEW
│   │   ├── source-viewer/
│   │   │   ├── SourceViewer.tsx       # NEW
│   │   │   ├── TextSource.tsx         # NEW
│   │   │   ├── UrlSource.tsx          # NEW
│   │   │   └── PdfSource.tsx          # NEW
│   │   ├── ingestion/
│   │   │   ├── ReIngestModal.tsx      # NEW
│   │   │   └── FailedJobRecovery.tsx  # NEW
│   │   ├── ingestion-history/
│   │   │   ├── IngestionJobTable.tsx  # NEW
│   │   │   └── IngestionJobFilters.tsx # NEW
│   │   └── onboarding/
│   │       ├── OnboardingWrapper.tsx  # NEW
│   │       ├── OnboardingStep.tsx     # NEW
│   │       └── WelcomeModal.tsx       # NEW
│   └── hooks/
│       ├── api/use-ingestion-jobs.ts  # NEW
│       └── use-onboarding.ts          # NEW
└── tests/
    ├── integration/ingestion-integration.test.ts # NEW
    └── e2e/ingestion-flow.test.ts     # NEW
```
