import { describe, it, expect, vi, beforeEach } from "vitest";

const { revalidateTagMock, findOneAndUpdateMock, findByIdMock } = vi.hoisted(() => ({
  revalidateTagMock: vi.fn(),
  findOneAndUpdateMock: vi.fn(),
  findByIdMock: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidateTag: revalidateTagMock,
}));

vi.mock("@/lib/db", () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn().mockResolvedValue({
    user: { id: "507f1f77bcf86cd799439011", name: "משתמש", role: "user", isVerified: true },
  }),
}));

vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));

vi.mock("@/lib/roles", () => ({
  hasBookLibraryAccess: () => false,
}));

vi.mock("@/models/OcrTrainingPage", () => ({
  default: {
    findOneAndUpdate: findOneAndUpdateMock,
    findById: findByIdMock,
  },
}));

import { CACHE_TAGS } from "@/lib/cacheTags";
import { POST } from "./route";

function makeRequest() {
  return {} as Request;
}

describe("POST /api/ocr-training/[id]/claim", () => {
  beforeEach(() => {
    revalidateTagMock.mockClear();
    findOneAndUpdateMock.mockReset();
    findByIdMock.mockReset();
  });

  it("invalidates the OCR training list cache tag after a successful claim", async () => {
    findOneAndUpdateMock.mockResolvedValue({ _id: "p1", status: "in-progress" });

    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "p1" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(revalidateTagMock).toHaveBeenCalledWith(CACHE_TAGS.OCR_TRAINING_LIST, { expire: 0 });
  });

  it("does not invalidate the cache when the page is already claimed by someone else", async () => {
    findOneAndUpdateMock.mockResolvedValue(null);
    findByIdMock.mockReturnValue({
      select: vi.fn().mockResolvedValue({ _id: "p1", claimedBy: "someone-else" }),
    });

    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "p1" }) });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.success).toBe(false);
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });
});
