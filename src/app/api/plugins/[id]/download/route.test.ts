// @vitest-environment node
import { createHash } from "node:crypto";
import { mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const m = vi.hoisted(() => ({
  findById: vi.fn(),
  updateOne: vi.fn(),
  openPluginAsset: vi.fn(),
  openVersionAsset: vi.fn(),
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
  openPluginAsset: m.openPluginAsset,
  openVersionAsset: m.openVersionAsset,
}));

import { GET, HEAD } from "./route";

const ID = "0123456789abcdef01234567";
const LIVE = Buffer.from("live build");
const OLD = Buffer.from("old build");
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

let plugin: Record<string, unknown>;
let directory: string;
const storage = await vi.importActual<typeof import('@/lib/pluginStorage')>('@/lib/pluginStorage');

function get(query = "", id = ID, init?: RequestInit) {
  return GET(new Request(`https://otzaria.org/api/plugins/${id}/download${query}`, init), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'otzaria-plugin-download-'));
  vi.stubEnv('PLUGIN_STORAGE_DIR', directory);
  const live = await storage.ensurePluginDir(ID);
  const old = await storage.ensureVersionDir(ID, "1.0.0");
  await writeFile(join(live, "plugin.otzplugin"), LIVE);
  await writeFile(join(old, "plugin.otzplugin"), OLD);
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
  m.openPluginAsset.mockImplementation(storage.openPluginAsset);
  m.openVersionAsset.mockImplementation(storage.openVersionAsset);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await rm(directory, { force: true, recursive: true });
});

describe("GET /api/plugins/[id]/download?version=", () => {
  it("serves exactly the requested archived version", async () => {
    const res = await get("?version=1.0.0");
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Plugin-Version")).toBe("1.0.0");
    expect(m.openVersionAsset).toHaveBeenCalledWith(ID, "1.0.0", "plugin.otzplugin");
    expect(Buffer.from(await res.arrayBuffer()).equals(OLD)).toBe(true);
  });

  it("serves the live file when the requested version is the live one", async () => {
    const res = await get("?version=2.0.0");
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Plugin-Version")).toBe("2.0.0");
    expect(m.openVersionAsset).not.toHaveBeenCalled();
    await res.body?.cancel();
  });

  it("returns 404 for an unknown or empty version", async () => {
    expect((await get("?version=9.9.9")).status).toBe(404);
    expect((await get("?version=")).status).toBe(404);
    expect(m.openPluginAsset).not.toHaveBeenCalled();
    expect(m.openVersionAsset).not.toHaveBeenCalled();
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
    await res.body?.cancel();
  });
});

describe("lazy sha256 for files uploaded before hashing", () => {
  it("does not write when the live file already has a hash", async () => {
    await (await get()).body?.cancel();
    expect(m.updateOne).not.toHaveBeenCalled();
  });

  it("stores the live file hash on first download, only if still missing", async () => {
    plugin.pluginFileSha256 = null;
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(LIVE.toString());
    expect(m.updateOne).toHaveBeenCalledWith(
      { _id: ID, version: "2.0.0", pluginFileSha256: null },
      { $set: { pluginFileSha256: sha(LIVE) } },
    );
    expect(m.revalidateNow).toHaveBeenCalledWith("plugins");
    expect(m.invalidate).toHaveBeenCalled();
  });

  it("stores an archived version hash on its first download", async () => {
    (plugin.versions as Record<string, unknown>[])[0].pluginFileSha256 = null;
    const res = await get("?version=1.0.0");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(OLD.toString());
    expect(m.updateOne).toHaveBeenCalledWith(
      { _id: ID, versions: { $elemMatch: { version: "1.0.0", pluginFileSha256: null } } },
      { $set: { "versions.$.pluginFileSha256": sha(OLD) } },
    );
  });

  it("still serves the file when storing the hash fails", async () => {
    plugin.pluginFileSha256 = null;
    m.updateOne.mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(LIVE.toString());
    expect(m.revalidateNow).not.toHaveBeenCalled();
  });
});


