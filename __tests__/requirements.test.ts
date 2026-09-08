import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = Record<string, unknown>;

const insertedRows: Row[] = [];
/* eslint-disable @typescript-eslint/no-unused-vars */
const auditInsert = vi.fn(async (_row: Row) => ({ error: null }));

function makeAdminQueryBuilder(table: string) {
  if (table === 'requirements') {
    return {
      insert: (row: Row) => ({
        select: () => ({
          single: async () => {
            const newRow = { id: 'req-new', ...row };
            insertedRows.push(newRow);
            return { data: newRow, error: null };
          },
        }),
      }),
    };
  }
  if (table === 'audit_log') {
    return { insert: auditInsert };
  }
  throw new Error(`Unexpected admin table in test: ${table}`);
}

vi.mock('../lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (table: string) => makeAdminQueryBuilder(table) }),
}));

vi.mock('../lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'admin-1' } }, error: null }) },
    from: (table: string) => {
      if (table === 'users') {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { role: 'admin' }, error: null }) }) }) };
      }
      throw new Error(`Unexpected user-client table in test: ${table}`);
    },
  }),
}));

// next/headers is already globally mocked in __tests__/setup.ts -- no need to mock it here.

import { createRequirement } from '../lib/data/requirements';

const baseInput = {
  name: 'DTR',
  description: '',
  accepted_types: ['application/pdf'],
  max_size_mb: 20,
  due_date_type: 'relative' as const,
  due_date_value: '30',
  routing_template_id: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  insertedRows.length = 0;
});

describe('createRequirement — custom_reminder_days', () => {
  it('persists a valid custom_reminder_days override', async () => {
    await createRequirement({ ...baseInput, custom_reminder_days: 4 });
    expect(insertedRows[0].custom_reminder_days).toBe(4);
  });

  it('persists null when no override is given', async () => {
    await createRequirement({ ...baseInput, custom_reminder_days: null });
    expect(insertedRows[0].custom_reminder_days).toBeNull();
  });

  it('rejects a value above the 30-day bound', async () => {
    await expect(createRequirement({ ...baseInput, custom_reminder_days: 31 })).rejects.toThrow();
  });

  it('rejects a value below the 1-day bound', async () => {
    await expect(createRequirement({ ...baseInput, custom_reminder_days: 0 })).rejects.toThrow();
  });
});
