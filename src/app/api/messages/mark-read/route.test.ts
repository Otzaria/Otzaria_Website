import { describe, it, expect, vi, beforeEach } from "vitest";

const { revalidateTagMock, findOneMock, findByIdAndUpdateMock, hasAnyAdminAccessMock } = vi.hoisted(() => ({
  revalidateTagMock: vi.fn(),
  findOneMock: vi.fn(),
  findByIdAndUpdateMock: vi.fn(),
  hasAnyAdminAccessMock: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidateTag: revalidateTagMock,
}));

vi.mock("@/lib/db", () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/roles", () => ({
  hasAnyAdminAccess: hasAnyAdminAccessMock,
}));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));

vi.mock("@/models/Message", () => ({
  default: { findOne: findOneMock, findByIdAndUpdate: findByIdAndUpdateMock },
}));

import { getServerSession } from "next-auth";
import { CACHE_TAGS } from "@/lib/cacheTags";
import { PUT } from "./route";

function makeRequest(body: unknown) {
  return { json: async () => body } as Request;
}

describe("PUT /api/messages/mark-read", () => {
  beforeEach(() => {
    revalidateTagMock.mockClear();
    findOneMock.mockReset();
    findByIdAndUpdateMock.mockReset();
    hasAnyAdminAccessMock.mockReset();
    (getServerSession as unknown as ReturnType<typeof vi.fn>).mockReset();
  });

  it("invalidates the admin messages cache tag after a successful mark-read", async () => {
    (getServerSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { _id: "admin-1", role: "admin" },
    });
    hasAnyAdminAccessMock.mockReturnValue(true);
    findOneMock.mockResolvedValue(null); // לא נמען ישיר, אבל מנהל
    findByIdAndUpdateMock.mockResolvedValue({ _id: "m1", isRead: true });

    const res = await PUT(makeRequest({ messageId: "m1" }));

    expect(res.status).toBe(200);
    expect(findByIdAndUpdateMock).toHaveBeenCalledWith("m1", { isRead: true });
    expect(revalidateTagMock).toHaveBeenCalledWith(CACHE_TAGS.MESSAGES_ADMIN_LIST, { expire: 0 });
  });

  it("does not invalidate the cache when the request is rejected (not a participant, not admin)", async () => {
    (getServerSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { _id: "user-1", role: "user" },
    });
    hasAnyAdminAccessMock.mockReturnValue(false);
    findOneMock.mockResolvedValue(null);

    const res = await PUT(makeRequest({ messageId: "m1" }));

    expect(res.status).toBe(403);
    expect(findByIdAndUpdateMock).not.toHaveBeenCalled();
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it("does not invalidate the cache when there is no session", async () => {
    (getServerSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await PUT(makeRequest({ messageId: "m1" }));

    expect(res.status).toBe(401);
    expect(findByIdAndUpdateMock).not.toHaveBeenCalled();
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });
});
