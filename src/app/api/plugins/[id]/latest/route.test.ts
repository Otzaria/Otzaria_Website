// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({ findOne: vi.fn(), select: vi.fn() }));

vi.mock("@/lib/db", () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/pluginStore", () => ({ PUBLIC_PLUGIN_FILTER: {} }));
vi.mock("@/models/Plugin", () => ({ default: { findOne: m.findOne } }));

import { GET } from "./route";

const ID = "0123456789abcdef01234567";
const plugin = {
  _id: { toString: () => ID },
  name: "בדיקה",
  slug: "test",
  version: "2.0.0",
  status: "stable",
  compatibleWith: "0.9.96",
  pluginFileExt: ".otzplugin",
  pluginFileSize: 10,
  pluginFileSha256: "a".repeat(64),
  updatedAt: new Date("2026-08-01T00:00:00Z"),
  versions: [{ version: "1.0.0", compatibleWith: "0.9.90", maxAppVersion: "0.9.95", pluginFileExt: ".otzplugin" }],
};

function get(query = "") {
  return GET(new Request(`https://otzaria.org/api/plugins/${ID}/latest${query}`), { params: Promise.resolve({ id: ID }) });
}

beforeEach(() => {
  m.select.mockReset();
  m.select.mockReturnValue({ lean: async () => plugin });
  m.findOne.mockReturnValue({ select: m.select });
});

describe("GET /api/plugins/[id]/latest sha256", () => {
  it("returns the live build hash and selects the field", async () => {
    const body = await (await get()).json();
    expect(body.sha256).toBe("a".repeat(64));
    expect(m.select.mock.calls[0][0]).toContain("pluginFileSha256");
  });

  it("returns null for a selected legacy version without a hash", async () => {
    const body = await (await get("?appVersion=0.9.95")).json();
    expect(body.version).toBe("1.0.0");
    expect(body.sha256).toBeNull();
  });
});
