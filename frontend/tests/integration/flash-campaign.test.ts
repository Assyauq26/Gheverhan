import { configureTestJnt, testAddress, shippingConfirmation } from "../fixtures/jnt-checkout";
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { ALL_PERMISSIONS } from "../../src/lib/auth/permissions";
configureTestJnt();
const target = new URL(
  process.env.SPRINT1_TEST_DATABASE_URL || "http://invalid",
);
assert.equal(process.env.GHEVERHAN_ISOLATED_TESTS, "1");
assert.ok(["localhost", "127.0.0.1"].includes(target.hostname));
assert.equal(target.pathname, "/gheverhan_sprint1_test");
target.searchParams.set("connection_limit", "10");
process.env.DATABASE_URL = target.toString();
process.env.DIRECT_URL = target.toString();
let db: PrismaClient;
let campaigns: typeof import("../../src/modules/promotions/campaign.service");
let pricing: typeof import("../../src/modules/promotions/campaign-pricing");
let cart: typeof import("../../src/modules/cart/cart.service");
let checkout: typeof import("../../src/modules/checkout/checkout.service");
let catalog: typeof import("../../src/modules/catalog/product-management.service");
const prefix = "fc-" + randomUUID().slice(0, 8);
let sequence = 0;
let actor: { id: string; isAdmin: boolean; permissions: string[] };
let bank: string;
const ownedCampaigns: string[] = [];
before(async () => {
  db = (await import("../../src/lib/prisma")).prisma;
  campaigns = await import("../../src/modules/promotions/campaign.service");
  pricing = await import("../../src/modules/promotions/campaign-pricing");
  cart = await import("../../src/modules/cart/cart.service");
  checkout = await import("../../src/modules/checkout/checkout.service");
  catalog = await import(
    "../../src/modules/catalog/product-management.service"
  );
  const user = await db.user.create({
    data: {
      name: "Synthetic campaign admin",
      email: prefix + "@example.test",
      passwordHash: "not-for-login",
    },
  });
  actor = { id: user.id, isAdmin: true, permissions: ALL_PERMISSIONS };
  bank = (
    await db.bankAccount.create({
      data: {
        bankName: "Fixture",
        accountNumber: "fixture",
        accountHolder: "Fixture",
        displayName: "Fixture",
      },
    })
  ).id;
});
after(async () => {
  await db?.flashSaleCampaign.updateMany({
    where: { id: { in: ownedCampaigns } },
    data: { status: "ENDED" },
  });
  await db?.product.updateMany({
    where: { slug: { startsWith: prefix } },
    data: { status: "ARCHIVED" },
  });
  await db?.$disconnect();
});
async function product(extra: Record<string, unknown> = {}) {
  return db.product.create({
    data: {
      name: "Campaign fixture",
      slug: prefix + "-" + ++sequence,
      basePrice: 100000,
      status: "PUBLISHED",
      weightGrams: 500,
      images: { create: { url: "/qa-flash-fixture.png" } },
      variants: {
        create: {
          sku: prefix + "-" + sequence,
          inventory: { create: { onHand: 30 } },
        },
      },
      ...extra,
    },
    include: { variants: true, images: true },
  });
}
function input(
  items: { productId: string; flashSalePrice: number }[],
  extra: Record<string, unknown> = {},
) {
  return {
    id: null,
    expectedVersion: 0,
    name: prefix + " campaign " + ++sequence,
    status: "SCHEDULED",
    startsAt: new Date(Date.now() - 60000).toISOString(),
    endsAt: new Date(Date.now() + 3600000).toISOString(),
    items,
    ...extra,
  };
}
async function save(value: unknown) {
  const c = await campaigns.saveCampaign(actor, value);
  ownedCampaigns.push(c.id);
  return c;
}
async function endAll() {
  await db.flashSaleCampaign.updateMany({
    where: { id: { in: ownedCampaigns } },
    data: { status: "ENDED" },
  });
}
async function buyer(variantId: string) {
  const b = await db.user.create({
    data: {
      name: "Synthetic buyer",
      email: prefix + "-buyer-" + ++sequence + "@example.test",
      passwordHash: "not-for-login",
    },
  });
  await cart.addItem(b.id, variantId, 1);
  return b;
}
async function orderInput(userId: string) {
  const confirmed = await shippingConfirmation(userId);
  const quote = await checkout.previewCheckout(userId, { shipping: confirmed.shipping, address: testAddress });
  return { ...confirmed, bankAccountId: bank, requestId: randomUUID(), expectedLines: quote.lines };
}
async function archive(p: Awaited<ReturnType<typeof product>>) {
  await db.flashSaleLegacy.create({
    data: {
      productId: p.id,
      snapshot: {
        isFlashSale: p.isFlashSale,
        salePrice: p.salePrice,
        flashSalePrice: p.flashSalePrice,
        flashSaleStartsAt: p.flashSaleStartsAt?.toISOString() ?? null,
        flashSaleEndsAt: p.flashSaleEndsAt?.toISOString() ?? null,
      },
    },
  });
}

