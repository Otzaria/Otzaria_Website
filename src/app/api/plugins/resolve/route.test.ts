// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({ session: vi.fn(), select: vi.fn() }));

vi.mock("next-auth", () => ({ getServerSession: m.session }));
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));
vi.mock("@/lib/db", () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/models/Plugin", () => ({ default: { findOne: () => ({ select: m.select }) } }));

import { GET } from "./route";

const ID = "0123456789abcdef01234567";
let plugin: Record<string, unknown>;

const get = () => GET(new Request("https://otzaria.org/api/plugins/resolve?uid=org.x"));

beforeEach(() => {
  vi.clearAllMocks();
  m.session.mockResolvedValue({ user: { id: "owner", role: "user" } });
  plugin = { _id: { toString: () => ID }, authorId: { toString: () => "owner" }, isHidden: false };
  m.select.mockImplementation(() => ({ lean: async () => plugin }));
});

describe("GET /api/plugins/resolve", () => {
  it("reports hasService:false for a regular plugin", async () => {
    expect(await (await get()).json()).toEqual({ exists: true, owned: true, id: ID, hasService: false });
    expect(m.select.mock.calls[0][0]).toContain("hasService");
  });

  it("reports hasService:true for a service plugin, owned or not", async () => {
    plugin.hasService = true;
    expect(await (await get()).json()).toEqual({ exists: true, owned: true, id: ID, hasService: true });
    m.session.mockResolvedValue({ user: { id: "other", role: "user" } });
    expect(await (await get()).json()).toEqual({ exists: true, owned: false, hasService: true });
  });

  it("missing plugins are unchanged", async () => {
    m.select.mockImplementation(() => ({ lean: async () => null }));
    expect(await (await get()).json()).toEqual({ exists: false });
  });
});
