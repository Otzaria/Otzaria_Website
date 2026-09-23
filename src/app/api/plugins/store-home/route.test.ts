import { describe, it, expect, vi, beforeEach } from "vitest";

// GET /api/plugins/store-home — totalPublicPlugins מנכה את מי שמוסתר מהצופה
// (countHiddenForViewer) ואת הנבחרים מסננים באותה נקודה.

const { findMock, countMock, fetchByIdsMock } = vi.hoisted(() => ({
  findMock: vi.fn(),
  countMock: vi.fn(),
  fetchByIdsMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/models/Plugin", () => ({ default: { find: findMock, countDocuments: countMock } }));
vi.mock("@/models/PluginCategory", () => ({
  default: { find: () => ({ sort: () => ({ lean: () => Promise.resolve([]) }) }) },
}));
vi.mock("@/models/StoreSettings", () => ({
  getStoreSettings: vi.fn().mockResolvedValue({ featuredPluginIds: ["plain", "hidden"] }),
}));
vi.mock("@/lib/pluginStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/pluginStore")>()),
  fetchPublicPluginsByIds: fetchByIdsMock,
}));

import { GET } from "./route";

const DATE = new Date("2026-01-01T00:00:00Z");
const HIDDEN_SERVICE = { id: "bridge", minVersion: "", hideUnlessInstalled: true };

function doc(id: string, service: Record<string, unknown> | null) {
  return {
    _id: { toString: () => id },
    name: id,
    slug: id,
    version: "1.0.0",
    status: "stable",
    compatibleWith: "0.9.0",
    createdAt: DATE,
    updatedAt: DATE,
    pluginFileExt: ".otzplugin",
    companion: service ? { present: true, name: "מתאם", ext: ".exe", platform: "windows", service } : { present: false },
    versions: [],
  };
}

function leanChain(result: unknown[]) {
  const q = { select: () => q, lean: () => Promise.resolve(result) };
  return q;
}

async function home(query = "") {
  const res = await GET(new Request(`http://x/api/plugins/store-home${query}`));
  expect(res.status).toBe(200);
  return res.json();
}

describe("GET /api/plugins/store-home — installedServices", () => {
  beforeEach(() => {
    countMock.mockReset().mockResolvedValue(2);
    // השאילתה היחידה ל-find כאן היא של countHiddenForViewer (בלי appVersion)
    findMock.mockReset().mockImplementation(() => leanChain([doc("hidden", HIDDEN_SERVICE)]));
    fetchByIdsMock.mockReset().mockResolvedValue(
      new Map([
        ["plain", doc("plain", null)],
        ["hidden", doc("hidden", HIDDEN_SERVICE)],
      ])
    );
  });

  it("בלי הפרמטר — אין שאילתת ניכוי, והספירה כמו קודם", async () => {
    const body = await home();
    expect(body.totalPublicPlugins).toBe(2);
    expect(body.featured.map((p: { id: string }) => p.id)).toEqual(["plain", "hidden"]);
    expect(findMock).not.toHaveBeenCalled();
  });

  it("שירות חסר — התוסף המוסתר יורד מהנבחרים ומהספירה", async () => {
    const body = await home("?installedServices=");
    expect(body.totalPublicPlugins).toBe(1);
    expect(body.featured.map((p: { id: string }) => p.id)).toEqual(["plain"]);
    // השאילתה מצומצמת למצהירים בלבד (ראו האינדקס החלקי במודל)
    expect(findMock.mock.calls[0][0]).toMatchObject({ "companion.service.hideUnlessInstalled": true });
  });

  it("שירות מותקן — הכול מוצג והספירה מלאה", async () => {
    const body = await home("?installedServices=bridge");
    expect(body.totalPublicPlugins).toBe(2);
    expect(body.featured).toHaveLength(2);
  });

  it("פרמטר לא תקין — 400", async () => {
    const res = await GET(new Request("http://x/api/plugins/store-home?installedServices=@@"));
    expect(res.status).toBe(400);
  });
});