test("central Flash Sale authority, pricing, locking and cutover", async (t) => {
  t.afterEach(async () => {
    await endAll();
    await db.product.updateMany({
      where: { slug: { startsWith: prefix } },
      data: {
        isFlashSale: false,
        flashSalePrice: null,
        flashSaleStartsAt: null,
        flashSaleEndsAt: null,
      },
    });
  });
  await t.test(
    "active overview remains visible beyond fifty newer draft records",
    async () => {
      const p = await product();
      const active = await save(
        input([{ productId: p.id, flashSalePrice: 70000 }]),
      );
      const drafts = Array.from({ length: 55 }, () => ({
        id: randomUUID(),
        storeKey: "primary",
        name: prefix + " recent draft",
        status: "DRAFT",
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 3600000),
        createdAt: new Date(),
      }));
      ownedCampaigns.push(...drafts.map((d) => d.id));
      await db.flashSaleCampaign.createMany({ data: drafts });
      const rows = await campaigns.listCampaigns(actor);
      assert.ok(rows.some((c) => c.id === active.id));
      assert.ok(rows.length <= 51);
      assert.ok(
        (await campaigns.campaignHistory(actor)).some(
          (event) => event.entityId === active.id,
        ),
      );
      await endAll();
    },
  );
  await t.test(
    "permissions deny customer/foreign actor before side effects",
    async () => {
      const count = await db.flashSaleCampaign.count();
      for (const a of [
        { ...actor, isAdmin: false },
        { ...actor, permissions: [] },
        { ...actor, permissions: ["promotion.update"] },
      ]) {
        await assert.rejects(
          campaigns.saveCampaign(
            a,
            input([{ productId: "foreign", flashSalePrice: 1 }]),
          ),
          { status: 403 },
        );
        await assert.rejects(campaigns.campaignProducts(a), { status: 403 });
        await assert.rejects(campaigns.listCampaigns(a), { status: 403 });
        await assert.rejects(
          campaigns.endCampaign(a, { id: randomUUID(), expectedVersion: 0 }),
          { status: 403 },
        );
      }
      assert.equal(await db.flashSaleCampaign.count(), count);
    },
  );
  await t.test(
    "strict tenant, item-schedule and forged product identities fail closed",
    async () => {
      await assert.rejects(
        save({
          ...input([{ productId: "missing", flashSalePrice: 1 }]),
          storeKey: "other",
        }),
        { status: 422 },
      );
      await assert.rejects(
        save(input([{ productId: "x' OR true --", flashSalePrice: 1 }])),
        { status: 422 },
      );
      await assert.rejects(
        campaigns.campaignProducts(actor, { storeKey: "other" }),
        { status: 422 },
      );
    },
  );
  await t.test(
    "one interval controls different prices; inclusive start/exclusive end",
    async () => {
      const a = await product(),
        b = await product();
      const start = new Date(Date.now() + 3600000),
        end = new Date(start.getTime() + 90000000);
      await save(
        input(
          [
            { productId: a.id, flashSalePrice: 80000 },
            { productId: b.id, flashSalePrice: 70000 },
          ],
          { startsAt: start.toISOString(), endsAt: end.toISOString() },
        ),
      );
      assert.equal(
        (
          await pricing.campaignPrices(
            [a.id, b.id],
            db,
            new Date(start.getTime() - 1),
          )
        ).length,
        0,
      );
      assert.equal(
        (await pricing.campaignPrices([a.id, b.id], db, start)).length,
        2,
      );
      assert.equal(
        (
          await pricing.campaignPrices(
            [a.id, b.id],
            db,
            new Date(end.getTime() - 1),
          )
        ).length,
        2,
      );
      assert.equal(
        (await pricing.campaignPrices([a.id, b.id], db, end)).length,
        0,
      );
      const stored = await db.product.findUniqueOrThrow({
        where: { id: a.id },
      });
      assert.equal(stored.basePrice, 100000);
      assert.equal(stored.salePrice, null);
      assert.equal(stored.flashSalePrice, null);
      await endAll();
    },
  );
  await t.test(
    "two concurrent admin saves cannot overlap; database also rejects bypass",
    async () => {
      const a = await product(),
        b = await product();
      const first = input([{ productId: a.id, flashSalePrice: 80000 }]);
      const results = await Promise.allSettled([
        save(first),
        save({
          ...first,
          name: prefix + " race",
          items: [{ productId: b.id, flashSalePrice: 70000 }],
        }),
      ]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(
        (results.find((r) => r.status === "rejected") as PromiseRejectedResult)
          .reason.status,
        409,
      );
      await assert.rejects(
        db.flashSaleCampaign.create({
          data: {
            id: randomUUID(),
            name: "Direct overlap",
            status: "SCHEDULED",
            startsAt: new Date(first.startsAt),
            endsAt: new Date(first.endsAt),
          },
        }),
      );
      await endAll();
    },
  );
  await t.test(
    "adjacent campaigns can share an exact boundary without overlapping",
    async () => {
      const p = await product();
      const start = new Date(Date.now() + 3600000),
        middle = new Date(start.getTime() + 3600000),
        end = new Date(middle.getTime() + 3600000);
      await save(
        input([{ productId: p.id, flashSalePrice: 80000 }], {
          startsAt: start.toISOString(),
          endsAt: middle.toISOString(),
        }),
      );
      await save(
        input([{ productId: p.id, flashSalePrice: 70000 }], {
          startsAt: middle.toISOString(),
          endsAt: end.toISOString(),
        }),
      );
      const prices = await pricing.campaignPrices([p.id], db, middle);
      assert.equal(prices.length, 1);
      assert.equal(prices[0].flashSalePrice, 70000);
      await endAll();
    },
  );
  await t.test(
    "optimistic updates, early end, audit and history are transactional",
    async () => {
      const p = await product(),
        value = input([{ productId: p.id, flashSalePrice: 80000 }]);
      const c = await save(value);
      const edit = {
        ...value,
        id: c.id,
        expectedVersion: 0,
        name: prefix + " edited",
      };
      const saved = await save(edit);
      await assert.rejects(save(edit), { status: 409 });
      await assert.rejects(
        campaigns.endCampaign(actor, { id: c.id, expectedVersion: 0 }),
        { status: 409 },
      );
      await campaigns.endCampaign(actor, {
        id: c.id,
        expectedVersion: saved.version,
      });
      assert.equal((await pricing.campaignPrices([p.id])).length, 0);
      assert.equal(
        await db.auditLog.count({
          where: { entity: "FlashSaleCampaign", entityId: c.id },
        }),
        3,
      );
      assert.equal(
        (await campaigns.campaignHistory(actor)).filter(
          (h) => h.entityId === c.id,
        ).length,
        3,
      );
    },
  );
  await t.test(
    "effective regular discount survives campaign start/end across buyer projections",
    async () => {
      const p = await product({ salePrice: 95000 });
      await assert.rejects(
        save(input([{ productId: p.id, flashSalePrice: 95000 }])),
        { status: 422 },
      );
      const b = await buyer(p.variants[0].id);
      const c = await save(input([{ productId: p.id, flashSalePrice: 80000 }]));
      assert.equal((await cart.getCartView(b.id)).subtotal, 80000);
      assert.equal(
        (await cart.getDirectCheckoutView(p.variants[0].id, 2)).subtotal,
        160000,
      );
      assert.equal((await checkout.previewCheckout(b.id, {})).subtotal, 80000);
      const options = await (
        await import("../../src/modules/catalog/purchase-options.service")
      ).getPurchaseOptions(p.slug);
      assert.equal(options.variants[0].price, 80000);
      const [detail] = await pricing.withCampaignPricing([p]);
      assert.equal(detail.flashSalePrice, 80000);
      await campaigns.endCampaign(actor, {
        id: c.id,
        expectedVersion: c.version,
      });
      assert.equal((await cart.getCartView(b.id)).subtotal, 95000);
      assert.equal(
        (await db.product.findUniqueOrThrow({ where: { id: p.id } })).salePrice,
        95000,
      );
    },
  );
  await t.test(
    "compatible explicit SKU prices share one campaign price; incompatible SKU rejected",
    async () => {
      const p = await product();
      await db.productVariant.update({
        where: { id: p.variants[0].id },
        data: { price: 110000, salePrice: 105000 },
      });
      const c = await save(input([{ productId: p.id, flashSalePrice: 90000 }]));
      assert.equal(
        (await cart.getDirectCheckoutView(p.variants[0].id, 1)).subtotal,
        90000,
      );
      await campaigns.endCampaign(actor, { id: c.id, expectedVersion: 0 });
      await db.productVariant.update({
        where: { id: p.variants[0].id },
        data: { price: 80000, salePrice: null },
      });
      await assert.rejects(
        save(input([{ productId: p.id, flashSalePrice: 90000 }])),
        { status: 422 },
      );
    },
  );
  await t.test(
    "draft, archived and unavailable products remain in picker with reasons but cannot schedule",
    async () => {
      for (const status of ["DRAFT", "ARCHIVED"]) {
        const p = await product({ status });
        await assert.rejects(
          save(input([{ productId: p.id, flashSalePrice: 70000 }])),
          { status: 422 },
        );
      }
      const p = await product();
      await db.inventory.update({
        where: { variantId: p.variants[0].id },
        data: { onHand: 0 },
      });
      await assert.rejects(
        save(input([{ productId: p.id, flashSalePrice: 70000 }])),
        { status: 422 },
      );
      const picker = await campaigns.campaignProducts(actor, {
        search: p.name,
      });
      assert.ok(picker.items.some((i) => i.reason));
      const live = await product();
      const campaign = await save(
        input([{ productId: live.id, flashSalePrice: 70000 }]),
      );
      await db.inventory.update({
        where: { variantId: live.variants[0].id },
        data: { onHand: 0 },
      });
      const overview = (await campaigns.listCampaigns(actor)).find(
        (c) => c.id === campaign.id,
      )!;
      assert.equal(
        overview.items[0].product.eligibilityWarning,
        "Stok tidak tersedia",
      );
      assert.equal(overview.items[0].product.regularPrice, 100000);
      assert.deepEqual(await pricing.campaignPrices([live.id]), []);
      await endAll();
    },
  );
  await t.test(
    "removing a participant changes fresh prices without master-price rewrites",
    async () => {
      const a = await product(),
        b = await product();
      const value = input([
        { productId: a.id, flashSalePrice: 80000 },
        { productId: b.id, flashSalePrice: 70000 },
      ]);
      const c = await save(value);
      await save({
        ...value,
        id: c.id,
        expectedVersion: 0,
        items: [{ productId: a.id, flashSalePrice: 75000 }],
      });
      const prices = await pricing.campaignPrices([a.id, b.id]);
      assert.equal(prices.length, 1);
      assert.equal(prices[0].flashSalePrice, 75000);
      assert.equal(
        (await db.product.findUniqueOrThrow({ where: { id: b.id } })).basePrice,
        100000,
      );
      await endAll();
    },
  );
  await t.test(
    "normal product saves preserve participation; price/SKU invalidation rejected",
    async () => {
      const p = await product();
      await save(input([{ productId: p.id, flashSalePrice: 80000 }]));
      let editor = await catalog.getManagedProduct(actor, p.id);
      await catalog.updateManagedProduct(actor, p.id, editor.updatedAt, {
        ...editor,
        name: "Metadata edited",
      });
      assert.equal(
        (await pricing.campaignPrices([p.id]))[0].flashSalePrice,
        80000,
      );
      editor = await catalog.getManagedProduct(actor, p.id);
      await assert.rejects(
        catalog.updateManagedProduct(actor, p.id, editor.updatedAt, {
          ...editor,
          basePrice: 70000,
        }),
        { status: 409 },
      );
      await assert.rejects(
        catalog.updateManagedProduct(actor, p.id, editor.updatedAt, {
          ...editor,
          variants: editor.variants.map((v) => ({ ...v, price: 70000 })),
        }),
        { status: 409 },
      );
      await endAll();
    },
  );
  await t.test(
    "product create/update explicitly reject false/null legacy and membership payloads",
    async () => {
      const p = await product();
      const editor = await catalog.getManagedProduct(actor, p.id);
      for (const [key, value] of Object.entries({
        isFlashSale: false,
        flashSalePrice: null,
        flashSaleStartsAt: new Date().toISOString(),
        flashSaleEndsAt: null,
        campaignId: randomUUID(),
        campaignItems: [],
      })) {
        await assert.rejects(
          catalog.updateManagedProduct(actor, p.id, editor.updatedAt, {
            ...editor,
            [key]: value,
          }),
          { status: 422 },
        );
        await assert.rejects(
          catalog.createManagedProduct(actor, {
            ...editor,
            slug: prefix + "-forged-" + ++sequence,
            [key]: value,
          }),
          { status: 422 },
        );
      }
      await assert.rejects(
        catalog.updateManagedProduct(actor, p.id, editor.updatedAt, {
          ...editor,
          variants: editor.variants.map((v) => ({
            ...v,
            flashSalePrice: null,
          })),
        }),
        { status: 422 },
      );
      assert.equal(
        (
          await db.product.findUniqueOrThrow({ where: { id: p.id } })
        ).updatedAt.getTime(),
        p.updatedAt.getTime(),
      );
    },
  );
  await t.test(
    "campaign end during a pending shipping quote rejects stale createOrder without mutation",
    async () => {
      const p = await product(),
        b = await buyer(p.variants[0].id);
      const c = await save(input([{ productId: p.id, flashSalePrice: 80000 }]));
      const confirmed = await orderInput(b.id);
      const provider = (
        await import("../../src/infrastructure/shipping")
      ).getShippingProvider("manual");
      const original = provider.getRates!;
      let enter!: () => void, release!: () => void;
      const ready = new Promise<void>((r) => (enter = r)),
        gate = new Promise<void>((r) => (release = r));
      provider.getRates = async (args) => {
        enter();
        await gate;
        return original.call(provider, args);
      };
      let result: Promise<unknown> | undefined;
      try {
        result = checkout.createOrder(b.id, confirmed);
        const rejected = assert.rejects(result, { status: 409 });
        await ready;
        await campaigns.endCampaign(actor, { id: c.id, expectedVersion: 0 });
        release();
        await rejected;
        assert.equal(await db.order.count({ where: { userId: b.id } }), 0);
        assert.equal((await cart.getCartView(b.id)).count, 1);
      } finally {
        release();
        provider.getRates = original;
      }
    },
  );
  await t.test(
    "checkout shared campaign lock serializes early ending until price/order commit",
    async () => {
      const p = await product(),
        b = await buyer(p.variants[0].id);
      const c = await save(input([{ productId: p.id, flashSalePrice: 80000 }]));
      const confirmed = await orderInput(b.id);
      let enter!: () => void, release!: () => void;
      const ready = new Promise<void>((r) => (enter = r)),
        gate = new Promise<void>((r) => (release = r));
      const holder = db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Product" WHERE id=${p.id} FOR UPDATE`;
          enter();
          await gate;
        },
        { timeout: 10000 },
      );
      await ready;
      const creating = checkout.createOrder(b.id, confirmed);
      async function waiter(fragment: string) {
        for (let n = 0; n < 100; n++) {
          const [row] = await db.$queryRaw<
            { n: bigint }[]
          >`SELECT count(*) AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE ${"%" + fragment + "%"}`;
          if (Number(row.n) > 0) return;
          await new Promise((r) => setTimeout(r, 15));
        }
        throw Error("expected real lock waiter " + fragment);
      }
      let ending: Promise<unknown> | undefined;
      try {
        await waiter("Product");
        ending = campaigns.endCampaign(actor, { id: c.id, expectedVersion: 0 });
        await waiter("FlashSaleControl");
      } finally {
        release();
        await holder;
      }
      const order = await creating;
      await ending;
      const item = await db.orderItem.findFirstOrThrow({
        where: { orderId: order.id },
      });
      assert.equal(item.unitPrice, 80000);
      assert.equal(order.subtotal, 80000);
      assert.equal(
        (await db.flashSaleCampaign.findUniqueOrThrow({ where: { id: c.id } }))
          .status,
        "ENDED",
      );
      assert.equal(
        (
          await db.inventory.findUniqueOrThrow({
            where: { variantId: p.variants[0].id },
          })
        ).reserved,
        1,
      );
    },
  );
  await t.test(
    "approved legacy mapping preserves archive and clears duplicate authority atomically",
    async () => {
      const p = await product({
        isFlashSale: true,
        salePrice: 80000,
        flashSalePrice: 70000,
        flashSaleStartsAt: new Date(Date.now() - 3600000),
        flashSaleEndsAt: new Date(Date.now() + 3600000),
      });
      await archive(p);
      const original = await db.flashSaleLegacy.findUniqueOrThrow({
        where: { productId: p.id },
      });
      const value = input([{ productId: p.id, flashSalePrice: 70000 }]);
      await assert.rejects(save(value), { status: 409 });
      const c = await save({ ...value, resolveLegacy: true });
      const raw = await db.product.findUniqueOrThrow({ where: { id: p.id } });
      assert.equal(raw.isFlashSale, false);
      assert.equal(raw.salePrice, null);
      assert.equal(raw.flashSalePrice, null);
      assert.equal(raw.flashSaleStartsAt, null);
      const archived = await db.flashSaleLegacy.findUniqueOrThrow({
        where: { productId: p.id },
      });
      assert.deepEqual(archived.snapshot, original.snapshot);
      assert.equal(archived.resolvedCampaignId, c.id);
      await endAll();
    },
  );
  await t.test(
    "legacy changes after archiving reject mapping without losing current data",
    async () => {
      const p = await product({ isFlashSale: true, salePrice: 80000 });
      await archive(p);
      await db.product.update({
        where: { id: p.id },
        data: { salePrice: 75000 },
      });
      await assert.rejects(
        save({
          ...input([{ productId: p.id, flashSalePrice: 70000 }]),
          resolveLegacy: true,
        }),
        { status: 409 },
      );
      assert.equal(
        (await db.product.findUniqueOrThrow({ where: { id: p.id } })).salePrice,
        75000,
      );
      await db.product.update({
        where: { id: p.id },
        data: { isFlashSale: false, salePrice: null },
      });
    },
  );
  await t.test(
    "expired scheduled legacy can be explicitly retired while regular discount remains",
    async () => {
      const p = await product({
        salePrice: 95000,
        flashSalePrice: 70000,
        flashSaleStartsAt: new Date(Date.now() - 7200000),
        flashSaleEndsAt: new Date(Date.now() - 3600000),
      });
      await archive(p);
      await assert.rejects(
        campaigns.retireLegacy(
          { ...actor, isAdmin: false },
          { productId: p.id, expectedUpdatedAt: p.updatedAt.toISOString() },
        ),
        { status: 403 },
      );
      await assert.rejects(
        campaigns.retireLegacy(actor, {
          productId: p.id,
          expectedUpdatedAt: new Date(0).toISOString(),
        }),
        { status: 409 },
      );
      await campaigns.retireLegacy(actor, {
        productId: p.id,
        expectedUpdatedAt: p.updatedAt.toISOString(),
      });
      const raw = await db.product.findUniqueOrThrow({ where: { id: p.id } });
      assert.equal(raw.salePrice, 95000);
      assert.equal(raw.flashSalePrice, null);
      assert.ok(
        await db.flashSaleLegacy.findUnique({ where: { productId: p.id } }),
      );
    },
  );
  await t.test(
    "reviewed manual retirement retains regular price atomically with permission and audit",
    async () => {
      const p = await product({
        basePrice: 399000,
        isFlashSale: true,
        salePrice: 299000,
      });
      await archive(p);
      const archived = await db.flashSaleLegacy.findUniqueOrThrow({
        where: { productId: p.id },
      });
      const mapping = {
        productId: p.id,
        expectedUpdatedAt: p.updatedAt.toISOString(),
        retainManualPriceAsRegular: true,
      };
      await assert.rejects(
        campaigns.retireLegacy(
          {
            ...actor,
            permissions: actor.permissions.filter(
              (p) => p !== "product.update",
            ),
          },
          mapping,
        ),
        { status: 403 },
      );
      await assert.rejects(
        campaigns.retireLegacy(actor, { ...mapping, salePrice: 1 }),
        { status: 422 },
      );
      await assert.rejects(
        campaigns.retireLegacy(actor, {
          ...mapping,
          expectedUpdatedAt: new Date(0).toISOString(),
        }),
        { status: 409 },
      );
      await campaigns.retireLegacy(actor, mapping);
      const raw = await db.product.findUniqueOrThrow({
        where: { id: p.id },
        include: { variants: { include: { inventory: true } } },
      });
      assert.equal(raw.basePrice, 399000);
      assert.equal(raw.salePrice, 299000);
      assert.equal(raw.isFlashSale, false);
      assert.equal(raw.flashSalePrice, null);
      assert.equal(raw.flashSaleStartsAt, null);
      assert.equal(raw.flashSaleEndsAt, null);
      assert.equal(raw.status, p.status);
      assert.equal(raw.variants[0].id, p.variants[0].id);
      assert.equal(raw.variants[0].inventory?.onHand, 30);
      assert.deepEqual(
        (
          await db.flashSaleLegacy.findUniqueOrThrow({
            where: { productId: p.id },
          })
        ).snapshot,
        archived.snapshot,
      );
      assert.deepEqual(await pricing.campaignPrices([p.id]), []);
      const b = await buyer(p.variants[0].id);
      const quote = await checkout.previewCheckout(b.id, {
        address: testAddress,
      });
      assert.equal(quote.subtotal, 299000);
      const audit = await db.auditLog.findFirstOrThrow({
        where: { entityId: p.id, action: "flash-campaign.legacy-retire" },
      });
      assert.deepEqual(audit.meta, {
        archived: true,
        retainManualPriceAsRegular: true,
        previousSalePrice: 299000,
        regularSalePrice: 299000,
      });
    },
  );
  await t.test(
    "retention fails closed for scheduled or invalid manual prices and preserves originals",
    async () => {
      for (const extra of [
        {
          salePrice: 80000,
          flashSalePrice: 70000,
          flashSaleStartsAt: new Date(Date.now() - 7200000),
          flashSaleEndsAt: new Date(Date.now() - 3600000),
        },
        { isFlashSale: true, salePrice: null },
        { isFlashSale: true, salePrice: 100000 },
      ]) {
        const p = await product(extra);
        await archive(p);
        await assert.rejects(
          campaigns.retireLegacy(actor, {
            productId: p.id,
            expectedUpdatedAt: p.updatedAt.toISOString(),
            retainManualPriceAsRegular: true,
          }),
          { status: 422 },
        );
        const current = await db.product.findUniqueOrThrow({
          where: { id: p.id },
        });
        assert.equal(
          current.updatedAt.toISOString(),
          p.updatedAt.toISOString(),
        );
        assert.equal(current.salePrice, p.salePrice);
        assert.equal(current.isFlashSale, p.isFlashSale);
        await campaigns.retireLegacy(actor, {
          productId: p.id,
          expectedUpdatedAt: p.updatedAt.toISOString(),
        });
      }
    },
  );
  await t.test(
    "database guards preserve scope, intervals, positive item prices and membership uniqueness",
    async () => {
      const p = await product();
      await assert.rejects(
        db.flashSaleCampaign.create({
          data: {
            id: randomUUID(),
            name: "foreign store",
            storeKey: "other",
            startsAt: new Date(),
            endsAt: new Date(Date.now() + 1000),
          },
        }),
      );
      await assert.rejects(
        db.flashSaleCampaign.create({
          data: {
            id: randomUUID(),
            name: "bad interval",
            startsAt: new Date(),
            endsAt: new Date(0),
          },
        }),
      );
      const c = await save(
        input([{ productId: p.id, flashSalePrice: 80000 }], {
          status: "DRAFT",
        }),
      );
      await assert.rejects(
        db.flashSaleCampaignItem.create({
          data: {
            id: randomUUID(),
            campaignId: c.id,
            productId: p.id,
            flashSalePrice: 70000,
          },
        }),
      );
      await assert.rejects(
        db.flashSaleCampaignItem.create({
          data: {
            id: randomUUID(),
            campaignId: c.id,
            productId: "missing",
            flashSalePrice: 70000,
          },
        }),
      );
      await assert.rejects(
        db.flashSaleCampaignItem.updateMany({
          where: { campaignId: c.id },
          data: { flashSalePrice: 0 },
        }),
      );
      await endAll();
    },
  );
  await t.test(
    "release preflight blocks unresolved legacy rather than silently dropping a promotion",
    async () => {
      const { assertCampaignSchema } = await import(
        "../../src/modules/promotions/campaign-preflight"
      );
      const p = await product({ isFlashSale: true, salePrice: 70000 });
      await archive(p);
      await assert.rejects(assertCampaignSchema(db), /Legacy/);
      await campaigns.retireLegacy(actor, {
        productId: p.id,
        expectedUpdatedAt: p.updatedAt.toISOString(),
      });
      await assertCampaignSchema(db);
    },
  );
});
