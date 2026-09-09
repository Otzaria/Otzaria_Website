import { describe, it, expect, vi, beforeEach } from "vitest";

const { getServerSessionMock, findMock, countDocumentsMock, aggregateMock, distinctMock } = vi.hoisted(() => ({
  getServerSessionMock: vi.fn(),
  findMock: vi.fn(),
  countDocumentsMock: vi.fn(),
  aggregateMock: vi.fn(),
  distinctMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("next-auth", () => ({
  getServerSession: getServerSessionMock,
}));

vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));

vi.mock("@/models/OcrLayoutPage", () => ({
  default: {
    find: findMock,
    countDocuments: countDocumentsMock,
    aggregate: aggregateMock,
    distinct: distinctMock,
  },
}));

import { GET } from "./route";

function makeRequest(url = "http://localhost/api/admin/ocr-layout") {
  return { url } as Request;
}

describe("GET /api/admin/ocr-layout", () => {
  beforeEach(() => {
    getServerSessionMock.mockReset();
    findMock.mockReset();
    countDocumentsMock.mockReset();
    aggregateMock.mockReset();
    distinctMock.mockReset();
    findMock.mockReturnValue({
      sort: () => ({ skip: () => ({ limit: () => ({ lean: () => Promise.resolve([]) }) }) }),
    });
    countDocumentsMock.mockResolvedValue(0);
    aggregateMock.mockResolvedValue([]);
    distinctMock.mockResolvedValue([]);
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

  it("returns 200 with the page list for an admin_ocr session", async () => {
    getServerSessionMock.mockResolvedValue({ user: { role: "admin_ocr" } });

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });
});
