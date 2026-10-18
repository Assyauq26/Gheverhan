"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { createSession, destroySession } from "@/lib/auth/session";
import {
  requestRegistrationOtp,
  verifyRegistrationOtp,
  resendRegistrationOtp,
  authenticate,
  requestPasswordReset,
  resetPassword,
} from "./auth.service";
import { runAction } from "@/lib/action";

import {
  registrationSchema,
  registrationVerificationSchema,
  registrationResendSchema,
} from "./registration-schema";

export async function registerAction(_prev: unknown, formData: FormData) {
  const parsed = registrationSchema.safeParse({
    ...Object.fromEntries(formData),
    terms: formData.get("terms") === "1",
  });
  if (!parsed.success)
    return { ok: false, error: parsed.error.errors[0].message };
  const result = await runAction(() => requestRegistrationOtp(parsed.data));
  if (!result.ok) return { ok: false, error: result.error };
  return {
    ok: true,
    step: "verify",
    email: result.data!.email,
    challengeId: result.data!.challengeId,
    resendAvailableAt: result.data!.resendAvailableAt,
    message:
      "Kode OTP telah dikirim. Masukkan 6 angka dari email Anda (berlaku 10 menit).",
  };
}

export async function verifyRegistrationAction(
  _prev: unknown,
  formData: FormData,
) {
  const parsed = registrationVerificationSchema.safeParse(
    Object.fromEntries(formData),
  );
  if (!parsed.success)
    return { ok: false, error: parsed.error.errors[0].message };
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
    return { ok: false, error: "Layanan autentikasi belum dikonfigurasi." };
  }
  const result = await runAction(async () => {
    const user = await verifyRegistrationOtp(
      parsed.data.email,
      parsed.data.otp,
      parsed.data.challengeId,
    );
    await createSession(user.id, user.email, user.sessionVersion);
    return user;
  });
  if (!result.ok) return { ok: false, error: result.error };
  redirect("/account");
}

export async function resendRegistrationAction(
  _prev: unknown,
  formData: FormData,
) {
  const parsed = registrationResendSchema.safeParse(
    Object.fromEntries(formData),
  );
  if (!parsed.success)
    return { ok: false, error: parsed.error.errors[0].message };
  const result = await runAction(() =>
    resendRegistrationOtp(parsed.data.email, parsed.data.challengeId),
  );
  if (!result.ok) return { ok: false, error: result.error };
  return {
    ok: true,
    message: "Kode OTP baru telah dikirim ke email Anda.",
    resendAvailableAt: result.data!.resendAvailableAt,
  };
}

const loginSchema = z.object({
  identifier: z.string().min(1, "Email/No HP wajib diisi"),
  password: z.string().min(1, "Password wajib diisi"),
  redirectTo: z.string().optional(),
});

/** Only allow same-site relative paths to prevent open-redirect phishing. */
function safeRedirect(
  target: string | undefined,
  fallback = "/account",
): string {
  if (
    target &&
    target.startsWith("/") &&
    !target.startsWith("//") &&
    !/[\\\u0000-\u001f\u007f]/.test(target)
  )
    return target;
  return fallback;
}

export async function loginAction(_prev: unknown, formData: FormData) {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return { ok: false, error: parsed.error.errors[0].message };
  const res = await runAction(async () => {
    const user = await authenticate(
      parsed.data.identifier,
      parsed.data.password,
    );
    await createSession(user.id, user.email, user.sessionVersion);
    return user;
  });
  if (!res.ok) return res;
  redirect(safeRedirect(parsed.data.redirectTo));
}

export async function logoutAction() {
  await destroySession();
  redirect("/");
}

export async function forgotPasswordAction(_prev: unknown, formData: FormData) {
  const email = String(formData.get("email") || "");
  if (!z.string().email().safeParse(email).success) {
    return { ok: false, error: "Email tidak valid" };
  }
  const res = await runAction(() => requestPasswordReset(email));
  if (!res.ok) return res;
  return {
    ok: true,
    message: "Jika email terdaftar, tautan reset telah dikirim.",
  };
}

export async function resetPasswordAction(_prev: unknown, formData: FormData) {
  const token = String(formData.get("token") || "");
  const password = String(formData.get("password") || "");
  if (password.length < 6)
    return { ok: false, error: "Password minimal 6 karakter" };
  const res = await runAction(() => resetPassword(token, password));
  if (!res.ok) return res;
  redirect("/login");
}
