import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { HttpError } from "@/lib/response";
import { parseAppearance } from "./schema";
import { initialPublishedAppearance } from "./initial";

/** Request-local only: never use the public/persistent appearance cache for drafts. */
export const getDashboardIdentity = cache(async () => {
  const user = await getCurrentUser(false);
  if (!user) throw new HttpError("Harap login", 401);
  if (!user.isAdmin) throw new HttpError("Akses admin diperlukan", 403);
  const row = await prisma.storeAppearance.findUnique({
    where: { key: "primary" },
    select: { draft: true, draftVersion: true, publishedVersion: true },
  });
  return {
    identity: (row ? parseAppearance(row.draft) : initialPublishedAppearance()).identity,
    draftVersion: row?.draftVersion ?? 0,
    publishedVersion: row?.publishedVersion ?? 0,
  };
});
