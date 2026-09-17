import crypto from "crypto";
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

const { revalidateTagMock } = vi.hoisted(() => ({
  revalidateTagMock: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidateTag: revalidateTagMock,
}));

import { WIKI_CACHE_TAG } from "@/lib/wiki";
import { POST } from "./route";

const SECRET = "test-secret";

function sign(body: string) {
  return `sha256=${crypto.createHmac("sha256", SECRET).update(body).digest("hex")}`;
}

function makeRequest(body: string, { signature = sign(body), event = "gollum" }: { signature?: string; event?: string } = {}) {
  return {
    text: async () => body,
    headers: new Map([
      ["x-hub-signature-256", signature],
      ["x-github-event", event],
    ]),
  } as unknown as Request;
}

describe("POST /api/revalidate-wiki", () => {
  const originalSecret = process.env.WIKI_REVALIDATE_SECRET;

  beforeEach(() => {
    revalidateTagMock.mockClear();
    process.env.WIKI_REVALIDATE_SECRET = SECRET;
  });

  afterAll(() => {
    process.env.WIKI_REVALIDATE_SECRET = originalSecret;
  });

  it("invalidates the wiki cache tag immediately (expire: 0), not with stale-while-revalidate", async () => {
    const body = JSON.stringify({ pages: [{ page_name: "Foo" }] });
    const res = await POST(makeRequest(body));

    expect(res.status).toBe(200);
    expect(revalidateTagMock).toHaveBeenCalledWith(WIKI_CACHE_TAG, { expire: 0 });
  });

  it("rejects requests with an invalid signature without revalidating", async () => {
    const body = JSON.stringify({ pages: [] });
    const res = await POST(makeRequest(body, { signature: "sha256=deadbeef" }));

    expect(res.status).toBe(401);
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it("acknowledges non-gollum events without revalidating", async () => {
    const body = JSON.stringify({ zen: "ping" });
    const res = await POST(makeRequest(body, { event: "ping" }));

    expect(res.status).toBe(200);
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });
});
