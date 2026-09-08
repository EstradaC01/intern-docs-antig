import 'server-only';
import { createClient } from '../supabase/server';
import { createAdminClient } from '../supabase/admin';

export interface AuditLogSubmissionDetails {
  id: string;
  requirement_name: string;
  intern_email: string | null;
  state: string;
  version_number: number;
  has_file: boolean;
  file_url: string | null;
}

export interface AuditLogEntry {
  id: string;
  actor_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  source_ip: string | null;
  created_at: string;
  users: {
    id: string;
    email: string;
  } | null;
  target_user?: {
    id: string;
    email: string;
    role?: string;
  } | null;
  target_requirement?: {
    id: string;
    name: string;
  } | null;
  target_routing_template?: {
    id: string;
    name: string;
  } | null;
  submission?: AuditLogSubmissionDetails | null;
  /**
   * Raw payload column -- carries a `name` snapshot for DELETE_REQUIREMENT /
   * DELETE_ROUTING_TEMPLATE (set at delete time in lib/data/requirements.ts /
   * lib/data/routing.ts) so the audit trail can still show what was deleted after the
   * row itself, and the live join above, are gone.
   */
  payload?: Record<string, unknown> | null;
}

/**
 * Shapes of the lookup rows this function joins onto each audit entry. They are declared
 * because `new Map(rows.map(r => [r.id, r]))` over an untyped Supabase result infers
 * `Map<any, {}>`, which makes every `.get(...)` return `{}` and fails `tsc --noEmit` on
 * each property access below (12 errors, which had CI red -- see .github/workflows/ci.yml).
 */
interface EnrichedUserRow {
  id: string;
  email: string;
  role?: string;
}

interface EnrichedRequirementRow {
  id: string;
  name: string;
}

interface EnrichedVersionRow {
  id: string;
  version_number: number;
  file_url: string | null;
  is_superseded: boolean;
  created_at: string;
}

