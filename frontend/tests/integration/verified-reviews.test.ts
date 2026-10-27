import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient, type OrderStatus } from "@prisma/client";
const target = new URL(
  process.env.SPRINT1_TEST_DATABASE_URL || "http://invalid",
);
assert.ok(["localhost", "127.0.0.1"].includes(target.hostname));
assert.equal(target.pathname, "/gheverhan_sprint1_test");
assert.equal(process.env.GHEVERHAN_ISOLATED_TESTS, "1");
process.env.DATABASE_URL = target.toString();
process.env.DIRECT_URL = target.toString();
const db = new PrismaClient({
    datasources: { db: { url: target.toString() } },
  }),
  prefix = randomUUID();
let service: typeof import("../../src/modules/reviews/reviews.service"),
  pub: typeof import("../../src/modules/reviews/public-reviews"),
  refund: typeof import("../../src/modules/payments/refund.service");
let buyer: string,
  other: string,
  staff: string,
  product: string,
  variant: string;
const input = {
  rating: 5,
  title: "Nyaman",
  body: "Produk sesuai pembelian saya.",
};
before(async () => {
  service = await import("../../src/modules/reviews/reviews.service");
  pub = await import("../../src/modules/reviews/public-reviews");
  refund = await import("../../src/modules/payments/refund.service");
  const users = await Promise.all(
    ["buyer", "other", "staff"].map((name) =>
      db.user.create({
        data: {
          name: `${name} Private Surname`,
          email: `${name}@${prefix}.example.test`,
          passwordHash: "isolated-test",
        },
      }),
    ),
  );
  [buyer, other, staff] = users.map((u) => u.id);
  const role = await db.role.upsert({
    where: { name: "Admin" },
    create: { name: "Admin", label: "Admin" },
    update: {},
  });
  for (const key of ["product.update", "payment.verify"]) {
    const permission = await db.permission.upsert({
      where: { key },
      create: { key, label: key },
      update: {},
    });
    await db.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: role.id, permissionId: permission.id },
      },
      create: { roleId: role.id, permissionId: permission.id },
      update: {},
    });
  }
  await db.userRole.create({ data: { userId: staff, roleId: role.id } });
  const p = await db.product.create({
    data: {
      name: "Review fixture",
      slug: `review-${prefix}`,
      basePrice: 10000,
      variants: { create: { sku: `REVIEW-${prefix}` } },
    },
    include: { variants: true },
  });
  product = p.id;
  variant = p.variants[0].id;
});
after(async () => {
  await db.review.deleteMany({
    where: {
      OR: [{ productId: product }, { userId: { in: [buyer, other, staff] } }],
    },
  });
  await db.auditLog.deleteMany({
    where: { userId: { in: [buyer, other, staff] } },
  });
  await db.order.deleteMany({
    where: { userId: { in: [buyer, other, staff] } },
  });
  await db.productVariant.deleteMany({ where: { productId: product } });
  await db.product.delete({ where: { id: product } });
  await db.user.deleteMany({ where: { id: { in: [buyer, other, staff] } } });
  await db.$disconnect();
});
async function order(status: OrderStatus = "DELIVERED", owner = buyer) {
  return db.order.create({
    data: {
      orderNumber: `RV-${randomUUID()}`,
      userId: owner,
      status,
      paymentStatus: "PAID",
      subtotal: 10000,
      total: 10000,
      items: {
        create: {
          variantId: variant,
          productName: "Snapshot",
          variantLabel: "Hitam / M",
          unitPrice: 10000,
          quantity: 1,
          lineTotal: 10000,
        },
      },
      payment: { create: { status: "PAID", amount: 10000 } },
    },
    include: { items: true, payment: true },
  });
}
const denied = (status: number) => (error: unknown) =>
  Boolean(
    error &&
      typeof error === "object" &&
      "status" in error &&
      error.status === status,
  );
for (const status of [
  "PENDING_PAYMENT",
  "PAID",
  "PROCESSING",
  "PACKED",
  "SHIPPED",
  "CANCELLED",
  "EXPIRED",
  "REFUNDED",
] as OrderStatus[])
  test(`denies ${status} even with a paid payment row`, async () => {
    const o = await order(status);
    await assert.rejects(
      service.createReview(buyer, o.items[0].id, input),
      denied(409),
    );
  });
