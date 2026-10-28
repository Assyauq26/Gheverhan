import { assertReviewSchema } from "../../src/modules/reviews/review-schema";
import { PrismaClient } from "@prisma/client";
import { assertSafeDatabaseOperation } from "../assert-safe-db-operation.mjs";
import { parseAppearance } from "../../src/modules/appearance/schema";
import { parseHero } from "../../src/modules/hero/schema";
assertSafeDatabaseOperation();
const db = new PrismaClient();
async function main() {
  await assertReviewSchema(db);
  const tables = await db.$queryRaw<
    { relname: string; relrowsecurity: boolean }[]
  >`SELECT relname,relrowsecurity FROM pg_class WHERE relname IN ('StoreAppearance','StoreAppearanceRevision','StoreBrandAsset','StoreCustomizeRateLimit')`;
  if (tables.length !== 4 || tables.some((t) => !t.relrowsecurity))
    throw new Error("Appearance schema or RLS missing");
  const heroTables = await db.$queryRaw<
    { relname: string; relrowsecurity: boolean }[]
  >`SELECT relname,relrowsecurity FROM pg_class WHERE relname IN ('StoreHero','StoreHeroAsset')`;
  if (heroTables.length !== 2 || heroTables.some(t => !t.relrowsecurity))
    throw new Error("Hero CMS schema or RLS missing");
  const grants = await db.$queryRaw<
    { table_name: string; privilege: string; allowed: boolean }[]
  >`
    SELECT t.table_name, p.privilege,
      has_table_privilege(current_user, format('%I', t.table_name), p.privilege) AS allowed
    FROM (VALUES ('StoreHero'), ('StoreHeroAsset')) AS t(table_name)
    CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) AS p(privilege)
  `;
  if (grants.some(g => !g.allowed))
    throw new Error("Hero CMS runtime role lacks required table privileges");
  const heroRow = await db.storeHero.findUnique({ where: { key: "primary" } });
  if (heroRow) {
    parseHero(heroRow.draft);
    parseHero(heroRow.published);
  }
  const permissions = await db.permission.findMany({
    where: { key: { startsWith: "store.customize." } },
    include: { roles: { include: { role: true } } },
  });
  if (
    permissions.length !== 3 ||
    permissions.some((p) =>
      p.roles.some((r) => !["Admin", "Super Admin"].includes(r.role.name)),
    )
  )
    throw new Error("Unexpected Customize grants");
  const row = await db.storeAppearance.findUnique({
    where: { key: "primary" },
  });
  if (row) {
    parseAppearance(row.draft);
    parseAppearance(row.published);
  }
  const provider = process.env.STORAGE_PROVIDER || "supabase";
  if (provider === "local" && !process.env.STORAGE_LOCAL_ROOT?.startsWith("/"))
    throw new Error("Local storage root missing");
  if (
    provider === "supabase" &&
    (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
  )
    throw new Error("Supabase storage bindings missing");
  if (!["local", "supabase"].includes(provider))
    throw new Error("Unknown storage provider");
  console.log(
    JSON.stringify({
      status: "PASS",
      tables: tables.length,
      permissions: permissions.length,
      heroTables: heroTables.length,
      heroPublishedVersion: heroRow?.publishedVersion ?? 0,
      provider,
      publishedVersion: row?.publishedVersion ?? 0,
      readOnly: true,
      verifiedReviewSchema: true,
      scope: "schema/config only; upload/provider contract tested separately",
    }),
  );
}
main()
  .catch(() => {
    console.error(
      "Customize preflight failed; inspect schema, permissions and storage configuration.",
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
