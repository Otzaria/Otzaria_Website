// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ session: vi.fn(), find: vi.fn(), validate: vi.fn(), saveFile: vi.fn(), archive: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: m.session }));
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));
vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/models/Plugin", () => ({ default: { findById: m.find } }));
vi.mock("@/lib/pluginManifest", async () => ({ readManifestFromPlugin: vi.fn(), ...(await import("@/lib/semverCompare.js")) }));
vi.mock("@/lib/pluginValidation", () => ({ validatePluginArchive: m.validate, OTZARIA_DESIGN_TAG: "מראה תואם לאוצריא" }));
vi.mock("@/lib/pluginSearchIndex", () => ({ invalidatePluginSearchIndex: vi.fn() }));
vi.mock("@/lib/cacheTags", () => ({ CACHE_TAGS: { PLUGINS_PUBLIC: "plugins" }, revalidateNow: vi.fn() }));
vi.mock("@/lib/emailService", () => ({ sendPluginUploadNotification: vi.fn() }));
vi.mock("@/lib/systemMessages", () => ({ sendPluginReportNoticeIfNeeded: vi.fn() }));
vi.mock("@/lib/pluginVersions", () => ({ archiveCurrentVersion: m.archive }));
vi.mock("@/lib/pluginStorage", () => ({
  MAX_PLUGIN_BYTES: 1, MAX_IMAGE_BYTES: 1, MAX_SCREENSHOT_BYTES: 1, MAX_SCREENSHOTS: 1,
  PLUGIN_FILE_BASENAME: "plugin", IMAGE_BASENAME: "image", ensurePluginDir: vi.fn(), saveFileFromFormData: m.saveFile,
  readPluginAsset: vi.fn(), deletePendingPluginDir: vi.fn(), getPendingPluginDir: vi.fn(), isAllowedImage: vi.fn(),
  imageExtFromMime: vi.fn(), saveOptimizedImage: vi.fn(), clearImageOptCache: vi.fn(), removePluginAsset: vi.fn(),
  pluginFileSha256: vi.fn(),
}));

import { GET as adminGET, PUT as adminPUT } from "./route";
import { GET as ownerGET, PUT as ownerPUT } from "@/app/api/plugins/[id]/edit/route";

const ID = "0123456789abcdef01234567";
const context = { params: Promise.resolve({ id: ID }) };
let plugin: Record<string, unknown>;
const formData = vi.fn();
const request = () => ({ formData }) as unknown as Request;

beforeEach(() => {
  vi.clearAllMocks();
  plugin = {
    _id: { toString: () => ID }, authorId: { toString: () => "owner" }, hasService: true, isHidden: false,
    name: "שירות", slug: "svc", version: "1.0.0", status: "stable", author: "מפתח", shortDescription: "קצר", description: "תיאור",
    compatibleWith: "0.9.97", updatedAt: new Date("2026-10-01T00:00:00Z"), isApproved: true, save: vi.fn(),
  };
  m.find.mockResolvedValue(plugin);
  m.session.mockResolvedValue({ user: { id: "owner", role: "user" } });
});

function expectNothingTouched() {
  expect(formData).not.toHaveBeenCalled();
  expect(m.validate).not.toHaveBeenCalled();
  expect(m.saveFile).not.toHaveBeenCalled();
  expect(m.archive).not.toHaveBeenCalled();
  expect(plugin.save).not.toHaveBeenCalled();
}

describe("edit routes for a service plugin", () => {
  it("owner PUT gets 409 (not 403) before reading the form", async () => {
    const res = await ownerPUT(request(), context);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "service_plugin_edit_blocked", serviceUrl: `/plugins/${ID}/service` });
    expectNothingTouched();
  });

  it("admin PUT is blocked as well", async () => {
    m.session.mockResolvedValue({ user: { id: "admin", role: "admin" } });
    const res = await adminPUT(request(), context);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/תוסף שירות/);
    expectNothingTouched();
  });

  it("authorization still comes first", async () => {
    m.session.mockResolvedValue({ user: { id: "other", role: "user" } });
    expect((await ownerPUT(request(), context)).status).toBe(403);
    m.session.mockResolvedValue(null);
    expect((await adminPUT(request(), context)).status).toBe(401);
    expectNothingTouched();
  });

  it("GET returns the usual payload plus hasService and editBlocked", async () => {
    const body = await (await ownerGET(request(), context)).json();
    expect(body).toMatchObject({ _id: ID, version: "1.0.0", hasService: true, editBlocked: true });
  });

  it("GET for a regular plugin has no editBlocked flag", async () => {
    plugin.hasService = false;
    m.session.mockResolvedValue({ user: { id: "admin", role: "admin" } });
    const body = await (await adminGET(request(), context)).json();
    expect(body.hasService).toBe(false);
    expect(body).not.toHaveProperty("editBlocked");
  });
});
