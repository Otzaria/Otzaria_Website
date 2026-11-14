// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  findById: vi.fn(),
  updateOne: vi.fn(),
  readPluginAsset: vi.fn(),
  readVersionAsset: vi.fn(),
  openStream: vi.fn(),
  session: vi.fn(),
  tokenUpdate: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: m.session }));
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));
vi.mock("@/lib/db", () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/models/Plugin", () => ({ default: { findById: m.findById, updateOne: m.updateOne } }));
vi.mock("@/models/PluginInstallToken", () => ({ default: { updateOne: m.tokenUpdate } }));
vi.mock("@/lib/cacheTags", () => ({ CACHE_TAGS: { PLUGINS_PUBLIC: "plugins" }, revalidateNow: vi.fn() }));
vi.mock("@/lib/pluginSearchIndex", () => ({ invalidatePluginSearchIndex: vi.fn() }));
vi.mock("@/lib/pluginStorage", () => ({
  PLUGIN_FILE_BASENAME: "plugin",
  readPluginAsset: m.readPluginAsset,
  readVersionAsset: m.readVersionAsset,
  pluginFileSha256: () => "x",
}));
vi.mock("@/lib/servicePlugins/storage", () => ({ openReviewAssetStream: m.openStream }));

import { GET } from "./route";

const ID = "0123456789abcdef01234567";
const CURRENT = "a".repeat(24);
const OLD = "b".repeat(24);
const BYTES = new TextEncoder().encode("service build");

let plugin: Record<string, unknown>;

function get(query = "", id = ID) {
  return GET(new Request(`https://otzaria.org/api/plugins/${id}/download${query}`), {
    params: Promise.resolve({ id }),
  });
}

function stream() {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(BYTES);
      controller.close();
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.session.mockResolvedValue(null);
  plugin = {
    _id: ID,
    authorId: { toString: () => "owner" },
    hasService: true,
    version: "2.0.0",
    isApproved: true,
    compatibleWith: "0.9.96",
    pluginFileName: "plugin.otzplugin",
    pluginFileExt: ".otzplugin",
    pluginFileSize: BYTES.length,
    pluginFileSha256: "f".repeat(64),
    pendingUpdate: { version: "9.9.9" },
    serviceState: { currentPluginReview: CURRENT },
    versions: [
      { version: "1.5.0", reviewId: OLD, compatibleWith: "0.9.90", maxAppVersion: "0.9.95", pluginFileExt: ".otzplugin" },
      { version: "1.0.0", compatibleWith: "0.9.80", pluginFileExt: ".otzplugin" },
    ],
    incrementDownload: vi.fn().mockResolvedValue(undefined),
  };
  m.findById.mockResolvedValue(plugin);
  m.tokenUpdate.mockResolvedValue({});
  m.openStream.mockImplementation(async () => ({ stream: stream(), size: BYTES.length }));
});

describe("GET /api/plugins/[id]/download for a service plugin", () => {
  it("streams the current file from review storage", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(m.openStream).toHaveBeenCalledWith(CURRENT, "plugin");
    expect(res.headers.get("X-Plugin-Version")).toBe("2.0.0");
    expect(res.headers.get("Content-Length")).toBe(String(BYTES.length));
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(BYTES);
    expect(plugin.incrementDownload).toHaveBeenCalledWith(undefined);
    expect(m.readPluginAsset).not.toHaveBeenCalled();
    expect(m.updateOne).not.toHaveBeenCalled();
  });

  it("keeps install-token marking", async () => {
    await get("?it=abcdefghijklmnopqrstuvwxyz");
    expect(m.tokenUpdate).toHaveBeenCalledWith(
      { token: "abcdefghijklmnopqrstuvwxyz", downloadedAt: null },
      { downloadedAt: expect.any(Date) },
    );
  });

  it("refuses ?pending=1 even for the owner", async () => {
    m.session.mockResolvedValue({ user: { id: "owner", role: "user" } });
    expect((await get("?pending=1")).status).toBe(404);
    expect(m.openStream).not.toHaveBeenCalled();
    expect(m.readPluginAsset).not.toHaveBeenCalled();
  });

  it("serves an explicit historical version only when it has a reviewId", async () => {
    const res = await get("?version=1.5.0");
    expect(res.status).toBe(200);
    expect(m.openStream).toHaveBeenCalledWith(OLD, "plugin");
    expect(res.headers.get("X-Plugin-Version")).toBe("1.5.0");
    expect(plugin.incrementDownload).toHaveBeenCalledWith("1.5.0");

    const legacy = await get("", `${ID}@1.0.0`);
    expect(legacy.status).toBe(404);
    expect((await legacy.json()).error).toBe("Plugin version not found");
    expect(m.readVersionAsset).not.toHaveBeenCalled();
  });

  it("appVersion resolves only to the current version", async () => {
    const ok = await get("?appVersion=0.9.97");
    expect(ok.status).toBe(200);
    expect(ok.headers.get("X-Plugin-Version")).toBe("2.0.0");

    m.openStream.mockClear();
    // לתוסף רגיל 0.9.95 היה בוחר את 1.5.0 ההיסטורית
    const res = await get("?appVersion=0.9.95");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: "No plugin version supports the requested app version",
      appVersion: "0.9.95",
      latestVersion: "2.0.0",
      compatibleWith: "0.9.96",
      maxAppVersion: null,
      minSupportedAppVersion: "0.9.96",
    });
    expect(m.openStream).not.toHaveBeenCalled();
  });

  it("404 when nothing was published yet or the stored file is missing", async () => {
    plugin.serviceState = { currentPluginReview: null };
    expect((await get()).status).toBe(404);
    plugin.serviceState = { currentPluginReview: CURRENT };
    m.openStream.mockResolvedValue(null);
    expect((await get()).status).toBe(404);
    expect(plugin.incrementDownload).not.toHaveBeenCalled();
  });

  it("unapproved service plugins stay hidden from the public", async () => {
    plugin.isApproved = false;
    expect((await get()).status).toBe(404);
    expect(m.openStream).not.toHaveBeenCalled();
  });
});
