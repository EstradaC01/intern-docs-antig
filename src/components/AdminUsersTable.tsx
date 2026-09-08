'use client';

import React, { useState, useMemo } from 'react';
import { XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CohortUser } from '@lib/data/users';

interface AdminUsersTableProps {
  users: CohortUser[];
  onApproveAction: (userId: string) => Promise<{ success?: boolean; error?: string }>;
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function AdminUsersTable({ users, onApproveAction }: AdminUsersTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'active' | 'pending'>('ALL');
  const [schoolFilter, setSchoolFilter] = useState<string>('ALL');
  const [batchFilter, setBatchFilter] = useState<string>('ALL');
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const schoolOptions = useMemo(
    () => Array.from(new Set(users.map((u) => u.school).filter((s): s is string => !!s))).sort(),
    [users]
  );
  const batchOptions = useMemo(
    () => Array.from(new Set(users.map((u) => u.batch).filter((b): b is string => !!b))).sort(),
    [users]
  );

  const filteredUsers = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    return users.filter((u) => {
      const matchesSearch =
        !q || u.email.toLowerCase().includes(q) || (u.fullName || '').toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'ALL' || u.status === statusFilter;
      const matchesSchool = schoolFilter === 'ALL' || u.school === schoolFilter;
      const matchesBatch = batchFilter === 'ALL' || u.batch === batchFilter;
      return matchesSearch && matchesStatus && matchesSchool && matchesBatch;
    });
  }, [users, searchTerm, statusFilter, schoolFilter, batchFilter]);

  const pendingCount = useMemo(() => users.filter((u) => u.status === 'pending').length, [users]);

  const handleApprove = async (user: CohortUser) => {
    setApprovingId(user.id);
    setRowError((prev) => ({ ...prev, [user.id]: '' }));
    try {
      const res = await onApproveAction(user.id);
      if (res.error) {
        setRowError((prev) => ({ ...prev, [user.id]: res.error! }));
      } else {
        setStatusMessage(`${user.fullName || user.email} admitted to the cohort.`);
        setTimeout(() => setStatusMessage(null), 3000);
      }
    } catch (e: unknown) {
      setRowError((prev) => ({ ...prev, [user.id]: e instanceof Error ? e.message : 'Approval failed' }));
    } finally {
      setApprovingId(null);
    }
  };

  return (
    <div className="bg-surface-bg border border-border-default rounded-2xl p-6 shadow-xs space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-bold text-lg text-text-primary flex items-center gap-2">
            <span>Cohort Interns</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-surface-muted text-text-muted">
              {filteredUsers.length} of {users.length}
            </span>
          </h2>
          <p className="text-xs text-text-muted mt-0.5">
            Every intern account — admitted cohort members and self-registered requests awaiting approval.
          </p>
        </div>

        {statusMessage && (
          <div className="flex items-center gap-1.5 text-xs font-medium text-status-approved-text bg-status-approved/10 px-3 py-1.5 rounded-xl border border-status-approved/30 animate-in fade-in">
            <svg className="h-3.5 w-3.5 text-status-approved shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {statusMessage}
          </div>
        )}
      </div>

      {/* Search */}
      <div className="relative w-full">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by name or email address..."
          className="w-full pl-9 pr-8 py-2 rounded-xl border border-border-default text-xs text-text-primary placeholder:text-text-muted bg-white focus:border-brand-primary outline-none"
        />
        <svg className="absolute left-3 top-2.5 h-3.5 w-3.5 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
        </svg>
        {searchTerm && (
          <button
            type="button"
            onClick={() => setSearchTerm('')}
            aria-label="Clear search"
            className="absolute right-2.5 top-2 p-0.5 rounded text-text-muted hover:text-text-primary"
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Status pill filters */}
      <div className="flex flex-wrap gap-1.5 text-xs">
        {[
          { key: 'ALL' as const, label: 'All', count: users.length },
          { key: 'pending' as const, label: 'Pending Approval', count: pendingCount },
          { key: 'active' as const, label: 'Cohort', count: users.length - pendingCount },
        ].map((pill) => (
          <button
            key={pill.key}
            onClick={() => setStatusFilter(pill.key)}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
              statusFilter === pill.key
                ? 'bg-brand-primary text-white'
                : 'bg-surface-muted text-text-muted hover:bg-surface-hover'
            }`}
          >
            {pill.label} ({pill.count})
          </button>
        ))}
      </div>

      {/* School / Batch filters */}
      {(schoolOptions.length > 0 || batchOptions.length > 0) && (
        <div className="flex flex-wrap gap-3 text-xs">
          {schoolOptions.length > 0 && (
            <div>
              <label htmlFor="filter-school" className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">School</label>
              <select
                id="filter-school"
                value={schoolFilter}
                onChange={(e) => setSchoolFilter(e.target.value)}
                className="p-1.5 rounded-lg border border-border-default bg-surface-muted text-xs text-text-primary outline-none"
              >
                <option value="ALL">All Schools</option>
                {schoolOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
          {batchOptions.length > 0 && (
            <div>
              <label htmlFor="filter-batch" className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Batch</label>
              <select
                id="filter-batch"
                value={batchFilter}
                onChange={(e) => setBatchFilter(e.target.value)}
                className="p-1.5 rounded-lg border border-border-default bg-surface-muted text-xs text-text-primary outline-none"
              >
                <option value="ALL">All Batches</option>
                {batchOptions.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto border border-border-default rounded-xl" tabIndex={0} role="region" aria-label="Cohort intern list">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-border-default text-text-muted bg-surface-muted">
              <th className="py-3 px-4 font-semibold">Full Name</th>
              <th className="py-3 px-4 font-semibold">Email Address</th>
              <th className="py-3 px-4 font-semibold">School / University</th>
              <th className="py-3 px-4 font-semibold">Batch</th>
              <th className="py-3 px-4 font-semibold">OJT Duration</th>
              <th className="py-3 px-4 font-semibold">Status</th>
              <th className="py-3 px-4 font-semibold">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-default">
            {filteredUsers.map((u) => (
              <tr key={u.id} className="hover:bg-surface-hover transition-colors">
                <td className="py-3.5 px-4 font-medium text-text-primary">
                  {u.fullName || <span className="text-text-muted italic">Not provided</span>}
                </td>
                <td className="py-3.5 px-4 text-text-primary">{u.email}</td>
                <td className="py-3.5 px-4 text-text-muted">{u.school || '—'}</td>
                <td className="py-3.5 px-4 text-text-muted">{u.batch || '—'}</td>
                <td className="py-3.5 px-4 text-text-muted font-mono text-[11px]">
                  {u.internshipStart && u.internshipEnd
                    ? `${formatDate(u.internshipStart)} – ${formatDate(u.internshipEnd)}`
                    : '—'}
                </td>
                <td className="py-3.5 px-4">
                  <span
                    className={`inline-block px-2.5 py-0.5 rounded-full font-semibold text-[10px] uppercase tracking-wider ${
                      u.status === 'pending'
                        ? 'bg-status-in-review/20 text-status-in-review-text'
                        : 'bg-status-approved/10 text-status-approved'
                    }`}
                  >
                    {u.status === 'pending' ? 'Pending' : 'Cohort'}
                  </span>
                </td>
                <td className="py-3.5 px-4">
                  {u.status === 'pending' ? (
                    <div className="flex flex-col gap-1">
                      <Button
                        type="button"
                        size="sm"
                        disabled={approvingId === u.id}
                        onClick={() => handleApprove(u)}
                        className="rounded-xl px-3 py-1.5 text-xs font-semibold bg-status-approved hover:bg-status-approved-text text-white shadow-2xs"
                      >
                        {approvingId === u.id ? 'Admitting…' : 'Approve'}
                      </Button>
                      {rowError[u.id] && (
                        <span role="alert" className="text-[10px] text-status-returned-text">{rowError[u.id]}</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-text-muted">—</span>
                  )}
                </td>
              </tr>
            ))}

            {filteredUsers.length === 0 && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-text-muted">
                  <div className="space-y-1">
                    <p className="font-semibold text-text-primary">No interns found</p>
                    <p className="text-xs">No accounts match your current filter or search.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
