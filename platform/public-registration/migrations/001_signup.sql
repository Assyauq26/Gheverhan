-- Do not run against any seller/storefront/Gheverhan database.
DO $$ BEGIN
  IF current_database() !~ '^(jetseller_registration|js_registration_[a-z0-9_]+)$'
    OR to_regclass('public."User"') IS NOT NULL
    OR to_regclass('public._prisma_migrations') IS NOT NULL
    OR to_regclass('installer.installations') IS NOT NULL THEN
    RAISE EXCEPTION 'Dedicated JetSeller registration database required';
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS seller_intake;
CREATE TABLE IF NOT EXISTS seller_intake.applications (
  id uuid PRIMARY KEY,
  store_name varchar(100) NOT NULL,
  contact_name varchar(100) NOT NULL,
  email varchar(254) NOT NULL UNIQUE,
  whatsapp varchar(18) NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'PENDING_REVIEW'
    CHECK(status IN ('PENDING_REVIEW','INVITED','ACTIVE','DECLINED')),
  consent_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS applications_by_created_at
  ON seller_intake.applications(created_at DESC);
CREATE TABLE IF NOT EXISTS seller_intake.rate_limits (
  key char(64) PRIMARY KEY,
  attempts integer NOT NULL CHECK(attempts > 0),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_limits_by_expiry
  ON seller_intake.rate_limits(expires_at);
REVOKE ALL ON SCHEMA seller_intake FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA seller_intake FROM PUBLIC;
