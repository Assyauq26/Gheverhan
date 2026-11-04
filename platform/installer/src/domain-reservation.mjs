import { fail } from './common.mjs';

/**
 * Serialize verified claims only. Draft intents and pairing never reserve a
 * name. Lease renewal requires a fresh live TXT proof, not a name PATCH.
 */
export async function reserveDomain(client, host) {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [host]);
  await client.query(`UPDATE installer.installations AS i SET reserved_domain=NULL
    WHERE i.reserved_domain=$1 AND (i.claim_expires_at<=now() OR NOT EXISTS (
      SELECT 1 FROM installer.domain_challenges AS p WHERE p.installation_id=i.id
      AND p.domain=i.domain AND p.verified_at IS NOT NULL AND p.verified_at<=p.expires_at
    ))`, [host]);
}

/** Call only under the domain lock after a live, current TXT challenge succeeds. */
export async function restoreVerifiedDomainLease(client, installation, host) {
  if (!['DRAFT','UNPAIRED','PAIRED'].includes(installation.status) || (installation.reserved_domain!==null&&installation.reserved_domain!==host)) {
    fail(409, 'DOMAIN_RESERVATION_REQUIRED');
  }
  const collision = await client.query(
    'SELECT id FROM installer.installations WHERE reserved_domain=$1 AND id<>$2',
    [host, installation.id],
  );
  if (collision.rowCount) fail(409, 'DOMAIN_RESERVED');
  const result = await client.query(
    `UPDATE installer.installations
     SET reserved_domain=$2, domain_verified_at=clock_timestamp(),claim_expires_at=now()+interval '24 hours', updated_at=now()
     WHERE id=$1 AND (reserved_domain IS NULL OR reserved_domain=$2) RETURNING id`,
    [installation.id, host],
  );
  if (!result.rowCount) fail(409, 'DOMAIN_RESERVATION_REQUIRED');
}
