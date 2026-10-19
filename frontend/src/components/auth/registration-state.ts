import {
  REGISTRATION_OTP_STORAGE_KEY,
  type RegistrationChallenge,
} from "@/modules/auth/registration-contract";

export type StoredRegistration = Pick<
  RegistrationChallenge,
  "email" | "challengeId"
>;
export function storedRegistration(value: unknown): StoredRegistration | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<StoredRegistration>;
  return typeof item.email === "string" &&
    item.email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.email) &&
    typeof item.challengeId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      item.challengeId,
    )
    ? { email: item.email, challengeId: item.challengeId }
    : null;
}
export function asChallenge(value: unknown): RegistrationChallenge | null {
  const identity = storedRegistration(value);
  if (!identity) return null;
  const item = value as Partial<RegistrationChallenge>;
  if (
    ![item.expiresAt, item.serverNow, item.resendAvailableAt].every(
      (x) => typeof x === "number" && Number.isFinite(x),
    )
  )
    return null;
  if (!["active", "expired", "locked", "sending"].includes(item.status || ""))
    return null;
  return {
    ...identity,
    expiresAt: item.expiresAt!,
    resendAvailableAt: item.resendAvailableAt!,
    serverNow: item.serverNow!,
    status: item.status!,
  };
}
export function readRegistration(): StoredRegistration | null {
  try {
    const raw = window.sessionStorage.getItem(REGISTRATION_OTP_STORAGE_KEY);
    const value = raw ? storedRegistration(JSON.parse(raw)) : null;
    if (raw && !value) clearRegistration();
    return value;
  } catch {
    return null;
  }
}
export function rememberRegistration(value: StoredRegistration) {
  try {
    // Timing always comes from the server after reload. Never store password, code or client expiry.
    window.sessionStorage.setItem(
      REGISTRATION_OTP_STORAGE_KEY,
      JSON.stringify({ email: value.email, challengeId: value.challengeId }),
    );
  } catch {
    /* The live flow still works if storage is disabled. */
  }
}
export function clearRegistration() {
  try {
    window.sessionStorage.removeItem(REGISTRATION_OTP_STORAGE_KEY);
  } catch {
    /* Private browsing. */
  }
}
export function registrationFields(value: StoredRegistration) {
  const data = new FormData();
  data.set("email", value.email);
  data.set("challengeId", value.challengeId);
  return data;
}
export function formatOtpTime(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
