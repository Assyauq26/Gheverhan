import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
const target = new URL(
  process.env.SPRINT1_TEST_DATABASE_URL || "http://invalid",
);
assert.ok(["127.0.0.1", "localhost"].includes(target.hostname));
assert.equal(target.pathname, "/gheverhan_sprint1_test");
assert.equal(process.env.GHEVERHAN_ISOLATED_TESTS, "1");
process.env.DATABASE_URL = target.toString();
process.env.DIRECT_URL = target.toString();
process.env.STORAGE_PROVIDER = "local";
process.env.STORAGE_APP_NAME = "appearance-tests";
let db: typeof import("../../src/lib/prisma").prisma,
  svc: typeof import("../../src/modules/appearance/service"),
  media: typeof import("../../src/modules/appearance/media"),
  actor: string,
  root: string;
const session = "a".repeat(64);
before(async () => {
  root = await mkdtemp(path.join(tmpdir(), "appearance-media-"));
  process.env.STORAGE_LOCAL_ROOT = root;
  db = (await import("../../src/lib/prisma")).prisma;
  svc = await import("../../src/modules/appearance/service");
  media = await import("../../src/modules/appearance/media");
  await db.storeAppearanceRevision.deleteMany();
  await db.storeAppearance.deleteMany();
  await db.storeBrandAsset.deleteMany();
  actor = (
    await db.user.create({
      data: {
        name: "Theme test",
        email: randomUUID() + "@example.test",
        passwordHash: "not-login",
      },
    })
  ).id;
});
after(async () => {
  await db.auditLog.deleteMany({ where: { userId: actor } });
  await db.user.delete({ where: { id: actor } });
  await db.storeAppearanceRevision.deleteMany();
  await db.storeAppearance.deleteMany();
  await db.storeBrandAsset.deleteMany();
  await db.storeCustomizeRateLimit.deleteMany();
  await db.$disconnect();
  await rm(root, { recursive: true, force: true });
});
test("appearance lifecycle, transaction races, rollback and media privacy", async (t) => {
  const { makeDefault, legacyDefault } = await import("../../src/modules/appearance/schema");
  await t.test("public missing row is read-only", async () => {
    assert.equal((await svc.readPublishedUncached()).version, 0);
    assert.equal(await db.storeAppearance.count(), 0);
  });
  await t.test("first-boot editor draft matches persisted draft, then publish and baseline rollback", async () => {
    const initial = await svc.readDraft();
    assert.equal(initial.draftVersion, 0);
    assert.equal(initial.publishedVersion, 0);
    assert.deepEqual(initial.config, makeDefault());
    assert.deepEqual(initial.publishedConfig, legacyDefault());
    assert.equal(await db.storeAppearance.count(), 0, "read must not mutate production data");

    try {
      // Editor initially sees an unchanged, valid JetSeller draft. Publishing
      // must persist precisely that draft, not legacyDefault() from locked().
      const firstPublish = await svc.changeAppearance(
        {
          kind: "publish",
          draftVersion: initial.draftVersion,
          publishedVersion: initial.publishedVersion,
        },
        actor,
        session,
      );
      assert.equal(firstPublish.draftVersion, 0);
      assert.equal(firstPublish.publishedVersion, 1);
      assert.deepEqual(firstPublish.config, initial.config);
      assert.deepEqual(firstPublish.publishedConfig, makeDefault());

      const stored = await db.storeAppearance.findUniqueOrThrow({
        where: { key: "primary" },
      });
      assert.deepEqual(stored.draft, makeDefault());
      assert.deepEqual(stored.published, makeDefault());
      const baseline = await db.storeAppearanceRevision.findUniqueOrThrow({
        where: { version: 0 },
      });
      assert.deepEqual(baseline.config, legacyDefault());
      const newRevision = await db.storeAppearanceRevision.findUniqueOrThrow({
        where: { version: 1 },
      });
      assert.deepEqual(newRevision.config, makeDefault());
      const publicAfterPublish = await svc.readPublishedUncached();
      assert.equal(publicAfterPublish.version, 1);
      assert.equal(publicAfterPublish.legacy, false);
      assert.deepEqual(publicAfterPublish.config, makeDefault());

      const restored = await svc.changeAppearance(
        { kind: "rollback", draftVersion: 0, publishedVersion: 1, revision: 0 },
        actor,
        session,
      );
      assert.equal(restored.draftVersion, 0);
      assert.equal(restored.publishedVersion, 2);
      assert.deepEqual(restored.config, makeDefault(), "rollback must preserve saved draft");
      assert.deepEqual(restored.publishedConfig, legacyDefault());
      const publicAfterRollback = await svc.readPublishedUncached();
      assert.equal(publicAfterRollback.version, 2);
      assert.equal(publicAfterRollback.legacy, true);
      assert.deepEqual(publicAfterRollback.config, legacyDefault());
      assert.equal(await db.storeAppearanceRevision.count(), 3);
      assert.deepEqual((await svc.readDraft()).config, makeDefault());
    } finally {
      // Restore this disposable database to the empty baseline for the
      // existing lifecycle/media concurrency tests below.
      await db.storeAppearanceRevision.deleteMany();
      await db.storeAppearance.deleteMany();
    }
    assert.equal((await svc.readPublishedUncached()).version, 0);
  });
  let state = await svc.readDraft();
  const command = (
    kind: "save" | "publish" | "discard" | "reset" | "rollback",
    extra: Record<string, unknown> = {},
  ) => ({
    kind,
    draftVersion: state.draftVersion,
    publishedVersion: state.publishedVersion,
    ...extra,
  });
  await t.test("draft save never changes published", async () => {
    state = await svc.changeAppearance(
      command("save", { config: makeDefault() }),
      actor,
      session,
    );
    assert.equal(state.draftVersion, 1);
    assert.equal((await svc.readPublishedUncached()).version, 0);
  });
  await t.test("two simultaneous saves cannot overwrite", async () => {
    const results = await Promise.allSettled([
      svc.changeAppearance(
        command("save", { config: makeDefault() }),
        actor,
        session,
      ),
      svc.changeAppearance(
        command("save", { config: makeDefault() }),
        actor,
        session,
      ),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    const failed = results.find(
      (r) => r.status === "rejected",
    ) as PromiseRejectedResult;
    assert.equal(failed.reason.status, 409);
    state = await svc.readDraft();
  });
  await t.test(
    "invalid contrast saved but publish atomically denied",
    async () => {
      const v = makeDefault();
      v.colors.text = v.colors.pageBg;
      state = await svc.changeAppearance(
        command("save", { config: v }),
        actor,
        session,
      );
      await assert.rejects(
        svc.changeAppearance(command("publish"), actor, session),
        /Kontras/,
      );
      assert.equal((await svc.readPublishedUncached()).version, 0);
      assert.equal(
        await db.storeAppearanceRevision.count({
          where: { version: { gt: 0 } },
        }),
        0,
      );
    },
  );
  let logo: string;
  const png = await sharp({
    create: {
      width: 32,
      height: 32,
      channels: 4,
      background: { r: 30, g: 40, b: 50, alpha: 0.5 },
    },
  })
    .png()
    .toBuffer();
  await t.test(
    "magic MIME size dimensions and animations rejected",
    async () => {
      for (const [bytes, mime] of [
        [Buffer.from("<svg onload='alert(1)'/>"), "image/png"],
        [png, "image/jpeg"],
        [Buffer.alloc(2097153), "image/png"],
      ] as const)
        await assert.rejects(media.normalizeLogo(bytes, mime));
      const animation = Buffer.alloc(20);
      animation.writeUInt32BE(8, 0);
      animation.write("acTL", 4);
      animation.writeUInt32BE(2, 8);
      await assert.rejects(
        media.normalizeLogo(
          Buffer.concat([png.subarray(0, 33), animation, png.subarray(33)]),
          "image/png",
        ),
        /animasi/,
      );
      const normalized = await media.normalizeLogo(png, "image/png");
      assert.equal((await sharp(normalized).metadata()).format, "webp");
      assert.equal((await sharp(normalized).metadata()).exif, undefined);
    },
  );
  await t.test("upload idempotency and staging privacy", async () => {
    const request = randomUUID();
    logo = (await media.uploadLogo(actor, session, request, png, "image/png"))
      .id;
    assert.equal(
      (await media.uploadLogo(actor, session, request, png, "image/png")).id,
      logo,
    );
    await assert.rejects(media.readLogo(logo));
    await assert.rejects(
      media.readLogo(logo, { id: "other", sessionHash: session }),
    );
    await media.readLogo(logo, { id: actor, sessionHash: session });
  });
  await t.test("another session cannot attach private staging", async () => {
    const v = makeDefault();
    v.identity.logoAssetId = logo;
    await assert.rejects(
      svc.changeAppearance(
        command("save", { config: v }),
        actor,
        "b".repeat(64),
      ),
      /Logo bukan/,
    );
  });
  await t.test(
    "publish race has one winner and public logo activates",
    async () => {
      const v = makeDefault();
      v.identity.logoAssetId = logo;
      v.identity.mode = "both";
      state = await svc.changeAppearance(
        command("save", { config: v }),
        actor,
        session,
      );
      const results = await Promise.allSettled([
        svc.changeAppearance(command("publish"), actor, session),
        svc.changeAppearance(command("publish"), actor, session),
      ]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      state = await svc.readDraft();
      assert.equal(state.publishedVersion, 1);
      await media.readLogo(logo);
      await assert.rejects(
        media.retireLogo(logo, actor, session),
        /masih dipakai/,
      );
    },
  );
  await t.test(
    "rollback appends revision and preserves draft/history media",
    async () => {
      state = await svc.changeAppearance(
        command("rollback", { revision: 0 }),
        actor,
        session,
      );
      assert.equal(state.publishedVersion, 2);
      assert.equal(
        (await svc.readPublishedUncached()).config.identity.logoAssetId,
        null,
      );
      assert.equal(state.config.identity.logoAssetId, logo);
      await assert.rejects(media.readLogo(logo));
      await media.readLogo(logo, { id: actor, sessionHash: session });
      assert.equal(await db.storeAppearanceRevision.count(), 3);
      await db.storeBrandAsset.update({
        where: { id: logo },
        data: { expiresAt: new Date(0) },
      });
      await media.cleanupBranding();
      assert.ok(await db.storeBrandAsset.findUnique({ where: { id: logo } }));
    },
  );
  await t.test(
    "cleanup reaches expired unreferenced uploads after 100 revision-retained logos",
    async () => {
      const { makeDefault } = await import("../../src/modules/appearance/schema");
      const retained = Array.from({ length: 101 }, (_, index) => {
        const id = randomUUID();
        const config = makeDefault();
        config.identity.logoAssetId = id;
        return { id, index, config };
      });
      await db.storeBrandAsset.createMany({
        data: retained.map(({ id }) => ({
          id,
          actorId: actor,
          sessionHash: session,
          requestId: randomUUID(),
          path: `appearance-tests/store-branding/${actor}/${id}.webp`,
          checksum: "0".repeat(64),
          size: 100,
          ready: true,
          expiresAt: new Date(0),
        })),
      });
      await db.storeAppearanceRevision.createMany({
        data: retained.map(({ index, config }) => ({
          version: 1000 + index,
          config: svc.asJson(config),
          actorId: actor,
          action: "publish",
        })),
      });
      const orphan = (
        await media.uploadLogo(actor, session, randomUUID(), png, "image/png")
      ).id;
      await db.storeBrandAsset.update({
        where: { id: orphan },
        data: { expiresAt: new Date("2020-01-01T00:00:00Z") },
      });
      const result = await media.cleanupBranding();
      assert.equal(result.removed, 1, "New orphan must not starve behind history");
      assert.equal(await db.storeBrandAsset.findUnique({ where: { id: orphan } }), null);
      for (const item of [retained[0], retained[100]]) {
        assert.ok(await db.storeBrandAsset.findUnique({ where: { id: item.id } }),
          "A revision-referenced logo must be retained");
      }
    },
  );
  await t.test("new tables deny anonymous roles through RLS", async () => {
    const rows = await db.$queryRaw<
      { relname: string; relrowsecurity: boolean }[]
    >`SELECT relname,relrowsecurity FROM pg_class WHERE relname IN ('StoreAppearance','StoreAppearanceRevision','StoreBrandAsset','StoreCustomizeRateLimit')`;
    assert.equal(rows.length, 4);
    assert.ok(rows.every((r) => r.relrowsecurity));
  });
  await t.test("rate limit counter is atomic", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        svc.rateLimit("rate-fixture", "test", 2, 60),
      ),
    );
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 2);
  });
});
