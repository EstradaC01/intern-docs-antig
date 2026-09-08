import 'server-only';
import { createClient } from '../supabase/server';
import { createAdminClient } from '../supabase/admin';
import { z } from 'zod';
import { headers } from 'next/headers';
import { logPermissionDenied } from './audit';

const stepSchema = z.object({
  step: z.number().int().min(1).max(2),
  role: z.enum(['approver', 'admin', 'system_admin']).optional(),
  user_id: z.string().uuid().optional(),
  name: z.string().min(2),
});

const routingTemplateSchema = z.object({
  name: z.string().min(2, 'Template name must be at least 2 characters'),
  steps: z.array(stepSchema).min(1, 'At least 1 step required').max(2, 'Maximum 2 sequential steps allowed'),
  sla_days: z.number().int().min(1).max(30).default(2),
});

export async function getRoutingTemplates() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('routing_templates')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to load routing templates: ${error.message}`);
  }
  return data || [];
}

export async function getApproversList() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Not authenticated');

  const { data: dbUser } = await supabase.from('users').select('role').eq('id', user.id).single();
  // FR-2: only approvers/admins need to enumerate other approvers (for the reassignment picker).
  if (!dbUser || !['approver', 'admin', 'system_admin'].includes(dbUser.role)) {
    await logPermissionDenied({ actorId: user.id, attempted: 'LIST_APPROVERS', targetType: 'users' });
    throw new Error('Unauthorized');
  }

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from('users')
    .select('id, email, role')
    .in('role', ['approver', 'admin', 'system_admin'])
    .order('email', { ascending: true });

  if (error) {
    throw new Error(`Failed to load approvers: ${error.message}`);
  }
  return data || [];
}

export async function createRoutingTemplate(input: z.infer<typeof routingTemplateSchema>) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Not authenticated');

  const { data: dbUser } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!dbUser || !['admin', 'system_admin'].includes(dbUser.role)) {
    await logPermissionDenied({ actorId: user.id, attempted: 'CREATE_ROUTING_TEMPLATE', targetType: 'routing_templates' });
    throw new Error('Unauthorized');
  }

  const parsed = routingTemplateSchema.parse(input);
  const adminClient = createAdminClient();

  const { data: newTemplate, error: insertError } = await adminClient
    .from('routing_templates')
    .insert({
      name: parsed.name,
      steps: parsed.steps,
      sla_days: parsed.sla_days,
    })
    .select()
    .single();

  if (insertError) {
    throw new Error(`Failed to create routing template: ${insertError.message}`);
  }

  const reqHeaders = await headers();
  const ip = reqHeaders.get('x-forwarded-for') || 'unknown';

  await adminClient.from('audit_log').insert({
    actor_id: user.id,
    action: 'CREATE_ROUTING_TEMPLATE',
    target_id: newTemplate.id,
    target_type: 'routing_templates',
    source_ip: ip,
  });

  return newTemplate;
}

/**
 * A routing template can be deleted once it's safely orphaned, mirroring the manual
 * migration precedent (20240101000017_remove_lead_admin_and_2step_approval_templates.sql):
 * block the delete if any requirement still points at it via routing_template_id (RESTRICT
 * FK, no ON DELETE clause) rather than silently nulling those requirements out. Past
 * submissions are unaffected either way -- their routing steps are frozen into
 * `submissions.routing_snapshot` at submission time, not read live from the template.
 */
export async function deleteRoutingTemplate(id: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Not authenticated');

  const { data: dbUser } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!dbUser || !['admin', 'system_admin'].includes(dbUser.role)) {
    await logPermissionDenied({
      actorId: user.id,
      attempted: 'DELETE_ROUTING_TEMPLATE',
      targetType: 'routing_templates',
      targetId: id,
    });
    throw new Error('Unauthorized: Only administrators can delete routing templates.');
  }

  const adminClient = createAdminClient();

  const { data: existing, error: fetchErr } = await adminClient
    .from('routing_templates')
    .select('name')
    .eq('id', id)
    .single();

  if (fetchErr || !existing) {
    throw new Error('Routing template not found.');
  }

  const { count, error: countError } = await adminClient
    .from('requirements')
    .select('id', { count: 'exact', head: true })
    .eq('routing_template_id', id);

  if (countError) {
    throw new Error(`Failed to check requirements using this template: ${countError.message}`);
  }
  if (count && count > 0) {
    throw new Error(
      `"${existing.name}" is still used by ${count} requirement${count === 1 ? '' : 's'}. Repoint ${count === 1 ? 'it' : 'them'} to a different routing template first.`
    );
  }

  const { error: deleteError } = await adminClient
    .from('routing_templates')
    .delete()
    .eq('id', id);

  if (deleteError) {
    throw new Error(`Failed to delete routing template: ${deleteError.message}`);
  }

  const reqHeaders = await headers();
  const ip = reqHeaders.get('x-forwarded-for') || 'unknown';

  await adminClient.from('audit_log').insert({
    actor_id: user.id,
    action: 'DELETE_ROUTING_TEMPLATE',
    target_id: id,
    target_type: 'routing_templates',
    source_ip: ip,
    payload: { name: existing.name },
  });

  return { success: true };
}
