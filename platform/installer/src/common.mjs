import { createHash, randomBytes } from 'node:crypto';
import { domainToASCII } from 'node:url';
import { isIP } from 'node:net';

export class ApiError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
export const fail = (status, code) => { throw new ApiError(status, code); };
export const hash = value => createHash('sha256').update(value).digest('hex');
export const opaque = () => randomBytes(32).toString('base64url');
export const scopes = ['report:heartbeat', 'install:progress', 'release:read'];
export function uuid(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) fail(400, 'INVALID_REQUEST');
  return value;
}
export function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) fail(400, 'INVALID_REQUEST');
  return value;
}
export function text(value, min, max) {
  if (typeof value !== 'string' || value.length < min || value.length > max || value !== value.trim() || /[\x00-\x1f\x7f]/.test(value)) fail(400, 'INVALID_REQUEST');
  return value;
}
export function domain(value) {
  text(value, 3, 253);
  const normalized = domainToASCII(value.toLowerCase());
  const labels = normalized.split('.');
  if (!normalized || isIP(normalized) || labels.length < 2 || labels.some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) || /^(?:localhost|local|internal|invalid|test)$/.test(labels.at(-1))) fail(400, 'INVALID_DOMAIN');
  return normalized;
}
export function installationInput(value) {
  exact(value, ['display_name','domain','profile','requested_install_version']);
  if (value.profile !== 'fresh_vps_ubuntu_amd64' || value.requested_install_version !== 'stable') fail(400,'UNSUPPORTED_PROFILE');
  return { display_name: text(value.display_name,1,100), domain: domain(value.domain) };
}
export function origin(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.origin !== value || url.username || url.password) throw new Error('HTTPS canonical control origin required');
  return value;
}
export function publicInstallation(row) {
  return { installation_id:row.id, display_name:row.display_name, domain:row.domain, status:row.status,
    version:row.version, created_at:row.created_at, updated_at:row.updated_at, device_id:row.device_id ?? null,
    app_version:null, last_heartbeat_at:null };
}
