import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/http-error";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { credentialKeys, defaultJntEndpoint, jntEnvironments, jntKinds, validateJntEndpoint, type JntEnvironment, type JntKind } from "./jnt-protocol";

export type JntCredentials = Record<string, string>;
export const settingsInputSchema = z.object({
  environment: z.enum(jntEnvironments),
  kind: z.enum(jntKinds),
  endpoint: z.string().trim().max(300).url(),
  credentials: z.record(z.string().max(512)).default({}),
}).strict();
const VERSION = "v1";
function encryptionKey() {
  const raw = process.env.JNT_SETTINGS_ENCRYPTION_KEY;
  if (!raw || !/^[A-Za-z0-9+/=_-]{43,44}$/.test(raw)) throw new HttpError("Kunci enkripsi J&T belum dikonfigurasi", 503);
  const bytes = Buffer.from(raw, "base64url");
  if (bytes.length !== 32) throw new HttpError("Kunci enkripsi J&T harus 32 byte", 503);
  return bytes;
}
function encrypt(credentials: JntCredentials) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(credentials), "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(":");
}
function decrypt(input: string): JntCredentials {
  try {
    const [version, iv, tag, ciphertext, extra] = input.split(":");
    if (extra || version !== VERSION) throw new Error("Version");
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    const plain = Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
    return z.record(z.string()).parse(JSON.parse(plain));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError("Kredensial J&T tidak dapat didekripsi", 503);
  }
}
export async function requireJntSettingsManager() {
  const user = await requirePermission(PERMISSIONS.JNT_INTEGRATION_MANAGE);
  if (!user.isAdmin || !user.roles.some(role => role === "Admin" || role === "Super Admin")) throw new HttpError("Akses pemilik integrasi diperlukan", 403);
  return user;
}
export async function listJntSettings() {
  const rows = await prisma.jntApiSetting.findMany({
    select: { environment: true, kind: true, endpoint: true, updatedAt: true },
  });
  return jntEnvironments.flatMap(environment => jntKinds.map(kind => {
    const row = rows.find(row => row.environment === environment && row.kind === kind);
    return {
      environment, kind, endpoint: row?.endpoint || defaultJntEndpoint(environment, kind),
      configured: !!row, updatedAt: row?.updatedAt ?? null,
      // Credentials are never sent to any browser, even as masked placeholder text.
    };
  }));
}
export async function readJntCredentials(environment: JntEnvironment, kind: JntKind) {
  const row = await prisma.jntApiSetting.findUnique({ where: { environment_kind: { environment, kind } } });
  if (!row) throw new HttpError("API " + kind + " " + environment + " belum dikonfigurasi", 503);
  try {
    return { endpoint: validateJntEndpoint(environment, kind, row.endpoint), credentials: decrypt(row.encryptedCredentials) };
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError("Endpoint J&T tidak memenuhi kebijakan keamanan", 503);
  }
}
export async function saveJntSettings(value: unknown, actorId: string) {
  const input = settingsInputSchema.parse(value);
  let endpoint: string;
  try { endpoint = validateJntEndpoint(input.environment, input.kind, input.endpoint); }
  catch { throw new HttpError("Endpoint tidak sesuai dokumentasi resmi untuk environment ini", 422); }
  const allowed = credentialKeys[input.kind];
  if (Object.keys(input.credentials).some(key => !allowed.includes(key))) throw new HttpError("Nama field kredensial tidak valid", 422);
  const existing = await prisma.jntApiSetting.findUnique({ where: { environment_kind: { environment: input.environment, kind: input.kind } } });
  const previous = existing ? decrypt(existing.encryptedCredentials) : {};
  const merged: JntCredentials = {};
  for (const field of allowed) {
    const supplied = input.credentials[field]?.trim();
    const value = supplied || previous[field];
    if (!value || value.length > 512) throw new HttpError("Semua field kredensial wajib diisi saat konfigurasi awal", 422);
    merged[field] = value;
  }
  const encryptedCredentials = encrypt(merged);
  await prisma.$transaction(async tx => {
    await tx.jntApiSetting.upsert({
      where: { environment_kind: { environment: input.environment, kind: input.kind } },
      create: { environment: input.environment, kind: input.kind, endpoint, encryptedCredentials, lastModifiedBy: actorId },
      update: { endpoint, encryptedCredentials, lastModifiedBy: actorId },
    });
    await tx.auditLog.create({ data: {
      userId: actorId, action: "jnt.integration.updated", entity: "JntApiSetting",
      entityId: input.environment + ":" + input.kind,
      meta: { environment: input.environment, kind: input.kind, endpoint, credentialRotated: Object.values(input.credentials).some(Boolean) },
    } });
  });
  return { environment: input.environment, kind: input.kind, endpoint, configured: true };
}
