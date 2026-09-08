import { AuditLogTable } from '@/components/AuditLogTable';
// AuditLogEntry lives in lib/data/audit -- AuditLogTable only consumes it, it does not
// re-export it. Matches src/app/system-admin/audit-log/page.tsx.
import { AuditLogEntry } from '@lib/data/audit';
import { createAdminClient } from '@lib/supabase/admin';

export const dynamic = 'force-dynamic';

export default async function AuditLogPage() {
  const adminClient = createAdminClient();
  
  // Fetch initial data server-side
  const { data, error } = await adminClient
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);
    
  let initialLogs: AuditLogEntry[] = [];

  if (!error && data) {
    const actorIds = [...new Set(data.map(e => e.actor_id).filter(Boolean))];
    const { data: usersData } = await adminClient
      .from('users')
      .select('id, email')
      .in('id', actorIds);

    const usersMap = new Map((usersData || []).map(u => [u.id, u]));
    
    // We parse and stringify to ensure we don't pass complex objects across the Client Component boundary
    initialLogs = JSON.parse(JSON.stringify(data.map(e => ({
      ...e,
      users: e.actor_id ? usersMap.get(e.actor_id) || null : null
    }))));
  }

  return (
    <div className="p-6 md:p-10 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Audit Log</h1>
        <p className="text-sm text-text-muted mt-1">View system-wide actions and events.</p>
      </div>
      
      {error ? (
        <div className="rounded-xl bg-status-returned/10 p-6 text-sm text-status-returned-text border border-status-returned/30">
          Failed to load audit logs: {error.message}
        </div>
      ) : (
        <AuditLogTable initialLogs={initialLogs} />
      )}
    </div>
  );
}
