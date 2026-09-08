import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
import JSZip from 'jszip';

type Row = Record<string, unknown>;

let submissionRows: Row[] = [];
let mockUser: { id: string; email: string } | null = { id: 'intern-1', email: 'intern@example.com' };
const storageFiles: Record<string, Buffer> = {};

function hashOf(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/* eslint-disable @typescript-eslint/no-unused-vars */
const auditInsert = vi.fn(async (_row: Row) => ({ error: null }));

function makeStorageBucket() {
  return {
    download: async (path: string) => {
      const buf = storageFiles[path];
      if (!buf) return { data: null, error: new Error('not found') };
      return {
        data: { arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) },
        error: null,
      };
    },
  };
}

vi.mock('../lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => (mockUser ? { data: { user: mockUser }, error: null } : { data: { user: null }, error: new Error('no session') }) },
    storage: { from: () => makeStorageBucket() },
  }),
}));

vi.mock('../lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'submissions') {
        return { select: () => ({ eq: () => ({ eq: async () => ({ data: submissionRows, error: null }) }) }) };
      }
      if (table === 'audit_log') {
        return { insert: auditInsert };
      }
      throw new Error(`Unexpected admin table in test: ${table}`);
    },
    storage: { from: () => makeStorageBucket() },
  }),
}));

import { GET } from '../src/app/api/intern/export-approved/route';

beforeEach(() => {
  vi.clearAllMocks();
  submissionRows = [];
  mockUser = { id: 'intern-1', email: 'intern@example.com' };
  for (const k of Object.keys(storageFiles)) delete storageFiles[k];
});

function approvedSubmission(id: string, reqName: string, filePath: string, buf: Buffer, hash?: string) {
  storageFiles[filePath] = buf;
  return {
    id,
    requirements: { name: reqName },
    approvals: [{ step: 1, created_at: '2026-01-01T00:00:00Z', signed_pdf_url: filePath, file_hash: hash ?? hashOf(buf) }],
  };
}

describe('GET /api/intern/export-approved', () => {
  it('returns a zip with one entry per approved document', async () => {
    submissionRows = [
      approvedSubmission('sub-1', 'DTR', 'sub-1/signed.pdf', Buffer.from('pdf-bytes-1')),
      approvedSubmission('sub-2', 'Waiver', 'sub-2/signed.pdf', Buffer.from('pdf-bytes-2')),
    ];

    const res = await GET();

    expect(res.status).toBe(200);
    const zip = await JSZip.loadAsync(await res.arrayBuffer());
    expect(Object.keys(zip.files).sort()).toEqual(['DTR.pdf', 'Waiver.pdf']);
  });

  it('returns 404 when there are no approved documents', async () => {
    submissionRows = [];
    const res = await GET();
    expect(res.status).toBe(404);
  });

  it('skips a file that fails hash verification, keeps the rest, and notes it in _skipped.txt', async () => {
    submissionRows = [
      approvedSubmission('sub-1', 'DTR', 'sub-1/signed.pdf', Buffer.from('good-bytes')),
      approvedSubmission('sub-2', 'Waiver', 'sub-2/signed.pdf', Buffer.from('tampered-bytes'), 'f'.repeat(64)),
    ];

    const res = await GET();

    expect(res.status).toBe(200);
    const zip = await JSZip.loadAsync(await res.arrayBuffer());
    expect(Object.keys(zip.files).sort()).toEqual(['DTR.pdf', '_skipped.txt']);
    const manifest = await zip.files['_skipped.txt'].async('string');
    expect(manifest).toContain('Waiver');

    const tamperEntry = auditInsert.mock.calls.map((c) => c[0] as Row).find((r) => r.action === 'TAMPER_ALERT_HASH_MISMATCH');
    expect(tamperEntry).toBeDefined();
  });

  it('logs one BULK_EXPORT_APPROVED_DOCS audit entry with the file count', async () => {
    submissionRows = [approvedSubmission('sub-1', 'DTR', 'sub-1/signed.pdf', Buffer.from('bytes'))];

    await GET();

    const entry = auditInsert.mock.calls.map((c) => c[0] as Row).find((r) => r.action === 'BULK_EXPORT_APPROVED_DOCS');
    expect(entry).toBeDefined();
    expect((entry!.payload as Row).count).toBe(1);
  });

  it('returns 401 when there is no session', async () => {
    mockUser = null;
    const res = await GET();
    expect(res.status).toBe(401);
  });
});
