-- Additive configuration store. No J&T secrets are seeded; secrets use AES-256-GCM
-- application envelope encryption with JNT_SETTINGS_ENCRYPTION_KEY.
CREATE TABLE IF NOT EXISTS "JntApiSetting" (
  "id" TEXT NOT NULL,
  "environment" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "encryptedCredentials" TEXT NOT NULL,
  "lastModifiedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JntApiSetting_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "JntApiSetting_environment_kind_key" UNIQUE ("environment", "kind"),
  CONSTRAINT "JntApiSetting_environment_check" CHECK ("environment" IN ('sandbox', 'production')),
  CONSTRAINT "JntApiSetting_kind_check" CHECK ("kind" IN ('order', 'tariff', 'tracking', 'cancellation'))
);
-- Current single-store Admin can manage settings. When multi-tenancy is built,
-- revoke from Admin and retain only a platform-level Super Admin.
INSERT INTO "Permission" ("id", "key", "label")
VALUES ('perm_jnt_integration_manage', 'jnt.integration.manage', 'jnt.integration.manage')
ON CONFLICT ("key") DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id" FROM "Role" role
CROSS JOIN "Permission" permission
WHERE role."name" IN ('Admin', 'Super Admin')
  AND permission."key" = 'jnt.integration.manage'
ON CONFLICT DO NOTHING;
