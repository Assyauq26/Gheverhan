CREATE TABLE "LocalAdminSetup" (
 "installationId" TEXT PRIMARY KEY,
 "claimHash" TEXT NOT NULL CHECK ("claimHash" ~ '^[a-f0-9]{64}$'),
 "expiresAt" TIMESTAMP(3) NOT NULL,
 "attempts" INTEGER NOT NULL DEFAULT 0 CHECK ("attempts" BETWEEN 0 AND 5),
 "consumedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "LocalAdminSetup_expiresAt_idx" ON "LocalAdminSetup"("expiresAt");

ALTER TABLE "LocalAdminSetup" ENABLE ROW LEVEL SECURITY;
