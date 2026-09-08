import { getRequirements, createRequirement, uploadRequirementTemplate, deleteRequirement } from '@lib/data/requirements';
import { getRoutingTemplates } from '@lib/data/routing';
import { AdminRequirementManager, CreateRequirementInput } from '@/components/AdminRequirementManager';

export default async function RequirementsPage() {
  const [requirements, routingTemplates] = await Promise.all([
    getRequirements(),
    getRoutingTemplates(),
  ]);

  async function handleCreateReq(data: CreateRequirementInput) {
    'use server';
    try {
      await createRequirement({
        ...data,
        description: data.description || '',
      });
      return { success: true };
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'issues' in e && Array.isArray((e as { issues: Array<{ message: string }> }).issues)) {
        return { error: (e as { issues: Array<{ message: string }> }).issues[0]?.message || 'Please check the requirement form details.' };
      }
      const msg = e instanceof Error ? e.message : 'Failed to create requirement';
      return { error: msg };
    }
  }

  async function handleUploadTemplate(requirementId: string, formData: FormData) {
    'use server';
    try {
      await uploadRequirementTemplate(requirementId, formData);
      return { success: true };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to upload template';
      return { error: msg };
    }
  }

  async function handleDeleteReq(requirementId: string) {
    'use server';
    try {
      await deleteRequirement(requirementId);
      return { success: true };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to delete requirement';
      return { error: msg };
    }
  }

  return (
    <div className="p-6 md:p-10 space-y-8">
      <AdminRequirementManager
        requirements={requirements}
        routingTemplates={routingTemplates}
        onCreateRequirement={handleCreateReq}
        onUploadTemplate={handleUploadTemplate}
        onDeleteRequirement={handleDeleteReq}
      />
    </div>
  );
}
