import { describe, it, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({ preview: vi.fn(), purge: vi.fn() }));
vi.mock('./route-auth.js', () => ({
  requireSearchFeedbackAccess: async () => ({ ok: true }),
  jsonNoStore: (body, status = 200) => Response.json(body, { status }),
}));
vi.mock('./service.js', () => ({
  buildPurgeFilter: () => ({ ok: true, filter: {} }),
  previewPurge: mocks.preview,
  purgeEvents: mocks.purge,
}));
import { handlePurgeRequest } from './purge-route.js';

describe('administrator purge request safety', () => {
  beforeEach(() => vi.clearAllMocks());

  it('cancels an oversized chunked body before invoking either database operation', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(4097)); }, cancel,
    });
    const request = new Request('http://localhost/purge?dryRun=1', { method: 'POST', body: stream, duplex: 'half' });
    const response = await handlePurgeRequest(request);
    expect(response.status).toBe(400);
    expect((await response.json()).field).toBe('body');
    expect(cancel).toHaveBeenCalledOnce();
    expect(mocks.preview).not.toHaveBeenCalled();
    expect(mocks.purge).not.toHaveBeenCalled();
  });

  it('rejects malformed replacement identifiers before allocating any preview', async () => {
    const response = await handlePurgeRequest(new Request('http://localhost/purge?dryRun=1', {
      method: 'POST', body: JSON.stringify({ all: true, replacePreviewId: { $ne: null } }),
    }));
    expect(response.status).toBe(400);
    expect((await response.json()).field).toBe('replacePreviewId');
    expect(mocks.preview).not.toHaveBeenCalled();
  });

  it('returns a retryable capacity response instead of a server error', async () => {
    mocks.preview.mockRejectedValueOnce(Object.assign(new Error('preview capacity'), { code: 'PURGE_PREVIEWS_BUSY' }));
    const response = await handlePurgeRequest(new Request('http://localhost/purge?dryRun=1', {
      method: 'POST', body: JSON.stringify({ all: true }),
    }));
    expect(response.status).toBe(429);
    expect(mocks.purge).not.toHaveBeenCalled();
  });
});
