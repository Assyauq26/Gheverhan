import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/response";

type AuthOperation = "login" | "register" | "reset" | "resetConfirm";
const policies = {
  login: { perIdentity: 10, windowMs: 15 * 60_000, global: 300 },
  register: { perIdentity: 3, windowMs: 60 * 60_000, global: 30 },
  resetConfirm: { perIdentity: 3, windowMs: 60 * 60_000, global: 60 },
  reset: { perIdentity: 3, windowMs: 60 * 60_000, global: 30 },
} as const;

/** Atomic PostgreSQL counter, shared by serverless instances. No raw identity/IP stored. */
export async function consumeAuthBucket(bucket: string, limit: number, expiresAt: Date) {
  const rows = await prisma.$queryRaw<{ attempts: number }[]>`
    INSERT INTO "AuthRateLimit" ("bucket", "attempts", "expiresAt") VALUES (${bucket}, 1, ${expiresAt})
    ON CONFLICT ("bucket") DO UPDATE SET "attempts" = "AuthRateLimit"."attempts" + 1
    WHERE "AuthRateLimit"."attempts" < ${limit}
    RETURNING "attempts"`;
  if (!rows.length) throw new HttpError("Terlalu banyak percobaan. Coba lagi nanti.", 429);
  return rows[0].attempts;
}

export async function enforceAuthRateLimit(operation: AuthOperation, identifier: string) {
  const now = Date.now();
  const policy = policies[operation];
  const minute = Math.floor(now / 60_000);
  const count = await consumeAuthBucket(`${operation}:global:${minute}`, policy.global, new Date((minute + 1) * 60_000));
  if (count === 1) {
    // Indexed, opportunistic retention cleanup. A DB error must fail closed.
    await prisma.authRateLimit.deleteMany({ where: { expiresAt: { lt: new Date(now) } } });
    await prisma.sessionRevocation.deleteMany({ where: { expiresAt: { lt: new Date(now) } } });
  }
  const identity = createHash("sha256").update(identifier.toLowerCase().trim()).digest("hex");
  const window = Math.floor(now / policy.windowMs);
  await consumeAuthBucket(`${operation}:${identity}:${window}`, policy.perIdentity, new Date((window + 1) * policy.windowMs));
}
