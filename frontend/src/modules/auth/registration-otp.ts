import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { HttpError } from "@/lib/response";

/** Normalize Indonesian phone numbers for future WhatsApp use; validate new accounts only. */
export function normalizeRegistrationPhone(input: string): string {
  const compact = input.trim().replace(/[\s().-]/g, "");
  const normalized = compact.startsWith("0")
    ? "+62" + compact.slice(1)
    : compact.startsWith("62")
      ? "+" + compact
      : compact;
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    throw new HttpError(
      "Nomor HP wajib diisi dalam format valid, mis. 081234567890.",
      400,
    );
  }
  return normalized;
}

export function generateRegistrationOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}
function secret(): string {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 16)
    throw new HttpError("Layanan autentikasi belum dikonfigurasi.", 503);
  return value;
}
export function hashRegistrationOtp(
  email: string,
  code: string,
  challengeId: string,
): string {
  return createHmac("sha256", secret())
    .update("register:")
    .update(email.toLowerCase().trim())
    .update(":")
    .update(code)
    .update(":")
    .update(challengeId)
    .digest("hex");
}
export function compareRegistrationOtp(
  email: string,
  code: string,
  hash: string,
  challengeId: string,
): boolean {
  if (!/^[a-f0-9]{64}$/.test(hash)) return false;
  return timingSafeEqual(
    Buffer.from(hashRegistrationOtp(email, code, challengeId), "hex"),
    Buffer.from(hash, "hex"),
  );
}
