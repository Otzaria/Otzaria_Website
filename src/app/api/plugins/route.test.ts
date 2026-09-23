import { describe, it, expect, vi, beforeEach } from "vitest";

// GET /api/plugins — הסינון לפי installedServices. formatPluginForPublic,
// resolveListForAppVersion ו-filterByInstalledServices רצים אמיתיים; רק ה-DB מדומה.

const { findMock } = vi.hoisted(() => ({ findMock: vi.fn() }));

vi.mock("@/lib/db", () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/models/Plugin", () => ({ default: { find: findMock } }));
vi.mock("@/models/StoreSettings", () => ({
  getStoreSettings: vi.fn().mockResolvedValue({ featuredPluginIds: [] }),
}));

import { GET } from "./route";

const DATE = new Date("2026-01-01T00:00:00Z");

function doc(id: string, service: Record<string, unknown> | null, extra: Record<string, unknown> = {}) {
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
    companion: service
      ? { present: true, name: "מתאם", ext: ".exe", platform: "windows", service }
      : { present: false },
    versions: [],
    ...extra,
  };
}

const DOCS = [
  doc("plain", null),
  doc("declared", { id: "bridge", minVersion: "", hideUnlessInstalled: false }),
  doc("hidden", { id: "bridge", minVersion: "2.0", hideUnlessInstalled: true }),
];

function chain(result: unknown[]) {
  const q = { sort: () => q, select: () => q, lean: () => Promise.resolve(result) };
  return q;
}

async function ids(query = "") {
  const res = await GET(new Request(`http://x/api/plugins${query}`));
  expect(res.status).toBe(200);
  return (await res.json()).map((p: { id: string }) => p.id).sort();
}

describe("GET /api/plugins — installedServices", () => {
  beforeEach(() => {
    findMock.mockReset().mockImplementation(() => chain(DOCS.map((d) => ({ ...d }))));
  });

  it("בלי הפרמטר — כל התוספים, כמו קודם (צרכן קיים לא מושפע)", async () => {
    expect(await ids()).toEqual(["declared", "hidden", "plain"]);
  });

  it("רשימה ריקה — מוסתר רק מי שהצהיר hideUnlessInstalled", async () => {
    expect(await ids("?installedServices=")).toEqual(["declared", "plain"]);
  });

  it("שירות בגרסה נמוכה מהמזערית — עדיין מוסתר; בגרסה מספקת — מוצג", async () => {
    expect(await ids("?installedServices=bridge@1.5")).toEqual(["declared", "plain"]);
    expect(await ids("?installedServices=bridge@2.0")).toEqual(["declared", "hidden", "plain"]);
  });

  it("פרמטר לא תקין — 400", async () => {
    const res = await GET(new Request("http://x/api/plugins?installedServices=bad%20id"));
    expect(res.status).toBe(400);
  });

  it("עם appVersion — הסינון לפי הצהרת הגרסה החיה, גם כשנבחרת גרסה ארכיונית", async () => {
    // הגרסה החיה דורשת אוצריא חדשה; הארכיונית תואמת ואין לה הצהרת שירות.
    // ההצהרה היא של התוסף — ולכן הוא מוסתר גם כשמוגשת הגרסה הישנה.
    findMock.mockImplementation(() =>
      chain([
        doc("hidden", { id: "bridge", minVersion: "", hideUnlessInstalled: true }, {
          compatibleWith: "1.5.0",
          versions: [{ version: "0.5.0", compatibleWith: "0.9.0", companionRecorded: true, companion: { present: false } }],
        }),
      ])
    );
    expect(await ids("?appVersion=1.0.0&installedServices=")).toEqual([]);
    expect(await ids("?appVersion=1.0.0&installedServices=bridge")).toEqual(["hidden"]);
  });
});
