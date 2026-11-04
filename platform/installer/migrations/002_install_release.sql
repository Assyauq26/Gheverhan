CREATE TABLE IF NOT EXISTS installer.install_progress (
 installation_id uuid PRIMARY KEY REFERENCES installer.installations(id),
 device_id uuid NOT NULL REFERENCES installer.devices(id),
 release_id text NOT NULL, manifest_sha256 char(64) NOT NULL,
 phase text NOT NULL CHECK (phase IN ('PREFLIGHT','VERIFIED_RELEASE','DATABASE','MIGRATION','APPLICATION','HTTPS_PENDING','LOCAL_READINESS')),
 sequence bigint NOT NULL CHECK(sequence>0), error_code text,
 updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON installer.install_progress FROM PUBLIC;

ALTER TABLE installer.devices ADD COLUMN IF NOT EXISTS approved_scopes text[] NOT NULL DEFAULT ARRAY['report:heartbeat','install:progress','release:read'];
