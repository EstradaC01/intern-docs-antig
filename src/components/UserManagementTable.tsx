'use client';

import React, { useState, useMemo } from 'react';
import { XIcon } from 'lucide-react';
import { ConfirmAction } from '@/components/ConfirmAction';
import { Button } from '@/components/ui/button';
import { humanizeCode } from '@/lib/utils';

export interface ManagedUser {
  id: string;
  email: string;
  role: 'intern' | 'approver' | 'admin' | 'system_admin' | string;
  internship_start?: string | null;
  internship_end?: string | null;
  school?: string | null;
  batch?: string | null;
  created_at: string;
}

interface UserManagementTableProps {
  users: ManagedUser[];
  onRoleChangeAction: (formData: FormData) => Promise<void>;
  /** Saves an intern's school/batch group. Optional so this table still works anywhere groups aren't wired up. */
  onGroupChangeAction?: (formData: FormData) => Promise<void>;
  /** FR-3 admin override: change an intern's internship dates even after their own lock (first approval). */
  onDatesChangeAction?: (formData: FormData) => Promise<{ success?: boolean; error?: string }>;
}

export function UserManagementTable({ users, onRoleChangeAction, onGroupChangeAction, onDatesChangeAction }: UserManagementTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [schoolFilter, setSchoolFilter] = useState<string>('ALL');
  const [batchFilter, setBatchFilter] = useState<string>('ALL');
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [pendingChange, setPendingChange] = useState<{ user: ManagedUser; nextRole: string } | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [groupDrafts, setGroupDrafts] = useState<Record<string, { school: string; batch: string }>>({});
  const [savingGroupFor, setSavingGroupFor] = useState<string | null>(null);
  const [dateDrafts, setDateDrafts] = useState<Record<string, { start: string; end: string }>>({});
  const [savingDatesFor, setSavingDatesFor] = useState<string | null>(null);
  const [isSavingAllDates, setIsSavingAllDates] = useState(false);
  const [dateErrors, setDateErrors] = useState<Record<string, string>>({});

  const schoolOptions = useMemo(
    () => Array.from(new Set(users.map((u) => u.school).filter((s): s is string => !!s))).sort(),
    [users]
  );
  const batchOptions = useMemo(
    () => Array.from(new Set(users.map((u) => u.batch).filter((b): b is string => !!b))).sort(),
    [users]
  );

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch = u.email.toLowerCase().includes(searchTerm.toLowerCase().trim());
      const matchesRole = roleFilter === 'ALL' || u.role === roleFilter;
      const matchesSchool = schoolFilter === 'ALL' || u.school === schoolFilter;
      const matchesBatch = batchFilter === 'ALL' || u.batch === batchFilter;
      return matchesSearch && matchesRole && matchesSchool && matchesBatch;
    });
  }, [users, searchTerm, roleFilter, schoolFilter, batchFilter]);

  const getGroupDraft = (u: ManagedUser) => groupDrafts[u.id] ?? { school: u.school || '', batch: u.batch || '' };

  const handleGroupFieldChange = (u: ManagedUser, field: 'school' | 'batch', value: string) => {
    setGroupDrafts((prev) => ({ ...prev, [u.id]: { ...getGroupDraft(u), [field]: value } }));
  };

  const handleGroupSave = async (u: ManagedUser) => {
    if (!onGroupChangeAction) return;
    const draft = getGroupDraft(u);
    if (draft.school === (u.school || '') && draft.batch === (u.batch || '')) return;

    setSavingGroupFor(u.id);
    try {
      const formData = new FormData();
      formData.set('userId', u.id);
      formData.set('school', draft.school.trim());
      formData.set('batch', draft.batch.trim());
      await onGroupChangeAction(formData);
      setStatusMessage('Group updated.');
      setTimeout(() => setStatusMessage(null), 3000);
    } finally {
      setSavingGroupFor(null);
    }
  };

  const getDateDraft = (u: ManagedUser) => dateDrafts[u.id] ?? { start: u.internship_start || '', end: u.internship_end || '' };

  const isDatesDirty = (u: ManagedUser) => {
    const draft = getDateDraft(u);
    return draft.start !== (u.internship_start || '') || draft.end !== (u.internship_end || '');
  };

  const handleDateFieldChange = (u: ManagedUser, field: 'start' | 'end', value: string) => {
    setDateErrors((prev) => ({ ...prev, [u.id]: '' }));
    setDateDrafts((prev) => ({ ...prev, [u.id]: { ...getDateDraft(u), [field]: value } }));
  };

  const dirtyDateUsers = useMemo(() => users.filter(isDatesDirty), [users, dateDrafts]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Saves every row with an unsaved date change at once, from the single header button. */
  const handleSaveAllDates = async () => {
    if (!onDatesChangeAction || dirtyDateUsers.length === 0) return;

    setIsSavingAllDates(true);
    let successCount = 0;
    try {
      for (const u of dirtyDateUsers) {
        const draft = getDateDraft(u);
        if (!draft.start || !draft.end) continue;

        setSavingDatesFor(u.id);
        try {
          const formData = new FormData();
          formData.set('userId', u.id);
          formData.set('start', draft.start);
          formData.set('end', draft.end);
          const res = await onDatesChangeAction(formData);
          if (res.error) {
            setDateErrors((prev) => ({ ...prev, [u.id]: res.error! }));
          } else {
            successCount++;
          }
        } catch (e: unknown) {
          setDateErrors((prev) => ({ ...prev, [u.id]: e instanceof Error ? e.message : 'Failed to save' }));
        }
      }
    } finally {
      setSavingDatesFor(null);
      setIsSavingAllDates(false);
    }

    if (successCount > 0) {
      setStatusMessage(`Internship dates updated for ${successCount} intern${successCount === 1 ? '' : 's'}.`);
      setTimeout(() => setStatusMessage(null), 3000);
    }
  };

  const roleCounts = useMemo(() => {
    return {
      ALL: users.length,
      intern: users.filter((u) => u.role === 'intern').length,
      approver: users.filter((u) => u.role === 'approver').length,
      admin: users.filter((u) => u.role === 'admin').length,
      system_admin: users.filter((u) => u.role === 'system_admin').length,
    };
  }, [users]);

  const handleRoleSelect = (user: ManagedUser, nextRole: string) => {
    if (nextRole === user.role) return;
    setConfirmError(null);
    setPendingChange({ user, nextRole });
  };

  const handleConfirmRoleChange = async () => {
    if (!pendingChange) return;
    const { user, nextRole } = pendingChange;
    setIsUpdating(user.id);
    setConfirmError(null);
    try {
      const formData = new FormData();
      formData.set('userId', user.id);
      formData.set('role', nextRole);
      await onRoleChangeAction(formData);
      setPendingChange(null);
      setStatusMessage(`Role successfully updated.`);
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (e: unknown) {
      setConfirmError(e instanceof Error ? e.message : 'Failed to update role.');
    } finally {
      setIsUpdating(null);
    }
  };

  return (
    <div className="bg-surface-bg border border-border-default rounded-2xl p-6 shadow-xs space-y-5">
      {/* Top Header & Search / Filter Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-bold text-lg text-text-primary flex items-center gap-2">
            <span>Registered Users</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-surface-muted text-text-muted">
              {filteredUsers.length} of {users.length}
            </span>
          </h2>
          <p className="text-xs text-text-muted mt-0.5">Filter by role, school, batch, or search by email address.</p>
        </div>

        <div className="flex items-center gap-3">
          {statusMessage && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-status-approved-text bg-status-approved/10 px-3 py-1.5 rounded-xl border border-status-approved/30 animate-in fade-in">
              <svg className="h-3.5 w-3.5 text-status-approved shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {statusMessage}
            </div>
          )}

          {onDatesChangeAction && dirtyDateUsers.length > 0 && (
            <Button
              type="button"
              size="sm"
              disabled={isSavingAllDates}
              onClick={handleSaveAllDates}
            >
              {isSavingAllDates ? 'Saving…' : `Save Changes (${dirtyDateUsers.length})`}
            </Button>
          )}
        </div>
      </div>

      {/* Search Bar */}
      <div className="pt-1">
        <div className="relative w-full">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search users by email address..."
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
      </div>

      {/* Role Pill Filters */}
      <div className="flex flex-wrap gap-1.5 text-xs">
        {[
          { key: 'ALL', label: 'All', count: roleCounts.ALL },
          { key: 'intern', label: 'Interns', count: roleCounts.intern },
          { key: 'approver', label: 'Approvers', count: roleCounts.approver },
          { key: 'admin', label: 'Admins', count: roleCounts.admin },
          { key: 'system_admin', label: 'System Admins', count: roleCounts.system_admin },
        ].map((pill) => (
          <button
            key={pill.key}
            onClick={() => setRoleFilter(pill.key)}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
              roleFilter === pill.key
                ? 'bg-brand-primary text-white'
                : 'bg-surface-muted text-text-muted hover:bg-surface-hover'
            }`}
          >
            {pill.label} ({pill.count})
          </button>
        ))}
      </div>

      {/* Group Filters (School / Batch) */}
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

      {/* User Table */}
      <div className="overflow-x-auto border border-border-default rounded-xl" tabIndex={0} role="region" aria-label="User list">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-border-default text-text-muted bg-surface-muted">
              <th className="py-3 px-4 font-semibold">User / Email</th>
              <th className="py-3 px-4 font-semibold">Current Role</th>
              <th className="py-3 px-4 font-semibold">School</th>
              <th className="py-3 px-4 font-semibold">Batch</th>
              <th className="py-3 px-4 font-semibold">Internship Dates</th>
              <th className="py-3 px-4 font-semibold">Change Role</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-default">
            {filteredUsers.map((u) => (
              <tr key={u.id} className="hover:bg-surface-hover transition-colors">
                <td className="py-3.5 px-4 font-medium text-text-primary">
                  {u.email}
                </td>
                <td className="py-3.5 px-4">
                  <span
                    className={`inline-block px-2.5 py-0.5 rounded-full font-semibold text-[10px] uppercase tracking-wider ${
                      u.role === 'system_admin'
                        ? 'bg-role-system-admin-bg text-role-system-admin-text'
                        : u.role === 'admin'
                        ? 'bg-role-admin-bg text-role-admin-text'
                        : u.role === 'approver'
                        ? 'bg-role-approver-bg text-role-approver-text'
                        : 'bg-surface-muted text-text-muted'
                    }`}
                  >
                    {humanizeCode(u.role)}
                  </span>
                </td>
                <td className="py-3.5 px-4">
                  {u.role === 'intern' && onGroupChangeAction ? (
                    <>
                      <label className="sr-only" htmlFor={`school-${u.id}`}>School for {u.email}</label>
                      <input
                        id={`school-${u.id}`}
                        type="text"
                        value={getGroupDraft(u).school}
                        onChange={(e) => handleGroupFieldChange(u, 'school', e.target.value)}
                        onBlur={() => handleGroupSave(u)}
                        disabled={savingGroupFor === u.id}
                        placeholder="—"
                        className="w-32 rounded-lg border border-transparent hover:border-border-default focus:border-brand-primary bg-transparent p-1.5 text-xs text-text-primary outline-none disabled:opacity-50"
                      />
                    </>
                  ) : (
                    <span className="text-text-muted">{u.school || '—'}</span>
                  )}
                </td>
                <td className="py-3.5 px-4">
                  {u.role === 'intern' && onGroupChangeAction ? (
                    <>
                      <label className="sr-only" htmlFor={`batch-${u.id}`}>Batch for {u.email}</label>
                      <input
                        id={`batch-${u.id}`}
                        type="text"
                        value={getGroupDraft(u).batch}
                        onChange={(e) => handleGroupFieldChange(u, 'batch', e.target.value)}
                        onBlur={() => handleGroupSave(u)}
                        disabled={savingGroupFor === u.id}
                        placeholder="—"
                        className="w-28 rounded-lg border border-transparent hover:border-border-default focus:border-brand-primary bg-transparent p-1.5 text-xs text-text-primary outline-none disabled:opacity-50"
                      />
                    </>
                  ) : (
                    <span className="text-text-muted">{u.batch || '—'}</span>
                  )}
                </td>
                <td className="py-3.5 px-4 text-text-muted font-mono text-[11px]">
                  {u.role === 'intern' && onDatesChangeAction ? (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-1">
                        <label className="sr-only" htmlFor={`date-start-${u.id}`}>Internship start for {u.email}</label>
                        <input
                          id={`date-start-${u.id}`}
                          type="date"
                          value={getDateDraft(u).start}
                          onChange={(e) => handleDateFieldChange(u, 'start', e.target.value)}
                          disabled={savingDatesFor === u.id}
                          className="w-32 rounded-lg border border-transparent hover:border-border-default focus:border-brand-primary bg-transparent p-1.5 text-[11px] text-text-primary outline-none disabled:opacity-50"
                        />
                        <span>to</span>
                        <label className="sr-only" htmlFor={`date-end-${u.id}`}>Internship end for {u.email}</label>
                        <input
                          id={`date-end-${u.id}`}
                          type="date"
                          value={getDateDraft(u).end}
                          onChange={(e) => handleDateFieldChange(u, 'end', e.target.value)}
                          disabled={savingDatesFor === u.id}
                          className="w-32 rounded-lg border border-transparent hover:border-border-default focus:border-brand-primary bg-transparent p-1.5 text-[11px] text-text-primary outline-none disabled:opacity-50"
                        />
                      </div>
                      {isDatesDirty(u) && !dateErrors[u.id] && (
                        <span className="text-[10px] text-status-in-review-text font-sans font-semibold">
                          {savingDatesFor === u.id ? 'Saving…' : 'Unsaved — use Save Changes above'}
                        </span>
                      )}
                      {dateErrors[u.id] && (
                        <span role="alert" className="text-[10px] text-status-returned-text font-sans">{dateErrors[u.id]}</span>
                      )}
                    </div>
                  ) : (
                    u.internship_start && u.internship_end
                      ? `${u.internship_start} to ${u.internship_end}`
                      : '—'
                  )}
                </td>
                <td className="py-3.5 px-4">
                  <label htmlFor={`role-${u.id}`} className="sr-only">
                    Change role for {u.email}
                  </label>
                  <select
                    id={`role-${u.id}`}
                    value={u.role}
                    onChange={(e) => handleRoleSelect(u, e.target.value)}
                    disabled={isUpdating === u.id}
                    className="rounded-lg border border-border-default p-1.5 text-xs bg-white text-text-primary focus:border-brand-primary outline-none disabled:opacity-50"
                  >
                    <option value="intern">Intern</option>
                    <option value="approver">Approver</option>
                    <option value="admin">Admin</option>
                    <option value="system_admin">System Admin</option>
                  </select>
                </td>
              </tr>
            ))}

            {filteredUsers.length === 0 && (
              <tr>
                <td colSpan={6} className="py-10 text-center text-text-muted">
                  <div className="space-y-1">
                    <p className="font-semibold text-text-primary">No users found</p>
                    <p className="text-xs">No registered accounts match your current filter or search.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pendingChange && (
        <ConfirmAction
          open={!!pendingChange}
          onOpenChange={(open) => !open && setPendingChange(null)}
          title="Change user role?"
          description="This changes what the user can access immediately and is recorded in the audit log."
          confirmLabel="Change Role"
          variant="destructive"
          isLoading={isUpdating === pendingChange.user.id}
          loadingLabel="Saving…"
          error={confirmError}
          onConfirm={handleConfirmRoleChange}
        >
          <div className="rounded-xl bg-surface-muted border border-border-default p-3.5 text-sm space-y-1.5">
            <div>
              <strong className="text-text-primary">{pendingChange.user.email}</strong>
            </div>
            <div className="text-text-muted">
              <strong className="text-status-returned-text">{humanizeCode(pendingChange.user.role)}</strong>
              {' → '}
              <strong className="text-status-approved-text">{humanizeCode(pendingChange.nextRole)}</strong>
            </div>
          </div>
        </ConfirmAction>
      )}
    </div>
  );
}
