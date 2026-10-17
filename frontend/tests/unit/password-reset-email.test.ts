import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/lib/response";
import { resetMailConfig, sendPasswordResetEmail } from "@/modules/auth/password-reset-email";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("password reset delivery", () => {
  it("refuses to claim successful email delivery without all server configuration", () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("PASSWORD_RESET_FROM", "");
    vi.stubEnv("PASSWORD_RESET_BASE_URL", "");
    expect(() => resetMailConfig()).toThrow(HttpError);
  });
  it("rejects non-HTTPS reset links", () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("PASSWORD_RESET_FROM", "security@example.test");
    vi.stubEnv("PASSWORD_RESET_BASE_URL", "http://external.example.test");
    expect(() => resetMailConfig()).toThrow(HttpError);
  });
  it("delivers through the provider without logging or returning the token", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("PASSWORD_RESET_FROM", "security@example.test");
    vi.stubEnv("PASSWORD_RESET_BASE_URL", "https://gheverhan.example.test");
    const fetcher = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetcher);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const token = "a".repeat(64);
    await sendPasswordResetEmail("buyer@example.test", token, resetMailConfig());
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, request] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(JSON.parse(request.body).text).toContain(`https://gheverhan.example.test/reset-password?token=${token}`);
    expect(JSON.parse(request.body).to).toEqual(["buyer@example.test"]);
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });
  it("does not report success if provider rejects delivery", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    await expect(sendPasswordResetEmail("buyer@example.test", "a".repeat(64), { key: "test", from: "security@example.test", baseUrl: "https://example.test" })).rejects.toThrow(HttpError);
  });
});
