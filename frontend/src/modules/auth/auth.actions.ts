"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { createSession, destroySession } from "@/lib/auth/session";
import { registerCustomer, authenticate, requestPasswordReset, resetPassword } from "./auth.service";
import { runAction } from "@/lib/action";

const registerSchema = z.object({
  name: z.string().min(2, "Nama minimal 2 karakter"),
  email: z.string().email("Email tidak valid"),
  phone: z.string().optional(),
  password: z.string().min(6, "Password minimal 6 karakter"),
  terms: z.string().optional(),
});

export async function registerAction(_prev: unknown, formData: FormData) {
  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0].message };
  }
  if (!parsed.data.terms) {
    return { ok: false, error: "Anda harus menyetujui syarat & ketentuan" };
  }

  // Registration uses this Server Action directly (not the REST route), so
  // validate the production signing secret here before creating the user.
  // This prevents a successful DB transaction from being followed by a
  // session-signing failure that looks like a generic registration error.
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
    return { ok: false, error: "Layanan autentikasi belum dikonfigurasi" };
  }

  const res = await runAction(async () => {
    const user = await registerCustomer(parsed.data);
    await createSession(user.id, user.email);
    return user;
  });
  if (!res.ok) return res;
  redirect("/account");
}

const loginSchema = z.object({
  identifier: z.string().min(1, "Email/No HP wajib diisi"),
  password: z.string().min(1, "Password wajib diisi"),
  redirectTo: z.string().optional(),
});

/** Only allow same-site relative paths to prevent open-redirect phishing. */
function safeRedirect(target: string | undefined, fallback = "/account"): string {
  if (target && target.startsWith("/") && !target.startsWith("//")) return target;
  return fallback;
}

export async function loginAction(_prev: unknown, formData: FormData) {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0].message };
  const res = await runAction(async () => {
    const user = await authenticate(parsed.data.identifier, parsed.data.password);
    await createSession(user.id, user.email);
    return user;
  });
  if (!res.ok) return res;
  redirect(safeRedirect(parsed.data.redirectTo));
}

export async function logoutAction() {
  destroySession();
  redirect("/");
}

export async function forgotPasswordAction(_prev: unknown, formData: FormData) {
  const email = String(formData.get("email") || "");
  if (!z.string().email().safeParse(email).success) {
    return { ok: false, error: "Email tidak valid" };
  }
  await requestPasswordReset(email);
  return { ok: true, message: "Jika email terdaftar, tautan reset telah dikirim." };
}

export async function resetPasswordAction(_prev: unknown, formData: FormData) {
  const token = String(formData.get("token") || "");
  const password = String(formData.get("password") || "");
  if (password.length < 6) return { ok: false, error: "Password minimal 6 karakter" };
  const res = await runAction(() => resetPassword(token, password));
  if (!res.ok) return res;
  redirect("/login");
}
