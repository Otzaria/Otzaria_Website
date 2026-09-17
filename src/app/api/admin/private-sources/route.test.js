import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}));

vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }));

vi.mock('@/models/PrivateBookSource', () => ({
  default: {
    find: vi.fn(() => ({ lean: () => Promise.resolve([]) })),
  },
}));

vi.mock('@/lib/private-sources', () => ({
  getMoreBooksList: vi.fn().mockResolvedValue([]),
  loadOptionConfigs: vi.fn().mockResolvedValue({}),
  loadManualSets: vi.fn().mockResolvedValue({}),
  pathToBookTitle: (p) => p,
  DEFAULT_STATUS_KEY: 'pending',
}));

vi.mock('@/lib/private-sources-sets', () => ({
  buildSourceEntries: vi.fn(() => ({ entries: [], setPaths: [] })),
}));

import { getServerSession } from 'next-auth';
import { GET } from './route';

function makeRequest(url = 'http://localhost/api/admin/private-sources') {
  return { url };
}

describe('GET /api/admin/private-sources — auth via requireAccess', () => {
  beforeEach(() => {
    vi.mocked(getServerSession).mockReset();
  });

  it('returns 401 when there is no session at all', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    const res = await GET(makeRequest());
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.error).toBeTruthy();
  });

  it('returns 403 when the session belongs to a non-admin user', async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { role: 'admin_books' } });

    const res = await GET(makeRequest());
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toBeTruthy();
  });

  it('allows a general admin through', async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { role: 'admin' } });

    const res = await GET(makeRequest());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
  });
});
