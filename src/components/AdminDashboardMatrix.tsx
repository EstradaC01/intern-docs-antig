'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { CheckCircle2, Clock, AlertTriangle, Undo2, Download, LayoutGrid } from 'lucide-react';
import { AdminDashboardData } from '@lib/data/dashboard';
import { DEFAULT_EXPORT_COLUMN_KEYS } from '@lib/export/columns';
import { StatusBadge } from './StatusBadge';
import { Button } from './ui/button';
import { ColumnPicker } from './ColumnPicker';

const NEEDS_ACTION_STATES = new Set(['IN_REVIEW', 'RETURNED']);

export function AdminDashboardMatrix({ data }: { data: AdminDashboardData }) {
  const [filterReq, setFilterReq] = useState<string>('ALL');
  const [filterState, setFilterState] = useState<string>('ALL');
  const [filterApprover, setFilterApprover] = useState<string>('ALL');
  const [filterSchool, setFilterSchool] = useState<string>('ALL');
  const [filterBatch, setFilterBatch] = useState<string>('ALL');
  const [isExporting, setIsExporting] = useState(false);
  const [viewMode, setViewMode] = useState<'needs-action' | 'full'>('needs-action');
  // Restore the admin's last column selection for this browser via a lazy initializer
  // (not an effect -- this is a one-shot read of a store that doesn't change during the
  // component's lifetime, so there's nothing to subscribe to). Falls back silently to
  // the default 10 on any storage error (private browsing, cleared site data, SSR pass
  // where `window` isn't defined yet) -- this is a convenience, never something the
  // export depends on to function.
  const [selectedColumns, setSelectedColumns] = useState<string[]>(() => {
    if (typeof window === 'undefined') return DEFAULT_EXPORT_COLUMN_KEYS;
    try {
      const saved = window.localStorage.getItem('intern-docs:admin-export-columns');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.every((k) => typeof k === 'string')) {
          return parsed;
        }
      }
    } catch {
      // Ignore -- default selection stands.
    }
    return DEFAULT_EXPORT_COLUMN_KEYS;
  });

  const handleColumnsChange = (keys: string[]) => {
    setSelectedColumns(keys);
    try {
      window.localStorage.setItem('intern-docs:admin-export-columns', JSON.stringify(keys));
    } catch {
      // Ignore -- selection still works for this session, just won't persist.
    }
  };

  // Derive unique approvers for filter dropdown
  const approvers = useMemo(() => {
    const set = new Set<string>();
    data.submissions.forEach(s => {
      if (s.current_holder_email) set.add(s.current_holder_email);
    });
    return Array.from(set).sort();
  }, [data.submissions]);

  // Derive unique schools/batches for group filter dropdowns
  const schools = useMemo(() => {
    const set = new Set<string>();
    data.interns.forEach(i => { if (i.school) set.add(i.school); });
    return Array.from(set).sort();
  }, [data.interns]);

  const batches = useMemo(() => {
    const set = new Set<string>();
    data.interns.forEach(i => { if (i.batch) set.add(i.batch); });
    return Array.from(set).sort();
  }, [data.interns]);

  // Summary counts across the whole cohort, independent of the current filters -- these
  // drive the chip row above the grid.
  const summaryCounts = useMemo(() => {
    let complete = 0, inReview = 0, overdue = 0, returned = 0;
    for (const sub of data.submissions) {
      if (sub.state === 'APPROVED') complete++;
      if (sub.state === 'IN_REVIEW') inReview++;
      if (sub.state === 'RETURNED') returned++;
      if (sub.isOverdue) overdue++;
    }
    return { complete, inReview, overdue, returned };
  }, [data.submissions]);

  const dropdownFilteredInterns = useMemo(() => {
    return data.interns.filter(intern => {
      if (filterSchool !== 'ALL' && intern.school !== filterSchool) return false;
      if (filterBatch !== 'ALL' && intern.batch !== filterBatch) return false;

      if (filterReq === 'ALL' && filterState === 'ALL' && filterApprover === 'ALL') return true;

      const internSubs = data.submissions.filter(s => s.intern_id === intern.id);

      let matches = false;
      if (internSubs.length === 0) {
        if (filterState === 'NOT_STARTED' && filterApprover === 'ALL') {
          matches = true;
        }
      } else {
        matches = internSubs.some(sub => {
          const matchReq = filterReq === 'ALL' || sub.requirement_id === filterReq;
          const matchState = filterState === 'ALL' || (filterState === 'OVERDUE' ? sub.isOverdue : sub.state === filterState);
          const matchAppr = filterApprover === 'ALL' || sub.current_holder_email === filterApprover;
          return matchReq && matchState && matchAppr;
        });

        if (!matches && filterState === 'NOT_STARTED') {
          const hasSubForReq = internSubs.some(s => filterReq === 'ALL' ? false : s.requirement_id === filterReq);
          if (!hasSubForReq && filterApprover === 'ALL') matches = true;
        }
      }
      return matches;
    });
  }, [data, filterReq, filterState, filterApprover, filterSchool, filterBatch]);

  const dropdownFilteredRequirements = useMemo(() => {
    if (filterReq === 'ALL') return data.requirements;
    return data.requirements.filter(r => r.id === filterReq);
  }, [data.requirements, filterReq]);

  // Requirement columns that actually have a submission matching the selected state (+
  // approver filter) somewhere in the cohort. Used whenever a specific state is chosen so a
  // column with nothing in that state doesn't show up at all.
  const stateFilteredRequirements = useMemo(() => {
    if (filterState === 'ALL') return dropdownFilteredRequirements;
    return dropdownFilteredRequirements.filter(req =>
      data.submissions.some(sub =>
        sub.requirement_id === req.id &&
        (filterState === 'OVERDUE' ? sub.isOverdue : sub.state === filterState) &&
        (filterApprover === 'ALL' || sub.current_holder_email === filterApprover)
      )
    );
  }, [dropdownFilteredRequirements, data.submissions, filterState, filterApprover]);

  // "Needs Action" (default): rows/columns are kept only if they contain at least one
  // In Review, Returned, or Overdue cell -- cells stay in their real row/column position,
  // never flattened into a separate list. This only applies when no specific state is picked;
  // an explicit state selection (chip or dropdown) is itself the more specific request and
  // fully overrides this heuristic for both rows and columns.
  const { filteredInterns, requirementsToRender } = useMemo(() => {
    if (viewMode === 'full' || filterState !== 'ALL') {
      return { filteredInterns: dropdownFilteredInterns, requirementsToRender: stateFilteredRequirements };
    }

    const needsActionInternIds = new Set<string>();
    const needsActionReqIds = new Set<string>();
    for (const sub of data.submissions) {
      if (NEEDS_ACTION_STATES.has(sub.state) || sub.isOverdue) {
        needsActionInternIds.add(sub.intern_id);
        needsActionReqIds.add(sub.requirement_id);
      }
    }

    return {
      filteredInterns: dropdownFilteredInterns.filter(i => needsActionInternIds.has(i.id)),
      requirementsToRender: dropdownFilteredRequirements.filter(r => needsActionReqIds.has(r.id)),
    };
  }, [viewMode, filterState, dropdownFilteredInterns, dropdownFilteredRequirements, stateFilteredRequirements, data.submissions]);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      // In a real app we'd call a server action here to audit log and get the CSV.
      // For now we'll do a client-side export and assume the server route is used for the real FR-6.
      const colsQuery = selectedColumns.length > 0 ? `&cols=${selectedColumns.join(',')}` : '';
      const res = await fetch(`/api/admin/export?req=${filterReq}&state=${filterState}&appr=${filterApprover}&school=${encodeURIComponent(filterSchool)}&batch=${encodeURIComponent(filterBatch)}${colsQuery}`);
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `intern_export_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      alert('Export failed.');
    } finally {
      setIsExporting(false);
    }
  };

  const chipFilter = (state: string) => setFilterState(prev => (prev === state ? 'ALL' : state));

  const STAT_CARDS = [
    {
      key: 'APPROVED', label: 'Complete', count: summaryCounts.complete, Icon: CheckCircle2,
      iconIdle: 'bg-emerald-50 text-emerald-600', iconActive: 'bg-emerald-600 text-white',
      ring: 'ring-emerald-500',
    },
    {
      key: 'IN_REVIEW', label: 'In Review', count: summaryCounts.inReview, Icon: Clock,
      iconIdle: 'bg-amber-50 text-amber-600', iconActive: 'bg-amber-600 text-white',
      ring: 'ring-amber-500',
    },
    {
      key: 'OVERDUE', label: 'Overdue', count: summaryCounts.overdue, Icon: AlertTriangle,
      iconIdle: 'bg-red-50 text-red-600', iconActive: 'bg-red-600 text-white',
      ring: 'ring-red-600',
    },
    {
      key: 'RETURNED', label: 'Returned', count: summaryCounts.returned, Icon: Undo2,
      iconIdle: 'bg-brand-primary/10 text-brand-primary', iconActive: 'bg-brand-primary text-white',
      ring: 'ring-brand-primary',
    },
  ] as const;

  const selectClass =
    'w-full text-xs p-2.5 rounded-xl border border-border-default bg-white text-text-primary focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 outline-none transition-all';

  return (
    <div className="space-y-6">
      {/* Summary stat cards -- click to toggle as a state filter, same as the old chip row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {STAT_CARDS.map(({ key, label, count, Icon, iconIdle, iconActive, ring }) => {
          const active = filterState === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => chipFilter(key)}
              aria-pressed={active}
              className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition-all ${
                active
                  ? `border-transparent bg-surface-bg shadow-xs ring-2 ${ring}`
                  : 'border-border-default bg-surface-bg hover:border-border-strong hover:shadow-xs'
              }`}
            >
              <span className={`shrink-0 flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${active ? iconActive : iconIdle}`}>
                <Icon className="h-4.5 w-4.5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-xl font-bold text-text-primary leading-tight">{count}</span>
                <span className="block text-[11px] font-medium text-text-muted truncate">{label}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Filter toolbar */}
      <div className="flex flex-col lg:flex-row gap-4 lg:items-end justify-between bg-surface-bg p-5 rounded-2xl border border-border-default shadow-xs">
        <div className="flex flex-wrap gap-3 items-end">
          {/* View mode toggle */}
          <div>
            <label className="flex items-center gap-1 text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">
              <LayoutGrid className="h-3 w-3" aria-hidden="true" /> View
            </label>
            <div role="tablist" aria-label="Matrix view mode" className="flex bg-surface-muted rounded-xl p-1 border border-border-default text-xs">
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'needs-action'}
                onClick={() => setViewMode('needs-action')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${viewMode === 'needs-action' ? 'bg-brand-primary text-white shadow-xs' : 'text-text-muted hover:text-text-primary'}`}
              >
                Needs Action
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'full'}
                onClick={() => setViewMode('full')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${viewMode === 'full' ? 'bg-brand-primary text-white shadow-xs' : 'text-text-muted hover:text-text-primary'}`}
              >
                Full Grid
              </button>
            </div>
          </div>
          <div>
            <label htmlFor="filter-requirement" className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Requirement</label>
            <select id="filter-requirement" className={selectClass} value={filterReq} onChange={e => setFilterReq(e.target.value)}>
              <option value="ALL">All Requirements</option>
              {data.requirements.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="filter-state" className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">State</label>
            <select id="filter-state" className={selectClass} value={filterState} onChange={e => setFilterState(e.target.value)}>
              <option value="ALL">All States</option>
              <option value="NOT_STARTED">Not Started</option>
              <option value="IN_REVIEW">In Review</option>
              <option value="RETURNED">Returned</option>
              <option value="APPROVED">Approved</option>
              <option value="OVERDUE">Overdue</option>
            </select>
          </div>
          <div>
            <label htmlFor="filter-approver" className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Approver</label>
            <select id="filter-approver" className={selectClass} value={filterApprover} onChange={e => setFilterApprover(e.target.value)}>
              <option value="ALL">All Approvers</option>
              {approvers.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          {schools.length > 0 && (
            <div>
              <label htmlFor="filter-school" className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">School</label>
              <select id="filter-school" className={selectClass} value={filterSchool} onChange={e => setFilterSchool(e.target.value)}>
                <option value="ALL">All Schools</option>
                {schools.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
          {batches.length > 0 && (
            <div>
              <label htmlFor="filter-batch" className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Batch</label>
              <select id="filter-batch" className={selectClass} value={filterBatch} onChange={e => setFilterBatch(e.target.value)}>
                <option value="ALL">All Batches</option>
                {batches.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          )}
        </div>
        <ColumnPicker selectedKeys={selectedColumns} onChange={handleColumnsChange} />
        <Button
          onClick={handleExport}
          disabled={isExporting}
          variant="outline"
          className="border-brand-primary text-brand-primary hover:bg-brand-primary/5 hover:border-brand-primary hover:text-brand-primary font-semibold gap-1.5"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          {isExporting ? 'Exporting...' : 'Export CSV'}
        </Button>
      </div>

      {/* Matrix */}
      <div className="bg-surface-bg border border-border-default rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Intern requirement completion matrix">
          <table className="w-full text-left text-sm border-collapse">
            <thead className="bg-surface-muted border-b border-border-default text-xs text-text-muted sticky top-0 z-20 shadow-xs">
              <tr>
                <th className="px-4 py-3.5 font-semibold whitespace-nowrap min-w-[200px] border-r border-border-default sticky left-0 z-20 bg-surface-muted">
                  Intern ({filteredInterns.length})
                </th>
                {requirementsToRender.map(req => (
                  <th key={req.id} className="px-4 py-3.5 font-semibold whitespace-nowrap min-w-[140px] text-center border-r border-border-default last:border-0">
                    <div className="truncate w-full" title={req.name}>{req.name}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-default">
              {filteredInterns.map(intern => (
                <tr key={intern.id} className="hover:bg-surface-hover transition-colors align-top">
                  <td className="px-4 py-3.5 border-r border-border-default bg-white sticky left-0 z-10 align-top">
                    <div className="font-medium text-text-primary truncate" title={intern.email}>{intern.email}</div>
                    {(intern.school || intern.batch) && (
                      <div className="text-[10px] text-text-muted truncate">
                        {[intern.school, intern.batch].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </td>
                  {requirementsToRender.map(req => {
                    const sub = data.submissions.find(s => s.intern_id === intern.id && s.requirement_id === req.id);
                    const state = sub ? sub.state : 'NOT_STARTED';
                    const matchesStateFilter =
                      filterState === 'ALL' || (filterState === 'OVERDUE' ? (sub?.isOverdue ?? false) : state === filterState);
                    return (
                      <td key={req.id} className="px-4 py-3.5 text-center border-r border-border-default last:border-0 align-top">
                        {matchesStateFilter ? (
                          <div className="flex flex-col items-center justify-center gap-1">
                            {sub?.id ? (
                              <Link
                                href={`/admin/submissions/${sub.id}`}
                                className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
                                title="View submission record"
                              >
                                <StatusBadge state={state} isOverdue={sub?.isOverdue ?? false} className="hover:opacity-80 transition-opacity" />
                              </Link>
                            ) : (
                              <StatusBadge state={state} isOverdue={sub?.isOverdue ?? false} />
                            )}
                            {sub?.current_holder_email && (
                              <span className="text-[10px] text-text-muted max-w-full truncate block" title={sub.current_holder_email}>
                                Holder: {sub.current_holder_email.split('@')[0]}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-border-strong" aria-hidden="true">&mdash;</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {filteredInterns.length === 0 && (
                <tr>
                  <td colSpan={requirementsToRender.length + 1} className="py-10 text-center text-text-muted">
                    <div className="space-y-1">
                      <p className="font-semibold text-text-primary text-sm">
                        {viewMode === 'needs-action' ? 'Nothing needs action right now' : 'No interns found'}
                      </p>
                      <p className="text-xs">
                        {viewMode === 'needs-action'
                          ? 'Switch to Full Grid to see everything.'
                          : 'No interns match the current filters.'}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
