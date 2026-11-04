import { Resolver } from 'node:dns/promises';
import { randomUUID } from 'node:crypto';
import { domain, fail, opaque, uuid } from './common.mjs';
import { transaction, rate } from './db.mjs';
import { reserveDomain, restoreVerifiedDomainLease } from './domain-reservation.mjs';

// DNS only: no URL fetch, redirect, server-side HTTP probe or registrar mutation.
export async function lookupTxtOwnership(host, expected, { resolver = new Resolver({ timeout: 1500, tries: 1 }), timeoutMs = 2000 } = {}) {
  const name = '_jetseller.' + domain(host);
  if(name.length>253) return false;
  if (typeof expected !== 'string' || !/^jetseller-verification=[A-Za-z0-9_-]{43}$/.test(expected)) return false;
  let timer;
  try {
    const records = await Promise.race([
      resolver.resolveTxt(name),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('DNS deadline')), Math.min(timeoutMs, 2000)); }),
    ]);
    return Array.isArray(records) && records.length <= 64 && records.some(record => Array.isArray(record) && record.length <= 8 && record.every(part => typeof part === 'string' && part.length <= 255) && record.join('') === expected);
  } catch { return false; }
  finally { clearTimeout(timer); resolver.cancel(); }
}

const claimActive=(row,installation)=>!!installation?.domain_verified_at&&installation.reserved_domain===row.domain&&new Date(installation.claim_expires_at)>new Date();
const publicChallenge = (row,installation) => ({
  challenge_id: row.id, domain: row.domain, record_type: 'TXT', record_name: '_jetseller.' + row.domain,
  record_value: row.txt_value, expires_at: row.expires_at, verified_at: row.verified_at,
  status: row.verified_at ? 'OWNERSHIP_VERIFIED' : new Date(row.expires_at) <= new Date() ? 'CHALLENGE_EXPIRED' : 'DNS_PENDING',
  // A TXT proof is independent of routing, certificate or application readiness.
  https_verified: false, installed: false,
  domain_claim_active:claimActive(row,installation),
  domain_claim_expires_at:claimActive(row,installation)?installation.claim_expires_at:null,
});
function active(record) {
  if (record.status === 'CANCELLED' || (record.reserved_domain !== null && record.reserved_domain !== record.domain)) {
    fail(409, 'INSTALLATION_EXPIRED');
  }
}

export async function domainProofRoute({ request, path, pool, seller, own, readBody, lookup = lookupTxtOwnership }) {
  const match = path.match(/^\/api\/installer\/v1\/installations\/([^/]+)\/domain-challenges(?:\/([^/]+)\/verify)?$/);
  if (!match) return null;
  const id = uuid(match[1]);
  if (!match[2] && request.method === 'GET') {
    const installation = await own(pool, id, seller.seller_id);
    const row = (await pool.query('SELECT * FROM installer.domain_challenges WHERE installation_id=$1 AND domain=$2 ORDER BY created_at DESC,id DESC LIMIT 1', [id, installation.domain])).rows[0];
    return { status: 200, body: { challenge: row ? publicChallenge(row,installation) : null } };
  }
  if (request.method !== 'POST') fail(405, 'METHOD_NOT_ALLOWED');
  const body = await readBody(request);
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length) fail(400, 'INVALID_REQUEST');
  if (!match[2]) {
    const key = uuid(request.headers.get('idempotency-key'));
    await rate(pool, 'domain-create:' + seller.seller_id, 5, 600);
    const row = await transaction(pool, async client => {
      const record = await own(client, id, seller.seller_id, true); active(record);
      if(('_jetseller.'+record.domain).length>253)fail(400,'INVALID_DOMAIN');
      const previous = (await client.query('SELECT * FROM installer.domain_challenges WHERE installation_id=$1 AND client_request_id=$2', [id, key])).rows[0];
      if (previous) { if (previous.domain !== record.domain) fail(409, 'IDEMPOTENCY_CONFLICT'); return previous; }
      await client.query("DELETE FROM installer.domain_challenges WHERE installation_id=$1 AND expires_at<now()-interval '7 days'", [id]);
      return (await client.query("INSERT INTO installer.domain_challenges(id,installation_id,client_request_id,domain,txt_value,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '30 minutes') RETURNING *", [randomUUID(), id, key, record.domain, 'jetseller-verification=' + opaque()])).rows[0];
    });
    return { status: 201, body: { challenge: publicChallenge(row,await own(pool,id,seller.seller_id)) } };
  }
  await rate(pool, 'domain-verify:' + seller.seller_id, 10);
  const challengeId = uuid(match[2]);
  const installation = await own(pool, id, seller.seller_id); active(installation);
  const row = (await pool.query('SELECT * FROM installer.domain_challenges WHERE id=$1 AND installation_id=$2 AND domain=$3', [challengeId, id, installation.domain])).rows[0];
  if (!row) fail(404, 'NOT_FOUND');
  if (row.verified_at) {
    if (installation.reserved_domain !== row.domain) fail(409, 'DOMAIN_RESERVATION_REQUIRED');
    return { status: 200, body: { challenge: publicChallenge(row,installation),...(claimActive(row,installation)?{}:{next_action:'REQUEST_NEW_CHALLENGE'}) } };
  }
  if (new Date(row.expires_at) <= new Date()) fail(410, 'CHALLENGE_EXPIRED');
  const found = await lookup(row.domain, row.txt_value);
  if (!found) return { status: 202, body: { challenge: publicChallenge(row,installation), next_action: 'CHECK_DNS_TXT' } };
  const verified = await transaction(pool, async client => {
    // Domain lock precedes installation row locks for all actual claim changes.
    // Intents/patches/pairing never mint an exclusive claim.
    await reserveDomain(client, row.domain);
    const current = await own(client, id, seller.seller_id, true); active(current);
    if (current.domain !== row.domain) fail(409, 'DOMAIN_CHANGED');
    const latest = (await client.query('SELECT id FROM installer.domain_challenges WHERE installation_id=$1 AND domain=$2 ORDER BY created_at DESC,id DESC LIMIT 1', [id, row.domain])).rows[0];
    if (latest?.id !== row.id) fail(409, 'CHALLENGE_REPLACED');
    const result = (await client.query('SELECT * FROM installer.domain_challenges WHERE id=$1 FOR UPDATE', [row.id])).rows[0];
    if (result.verified_at) return result;
    if (new Date(result.expires_at) <= new Date()) fail(410, 'CHALLENGE_EXPIRED');
    await restoreVerifiedDomainLease(client, current, row.domain);
    return (await client.query('UPDATE installer.domain_challenges SET verified_at=clock_timestamp() WHERE id=$1 RETURNING *', [row.id])).rows[0];
  });
  return { status: 200, body: { challenge: publicChallenge(verified,await own(pool,id,seller.seller_id)) } };
}
