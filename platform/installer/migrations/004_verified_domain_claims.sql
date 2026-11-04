-- A typed domain/paired device is not proof of DNS ownership. Preserve all
-- installation/challenge rows; release only exclusive names lacking valid proof
-- or an active lease. No merchant/runtime data is touched by this migration.
ALTER TABLE installer.installations ADD COLUMN IF NOT EXISTS domain_verified_at timestamptz;
CREATE TABLE IF NOT EXISTS installer.policy_migrations(name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now());
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM installer.policy_migrations WHERE name='verified-domain-claims-v1') THEN
  UPDATE installer.installations AS i SET domain_verified_at=(
    SELECT max(p.verified_at) FROM installer.domain_challenges p
     WHERE p.installation_id=i.id AND p.domain=i.domain
      AND p.verified_at IS NOT NULL AND p.verified_at<=p.expires_at
      AND p.verified_at>now()-interval '24 hours'
  );
  UPDATE installer.installations SET reserved_domain=NULL
   WHERE reserved_domain IS NOT NULL AND (claim_expires_at<=now() OR domain_verified_at IS NULL);
  INSERT INTO installer.policy_migrations(name) VALUES('verified-domain-claims-v1');
 END IF;
END $$;
REVOKE ALL ON installer.policy_migrations FROM PUBLIC;
