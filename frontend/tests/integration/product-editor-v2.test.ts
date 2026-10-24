import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer, type Server } from "node:http";
import type { PrismaClient } from "@prisma/client";
import { PERMISSIONS } from "../../src/lib/auth/permissions";
import type { CatalogActor } from "../../src/modules/catalog/product-management.validation";
const target = new URL(
  process.env.SPRINT1_TEST_DATABASE_URL || "http://invalid",
);
assert.ok(["127.0.0.1", "localhost"].includes(target.hostname));
assert.equal(target.pathname, "/gheverhan_sprint1_test");
assert.equal(process.env.GHEVERHAN_ISOLATED_TESTS, "1");
process.env.DATABASE_URL = target.toString();
process.env.DIRECT_URL = target.toString();
let db: PrismaClient, actor: CatalogActor, server: Server;
let svc: typeof import("../../src/modules/catalog/product-management.service");
let media: typeof import("../../src/modules/catalog/staged-product-media");
const sessionHash = "a".repeat(64),
  otherSession = "b".repeat(64),
  objects = new Map<string, Buffer>();
let failUpload = false, failDelete = false;
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=",
  "base64",
);
const input = () => ({
  name: "Dummy editor V2",
  slug: "v2-" + randomUUID(),
  basePrice: 100000,
  variants: [{ sku: "V2-" + randomUUID(), onHand: 5 }],
  images: [] as { id: string; alt: string }[],
  weightGrams: 500,
  packageLengthMm: 300,
  packageWidthMm: 200,
  packageHeightMm: 50,
});
before(async () => {
  db = (await import("../../src/lib/prisma")).prisma;
  svc = await import("../../src/modules/catalog/product-management.service");
  media = await import("../../src/modules/catalog/staged-product-media");
  const user = await db.user.create({
    data: {
      name: "Dummy editor V2",
      email: randomUUID() + "@example.test",
      passwordHash: "dummy-only",
    },
  });
  actor = {
    id: user.id,
    isAdmin: true,
    permissions: Object.values(PERMISSIONS),
  };
  server = createServer(async (req, res) => {
    const pathname = new URL(req.url!, "http://localhost").pathname;
    if (pathname.startsWith("/storage/v1/object/public/") ||
        req.headers.authorization !== "Bearer dummy-local" ||
        req.headers.apikey !== "dummy-local") {
      res.writeHead(403).end();
      return;
    }
    if (req.method === "DELETE") {
      if (failDelete) { res.writeHead(503).end(); return; }
      const parts: Buffer[] = [];
      for await (const part of req) parts.push(Buffer.from(part));
      for (const key of JSON.parse(Buffer.concat(parts).toString()).prefixes)
        objects.delete("/storage/v1/object/product-images/" + key);
      res.end("{}");
      return;
    }
    if (req.method === "POST") {
      if (failUpload) {
        res.writeHead(503).end();
        return;
      }
      const parts: Buffer[] = [];
      for await (const part of req) parts.push(Buffer.from(part));
      if (objects.has(pathname)) {
        res.writeHead(409).end();
        return;
      }
      objects.set(pathname, Buffer.concat(parts));
      res.end("{}");
      return;
    }
    const body = objects.get(pathname);
    if (!body) {
      res.writeHead(404).end();
      return;
    }
    res.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  process.env.SUPABASE_URL = `http://127.0.0.1:${address.port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "dummy-local";
});
after(async () => {
  await db?.$disconnect();
  await new Promise<void>((resolve) => server?.close(() => resolve()));
});
test("product editor V2 database, media and compatibility", async (t) => {
  await t.test(
    "create/read/edit/reload shipping; drafts allow null; publish requires weight",
    async () => {
      const data = input(),
        created = await svc.createManagedProduct(actor, data);
      let p = await svc.getManagedProduct(actor, created.id);
      assert.equal(p.weightGrams, 500);
      assert.equal(p.packageHeightMm, 50);
      await svc.updateManagedProduct(actor, p.id, p.updatedAt, {
        ...p,
        weightGrams: 750,
        packageHeightMm: 125,
      });
      p = await svc.getManagedProduct(actor, p.id);
      assert.equal(p.weightGrams, 750);
      assert.equal(p.packageHeightMm, 125);
      const legacy = await svc.createManagedProduct(actor, {
        ...input(),
        weightGrams: null,
        packageLengthMm: null,
        packageWidthMm: null,
        packageHeightMm: null,
      });
      await db.productImage.create({
        data: { productId: legacy.id, url: "/dummy.png" },
      });
      const old = await svc.getManagedProduct(actor, legacy.id);
      await assert.rejects(
        svc.changeProductStatus(actor, old.id, old.updatedAt, "PUBLISHED"),
        /berat paket/,
      );
      await db.product.update({
        where: { id: old.id },
        data: { status: "PUBLISHED" },
      });
      const published = await svc.getManagedProduct(actor, old.id);
      await svc.updateManagedProduct(actor, old.id, published.updatedAt, {
        ...published,
        description: "Unrelated legacy edit",
      });
      assert.equal(
        (await svc.getManagedProduct(actor, old.id)).weightGrams,
        null,
      );
      const legacyAgain = await svc.getManagedProduct(actor, old.id);
      await assert.rejects(
        svc.updateManagedProduct(actor, old.id, legacyAgain.updatedAt, {
          ...legacyAgain,
          packageLengthMm: 300,
          packageWidthMm: 200,
          packageHeightMm: 100,
        }),
        { status: 422 },
      );
      await svc.updateManagedProduct(actor, old.id, legacyAgain.updatedAt, {
        ...legacyAgain,
        weightGrams: 600,
        packageLengthMm: 300,
        packageWidthMm: 200,
        packageHeightMm: 100,
      });
      const weighted = await svc.getManagedProduct(actor, old.id);
      await assert.rejects(
        svc.updateManagedProduct(actor, old.id, weighted.updatedAt, {
          ...weighted,
          weightGrams: null,
        }),
        { status: 422 },
      );
    },
  );
  await t.test(
    "staging does not create Product/Image; owner/session isolation, retry and signature checks",
    async () => {
      const before = await db.product.count(),
        id = randomUUID();
      const first = await media.stageProductMedia(
        actor,
        sessionHash,
        id,
        png,
        "image/png",
        "gallery",
      );
      assert.deepEqual(
        await media.stageProductMedia(
          actor,
          sessionHash,
          id,
          png,
          "image/png",
          "gallery",
        ),
        first,
      );
      assert.equal(await db.product.count(), before);
      assert.equal(await db.productImage.count({ where: { id } }), 0);
      await assert.rejects(media.readStagedMedia(actor, otherSession, id), {
        status: 404,
      });
      await assert.rejects(
        media.readStagedMedia({ ...actor, id: randomUUID() }, sessionHash, id),
        { status: 404 },
      );
      await assert.rejects(
        media.stageProductMedia(
          actor,
          otherSession,
          id,
          png,
          "image/png",
          "gallery",
        ),
        { status: 409 },
      );
      await assert.rejects(
        media.stageProductMedia(
          actor,
          sessionHash,
          randomUUID(),
          Buffer.from("not png"),
          "image/png",
          "gallery",
        ),
        { status: 422 },
      );
      await assert.rejects(
        media.stageProductMedia(
          { ...actor, permissions: [] },
          sessionHash,
          randomUUID(),
          png,
          "image/png",
          "gallery",
        ),
        { status: 403 },
      );
      assert.ok(await media.readStagedMedia(actor, sessionHash, id));
    },
  );
  await t.test(
    "finalize photo and product in one transaction; lost-response retry creates once",
    async () => {
      const id = randomUUID();
      await media.stageProductMedia(
        actor,
        sessionHash,
        id,
        png,
        "image/png",
        "gallery",
      );
      const data = { ...input(), images: [{ id, alt: "Dummy" }] },
        ctx = { sessionHash, requestId: randomUUID() };
      const results = await Promise.all([
        svc.createManagedProduct(actor, data, ctx),
        svc.createManagedProduct(actor, data, ctx),
      ]);
      assert.equal(results[0].id, results[1].id);
      assert.equal(await db.product.count({ where: { slug: data.slug } }), 1);
      assert.equal(
        (await db.stagedProductMedia.findUniqueOrThrow({ where: { id } }))
          .productId,
        results[0].id,
      );
      const p = await svc.getManagedProduct(actor, results[0].id);
      assert.equal(p.images[0].id, id);
      assert.match(p.images[0].url, /api\/v1\/product-images/);
      await assert.rejects(
        svc.createManagedProduct(actor, { ...data, name: "Changed" }, ctx),
        { status: 409 },
      );
      await media.cancelStagedMedia(actor, sessionHash, id);
      assert.ok(await db.productImage.findUnique({ where: { id } }));
      await svc.changeProductStatus(actor, p.id, p.updatedAt, "PUBLISHED");
    },
  );
  await t.test(
    "roll-forward recovery reads legacy and finalized staged media from a fresh process without rewriting data",
    async () => {
      const images = await import("../../src/modules/catalog/product-images.service");
      const made = await svc.createManagedProduct(actor, input());
      let product = await svc.getManagedProduct(actor, made.id);
      await images.uploadProductImage(
        actor, product.id, product.updatedAt, png, "image/png", "Legacy recovery",
      );
      product = await svc.getManagedProduct(actor, made.id);
      const stagedId = randomUUID();
      await media.stageProductMedia(actor, sessionHash, stagedId, png, "image/png", "gallery");
      await svc.updateManagedProduct(actor, product.id, product.updatedAt, {
        ...product,
        images: [...product.images, { id: stagedId, alt: "Staged recovery" }],
      }, { sessionHash, requestId: randomUUID() });
      const snapshot = async () => JSON.stringify({
        product: await db.product.findUniqueOrThrow({ where: { id: made.id } }),
        images: await db.productImage.findMany({ where: { productId: made.id }, orderBy: { id: "asc" } }),
        variants: await db.productVariant.findMany({ where: { productId: made.id }, orderBy: { id: "asc" } }),
        finalized: await db.stagedProductMedia.findUniqueOrThrow({ where: { id: stagedId } }),
      });
      const beforeRecovery = await snapshot();
      // A fresh process models a recovery deployment with the compatible reader.
      // It inherits only the isolated localhost DB and dummy Storage fixture config.
      const script = `
        const assert = require("node:assert/strict");
        const { createHash } = require("node:crypto");
        const { prisma } = require("./src/lib/prisma.ts");
        const { readManagedProductImage } = require("./src/modules/catalog/product-images.service.ts");
        (async () => {
          try {
            const rows = await prisma.productImage.findMany({ where: { productId: ${JSON.stringify(made.id)} } });
            assert.equal(rows.length, 2);
            for (const row of rows) {
              const image = await readManagedProductImage(row);
              assert.equal(image.contentType, "image/png");
              assert.equal(createHash("sha256").update(image.data).digest("hex"), ${JSON.stringify(createHash("sha256").update(png).digest("hex"))});
            }
            const staged = rows.find(row => row.id === ${JSON.stringify(stagedId)});
            assert.ok(staged.url.includes("staged-"));
            await assert.rejects(readManagedProductImage({ ...staged, id: "wrong-image" }), { status: 404 });
            process.stdout.write("RECOVERY_READERS_PASS");
          } finally { await prisma.$disconnect(); }
        })().catch(() => { process.stderr.write("RECOVERY_READERS_FAILED"); process.exitCode = 1; });
      `;
      const child = await promisify(execFile)(process.execPath, ["--import", "tsx", "--eval", script], { timeout: 30000 });
      assert.equal(child.stdout, "RECOVERY_READERS_PASS");
      assert.equal(await snapshot(), beforeRecovery, "Recovery reader must not mutate product, SKU, image or finalization metadata");
      await media.cancelStagedMedia(actor, sessionHash, stagedId);
      await media.cleanupStagedMedia();
      assert.equal(await snapshot(), beforeRecovery, "Cleanup must preserve finalized media after recovery");
    },
  );
  await t.test(
    "private Storage denies anonymous/public paths but serves legacy and staged readers with server credentials",
    async () => {
      const id = randomUUID();
      await media.stageProductMedia(actor, sessionHash, id, png, "image/png", "gallery");
      await svc.createManagedProduct(actor, { ...input(), images: [{ id, alt: "Private fixture" }] }, { sessionHash, requestId: randomUUID() });
      const row = await db.productImage.findUniqueOrThrow({ where: { id } });
      const objectPath = new URL(row.url, "http://localhost").searchParams.get("object")!;
      assert.equal((await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/product-images/${objectPath}`)).status, 403);
      assert.equal((await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/public/product-images/${objectPath}`)).status, 403);
      const { readManagedProductImage } = await import("../../src/modules/catalog/product-images.service");
      assert.deepEqual(Buffer.from((await readManagedProductImage(row)).data), png);
    },
  );
  await t.test(
    "cleanup reports bounded failures, preserves grace tombstones and retries without touching finalized media",
    async () => {
      const ids = [randomUUID(), randomUUID()];
      for (const id of ids) {
        await media.stageProductMedia(actor, sessionHash, id, png, "image/png", "gallery");
      }
      await db.stagedProductMedia.updateMany({ where: { id: { in: ids } }, data: { expiresAt: new Date(0), cancelledAt: new Date(0) } });
      const finalizedBefore = await db.stagedProductMedia.count({ where: { productId: { not: null } } });
      failDelete = true;
      let failed;
      try { failed = await media.cleanupStagedMedia(); }
      finally { failDelete = false; }
      assert.ok(failed.scanned <= 5);
      assert.ok(failed.failed >= 2);
      assert.equal(failed.deleted, 0);
      assert.equal(await db.stagedProductMedia.count({ where: { id: { in: ids } } }), 2);
      const recovered = await media.cleanupStagedMedia();
      assert.ok(recovered.deleted >= 2);
      assert.equal(recovered.failed, 0);
      assert.equal(await db.stagedProductMedia.count({ where: { id: { in: ids } } }), 0);
      assert.equal(await db.stagedProductMedia.count({ where: { productId: { not: null } } }), finalizedBefore);
    },
  );
  await t.test(
    "foreign/session media cannot be associated; failed writes roll back finalization",
    async () => {
      const id = randomUUID();
      await media.stageProductMedia(
        actor,
        sessionHash,
        id,
        png,
        "image/png",
        "gallery",
      );
      const data = { ...input(), images: [{ id, alt: "" }] };
      await assert.rejects(
        svc.createManagedProduct(actor, data, {
          sessionHash: otherSession,
          requestId: randomUUID(),
        }),
        { status: 409 },
      );
      assert.equal(await db.product.count({ where: { slug: data.slug } }), 0);
      const existing = await svc.createManagedProduct(actor, input());
      const variant = await db.productVariant.findFirstOrThrow({
        where: { productId: existing.id },
      });
      await assert.rejects(
        svc.createManagedProduct(
          actor,
          { ...data, variants: [{ sku: variant.sku }] },
          { sessionHash, requestId: randomUUID() },
        ),
        { status: 409 },
      );
      assert.equal(
        (await db.stagedProductMedia.findUniqueOrThrow({ where: { id } }))
          .productId,
        null,
      );
      assert.equal(await db.productImage.count({ where: { id } }), 0);
    },
  );
  await t.test(
    "cancel/expired media cannot finalize and cleanup never deletes used images",
    async () => {
      for (const cancel of [true, false]) {
        const id = randomUUID();
        await media.stageProductMedia(
          actor,
          sessionHash,
          id,
          png,
          "image/png",
          "gallery",
        );
        if (cancel) await media.cancelStagedMedia(actor, sessionHash, id);
        else
          await db.stagedProductMedia.update({
            where: { id },
            data: { expiresAt: new Date(0) },
          });
        await assert.rejects(
          svc.createManagedProduct(
            actor,
            { ...input(), images: [{ id, alt: "" }] },
            { sessionHash, requestId: randomUUID() },
          ),
        );
        await media.cleanupStagedMedia();
        const tombstone = await db.stagedProductMedia.findUniqueOrThrow({
          where: { id },
        });
        assert.ok(
          tombstone.cancelledAt,
          "Cancellation stays durable through uncertain remote completion",
        );
        await assert.rejects(media.readStagedMedia(actor, sessionHash, id), {
          status: 404,
        });
        // Simulate a provider PUT completing after cancellation/DELETE returned.
        const objectKey =
          "/storage/v1/object/product-images/" + tombstone.objectPath;
        objects.set(objectKey, png);
        await db.stagedProductMedia.update({
          where: { id },
          data: { cancelledAt: new Date(0), expiresAt: new Date(0) },
        });
        await media.cleanupStagedMedia();
        assert.equal(
          objects.has(objectKey),
          false,
          "Grace-window reconciliation removes a late remote object",
        );
        assert.equal(await db.stagedProductMedia.count({ where: { id } }), 0);
      }
      assert.ok(
        (await db.productImage.count({
          where: { url: { contains: "staged-" } },
        })) > 0,
      );
    },
  );
  await t.test(
    "stock adjustment preserves reservation and audit; stale/unauthorized edits fail",
    async () => {
      const made = await svc.createManagedProduct(actor, input()),
        p = await svc.getManagedProduct(actor, made.id),
        v = p.variants[0];
      await db.inventory.update({
        where: { variantId: v.id },
        data: { reserved: 3 },
      });
      await assert.rejects(
        svc.updateManagedProduct(actor, p.id, p.updatedAt, {
          ...p,
          variants: [{ ...v, onHand: 2 }],
        }),
      );
      await assert.rejects(
        svc.updateManagedProduct(
          {
            ...actor,
            permissions: [PERMISSIONS.PRODUCT_UPDATE, PERMISSIONS.PRODUCT_READ],
          },
          p.id,
          p.updatedAt,
          { ...p, variants: [{ ...v, onHand: 10 }] },
        ),
        { status: 403 },
      );
      await svc.updateManagedProduct(actor, p.id, p.updatedAt, {
        ...p,
        variants: [{ ...v, onHand: 10 }],
      });
      assert.equal(
        (await db.inventory.findUniqueOrThrow({ where: { variantId: v.id } }))
          .reserved,
        3,
      );
      assert.equal(
        (await db.inventory.findUniqueOrThrow({ where: { variantId: v.id } }))
          .onHand,
        10,
      );
      assert.ok(
        (await db.inventoryMovement.count({ where: { variantId: v.id } })) >= 2,
      );
      await assert.rejects(
        svc.updateManagedProduct(actor, p.id, p.updatedAt, p),
        { status: 409 },
      );
    },
  );
  await t.test(
    "shipping metadata leaves manual checkout quote and financial total unchanged",
    async () => {
      const product = await db.product.create({
        data: {
          name: "Dummy shipping quote",
          slug: "quote-" + randomUUID(),
          basePrice: 100000,
          status: "PUBLISHED",
          weightGrams: 500,
          variants: {
            create: {
              sku: "QUOTE-" + randomUUID(),
              inventory: { create: { onHand: 10 } },
            },
          },
        },
        include: { variants: true },
      });
      const buyer = await db.user.create({
        data: {
          name: "Dummy quote buyer",
          email: randomUUID() + "@example.test",
          passwordHash: "dummy",
          cart: {
            create: {
              items: {
                create: { variantId: product.variants[0].id, quantity: 2 },
              },
            },
          },
        },
      });
      const { previewCheckout } = await import(
        "../../src/modules/checkout/checkout.service"
      );
      const { ManualShippingProvider } = await import(
        "../../src/infrastructure/shipping/manual/manual-shipping-provider"
      );
      const rates = await new ManualShippingProvider().getRates();
      const choice = rates[0];
      const first = await previewCheckout(buyer.id, { shipping: choice });
      await db.product.update({
        where: { id: product.id },
        data: {
          weightGrams: 25000,
          packageLengthMm: 900,
          packageWidthMm: 800,
          packageHeightMm: 700,
        },
      });
      const second = await previewCheckout(buyer.id, { shipping: choice });
      assert.equal(second.shippingCost, first.shippingCost);
      assert.equal(second.total, first.total);
      assert.equal(second.subtotal, 200000);
    },
  );
  await t.test(
    "failed storage retains reconcilable unready intent, never a ProductImage",
    async () => {
      const id = randomUUID();
      failUpload = true;
      try {
        await assert.rejects(
          media.stageProductMedia(
            actor,
            sessionHash,
            id,
            png,
            "image/png",
            "gallery",
          ),
          { status: 503 },
        );
      } finally {
        failUpload = false;
      }
      const row = await db.stagedProductMedia.findUniqueOrThrow({
        where: { id },
      });
      assert.equal(row.ready, false);
      assert.equal(row.productId, null);
      await assert.rejects(media.readStagedMedia(actor, sessionHash, id), {
        status: 404,
      });
      assert.equal(await db.productImage.count({ where: { id } }), 0);
      const retry = await media.stageProductMedia(
        actor,
        sessionHash,
        id,
        png,
        "image/png",
        "gallery",
      );
      assert.equal(retry.id, id);
      assert.equal(
        (await media.readStagedMedia(actor, sessionHash, id)).ready,
        true,
      );
    },
  );
  await t.test(
    "parallel identical upload is one immutable object and cancellation cannot remove finalized media",
    async () => {
      const id = randomUUID();
      const results = await Promise.all([
        media.stageProductMedia(
          actor,
          sessionHash,
          id,
          png,
          "image/png",
          "gallery",
        ),
        media.stageProductMedia(
          actor,
          sessionHash,
          id,
          png,
          "image/png",
          "gallery",
        ),
      ]);
      assert.deepEqual(results[0], results[1]);
      assert.equal(await db.stagedProductMedia.count({ where: { id } }), 1);
      await media.cancelStagedMedia(actor, sessionHash, id);
      const tombstone = await db.stagedProductMedia.findUniqueOrThrow({
        where: { id },
      });
      assert.ok(tombstone.cancelledAt);
      await media.cancelStagedMedia(actor, sessionHash, id);
      assert.deepEqual(
        (await db.stagedProductMedia.findUniqueOrThrow({ where: { id } }))
          .cancelledAt,
        tombstone.cancelledAt,
        "Retry does not extend the grace window",
      );
      await assert.rejects(media.readStagedMedia(actor, sessionHash, id), {
        status: 404,
      });
    },
  );
  await t.test(
    "database checks reject partial/unsafe shipping and RLS has no public policy",
    async () => {
      const made = await svc.createManagedProduct(actor, input());
      await assert.rejects(
        db.product.update({ where: { id: made.id }, data: { weightGrams: 0 } }),
      );
      await assert.rejects(
        db.product.update({
          where: { id: made.id },
          data: { packageHeightMm: null },
        }),
      );
      const rows = await db.$queryRaw<
        { rls: boolean; policies: bigint }[]
      >`SELECT bool_and(relrowsecurity) AS rls,(SELECT count(*) FROM pg_policies WHERE tablename IN ('StagedProductMedia','ProductEditorSave')) AS policies FROM pg_class WHERE oid IN ('"StagedProductMedia"'::regclass,'"ProductEditorSave"'::regclass)`;
      assert.equal(rows[0].rls, true);
      assert.equal(Number(rows[0].policies), 0);
    },
  );
});

test("size chart table and owned private image persist atomically with legacy products", async () => {
  const { defaultSizeChart } = await import("../../src/modules/catalog/product-size-chart");
  const created = await svc.createManagedProduct(actor, input());
  let p = await svc.getManagedProduct(actor, created.id);
  assert.equal(p.sizeChart, null);
  const table = defaultSizeChart(); table.table.columns[1].label = "Kapasitas";
  await svc.updateManagedProduct(actor, p.id, p.updatedAt, { ...p, sizeChart: table });
  p = await svc.getManagedProduct(actor, p.id);
  assert.deepEqual(p.sizeChart, table);
  const before = p.updatedAt;
  await assert.rejects(svc.updateManagedProduct(actor, p.id, before, { ...p, sizeChart: { mode: "image", imageId: "foreign-image" } }), { status: 422 });
  assert.deepEqual((await svc.getManagedProduct(actor, p.id)).sizeChart, table);
  const photo = await media.stageProductMedia(actor, sessionHash, randomUUID(), png, "image/png", "option");
  await svc.updateManagedProduct(actor, p.id, before, { ...p, sizeChart: { mode: "image", imageId: photo.id }, optionImages: [{ id: photo.id, alt: "Panduan ukuran" }] }, { sessionHash, requestId: randomUUID() });
  p = await svc.getManagedProduct(actor, p.id);
  assert.deepEqual(p.sizeChart, { mode: "image", imageId: photo.id });
  assert.equal(p.images.length, 0, "chart does not become product cover");
  assert.equal(p.optionImages.length, 1);
  await assert.rejects(svc.updateManagedProduct(actor, p.id, p.updatedAt, { ...p, optionImages: [] }), { status: 422 });
  const inventory = await db.inventory.findFirstOrThrow({ where: { variant: { productId: p.id } } });
  await svc.updateManagedProduct(actor, p.id, p.updatedAt, { ...p, sizeChart: null });
  assert.equal((await svc.getManagedProduct(actor, p.id)).sizeChart, null);
  assert.deepEqual(await db.inventory.findUnique({ where: { id: inventory.id } }), inventory);
  await assert.rejects(db.product.update({ where: { id: p.id }, data: { sizeChart: { oversized: "x".repeat(100001) } } }));
});
