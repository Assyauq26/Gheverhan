import { PrismaClient } from "@prisma/client";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { isHelipodIdentity, verifyLocalMedia } from "./helipod-preflight.mjs";
import { verifyPrivateProductBucket } from "./storage-preflight";
import { migrationChecksumVariants } from "./migration-checksums.mjs";
// Read-only release check. Secret values and customer rows never enter output.
async function main() {
  const env = process.env;
  const helipod = isHelipodIdentity(env);
  const keys = [
    "DATABASE_URL",
    "DIRECT_URL",
    "JWT_SECRET",
    ...(!helipod ? ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] : ["PREFLIGHT_LEDGER_DATABASE_URL"]),
    "CRON_SECRET",
    "RESEND_API_KEY",
    "PASSWORD_RESET_FROM",
    "PASSWORD_RESET_BASE_URL",
  ];
  const presence = Object.fromEntries(
    keys.map((key) => [key, Boolean(env[key]?.trim())]),
  );
  const database = new URL(env.DATABASE_URL || "http://invalid");
  const direct = new URL(env.DIRECT_URL || "http://invalid");
  const local = [database, direct].every((url) =>
    ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname),
  );
  const expected = env.R21_EXPECTED_SUPABASE_REF;
  const matches = (url: URL) =>
    Boolean(
      expected &&
        /^[a-z0-9]{20}$/.test(expected) &&
        (url.hostname === `db.${expected}.supabase.co` ||
          (url.hostname.endsWith(".pooler.supabase.com") &&
            decodeURIComponent(url.username).endsWith(`.${expected}`))),
    );
  const sameDatabase =
    database.pathname === direct.pathname &&
    [database, direct].every(
      (url) =>
        ["postgres:", "postgresql:"].includes(url.protocol) &&
        (url.searchParams.get("schema") || "public") === "public",
    );
  const identity =
    sameDatabase &&
    (helipod || (local
      ? env.GHEVERHAN_ISOLATED_TESTS === "1"
      : matches(database) && matches(direct)));
  if (!identity || (!local && !helipod && env.R21_ALLOW_PRODUCTION_READ_ONLY !== "1")) {
    console.log(
      JSON.stringify({ status: "BLOCKED", databaseIdentity: false, presence }),
    );
    process.exitCode = 1;
    return;
  }
  const directory = path.join(process.cwd(), "prisma/migrations");
  const expectedLedger = new Map<string, Set<string>>();
  for (const name of await readdir(directory)) {
    if (!/^\d{14}_/.test(name)) continue;
    expectedLedger.set(
      name,
      migrationChecksumVariants(await readFile(path.join(directory, name, "migration.sql"))),
    );
  }
  const db = new PrismaClient();
  const ledgerDb = helipod ? new PrismaClient({ datasources: { db: { url: env.PREFLIGHT_LEDGER_DATABASE_URL } } }) : db;
  try {
    const ledger = await ledgerDb.$transaction(async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      await tx.$executeRaw`SET LOCAL statement_timeout = '5s'`;
      return tx.$queryRaw<{migration_name:string;checksum:string;finished:boolean;rolled_back:boolean}[]>`SELECT migration_name,checksum,finished_at IS NOT NULL AS finished,rolled_back_at IS NOT NULL AS rolled_back FROM public._prisma_migrations ORDER BY migration_name`;
    });
    const facts = await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        await tx.$executeRaw`SET LOCAL statement_timeout = '5s'`;
        const schema = await tx.$queryRaw<
          {
            productEditorV2: boolean;
            schemaUsage: boolean;
            catalogPrivileges: boolean;
            customOptions: boolean;
            directCheckout: boolean;
            revocation: boolean;
            limiter: boolean;
            version: boolean;
            indexes: boolean;
            normalizedIdentityIndexes: boolean;
            foreignKey: boolean;
            trusted: boolean;
            pending: boolean;
            verifiedAt: boolean;
            pendingIndexes: boolean;
            pendingColumns: boolean;
          }[]
        >`
        SELECT has_schema_privilege('public','USAGE') AS "schemaUsage",
        (SELECT count(*)=4 AND bool_and(NOT pg_catalog.row_security_active(c.oid)
          AND has_table_privilege(c.oid,'SELECT') AND has_table_privilege(c.oid,'INSERT')
          AND has_table_privilege(c.oid,'UPDATE') AND has_table_privilege(c.oid,'DELETE'))
          FROM pg_class c WHERE c.oid IN (to_regclass('public."Product"'),to_regclass('public."ProductImage"'),to_regclass('public."ProductVariant"'),to_regclass('public."Inventory"'))) AS "catalogPrivileges",
        (
          (SELECT count(*)=4 FROM information_schema.columns WHERE table_schema='public' AND table_name='Product' AND column_name IN ('weightGrams','packageLengthMm','packageWidthMm','packageHeightMm') AND data_type='integer' AND is_nullable='YES')
          AND (SELECT count(*)=2 AND bool_and(convalidated) FROM pg_constraint WHERE conrelid=to_regclass('public."Product"') AND conname IN ('Product_weightGrams_check','Product_packageDimensions_check'))
          AND (SELECT count(*)=2 AND bool_and(relrowsecurity AND NOT pg_catalog.row_security_active(oid) AND has_table_privilege(oid,'SELECT') AND has_table_privilege(oid,'INSERT') AND has_table_privilege(oid,'UPDATE') AND has_table_privilege(oid,'DELETE')) FROM pg_class WHERE oid IN (to_regclass('public."StagedProductMedia"'),to_regclass('public."ProductEditorSave"')))
          AND NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename IN ('StagedProductMedia','ProductEditorSave'))
          AND (SELECT count(*)=3 AND bool_and(convalidated) FROM pg_constraint WHERE conrelid IN (to_regclass('public."StagedProductMedia"'),to_regclass('public."ProductEditorSave"')) AND conname IN ('StagedProductMedia_purpose_check','StagedProductMedia_hash_check','ProductEditorSave_hash_check'))
          AND (SELECT count(*)=4 AND bool_and(i.indisvalid AND i.indisready)
            AND count(*) FILTER (WHERE i.indisprimary AND i.indnatts=1)=2
            AND count(*) FILTER (WHERE c.relname='StagedProductMedia_expiresAt_idx' AND i.indnatts=1 AND i.indkey[0]=(SELECT attnum FROM pg_attribute WHERE attrelid=i.indrelid AND attname='expiresAt'))=1
            AND count(*) FILTER (WHERE c.relname='StagedProductMedia_actorId_sessionHash_idx' AND i.indnatts=2 AND i.indkey[0]=(SELECT attnum FROM pg_attribute WHERE attrelid=i.indrelid AND attname='actorId') AND i.indkey[1]=(SELECT attnum FROM pg_attribute WHERE attrelid=i.indrelid AND attname='sessionHash'))=1
            FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE i.indrelid IN (to_regclass('public."StagedProductMedia"'),to_regclass('public."ProductEditorSave"')))
        ) AS "productEditorV2",
        (to_regclass('public."ProductOptionGroup"') IS NOT NULL AND to_regclass('public."ProductOptionValue"') IS NOT NULL AND to_regclass('public."ProductVariantOptionValue"') IS NOT NULL
          AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Product' AND column_name='optionsEnabled')
          AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ProductImage' AND column_name='isVariation')
          AND EXISTS(SELECT 1 FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid=i.indexrelid WHERE c.relname='ProductOptionGroup_one_image_group' AND i.indrelid=to_regclass('public."ProductOptionGroup"') AND i.indisunique AND i.indisvalid AND i.indisready AND i.indpred IS NOT NULL)
          AND (SELECT count(*)=3 AND bool_and(c.relrowsecurity AND NOT pg_catalog.row_security_active(c.oid) AND has_table_privilege(c.oid,'SELECT') AND has_table_privilege(c.oid,'INSERT') AND has_table_privilege(c.oid,'UPDATE') AND has_table_privilege(c.oid,'DELETE')) FROM pg_catalog.pg_class c WHERE c.oid IN (to_regclass('public."ProductOptionGroup"'),to_regclass('public."ProductOptionValue"'),to_regclass('public."ProductVariantOptionValue"')))
          AND EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE pronamespace=to_regnamespace('public') AND proname='gheverhan_backfill_legacy_options' AND NOT prosecdef AND has_function_privilege(oid,'EXECUTE'))
          AND (SELECT count(*)=5 AND bool_and(tgdeferrable AND tginitdeferred AND tgenabled='O') FROM pg_catalog.pg_trigger WHERE tgrelid IN (to_regclass('public."Product"'),to_regclass('public."ProductOptionGroup"'),to_regclass('public."ProductOptionValue"'),to_regclass('public."ProductVariant"'),to_regclass('public."ProductVariantOptionValue"')) AND tgname IN ('Product_options_integrity','ProductOptionGroup_integrity','ProductOptionValue_integrity','ProductVariant_options_integrity','ProductVariantOptionValue_integrity')) AND (SELECT count(*)=5 AND bool_and(convalidated) FROM pg_catalog.pg_constraint WHERE contype='f' AND conrelid IN (to_regclass('public."ProductOptionGroup"'),to_regclass('public."ProductOptionValue"'),to_regclass('public."ProductVariantOptionValue"')))) AS "customOptions",
        (SELECT count(*)=1 AND bool_and(c.relrowsecurity AND NOT pg_catalog.row_security_active(c.oid)
          AND has_table_privilege(c.oid,'SELECT') AND has_table_privilege(c.oid,'INSERT') AND has_table_privilege(c.oid,'UPDATE') AND has_table_privilege(c.oid,'DELETE'))
          FROM pg_catalog.pg_class c WHERE c.oid=to_regclass('public."CheckoutIntent"'))
          AND (SELECT count(*)=4 AND bool_and(indisvalid AND indisready)
          AND count(*) FILTER (WHERE c.relname='CheckoutIntent_orderId_key' AND indisunique AND indnatts=1 AND indkey[0]=(SELECT attnum FROM pg_catalog.pg_attribute WHERE attrelid=i.indrelid AND attname='orderId'))=1
          FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid=i.indexrelid WHERE i.indrelid=to_regclass('public."CheckoutIntent"') AND c.relname IN ('CheckoutIntent_pkey','CheckoutIntent_orderId_key','CheckoutIntent_expiresAt_idx','CheckoutIntent_userId_idx'))
          AND (SELECT count(*)=4 AND bool_and(convalidated) FROM pg_catalog.pg_constraint WHERE conrelid=to_regclass('public."CheckoutIntent"') AND conname IN ('CheckoutIntent_userId_fkey','CheckoutIntent_quantity_check','CheckoutIntent_owner_check','CheckoutIntent_consumed_check'))
          AND NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='CheckoutIntent') AS "directCheckout",
        to_regclass('public."SessionRevocation"') IS NOT NULL AS revocation,
        to_regclass('public."AuthRateLimit"') IS NOT NULL AS limiter,
        to_regclass('public."PendingRegistration"') IS NOT NULL AS pending,
        EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='User' AND column_name='emailVerifiedAt' AND data_type='timestamp without time zone' AND is_nullable='YES') AS "verifiedAt",
        (SELECT count(*) FILTER (WHERE i.indisprimary AND i.indnatts=1 AND i.indkey[0]=(SELECT attnum FROM pg_catalog.pg_attribute WHERE attrelid=i.indrelid AND attname='id'))=1
          AND count(*) FILTER (WHERE i.indisunique AND i.indnatts=1 AND i.indkey[0]=(SELECT attnum FROM pg_catalog.pg_attribute WHERE attrelid=i.indrelid AND attname='email'))=1
          AND count(*) FILTER (WHERE i.indnatts=1 AND i.indkey[0]=(SELECT attnum FROM pg_catalog.pg_attribute WHERE attrelid=i.indrelid AND attname='expiresAt'))>=1
          AND bool_and(i.indisvalid AND i.indisready) FROM pg_catalog.pg_index i WHERE i.indrelid=to_regclass('public."PendingRegistration"')) AS "pendingIndexes",
        NOT EXISTS ((VALUES ('id','text','NO'),('email','text','NO'),('name','text','NO'),('phone','text','NO'),('passwordHash','text','NO'),('codeHash','text','NO'),('attempts','integer','NO'),('expiresAt','timestamp without time zone','NO'),('sentAt','timestamp without time zone','NO'),('createdAt','timestamp without time zone','NO'))
          EXCEPT SELECT column_name::text,data_type::text,is_nullable::text FROM information_schema.columns WHERE table_schema='public' AND table_name='PendingRegistration') AS "pendingColumns",
        EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='User' AND column_name='sessionVersion' AND data_type='integer' AND is_nullable='NO' AND column_default IN ('0','0::integer')) AS version,
        (SELECT count(*)=5 AND bool_and(i.indisvalid AND i.indisready) FROM pg_catalog.pg_index i WHERE i.indrelid IN (to_regclass('public."SessionRevocation"'),to_regclass('public."AuthRateLimit"'))) AS indexes,
        (SELECT count(*)=2 AND bool_and(i.indisvalid AND i.indisready AND NOT i.indisunique AND i.indexprs IS NOT NULL
          AND CASE c.relname WHEN 'User_registration_email_normalized_idx' THEN pg_get_expr(i.indexprs,i.indrelid) LIKE '%lower(btrim(%email%'
            ELSE pg_get_expr(i.indexprs,i.indrelid) LIKE '%CASE%translate(%phone%' END)
          FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid=i.indexrelid
          WHERE i.indrelid=to_regclass('public."User"') AND c.relname IN ('User_registration_email_normalized_idx','User_registration_phone_normalized_idx')) AS "normalizedIdentityIndexes",
        (SELECT count(*)=1 AND bool_and(confdeltype='c' AND confupdtype='c' AND confrelid=to_regclass('public."User"')) FROM pg_catalog.pg_constraint WHERE conrelid=to_regclass('public."SessionRevocation"') AND contype='f') AS "foreignKey",
        (SELECT count(*)=3 AND bool_and(c.relrowsecurity AND NOT pg_catalog.row_security_active(c.oid)
          AND has_table_privilege(c.oid,'SELECT') AND has_table_privilege(c.oid,'INSERT') AND has_table_privilege(c.oid,'UPDATE') AND has_table_privilege(c.oid,'DELETE'))
          FROM pg_catalog.pg_class c WHERE c.oid IN (to_regclass('public."SessionRevocation"'),to_regclass('public."AuthRateLimit"'),to_regclass('public."PendingRegistration"'))) AS trusted`;
        const settings = await tx.$queryRaw<
          {
            role: string;
            version: string;
            max_connections: string;
            lock_timeout: string;
          }[]
        >`
        SELECT current_user AS role,current_setting('server_version') AS version,current_setting('max_connections') AS max_connections,current_setting('lock_timeout') AS lock_timeout`;
        return { ledger, schema: schema[0], settings: settings[0] };
      },
      { timeout: 10000 },
    );
    const active = facts.ledger.filter((row) => !row.rolled_back);
    const ledgerMatches =
      active.length === expectedLedger.size &&
      new Set(active.map((row) => row.migration_name)).size ===
        expectedLedger.size &&
      active.every((row) => row.finished) &&
      facts.ledger.every(
        (row) => expectedLedger.get(row.migration_name)?.has(row.checksum) === true,
      );
    const schemaReady =
      facts.schema.schemaUsage &&
      facts.schema.catalogPrivileges &&
      facts.schema.productEditorV2 &&
      facts.schema.directCheckout &&
      facts.schema.customOptions &&
      facts.schema.revocation &&
      facts.schema.limiter &&
      facts.schema.version &&
      facts.schema.indexes &&
      facts.schema.foreignKey &&
      facts.schema.trusted &&
      facts.schema.pending &&
      facts.schema.verifiedAt &&
      facts.schema.pendingIndexes &&
      facts.schema.pendingColumns &&
      facts.schema.normalizedIdentityIndexes;
    const maintenanceMode = ["0", "1"].includes(env.MAINTENANCE_MODE || "")
      ? env.MAINTENANCE_MODE
      : "UNCONFIGURED";
    const configReady =
      maintenanceMode !== "UNCONFIGURED" &&
      Object.values(presence).every(Boolean) &&
      (env.JWT_SECRET?.length || 0) >= 16;
    const productStorage = helipod ? await verifyLocalMedia(env) : local
      ? { status: "NOT APPLICABLE", reason: "LOCAL_MOCK_STORAGE_TESTED_SEPARATELY" }
      : await verifyPrivateProductBucket(env);
    const storageReady = local || productStorage.status === "PASS";
    console.log(
      JSON.stringify(
        {
          status:
            ledgerMatches && schemaReady && configReady && storageReady ? "PASS" : "BLOCKED",
          readOnly: true,
          databaseIdentity: true,
          local,
          maintenanceMode,
          presence,
          ledgerMatches,
          schema: facts.schema,
          databaseSettings: facts.settings,
          configPresenceReady: configReady,
          productStorage,
          limitations: [
            "Presence is not provider delivery/key-entropy verification",
            "Private bucket metadata does not prove object policies, upload delivery, cleanup capacity or recovery",
            "Does not prove backup, pool budget or owner approval",
          ],
        },
        null,
        2,
      ),
    );
    if (!ledgerMatches || !schemaReady || !configReady || !storageReady) process.exitCode = 1;
  } finally {
    await db.$disconnect();
    if (ledgerDb !== db) await ledgerDb.$disconnect();
  }
}
main().catch(() => {
  console.error(
    "Release preflight BLOCKED: database/configuration check failed; no write was attempted",
  );
  process.exitCode = 1;
});
