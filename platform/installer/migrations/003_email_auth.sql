-- Additive identity/session data for passwordless control-plane access only.
ALTER TABLE installer.sellers ADD COLUMN IF NOT EXISTS email_hash char(64);
ALTER TABLE installer.sellers ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE installer.sellers ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE installer.sellers ADD COLUMN IF NOT EXISTS store_name text;
CREATE UNIQUE INDEX IF NOT EXISTS seller_verified_email_identity ON installer.sellers(email_hash) WHERE email_hash IS NOT NULL;
-- Old sessions are intentionally not marked freshly authenticated by migration.
ALTER TABLE installer.sessions ADD COLUMN IF NOT EXISTS authenticated_at timestamptz;
CREATE TABLE IF NOT EXISTS installer.email_challenges (
 id uuid PRIMARY KEY, email_hash char(64) NOT NULL, email text NOT NULL,
 mode text NOT NULL CHECK(mode IN ('register','login')), display_name text, store_name text,
 cookie_hash char(64) NOT NULL, code_hash char(64) NOT NULL,
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
 delivered_at timestamptz, consumed_at timestamptz
);
CREATE INDEX IF NOT EXISTS email_challenge_lookup ON installer.email_challenges(email_hash,created_at DESC);
REVOKE ALL ON installer.email_challenges FROM PUBLIC;
