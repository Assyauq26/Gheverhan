"use server";
import { z } from "zod";
import { revalidateTag } from "next/cache";
import { requireCustomizePermission } from "@/modules/appearance/authorization";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { runAction } from "@/lib/action";
import { prisma } from "@/lib/prisma";
import { changeAppearance, readDraft } from "./service";
import { appearanceSessionHash } from "./session";
import { APPEARANCE_TAG } from "./published";
const command = z
  .object({
    kind: z.enum(["save", "discard", "reset", "publish", "rollback"]),
    draftVersion: z.number().int().nonnegative(),
    publishedVersion: z.number().int().nonnegative(),
    config: z.unknown().optional(),
    revision: z.number().int().nonnegative().optional(),
  })
  .strict();
export async function appearanceAction(value: unknown) {
  return runAction(async () => {
    const input = command.parse(value);
    const actor = await requireCustomizePermission(
      input.kind === "publish" || input.kind === "rollback"
        ? PERMISSIONS.STORE_CUSTOMIZE_PUBLISH
        : PERMISSIONS.STORE_CUSTOMIZE_UPDATE,
    );
    const result = await changeAppearance(
      input,
      actor.id,
      await appearanceSessionHash(),
    );
    if (input.kind === "publish" || input.kind === "rollback")
      revalidateTag(APPEARANCE_TAG);
    return result;
  });
}
export async function loadAppearance() {
  return runAction(async () => {
    await requireCustomizePermission(PERMISSIONS.STORE_CUSTOMIZE_READ);
    return readDraft();
  });
}
export async function appearanceHistory(before?: number) {
  return runAction(async () => {
    await requireCustomizePermission(PERMISSIONS.STORE_CUSTOMIZE_READ);
    if (before !== undefined) z.number().int().nonnegative().parse(before);
    return (
      await prisma.storeAppearanceRevision.findMany({
        where: before === undefined ? {} : { version: { lt: before } },
        orderBy: { version: "desc" },
        take: 25,
        select: { version: true, action: true, createdAt: true },
      })
    ).map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  });
}
