import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { migrationChecksumVariants } from '../../scripts/release/migration-checksums.mjs';
const hash = (sql: string | Buffer) => createHash('sha256').update(sql).digest('hex');

describe('release migration checksum compatibility', () => {
  it('accepts LF and CRLF in either direction without changing source bytes', () => {
    const lf = Buffer.from('-- reviewed\nSELECT 1;\n');
    const crlf = Buffer.from('-- reviewed\r\nSELECT 1;\r\n');
    const original = Buffer.from(crlf);
    for (const source of [lf, crlf]) {
      const checksums = migrationChecksumVariants(source);
      expect(checksums.has(hash(lf))).toBe(true);
      expect(checksums.has(hash(crlf))).toBe(true);
      expect(checksums.size).toBe(2);
    }
    expect(crlf.equals(original)).toBe(true);
  });
  it('rejects changed SQL, comments, whitespace and terminal newlines', () => {
    const checksums = migrationChecksumVariants(Buffer.from('-- reviewed\nSELECT 1;\n'));
    for (const altered of ['-- reviewed\nSELECT 2;\n', '-- different\nSELECT 1;\n', '-- reviewed\nSELECT  1;\n', '-- reviewed\nSELECT 1;', '-- reviewed\nSELECT 1;\n\n']) {
      expect(checksums.has(hash(altered))).toBe(false);
    }
  });
  it('preserves lone carriage returns, BOMs and non-ASCII bytes', () => {
    const source = Buffer.from("-- café\rverbatim\nSELECT 'Indonesia';\n");
    const checksums = migrationChecksumVariants(source);
    expect(checksums.has(hash(source))).toBe(true);
    expect(checksums.has(hash(source.toString().replace('\r', '')))).toBe(false);
    expect(checksums.has(hash(Buffer.concat([Buffer.from([239,187,191]), source])))).toBe(false);
  });
});
