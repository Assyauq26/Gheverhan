-- Short-lived one-use capability; no API key or raw token is stored.
CREATE TABLE IF NOT EXISTS installer.download_grants (
 token_hash char(64) PRIMARY KEY,
 installation_id uuid NOT NULL REFERENCES installer.installations(id),
 device_id uuid NOT NULL REFERENCES installer.devices(id),
 manifest_sha256 char(64) NOT NULL, bundle_sha256 char(64) NOT NULL,
 expires_at timestamptz NOT NULL, consumed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS download_grant_expiry ON installer.download_grants(expires_at);
REVOKE ALL ON installer.download_grants FROM PUBLIC;
