import { getRoutingTemplates, createRoutingTemplate, deleteRoutingTemplate } from '@lib/data/routing';
import { AdminRoutingTemplateManager } from '@/components/AdminRoutingTemplateManager';
import type { CreateRoutingTemplateInput } from '@/components/AdminRequirementManager';

export default async function RoutingTemplatesPage() {
  const routingTemplates = await getRoutingTemplates();

  async function handleCreateTpl(data: CreateRoutingTemplateInput) {
    'use server';
    try {
      await createRoutingTemplate(data);
      return { success: true };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to create template';
      return { error: msg };
    }
  }

  async function handleDeleteTpl(templateId: string) {
    'use server';
    try {
      await deleteRoutingTemplate(templateId);
      return { success: true };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to delete template';
      return { error: msg };
    }
  }

  return (
    <div className="p-6 md:p-10 space-y-8">
      <AdminRoutingTemplateManager
        routingTemplates={routingTemplates}
        onCreateTemplate={handleCreateTpl}
        onDeleteTemplate={handleDeleteTpl}
      />
    </div>
  );
}
