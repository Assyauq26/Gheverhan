-- Additive management metadata only. No seller-store DB or secret access.
ALTER TABLE installer.devices ADD COLUMN IF NOT EXISTS activated_at timestamptz;
ALTER TABLE installer.devices ADD COLUMN IF NOT EXISTS key_epoch integer NOT NULL DEFAULT 1 CHECK(key_epoch>0);
UPDATE installer.devices d SET activated_at=p.credential_issued_at
FROM installer.pairing_sessions p WHERE p.device_id=d.id AND p.credential_issued_at IS NOT NULL AND d.activated_at IS NULL;
CREATE TABLE IF NOT EXISTS installer.credential_receipts (
 device_id uuid NOT NULL REFERENCES installer.devices(id), request_id uuid NOT NULL,
 request_hash char(64) NOT NULL, operation text NOT NULL CHECK(operation IN ('REFRESH','ROTATE')),
 issued_at timestamptz NOT NULL, expires_at timestamptz NOT NULL, token_jti uuid NOT NULL,
 key_epoch integer NOT NULL, previous_jwk jsonb, previous_nonce text,
 PRIMARY KEY(device_id,request_id)
);
CREATE TABLE IF NOT EXISTS installer.agent_audit (
 id bigserial PRIMARY KEY, installation_id uuid NOT NULL REFERENCES installer.installations(id),
 device_id uuid, actor text NOT NULL CHECK(actor IN ('DEVICE','SELLER')),
 operation text NOT NULL, request_id uuid, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS agent_audit_install ON installer.agent_audit(installation_id,id DESC);
ALTER TABLE installer.installations ADD COLUMN IF NOT EXISTS observed_app_version text;
ALTER TABLE installer.installations ADD COLUMN IF NOT EXISTS observed_image_digest text;
ALTER TABLE installer.installations ADD COLUMN IF NOT EXISTS last_heartbeat_at timestamptz;
ALTER TABLE installer.installations ADD COLUMN IF NOT EXISTS observed_readiness text;
ALTER TABLE installer.installations ADD COLUMN IF NOT EXISTS observed_update_state text;

ALTER TABLE installer.installations ADD COLUMN IF NOT EXISTS domain_verified_at timestamptz;
ALTER TABLE installer.installations ADD COLUMN IF NOT EXISTS domain_claim_expires_at timestamptz;
UPDATE installer.installations i SET domain_verified_at=p.verified_at,domain_claim_expires_at=p.verified_at+interval '24 hours'
FROM (SELECT installation_id,domain,max(verified_at) AS verified_at FROM installer.domain_challenges WHERE verified_at IS NOT NULL GROUP BY installation_id,domain) p
WHERE i.id=p.installation_id AND i.domain=p.domain AND i.domain_verified_at IS NULL;
-- An unproven paired device is never authority to reserve a public domain.
UPDATE installer.installations SET reserved_domain=NULL WHERE domain_verified_at IS NULL OR domain_claim_expires_at<=now();
