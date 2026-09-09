import { describe, it, expect, vi, beforeEach } from "vitest";

const { getServerSessionMock } = vi.hoisted(() => ({
  getServerSessionMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock("next-auth", () => ({ getServerSession: getServerSessionMock }));
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));
vi.mock("@/models/OcrLayoutPage", () => ({ default: {} }));
vi.mock("@/models/Page", () => ({ default: {} }));

import { POST } from "./route";

function makeRequest() {
  return { arrayBuffer: vi.fn() } as unknown as Request;
}

describe("POST /api/admin/ocr-layout/import", () => {
  beforeEach(() => {
    getServerSessionMock.mockReset();
  });

  it("returns 401 when there is no session at all", async () => {
    getServerSessionMock.mockResolvedValue(null);

    const res = await POST(makeRequest());

    expect(res.status).toBe(401);
  });

  it("returns 403 when the session lacks OCR access", async () => {
    getServerSessionMock.mockResolvedValue({ user: { role: "user" } });

    const res = await POST(makeRequest());

    expect(res.status).toBe(403);
  });
});
