import { describe, it, expect } from "vitest";
import { apiError, unauthorized, forbidden, badRequest, notFound, serverError, requireAccess } from "./apiResponse";

async function readJson(res: Response) {
  return { status: res.status, body: await res.json() };
}

describe("apiResponse helpers", () => {
  it("apiError builds the exact status/body shape", async () => {
    const { status, body } = await readJson(apiError(418, "משהו"));
    expect(status).toBe(418);
    expect(body).toEqual({ error: "משהו" });
  });

  it("unauthorized defaults to 401 with a Hebrew message", async () => {
    const { status, body } = await readJson(unauthorized());
    expect(status).toBe(401);
    expect(body.error).toBeTruthy();
  });

  it("forbidden defaults to 403", async () => {
    const { status } = await readJson(forbidden());
    expect(status).toBe(403);
  });

  it("badRequest is 400 with the given message", async () => {
    const { status, body } = await readJson(badRequest("שדה חסר"));
    expect(status).toBe(400);
    expect(body.error).toBe("שדה חסר");
  });

  it("notFound defaults to 404", async () => {
    const { status } = await readJson(notFound());
    expect(status).toBe(404);
  });

  it("serverError defaults to 500", async () => {
    const { status } = await readJson(serverError());
    expect(status).toBe(500);
  });
});

describe("requireAccess", () => {
  const hasAccess = (role: string | undefined) => role === "admin";

  it("returns a 401 response when there is no session", async () => {
    const denied = requireAccess(null, hasAccess);
    expect(denied).not.toBeNull();
    const { status } = await readJson(denied as Response);
    expect(status).toBe(401);
  });

  it("returns a 401 response when the session has no user", async () => {
    const denied = requireAccess({}, hasAccess);
    const { status } = await readJson(denied as Response);
    expect(status).toBe(401);
  });

  it("returns a 403 response when the session exists but lacks the role", async () => {
    const denied = requireAccess({ user: { role: "user" } }, hasAccess);
    const { status } = await readJson(denied as Response);
    expect(status).toBe(403);
  });

  it("returns null when access is granted", () => {
    const denied = requireAccess({ user: { role: "admin" } }, hasAccess);
    expect(denied).toBeNull();
  });
});
