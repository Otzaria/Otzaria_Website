import { describe, it, expect, vi } from "vitest";

const { revalidateTagMock } = vi.hoisted(() => ({ revalidateTagMock: vi.fn() }));

vi.mock("next/cache", () => ({
  revalidateTag: revalidateTagMock,
}));

import { revalidateNow } from "./cacheTags";

describe("revalidateNow", () => {
  it("calls revalidateTag with { expire: 0 } for immediate expiration, not the 'max' stale-while-revalidate profile", () => {
    revalidateNow("some-tag");
    expect(revalidateTagMock).toHaveBeenCalledWith("some-tag", { expire: 0 });
    expect(revalidateTagMock).not.toHaveBeenCalledWith("some-tag", "max");
  });
});
