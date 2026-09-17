import { describe, it, expect, vi, beforeEach } from "vitest";

const { getServerSessionMock, findMock } = vi.hoisted(() => ({
  getServerSessionMock: vi.fn(),
  findMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock("next-auth", () => ({ getServerSession: getServerSessionMock }));
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));
vi.mock("@/models/OcrTrainingPage", () => ({ default: { find: findMock } }));

import { GET } from "./route";

function makeRequest(url = "http://localhost/api/admin/ocr-training/export") {
  return { url } as Request;
}

describe("GET /api/admin/ocr-training/export", () => {
  beforeEach(() => {
    getServerSessionMock.mockReset();
    findMock.mockReset();
  });

  it("returns 401 when there is no session at all", async () => {
    getServerSessionMock.mockResolvedValue(null);

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
    expect(findMock).not.toHaveBeenCalled();
  });

  it("returns 403 when the session lacks OCR access", async () => {
    getServerSessionMock.mockResolvedValue({ user: { role: "user" } });

    const res = await GET(makeRequest());

    expect(res.status).toBe(403);
    expect(findMock).not.toHaveBeenCalled();
  });
});
