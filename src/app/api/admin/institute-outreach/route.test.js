import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}));

vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }));

vi.mock('@/models/InstituteOutreach', () => ({
  default: {
    find: vi.fn(() => ({ sort: () => ({ lean: () => Promise.resolve([]) }) })),
  },
}));

vi.mock('@/models/SystemConfig', () => ({
  default: {
    findOne: vi.fn(() => ({ lean: () => Promise.resolve(null) })),
  },
}));

vi.mock('@/lib/private-sources', () => ({
  loadOptionConfigs: vi.fn().mockResolvedValue({ methods: {} }),
}));

import { getServerSession } from 'next-auth';
import { GET } from './route';

describe('GET /api/admin/institute-outreach — auth via requireAccess', () => {
  beforeEach(() => {
    vi.mocked(getServerSession).mockReset();
  });

  it('returns 401 when there is no session at all', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.error).toBeTruthy();
  });

  it('returns 403 when the session belongs to a non-admin user', async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { role: 'admin_books' } });

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toBeTruthy();
  });

  it('allows a general admin through and returns the outreach list', async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { role: 'admin' } });

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.items)).toBe(true);
  });
});
