import 'server-only';
import { createClient } from '../supabase/server';
import { createAdminClient } from '../supabase/admin';
import { validateAndSealFile } from './file-validation';
import { getSignatureBytesForCompositing, hasEnrolledSignature } from './signatures';
import { compositeSignedPdf } from '../pdf/composite';
import { SubmissionState, UserRole, validateTransition, IllegalTransitionError, type Action } from '../state-machine';
import { z } from 'zod';
import { headers } from 'next/headers';
import crypto from 'crypto';
import { sendEmailWithRetry } from '../email/resend';
import { emailTemplates } from '../email/templates';
import { logPermissionDenied } from './audit';

// Helper to fetch emails for user ID or role
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getEmailsForRecipients(adminClient: any, userId: string | null, role: string | null): Promise<string[]> {
  if (userId) {
    const { data } = await adminClient.from('users').select('email').eq('id', userId).single();
    return data ? [data.email] : [];
  }
  if (role) {
    const { data } = await adminClient.from('users').select('email').eq('role', role);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return data ? data.map((u: any) => u.email) : [];
  }
  return [];
}

const returnCommentSchema = z.string().min(10, 'Return comment must be at least 10 characters explaining what needs correction.');
const reassignReasonSchema = z.string().min(10, 'Reassignment reason must be at least 10 characters.');

/**
 * FR-13 / FR-24: an illegal transition must be rejected with 409 AND written to the audit
 * log as a denied attempt. Wraps validateTransition so every call site gets this for free.
 */
async function validateTransitionAudited(
  adminClient: ReturnType<typeof createAdminClient>,
  actorId: string | null,
  targetId: string | null,
  currentState: SubmissionState,
  action: Action,
  role: UserRole
): Promise<SubmissionState> {
  try {
    return validateTransition(currentState, action, role);
  } catch (err) {
    if (err instanceof IllegalTransitionError && targetId) {
      const reqHeaders = await headers();
      const ip = reqHeaders.get('x-forwarded-for') || 'unknown';
      await adminClient.from('audit_log').insert({
        actor_id: actorId,
        action: 'DENIED_TRANSITION',
        target_id: targetId,
        target_type: 'submissions',
        source_ip: ip,
        payload: { attempted_action: action, from_state: currentState, role },
      });
    }
    throw err;
  }
}

export interface RequirementRecord {
  id: string;
  name: string;
  description: string;
  accepted_types: string[];
  max_size_mb: number;
  due_date_type: string;
  due_date_value: string;
  routing_template_id?: string | null;
  version_number?: number;
  template_url?: string | null;
  signature_config?: {
    page?: 'first' | 'last' | number;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  };
  routing_templates?: {
    id?: string;
    name?: string;
    steps?: Array<{ step: number; role?: string; user_id?: string; name?: string }>;
    sla_days?: number;
  } | null;
}

export interface SubmissionVersionRecord {
  id: string;
  submission_id?: string;
  version_number: number;
  file_url: string;
  file_hash: string;
  return_comment?: string | null;
  is_superseded: boolean;
  created_at: string;
}

export interface ApprovalRecord {
  id: string;
  submission_id?: string;
  version_id?: string;
  approver_id: string;
  step: number;
  file_hash: string;
  signed_pdf_url?: string | null;
  created_at: string;
  users?: { email?: string; full_name?: string | null } | null;
}

export interface SubmissionWithRelations {
  id: string;
  requirement_id: string;
  intern_id: string;
  state: SubmissionState;
  current_step: number;
  /** When the submission entered `current_step` -- the FR-19 digest SLA clock. Distinct
   *  from `updated_at`, which bumps on any write (e.g. a reassignment). */
  current_step_entered_at: string | null;
  current_holder_id: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  routing_snapshot?: { steps?: Array<{ step: number; role?: string; user_id?: string; name?: string }>; sla_days?: number; name?: string } | null;
  users?: { id: string; email: string; full_name?: string | null; school?: string | null; batch?: string | null };
  /** Current step holder (FR-5: shown to the intern while a submission is In Review). */
  current_holder?: { id: string; email: string; full_name?: string | null } | null;
  requirements?: RequirementRecord | null;
  submission_versions?: SubmissionVersionRecord[];
  approvals?: ApprovalRecord[];
}

/**
 * Computes due date for relative or fixed requirements based on intern dates.
 */
function computeDueDate(req: RequirementRecord, internStart?: string | null): Date | null {
  if (req.due_date_type === 'fixed' && req.due_date_value) {
    return new Date(req.due_date_value);
  }
  if (req.due_date_type === 'relative' && req.due_date_value && internStart) {
    const days = parseInt(req.due_date_value, 10) || 0;
    const date = new Date(internStart);
    date.setDate(date.getDate() + days);
    return date;
  }
  return null;
}

/**
 * FR-8: Extract routing steps, preferring the frozen snapshot captured at submission
 * time over the live template join. Legacy rows without a snapshot fall back to the
 * live join so existing data keeps working.
 */
function getRoutingSteps(sub: SubmissionWithRelations): Array<{ step: number; role?: string; user_id?: string; name?: string }> {
  if (sub.routing_snapshot?.steps) return sub.routing_snapshot.steps;
  return sub.requirements?.routing_templates?.steps || [];
}

/**
 * Intern checklist: Returns all requirements with submission state, versions, countdowns, and signed status.
 */
