import { describe, it, expect, vi, beforeEach } from "vitest";

const { getServerSessionMock, findMock } = vi.hoisted(() => ({
  getServerSessionMock: vi.fn(),
  findMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("next-auth", () => ({
  getServerSession: getServerSessionMock,
}));

vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));

vi.mock("@/models/OcrTrainingPage", () => ({
  default: {
    find: findMock,
  },
}));

import { GET } from "./route";

describe("GET /api/admin/ocr-training", () => {
  beforeEach(() => {
    getServerSessionMock.mockReset();
    findMock.mockReset();
    findMock.mockReturnValue({ sort: () => ({ lean: () => Promise.resolve([]) }) });
  });

  it("returns 401 when there is no session at all", async () => {
    getServerSessionMock.mockResolvedValue(null);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "יש להתחבר כדי לבצע פעולה זו" });
  });

  it("returns 403 when the session lacks OCR access", async () => {
    getServerSessionMock.mockResolvedValue({ user: { role: "user" } });

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body).toEqual({ error: "אין הרשאה לבצע פעולה זו" });
  });

  it("returns 200 with the page list for an admin_ocr session", async () => {
    getServerSessionMock.mockResolvedValue({ user: { role: "admin_ocr" } });

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.pages).toEqual([]);
  });
});
