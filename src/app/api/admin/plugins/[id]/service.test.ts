// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  findById: vi.fn(),
  findByIdAndDelete: vi.fn(),
  exists: vi.fn(),
  updateMany: vi.fn(),
  find: vi.fn(),
  deleteReviewFiles: vi.fn(),
  deletePluginDir: vi.fn(),
  deleteVersionDir: vi.fn(),
  mail: vi.fn(),
  archive: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn().mockResolvedValue({ user: { id: "admin-1", role: "admin" } }) }));
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));
vi.mock("@/lib/db", () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/models/Plugin", () => ({ default: { findById: m.findById, findByIdAndDelete: m.findByIdAndDelete } }));
vi.mock("@/models/PluginCategory", () => ({ default: { updateMany: vi.fn().mockResolvedValue({}) } }));
vi.mock("@/models/StoreSettings", () => ({ default: { updateOne: vi.fn().mockResolvedValue({}) } }));
vi.mock("@/models/ServicePluginReview", () => ({
  default: { exists: m.exists, updateMany: m.updateMany, find: m.find },
}));
vi.mock("@/lib/servicePlugins/storage", () => ({ deleteReviewFiles: m.deleteReviewFiles }));
vi.mock("@/lib/pluginSearchIndex", () => ({ invalidatePluginSearchIndex: vi.fn() }));
vi.mock("@/lib/cacheTags", () => ({
  CACHE_TAGS: { PLUGINS_PUBLIC: "plugins", PLUGIN_CATEGORIES: "cats", STORE_SETTINGS: "store" },
  revalidateNow: vi.fn(),
}));
vi.mock("@/lib/emailService", () => ({ sendPluginApprovalNotification: m.mail }));
vi.mock("@/lib/pluginVersions", () => ({ archiveCurrentVersion: m.archive }));
vi.mock("@/lib/pluginStorage", () => ({
  deletePendingPluginDir: vi.fn().mockResolvedValue(undefined),
  deletePluginDir: m.deletePluginDir,
  deleteVersionDir: m.deleteVersionDir,
  ensurePluginDir: vi.fn(),
  getPendingPluginDir: vi.fn(),
  removePluginAsset: vi.fn(),
  clearImageOptCache: vi.fn(),
  pluginFileSha256: vi.fn(),
}));

import { PATCH, DELETE } from "./route";
import { DELETE as DELETE_VERSION } from "./versions/[version]/route";

const ID = "0123456789abcdef01234567";
const context = { params: Promise.resolve({ id: ID }) };
let plugin: Record<string, unknown>;

function patch(body: unknown) {
  return PATCH({ json: async () => body } as Request, context);
}

beforeEach(() => {
  vi.clearAllMocks();
  plugin = {
    _id: { toString: () => ID },
    hasService: true,
    isApproved: true,
    version: "2.0.0",
    versions: [{ version: "1.0.0", reviewId: "b".repeat(24) }],
    pendingUpdate: null,
    save: vi.fn().mockResolvedValue(undefined),
    approve: vi.fn().mockResolvedValue(undefined),
  };
  m.findById.mockImplementation(() => {
    const result = Promise.resolve(plugin) as Promise<unknown> & { populate: () => Promise<unknown> };
    result.populate = () => Promise.resolve(plugin);
    return result;
  });
  m.exists.mockResolvedValue(null);
  m.updateMany.mockResolvedValue({ modifiedCount: 1 });
  m.find.mockReturnValue({ select: () => ({ lean: async () => [{ _id: "r1" }, { _id: "r2" }] }) });
  m.deleteReviewFiles.mockResolvedValue(undefined);
});

describe("admin PATCH for a service plugin", () => {
  it("approve is 409 and changes nothing", async () => {
    plugin.isApproved = false;
    const res = await patch({ action: "approve" });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "service_plugin_approve_blocked", serviceUrl: `/plugins/${ID}/service` });
    expect(plugin.approve).not.toHaveBeenCalled();
    expect(plugin.save).not.toHaveBeenCalled();
    expect(m.mail).not.toHaveBeenCalled();
  });

  it("unapprove is 409 like approve (suspend instead) and changes nothing", async () => {
    const res = await patch({ action: "unapprove" });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toMatchObject({ code: "service_plugin_unapprove_blocked", serviceUrl: `/plugins/${ID}/service` });
    expect(body.error).toMatch(/להשהות/);
    expect(plugin.isApproved).toBe(true);
    expect(plugin.save).not.toHaveBeenCalled();
  });

  it("suspend and resume keep working", async () => {
    expect((await patch({ action: "suspend" })).status).toBe(200);
    expect((await patch({ action: "resume" })).status).toBe(200);
  });

  it("regular plugins are still approved manually", async () => {
    plugin.hasService = false;
    plugin.isApproved = false;
    expect((await patch({ action: "approve" })).status).toBe(200);
    expect(plugin.approve).toHaveBeenCalledWith("admin-1");
  });
});

