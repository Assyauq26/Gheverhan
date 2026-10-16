-- Existing coupons remain unlimited and immediately eligible by default.
ALTER TABLE "Coupon" ADD COLUMN "startsAt" TIMESTAMP(3);
ALTER TABLE "Coupon" ADD COLUMN "usageLimit" INTEGER;
ALTER TABLE "Coupon" ADD COLUMN "perUserLimit" INTEGER;

-- Build this index without blocking checkout INSERT/UPDATE. Keep this migration
-- outside any explicit BEGIN/COMMIT block; PostgreSQL forbids CONCURRENTLY there.
CREATE INDEX CONCURRENTLY "Order_couponCode_userId_idx" ON "Order"("couponCode", "userId");

-- Explicit DB constraints protect against invalid counts outside the application.
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_usageLimit_positive" CHECK ("usageLimit" IS NULL OR "usageLimit" > 0);
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_perUserLimit_positive" CHECK ("perUserLimit" IS NULL OR "perUserLimit" > 0);
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_schedule_order" CHECK ("startsAt" IS NULL OR "expiresAt" IS NULL OR "startsAt" < "expiresAt");
