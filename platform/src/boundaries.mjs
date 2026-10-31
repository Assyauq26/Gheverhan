// Policy primitives only. Callers supply identities verified by independent
// platform authentication and fresh registry reads, never request JSON/JWT claims alone.
const reserved = new Set(['jetseller.web.id', 'dashboard.jetseller.web.id']);
export function canonicalHost(raw) {
  if (typeof raw !== 'string' || raw.length > 253 || raw !== raw.trim()) throw Error('Invalid host');
  const host = raw.toLowerCase().replace(/\.$/, '');
  if (!host.includes('.') || !host.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) throw Error('Invalid host');
  return host;
}
export function assertClaimableDomain(raw) {
  const host = canonicalHost(raw);
  if (reserved.has(host) || host.endsWith('.dashboard.jetseller.web.id') || host.endsWith('.jetseller.web.id') && !/^[a-z0-9-]+\.shops\.jetseller\.web\.id$/.test(host)) throw Error('Reserved domain');
  return host;
}
export async function resolveStorefront(raw, registry) {
  const host = assertClaimableDomain(raw);
  if (reserved.has(host)) throw Error('Platform host is not a storefront');
  const domain = await registry.findDomain(host);
  if (!domain || domain.hostname !== host || !domain.verifiedAt || !domain.tlsReadyAt || domain.status !== 'ACTIVE' || !domain.tenant || domain.tenant.status !== 'ACTIVE' || !domain.tenant.id || !domain.tenant.databaseSecretRef) throw Error('Storefront unavailable');
  return Object.freeze({ tenantId: domain.tenant.id, hostname: host, databaseSecretRef: domain.tenant.databaseSecretRef });
}
export function assertPlatformOwner(identity) {
  if (!identity || identity.authority !== 'jetseller-control-plane' || identity.audience !== 'jetseller-superadmin' || identity.role !== 'PLATFORM_OWNER' || !identity.active || !identity.sessionActive) throw Error('Platform owner required');
}
export function assertSellerTenant(identity, tenant) {
  if (!identity || identity.authority !== 'jetseller-control-plane' || identity.audience !== 'jetseller-dashboard' || !identity.active || !identity.sessionActive || identity.role !== 'SELLER' || !tenant || tenant.status !== 'ACTIVE' || tenant.sellerId !== identity.sellerId || tenant.id !== identity.tenantId) throw Error('Tenant access denied');
}