export async function getInternChecklist() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Not authenticated');

  // Fetch intern details (start/end dates)
  const { data: intern } = await supabase
    .from('users')
    .select('id, email, role, internship_start, internship_end')
    .eq('id', user.id)
    .single();

  // Fetch all requirements with routing templates
  const { data: requirements, error: reqError } = await supabase
    .from('requirements')
    .select('*, routing_templates(*)')
    .order('created_at', { ascending: true });

  if (reqError) throw new Error(`Failed to load requirements: ${reqError.message}`);

  // Fetch all submissions for this intern
  const { data: submissions, error: subError } = await supabase
    .from('submissions')
    .select(`
      id,
      requirement_id,
      state,
      current_step,
      current_holder_id,
      due_date,
      created_at,
      updated_at,
      submission_versions(id, version_number, file_url, file_hash, return_comment, is_superseded, created_at),
      approvals(id, step, approver_id, file_hash, signed_pdf_url, created_at, users(id, email, full_name, role)),
      current_holder:users!submissions_current_holder_id_fkey(id, email, full_name)
    `)
    .eq('intern_id', user.id);

  if (subError) throw new Error(`Failed to load submissions: ${subError.message}`);

  const now = new Date();
  const typedRequirements = (requirements || []) as RequirementRecord[];
  const typedSubmissions = (submissions || []) as unknown as SubmissionWithRelations[];

  const checklist = typedRequirements.map((req) => {
    const sub = typedSubmissions.find((s) => s.requirement_id === req.id);
    const dueDate = sub?.due_date ? new Date(sub.due_date) : computeDueDate(req, intern?.internship_start);
    
    let daysRemaining: number | null = null;
    let isOverdue = false;
    let deletionDate: Date | null = null;
    let deletionDaysRemaining: number | null = null;

    if (dueDate) {
      const diffTime = dueDate.getTime() - now.getTime();
      daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (daysRemaining < 0 && sub?.state !== SubmissionState.APPROVED && sub?.state !== SubmissionState.PURGED) {
        isOverdue = true;
      }
    }

    const versions = (sub?.submission_versions || []).sort(
      (a, b) => b.version_number - a.version_number
    );
    const activeVersion = versions.find((v) => !v.is_superseded) || versions[0] || null;
    const approvals = (sub?.approvals || []).sort(
      (a, b) => a.step - b.step || new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    const latestApproval = [...approvals].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0] || null;

    // If a submission record exists but has no version files (e.g. from an interrupted initial upload), reset state to NOT_STARTED so user can upload
    const effectiveState = (!sub || versions.length === 0) ? 'NOT_STARTED' : sub.state;

    // Calculate deletion date (FR-20)
    if (effectiveState === 'APPROVED' && latestApproval) {
      deletionDate = new Date(latestApproval.created_at);
      deletionDate.setDate(deletionDate.getDate() + 30);
    } else if (effectiveState !== 'APPROVED' && intern?.internship_end) {
      deletionDate = new Date(intern.internship_end);
      deletionDate.setDate(deletionDate.getDate() + 30);
    }

    if (deletionDate && effectiveState !== 'PURGED') {
      const diffDelTime = deletionDate.getTime() - now.getTime();
      deletionDaysRemaining = Math.ceil(diffDelTime / (1000 * 60 * 60 * 24));
    }

    return {
      requirement: req,
      submission: sub || null,
      state: effectiveState,
      dueDate: dueDate ? dueDate.toISOString() : null,
      daysRemaining,
      isOverdue,
      activeVersion,
      latestApproval,
      approvals,
      versions,
      deletionDate: deletionDate ? deletionDate.toISOString() : null,
      deletionDaysRemaining,
      // FR-5: shown next to the status badge only while a submission is In Review.
      currentHolderName: effectiveState === 'IN_REVIEW'
        ? (sub?.current_holder?.full_name || sub?.current_holder?.email || null)
        : null,
    };
  });

  return JSON.parse(JSON.stringify(checklist));
}

/**
 * Approver review queue: Items pending action assigned to current approver.
 */
