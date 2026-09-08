import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * FR-19: three defects fixed together (see FixesToWorkOn-InternDocs.rtf).
 *
 * 1. Admin escalation must fire past 5 working days, independent of the step's own SLA
 *    (was `waitingDays > sla + 5`, so a default sla=2 pushed the real threshold to 7).
 * 2. The SLA clock must measure from when the item entered its current step, not from
 *    `updated_at` -- which bumps on unrelated writes like a reassignment.
 * 3. The "max 1 reminder per item per day" dedup guard must throttle the approver
 *    digest only, not suppress the admin escalation for the same item.
 */

type Row = Record<string, unknown>;

// Arg types are declared so `mock.calls[0][0]` stays typed under `tsc --noEmit`; vitest
// itself does not typecheck, so an untyped vi.fn() passes the suite but fails the build.
/* eslint-disable @typescript-eslint/no-unused-vars */
const { sendEmailWithRetry, notificationsInsert } = vi.hoisted(() => ({
  sendEmailWithRetry: vi.fn(async (_to: string, _subject: string, _html: string, _retries?: number) => ({ success: true })),
  notificationsInsert: vi.fn(async (_rows: Row[]) => ({ error: null })),
}));

let submissionRows: unknown[] = [];
let todayNotificationSubmissionIds: string[] = [];
const approverEmails: Record<string, string> = { 'approver-1': 'approver1@example.com' };
const adminUsers = [{ email: 'admin@example.com' }];

function makeQueryBuilder(table: string) {
  if (table === 'submissions') {
    return { select: () => ({ eq: async () => ({ data: submissionRows, error: null }) }) };
  }
  if (table === 'notifications') {
    return {
      select: () => ({
        eq: () => ({
          gte: async () => ({
            data: todayNotificationSubmissionIds.map((id) => ({ payload: { submission_id: id } })),
            error: null,
          }),
        }),
      }),
      insert: notificationsInsert,
    };
  }
  if (table === 'users') {
    return {
      select: () => ({
        eq: (_col: string, val: string) => ({
          single: async () => ({ data: { email: approverEmails[val] || null }, error: null }),
        }),
        in: async () => ({ data: adminUsers, error: null }),
      }),
    };
  }
  throw new Error(`Unexpected table in test: ${table}`);
}

vi.mock('../lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (table: string) => makeQueryBuilder(table) }),
}));

vi.mock('../lib/email/resend', () => ({ sendEmailWithRetry }));

import { runDailyDigest } from '../lib/jobs/daily-digest';

/** Fixed "now": Wed 2026-01-14, local time, so weekday math in the job is deterministic. */
const NOW = new Date(2026, 0, 14, 12, 0, 0);
/** 6 working days before NOW (Wed 1/7 .. Wed 1/14, skipping the 10th/11th weekend). */
const SIX_WORKING_DAYS_AGO = new Date(2026, 0, 7, 9, 0, 0).toISOString();
/** 8 working days before NOW (Mon 1/5 .. Wed 1/14). */
const EIGHT_WORKING_DAYS_AGO = new Date(2026, 0, 5, 9, 0, 0).toISOString();

function baseSubmission(overrides: Row): Row {
  return {
    id: 'sub-1',
    created_at: EIGHT_WORKING_DAYS_AGO,
    current_step: 1,
    current_holder_id: 'approver-1',
    intern_id: 'intern-1',
    requirements: { id: 'req-1', name: 'DTR', routing_templates: { sla_days: 2 } },
    users: { email: 'intern1@example.com' },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  submissionRows = [];
  todayNotificationSubmissionIds = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe('runDailyDigest — FR-19 threshold, clock, and dedup', () => {
  it('escalates to admin past 5 working days even though that is short of sla(2)+5', async () => {
    submissionRows = [baseSubmission({ current_step_entered_at: SIX_WORKING_DAYS_AGO, updated_at: SIX_WORKING_DAYS_AGO })];

    await runDailyDigest();

    const adminCall = sendEmailWithRetry.mock.calls.find((c) => c[0] === 'admin@example.com');
    expect(adminCall).toBeDefined();
  });

  it('does not escalate an item still within 5 working days', async () => {
    const fourWorkingDaysAgo = new Date(2026, 0, 8, 9, 0, 0).toISOString(); // Thu 1/8 .. Wed 1/14
    submissionRows = [baseSubmission({ current_step_entered_at: fourWorkingDaysAgo, updated_at: fourWorkingDaysAgo })];

    await runDailyDigest();

    expect(sendEmailWithRetry.mock.calls.find((c) => c[0] === 'admin@example.com')).toBeUndefined();
  });

  it('measures the SLA clock from current_step_entered_at, not updated_at bumped by a reassignment', async () => {
    // Entered its step 8 working days ago, but was reassigned moments ago -- updated_at
    // is now. The old implementation would read waitingDays=~1 from updated_at and send
    // nothing at all.
    submissionRows = [
      baseSubmission({
        current_step_entered_at: EIGHT_WORKING_DAYS_AGO,
        updated_at: NOW.toISOString(),
      }),
    ];

    await runDailyDigest();

    expect(sendEmailWithRetry.mock.calls.find((c) => c[0] === 'approver1@example.com')).toBeDefined();
    expect(sendEmailWithRetry.mock.calls.find((c) => c[0] === 'admin@example.com')).toBeDefined();
  });

  it('falls back to created_at when current_step_entered_at is null (pre-migration row)', async () => {
    submissionRows = [
      baseSubmission({ created_at: EIGHT_WORKING_DAYS_AGO, current_step_entered_at: null, updated_at: NOW.toISOString() }),
    ];

    await runDailyDigest();

    expect(sendEmailWithRetry.mock.calls.find((c) => c[0] === 'admin@example.com')).toBeDefined();
  });

  it('still escalates to admin when the approver dedup guard has already fired today for the same item', async () => {
    submissionRows = [baseSubmission({ current_step_entered_at: EIGHT_WORKING_DAYS_AGO, updated_at: EIGHT_WORKING_DAYS_AGO })];
    todayNotificationSubmissionIds = ['sub-1'];

    await runDailyDigest();

    // Approver reminder throttled: no duplicate DAILY_REMINDER notification row.
    expect(notificationsInsert).not.toHaveBeenCalled();
    expect(sendEmailWithRetry.mock.calls.find((c) => c[0] === 'approver1@example.com')).toBeUndefined();
    // Admin escalation must not be suppressed by the same dedup guard.
    expect(sendEmailWithRetry.mock.calls.find((c) => c[0] === 'admin@example.com')).toBeDefined();
  });
});
