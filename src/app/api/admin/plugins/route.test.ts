// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({ find: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn().mockResolvedValue({ user: { id: "a", role: "admin" } }) }));
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));
vi.mock("@/lib/db", () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/models/Plugin", () => ({ default: { find: m.find } }));

import { GET } from "./route";

beforeEach(() => {
  m.find.mockReset();
  const cursor = { sort: () => cursor, populate: () => cursor, select: () => cursor, lean: async () => [] };
  m.find.mockReturnValue(cursor);
});

const get = (status: string) => GET(new Request(`https://otzaria.org/api/admin/plugins?status=${status}`));

describe("GET /api/admin/plugins", () => {
  it("the pending list leaves service plugins to their own queue", async () => {
    expect((await get("pending")).status).toBe(200);
    expect(m.find).toHaveBeenCalledWith({
      isHidden: false,
      hasService: { $ne: true },
      $or: [{ isApproved: false }, { pendingUpdate: { $ne: null } }],
    });
  });

  it("the approved list is unchanged and includes service plugins", async () => {
    await get("approved");
    expect(m.find).toHaveBeenCalledWith({ isHidden: false, isApproved: true });
  });
});
