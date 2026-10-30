import { createHash } from 'node:crypto';

/**
 * Prisma 5.22 accepts LF/CRLF variants when checking migration history:
 * https://github.com/prisma/prisma-engines/blob/5.22.0/schema-engine/connectors/schema-connector/src/checksum.rs
 * Preserve every other byte, including whitespace, BOMs and terminal newlines.
 * This only verifies history; it never changes the ledger or migration files.
 * @param {Uint8Array} bytes
 */
export function migrationChecksumVariants(bytes) {
  const lf = [];
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] !== 13 || bytes[i + 1] !== 10) lf.push(bytes[i]);
  }
  const crlf = [];
  for (const byte of lf) {
    if (byte === 10) crlf.push(13);
    crlf.push(byte);
  }
  return new Set([bytes, Buffer.from(lf), Buffer.from(crlf)]
    .map(value => createHash('sha256').update(value).digest('hex')));
}
