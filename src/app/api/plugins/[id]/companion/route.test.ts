import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";

const { findByIdMock, getSessionMock, liveAssetPath, versionAssetPath } = vi.hoisted(() => ({
  findByIdMock: vi.fn(),
  getSessionMock: vi.fn(),
  liveAssetPath: { current: "" },
  versionAssetPath: { current: "" },
}));

vi.mock("@/lib/db", () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock("next-auth", () => ({ getServerSession: getSessionMock }));
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));
vi.mock("@/lib/roles", () => ({
  hasPluginsAccess: (role: string) => role === "admin" || role === "admin_plugins",
}));
vi.mock("@/models/Plugin", () => ({ default: { findById: findByIdMock } }));
vi.mock("@/lib/pluginStorage", () => ({
  COMPANION_BASENAME: "companion",
  resolvePluginAssetPath: () => liveAssetPath.current,
  resolveVersionAssetPath: () => versionAssetPath.current,
}));

import { GET } from "./route";

const ID = "0123456789abcdef01234567";
const INSTALLER = Buffer.from("MZ-installer-bytes");

let dir = "";
beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "companion-route-"));
  const live = path.join(dir, "live.exe");
  const archived = path.join(dir, "v1.msi");
  writeFileSync(live, INSTALLER);
  writeFileSync(archived, Buffer.from("old"));
  liveAssetPath.current = live;
  versionAssetPath.current = archived;
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function companion(overrides: Record<string, unknown> = {}) {
  return { present: true, ext: ".exe", fileName: "הגדרה.exe", sha256: "abc123", ...overrides };
}

function plugin(overrides: Record<string, unknown> = {}) {
  return {
    _id: ID,
    version: "2.0.0",
    isApproved: true,
    isHidden: false,
    isSuspended: false,
    authorId: { toString: () => "owner-1" },
    companion: companion(),
    versions: [],
    ...overrides,
  };
}

function call(ref = ID) {
  return GET(new Request(`http://x/api/plugins/${ref}/companion`), { params: Promise.resolve({ id: ref }) });
}

describe("GET /api/plugins/[id]/companion", () => {
  beforeEach(() => {
    findByIdMock.mockReset();
    getSessionMock.mockReset().mockResolvedValue(null);
    liveAssetPath.current = path.join(dir, "live.exe");
  });

  it("מגיש את המתקין כ-stream עם כותרות הורדה, גיבוב ו-no-store", async () => {
    findByIdMock.mockResolvedValue(plugin());
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
    expect(res.headers.get("Content-Length")).toBe(String(INSTALLER.length));
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("X-Companion-SHA256")).toBe("abc123");
    expect(res.headers.get("Content-Disposition")).toContain("filename*=UTF-8''");
    expect(Buffer.from(await res.arrayBuffer())).toEqual(INSTALLER);
  });

  it("תוסף לא מאושר — 404 לאורח, נגיש לבעלים ולמנהל תוספים", async () => {
    findByIdMock.mockResolvedValue(plugin({ isApproved: false }));
    expect((await call()).status).toBe(404);

    getSessionMock.mockResolvedValue({ user: { id: "owner-1", role: "user" } });
    expect((await call()).status).toBe(200);

    getSessionMock.mockResolvedValue({ user: { id: "someone", role: "admin_plugins" } });
    expect((await call()).status).toBe(200);
  });

  it("תוסף מושהה — 404 גם כשהוא מאושר, למעט לבעלים", async () => {
    findByIdMock.mockResolvedValue(plugin({ isSuspended: true }));
    expect((await call()).status).toBe(404);
    getSessionMock.mockResolvedValue({ user: { id: "owner-1", role: "user" } });
    expect((await call()).status).toBe(200);
  });

  it("תוסף מוסתר או לא קיים — 404", async () => {
    findByIdMock.mockResolvedValue(plugin({ isHidden: true }));
    expect((await call()).status).toBe(404);
    findByIdMock.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
  });

  it("תוסף בלי תוכנה נלווית — 404", async () => {
    findByIdMock.mockResolvedValue(plugin({ companion: { present: false } }));
    const res = await call();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Companion installer not found" });
  });

  it("קובץ שחסר בדיסק — 404 ולא 500", async () => {
    findByIdMock.mockResolvedValue(plugin());
    liveAssetPath.current = path.join(dir, "missing.exe");
    expect((await call()).status).toBe(404);
  });

  it("גרסה ארכיונית מוגשת עם המתקין שלה", async () => {
    findByIdMock.mockResolvedValue(
      plugin({ versions: [{ version: "1.0.0", companion: companion({ ext: ".msi", fileName: "old.msi", sha256: "old" }) }] })
    );
    const res = await call(`${ID}@1.0.0`);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Companion-SHA256")).toBe("old");
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("old");
  });

  it("גרסה ארכיונית שאינה קיימת, או שאין לה מתקין — 404", async () => {
    findByIdMock.mockResolvedValue(
      plugin({ versions: [{ version: "1.0.0", companion: { present: false } }] })
    );
    expect((await call(`${ID}@1.0.0`)).status).toBe(404);
    expect((await call(`${ID}@0.5.0`)).status).toBe(404);
  });
});
