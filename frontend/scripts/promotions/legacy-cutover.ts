/** Reviewed database-first release tool. No implicit conversion or default Production write. */
import { readFile } from "node:fs/promises";
import { prisma } from "../../src/lib/prisma";
import {
  saveCampaign,
  retireLegacy,
} from "../../src/modules/promotions/campaign.service";
import { ADMIN_ROLES } from "../../src/lib/auth/permissions";
import { HttpError } from "../../src/lib/http-error";
import { assertSafeDatabaseOperation } from "../assert-safe-db-operation.mjs";
async function main() {
  assertSafeDatabaseOperation();
  const mode = process.argv[2] ?? "inventory";
  if (mode === "inventory") {
    const rows = await prisma.product.findMany({
      where: {
        OR: [
          { isFlashSale: true },
          { flashSalePrice: { not: null } },
          { flashSaleStartsAt: { not: null } },
          { flashSaleEndsAt: { not: null } },
        ],
      },
      select: {
        id: true,
        name: true,
        basePrice: true,
        salePrice: true,
        isFlashSale: true,
        flashSalePrice: true,
        flashSaleStartsAt: true,
        flashSaleEndsAt: true,
      },
      orderBy: { id: "asc" },
      take: 1001,
    });
    if (rows.length > 1000)
      throw new HttpError(
        "Inventaris melebihi batas1000; hentikan dan tinjau batching.",
        422,
      );
    console.log(
      JSON.stringify({ readOnly: true, count: rows.length, products: rows }),
    );
    return;
  }
  if (
    mode !== "apply" ||
    process.env.GHEVERHAN_FLASH_CUTOVER_APPROVED !==
      "CONVERT_LEGACY_FLASH_SALE" ||
    !process.argv[3]
  )
    throw new HttpError(
      "BLOCKED: explicit cutover approval and reviewed mapping file required",
      403,
    );
  const bytes = await readFile(process.argv[3]);
  if (bytes.length > 65536) throw new HttpError("Mapping terlalu besar", 422);
  const mapping = JSON.parse(bytes.toString()) as {
    actorId: string;
    campaigns: unknown[];
    retire?: unknown[];
  };
  if (
    typeof mapping.actorId !== "string" ||
    mapping.actorId.length > 64 ||
    !Array.isArray(mapping.campaigns) ||
    (!mapping.campaigns.length && !mapping.retire?.length) ||
    mapping.campaigns.length > 20 ||
    (mapping.retire?.length ?? 0) > 200
  )
    throw new HttpError("Mapping tidak valid", 422);
  const user = await prisma.user.findUnique({
    where: { id: mapping.actorId },
    include: {
      roles: {
        include: {
          role: { include: { permissions: { include: { permission: true } } } },
        },
      },
    },
  });
  if (!user?.isActive) throw new HttpError("Administrator tidak aktif", 403);
  const actor = {
    id: user.id,
    isAdmin: user.roles.some((r) => ADMIN_ROLES.includes(r.role.name)),
    permissions: [
      ...new Set(
        user.roles.flatMap((r) =>
          r.role.permissions.map((p) => p.permission.key),
        ),
      ),
    ],
  };
  for (const item of mapping.retire ?? []) await retireLegacy(actor, item);
  for (const campaign of mapping.campaigns) {
    if (
      !campaign ||
      typeof campaign !== "object" ||
      !("resolveLegacy" in campaign) ||
      campaign.resolveLegacy !== true
    )
      throw new HttpError(
        "Each mapping must explicitly acknowledge legacy conversion",
        422,
      );
    await saveCampaign(actor, campaign);
  }
  console.log(
    JSON.stringify({
      status: "PASS",
      campaigns: mapping.campaigns.length,
      scope: "approved campaign mappings only; each campaign is atomic",
    }),
  );
}
main()
  .catch((e) => {
    console.error(
      e instanceof HttpError
        ? e.message
        : "Cutover failed; inspect reviewed mapping and database availability. Details suppressed.",
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
