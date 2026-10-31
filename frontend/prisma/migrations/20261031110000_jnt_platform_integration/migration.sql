-- Additive, fail-closed global J&T integration configuration. No plaintext secrets.
SET lock_timeout = '5s';
SET statement_timeout = '30s';
CREATE TABLE "JntPlatformIntegration" (
    "environment" VARCHAR(16) NOT NULL,
    "encryptedConfig" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedBy" VARCHAR(128),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "JntPlatformIntegration_pkey" PRIMARY KEY ("environment"),
    CONSTRAINT "JntPlatformIntegration_environment_check" CHECK ("environment" IN ('sandbox', 'production'))
);
RESET lock_timeout;
RESET statement_timeout;
