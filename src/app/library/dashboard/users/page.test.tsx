import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import UsersManagementPage from "./page.jsx";

const push = vi.fn();
let mockSession: { data: any; status: string } = { data: undefined, status: "loading" };

vi.mock("next-auth/react", () => ({
  useSession: () => mockSession,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/components/layout/Header", () => ({
  default: () => null,
}));

describe("UsersManagementPage auth guard", () => {
  beforeEach(() => {
    push.mockClear();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ users: [] }),
    }) as unknown as typeof fetch;
  });

  it("does not redirect while the session is still loading", () => {
    mockSession = { data: undefined, status: "loading" };
    render(<UsersManagementPage />);
    expect(push).not.toHaveBeenCalled();
  });

  it("redirects to login once unauthenticated", () => {
    mockSession = { data: undefined, status: "unauthenticated" };
    render(<UsersManagementPage />);
    expect(push).toHaveBeenCalledWith(expect.stringContaining("/auth/login"));
  });

  it("loads users for an authenticated admin instead of redirecting away", async () => {
    mockSession = { data: { user: { id: "1", role: "admin" } }, status: "authenticated" };
    render(<UsersManagementPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("/api/admin/users"));
    expect(push).not.toHaveBeenCalledWith("/library/dashboard");
  });

  it("redirects a non-admin authenticated user to the dashboard", () => {
    mockSession = { data: { user: { id: "1", role: "user" } }, status: "authenticated" };
    render(<UsersManagementPage />);
    expect(push).toHaveBeenCalledWith("/library/dashboard");
  });
});