describe("admin DELETE for a service plugin", () => {
  it("409 while a review is queued or running", async () => {
    m.exists.mockResolvedValueOnce({ _id: "r1" });
    const res = await DELETE({} as Request, context);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("service_plugin_review_in_progress");
    expect(m.exists).toHaveBeenCalledWith({ pluginId: plugin._id, status: { $in: ["queued", "running"] } });
    expect(m.updateMany).not.toHaveBeenCalled();
    expect(m.deleteReviewFiles).not.toHaveBeenCalled();
    expect(m.findByIdAndDelete).not.toHaveBeenCalled();
  });

  it("cancels the active review, deletes all review files, keeps review documents", async () => {
    const res = await DELETE({} as Request, context);
    expect(res.status).toBe(200);
    const [filter, update] = m.updateMany.mock.calls[0];
    expect(filter.pluginId).toBe(plugin._id);
    expect(filter.status.$in).toEqual(expect.arrayContaining(["draft", "sealing", "pending_admin", "retry_wait", "waiting_quota", "needs_operator"]));
    expect(filter.status.$in).not.toContain("queued");
    expect(filter.status.$in).not.toContain("running");
    expect(filter.status.$in).not.toContain("approved");
    expect(update.$set).toMatchObject({ status: "cancelled", activeKey: null, cancelledBy: "admin-1" });
    expect(update.$inc).toEqual({ fence: 1 });
    expect(m.deleteReviewFiles.mock.calls).toEqual([["r1"], ["r2"]]);
    expect(m.findByIdAndDelete).toHaveBeenCalledWith(ID);
  });

  it("a review claimed between the checks keeps its files", async () => {
    m.exists.mockResolvedValueOnce(null).mockResolvedValueOnce({ _id: "r1" });
    expect((await DELETE({} as Request, context)).status).toBe(409);
    expect(m.deleteReviewFiles).not.toHaveBeenCalled();
    expect(m.findByIdAndDelete).not.toHaveBeenCalled();
  });

  it("regular plugins never touch service reviews", async () => {
    plugin.hasService = false;
    expect((await DELETE({} as Request, context)).status).toBe(200);
    expect(m.exists).not.toHaveBeenCalled();
    expect(m.deleteReviewFiles).not.toHaveBeenCalled();
    expect(m.findByIdAndDelete).toHaveBeenCalledWith(ID);
  });
});

describe("admin DELETE versions/[version] for a service plugin", () => {
  const versionContext = { params: Promise.resolve({ id: ID, version: "1.0.0" }) };

  it("is 409 for a service plugin", async () => {
    const res = await DELETE_VERSION({} as Request, versionContext);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("service_plugin_version_delete_blocked");
    expect(plugin.save).not.toHaveBeenCalled();
    expect(m.deleteVersionDir).not.toHaveBeenCalled();
  });

  it("still deletes archived versions of regular plugins", async () => {
    plugin.hasService = false;
    expect((await DELETE_VERSION({} as Request, versionContext)).status).toBe(200);
    expect(plugin.versions).toEqual([]);
    expect(m.deleteVersionDir).toHaveBeenCalledWith(ID, "1.0.0");
  });
});
