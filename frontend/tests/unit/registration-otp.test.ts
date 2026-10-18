import { afterEach, expect, it, vi } from "vitest";
import { registrationSchema } from "@/modules/auth/registration-schema";
import {
  compareRegistrationOtp,
  hashRegistrationOtp,
  normalizeRegistrationPhone,
} from "@/modules/auth/registration-otp";
import {
  registrationMailConfig,
  sendRegistrationOtpEmail,
} from "@/modules/auth/registration-otp-email";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const valid = {
  name: "Dummy",
  email: " Dummy@Example.test ",
  phone: "081234567890",
  password: "dummy-only-password",
  confirmPassword: "dummy-only-password",
  terms: true,
};
it("shares the registration contract: required phone/confirmation/consent and normalized email", () => {
  expect(registrationSchema.parse(valid).email).toBe("dummy@example.test");
  for (const patch of [
    { phone: undefined },
    { confirmPassword: undefined },
    { terms: "1" },
    { confirmPassword: "wrong" },
    { password: "é".repeat(40), confirmPassword: "é".repeat(40) },
  ]) {
    expect(registrationSchema.safeParse({ ...valid, ...patch }).success).toBe(
      false,
    );
  }
  expect(normalizeRegistrationPhone("0812-3456-7890")).toBe("+6281234567890");
  expect(() => normalizeRegistrationPhone("invalid")).toThrow();
});
it("keys OTP hashes to signing configuration, purpose and normalized email", () => {
  vi.stubEnv("JWT_SECRET", "dummy-key-for-registration-only");
  const digest = hashRegistrationOtp("Dummy@Example.test", "012345");
  expect(compareRegistrationOtp("dummy@example.test", "012345", digest)).toBe(
    true,
  );
  expect(compareRegistrationOtp("other@example.test", "012345", digest)).toBe(
    false,
  );
  expect(
    compareRegistrationOtp(
      "dummy@example.test",
      "012345",
      "sending:reservation",
    ),
  ).toBe(false);
  vi.stubEnv("JWT_SECRET", "");
  expect(() => hashRegistrationOtp("dummy@example.test", "012345")).toThrow();
});
it("rejects an email sink on hosted/remote databases before any network request", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("GHEVERHAN_ISOLATED_TESTS", "1");
  vi.stubEnv(
    "DATABASE_URL",
    "postgresql://unused@127.0.0.1/gheverhan_sprint1_test",
  );
  vi.stubEnv("REGISTRATION_OTP_TEST_SINK", "http://localhost:9876/emails");
  vi.stubEnv("VERCEL_ENV", "production");
  await expect(
    sendRegistrationOtpEmail("dummy@example.test", "012345", {
      key: "dummy",
      from: "dummy@example.test",
    }),
  ).rejects.toMatchObject({ status: 503 });
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("DATABASE_URL", "postgresql://unused@remote.invalid/database");
  await expect(
    sendRegistrationOtpEmail("dummy@example.test", "012345", {
      key: "dummy",
      from: "dummy@example.test",
    }),
  ).rejects.toMatchObject({ status: 503 });
  expect(fetchMock).not.toHaveBeenCalled();
});
it("fails closed without email configuration and on rejected provider responses", async () => {
  vi.stubEnv("RESEND_API_KEY", "");
  expect(() => registrationMailConfig()).toThrow();
  vi.stubEnv("REGISTRATION_OTP_TEST_SINK", "");
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response("{}", { status: 503 }));
  vi.stubGlobal("fetch", fetchMock);
  await expect(
    sendRegistrationOtpEmail("dummy@example.test", "012345", {
      key: "dummy",
      from: "dummy@example.test",
    }),
  ).rejects.toMatchObject({ status: 503 });
  expect(fetchMock.mock.calls[0][0]).toBe("https://api.resend.com/emails");
  expect(fetchMock.mock.calls[0][1].redirect).toBe("error");
});
