/**
 * RecallPointForm Component
 *
 * A form for creating or editing recall points. Recall points are individual
 * pieces of knowledge within a recall set that users want to memorize using
 * spaced repetition.
 *
 * Features:
 * - Create mode: Empty form for new recall point creation
 * - Edit mode: Pre-populated form with existing data
 * - Inline validation with error messages
 * - Loading state during form submission
 * - Callbacks for submit and cancel actions
 *
 * Field validations:
 * - Content: Required, 10-2000 characters
 * - Context: Required, 10-2000 characters
 */

import { useState, useCallback, type FormEvent } from 'react';
import { Button, Textarea } from '@/components/ui';

/** Data structure for recall point form fields */
export interface RecallPointFormData {
  /** The main content/fact to be recalled (10-2000 chars) */
  content: string;
  /** Additional context or explanation for the content (10-2000 chars) */
  context: string;
}

/** Validation error messages for each field */
interface FormErrors {
  content?: string;
  context?: string;
}

export interface RecallPointFormProps {
  /** Form mode: "create" for new points, "edit" for existing points */
  mode: 'create' | 'edit';
  /** Initial data to populate the form (required for edit mode) */
  initialData?: RecallPointFormData;
  /** Callback fired when form is successfully submitted with valid data */
  onSubmit: (data: RecallPointFormData) => void | Promise<void>;
  /** Callback fired when user cancels the form */
  onCancel: () => void;
  /** External loading state (e.g., from API call) */
  isLoading?: boolean;
}

/** Minimum character count for content and context fields */
const MIN_CHARS = 10;
/** Maximum character count for content and context fields */
const MAX_CHARS = 2000;

/**
 * Form component for creating and editing recall points.
 * Handles validation, loading states, and data persistence through callbacks.
 */
export function RecallPointForm({
  mode,
  initialData,
  onSubmit,
  onCancel,
  isLoading = false,
}: RecallPointFormProps) {
  // Form field state - initialize with existing data for edit mode
  const [content, setContent] = useState(initialData?.content ?? '');
  const [context, setContext] = useState(initialData?.context ?? '');

  // Validation error state for each field
  const [errors, setErrors] = useState<FormErrors>({});

  // Internal submitting state to track form submission progress
  const [isSubmitting, setIsSubmitting] = useState(false);

  /**
   * Validate all form fields and return true if valid.
   * Updates error state for any invalid fields.
   */
  const validateForm = useCallback((): boolean => {
    const newErrors: FormErrors = {};

    // Content validation: required, 10-2000 characters
    const trimmedContent = content.trim();
    if (!trimmedContent) {
      newErrors.content = 'Content is required';
    } else if (trimmedContent.length < MIN_CHARS) {
      newErrors.content = `Content must be at least ${MIN_CHARS} characters`;
    } else if (trimmedContent.length > MAX_CHARS) {
      newErrors.content = `Content must be ${MAX_CHARS} characters or less`;
    }

    // Context validation: required, 10-2000 characters
    const trimmedContext = context.trim();
    if (!trimmedContext) {
      newErrors.context = 'Context is required';
    } else if (trimmedContext.length < MIN_CHARS) {
      newErrors.context = `Context must be at least ${MIN_CHARS} characters`;
    } else if (trimmedContext.length > MAX_CHARS) {
      newErrors.context = `Context must be ${MAX_CHARS} characters or less`;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [content, context]);

  /**
   * Handle form submission. Validates data before calling onSubmit callback.
   * Prevents double-submission by tracking submitting state.
   */
  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      // Don't submit if already in progress
      if (isSubmitting || isLoading) {
        return;
      }

      // Validate form before submission
      if (!validateForm()) {
        return;
      }

      setIsSubmitting(true);

      try {
        // Prepare form data with trimmed values
        const formData: RecallPointFormData = {
          content: content.trim(),
          context: context.trim(),
        };

        // Call the parent's submit handler (may be async)
        await onSubmit(formData);
      } finally {
        setIsSubmitting(false);
      }
    },
    [content, context, isSubmitting, isLoading, validateForm, onSubmit]
  );

  // Combined loading state from internal and external sources
  const showLoading = isSubmitting || isLoading;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Content field - the main fact/knowledge to be memorized */}
      <Textarea
        label="Content"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        error={errors.content}
        placeholder="Enter the content or fact you want to remember"
        helperText={`${content.length}/${MAX_CHARS} characters (minimum ${MIN_CHARS})`}
        disabled={showLoading}
        maxLength={MAX_CHARS}
        rows={6}
        required
      />

      {/* Context field - additional explanation or background */}
      <Textarea
        label="Context"
        value={context}
        onChange={(e) => setContext(e.target.value)}
        error={errors.context}
        placeholder="Provide context, examples, or explanations to help understand and recall this content"
        helperText={`${context.length}/${MAX_CHARS} characters (minimum ${MIN_CHARS})`}
        disabled={showLoading}
        maxLength={MAX_CHARS}
        rows={6}
        required
      />

      {/* Form action buttons */}
      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
        {/* Cancel button - secondary variant */}
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          disabled={showLoading}
        >
          Cancel
        </Button>

        {/* Submit button - primary variant with loading state */}
        <Button type="submit" variant="primary" isLoading={showLoading}>
          {mode === 'create' ? 'Create Recall Point' : 'Save Changes'}
        </Button>
      </div>
    </form>
  );
}

// Display name for React DevTools
RecallPointForm.displayName = 'RecallPointForm';
