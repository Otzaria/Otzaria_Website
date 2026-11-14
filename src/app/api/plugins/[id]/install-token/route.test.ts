// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const m = vi.hoisted(() => ({ select: vi.fn(), create: vi.fn() }));

vi.mock("next-auth", () => ({ getServerSession: vi.fn().mockResolvedValue(null) }));
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));
vi.mock("@/lib/db", () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => true }));
vi.mock("@/models/Plugin", () => ({ default: { findById: () => ({ select: m.select }) } }));
vi.mock("@/models/PluginInstallToken", () => ({ default: { create: m.create } }));

import { POST } from "./route";

const ID = "0123456789abcdef01234567";
let plugin: Record<string, unknown>;

function post(ref = ID) {
  return POST(new NextRequest(`https://otzaria.org/api/plugins/${ref}/install-token`, { method: "POST" }), {
    params: Promise.resolve({ id: ref }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  plugin = { _id: ID, isApproved: true, isHidden: false, version: "2.0.0", authorId: { toString: () => "owner" } };
  m.select.mockImplementation(async () => plugin);
  m.create.mockImplementation(async (doc: Record<string, unknown>) => ({ ...doc }));
});

describe("POST /api/plugins/[id]/install-token", () => {
  it("regular plugins keep issuing tokens for historical versions", async () => {
    const res = await post(`${ID}@1.0.0`);
    expect(res.status).toBe(200);
    expect(m.create.mock.calls[0][0].version).toBe("1.0.0");
  });

  it("service plugins: the current version is allowed", async () => {
    plugin.hasService = true;
    expect((await post()).status).toBe(200);
    expect(m.select.mock.calls[0][0]).toContain("hasService");
    expect((await post(`${ID}@2.0.0`)).status).toBe(200);
    expect(m.create).toHaveBeenCalledTimes(2);
  });

  it("service plugins: an explicit historical version is rejected in Hebrew", async () => {
    plugin.hasService = true;
    const res = await post(`${ID}@1.0.0`);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/תוסף שירות/);
    expect(m.create).not.toHaveBeenCalled();
  });
});
