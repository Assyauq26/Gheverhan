-- Dedicated control database only; never apply to a storefront database.
DO $$ BEGIN
 IF current_database() !~ '^(jetseller_control|js_control_)' OR
    to_regclass('public."User"') IS NOT NULL OR to_regclass('public._prisma_migrations') IS NOT NULL THEN
   RAISE EXCEPTION 'Dedicated control database required';
 END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS installer;
CREATE TABLE IF NOT EXISTS installer.schema_version (version integer PRIMARY KEY CHECK (version = 1));
INSERT INTO installer.schema_version VALUES (1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS installer.sellers (
 id uuid PRIMARY KEY, external_subject text UNIQUE NOT NULL, email_verified boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS installer.sessions (
 id uuid PRIMARY KEY, seller_id uuid NOT NULL REFERENCES installer.sellers(id),
 csrf_hash char(64) NOT NULL, expires_at timestamptz NOT NULL, revoked_at timestamptz
);
CREATE TABLE IF NOT EXISTS installer.installations (
 id uuid PRIMARY KEY, seller_id uuid NOT NULL REFERENCES installer.sellers(id),
 display_name text NOT NULL CHECK(length(display_name) BETWEEN 1 AND 100), domain text NOT NULL,
 reserved_domain text UNIQUE, claim_expires_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PAIRED','UNPAIRED','CANCELLED')),
 version integer NOT NULL DEFAULT 1, client_request_id uuid NOT NULL, request_hash char(64) NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(seller_id, client_request_id)
);
CREATE INDEX IF NOT EXISTS installation_owner ON installer.installations(seller_id, created_at);
CREATE TABLE IF NOT EXISTS installer.pairing_sessions (
 id uuid PRIMARY KEY, installation_id uuid NOT NULL REFERENCES installer.installations(id),
 device_hash char(64) UNIQUE NOT NULL, user_hash char(64) UNIQUE NOT NULL,
 public_jwk jsonb NOT NULL, thumbprint text NOT NULL, nonce text NOT NULL,
 agent_version text NOT NULL, os text NOT NULL, arch text NOT NULL,
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','CONSUMED','CANCELLED')),
 expires_at timestamptz NOT NULL, last_poll_at timestamptz, device_id uuid, credential_issued_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE installer.pairing_sessions ADD COLUMN IF NOT EXISTS credential_issued_at timestamptz;
CREATE INDEX IF NOT EXISTS pairing_install ON installer.pairing_sessions(installation_id);
CREATE TABLE IF NOT EXISTS installer.devices (
 id uuid PRIMARY KEY, installation_id uuid NOT NULL REFERENCES installer.installations(id),
 public_jwk jsonb NOT NULL, thumbprint text NOT NULL, nonce text NOT NULL, revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_device ON installer.devices(installation_id) WHERE revoked_at IS NULL;
CREATE TABLE IF NOT EXISTS installer.proof_replays (thumbprint text NOT NULL, jti_hash char(64) NOT NULL, expires_at timestamptz NOT NULL, PRIMARY KEY(thumbprint,jti_hash));
CREATE TABLE IF NOT EXISTS installer.rate_limits (bucket char(64) PRIMARY KEY, count integer NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS installer.oidc_logins (
 cookie_hash char(64) PRIMARY KEY, state_hash char(64) UNIQUE NOT NULL, nonce_hash char(64) NOT NULL,
 verifier text NOT NULL, expires_at timestamptz NOT NULL, consumed_at timestamptz
);
REVOKE ALL ON SCHEMA installer FROM PUBLIC;

CREATE TABLE IF NOT EXISTS installer.domain_challenges (
 id uuid PRIMARY KEY, installation_id uuid NOT NULL REFERENCES installer.installations(id),
 client_request_id uuid NOT NULL, domain text NOT NULL, txt_value text NOT NULL,
 expires_at timestamptz NOT NULL, verified_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(installation_id,client_request_id)
);
CREATE INDEX IF NOT EXISTS domain_challenge_install ON installer.domain_challenges(installation_id,created_at DESC);