export async function getApproverQueue() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Not authenticated');

  const { data: dbUser } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!dbUser || !['approver', 'admin', 'system_admin'].includes(dbUser.role)) {
    await logPermissionDenied({ actorId: user.id, attempted: 'READ_APPROVER_QUEUE', targetType: 'submissions' });
    throw new Error('Unauthorized');
  }

  // Query submissions in IN_REVIEW assigned to current user or role
  let query = supabase
    .from('submissions')
    .select(`
      id,
      requirement_id,
      intern_id,
      state,
      current_step,
      current_holder_id,
      due_date,
      created_at,
      updated_at,
      routing_snapshot,
      users!submissions_intern_id_fkey(id, email, full_name, school, batch),
      requirements(id, name, max_size_mb, accepted_types, signature_config, routing_templates(*)),
      submission_versions(id, version_number, file_url, file_hash, return_comment, is_superseded, created_at),
      approvals(id, step, approver_id, created_at)
    `)
    .eq('state', SubmissionState.IN_REVIEW)
    // Sorted by the same timestamp the "wait time" column actually displays (waitingHours,
    // below) -- sorting by created_at instead would visibly disagree with the displayed
    // urgency after a reassignment or return/resubmit bumps updated_at.
    .order('updated_at', { ascending: true });

  if (dbUser.role === 'approver') {
    query = query.or(`current_holder_id.eq.${user.id},current_holder_id.is.null`);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load approver queue: ${error.message}`);

  const now = new Date();
  const typedData = (data || []) as unknown as SubmissionWithRelations[];

  const queue = typedData.map((sub) => {
    const versions = sub.submission_versions || [];
    const activeVersion = versions.find((v) => !v.is_superseded) || versions[0] || null;
    const dueDate = sub.due_date ? new Date(sub.due_date) : null;
    const isOverdue = dueDate ? dueDate.getTime() < now.getTime() : false;
    const waitingHours = Math.floor((now.getTime() - new Date(sub.updated_at || sub.created_at).getTime()) / (1000 * 60 * 60));

    const steps = getRoutingSteps(sub).length > 0 ? getRoutingSteps(sub) : [{ step: 1, role: 'approver' as const }];
    const totalSteps = steps.length;
    const currentStep = sub.current_step || 1;
    const currentStepConfig = steps.find((s) => s.step === currentStep) || { step: currentStep, role: 'approver' as const };
    const stepRole = currentStepConfig.role || 'approver';

    const alreadyApprovedByUser = (sub.approvals || []).some((a) => a.step === currentStep && a.approver_id === user.id);

    let canUserApprove = true;
    let disabledReason: string | null = null;

    if (dbUser.role === 'approver') {
      if (stepRole === 'admin' || currentStep > 1) {
        canUserApprove = false;
        disabledReason = 'Awaiting Admin Final Approval';
      } else if (alreadyApprovedByUser) {
        canUserApprove = false;
        disabledReason = 'Step 1 Already Approved by You';
      }
    } else if (dbUser.role === 'admin' || dbUser.role === 'system_admin') {
      if (alreadyApprovedByUser) {
        canUserApprove = false;
        disabledReason = 'Step Already Approved by You';
      }
    }

    return {
      ...sub,
      activeVersion,
      isOverdue,
      waitingHours,
      totalSteps,
      currentStep,
      stepRole,
      canUserApprove,
      disabledReason,
    };
  });

  return JSON.parse(JSON.stringify(queue));
}

/**
 * Get single submission with verification that requesting user is owner, approver, or admin.
 */
export async function getSubmissionDetails(submissionId: string): Promise<SubmissionWithRelations> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Not authenticated');

  const { data: dbUser } = await supabase.from('users').select('role').eq('id', user.id).single();
  const role = dbUser?.role;

  const { data: submission, error } = await supabase
    .from('submissions')
    .select(`
      *,
      users!submissions_intern_id_fkey(id, email),
      requirements(*, routing_templates(*)),
      submission_versions(*),
      approvals(*, users(email))
    `)
    .eq('id', submissionId)
    .single();

  if (error || !submission) {
    throw new Error('Submission not found or unauthorized');
  }

  const typedSub = submission as unknown as SubmissionWithRelations;

  // Authorization check (FR-2, FR-26)
  if (role === 'intern' && typedSub.intern_id !== user.id) {
    await logPermissionDenied({
      actorId: user.id,
      attempted: 'READ_SUBMISSION',
      targetType: 'submissions',
      targetId: submissionId,
      reason: 'intern requested another intern\'s submission',
    });
    throw new Error('Forbidden: You cannot access another intern\'s submission');
  }

  if (role === 'approver' && typedSub.current_holder_id !== user.id && !typedSub.approvals?.some((a) => a.approver_id === user.id)) {
    const currentStep = typedSub.current_step;
    const steps = getRoutingSteps(typedSub);
    const stepConfig = steps.find((s) => s.step === currentStep);
    if (!stepConfig || (stepConfig.role !== 'approver' && stepConfig.user_id !== user.id)) {
      await logPermissionDenied({
        actorId: user.id,
        attempted: 'READ_SUBMISSION',
        targetType: 'submissions',
        targetId: submissionId,
        reason: 'approver not assigned to the current step and has not acted on it',
      });
      throw new Error('Forbidden: This submission is not assigned to your review');
    }
  }

  return typedSub;
}

/**
 * Fetch the timeline of events for a given submission.
 */
export async function getSubmissionTimeline(submissionId: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Not authenticated');

  // Verify access using getSubmissionDetails
  await getSubmissionDetails(submissionId);

  // Fetch audit logs for this submission
  const adminClient = createAdminClient();
  const { data: events, error: auditErr } = await adminClient
    .from('audit_log')
    .select(`
      id,
      action,
      created_at,
      actor_id
    `)
    .eq('target_id', submissionId)
    .order('created_at', { ascending: false });

  if (auditErr) throw new Error(`Failed to load timeline: ${auditErr.message}`);

  // Fetch users manually since foreign key points to auth.users, not public.users
  const actorIds = [...new Set(events.map(e => e.actor_id).filter(Boolean))];
  const { data: usersData } = await adminClient
    .from('users')
    .select('id, email, role')
    .in('id', actorIds);

  const usersMap = new Map((usersData || []).map(u => [u.id, u]));
  const timelineWithUsers = events.map(e => ({
    ...e,
    users: e.actor_id ? usersMap.get(e.actor_id) || null : null
  }));

  return JSON.parse(JSON.stringify(timelineWithUsers));
}

/**
 * Upload initial submission for a requirement.
 */
export async function uploadSubmission(formData: FormData) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Not authenticated');

  const requirementId = formData.get('requirement_id') as string;
  const file = formData.get('file') as File;

  if (!requirementId || !file) {
    throw new Error('Missing requirement or file attachment.');
  }

  const { data: intern } = await supabase
    .from('users')
    .select('id, email, role, internship_start')
    .eq('id', user.id)
    .single();

  if (!intern || intern.role !== 'intern') {
    throw new Error('Only interns can upload submissions.');
  }

  // Fetch requirement
  const { data: requirement, error: reqErr } = await supabase
    .from('requirements')
    .select('*, routing_templates(*)')
    .eq('id', requirementId)
    .single();

  if (reqErr || !requirement) {
    throw new Error('Requirement not found.');
  }

  const typedReq = requirement as unknown as RequirementRecord;

  // Validate file with magic bytes & hash
  const fileArrayBuffer = await file.arrayBuffer();
  const fileBuffer = Buffer.from(fileArrayBuffer);
  const validated = validateAndSealFile(fileBuffer, typedReq.accepted_types, typedReq.max_size_mb);

  const adminClient = createAdminClient();

  // Validate state transition from DRAFT to SUBMITTED, then the system's automatic
  // assignment of step 1 (SUBMITTED -> IN_REVIEW) -- both legs go through the state
  // machine, not a direct state-column write.
  await validateTransitionAudited(adminClient, user.id, null, SubmissionState.DRAFT, 'SUBMIT', UserRole.INTERN);
  await validateTransitionAudited(adminClient, null, null, SubmissionState.SUBMITTED, 'ASSIGN_STEP', UserRole.SYSTEM_ADMIN);

  const dueDate = computeDueDate(typedReq, intern.internship_start);

  // Determine step 1 holder
  const steps = (typedReq.routing_templates?.steps || []) as Array<{ step: number; role?: string; user_id?: string; name?: string }>;
  const step1 = steps.find((s) => s.step === 1) || { role: 'approver' };
  const step1HolderId = ('user_id' in step1 && step1.user_id) ? step1.user_id : null;

  // Check if a submission already exists for this intern and requirement (e.g. from an incomplete previous attempt)
  const { data: existingSub } = await supabase
    .from('submissions')
    .select('id, state, submission_versions(id)')
    .eq('intern_id', user.id)
    .eq('requirement_id', requirementId)
    .maybeSingle();

  let subId = existingSub?.id;

  if (!existingSub) {
    // Insert new submission using admin client to enforce state machine
    const { data: newSub, error: subInsertErr } = await adminClient
      .from('submissions')
      .insert({
        intern_id: user.id,
        requirement_id: requirementId,
        state: SubmissionState.IN_REVIEW, // Advances to IN_REVIEW at step 1
        current_step: 1,
        current_step_entered_at: new Date().toISOString(),
        current_holder_id: step1HolderId,
        due_date: dueDate ? dueDate.toISOString() : null,
        routing_snapshot: typedReq.routing_templates || null, // FR-8: freeze template at submission time
      })
      .select()
      .single();

    if (subInsertErr) {
      throw new Error(`Failed to create submission record: ${subInsertErr.message}`);
    }
    subId = newSub.id;
  } else {
    // Update existing submission record to IN_REVIEW
    await adminClient
      .from('submissions')
      .update({
        state: SubmissionState.IN_REVIEW,
        current_step: 1,
        current_step_entered_at: new Date().toISOString(),
        current_holder_id: step1HolderId,
        due_date: dueDate ? dueDate.toISOString() : null,
        updated_at: new Date().toISOString(),
        routing_snapshot: typedReq.routing_templates || null, // FR-8: freeze template at submission time
      })
      .eq('id', subId);
  }

  // Upload file to private storage bucket (scoped by user ID for maximum RLS policy compatibility)
  const fileExt = validated.mimeType === 'application/pdf' ? 'pdf' : validated.mimeType === 'image/png' ? 'png' : 'jpg';
  const storagePath = `${user.id}/${subId}/v1_${Date.now()}.${fileExt}`;

  const { error: userStorageErr } = await supabase.storage
    .from('submissions')
    .upload(storagePath, fileBuffer, {
      contentType: validated.mimeType,
      upsert: true,
    });

  if (userStorageErr) {
    // Fall back to the service-role client, mirroring enrollSignature's pattern,
    // so a stale/misconfigured RLS policy on the user-context client doesn't block a legitimate upload.
    const { error: adminStorageErr } = await adminClient.storage
      .from('submissions')
      .upload(storagePath, fileBuffer, {
        contentType: validated.mimeType,
        upsert: true,
      });

    if (adminStorageErr) {
      console.error('[uploadSubmission] Storage upload failed for both user and admin clients:', userStorageErr.message, adminStorageErr.message);
      throw new Error('We could not save your document right now. Please try again in a moment, or contact your administrator if the problem continues.');
    }
  }

  // Insert submission version v1
  const { error: verErr } = await adminClient
    .from('submission_versions')
    .insert({
      submission_id: subId,
      version_number: 1,
      file_url: storagePath,
      file_hash: validated.hash,
      is_superseded: false,
    });

  if (verErr) {
    throw new Error(`Failed to register submission version: ${verErr.message}`);
  }

  const reqHeaders = await headers();
  const ip = reqHeaders.get('x-forwarded-for') || 'unknown';

  await adminClient.from('audit_log').insert({
    actor_id: user.id,
    action: 'SUBMIT_DOCUMENT',
    target_id: subId,
    target_type: 'submissions',
    source_ip: ip,
  });

  // Notify step 1 approver(s)
  if (step1) {
    const userId = 'user_id' in step1 ? step1.user_id : null;
    const roleId = 'role' in step1 ? step1.role : null;
    const emails = await getEmailsForRecipients(adminClient, userId || null, roleId || null);
    for (const email of emails) {
      await sendEmailWithRetry(email, `New Submission: ${typedReq.name}`, emailTemplates.submissionReceived(typedReq.name, intern.email || 'Intern'));
    }
  }

  return { success: true, submissionId: subId };
}

/**
 * Re-upload after return (FR-7): Creates version n+1, marks version n superseded, returns to step 1.
 */
export async function resubmitSubmission(formData: FormData) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Not authenticated');

  const submissionId = formData.get('submission_id') as string;
  const file = formData.get('file') as File;

  if (!submissionId || !file) {
    throw new Error('Missing submission ID or file.');
  }

  const { data: submission, error: subErr } = await supabase
    .from('submissions')
    .select('*, requirements(*, routing_templates(*)), submission_versions(*)')
    .eq('id', submissionId)
    .single();

  if (subErr || !submission) {
    throw new Error('Submission not found.');
  }

  const typedSub = submission as unknown as SubmissionWithRelations;

  if (typedSub.intern_id !== user.id) {
    await logPermissionDenied({
      actorId: user.id,
      attempted: 'RESUBMIT_DOCUMENT',
      targetType: 'submissions',
      targetId: typedSub.id,
      reason: 'resubmit attempted against another intern\'s submission',
    });
    throw new Error('Unauthorized.');
  }

  const adminClient = createAdminClient();

  // Transition validation: Must be in RETURNED state
  await validateTransitionAudited(adminClient, user.id, typedSub.id, typedSub.state, 'RESUBMIT', UserRole.INTERN);

  const fileArrayBuffer = await file.arrayBuffer();
  const fileBuffer = Buffer.from(fileArrayBuffer);
  const validated = validateAndSealFile(
    fileBuffer,
    typedSub.requirements?.accepted_types,
    typedSub.requirements?.max_size_mb
  );

  // Find max version number
  const existingVersions = typedSub.submission_versions || [];
  const maxVersion = existingVersions.reduce((max: number, v) => Math.max(max, v.version_number || 1), 0);
  const nextVersionNumber = maxVersion + 1;

  // Mark all previous versions as superseded
  await adminClient
    .from('submission_versions')
    .update({ is_superseded: true })
    .eq('submission_id', submissionId);

  // Upload new version to storage
  const fileExt = validated.mimeType === 'application/pdf' ? 'pdf' : validated.mimeType === 'image/png' ? 'png' : 'jpg';
  const storagePath = `${user.id}/${typedSub.id}/v${nextVersionNumber}_${Date.now()}.${fileExt}`;

  const { error: userStorageErr } = await supabase.storage
    .from('submissions')
    .upload(storagePath, fileBuffer, {
      contentType: validated.mimeType,
      upsert: true,
    });

  if (userStorageErr) {
    // Fall back to the service-role client, mirroring enrollSignature's pattern,
    // so a stale/misconfigured RLS policy on the user-context client doesn't block a legitimate re-upload.
    const { error: adminStorageErr } = await adminClient.storage
      .from('submissions')
      .upload(storagePath, fileBuffer, {
        contentType: validated.mimeType,
        upsert: true,
      });

    if (adminStorageErr) {
      console.error('[resubmitSubmission] Storage upload failed for both user and admin clients:', userStorageErr.message, adminStorageErr.message);
      throw new Error('We could not save your re-submitted document right now. Please try again in a moment, or contact your administrator if the problem continues.');
    }
  }

  // Insert version n+1
  await adminClient.from('submission_versions').insert({
    submission_id: typedSub.id,
    version_number: nextVersionNumber,
    file_url: storagePath,
    file_hash: validated.hash,
    is_superseded: false,
  });

  // Reset submission state to IN_REVIEW at step 1 -- the system's automatic
  // re-assignment of step 1, same as the initial upload path.
  await validateTransitionAudited(adminClient, null, typedSub.id, SubmissionState.SUBMITTED, 'ASSIGN_STEP', UserRole.SYSTEM_ADMIN);

  const steps = getRoutingSteps(typedSub);
  const step1 = steps.find((s) => s.step === 1) || { role: 'approver' };
  const step1HolderId = ('user_id' in step1 && step1.user_id) ? step1.user_id : null;

  await adminClient
    .from('submissions')
    .update({
      state: SubmissionState.IN_REVIEW,
      current_step: 1,
      current_step_entered_at: new Date().toISOString(),
      current_holder_id: step1HolderId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', submissionId);

  const reqHeaders = await headers();
  const ip = reqHeaders.get('x-forwarded-for') || 'unknown';

  await adminClient.from('audit_log').insert({
    actor_id: user.id,
    action: 'RESUBMIT_DOCUMENT',
    target_id: typedSub.id,
    target_type: 'submissions',
    source_ip: ip,
  });

  // Notify step 1 approver(s)
  if (step1) {
    const userId = 'user_id' in step1 ? step1.user_id : null;
    const roleId = 'role' in step1 ? step1.role : null;
    const emails = await getEmailsForRecipients(adminClient, userId || null, roleId || null);
    for (const email of emails) {
      await sendEmailWithRetry(email, `Re-submission: ${typedSub.requirements?.name}`, emailTemplates.submissionReceived(typedSub.requirements?.name || 'Document', user.email || 'Intern'));
    }
  }

  return { success: true, version: nextVersionNumber };
}

/**
 * Approve submission with server-side PDF compositing (FR-11 & FR-14).
 */
export async function approveSubmissionSigned(submissionId: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Not authenticated');

  const { data: dbUser } = await supabase.from('users').select('role, email, full_name, signature_path').eq('id', user.id).single();
  const role = dbUser?.role as UserRole;

  if (!dbUser || !['approver', 'admin', 'system_admin'].includes(role)) {
    await logPermissionDenied({
      actorId: user.id,
      attempted: 'APPROVE_SUBMISSION',
      targetType: 'submissions',
      targetId: submissionId,
    });
    throw new Error('Unauthorized');
  }

  // Guard: Block approval until signature is enrolled (FR-9)
  const hasSig = await hasEnrolledSignature(user.id);
  if (!hasSig) {
    throw new Error('Signature Required: You must enroll your signature image before approving documents.');
  }

  const { data: submission, error: subErr } = await supabase
    .from('submissions')
    .select('*, requirements(*, routing_templates(*)), submission_versions(*), approvals(*)')
    .eq('id', submissionId)
    .single();

  if (subErr || !submission) throw new Error('Submission not found');

  const typedSub = submission as unknown as SubmissionWithRelations;
  const currentStep = typedSub.current_step || 1;
  const steps = getRoutingSteps(typedSub).length > 0 ? getRoutingSteps(typedSub) : [{ step: 1, role: 'approver' as const }];
  const totalSteps = steps.length;
  const isFinalStep = currentStep >= totalSteps;

  // Guard: Idempotency check (prevent approving the same step twice)
  const alreadyApprovedStep = (typedSub.approvals || []).some(
    (a) => a.step === currentStep && a.approver_id === user.id
  );
  if (alreadyApprovedStep) {
    throw new Error('Idempotency error: You have already approved this step.');
  }

  const currentStepConfig = steps.find((s) => s.step === currentStep) || { step: currentStep, role: 'approver' as const };
  const stepRequiredRole = currentStepConfig.role || 'approver';

  // Guard: If current step requires an Administrator, approvers cannot sign/approve it (Admin final decision)
  if (stepRequiredRole === 'admin' && role === UserRole.APPROVER) {
    await logPermissionDenied({
      actorId: user.id,
      attempted: 'APPROVE_SUBMISSION',
      targetType: 'submissions',
      targetId: submissionId,
      reason: `step ${currentStep} requires an administrator`,
    });
    throw new Error('Forbidden: This step requires an Administrator to review and grant final approval.');
  }

  const adminClient = createAdminClient();

  const action = isFinalStep ? 'APPROVE_FINAL' : 'APPROVE_INTERMEDIATE';
  const nextState = await validateTransitionAudited(adminClient, user.id, typedSub.id, typedSub.state, action, role);

  const activeVersion = (typedSub.submission_versions || []).find((v) => !v.is_superseded) || (typedSub.submission_versions || [])[0];
  if (!activeVersion) throw new Error('No active version found to approve.');

  const approvalDate = new Date();

  let signedPdfStoragePath: string | null = null;
  let finalFileHash = activeVersion.file_hash;

  // 1. Download original submitted file from private storage
  const { data: originalFileBlob, error: downloadErr } = await adminClient.storage
    .from('submissions')
    .download(activeVersion.file_url);

  if (downloadErr || !originalFileBlob) {
    throw new Error(`Failed to load submitted document for compositing: ${downloadErr?.message}`);
  }

  const originalFileBuffer = Buffer.from(await originalFileBlob.arrayBuffer());

  // 2. Collect all signatories up to this step for compositing
  const signatories: Array<{
    stepNumber?: number;
    roleTitle?: string;
    signaturePngBuffer: Buffer;
    signatureMimeType?: 'image/png' | 'image/jpeg';
    approverName: string;
    approvalDate: Date;
  }> = [];

  // Include previous step approvals (e.g. Step 1 Supervisor)
  const prevApprovals = (typedSub.approvals || []).sort((a, b) => a.step - b.step);
  for (const prevAppr of prevApprovals) {
    try {
      const prevSig = await getSignatureBytesForCompositing(prevAppr.approver_id);
      const { data: prevUserData } = await adminClient
        .from('users')
        .select('email, role, full_name')
        .eq('id', prevAppr.approver_id)
        .single();

      const isPrevAdmin = prevUserData?.role === 'admin' || prevUserData?.role === 'system_admin';
      signatories.push({
        stepNumber: prevAppr.step,
        roleTitle: prevAppr.step === 1 ? (isPrevAdmin ? 'Supervisor Review (Admin):' : 'Supervisor Review:') : `Step ${prevAppr.step} Review:`,
        signaturePngBuffer: prevSig.buffer,
        signatureMimeType: prevSig.mimeType,
        approverName: prevUserData?.full_name || prevUserData?.email || 'Supervisor',
        approvalDate: new Date(prevAppr.created_at),
      });
    } catch (err) {
      console.warn(`Could not load previous signature for step ${prevAppr.step}:`, err);
    }
  }

  // Include current step approver signature
  const currentSig = await getSignatureBytesForCompositing(user.id);
  const isAdminRole = role === UserRole.ADMIN || role === UserRole.SYSTEM_ADMIN;
  signatories.push({
    stepNumber: currentStep,
    roleTitle: isFinalStep && steps.length > 1
      ? 'Final Admin Approval:'
      : (currentStep === 1 && steps.length > 1
          ? (isAdminRole ? 'Supervisor Review (Admin):' : 'Supervisor Review:')
          : 'Digitally Approved by:'),
    signaturePngBuffer: currentSig.buffer,
    signatureMimeType: currentSig.mimeType,
    approverName: dbUser.full_name || dbUser.email || 'Authorized Signatory',
    approvalDate: approvalDate,
  });

  // 3. Detect original mime type
  const originalExt = activeVersion.file_url.split('.').pop()?.toLowerCase();
  const originalMime = originalExt === 'png' ? 'image/png' : originalExt === 'jpg' || originalExt === 'jpeg' ? 'image/jpeg' : 'application/pdf';

  // 4. Run server-side compositing (signature + printed name + date)
  const compositeResult = await compositeSignedPdf({
    originalFileBuffer,
    originalMimeType: originalMime,
    signatories,
    config: typedSub.requirements?.signature_config,
  });

  finalFileHash = compositeResult.fileHash;

  // 5. Store signed PDF as an immutable artifact
  signedPdfStoragePath = `${typedSub.id}/v${activeVersion.version_number}_step${currentStep}_signed_${Date.now()}.pdf`;
  const { error: signedUploadErr } = await adminClient.storage
    .from('submissions')
    .upload(signedPdfStoragePath, compositeResult.signedPdfBuffer, {
      contentType: 'application/pdf',
      upsert: false,
    });

  if (signedUploadErr) {
    throw new Error(`Failed to store signed document: ${signedUploadErr.message}`);
  }

  // Create approval record
  await adminClient.from('approvals').insert({
    submission_id: typedSub.id,
    version_id: activeVersion.id,
    approver_id: user.id,
    step: currentStep,
    file_hash: finalFileHash,
    signed_pdf_url: signedPdfStoragePath,
    created_at: approvalDate.toISOString(),
  });

  if (isFinalStep) {
    await adminClient
      .from('submissions')
      .update({
        state: nextState,
        current_holder_id: null,
        updated_at: approvalDate.toISOString(),
      })
      .eq('id', typedSub.id);
  } else {
    // Advance to next step
    const nextStepNumber = currentStep + 1;
    const nextStepConfig = steps.find((s) => s.step === nextStepNumber);
    const nextHolderId = nextStepConfig?.user_id || null;
    await adminClient
      .from('submissions')
      .update({
        state: nextState,
        current_step: nextStepNumber,
        current_step_entered_at: approvalDate.toISOString(),
        current_holder_id: nextHolderId,
        updated_at: approvalDate.toISOString(),
      })
      .eq('id', typedSub.id);
  }

  const reqHeaders = await headers();
  const ip = reqHeaders.get('x-forwarded-for') || 'unknown';

  await adminClient.from('audit_log').insert({
    actor_id: user.id,
    action: isFinalStep ? 'APPROVE_FINAL' : 'APPROVE_STEP',
    target_id: typedSub.id,
    target_type: 'submissions',
    source_ip: ip,
  });

  // Send approval email to intern
  const { data: internUser } = await adminClient.from('users').select('email').eq('id', typedSub.intern_id).single();
  if (internUser) {
    await sendEmailWithRetry(internUser.email, `Submission Approved: ${typedSub.requirements?.name}`, emailTemplates.submissionApproved(typedSub.requirements?.name || 'Document', isFinalStep));
  }

  // If not final step, notify next approver(s)
  if (!isFinalStep) {
    const nextStepNumber = currentStep + 1;
    const nextStepConfig = steps.find((s) => s.step === nextStepNumber);
    if (nextStepConfig) {
      const nextUserId = 'user_id' in nextStepConfig ? nextStepConfig.user_id : null;
      const nextRoleId = 'role' in nextStepConfig ? nextStepConfig.role : null;
      const emails = await getEmailsForRecipients(adminClient, nextUserId || null, nextRoleId || null);
      for (const email of emails) {
        await sendEmailWithRetry(email, `Assigned: ${typedSub.requirements?.name}`, emailTemplates.stepAssigned(typedSub.requirements?.name || 'Document'));
      }
    }
  }

  return { success: true, final: isFinalStep, signedUrl: signedPdfStoragePath };
}

/**
 * Reassign an in-review submission to a different approver (FR-15).
 */
export async function reassignApprover(submissionId: string, newApproverId: string, reason: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Not authenticated');

  const { data: dbUser } = await supabase.from('users').select('role').eq('id', user.id).single();
  const role = dbUser?.role as UserRole;

  // FR-15 / Appendix A: only an Administrator may reassign a step.
  if (!dbUser || !['admin', 'system_admin'].includes(role)) {
    await logPermissionDenied({
      actorId: user.id,
      attempted: 'REASSIGN_APPROVER',
      targetType: 'submissions',
      targetId: submissionId,
      reason: 'only an administrator may reassign a step (FR-15)',
    });
    throw new Error('Unauthorized');
  }

  const parsedReason = reassignReasonSchema.parse(reason);

  const { data: submission, error: subErr } = await supabase
    .from('submissions')
    .select('*, users!submissions_intern_id_fkey(email)')
    .eq('id', submissionId)
    .single();

  if (subErr || !submission) throw new Error('Submission not found');

  const typedSub = submission as unknown as SubmissionWithRelations;
  const adminClient = createAdminClient();
  await validateTransitionAudited(adminClient, user.id, typedSub.id, typedSub.state, 'REASSIGN', role);

  const previousHolderId = typedSub.current_holder_id;

  // Update submission holder
  await adminClient
    .from('submissions')
    .update({
      current_holder_id: newApproverId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', submissionId);

  // Notify both approvers
  if (previousHolderId) {
    await adminClient.from('notifications').insert({
      user_id: previousHolderId,
      event_type: 'STEP_REASSIGNED_AWAY',
      payload: { submission_id: submissionId, reason: parsedReason },
    });

    const { data: previousApprover } = await adminClient.from('users').select('email').eq('id', previousHolderId).single();
    if (previousApprover) {
      await sendEmailWithRetry(previousApprover.email, `Document Reassigned Away: ${typedSub.requirements?.name}`, emailTemplates.stepReassigned(typedSub.requirements?.name || 'Document', parsedReason));
    }
  }

  await adminClient.from('notifications').insert({
    user_id: newApproverId,
    event_type: 'STEP_ASSIGNED',
    payload: { submission_id: submissionId, reason: parsedReason },
  });

  const reqHeaders = await headers();
  const ip = reqHeaders.get('x-forwarded-for') || 'unknown';

  await adminClient.from('audit_log').insert({
    actor_id: user.id,
    action: 'REASSIGN_APPROVER',
    target_id: submissionId,
    target_type: 'submissions',
    source_ip: ip,
  });

  const { data: newApprover } = await adminClient.from('users').select('email').eq('id', newApproverId).single();
  if (newApprover) {
    await sendEmailWithRetry(newApprover.email, `Reassigned: ${typedSub.requirements?.name}`, emailTemplates.stepReassigned(typedSub.requirements?.name || 'Document', parsedReason));
  }

  return { success: true };
}

const cancelReasonSchema = z.string().min(10, 'Cancellation reason must be at least 10 characters.');

/**
 * Appendix A: DRAFT/RETURNED -> CANCELLED, Administrator-only. Defined in the state
 * machine since the migration that introduced it, but had no caller anywhere until now
 * (docs/09-project-audit.md, 2026-08-28 audit, gap #21).
 */
export async function cancelSubmission(submissionId: string, reason: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Not authenticated');

  const { data: dbUser } = await supabase.from('users').select('role').eq('id', user.id).single();
  const role = dbUser?.role as UserRole;
  if (!dbUser || !['admin', 'system_admin'].includes(role)) {
    await logPermissionDenied({
      actorId: user.id,
      attempted: 'CANCEL_SUBMISSION',
      targetType: 'submissions',
      targetId: submissionId,
    });
    throw new Error('Unauthorized: Only administrators can cancel a submission.');
  }

  const parsedReason = cancelReasonSchema.parse(reason);

  const { data: submission, error: subErr } = await supabase
    .from('submissions')
    .select('*, users!submissions_intern_id_fkey(email), requirements(name)')
    .eq('id', submissionId)
    .single();

  if (subErr || !submission) throw new Error('Submission not found');

  const typedSub = submission as unknown as SubmissionWithRelations;
  const adminClient = createAdminClient();
  await validateTransitionAudited(adminClient, user.id, typedSub.id, typedSub.state, 'CANCEL', role);

  await adminClient
    .from('submissions')
    .update({ state: SubmissionState.CANCELLED, updated_at: new Date().toISOString() })
    .eq('id', submissionId);

  const reqHeaders = await headers();
  const ip = reqHeaders.get('x-forwarded-for') || 'unknown';

  await adminClient.from('audit_log').insert({
    actor_id: user.id,
    action: 'CANCEL_SUBMISSION',
    target_id: submissionId,
    target_type: 'submissions',
    source_ip: ip,
    payload: { reason: parsedReason },
  });

  const internEmail = typedSub.users?.email;
  if (internEmail) {
    await sendEmailWithRetry(
      internEmail,
      `Submission Cancelled: ${typedSub.requirements?.name || 'Document'}`,
      emailTemplates.submissionCancelled(typedSub.requirements?.name || 'Document', parsedReason)
    );
  }

  return { success: true };
}

/**
 * Appendix A: EXPIRED -> IN_REVIEW ("Admin may reopen"), Administrator-only. See the
 * REOPEN rule comment in lib/state-machine/index.ts for why the target state is
 * IN_REVIEW rather than something state-specific.
 */
export async function reopenSubmission(submissionId: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Not authenticated');

  const { data: dbUser } = await supabase.from('users').select('role').eq('id', user.id).single();
  const role = dbUser?.role as UserRole;
  if (!dbUser || !['admin', 'system_admin'].includes(role)) {
    await logPermissionDenied({
      actorId: user.id,
      attempted: 'REOPEN_SUBMISSION',
      targetType: 'submissions',
      targetId: submissionId,
    });
    throw new Error('Unauthorized: Only administrators can reopen a submission.');
  }

  const { data: submission, error: subErr } = await supabase
    .from('submissions')
    .select('*, users!submissions_intern_id_fkey(email), requirements(name)')
    .eq('id', submissionId)
    .single();

  if (subErr || !submission) throw new Error('Submission not found');

  const typedSub = submission as unknown as SubmissionWithRelations;
  const adminClient = createAdminClient();
  await validateTransitionAudited(adminClient, user.id, typedSub.id, typedSub.state, 'REOPEN', role);

  await adminClient
    .from('submissions')
    .update({ state: SubmissionState.IN_REVIEW, updated_at: new Date().toISOString() })
    .eq('id', submissionId);

  const reqHeaders = await headers();
  const ip = reqHeaders.get('x-forwarded-for') || 'unknown';

  await adminClient.from('audit_log').insert({
    actor_id: user.id,
    action: 'REOPEN_SUBMISSION',
    target_id: submissionId,
    target_type: 'submissions',
    source_ip: ip,
  });

  const internEmail = typedSub.users?.email;
  if (internEmail) {
    await sendEmailWithRetry(
      internEmail,
      `Submission Reopened: ${typedSub.requirements?.name || 'Document'}`,
      emailTemplates.submissionReopened(typedSub.requirements?.name || 'Document')
    );
  }

  return { success: true };
}

/**
 * Return submission with mandatory comment (FR-12).
 */
export async function returnSubmission(submissionId: string, comment: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Not authenticated');

  const { data: dbUser } = await supabase.from('users').select('role').eq('id', user.id).single();
  const role = dbUser?.role as UserRole;

  if (!dbUser || !['approver', 'admin', 'system_admin'].includes(role)) {
    await logPermissionDenied({
      actorId: user.id,
      attempted: 'RETURN_SUBMISSION',
      targetType: 'submissions',
      targetId: submissionId,
    });
    throw new Error('Unauthorized');
  }

  const parsedComment = returnCommentSchema.parse(comment);

  const { data: submission, error: subErr } = await supabase
    .from('submissions')
    .select('*, submission_versions(*)')
    .eq('id', submissionId)
    .single();

  if (subErr || !submission) throw new Error('Submission not found');

  const typedSub = submission as unknown as SubmissionWithRelations;
  const adminClient = createAdminClient();
  const nextState = await validateTransitionAudited(adminClient, user.id, typedSub.id, typedSub.state, 'RETURN', role);

  const activeVersion = (typedSub.submission_versions || []).find((v) => !v.is_superseded) || (typedSub.submission_versions || [])[0];
  if (!activeVersion) throw new Error('No active version to return.');

  // Attach return comment permanently to active version
  await adminClient
    .from('submission_versions')
    .update({ return_comment: parsedComment })
    .eq('id', activeVersion.id);

  // Move submission state to RETURNED
  await adminClient
    .from('submissions')
    .update({
      state: nextState,
      current_holder_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', typedSub.id);

  // Notify intern
  await adminClient.from('notifications').insert({
    user_id: typedSub.intern_id,
    event_type: 'SUBMISSION_RETURNED',
    payload: {
      submission_id: typedSub.id,
      comment: parsedComment,
      version_number: activeVersion.version_number,
    },
  });

  const reqHeaders = await headers();
  const ip = reqHeaders.get('x-forwarded-for') || 'unknown';

  await adminClient.from('audit_log').insert({
    actor_id: user.id,
    action: 'RETURN_SUBMISSION',
    target_id: typedSub.id,
    target_type: 'submissions',
    source_ip: ip,
  });

  const { data: internUser } = await adminClient.from('users').select('email').eq('id', typedSub.intern_id).single();
  if (internUser) {
    await sendEmailWithRetry(internUser.email, `Submission Returned: ${typedSub.requirements?.name}`, emailTemplates.submissionReturned(typedSub.requirements?.name || 'Document'));
  }

  return { success: true };
}

/**
 * Downloads a file from the `submissions` bucket (authenticated user client, falling
 * back to the admin client) and verifies its SHA-256 against the recorded hash. Logs
 * TAMPER_ALERT_HASH_MISMATCH and throws on mismatch. Shared by every caller that needs
 * verified file bytes -- single-document signed-URL issuance
 * (getSubmissionSignedDownloadUrl below) and the bulk approved-documents export.
 */
export async function downloadAndVerifyFile(
  filePath: string,
  expectedHash: string,
  submissionId: string
): Promise<{ buffer: Buffer; hash: string }> {
  const supabase = await createClient();
  const adminClient = createAdminClient();

  let fileBlob: Blob | null = null;
  const { data: userBlob, error: userDownloadErr } = await supabase.storage
    .from('submissions')
    .download(filePath);

  if (userBlob) {
    fileBlob = userBlob;
  } else {
    const { data: adminBlob, error: adminErr } = await adminClient.storage
      .from('submissions')
      .download(filePath);

    if (adminBlob) {
      fileBlob = adminBlob;
    } else {
      throw new Error(`Failed to fetch file from storage: ${userDownloadErr?.message || adminErr?.message || 'Object not found'}`);
    }
  }

  const fileBuffer = Buffer.from(await fileBlob.arrayBuffer());
  const actualHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

  const hashMatches = actualHash.toLowerCase() === expectedHash.toLowerCase();
  if (!hashMatches) {
    const reqHeaders = await headers();
    const ip = reqHeaders.get('x-forwarded-for') || 'unknown';

    await adminClient.from('audit_log').insert({
      actor_id: null,
      action: 'TAMPER_ALERT_HASH_MISMATCH',
      target_id: submissionId,
      target_type: 'submissions',
      source_ip: ip,
    });

    throw new Error('Integrity Warning: Document SHA-256 hash does not match recorded approval checksum.');
  }

  return { buffer: fileBuffer, hash: actualHash };
}

/**
 * Generate 5-minute signed URL for document download after server permission & SHA-256 verification.
 * PRD FR-14 & FR-25: Recomputes SHA-256 and verifies document integrity.
 */
export async function getSubmissionSignedDownloadUrl(submissionId: string, versionId?: string) {
  const submission = await getSubmissionDetails(submissionId);
  const versions = submission.submission_versions || [];
  const approvals = submission.approvals || [];
  
  const targetVersion = versionId ? versions.find((v) => v.id === versionId) : versions.find((v) => !v.is_superseded) || versions[0];
  if (!targetVersion) throw new Error('Target version not found');

  const versionApprovals = approvals.filter((a) => a.version_id === targetVersion.id);
  const sortedApprovals = [...versionApprovals].sort(
    (a, b) => (b.step || 0) - (a.step || 0) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const latestApproval = sortedApprovals.find((a) => a.signed_pdf_url) || sortedApprovals[0] || approvals[0] || null;

  // If approved (or signed PDF exists), download the signed PDF; otherwise download the submitted version
  const filePathToDownload = ((submission.state === SubmissionState.APPROVED || latestApproval?.signed_pdf_url) && latestApproval?.signed_pdf_url)
    ? latestApproval.signed_pdf_url
    : targetVersion.file_url;

  const expectedHash = ((submission.state === SubmissionState.APPROVED || latestApproval?.signed_pdf_url) && latestApproval)
    ? latestApproval.file_hash
    : targetVersion.file_hash;

  const { hash: actualHash } = await downloadAndVerifyFile(filePathToDownload, expectedHash, submissionId);

  const supabase = await createClient();
  const adminClient = createAdminClient();

  // 2. Generate 5-minute signed URL (try supabase client, fallback to admin)
  let signedUrl: string | null = null;
  const { data: userSigned } = await supabase.storage
    .from('submissions')
    .createSignedUrl(filePathToDownload, 300);

  if (userSigned?.signedUrl) {
    signedUrl = userSigned.signedUrl;
  } else {
    const { data: adminSigned, error: adminSignedErr } = await adminClient.storage
      .from('submissions')
      .createSignedUrl(filePathToDownload, 300);

    if (adminSignedErr || !adminSigned?.signedUrl) {
      throw new Error(`Failed to generate signed download URL: ${adminSignedErr?.message}`);
    }
    signedUrl = adminSigned.signedUrl;
  }

  // FR-17 ("Every download is audit-logged") and FR-24, which lists "download" among the
  // required events. Only the tamper path above was logged before, so a successful
  // retrieval left no record of who took a copy of a document -- the exact question a
  // data-protection dispute turns on. Logged at URL-issue time: that is the moment the
  // server authorises access, and the only moment it can observe (the fetch itself goes
  // straight from the browser to storage).
  {
    const { data: { user: downloader } } = await supabase.auth.getUser();
    const reqHeaders = await headers();
    const ip = reqHeaders.get('x-forwarded-for') || 'unknown';

    await adminClient.from('audit_log').insert({
      actor_id: downloader?.id ?? null,
      action: 'DOWNLOAD_DOCUMENT',
      target_id: submissionId,
      target_type: 'submissions',
      source_ip: ip,
      payload: {
        file_path: filePathToDownload,
        file_hash: actualHash,
        version_id: targetVersion.id,
        is_signed_output: filePathToDownload === latestApproval?.signed_pdf_url,
      },
    });
  }

  return {
    signedUrl,
    fileName: filePathToDownload.split('/').pop(),
    isVerified: true,
    fileHash: actualHash,
  };
}
