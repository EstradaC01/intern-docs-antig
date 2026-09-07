'use client';

import React, { useState, useMemo } from 'react';
import { humanizeCode } from '@/lib/utils';
import { Button } from './ui/button';
import { DocumentViewerModal } from './DocumentViewerModal';
import { AuditLogEntry } from '@lib/data/audit';

interface AuditLogTableProps {
  initialLogs: AuditLogEntry[];
  onGetDownloadUrlAction?: (
    submissionId: string
  ) => Promise<{ signedUrl?: string; error?: string; isVerified?: boolean; fileHash?: string }>;
}

export function AuditLogTable({ initialLogs, onGetDownloadUrlAction }: AuditLogTableProps) {
  const [logs, setLogs] = useState<AuditLogEntry[]>(initialLogs);
  const [loading, setLoading] = useState(false);
  const [actorFilter, setActorFilter] = useState<string>('all');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // In-page Document Viewer Modal State
  const [viewerItem, setViewerItem] = useState<{
    title: string;
    subtitle?: string;
    log?: AuditLogEntry;
  } | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [isViewerLoading, setIsViewerLoading] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);

  // Hardcoded for MVP, usually you'd query total count to hide "Load More"
  const [hasMore, setHasMore] = useState(initialLogs.length >= 100);

  const fetchLogs = async (actor: string, limit: number) => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const url = new URL('/api/admin/audit-log', window.location.origin);
      url.searchParams.set('limit', limit.toString());
      if (actor !== 'all') {
        url.searchParams.set('actor_id', actor);
      }

      const res = await fetch(url.toString());
      if (!res.ok) {
        throw new Error(`Failed to fetch logs: ${res.statusText}`);
      }

      const data: AuditLogEntry[] = await res.json();
      setLogs(data);
      setHasMore(data.length >= limit);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch logs.';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleActorFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newActor = e.target.value;
    setActorFilter(newActor);
    fetchLogs(newActor, 100);
  };

  const handleLoadMore = () => {
    fetchLogs(actorFilter, logs.length + 100);
  };

  const handleViewFile = async (submissionId: string, log?: AuditLogEntry) => {
    if (!onGetDownloadUrlAction) return;
    setDownloadingId(submissionId);
    setViewerItem({
      title: log?.submission?.requirement_name || 'Audited Document',
      subtitle: log ? `Audit Entry #${log.id.slice(0, 8)} • Action: ${humanizeCode(log.action)}` : undefined,
      log,
    });
    setViewerUrl(null);
    setIsViewerLoading(true);
    setViewerError(null);

    try {
      const res = await onGetDownloadUrlAction(submissionId);
      if (res.error) throw new Error(res.error);
      if (res.signedUrl) {
        setViewerUrl(res.signedUrl);
      } else {
        throw new Error('No document download link available');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to open file';
      setViewerError(msg);
    } finally {
      setDownloadingId(null);
      setIsViewerLoading(false);
    }
  };

  // Derive unique actors for the filter dropdown
  const uniqueActors = useMemo(() => {
    const map = new Map<string, string>();
    logs.forEach((l) => {
      if (l.users) map.set(l.users.id, l.users.email);
    });
    return Array.from(map.entries());
  }, [logs]);

  // Derive unique actions for client-side filtering
  const uniqueActions = useMemo(() => {
    const set = new Set<string>();
    logs.forEach((l) => set.add(l.action));
    return Array.from(set).sort();
  }, [logs]);

  // Client-side filter for Action
  const filteredLogs = useMemo(() => {
    if (actionFilter === 'all') return logs;
    return logs.filter((l) => l.action === actionFilter);
  }, [logs, actionFilter]);

  const getActionBadgeColor = (action: string) => {
    if (action.includes('SUBMIT')) {
      return 'bg-blue-50 text-blue-700 border-blue-200';
    }
    if (action.includes('APPROVE')) {
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }
    if (action.includes('RETURN') || action.includes('DENIED') || action.includes('FAILED')) {
      return 'bg-rose-50 text-rose-700 border-rose-200';
    }
    if (action.includes('PURGE') || action.includes('EXPIRE')) {
      return 'bg-amber-50 text-amber-700 border-amber-200';
    }
    return 'bg-slate-100 text-slate-700 border-slate-200';
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-center gap-4 bg-surface-bg p-4 rounded-xl border border-border-default shadow-xs">
        <div className="w-full sm:w-auto">
          <label
            htmlFor="audit-actor-filter"
            className="block text-[11px] font-bold text-text-muted uppercase tracking-wider mb-1"
          >
            Actor
          </label>
          <select
            id="audit-actor-filter"
            value={actorFilter}
            onChange={handleActorFilterChange}
            disabled={loading}
            className="w-full sm:w-64 border border-border-default rounded-lg p-2 text-xs text-text-primary focus:ring-1 focus:ring-brand-primary focus:border-brand-primary outline-none"
          >
            <option value="all">All Actors</option>
            {uniqueActors.map(([id, email]) => (
              <option key={id} value={id}>
                {email}
              </option>
            ))}
          </select>
        </div>

        <div className="w-full sm:w-auto">
          <label
            htmlFor="audit-action-filter"
            className="block text-[11px] font-bold text-text-muted uppercase tracking-wider mb-1"
          >
            Action
          </label>
          <select
            id="audit-action-filter"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            disabled={loading}
            className="w-full sm:w-48 border border-border-default rounded-lg p-2 text-xs text-text-primary focus:ring-1 focus:ring-brand-primary focus:border-brand-primary outline-none"
          >
            <option value="all">All Actions</option>
            {uniqueActions.map((action) => (
              <option key={action} value={action}>
                {humanizeCode(action)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {errorMsg && (
        <div role="alert" className="rounded-lg bg-rose-50 p-4 text-sm text-rose-800 border border-rose-200 shadow-xs">
          {errorMsg}
        </div>
      )}

      {/* Mobile Card Layout */}
      <div className="md:hidden space-y-3">
        {filteredLogs.length === 0 ? (
          <div className="bg-surface-bg border border-border-default rounded-xl p-6 text-center text-sm text-text-muted">
            {loading ? 'Loading...' : 'No audit logs found matching the current filters.'}
          </div>
        ) : (
          filteredLogs.map((log) => (
            <div key={log.id} className="bg-surface-bg border border-border-default rounded-xl p-4 space-y-2.5 shadow-xs">
              {/* Header: Action badge + timestamp */}
              <div className="flex items-start justify-between gap-2">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border shrink-0 ${getActionBadgeColor(log.action)}`}
                  title={log.action}
                >
                  {humanizeCode(log.action)}
                </span>
                <span className="text-[10px] text-text-muted whitespace-nowrap">
                  {new Intl.DateTimeFormat(undefined, {
                    month: 'short', day: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  }).format(new Date(log.created_at))}
                </span>
              </div>

              {/* Actor */}
              <div className="text-xs">
                <span className="text-text-muted">By: </span>
                <span className="font-semibold text-text-primary">
                  {log.users?.email || log.actor_id?.substring(0, 8) || 'System'}
                </span>
              </div>

              {/* Target details */}
              <div className="text-xs">
                {log.submission ? (
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-bold text-text-primary">📄 {log.submission.requirement_name}</span>
                      <span className="text-[10px] font-semibold text-slate-700 bg-slate-100 px-1.5 rounded border border-slate-200">v{log.submission.version_number}</span>
                      <span className="text-[10px] font-mono text-slate-500 bg-slate-50 px-1.5 rounded border border-slate-200">{log.submission.state}</span>
                    </div>
                    {log.submission.intern_email && (
                      <div className="text-[11px] text-text-muted">
                        Submitted by: <span className="font-medium text-text-primary">{log.submission.intern_email}</span>
                      </div>
                    )}
                    {log.submission.has_file && onGetDownloadUrlAction && (
                      <button
                        type="button"
                        disabled={downloadingId === log.target_id}
                        onClick={() => log.target_id && handleViewFile(log.target_id, log)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary text-[11px] font-semibold border border-brand-primary/20 transition-colors disabled:opacity-50"
                      >
                        {downloadingId === log.target_id ? (
                          <><span className="animate-spin text-xs">⏳</span> Generating…</>
                        ) : (
                          <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg> View File</>
                        )}
                      </button>
                    )}
                  </div>
                ) : log.target_user ? (
                  <div>
                    <span className="font-semibold">👤 {log.target_user.email}</span>
                    <span className="text-[10px] text-text-muted ml-1">({log.target_user.role || 'user'})</span>
                  </div>
                ) : log.target_requirement ? (
                  <span className="font-semibold">📋 {log.target_requirement.name}</span>
                ) : (
                  <span className="font-medium">{humanizeCode(log.target_type)}</span>
                )}
              </div>

              {/* IP */}
              {log.source_ip && (
                <div className="text-[10px] text-text-muted font-mono">IP: {log.source_ip}</div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Desktop Table Layout */}
      <div className="hidden md:block bg-surface-bg border border-border-default rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Audit log entries">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-muted border-b border-border-default">
                <th className="px-3 py-3 text-[11px] font-bold text-text-muted uppercase tracking-wider whitespace-nowrap" style={{ width: '140px' }}>
                  Timestamp
                </th>
                <th className="px-3 py-3 text-[11px] font-bold text-text-muted uppercase tracking-wider" style={{ width: '160px' }}>
                  Actor
                </th>
                <th className="px-3 py-3 text-[11px] font-bold text-text-muted uppercase tracking-wider" style={{ width: '140px' }}>
                  Action
                </th>
                <th className="px-3 py-3 text-[11px] font-bold text-text-muted uppercase tracking-wider">
                  Target & File Details
                </th>
                <th className="px-3 py-3 text-[11px] font-bold text-text-muted uppercase tracking-wider" style={{ width: '120px' }}>
                  Source IP
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-default">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-text-muted">
                    {loading ? 'Loading...' : 'No audit logs found matching the current filters.'}
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-surface-hover transition-colors align-top">
                    <td className="px-3 py-3 text-xs text-text-primary whitespace-nowrap align-top">
                      {new Intl.DateTimeFormat(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      }).format(new Date(log.created_at))}
                    </td>
                    <td className="px-3 py-3 text-xs text-text-primary align-top">
                      {log.users ? (
                        <div className="flex flex-col min-w-0">
                          <span className="font-semibold truncate" title={log.users.email}>{log.users.email}</span>
                          <span className="text-[10px] text-text-muted font-mono truncate" title={log.actor_id || ''}>{log.actor_id?.substring(0, 8)}…</span>
                        </div>
                      ) : (
                        <span className="text-text-muted font-mono text-[10px] truncate block" title={log.actor_id || ''}>{log.actor_id?.substring(0, 12) || 'System'}…</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs align-top">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border whitespace-nowrap ${getActionBadgeColor(log.action)}`}
                        title={log.action}
                      >
                        {humanizeCode(log.action)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs text-text-primary align-top">
                      {log.submission ? (
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-bold text-text-primary truncate max-w-[200px]" title={log.submission.requirement_name}>
                              📄 {log.submission.requirement_name}
                            </span>
                            <span className="text-[10px] font-semibold text-slate-700 bg-slate-100 px-1 rounded border border-slate-200 shrink-0">
                              v{log.submission.version_number}
                            </span>
                            <span className="text-[10px] font-mono text-slate-500 bg-slate-50 px-1 rounded border border-slate-200 shrink-0">
                              {log.submission.state}
                            </span>
                          </div>

                          {log.submission.intern_email && (
                            <div className="text-[11px] text-text-muted truncate" title={log.submission.intern_email}>
                              By: <span className="font-medium text-text-primary">{log.submission.intern_email}</span>
                            </div>
                          )}

                          <div className="flex items-center gap-2">
                            {log.submission.has_file && onGetDownloadUrlAction && (
                              <button
                                type="button"
                                disabled={downloadingId === log.target_id}
                                onClick={() => log.target_id && handleViewFile(log.target_id, log)}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary text-[10px] font-semibold border border-brand-primary/20 transition-colors disabled:opacity-50 shrink-0"
                              >
                                {downloadingId === log.target_id ? (
                                  <><span className="animate-spin text-xs">⏳</span> Loading…</>
                                ) : (
                                  <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg> View File</>
                                )}
                              </button>
                            )}
                            <span className="text-[10px] text-text-muted font-mono" title={log.target_id || ''}>
                              {log.target_id?.substring(0, 8)}…
                            </span>
                          </div>
                        </div>
                      ) : log.target_user ? (
                        <div className="flex flex-col space-y-0.5 min-w-0">
                          <span className="font-semibold text-text-primary truncate" title={log.target_user.email}>
                            👤 {log.target_user.email}
                          </span>
                          <span className="text-[10px] text-text-muted font-mono">
                            {log.target_user.role || 'user'} • {log.target_id?.substring(0, 8)}…
                          </span>
                        </div>
                      ) : log.target_requirement ? (
                        <div className="flex flex-col space-y-0.5 min-w-0">
                          <span className="font-semibold text-text-primary truncate" title={log.target_requirement.name}>
                            📋 {log.target_requirement.name}
                          </span>
                          <span className="text-[10px] text-text-muted font-mono">
                            {log.target_id?.substring(0, 8)}…
                          </span>
                        </div>
                      ) : (
                        <div className="flex flex-col space-y-0.5 min-w-0">
                          <span className="font-medium text-text-primary">{humanizeCode(log.target_type)}</span>
                          {log.target_id && (
                            <span className="text-[10px] text-text-muted font-mono truncate" title={log.target_id}>
                              {log.target_id?.substring(0, 12)}…
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-text-muted font-mono align-top whitespace-nowrap">
                      {log.source_ip || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {hasMore && actionFilter === 'all' && (
          <div className="px-4 py-3 border-t border-border-default bg-surface-muted flex justify-center">
            <Button onClick={handleLoadMore} disabled={loading} variant="outline" size="sm">
              {loading ? 'Loading...' : 'Load More'}
            </Button>
          </div>
        )}
      </div>

      {/* Mobile Pagination */}
      {hasMore && actionFilter === 'all' && (
        <div className="md:hidden flex justify-center">
          <Button onClick={handleLoadMore} disabled={loading} variant="outline" size="sm">
            {loading ? 'Loading...' : 'Load More'}
          </Button>
        </div>
      )}

      {/* In-Page Document Viewer Modal for System Admin */}
      {viewerItem && (
        <DocumentViewerModal
          open={!!viewerItem}
          onOpenChange={(open) => !open && setViewerItem(null)}
          title={viewerItem.title}
          subtitle={viewerItem.subtitle}
          fileUrl={viewerUrl}
          isLoadingFile={isViewerLoading}
          error={viewerError}
          downloadFileName={`${viewerItem.title.toLowerCase().replace(/[^a-z0-9]/g, '_')}.pdf`}
          metadata={
            viewerItem.log?.submission
              ? {
                  internEmail: viewerItem.log.submission.intern_email,
                  versionNumber: viewerItem.log.submission.version_number,
                  statusBadge: (
                    <span className="text-[10px] font-semibold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                      {viewerItem.log.submission.state}
                    </span>
                  ),
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
