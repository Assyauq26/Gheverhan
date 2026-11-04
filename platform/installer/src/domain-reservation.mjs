import { fail } from './common.mjs';

/**
 * Serialize claims for a domain. An unverified PAIRED device must not hold
 * a namespace indefinitely after its 24-hour provisional lease expires.
 *
 * Verified paired stores retain the domain; they are not silently revoked
 * by a competing seller's registration.
 */
export async function reserveDomain(client, host) {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [host]);
  await client.query(`UPDATE installer.installations AS i SET reserved_domain=NULL
    WHERE i.reserved_domain=$1 AND i.claim_expires_at<now()
    AND (
      i.status IN ('DRAFT','UNPAIRED')
      OR (i.status='PAIRED' AND NOT EXISTS (
        SELECT 1 FROM installer.domain_challenges AS proof
        WHERE proof.installation_id=i.id AND proof.domain=i.domain
          AND proof.verified_at IS NOT NULL AND proof.verified_at<=proof.expires_at
      ))
    )`, [host]);
}

/** A released paired lease may be reclaimed only after live DNS proof, never by itself. */
export async function restoreVerifiedDomainLease(client, installation, host) {
  if (installation.reserved_domain === host) return;
  if (installation.status !== 'PAIRED' || installation.reserved_domain !== null) {
    fail(409, 'DOMAIN_RESERVATION_REQUIRED');
  }
  const collision = await client.query(
    'SELECT id FROM installer.installations WHERE reserved_domain=$1 AND id<>$2',
    [host, installation.id],
  );
  if (collision.rowCount) fail(409, 'DOMAIN_RESERVED');
  const result = await client.query(
    `UPDATE installer.installations
     SET reserved_domain=$2, claim_expires_at=now()+interval '24 hours', updated_at=now()
     WHERE id=$1 AND reserved_domain IS NULL RETURNING id`,
    [installation.id, host],
  );
  if (!result.rowCount) fail(409, 'DOMAIN_RESERVATION_REQUIRED');
}
