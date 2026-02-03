/**
 * RecallSetForm Component
 *
 * A form for creating or editing recall sets. Recall sets are collections
 * of recall points that share a common theme or subject for spaced repetition learning.
 *
 * Features:
 * - Create mode: Empty form for new recall set creation
 * - Edit mode: Pre-populated form with existing data
 * - Inline validation with error messages
 * - Loading state during form submission
 * - Callbacks for submit and cancel actions
 *
 * Field validations:
 * - Name: Required, 1-100 characters
 * - Description: Required, max 1000 characters
 * - Discussion System Prompt: Required, min 10 characters
 */

import { useState, useCallback, type FormEvent } from 'react';
import { Button, Input, Textarea } from '@/components/ui';

/** Data structure for recall set form fields */
export interface RecallSetFormData {
  /** Name of the recall set (1-100 chars) */
  name: string;
  /** Description of the recall set (max 1000 chars) */
  description: string;
  /** System prompt for AI discussion generation (min 10 chars) */
  discussionSystemPrompt: string;
}

/** Validation error messages for each field */
interface FormErrors {
  name?: string;
  description?: string;
  discussionSystemPrompt?: string;
}

export interface RecallSetFormProps {
  /** Form mode: "create" for new sets, "edit" for existing sets */
  mode: 'create' | 'edit';
  /** Initial data to populate the form (required for edit mode) */
  initialData?: RecallSetFormData;
  /** Callback fired when form is successfully submitted with valid data */
  onSubmit: (data: RecallSetFormData) => void | Promise<void>;
  /** Callback fired when user cancels the form */
  onCancel: () => void;
  /** External loading state (e.g., from API call) */
  isLoading?: boolean;
}

/**
 * Form component for creating and editing recall sets.
 * Handles validation, loading states, and data persistence through callbacks.
 */
export function RecallSetForm({
  mode,
  initialData,
  onSubmit,
  onCancel,
  isLoading = false,
}: RecallSetFormProps) {
  // Form field state - initialize with existing data for edit mode
  const [name, setName] = useState(initialData?.name ?? '');
  const [description, setDescription] = useState(initialData?.description ?? '');
  const [discussionSystemPrompt, setDiscussionSystemPrompt] = useState(
    initialData?.discussionSystemPrompt ?? ''
  );

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

    // Name validation: required, 1-100 characters
    const trimmedName = name.trim();
    if (!trimmedName) {
      newErrors.name = 'Name is required';
    } else if (trimmedName.length > 100) {
      newErrors.name = 'Name must be 100 characters or less';
    }

    // Description validation: required, max 1000 characters
    const trimmedDescription = description.trim();
    if (!trimmedDescription) {
      newErrors.description = 'Description is required';
    } else if (trimmedDescription.length > 1000) {
      newErrors.description = 'Description must be 1000 characters or less';
    }

    // Discussion System Prompt validation: required, min 10 characters
    const trimmedPrompt = discussionSystemPrompt.trim();
    if (!trimmedPrompt) {
      newErrors.discussionSystemPrompt = 'Discussion system prompt is required';
    } else if (trimmedPrompt.length < 10) {
      newErrors.discussionSystemPrompt =
        'Discussion system prompt must be at least 10 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [name, description, discussionSystemPrompt]);

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
        const formData: RecallSetFormData = {
          name: name.trim(),
          description: description.trim(),
          discussionSystemPrompt: discussionSystemPrompt.trim(),
        };

        // Call the parent's submit handler (may be async)
        await onSubmit(formData);
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      name,
      description,
      discussionSystemPrompt,
      isSubmitting,
      isLoading,
      validateForm,
      onSubmit,
    ]
  );

  // Combined loading state from internal and external sources
  const showLoading = isSubmitting || isLoading;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Name field - short text input */}
      <Input
        label="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={errors.name}
        placeholder="Enter recall set name"
        disabled={showLoading}
        maxLength={100}
        required
      />

      {/* Description field - multi-line text area */}
      <Textarea
        label="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        error={errors.description}
        placeholder="Describe the purpose and content of this recall set"
        helperText={`${description.length}/1000 characters`}
        disabled={showLoading}
        maxLength={1000}
        rows={4}
        required
      />

      {/* Discussion System Prompt field - longer text area for AI instructions */}
      <Textarea
        label="Discussion System Prompt"
        value={discussionSystemPrompt}
        onChange={(e) => setDiscussionSystemPrompt(e.target.value)}
        error={errors.discussionSystemPrompt}
        placeholder="Enter the system prompt for AI-generated discussions about this recall set"
        helperText="This prompt guides how AI generates discussion questions for recall points"
        disabled={showLoading}
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
          {mode === 'create' ? 'Create Recall Set' : 'Save Changes'}
        </Button>
      </div>
    </form>
  );
}

// Display name for React DevTools
RecallSetForm.displayName = 'RecallSetForm';
