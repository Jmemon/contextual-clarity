/**
 * Create Recall Set Page Component
 *
 * Displays a form for creating a new recall set.
 * After successful creation, redirects to the new recall set's detail page.
 *
 * @route /recall-sets/new
 */

import { useNavigate, Link } from 'react-router-dom';
import { Card } from '@/components/ui';
import { RecallSetForm, type RecallSetFormData } from '@/components/forms';
import { useCreateRecallSet } from '@/hooks/api/use-recall-sets';

/**
 * Page for creating a new recall set.
 * Renders a form in a card layout with a back link.
 */
export function CreateRecallSet() {
  const navigate = useNavigate();
  const createMutation = useCreateRecallSet();

  /**
   * Handle form submission - creates the recall set and navigates to it.
   */
  const handleSubmit = async (data: RecallSetFormData) => {
    const newSet = await createMutation.mutateAsync({
      name: data.name,
      description: data.description || undefined,
      discussionSystemPrompt: data.discussionSystemPrompt || undefined,
    });
    navigate(`/recall-sets/${newSet.id}`);
  };

  /**
   * Handle cancel - go back to recall sets list.
   */
  const handleCancel = () => {
    navigate('/recall-sets');
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      {/* Back link */}
      <nav className="mb-6">
        <Link
          to="/recall-sets"
          className="inline-flex items-center text-sm text-clarity-600 hover:text-clarity-800 transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4 mr-1"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Recall Sets
        </Link>
      </nav>

      {/* Form card */}
      <Card className="p-6">
        <h1 className="text-2xl font-bold text-clarity-800 mb-6">Create New Recall Set</h1>
        <RecallSetForm
          mode="create"
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          isLoading={createMutation.isPending}
          error={createMutation.error?.message}
        />
      </Card>
    </div>
  );
}

export default CreateRecallSet;
