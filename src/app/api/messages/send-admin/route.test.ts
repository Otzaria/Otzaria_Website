import { describe, it, expect, vi, beforeEach } from "vitest";

const { revalidateTagMock, createMock, insertManyMock, userFindMock, hasAnyAdminAccessMock } = vi.hoisted(() => ({
  revalidateTagMock: vi.fn(),
  createMock: vi.fn(),
  insertManyMock: vi.fn(),
  userFindMock: vi.fn(),
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
  ALL_ADMIN_ROLES: ["admin"],
}));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));

vi.mock("@/models/Message", () => ({
  default: { create: createMock, insertMany: insertManyMock },
}));

vi.mock("@/models/User", () => ({
  default: { find: userFindMock },
}));

import { getServerSession } from "next-auth";
import { CACHE_TAGS } from "@/lib/cacheTags";
import { POST } from "./route";

const ADMIN_ID = "507f1f77bcf86cd799439011";
const RECIPIENT_ID = "507f1f77bcf86cd799439012";

function makeRequest(body: unknown) {
  return { json: async () => body } as Request;
}

describe("POST /api/messages/send-admin", () => {
  beforeEach(() => {
    revalidateTagMock.mockClear();
    createMock.mockReset();
    insertManyMock.mockReset();
    userFindMock.mockReset();
    hasAnyAdminAccessMock.mockReset();
    (getServerSession as unknown as ReturnType<typeof vi.fn>).mockReset();
  });

  it("sends to one recipient and invalidates the admin messages cache tag", async () => {
    (getServerSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { _id: ADMIN_ID, role: "admin" },
    });
    hasAnyAdminAccessMock.mockReturnValue(true);
    createMock.mockResolvedValue({ _id: "m1" });

    const res = await POST(makeRequest({ recipientId: RECIPIENT_ID, subject: "s", message: "m" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(createMock).toHaveBeenCalled();
    expect(revalidateTagMock).toHaveBeenCalledWith(CACHE_TAGS.MESSAGES_ADMIN_LIST, { expire: 0 });
  });

  it("returns 400 when recipientId is missing and sendToAll is false", async () => {
    (getServerSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { _id: ADMIN_ID, role: "admin" },
    });
    hasAnyAdminAccessMock.mockReturnValue(true);

    const res = await POST(makeRequest({ subject: "s", message: "m" }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(typeof data.error).toBe("string");
    expect(createMock).not.toHaveBeenCalled();
  });

  // רגרסיה: requireAccess מבחין בין "אין session בכלל" (401) לבין "יש session
  // אבל אין הרשאה" (403) — לפני השינוי הראוט החזיר תמיד 403.
  it("returns 401 (not 403) when there is no session at all", async () => {
    (getServerSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    hasAnyAdminAccessMock.mockReturnValue(false);

    const res = await POST(makeRequest({ recipientId: RECIPIENT_ID, subject: "s", message: "m" }));
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(typeof data.error).toBe("string");
    expect(createMock).not.toHaveBeenCalled();
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it("returns 403 when there is a session but the role lacks admin access", async () => {
    (getServerSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { _id: RECIPIENT_ID, role: "user" },
    });
    hasAnyAdminAccessMock.mockReturnValue(false);

    const res = await POST(makeRequest({ recipientId: RECIPIENT_ID, subject: "s", message: "m" }));
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(typeof data.error).toBe("string");
    expect(createMock).not.toHaveBeenCalled();
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });
});
