
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";

const target = new URL(process.env.SPRINT1_TEST_DATABASE_URL || "http://invalid");
assert.ok(["127.0.0.1", "localhost"].includes(target.hostname));
assert.equal(target.pathname, "/gheverhan_sprint1_test");
assert.equal(process.env.GHEVERHAN_ISOLATED_TESTS, "1");
process.env.DATABASE_URL = target.toString();
process.env.DIRECT_URL = target.toString();
process.env.STORAGE_PROVIDER = "local";
process.env.STORAGE_APP_NAME = "hero-test";
const session = "b".repeat(64);
let db: typeof import("../../src/lib/prisma").prisma;
let svc: typeof import("../../src/modules/hero/service");
let media: typeof import("../../src/modules/hero/media");
let actor = "", root = "";
before(async () => {
  root = await mkdtemp(path.join(tmpdir(), "hero-cms-"));
  process.env.STORAGE_LOCAL_ROOT = root;
  db = (await import("../../src/lib/prisma")).prisma;
  svc = await import("../../src/modules/hero/service");
  media = await import("../../src/modules/hero/media");
  await db.storeHero.deleteMany();
  await db.storeHeroAsset.deleteMany();
  actor = (await db.user.create({
    data: { name: "Hero test", email: randomUUID() + "@example.test", passwordHash: "not-login" },
  })).id;
});
after(async () => {
  await db.auditLog.deleteMany({ where: { userId: actor } });
  await db.user.delete({ where: { id: actor } });
  await db.storeHero.deleteMany();
  await db.storeHeroAsset.deleteMany();
  await db.storeCustomizeRateLimit.deleteMany();
  await db.$disconnect();
  await rm(root, { recursive: true, force: true });
});

test("hero draft, publish, media privacy, versions and cleanup", async t => {
  const { emptyHero } = await import("../../src/modules/hero/schema");
  await t.test("reading empty hero does not create or publish records", async () => {
    assert.equal((await svc.readHeroPublishedUncached()).version, 0);
    assert.equal(await db.storeHero.count(), 0);
  });
  const png = await sharp({ create: { width: 900, height: 450, channels: 4, background: { r: 12, g: 32, b: 55, alpha: 1 } } }).png().toBuffer();
  const first = await media.uploadHeroImage(actor, session, randomUUID(), png, "image/png");
  await t.test("uploaded banner stays private before publish", async () => {
    await assert.rejects(() => media.readHeroImage(first.id), (err: any) => err.status === 404);
    const obj = await media.readHeroImage(first.id, { id: actor, sessionHash: session });
    assert.equal(obj.contentType, "image/webp");
    await assert.rejects(() => media.readHeroImage(first.id, { id: actor, sessionHash: "c".repeat(64) }), (err: any) => err.status === 404);
  });
  const slide = {
    id: randomUUID(), desktopAssetId: first.id, mobileAssetId: null,
    alt: "Kampanye pakaian wanita", heading: "Koleksi", description: "Pilihan terbaru",
    ctaLabel: "Belanja", ctaHref: "/shop", align: "left", tone: "light", overlay: 15,
  };
  let state = await svc.readHeroDraft();
  state = await svc.executeHeroChange({
    kind: "save", config: { ...emptyHero(), enabled: true, slides: [slide] },
    draftVersion: state.draftVersion, publishedVersion: state.publishedVersion,
  }, actor, session);
  await t.test("draft is not publicly visible", async () => {
    assert.equal((await svc.readHeroPublishedUncached()).version, 0);
    assert.equal((await svc.readHeroDraft()).config.slides.length, 1);
    await assert.rejects(() => media.readHeroImage(first.id), (err: any) => err.status === 404);
  });
  await t.test("stale publish is rejected and valid publish makes image public", async () => {
    await assert.rejects(() => svc.executeHeroChange({
      kind: "publish", draftVersion: 0, publishedVersion: 0,
    }, actor, session), (err: any) => err.status === 409);
    state = await svc.executeHeroChange({
      kind: "publish", draftVersion: state.draftVersion, publishedVersion: state.publishedVersion,
    }, actor, session);
    assert.equal((await svc.readHeroPublishedUncached()).version, 1);
    const obj = await media.readHeroImage(first.id);
    assert.ok(obj.data.length > 0);
  });
  await t.test("foreign/stale assets cannot be grafted onto draft", async () => {
    const another = await media.uploadHeroImage(actor, session, randomUUID(), png, "image/png");
    await assert.rejects(() => svc.executeHeroChange({
      kind: "save", config: { ...emptyHero(), enabled: true, slides: [{ ...slide, desktopAssetId: another.id }] },
      draftVersion: state.draftVersion, publishedVersion: state.publishedVersion,
    }, actor, "d".repeat(64)), (err: any) => err.status === 403);
  });
  await t.test("orphan cleanup never removes published image", async () => {
    const orphan = await media.uploadHeroImage(actor, session, randomUUID(), png, "image/png");
    await db.storeHeroAsset.updateMany({
      where: { id: { in: [first.id, orphan.id] } },
      data: { expiresAt: new Date("2020-01-01T00:00:00Z") },
    });
    const result = await media.cleanupHeroMedia();
    assert.equal(result.removed, 1);
    assert.equal(await db.storeHeroAsset.findUnique({ where: { id: orphan.id } }), null);
    assert.ok(await db.storeHeroAsset.findUnique({ where: { id: first.id } }));
  });
  await t.test("new tables use RLS", async () => {
    const rows = await db.$queryRaw<{ relname: string; relrowsecurity: boolean }[]>`
      SELECT relname, relrowsecurity FROM pg_class
      WHERE relname IN ('StoreHero','StoreHeroAsset')`;
    assert.equal(rows.length, 2);
    assert.ok(rows.every(row => row.relrowsecurity));
  });
});
