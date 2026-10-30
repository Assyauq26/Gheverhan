import { configureTestJnt, testAddress, shippingConfirmation } from "../fixtures/jnt-checkout";
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { PERMISSIONS } from "../../src/lib/auth/permissions";
import type { CatalogActor } from "../../src/modules/catalog/product-management.validation";

// Explicit, disposable local DB only. No dotenv fallback, production URL or seed.
configureTestJnt();
const target = process.env.SPRINT1_TEST_DATABASE_URL;
if (!target) throw new Error("Set SPRINT1_TEST_DATABASE_URL to a disposable local gheverhan_sprint1_test database");
const parsed = new URL(target);
if (!["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname) || parsed.pathname !== "/gheverhan_sprint1_test") throw new Error("Integration tests refuse non-local or non-test databases");
process.env.DATABASE_URL = target;
process.env.DIRECT_URL = target;
let prisma: PrismaClient;
let service: typeof import("../../src/modules/catalog/product-management.service");
let actor: CatalogActor;
let wishlist: typeof import("../../src/modules/wishlist/wishlist.service");
const prefix = randomUUID().slice(0, 8);
before(async () => {
  prisma = (await import("../../src/lib/prisma")).prisma;
  service = await import("../../src/modules/catalog/product-management.service");
  wishlist = await import("../../src/modules/wishlist/wishlist.service");
  const user = await prisma.user.create({ data: { name: "Integration staff", email: `${prefix}@integration.example.test`, passwordHash: "integration-fixture-not-for-login" } });
  actor = { id: user.id, isAdmin: true, permissions: Object.values(PERMISSIONS) };
});
after(async () => { await prisma?.$disconnect(); });
const input = (suffix: string) => ({ name: "Integration product", weightGrams: 500, slug: `integration-${prefix}-${suffix}`, basePrice: 100000, salePrice: null, variants: [{ sku: `GH-${prefix}-${suffix}`, color: "Black", size: "M", onHand: 5 }], images: [] });

test("real PostgreSQL product lifecycle and transactional guards", async t => {
  await t.test("Marketing creates, edits, disables and audits voucher with RBAC and duplicate protection", async () => {
    const marketing = await import("../../src/modules/promotions/marketing.service");
    const code = `MKT-${prefix}`.toUpperCase();
    const inputVoucher = { code, discountType: "PERCENT" as const, discountValue: 10, minSpend: 100000, maxDiscount: 20000, expiresAt: null, isActive: true };
    const marketer = { ...actor, permissions: [PERMISSIONS.PRODUCT_READ, PERMISSIONS.PROMOTION_CREATE, PERMISSIONS.PROMOTION_UPDATE] };
    const before = await prisma.coupon.count({ where: { code } });
    await assert.rejects(marketing.saveVoucher({ ...marketer, isAdmin: false }, null, inputVoucher), { status: 403 });
    await assert.rejects(marketing.saveVoucher({ ...marketer, permissions: [] }, null, inputVoucher), { status: 403 });
    assert.equal(await prisma.coupon.count({ where: { code } }), before);
    const created = await marketing.saveVoucher(marketer, null, inputVoucher);
    assert.equal((await prisma.coupon.findUniqueOrThrow({ where: { id: created.id } })).code, code);
    await assert.rejects(marketing.saveVoucher(marketer, null, inputVoucher), { status: 409 });
    await assert.rejects(marketing.saveVoucher(marketer, created.id, { ...inputVoucher, code: "DIFFERENT" }), { status: 422 });
    await marketing.saveVoucher(marketer, created.id, { ...inputVoucher, discountValue: 15 });
    assert.equal((await prisma.coupon.findUniqueOrThrow({ where: { id: created.id } })).discountValue, 15);
    await marketing.setVoucherActive(marketer, created.id, false);
    assert.equal((await prisma.coupon.findUniqueOrThrow({ where: { id: created.id } })).isActive, false);
    assert.equal(await prisma.auditLog.count({ where: { entity: "Coupon", entityId: created.id } }), 3);
  });
  await t.test("Marketing active voucher totals stay accurate beyond the 100-row list limit", async () => {
    const marketing = await import("../../src/modules/promotions/marketing.service");
    const many = Array.from({ length: 102 }, (_, i) => ({
      code: `PAGE-${prefix}-${i}`, discountType: "PERCENT" as const, discountValue: 5,
      isActive: true,
    }));
    await prisma.coupon.createMany({ data: many });
    try {
      const actual = await prisma.coupon.count({ where: { isActive: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } });
      const listing = await marketing.listMarketing(actor);
      assert.ok(listing.vouchers.length <= 100);
      assert.equal(listing.activeVouchers, actual);
    } finally {
      await prisma.coupon.deleteMany({ where: { code: { startsWith: `PAGE-${prefix}` } } });
    }
  });
  await t.test("Marketing paginated search exposes legacy products beyond the old sixty-row cap", async () => {
    const {campaignProducts}=await import("../../src/modules/promotions/campaign.service");
    const scheduled=await prisma.product.create({data:{name:"Scheduled featured fixture",slug:`scheduled-priority-${prefix}`,basePrice:100000,flashSalePrice:80000,flashSaleStartsAt:new Date(Date.now()+3600000),flashSaleEndsAt:new Date(Date.now()+7200000),status:"PUBLISHED"}});
    await prisma.product.createMany({data:Array.from({length:65},(_,i)=>({name:`Regular fixture ${i}`,slug:`regular-priority-${prefix}-${i}`,basePrice:120000,status:"PUBLISHED" as const}))});
    try {
      const listing=await campaignProducts(actor,{search:"Scheduled featured fixture"});
      assert.ok(listing.items.some(p=>p.id===scheduled.id&&p.legacy));
      assert.ok(listing.items.find(p=>p.id===scheduled.id)?.reason,"Unavailable product remains visible with an eligibility reason");
      const regular=await campaignProducts(actor,{search:"Regular fixture",page:2});
      assert.equal(regular.total,65);assert.equal(regular.items.length,20);assert.equal(regular.page,2);
    } finally {await prisma.product.deleteMany({where:{slug:{startsWith:`regular-priority-${prefix}-`}}});await prisma.product.delete({where:{id:scheduled.id}});}
  });
  await t.test("legacy manual/scheduled writers are closed and preserve regular prices with RBAC", async () => {
    const marketing=await import("../../src/modules/promotions/marketing.service");
    const p=await prisma.product.create({data:{name:"Flash fixture",slug:`flash-${prefix}`,basePrice:100000,salePrice:95000,status:"PUBLISHED",variants:{create:{sku:`FLASH-${prefix}`,inventory:{create:{onHand:4}}}}}});
    const payload={productId:p.id,expectedUpdatedAt:p.updatedAt.toISOString(),enabled:true,salePrice:80000};
    await assert.rejects(marketing.setFlashSale({...actor,permissions:[]},payload),{status:403});
    await assert.rejects(marketing.setFlashSale(actor,payload),{status:410});
    await assert.rejects(marketing.setScheduledFlashSale(actor,{...payload,price:70000}),{status:410});
    const after=await prisma.product.findUniqueOrThrow({where:{id:p.id}});assert.equal(after.salePrice,95000);assert.equal(after.isFlashSale,false);assert.equal(after.flashSalePrice,null);
    assert.equal(await prisma.auditLog.count({where:{entityId:p.id,action:{startsWith:"flash-sale."}}}),0);
  });
  await t.test("central campaign controls cart/preview, protects edits, rejects stale versions and restores regular discount", async () => {
    const {saveCampaign,endCampaign}=await import("../../src/modules/promotions/campaign.service");
    const cart=await import("../../src/modules/cart/cart.service");
    const checkout=await import("../../src/modules/checkout/checkout.service");
    const p=await prisma.product.create({data:{name:"Campaign cart fixture",slug:`campaign-cart-${prefix}`,basePrice:100000,salePrice:95000,status:"PUBLISHED",variants:{create:{sku:`CAMPAIGN-${prefix}`,inventory:{create:{onHand:4}}}}},include:{variants:true}});
    const buyer=await prisma.user.create({data:{name:"Campaign buyer",email:`campaign-${prefix}@example.test`,passwordHash:"not-for-login"}});
    await cart.addItem(buyer.id,p.variants[0].id,1);
    const inputCampaign={id:null,expectedVersion:0,name:"Lifecycle campaign",status:"SCHEDULED",startsAt:new Date(Date.now()-60000).toISOString(),endsAt:new Date(Date.now()+60000).toISOString(),items:[{productId:p.id,flashSalePrice:70000}]};
    await assert.rejects(saveCampaign({...actor,permissions:[]},inputCampaign),{status:403});
    await assert.rejects(saveCampaign(actor,{...inputCampaign,items:[{productId:p.id,flashSalePrice:95000}]}),{status:422});
    const c=await saveCampaign(actor,inputCampaign);
    assert.equal((await cart.getCartView(buyer.id)).subtotal,70000);assert.equal((await checkout.previewCheckout(buyer.id,{})).subtotal,70000);
    const edit=await service.getManagedProduct(actor,p.id);
    await assert.rejects(service.updateManagedProduct(actor,p.id,edit.updatedAt,{...edit,basePrice:50000,salePrice:null}),{status:409});
    const future={...inputCampaign,id:c.id,expectedVersion:c.version,startsAt:new Date(Date.now()+60000).toISOString(),endsAt:new Date(Date.now()+120000).toISOString()};
    const saved=await saveCampaign(actor,future);
    await assert.rejects(saveCampaign(actor,future),{status:409});
    assert.equal((await cart.getCartView(buyer.id)).subtotal,95000);assert.equal((await checkout.previewCheckout(buyer.id,{})).subtotal,95000);
    await endCampaign(actor,{id:c.id,expectedVersion:saved.version});
    assert.equal((await cart.getCartView(buyer.id)).subtotal,95000);
    const after=await prisma.product.findUniqueOrThrow({where:{id:p.id}});assert.equal(after.salePrice,95000);assert.equal(after.flashSalePrice,null);
    assert.equal(await prisma.auditLog.count({where:{entity:"FlashSaleCampaign",entityId:c.id}}),3);
  });
  await t.test("editing and adding a variant preserves deterministic editor ordering", async () => {
    const created = await service.createManagedProduct(actor, input("variant-order"));
    const initial = await service.getManagedProduct(actor, created.id); const originalId = initial.variants[0].id;
    await service.updateManagedProduct(actor, created.id, initial.updatedAt, { ...initial, variants: [{ ...initial.variants[0], sku: `ORDER-${prefix}` }, { sku: `NEW-${prefix}`, onHand: 0 }] });
    const updated = await service.getManagedProduct(actor, created.id);
    assert.equal(updated.variants[0].id, originalId); assert.equal(updated.variants[1].onHand, 0);
    await service.updateManagedProduct(actor, created.id, updated.updatedAt, { ...updated, variants: [updated.variants[0]] });
    assert.equal((await service.getManagedProduct(actor, created.id)).variants[0].id, originalId);
  });
  let product = await service.createManagedProduct(actor, input("main"));
  let editor = await service.getManagedProduct(actor, product.id);
  await t.test("create is always draft with variant, inventory and audit", async () => {
    assert.equal(editor.status, "DRAFT"); assert.equal(editor.variants[0].onHand, 5);
    assert.equal(await prisma.auditLog.count({ where: { entityId: product.id, action: "product.create" } }), 1);
  });
  await t.test("permission failure has no database side effects", async () => {
    const count = await prisma.product.count();
    await assert.rejects(service.createManagedProduct({ ...actor, permissions: [] }, input("denied")), { status: 403 });
    assert.equal(await prisma.product.count(), count);
  });
  await t.test("duplicate SKU rolls back the parent product and audit", async () => {
    const duplicate = { ...input("duplicate"), variants: [{ sku: editor.variants[0].sku, onHand: 0 }] };
    await assert.rejects(service.createManagedProduct(actor, duplicate), { status: 409 });
    assert.equal(await prisma.product.count({ where: { slug: duplicate.slug } }), 0);
  });
  await t.test("invalid category rolls back the transaction", async () => {
    await assert.rejects(service.createManagedProduct(actor, { ...input("bad-category"), categoryId: "missing" }), { status: 422 });
    assert.equal(await prisma.product.count({ where: { slug: input("bad-category").slug } }), 0);
  });
  await t.test("a stocked legacy variant without movements cannot be silently deleted", async () => {
    const legacy = await service.createManagedProduct(actor, { ...input("legacy"), variants: [{ sku: `LEGACY-${prefix}`, onHand: 0 }] });
    const state = await service.getManagedProduct(actor, legacy.id);
    await prisma.inventory.update({ where: { variantId: state.variants[0].id }, data: { onHand: 3 } });
    await assert.rejects(service.updateManagedProduct(actor, legacy.id, state.updatedAt, { ...state, variants: [{ sku: `REPLACE-${prefix}`, onHand: 0 }] }), { status: 409 });
    assert.equal((await prisma.inventory.findUniqueOrThrow({ where: { variantId: state.variants[0].id } })).onHand, 3);
  });
  await t.test("publish without images fails without advancing the revision", async () => {
    await assert.rejects(service.changeProductStatus(actor, product.id, product.updatedAt, "PUBLISHED"), { status: 422 });
    assert.equal((await service.getManagedProduct(actor, product.id)).updatedAt, product.updatedAt);
  });
  await t.test("a draft cannot be added to the buyer wishlist", async () => {
    await assert.rejects(wishlist.toggleWishlist(actor.id, product.id), { status: 404 });
  });
  await t.test("images and variants from another product cannot be attached through edit", async () => {
    const other = await service.createManagedProduct(actor, input("other"));
    const otherData = await service.getManagedProduct(actor, other.id);
    await assert.rejects(service.updateManagedProduct(actor, product.id, product.updatedAt, { ...editor, variants: otherData.variants }), { status: 422 });
    await assert.rejects(service.updateManagedProduct(actor, product.id, product.updatedAt, { ...editor, images: [{ id: "foreign", alt: "" }] }), { status: 422 });
    assert.equal((await service.getManagedProduct(actor, product.id)).updatedAt, product.updatedAt);
  });
  await t.test("edit persists product, SKU, price and stock consistently", async () => {
    product = await service.updateManagedProduct(actor, product.id, product.updatedAt, { ...editor, name: "Edited product", basePrice: 120000, variants: [{ ...editor.variants[0], sku: `GH-${prefix}-EDIT`, onHand: 7 }] });
    editor = await service.getManagedProduct(actor, product.id);
    assert.equal(editor.name, "Edited product"); assert.equal(editor.basePrice, 120000); assert.equal(editor.variants[0].onHand, 7);
  });
  await t.test("stale revisions and concurrent saves cannot overwrite each other", async () => {
    await assert.rejects(service.updateManagedProduct(actor, product.id, "2000-01-01T00:00:00.000Z", editor), { status: 409 });
    const results = await Promise.allSettled([service.updateManagedProduct(actor, product.id, product.updatedAt, { ...editor, name: "Concurrent A" }), service.updateManagedProduct(actor, product.id, product.updatedAt, { ...editor, name: "Concurrent B" })]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    assert.equal(results.filter(r => r.status === "rejected" && r.reason.status === 409).length, 1);
    editor = await service.getManagedProduct(actor, product.id); product = { ...product, updatedAt: editor.updatedAt };
  });
  await t.test("read-only product data does not expose inventory", async () => {
    const readOnly = await service.getManagedProduct({ ...actor, permissions: [PERMISSIONS.PRODUCT_READ] }, product.id);
    assert.equal("onHand" in readOnly.variants[0], false); assert.equal("reserved" in readOnly.variants[0], false);
  });
  await t.test("inventory adjustment cannot erase a reservation or overwrite a concurrent sale", async () => {
    await prisma.inventory.update({ where: { variantId: editor.variants[0].id }, data: { reserved: 2 } });
    await assert.rejects(service.updateManagedProduct(actor, product.id, editor.updatedAt, { ...editor, variants: [{ ...editor.variants[0], onHand: 1 }] }), { status: 409 });
    await prisma.inventory.update({ where: { variantId: editor.variants[0].id }, data: { onHand: { decrement: 1 } } });
    await assert.rejects(service.updateManagedProduct(actor, product.id, editor.updatedAt, { ...editor, variants: [{ ...editor.variants[0], onHand: 10 }] }), { status: 409 });
    assert.equal((await prisma.inventory.findUniqueOrThrow({ where: { variantId: editor.variants[0].id } })).onHand, 6);
    editor = await service.getManagedProduct(actor, product.id);
  });
  await t.test("publish and archive preserve variant/order history", async () => {
    const image = await service.attachProductImage(actor, product.id, editor.updatedAt, { id: randomUUID(), url: "https://example.test/integration.png", alt: "Integration image" });
    product = await service.changeProductStatus(actor, product.id, image.updatedAt, "PUBLISHED");
    assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).status, "PUBLISHED");
    assert.equal((await wishlist.toggleWishlist(actor.id, product.id)).active, true);
    const order = await prisma.order.create({ data: { orderNumber: `TEST-${prefix}`, userId: actor.id, subtotal: 120000, total: 120000, shippingCost: 0, discount: 0, items: { create: { variantId: editor.variants[0].id!, productName: editor.name, variantLabel: "M", imageUrl: image.image.url, unitPrice: 120000, quantity: 1, lineTotal: 120000 } } } });
    product = await service.changeProductStatus(actor, product.id, product.updatedAt, "ARCHIVED");
    assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).status, "ARCHIVED");
    assert.equal(await prisma.orderItem.count({ where: { orderId: order.id } }), 1);
    assert.equal((await wishlist.getWishlistView(actor.id)).length, 0);
    assert.equal(await prisma.wishlistItem.count({ where: { productId: product.id } }), 1);
    const current = await service.getManagedProduct(actor, product.id);
    await assert.rejects(service.updateManagedProduct(actor, product.id, current.updatedAt, { ...current, images: [] }), { status: 409 });
    const archivedVersion = (await service.getManagedProduct(actor, product.id)).updatedAt;
    assert.equal(archivedVersion, current.updatedAt);
  });
  await t.test("published checkout works and archived carts cannot create orders", async () => {
    process.env.SHIPPING_PROVIDER = "manual";
    const { addItem, getCartView } = await import("../../src/modules/cart/cart.service");
    const { createOrder } = await import("../../src/modules/checkout/checkout.service");
    const bank = await prisma.bankAccount.create({ data: { bankName: "Test", accountNumber: "fixture-only", accountHolder: "Fixture", displayName: "Test" } });
    const checkout = { bankAccountId: bank.id, address: testAddress, shipping: { courier: "J&T Express", service: "EZ", cost: 20000 } };
    product = await service.changeProductStatus(actor, product.id, product.updatedAt, "PUBLISHED");
    await addItem(actor.id, editor.variants[0].id!, 1);
    const placed = await createOrder(actor.id, { ...checkout, ...(await shippingConfirmation(actor.id)), expectedLines: (await getCartView(actor.id)).lines });
    assert.equal(placed.total, 140000);
    assert.equal(await prisma.payment.count({ where: { orderId: placed.id } }), 1);
    await addItem(actor.id, editor.variants[0].id!, 1);
    product = await service.changeProductStatus(actor, product.id, product.updatedAt, "ARCHIVED");
    assert.equal((await getCartView(actor.id)).lines[0].inStock, false);
    const orders = await prisma.order.count({ where: { userId: actor.id } });
    await assert.rejects(createOrder(actor.id, checkout), { status: 409 });
    assert.equal(await prisma.order.count({ where: { userId: actor.id } }), orders);
    assert.equal(await prisma.cartItem.count({ where: { cart: { userId: actor.id } } }), 1);
  });
  await t.test("archive during shipping calculation is rejected inside the checkout transaction", async () => {
    const { createOrder } = await import("../../src/modules/checkout/checkout.service");
    const { getCartView } = await import("../../src/modules/cart/cart.service");
    const { getShippingProvider } = await import("../../src/infrastructure/shipping");
    const provider = getShippingProvider("manual");
    product = await service.changeProductStatus(actor, product.id, product.updatedAt, "PUBLISHED");
    const confirmedShipping = await shippingConfirmation(actor.id);
    const original = provider.getRates!;
    let release!: () => void;
    let reached!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const ready = new Promise<void>(resolve => { reached = resolve; });
    provider.getRates = async params => { reached(); await gate; return original.call(provider, params); };
    try {
      product = await service.changeProductStatus(actor, product.id, product.updatedAt, "PUBLISHED");
      const bank = await prisma.bankAccount.findFirstOrThrow({ where: { accountHolder: "Fixture" } });
      const count = await prisma.order.count({ where: { userId: actor.id } });
      const pending = createOrder(actor.id, { ...confirmedShipping, bankAccountId: bank.id, expectedLines: (await getCartView(actor.id)).lines });
      const rejected = assert.rejects(pending, { status: 409 });
      await ready;
      product = await service.changeProductStatus(actor, product.id, product.updatedAt, "ARCHIVED");
      release(); await rejected;
      assert.equal(await prisma.order.count({ where: { userId: actor.id } }), count);
      assert.equal(await prisma.cartItem.count({ where: { cart: { userId: actor.id } } }), 1);
    } finally { release(); provider.getRates = original; }
  });
  await t.test("category cycle detection preserves the existing hierarchy", async () => {
    const parent = await service.saveCategory(actor, null, { name: "Parent", slug: `parent-${prefix}` });
    const child = await service.saveCategory(actor, null, { name: "Child", slug: `child-${prefix}`, parentId: parent.id });
    await assert.rejects(service.saveCategory(actor, parent.id, { name: "Parent", slug: `parent-${prefix}`, parentId: child.id }), { status: 422 });
    assert.equal((await prisma.category.findUniqueOrThrow({ where: { id: parent.id } })).parentId, null);
  });
});
