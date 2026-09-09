import { describe, it, expect, vi, beforeEach } from "vitest";

const { revalidateTagMock, findByIdAndDeleteMock, hasAnyAdminAccessMock } = vi.hoisted(() => ({
  revalidateTagMock: vi.fn(),
  findByIdAndDeleteMock: vi.fn(),
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
  default: { findByIdAndDelete: findByIdAndDeleteMock },
}));

import { getServerSession } from "next-auth";
import { CACHE_TAGS } from "@/lib/cacheTags";
import { DELETE } from "./route";

function makeRequest(body: unknown) {
  return { json: async () => body } as Request;
}

describe("DELETE /api/messages/delete", () => {
  beforeEach(() => {
    revalidateTagMock.mockClear();
    findByIdAndDeleteMock.mockReset();
    hasAnyAdminAccessMock.mockReset();
    (getServerSession as unknown as ReturnType<typeof vi.fn>).mockReset();
  });

  it("deletes and invalidates the admin messages cache tag for an admin", async () => {
    (getServerSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { _id: "admin-1", role: "admin" },
    });
    hasAnyAdminAccessMock.mockReturnValue(true);
    findByIdAndDeleteMock.mockResolvedValue({ _id: "m1" });

    const res = await DELETE(makeRequest({ messageId: "m1" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(findByIdAndDeleteMock).toHaveBeenCalledWith("m1");
    expect(revalidateTagMock).toHaveBeenCalledWith(CACHE_TAGS.MESSAGES_ADMIN_LIST, { expire: 0 });
  });

  // רגרסיה: requireAccess מבחין בין "אין session בכלל" (401) לבין "יש session
  // אבל אין הרשאה" (403) — לפני השינוי הראוט החזיר תמיד 403, גם כשלא היה session.
  it("returns 401 (not 403) when there is no session at all", async () => {
    (getServerSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    hasAnyAdminAccessMock.mockReturnValue(false);

    const res = await DELETE(makeRequest({ messageId: "m1" }));
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(typeof data.error).toBe("string");
    expect(findByIdAndDeleteMock).not.toHaveBeenCalled();
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it("returns 403 when there is a session but the role lacks admin access", async () => {
    (getServerSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { _id: "user-1", role: "user" },
    });
    hasAnyAdminAccessMock.mockReturnValue(false);

    const res = await DELETE(makeRequest({ messageId: "m1" }));
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(typeof data.error).toBe("string");
    expect(findByIdAndDeleteMock).not.toHaveBeenCalled();
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });
});