interface EnrichedSubmissionRow {
  id: string;
  state: string;
  intern_id: string;
  requirements?: { id: string; name: string } | null;
  users?: { id: string; email: string } | null;
  submission_versions?: EnrichedVersionRow[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function enrichAuditLogs(adminClient: any, rawLogs: any[]): Promise<AuditLogEntry[]> {
  if (!rawLogs || rawLogs.length === 0) return [];

  const actorIds = [...new Set(rawLogs.map((e) => e.actor_id).filter(Boolean))];
  const submissionIds = [
    ...new Set(rawLogs.filter((e) => e.target_type === 'submissions' && e.target_id).map((e) => e.target_id)),
  ];
  const userTargetIds = [
    ...new Set(rawLogs.filter((e) => e.target_type === 'users' && e.target_id).map((e) => e.target_id)),
  ];
  const reqTargetIds = [
    ...new Set(rawLogs.filter((e) => e.target_type === 'requirements' && e.target_id).map((e) => e.target_id)),
  ];
  const routingTemplateTargetIds = [
    ...new Set(rawLogs.filter((e) => e.target_type === 'routing_templates' && e.target_id).map((e) => e.target_id)),
  ];

  const allUserIds = [...new Set([...actorIds, ...userTargetIds])];

  const [usersRes, submissionsRes, requirementsRes, routingTemplatesRes] = await Promise.all([
    allUserIds.length > 0
      ? adminClient.from('users').select('id, email, role').in('id', allUserIds)
      : Promise.resolve({ data: [] }),
    submissionIds.length > 0
      ? adminClient
          .from('submissions')
          .select(`
            id,
            state,
            intern_id,
            requirements(id, name),
            users!submissions_intern_id_fkey(id, email),
            submission_versions(id, version_number, file_url, is_superseded, created_at)
          `)
          .in('id', submissionIds)
      : Promise.resolve({ data: [] }),
    reqTargetIds.length > 0
      ? adminClient.from('requirements').select('id, name').in('id', reqTargetIds)
      : Promise.resolve({ data: [] }),
    routingTemplateTargetIds.length > 0
      ? adminClient.from('routing_templates').select('id, name').in('id', routingTemplateTargetIds)
      : Promise.resolve({ data: [] }),
  ]);

  const usersMap = new Map<string, EnrichedUserRow>(
    ((usersRes.data || []) as EnrichedUserRow[]).map((u) => [u.id, u])
  );
  const submissionsMap = new Map<string, EnrichedSubmissionRow>(
    ((submissionsRes.data || []) as EnrichedSubmissionRow[]).map((s) => [s.id, s])
  );
  const requirementsMap = new Map<string, EnrichedRequirementRow>(
    ((requirementsRes.data || []) as EnrichedRequirementRow[]).map((r) => [r.id, r])
  );
  const routingTemplatesMap = new Map<string, EnrichedRequirementRow>(
    ((routingTemplatesRes.data || []) as EnrichedRequirementRow[]).map((r) => [r.id, r])
  );

  return rawLogs.map((e) => {
    const actorUser = e.actor_id ? usersMap.get(e.actor_id) || null : null;
    const targetUser = e.target_type === 'users' && e.target_id ? usersMap.get(e.target_id) || null : null;
    const targetReq = e.target_type === 'requirements' && e.target_id ? requirementsMap.get(e.target_id) || null : null;
    const targetRoutingTemplate =
      e.target_type === 'routing_templates' && e.target_id ? routingTemplatesMap.get(e.target_id) || null : null;

    let submissionDetails: AuditLogSubmissionDetails | null = null;
    if (e.target_type === 'submissions' && e.target_id) {
      const sub = submissionsMap.get(e.target_id);
      if (sub) {
        const versions = sub.submission_versions || [];
        const activeVer = versions.find((v) => !v.is_superseded) || versions[0] || null;
        submissionDetails = {
          id: sub.id,
          requirement_name: sub.requirements?.name || 'Document Requirement',
          intern_email: sub.users?.email || null,
          state: sub.state,
          version_number: activeVer?.version_number || 1,
          has_file: !!activeVer?.file_url,
          file_url: activeVer?.file_url || null,
        };
      }
    }

    return {
      id: e.id,
      actor_id: e.actor_id,
      action: e.action,
      target_type: e.target_type,
      target_id: e.target_id,
      source_ip: e.source_ip,
      created_at: e.created_at,
      users: actorUser ? { id: actorUser.id, email: actorUser.email } : null,
      target_user: targetUser ? { id: targetUser.id, email: targetUser.email, role: targetUser.role } : null,
      target_requirement: targetReq ? { id: targetReq.id, name: targetReq.name } : null,
      target_routing_template: targetRoutingTemplate
        ? { id: targetRoutingTemplate.id, name: targetRoutingTemplate.name }
        : null,
      submission: submissionDetails,
      payload: e.payload ?? null,
    };
  });
}

export async function getAuditLogs(options?: { actorId?: string; targetId?: string; limit?: number }) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Not authenticated');

  const { data: dbUser } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (!dbUser || !['admin', 'system_admin'].includes(dbUser.role)) {
    await logPermissionDenied({ actorId: user.id, attempted: 'READ_AUDIT_LOG', targetType: 'audit_log' });
    throw new Error('Forbidden');
  }

  const adminClient = createAdminClient();
  const limit = options?.limit || 100;

  let query = adminClient
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (options?.actorId) {
    query = query.eq('actor_id', options.actorId);
  }
  if (options?.targetId) {
    query = query.eq('target_id', options.targetId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load audit logs: ${error.message}`);
  }

  return enrichAuditLogs(adminClient, data || []);
}

/**
 * Records a refused authorisation attempt.
 *
 * FR-24 lists "permission denial" among the events the audit log must hold, alongside the
 * state-machine's own DENIED_TRANSITION (see validateTransitionAudited in
 * lib/data/submissions.ts, which covers illegal *transitions* rather than refused *access*).
 * Without this, a probe against another intern's submission or an admin-only endpoint left
 * no trace at all -- exactly the reconstruction FR-24 exists to make possible.
 *
 * Call immediately before throwing, keeping the caller's own error message intact:
 *
 *     await logPermissionDenied({ actorId: user.id, attempted: 'READ_SUBMISSION', ... });
 *     throw new Error('Forbidden: ...');
 *
 * Never throws on its own -- an audit-write failure must not convert a clean 403 into a
 * 500, and must never be the reason a denial silently becomes an allow.
 */
export async function logPermissionDenied(params: {
  actorId: string | null;
  attempted: string;
  targetType: string;
  targetId?: string | null;
  reason?: string;
}): Promise<void> {
  try {
    const adminClient = createAdminClient();
    const { headers } = await import('next/headers');
    const reqHeaders = await headers();
    const ip = reqHeaders.get('x-forwarded-for') || 'unknown';

    await adminClient.from('audit_log').insert({
      actor_id: params.actorId,
      action: 'PERMISSION_DENIED',
      target_id: params.targetId ?? null,
      target_type: params.targetType,
      source_ip: ip,
      payload: {
        attempted: params.attempted,
        ...(params.reason ? { reason: params.reason } : {}),
      },
    });
  } catch (err) {
    console.error('[audit] Failed to record PERMISSION_DENIED:', err);
  }
}
