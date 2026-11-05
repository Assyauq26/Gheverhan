CREATE SCHEMA IF NOT EXISTS distribution;
CREATE TABLE IF NOT EXISTS distribution.grants (
 id uuid PRIMARY KEY, installation_id uuid NOT NULL, device_id uuid NOT NULL,
 request_id uuid NOT NULL, release_id text NOT NULL, project text NOT NULL,
 repository text NOT NULL CHECK(repository IN ('app','migration')), digest text NOT NULL,
 version text NOT NULL, metadata_expires_at timestamptz NOT NULL,
 secret_cipher bytea NOT NULL, robot_id bigint, username text, expires_at timestamptz,
 state text NOT NULL CHECK(state IN ('provisioning','active','revoking','revoked')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), last_checked_at timestamptz NOT NULL DEFAULT to_timestamp(0), revoked_at timestamptz,
 UNIQUE(installation_id,device_id,request_id)
);
ALTER TABLE distribution.grants ADD COLUMN IF NOT EXISTS last_checked_at timestamptz NOT NULL DEFAULT to_timestamp(0);
CREATE INDEX IF NOT EXISTS grants_sweep ON distribution.grants(state,last_checked_at);
CREATE TABLE IF NOT EXISTS distribution.audit (
 id uuid PRIMARY KEY, installation_id uuid NOT NULL, device_id uuid NOT NULL,
 grant_id uuid NOT NULL REFERENCES distribution.grants(id),
 action text NOT NULL CHECK(action IN ('requested','issued','revoked','revoke_pending')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