test("denies missing purchase, another buyer and forged input identity", async () => {
  const o = await order();
  await assert.rejects(
    service.createReview(other, o.items[0].id, input),
    denied(404),
  );
  await assert.rejects(
    service.createReview(buyer, product, input),
    denied(404),
  );
  await assert.rejects(
    service.createReview(buyer, o.items[0].id, {
      ...input,
      productId: product,
    }),
    denied(422),
  );
  await assert.rejects(service.reviewableOrderItems(other, o.id), denied(404));
});
test("denies unpaid, missing payment and inactive account", async () => {
  const o = await order();
  await db.payment.update({
    where: { id: o.payment!.id },
    data: { status: "REJECTED" },
  });
  await assert.rejects(
    service.createReview(buyer, o.items[0].id, input),
    denied(409),
  );
  await db.payment.delete({ where: { id: o.payment!.id } });
  await assert.rejects(
    service.createReview(buyer, o.items[0].id, input),
    denied(409),
  );
  const inactive = await order("DELIVERED", other);
  await db.user.update({ where: { id: other }, data: { isActive: false } });
  await assert.rejects(
    service.createReview(other, inactive.items[0].id, input),
    denied(404),
  );
  await db.user.update({ where: { id: other }, data: { isActive: true } });
});
test("delivered/completed items publish exact identity; each purchased item can review once", async () => {
  for (const status of ["DELIVERED", "COMPLETED"] as OrderStatus[]) {
    const o = await order(status);
    const result = await service.createReview(buyer, o.items[0].id, input);
    const row = await db.review.findUniqueOrThrow({ where: { id: result.id } });
    assert.equal(row.productId, product);
    assert.equal(row.userId, buyer);
    assert.equal(row.orderItemId, o.items[0].id);
    assert.equal(row.status, "PUBLISHED");
    assert.equal(
      (await service.reviewableOrderItems(buyer, o.id))[0].reviewed,
      true,
    );
  }
  assert.deepEqual((await pub.verifiedRatings([product])).get(product), {
    ratingAvg: 5,
    reviewCount: 2,
  });
  const stored = await db.product.findUniqueOrThrow({ where: { id: product } });
  assert.equal(stored.ratingAvg, 5);
  assert.equal(stored.reviewCount, 2);
  const rows = await pub.listReviews(product);
  assert.equal(rows.length, 2);
  const serialized = JSON.stringify(rows);
  for (const deniedText of ["Private Surname", "@", "orderItemId", "orderId"])
    assert.ok(!serialized.includes(deniedText));
});
test("concurrent duplicates create exactly one row and one rating increment", async () => {
  const o = await order();
  const before = (await pub.verifiedRatings([product])).get(
    product,
  )!.reviewCount;
  const results = await Promise.allSettled(
    Array.from({ length: 8 }, () =>
      service.createReview(buyer, o.items[0].id, input),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    await db.review.count({ where: { orderItemId: o.items[0].id } }),
    1,
  );
  assert.equal(
    (await pub.verifiedRatings([product])).get(product)!.reviewCount,
    before + 1,
  );
  for (const result of results)
    if (result.status === "rejected") assert.ok(denied(409)(result.reason));
  await assert.rejects(
    db.review.create({
      data: {
        userId: buyer,
        productId: product,
        orderItemId: o.items[0].id,
        ...input,
      },
    }),
    (error) =>
      Boolean(
        error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "P2002",
      ),
  );
});
test("moderation rejects customers and excludes pending/rejected reviews from aggregates", async () => {
  const o = await order(),
    result = await service.createReview(buyer, o.items[0].id, input);
  await assert.rejects(
    service.setReviewStatus(buyer, result.id, "REJECTED"),
    denied(403),
  );
  const before = (await pub.verifiedRatings([product])).get(
    product,
  )!.reviewCount;
  for (const status of ["PENDING", "REJECTED"] as const) {
    await service.setReviewStatus(staff, result.id, status);
    assert.ok(
      !(await pub.listReviews(product)).some((r) => r.id === result.id),
    );
    assert.equal(
      (await pub.verifiedRatings([product])).get(product)!.reviewCount,
      before - 1,
    );
  }
  await service.setReviewStatus(staff, result.id, "PUBLISHED");
  assert.equal(
    (await pub.verifiedRatings([product])).get(product)!.reviewCount,
    before,
  );
});
test("legacy unlinked and mismatched identities are preserved but never public", async () => {
  const before = (await pub.verifiedRatings([product])).get(
    product,
  )!.reviewCount;
  const legacy = await db.review.create({
    data: { productId: product, userId: buyer, ...input },
  });
  await db.review.create({
    data: { productId: product, userId: buyer, ...input },
  });
  const o = await order();
  const forged = await db.review.create({
    data: {
      productId: product,
      userId: other,
      orderItemId: o.items[0].id,
      ...input,
    },
  });
  const rows = await pub.listReviews(product);
  assert.ok(!rows.some((r) => [legacy.id, forged.id].includes(r.id)));
  assert.equal(
    (await pub.verifiedRatings([product])).get(product)!.reviewCount,
    before,
  );
  await service.setReviewStatus(staff, legacy.id, "PUBLISHED");
  assert.equal(
    (await pub.verifiedRatings([product])).get(product)!.reviewCount,
    before,
  );
});
test("active refund hides published review immediately without touching commerce rules", async () => {
  const o = await order(),
    result = await service.createReview(buyer, o.items[0].id, input);
  const request = await refund.requestRefund(o.id, staff, {
    requestId: randomUUID(),
    amount: 10000,
    reason: "Isolated refund gate",
  });
  assert.ok(!(await pub.listReviews(product)).some((r) => r.id === result.id));
  assert.equal(
    (await service.reviewableOrderItems(buyer, o.id))[0].eligible,
    false,
  );
  await db.paymentEvent.create({
    data: {
      paymentId: o.payment!.id,
      type: "REFUND_DECLINED",
      externalId: `refund-resolution:${request.id}`,
    },
  });
  assert.ok((await pub.listReviews(product)).some((r) => r.id === result.id));
  await db.order.update({
    where: { id: o.id },
    data: { status: "REFUNDED", paymentStatus: "REFUNDED" },
  });
  assert.ok(!(await pub.listReviews(product)).some((r) => r.id === result.id));
});
test("refund request and review race serialize on the existing order lock", async () => {
  const o = await order();
  const results = await Promise.allSettled([
    service.createReview(buyer, o.items[0].id, input),
    refund.requestRefund(o.id, staff, {
      requestId: randomUUID(),
      amount: 10000,
      reason: "Concurrent refund gate",
    }),
  ]);
  assert.equal(results[1].status, "fulfilled");
  assert.ok(
    (await pub.listReviews(product)).every(
      (r) =>
        r.id !==
        (results[0].status === "fulfilled" ? results[0].value.id : "none"),
    ),
  );
  assert.equal(
    await db.review.count({ where: { orderItemId: o.items[0].id } }),
    results[0].status === "fulfilled" ? 1 : 0,
  );
});
test("validates integer rating and bounded plain text before writing", async () => {
  const o = await order();
  for (const value of [
    { ...input, rating: 1.5 },
    { ...input, rating: 6 },
    { ...input, body: " " },
    { ...input, title: "x".repeat(121) },
    { ...input, body: "x".repeat(2001) },
  ])
    await assert.rejects(
      service.createReview(buyer, o.items[0].id, value),
      denied(422),
    );
  assert.equal(
    await db.review.count({ where: { orderItemId: o.items[0].id } }),
    0,
  );
});

test("mixed ratings and publication recalculate the same public and stored aggregate", async () => {
  const before = (await pub.verifiedRatings([product])).get(product)!;
  const o = await order();
  const result = await service.createReview(buyer, o.items[0].id, {
    ...input,
    rating: 1,
  });
  const rating = (await pub.verifiedRatings([product])).get(product)!;
  assert.equal(rating.reviewCount, before.reviewCount + 1);
  assert.ok(
    Math.abs(
      rating.ratingAvg -
        (before.ratingAvg * before.reviewCount + 1) / (before.reviewCount + 1),
    ) < 0.00001,
  );
  const stored = await db.product.findUniqueOrThrow({ where: { id: product } });
  assert.equal(stored.ratingAvg, rating.ratingAvg);
  assert.equal(stored.reviewCount, rating.reviewCount);
  await service.setReviewStatus(staff, result.id, "REJECTED");
  assert.equal(
    (await pub.verifiedRatings([product])).get(product)!.reviewCount,
    before.reviewCount,
  );
});
test("a linked review for another product is never projected as verified", async () => {
  const another = await db.product.create({
    data: {
      name: "Other fixture",
      slug: `other-review-${prefix}`,
      basePrice: 1,
    },
  });
  const o = await order();
  try {
    const row = await db.review.create({
      data: {
        productId: another.id,
        userId: buyer,
        orderItemId: o.items[0].id,
        ...input,
      },
    });
    assert.equal((await pub.listReviews(another.id)).length, 0);
    assert.equal((await pub.verifiedRatings([another.id])).size, 0);
    await db.review.delete({ where: { id: row.id } });
  } finally {
    await db.product.delete({ where: { id: another.id } });
  }
});

test("PDP list and rating stay on one snapshot during publication races", async () => {
  const o = await order(),
    result = await service.createReview(buyer, o.items[0].id, input);
  await Promise.all([
    (async () => {
      for (let i = 0; i < 16; i++)
        await service.setReviewStatus(
          staff,
          result.id,
          i % 2 ? "PUBLISHED" : "PENDING",
        );
    })(),
    (async () => {
      for (let i = 0; i < 30; i++) {
        const view = await pub.readProductReviewSummary(product);
        assert.equal(view.reviewCount, view.reviews.length);
        assert.ok(
          Math.abs(
            view.ratingAvg -
              view.reviews.reduce((sum, r) => sum + r.rating, 0) /
                view.reviewCount,
          ) < 0.000001,
        );
      }
    })(),
  ]);
});
test("PDP pagination limits visible rows without truncating aggregate evidence", async () => {
  const before = (await pub.verifiedRatings([product])).get(product)!;
  for (let i = 0; i < 21; i++) {
    const o = await order();
    await service.createReview(buyer, o.items[0].id, {
      ...input,
      rating: i % 2 ? 1 : 5,
    });
  }
  const view = await pub.readProductReviewSummary(product);
  assert.equal(view.reviews.length, 20);
  assert.equal(view.reviewCount, before.reviewCount + 21);
  assert.deepEqual(
    { ratingAvg: view.ratingAvg, reviewCount: view.reviewCount },
    (await pub.verifiedRatings([product])).get(product),
  );
});
