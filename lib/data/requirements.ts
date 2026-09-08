import 'server-only';
import { createClient } from '../supabase/server';
import { createAdminClient } from '../supabase/admin';
import { z } from 'zod';
import { headers } from 'next/headers';
import { logPermissionDenied } from './audit';

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const requirementSchema = z.object({
  name: z.string().min(2, 'Requirement name must be at least 2 characters'),
  description: z.string().optional().default(''),
  accepted_types: z.array(z.string()).min(1, 'Please select at least one accepted file type (PDF, PNG, or JPEG)'),
  max_size_mb: z.number().int().min(1, 'Minimum file size is 1 MB').max(50, 'Maximum file size is 50 MB').default(20),
  due_date_type: z.enum(['fixed', 'relative'], { message: 'Please select a valid due date type' }),
  due_date_value: z.string().min(1, 'Please provide a due date value'),
  routing_template_id: z.preprocess(
    (val) => (typeof val === 'string' && uuidRegex.test(val) ? val : null),
    z.string().uuid().nullable().optional()
  ),
  custom_reminder_days: z.number().int().min(1).max(30).nullable().optional(),
});

export async function getRequirements() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('requirements')
    .select('*, routing_templates(*)')
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to load requirements: ${error.message}`);
  }
  return data || [];
}

export async function getRequirementById(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('requirements')
    .select('*, routing_templates(*)')
    .eq('id', id)
    .single();

  if (error) {
    throw new Error(`Failed to load requirement: ${error.message}`);
  }
  return data;
}

export async function createRequirement(input: z.infer<typeof requirementSchema>) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Not authenticated');

  const { data: dbUser } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!dbUser || !['admin', 'system_admin'].includes(dbUser.role)) {
    await logPermissionDenied({ actorId: user.id, attempted: 'CREATE_REQUIREMENT', targetType: 'requirements' });
    throw new Error('Unauthorized: Only administrators can create requirements.');
  }

  const parsed = requirementSchema.parse(input);
  const adminClient = createAdminClient();

  const { data: newReq, error: insertError } = await adminClient
    .from('requirements')
    .insert({
      name: parsed.name,
      description: parsed.description,
      accepted_types: parsed.accepted_types,
      max_size_mb: parsed.max_size_mb,
      due_date_type: parsed.due_date_type,
      due_date_value: parsed.due_date_value,
      routing_template_id: parsed.routing_template_id || null,
      custom_reminder_days: parsed.custom_reminder_days ?? null,
      version_number: 1,
      signature_config: { page: 'last', x: 380, y: 80, width: 90, height: 34 },
    })
    .select()
    .single();

  if (insertError) {
    throw new Error(`Failed to create requirement: ${insertError.message}`);
  }

  const reqHeaders = await headers();
  const ip = reqHeaders.get('x-forwarded-for') || 'unknown';

  await adminClient.from('audit_log').insert({
    actor_id: user.id,
    action: 'CREATE_REQUIREMENT',
    target_id: newReq.id,
    target_type: 'requirements',
    source_ip: ip,
  });

  return newReq;
}

export async function updateRequirement(id: string, input: Partial<z.infer<typeof requirementSchema>>) {
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
      attempted: 'UPDATE_REQUIREMENT',
      targetType: 'requirements',
      targetId: id,
    });
    throw new Error('Unauthorized');
  }

  const adminClient = createAdminClient();

  // Fetch current version to increment
  const { data: currentReq, error: fetchErr } = await adminClient
    .from('requirements')
    .select('version_number')
    .eq('id', id)
    .single();

  if (fetchErr || !currentReq) {
    throw new Error('Requirement not found');
  }

  const newVersion = (currentReq.version_number || 1) + 1;

  const { data: updatedReq, error: updateError } = await adminClient
    .from('requirements')
    .update({
      ...input,
      version_number: newVersion,
    })
    .eq('id', id)
    .select()
    .single();

  if (updateError) {
    throw new Error(`Failed to update requirement: ${updateError.message}`);
  }

  const reqHeaders = await headers();
  const ip = reqHeaders.get('x-forwarded-for') || 'unknown';

  await adminClient.from('audit_log').insert({
    actor_id: user.id,
    action: 'UPDATE_REQUIREMENT',
    target_id: id,
    target_type: 'requirements',
    source_ip: ip,
  });

  return updatedReq;
}

/**
 * Requirements are never force-deleted out from under existing work: `submissions.requirement_id`
 * is a NOT NULL FK with no ON DELETE clause (RESTRICT), and FR-23 retains submissions/approvals
 * permanently -- so a requirement with any submission against it (in any state, including
 * PURGED, since submission rows themselves are never deleted) simply cannot be removed. This
 * checks that up front and returns a friendly error instead of letting a raw FK violation surface.
 */
export async function deleteRequirement(id: string) {
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
      attempted: 'DELETE_REQUIREMENT',
      targetType: 'requirements',
      targetId: id,
    });
    throw new Error('Unauthorized: Only administrators can delete requirements.');
  }

  const adminClient = createAdminClient();

  const { data: existing, error: fetchErr } = await adminClient
    .from('requirements')
    .select('name')
    .eq('id', id)
    .single();

  if (fetchErr || !existing) {
    throw new Error('Requirement not found.');
  }

  const { count, error: countError } = await adminClient
    .from('submissions')
    .select('id', { count: 'exact', head: true })
    .eq('requirement_id', id);

  if (countError) {
    throw new Error(`Failed to check existing submissions: ${countError.message}`);
  }
  if (count && count > 0) {
    throw new Error(
      `"${existing.name}" has ${count} submission${count === 1 ? '' : 's'} against it and cannot be deleted -- submissions and their approval records are retained permanently.`
    );
  }

  const { error: deleteError } = await adminClient
    .from('requirements')
    .delete()
    .eq('id', id);

  if (deleteError) {
    throw new Error(`Failed to delete requirement: ${deleteError.message}`);
  }

  const reqHeaders = await headers();
  const ip = reqHeaders.get('x-forwarded-for') || 'unknown';

  await adminClient.from('audit_log').insert({
    actor_id: user.id,
    action: 'DELETE_REQUIREMENT',
    target_id: id,
    target_type: 'requirements',
    source_ip: ip,
    payload: { name: existing.name },
  });

  return { success: true };
}

const TEMPLATE_ACCEPTED_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];
const TEMPLATE_MAX_BYTES = 10 * 1024 * 1024; // matches the `templates` bucket's file_size_limit

/**
 * FR-4: "an optional template file to download" -- a blank form an intern can download
 * before filling it out. The `templates` bucket (created in
 * 20240101000002_phase2_requirements_submissions.sql) has no client-readable storage
 * policy, same as `signatures`/`submissions`, so both this upload and the download URL
 * below go through the admin client only.
 */
export async function uploadRequirementTemplate(requirementId: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Not authenticated');

  const { data: dbUser } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (!dbUser || !['admin', 'system_admin'].includes(dbUser.role)) {
    await logPermissionDenied({
      actorId: user.id,
      attempted: 'UPLOAD_REQUIREMENT_TEMPLATE',
      targetType: 'requirements',
      targetId: requirementId,
    });
    throw new Error('Unauthorized: Only administrators can set a requirement template.');
  }

  const file = formData.get('file') as File | null;
  if (!file || file.size === 0) throw new Error('Please choose a file to upload.');
  if (!TEMPLATE_ACCEPTED_TYPES.includes(file.type)) {
    throw new Error('Template must be a PDF, PNG, or JPEG file.');
  }
  if (file.size > TEMPLATE_MAX_BYTES) {
    throw new Error('Template file must be under 10 MB.');
  }

  const adminClient = createAdminClient();
  const ext = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg';
  const storagePath = `${requirementId}/template.${ext}`;
  const fileBuffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await adminClient.storage
    .from('templates')
    .upload(storagePath, fileBuffer, { contentType: file.type, upsert: true });

  if (uploadError) {
    throw new Error(`Failed to upload template: ${uploadError.message}`);
  }

  const { error: updateError } = await adminClient
    .from('requirements')
    .update({ template_url: storagePath })
    .eq('id', requirementId);

  if (updateError) {
    throw new Error(`Failed to save template reference: ${updateError.message}`);
  }

  const reqHeaders = await headers();
  const ip = reqHeaders.get('x-forwarded-for') || 'unknown';

  await adminClient.from('audit_log').insert({
    actor_id: user.id,
    action: 'UPLOAD_REQUIREMENT_TEMPLATE',
    target_id: requirementId,
    target_type: 'requirements',
    source_ip: ip,
  });

  return { success: true };
}

/**
 * Short-lived signed URL (FR-25: expires within 5 minutes) for downloading a
 * requirement's template file. Available to any authenticated user -- requirements
 * themselves are already visible cohort-wide (every intern's checklist shows every
 * requirement), and a blank template is not personal data.
 */
export async function getRequirementTemplateDownloadUrl(requirementId: string): Promise<{ signedUrl: string }> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Not authenticated');

  const adminClient = createAdminClient();
  const { data: req, error: reqError } = await adminClient
    .from('requirements')
    .select('template_url')
    .eq('id', requirementId)
    .single();

  if (reqError || !req?.template_url) {
    throw new Error('No template file is available for this requirement.');
  }

  const { data: signed, error: signError } = await adminClient.storage
    .from('templates')
    .createSignedUrl(req.template_url, 300);

  if (signError || !signed?.signedUrl) {
    throw new Error('Failed to generate a download link for the template.');
  }

  const reqHeaders = await headers();
  const ip = reqHeaders.get('x-forwarded-for') || 'unknown';

  await adminClient.from('audit_log').insert({
    actor_id: user.id,
    action: 'DOWNLOAD_REQUIREMENT_TEMPLATE',
    target_id: requirementId,
    target_type: 'requirements',
    source_ip: ip,
  });

  return { signedUrl: signed.signedUrl };
}
