import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(), revoke: vi.fn(), set: vi.fn(), sign: vi.fn(),
  claims: { sub: "fixture", email: "fixture@example.test", version: 0, tokenHash: "fixture-hash", expiresAt: new Date("2099-01-01") },
}));
vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: (fn: unknown) => fn }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "synthetic-session" }), set: mocks.set }) }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: mocks.findUnique } } }));
vi.mock("@/lib/auth/jwt", () => ({ verifySessionClaims: async () => mocks.claims, signSession: mocks.sign }));
vi.mock("@/lib/auth/session-state", () => ({ activeSessionWhere: vi.fn(), revokeSession: mocks.revoke }));
import { createSession, destroySession } from "@/lib/auth/session";
beforeEach(() => { vi.clearAllMocks(); mocks.revoke.mockResolvedValue(undefined); mocks.findUnique.mockResolvedValue({ sessionVersion: 2 }); mocks.sign.mockResolvedValue("synthetic-new-session"); });
describe("session lifecycle", () => {
  it("revokes the verified captured session before completing logout", async () => {
    await destroySession();
    expect(mocks.revoke).toHaveBeenCalledWith(mocks.claims);
    expect(mocks.set).toHaveBeenCalledWith("gh_session", "", expect.objectContaining({ httpOnly: true, secure: true, maxAge: 0 }));
  });
  it("clears the cookie but reports failure when durable revocation fails", async () => {
    mocks.revoke.mockRejectedValue(new Error("database unavailable"));
    await expect(destroySession()).rejects.toThrow("database unavailable");
    expect(mocks.set).toHaveBeenCalledOnce();
  });
  it("binds session creation to the version authenticated before a concurrent reset", async () => {
    await createSession("fixture", "fixture@example.test", 2);
    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { id: "fixture", isActive: true, sessionVersion: 2 }, select: { sessionVersion: true } });
    expect(mocks.sign).toHaveBeenCalledWith({ sub: "fixture", email: "fixture@example.test", version: 2 });
  });
  it("does not mint a new cookie when the authenticated version was invalidated", async () => {
    mocks.findUnique.mockResolvedValue(null);
    await expect(createSession("fixture", "fixture@example.test", 0)).rejects.toMatchObject({ status: 401 });
    expect(mocks.sign).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
  });
});
