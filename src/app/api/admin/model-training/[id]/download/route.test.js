import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ session: vi.fn(), connect: vi.fn(), build: vi.fn() }));
vi.mock('next-auth', () => ({ getServerSession: m.session }));
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({ default: m.connect }));
vi.mock('@/lib/ocr/modelTrainingDownload', () => ({ buildTrainingDownload: m.build }));
import { GET } from './route';
const id = 'c'.repeat(24);
const get = (jobId = id) => GET(new Request(`http://localhost/api/admin/model-training/${jobId}/download`), { params: Promise.resolve({ id: jobId }) });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('OCR_TRAINING_ENABLED', 'false');
  m.session.mockResolvedValue({ user: { role: 'admin_ocr', id: 'b'.repeat(24) } });
  m.build.mockResolvedValue({ ok: true, stream: new ReadableStream({ start(c) { c.enqueue(new Uint8Array([80, 75, 5, 6])); c.close(); } }), jobId: id });
});
describe('admin download of the five corrected training pages', () => {
  it.each([null, { user: { role: 'user' } }, { user: { role: 'admin_books' } }, { user: { role: 'admin_books_only' } }])('denies anyone without OCR access before reading data: %j', async session => {
    m.session.mockResolvedValue(session);
    expect([401, 403]).toContain((await get()).status);
    expect(m.connect).not.toHaveBeenCalled(); expect(m.build).not.toHaveBeenCalled();
  });
  it('rejects a malformed job id', async () => {
    expect((await get('../../etc')).status).toBe(400);
    expect(m.build).not.toHaveBeenCalled();
  });
  it('serves a private attachment with an ASCII name, independently of the remote-training switch', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(m.build).toHaveBeenCalledWith(id);
    expect(res.headers.get('content-type')).toBe('application/zip');
    expect(res.headers.get('content-length')).toBeNull();
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(res.headers.get('content-disposition')).toBe(`attachment; filename="training-pages-${id}.zip"`);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([80, 75, 5, 6]));
  });
  it('passes through a missing or purged archive as a Hebrew JSON error, and hides internal failures', async () => {
    m.build.mockResolvedValue({ ok: false, status: 410, error: 'נמחק' });
    const gone = await get();
    expect(gone.status).toBe(410); expect(await gone.json()).toEqual({ error: 'נמחק' });
    m.build.mockRejectedValue(new Error('disk exploded at /secret/path'));
    const broken = await get();
    expect(broken.status).toBe(500); expect(JSON.stringify(await broken.json())).not.toContain('secret');
  });
});