describe('הורדה בחלקים', () => {
  it('ETag תואם ממשיך מההיסט המבוקש ושומר על מונה הורדות אחד', async () => {
    const first = await get();
    const etag = first.headers.get('etag')!;
    expect(first.headers.get('accept-ranges')).toBe('bytes');
    await first.body?.cancel();
    const part = await get('', ID, { headers: { Range: 'bytes=5-', 'If-Range': etag } });
    expect(part.status).toBe(206);
    expect(part.headers.get('Content-Range')).toBe(`bytes 5-${LIVE.length - 1}/${LIVE.length}`);
    expect(part.headers.get('Content-Length')).toBe(String(LIVE.length - 5));
    expect(await part.text()).toBe(LIVE.subarray(5).toString());
    expect(plugin.incrementDownload).toHaveBeenCalledTimes(1);
  });

  it('מוריד מחדש אם החלפת קובץ ביטלה את If-Range', async () => {
    const first = await get();
    const etag = first.headers.get('etag')!;
    const changed = Buffer.from('new  build');
    const target = join(storage.getPluginDir(ID), 'plugin.otzplugin');
    await writeFile(target + '.new', changed);
    await rename(target + '.new', target);
    expect(await first.text()).toBe(LIVE.toString());
    const response = await get('', ID, { headers: { Range: 'bytes=5-', 'If-Range': etag } });
    expect(response.status).toBe(200);
    expect(response.headers.get('etag')).not.toBe(etag);
    expect(await response.text()).toBe(changed.toString());
  });

  it('416 ו-HEAD סוגרים את הקובץ בלי לספור הורדה או לחשב hash', async () => {
    plugin.pluginFileSha256 = null;
    const range = await get('', ID, { headers: { Range: 'bytes=100-' } });
    expect(range.status).toBe(416);
    expect(range.headers.get('Content-Range')).toBe(`bytes */${LIVE.length}`);
    const head = await get('', ID, { method: 'HEAD', headers: { Range: 'bytes=1-' } });
    expect(head.status).toBe(200);
    expect(head.headers.get('Content-Length')).toBe(String(LIVE.length));
    expect(head.body).toBeNull();
    for (const { value } of m.openPluginAsset.mock.results) expect((await value).handle.fd).toBe(-1);
    expect(plugin.incrementDownload).not.toHaveBeenCalled();
    expect(m.updateOne).not.toHaveBeenCalled();
  });

  it('טווח סיומת bytes=-N מחזיר את N הבתים האחרונים', async () => {
    const res = await get('', ID, { headers: { Range: 'bytes=-4' } });
    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Range')).toBe(`bytes ${LIVE.length - 4}-${LIVE.length - 1}/${LIVE.length}`);
    expect(res.headers.get('Content-Length')).toBe('4');
    expect(await res.text()).toBe(LIVE.subarray(-4).toString());
  });

  it('bytes=-0 מחזיר 416 עם Content-Range של הגודל', async () => {
    const res = await get('', ID, { headers: { Range: 'bytes=-0' } });
    expect(res.status).toBe(416);
    expect(res.headers.get('Content-Range')).toBe(`bytes */${LIVE.length}`);
  });

  it('טווחים מרובים מקבלים את הקובץ השלם', async () => {
    const res = await get('', ID, { headers: { Range: 'bytes=0-1,3-4' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Range')).toBeNull();
    expect(await res.text()).toBe(LIVE.toString());
  });

  it('בקשה בלי Range: 200 עם Content-Length וכותרות רגילות', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Length')).toBe(String(LIVE.length));
    expect(res.headers.get('Accept-Ranges')).toBe('bytes');
    expect(res.headers.get('Content-Type')).toBe('application/octet-stream');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Content-Disposition')).toContain('p.otzplugin');
    expect(res.headers.get('X-Plugin-Version')).toBe('2.0.0');
    expect(await res.text()).toBe(LIVE.toString());
  });

  it('ה-HEAD המיוצא רואה method=HEAD: בלי גוף, בלי מונה ובלי hash', async () => {
    plugin.pluginFileSha256 = null;
    const res = await HEAD(new Request(`https://otzaria.org/api/plugins/${ID}/download`, { method: 'HEAD' }), {
      params: Promise.resolve({ id: ID }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Length')).toBe(String(LIVE.length));
    expect(res.body).toBeNull();
    expect(plugin.incrementDownload).not.toHaveBeenCalled();
    expect(m.updateOne).not.toHaveBeenCalled();
  });
});
