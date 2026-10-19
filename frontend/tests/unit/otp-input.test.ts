// @vitest-environment jsdom
import { createElement, useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { OtpInput } from "@/components/auth/otp-input";
import { RegistrationOtpStep } from "@/components/auth/registration-otp-step";
import { formatOtpTime } from "@/components/auth/registration-state";
import type { RegistrationChallenge } from "@/modules/auth/registration-contract";
const mock = vi.hoisted(() => ({
  verify: vi.fn(),
  resend: vi.fn(),
  status: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("@/modules/auth/auth.actions", () => ({
  verifyRegistrationAction: mock.verify,
  resendRegistrationAction: mock.resend,
  registrationStatusAction: mock.status,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mock.replace }),
}));
const challenge = (): RegistrationChallenge => ({
  email: "dummy@example.test",
  challengeId: "00000000-0000-4000-8000-000000000001",
  serverNow: Date.now(),
  expiresAt: Date.now() + 600_000,
  resendAvailableAt: Date.now() + 60_000,
  status: "active",
});
beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) =>
    setTimeout(() => fn(0), 0),
  );
  mock.verify.mockResolvedValue({
    ok: false,
    errorCode: "OTP_INVALID",
    error: "Kode OTP salah. Periksa kembali dan coba lagi.",
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});
function Entry() {
  const [value, setValue] = useState("");
  return createElement(OtpInput, { value, onChange: setValue, state: "idle" });
}
it("uses one native autofill input and six visual slots; numeric editing, paste and selection remain native", () => {
  render(createElement(Entry));
  const input = screen.getByLabelText("Kode OTP 6 angka") as HTMLInputElement;
  expect(
    screen.getByTestId("otp-slots").querySelectorAll(".auth-otp-slot"),
  ).toHaveLength(6);
  expect(input.autocomplete).toBe("one-time-code");
  expect(input.inputMode).toBe("numeric");
  fireEvent.change(input, { target: { value: "a12b3" } });
  expect(input.value).toBe("123");
  fireEvent.paste(input, { clipboardData: { getData: () => "1234567890" } });
  expect(input.value).toBe("123");
  fireEvent.paste(input, { clipboardData: { getData: () => "654 321" } });
  expect(input.value).toBe("654321");
  input.setSelectionRange(0, 6);
  fireEvent.change(input, { target: { value: "012345" } });
  expect(input.value).toBe("012345");
  expect(
    screen.getByTestId("otp-slots").querySelector(".auth-otp-slots")
      ?.textContent,
  ).toBe("012345");
});
it("autosubmits complete native input once, stays neutral while pending, and only turns green on backend success", async () => {
  let resolve!: (value: unknown) => void;
  mock.verify.mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  render(
    createElement(RegistrationOtpStep, {
      initial: challenge(),
      onRestart: vi.fn(),
    }),
  );
  const button = screen.getByTestId("auth-submit") as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  fireEvent.change(screen.getByTestId("register-otp"), {
    target: { value: "12345" },
  });
  expect(mock.verify).not.toHaveBeenCalled();
  fireEvent.change(screen.getByTestId("register-otp"), {
    target: { value: "123456" },
  });
  await waitFor(() => expect(mock.verify).toHaveBeenCalledTimes(1));
  expect(screen.getByTestId("otp-slots").getAttribute("data-state")).toBe(
    "verifying",
  );
  expect(button.disabled).toBe(true);
  fireEvent.submit(screen.getByTestId("verify-registration-form"));
  expect(mock.verify).toHaveBeenCalledTimes(1);
  await act(async () => resolve({ ok: true, verified: true }));
  expect(screen.getByTestId("otp-slots").getAttribute("data-state")).toBe(
    "success",
  );
  expect(screen.getByText("Email berhasil diverifikasi.")).toBeTruthy();
  await waitFor(() => expect(mock.replace).toHaveBeenCalledWith("/account"));
});
it("only a server rejection produces red/shake state and unchanged code does not auto-retry", async () => {
  render(
    createElement(RegistrationOtpStep, {
      initial: challenge(),
      onRestart: vi.fn(),
    }),
  );
  fireEvent.change(screen.getByTestId("register-otp"), {
    target: { value: "123456" },
  });
  await waitFor(() =>
    expect(screen.getByTestId("otp-slots").getAttribute("data-state")).toBe(
      "error",
    ),
  );
  expect(mock.verify).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("alert").textContent).toContain("Kode OTP salah");
  expect(mock.replace).not.toHaveBeenCalled();
});
it("network failure never produces green and manual retry remains available", async () => {
  mock.verify.mockRejectedValue(new Error("dummy offline"));
  render(
    createElement(RegistrationOtpStep, {
      initial: challenge(),
      onRestart: vi.fn(),
    }),
  );
  fireEvent.change(screen.getByTestId("register-otp"), {
    target: { value: "123456" },
  });
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain(
      "Respons verifikasi belum diterima",
    ),
  );
  expect(screen.getByTestId("otp-slots").getAttribute("data-state")).toBe(
    "idle",
  );
  fireEvent.submit(screen.getByTestId("verify-registration-form"));
  await waitFor(() => expect(mock.verify).toHaveBeenCalledTimes(2));
  expect(mock.replace).not.toHaveBeenCalled();
});
it("expiry is formatted from server time and a lost resend response recovers the actual deadline", async () => {
  const live = {
    ...challenge(),
    resendAvailableAt: Date.now() - 1,
    expiresAt: Date.now() + 25_000,
  };
  mock.resend.mockRejectedValue(new Error("dummy lost response"));
  mock.status.mockResolvedValue({ ok: true, ...live });
  render(
    createElement(RegistrationOtpStep, { initial: live, onRestart: vi.fn() }),
  );
  expect(screen.getByTestId("otp-expiry").textContent).toContain("00:25");
  fireEvent.click(screen.getByTestId("registration-resend"));
  await waitFor(() => expect(mock.status).toHaveBeenCalledTimes(1));
  expect(screen.getByTestId("otp-expiry").textContent).toContain("00:25");
  expect(screen.getByTestId("otp-slots").getAttribute("data-state")).not.toBe(
    "success",
  );
  const raw = window.sessionStorage.getItem("gheverhan.registration.otp.v1")!;
  expect(Object.keys(JSON.parse(raw)).sort()).toEqual(["challengeId", "email"]);
  expect(formatOtpTime(-1)).toBe("00:00");
});
it("a server-deleted generation restarts the form without silently creating another challenge", async () => {
  const restart = vi.fn();
  mock.verify.mockResolvedValue({
    ok: false,
    errorCode: "CHALLENGE_MISSING",
    error: "Sesi pendaftaran tidak tersedia.",
  });
  render(
    createElement(RegistrationOtpStep, {
      initial: challenge(),
      onRestart: restart,
    }),
  );
  fireEvent.change(screen.getByTestId("register-otp"), {
    target: { value: "123456" },
  });
  await waitFor(() =>
    expect(restart).toHaveBeenCalledWith(
      "Sesi pendaftaran tidak tersedia.",
      "CHALLENGE_MISSING",
    ),
  );
  expect(mock.resend).not.toHaveBeenCalled();
});

it("expired challenges cannot verify and resend resets the field using server metadata", async () => {
  const initial = {
    ...challenge(),
    status: "expired" as const,
    expiresAt: Date.now() - 1,
    resendAvailableAt: Date.now() - 1,
  };
  mock.resend.mockResolvedValue({ ok: true, ...challenge() });
  render(createElement(RegistrationOtpStep, { initial, onRestart: vi.fn() }));
  fireEvent.change(screen.getByTestId("register-otp"), {
    target: { value: "123456" },
  });
  expect(mock.verify).not.toHaveBeenCalled();
  expect(
    (screen.getByTestId("auth-submit") as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(screen.getByRole("alert").textContent).toContain("kedaluwarsa");
  fireEvent.click(screen.getByTestId("registration-resend"));
  await waitFor(() =>
    expect((screen.getByTestId("register-otp") as HTMLInputElement).value).toBe(
      "",
    ),
  );
  expect(mock.verify).not.toHaveBeenCalled();
});
