import { prisma } from "@/lib/prisma";
import type { VerifiedSession } from "./jwt";

/** Shared by every identity query; this is never a persistent user cache. */
export function activeSessionWhere(claims: VerifiedSession) {
  return {
    id: claims.sub,
    isActive: true,
    sessionVersion: claims.version,
    revokedSessions: { none: { tokenHash: claims.tokenHash, expiresAt: { gt: new Date() } } },
  };
}

export async function revokeSession(claims: VerifiedSession) {
  await prisma.sessionRevocation.upsert({
    where: { tokenHash: claims.tokenHash },
    create: { tokenHash: claims.tokenHash, userId: claims.sub, expiresAt: claims.expiresAt },
    update: {},
  });
}
