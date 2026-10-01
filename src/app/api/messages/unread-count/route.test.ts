import { describe, it, expect, vi, beforeEach } from "vitest";

const { countDocumentsMock } = vi.hoisted(() => ({
  countDocumentsMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));

vi.mock("@/models/Message", () => ({
  default: { countDocuments: countDocumentsMock },
}));

import { getServerSession } from "next-auth";
import { ADMIN_UNREAD_MESSAGES_FILTER } from "@/lib/adminMessages";
import { GET } from "./route";

const sessionMock = getServerSession as unknown as ReturnType<typeof vi.fn>;

describe("GET /api/messages/unread-count", () => {
  beforeEach(() => {
    countDocumentsMock.mockReset();
    sessionMock.mockReset();
  });

  it("returns 401 without a session", async () => {
    sessionMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(countDocumentsMock).not.toHaveBeenCalled();
  });

  it("returns 403 for a regular user", async () => {
    sessionMock.mockResolvedValue({ user: { _id: "u1", role: "user" } });
    const res = await GET();
    expect(res.status).toBe(403);
    expect(countDocumentsMock).not.toHaveBeenCalled();
  });

  it("counts unread non-system messages for an admin", async () => {
    sessionMock.mockResolvedValue({ user: { _id: "a1", role: "admin_plugins" } });
    countDocumentsMock.mockResolvedValue(7);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, count: 7 });
    expect(countDocumentsMock).toHaveBeenCalledWith(ADMIN_UNREAD_MESSAGES_FILTER);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("the filter matches exactly what the full list marks as unread", () => {
    // status==='unread' ב-getAdminMessagesList הוא !msg.isRead על כל הודעה שאינה system
    expect(ADMIN_UNREAD_MESSAGES_FILTER).toEqual({
      messageType: { $ne: "system" },
      isRead: { $ne: true },
    });
  });
});
