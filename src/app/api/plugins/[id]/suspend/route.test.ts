import { describe, it, expect, vi, beforeEach } from "vitest";

const { revalidateTagMock, invalidateIndexMock, findByIdMock } = vi.hoisted(() => ({
  revalidateTagMock: vi.fn(),
  invalidateIndexMock: vi.fn(),
  findByIdMock: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidateTag: revalidateTagMock,
}));

vi.mock("@/lib/db", () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/pluginSearchIndex", () => ({
  invalidatePluginSearchIndex: invalidateIndexMock,
}));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn().mockResolvedValue({ user: { id: "owner-1", role: "user" } }),
}));

vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));

vi.mock("@/models/Plugin", () => ({
  default: { findById: findByIdMock },
}));

import { CACHE_TAGS } from "@/lib/cacheTags";
import { PATCH } from "./route";

function makeRequest(body: unknown) {
  return { json: async () => body } as Request;
}

describe("PATCH /api/plugins/[id]/suspend", () => {
  beforeEach(() => {
    revalidateTagMock.mockClear();
    invalidateIndexMock.mockClear();
    findByIdMock.mockReset();
  });

  it("invalidates the public plugins cache tag after a successful suspend", async () => {
    const plugin = {
      _id: "p1",
      authorId: { toString: () => "owner-1" },
      isApproved: true,
      isSuspended: false,
      isHidden: false,
      save: vi.fn().mockResolvedValue(undefined),
    };
    findByIdMock.mockResolvedValue(plugin);

    const res = await PATCH(makeRequest({ action: "suspend" }), { params: Promise.resolve({ id: "p1" }) });

    expect(res.status).toBe(200);
    expect(plugin.save).toHaveBeenCalled();
    expect(revalidateTagMock).toHaveBeenCalledWith(CACHE_TAGS.PLUGINS_PUBLIC);
  });

  it("does not invalidate the cache when the request is rejected (not the owner)", async () => {
    const plugin = {
      _id: "p1",
      authorId: { toString: () => "someone-else" },
      isApproved: true,
      isSuspended: false,
      isHidden: false,
      save: vi.fn(),
    };
    findByIdMock.mockResolvedValue(plugin);

    const res = await PATCH(makeRequest({ action: "suspend" }), { params: Promise.resolve({ id: "p1" }) });

    expect(res.status).toBe(403);
    expect(plugin.save).not.toHaveBeenCalled();
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });
});
