import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ session: vi.fn(), create: vi.fn(), connect: vi.fn(), find: vi.fn() }));
vi.mock('next-auth', () => ({ getServerSession: m.session }));
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({ default: m.connect }));
vi.mock('@/models/OcrJob', () => ({ default: { find: m.find } }));
vi.mock('@/lib/ocr/modelTraining', () => ({ createTraining: m.create, trainingView: j => j }));
import { GET, POST } from './route';
const payload = { bookId: 'a'.repeat(24), requestId: 'request-training-1', script: 'rashi', epochs: 4, pageNumbers: [1,2,3,4,5], approved: true };
const post = body => new Request('http://localhost/api/admin/model-training', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('OCR_TRAINING_ENABLED', 'true'); vi.stubEnv('OCR_WORKER_SECRET', 'x'.repeat(64)); vi.stubEnv('OCR_WORKER_ID', 'worker-1');
  m.session.mockResolvedValue({ user: { role: 'admin_ocr', id: 'b'.repeat(24) } });
  m.create.mockResolvedValue({ status: 202, body: { job: { id: 'job' } } });
  m.find.mockReturnValue({ sort: () => ({ limit: () => ({ lean: async () => [] }) }) });
});
describe('admin training job boundary', () => {
  it.each([null, { user: { role: 'user' } }, { user: { role: 'admin_books' } }])('denies non-trainers before reading data: %j', async session => {
    m.session.mockResolvedValue(session);
    expect([401, 403]).toContain((await POST(post(payload))).status);
    expect([401, 403]).toContain((await GET(new Request('http://localhost/api/admin/model-training'))).status);
    expect(m.create).not.toHaveBeenCalled(); expect(m.connect).not.toHaveBeenCalled();
  });
  it('requires an explicit rollout switch for compatibility with old workers', async () => {
    vi.stubEnv('OCR_TRAINING_ENABLED', 'false');
    expect((await POST(post(payload))).status).toBe(503);
    expect(m.create).not.toHaveBeenCalled();
  });
  it('rejects invalid or oversized requests', async () => {
    expect((await POST(post({ ...payload, epochs: 100 }))).status).toBe(400);
    expect((await POST(post({ ...payload, x: 'x'.repeat(5000) }))).status).toBe(413);
    expect(m.create).not.toHaveBeenCalled();
  });
  it('queues an immutable selection under the configured worker', async () => {
    expect((await POST(post(payload))).status).toBe(202);
    expect(m.create).toHaveBeenCalledWith(payload, expect.anything(), 'worker-1');
  });
});
