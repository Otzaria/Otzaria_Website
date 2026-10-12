// @vitest-environment node
import { createHash } from "node:crypto";
import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  findById: vi.fn(),
  updateOne: vi.fn(),
  readPluginAsset: vi.fn(),
  readVersionAsset: vi.fn(),
  revalidateNow: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn().mockResolvedValue(null) }));
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));
vi.mock("@/lib/db", () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/models/Plugin", () => ({ default: { findById: m.findById, updateOne: m.updateOne } }));
vi.mock("@/models/PluginInstallToken", () => ({ default: { updateOne: vi.fn() } }));
vi.mock("@/lib/cacheTags", () => ({ CACHE_TAGS: { PLUGINS_PUBLIC: "plugins" }, revalidateNow: m.revalidateNow }));
vi.mock("@/lib/pluginSearchIndex", () => ({ invalidatePluginSearchIndex: m.invalidate }));
vi.mock("@/lib/pluginStorage", () => ({
  PLUGIN_FILE_BASENAME: "plugin",
  readPluginAsset: m.readPluginAsset,
  readVersionAsset: m.readVersionAsset,
  pluginFileSha256: (buf: Buffer) => createHash("sha256").update(buf).digest("hex"),
}));

import { GET } from "./route";

const ID = "0123456789abcdef01234567";
const LIVE = Buffer.from("live build");
const OLD = Buffer.from("old build");
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

let plugin: Record<string, unknown>;

function get(query = "", id = ID) {
  return GET(new Request(`https://otzaria.org/api/plugins/${id}/download${query}`), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  plugin = {
    _id: ID,
    version: "2.0.0",
    isApproved: true,
    pluginFileName: "p.otzplugin",
    pluginFileExt: ".otzplugin",
    pluginFileSha256: sha(LIVE),
    versions: [{ version: "1.0.0", pluginFileExt: ".otzplugin", pluginFileSha256: sha(OLD) }],
    incrementDownload: vi.fn().mockResolvedValue(undefined),
  };
  m.findById.mockResolvedValue(plugin);
  m.updateOne.mockResolvedValue({ modifiedCount: 1 });
  m.readPluginAsset.mockResolvedValue(LIVE);
  m.readVersionAsset.mockResolvedValue(OLD);
});

describe("GET /api/plugins/[id]/download?version=", () => {
  it("serves exactly the requested archived version", async () => {
    const res = await get("?version=1.0.0");
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Plugin-Version")).toBe("1.0.0");
    expect(m.readVersionAsset).toHaveBeenCalledWith(ID, "1.0.0", "plugin.otzplugin");
    expect(Buffer.from(await res.arrayBuffer()).equals(OLD)).toBe(true);
  });

  it("serves the live file when the requested version is the live one", async () => {
    const res = await get("?version=2.0.0");
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Plugin-Version")).toBe("2.0.0");
    expect(m.readVersionAsset).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown or empty version", async () => {
    expect((await get("?version=9.9.9")).status).toBe(404);
    expect((await get("?version=")).status).toBe(404);
    expect(m.readPluginAsset).not.toHaveBeenCalled();
    expect(m.readVersionAsset).not.toHaveBeenCalled();
  });

  it("rejects combining version with appVersion, pending or @version", async () => {
    expect((await get("?version=1.0.0&appVersion=0.9.96")).status).toBe(400);
    expect((await get("?version=1.0.0&pending=1")).status).toBe(400);
    expect((await get("?version=1.0.0", `${ID}@1.0.0`)).status).toBe(400);
  });

  it("leaves the live URL unchanged", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Plugin-Version")).toBe("2.0.0");
  });
});

describe("lazy sha256 for files uploaded before hashing", () => {
  it("does not write when the live file already has a hash", async () => {
    await get();
    expect(m.updateOne).not.toHaveBeenCalled();
  });

  it("stores the live file hash on first download, only if still missing", async () => {
    plugin.pluginFileSha256 = null;
    expect((await get()).status).toBe(200);
    expect(m.updateOne).toHaveBeenCalledWith(
      { _id: ID, version: "2.0.0", pluginFileSha256: null },
      { $set: { pluginFileSha256: sha(LIVE) } },
    );
    expect(m.revalidateNow).toHaveBeenCalledWith("plugins");
    expect(m.invalidate).toHaveBeenCalled();
  });

  it("stores an archived version hash on its first download", async () => {
    (plugin.versions as Record<string, unknown>[])[0].pluginFileSha256 = null;
    expect((await get("?version=1.0.0")).status).toBe(200);
    expect(m.updateOne).toHaveBeenCalledWith(
      { _id: ID, versions: { $elemMatch: { version: "1.0.0", pluginFileSha256: null } } },
      { $set: { "versions.$.pluginFileSha256": sha(OLD) } },
    );
  });

  it("still serves the file when storing the hash fails", async () => {
    plugin.pluginFileSha256 = null;
    m.updateOne.mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await get()).status).toBe(200);
    expect(m.revalidateNow).not.toHaveBeenCalled();
  });
});
