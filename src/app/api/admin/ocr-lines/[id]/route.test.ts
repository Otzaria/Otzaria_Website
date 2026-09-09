import { describe, it, expect, vi, beforeEach } from "vitest";

const { getServerSessionMock } = vi.hoisted(() => ({
  getServerSessionMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock("next-auth", () => ({ getServerSession: getServerSessionMock }));
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));
vi.mock("@/models/OcrLine", () => ({ default: {} }));

import { PATCH, DELETE } from "./route";

function makeRequest() {
  return { json: vi.fn() } as unknown as Request;
}

function makeParams() {
  return { params: Promise.resolve({ id: "l1" }) };
}

describe("PATCH /api/admin/ocr-lines/[id]", () => {
  beforeEach(() => {
    getServerSessionMock.mockReset();
  });

  it("returns 401 when there is no session at all", async () => {
    getServerSessionMock.mockResolvedValue(null);

    const res = await PATCH(makeRequest(), makeParams());

    expect(res.status).toBe(401);
  });

  it("returns 403 when the session lacks OCR access", async () => {
    getServerSessionMock.mockResolvedValue({ user: { role: "user" } });

    const res = await PATCH(makeRequest(), makeParams());

    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/admin/ocr-lines/[id]", () => {
  beforeEach(() => {
    getServerSessionMock.mockReset();
  });

  it("returns 401 when there is no session at all", async () => {
    getServerSessionMock.mockResolvedValue(null);

    const res = await DELETE(makeRequest(), makeParams());

    expect(res.status).toBe(401);
  });

  it("returns 403 when the session lacks OCR access", async () => {
    getServerSessionMock.mockResolvedValue({ user: { role: "user" } });

    const res = await DELETE(makeRequest(), makeParams());

    expect(res.status).toBe(403);
  });
});
