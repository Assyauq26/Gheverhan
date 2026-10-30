// Explicit maintenance command; never executed on build/start or against Production.
// All data is emsifa v2, MIT. Retain source metadata and normalize only needed fields.
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
const base = 'https://www.emsifa.com/api-wilayah-indonesia/v2';
const cache = new URL('../../../.release-evidence/v5-region-download/', import.meta.url);
await mkdir(cache, { recursive: true });
async function fetchList(level, parent = '') {
  const key = level + (parent ? '/' + parent : '');
  const path = new URL(key.replaceAll('/', '_') + '.json', cache);
  let json;
  try { json = JSON.parse(await readFile(path, 'utf8')); } catch {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch(`${base}/${key}.json`, { signal: AbortSignal.timeout(15000) });
        if (!r.ok) throw new Error(`HTTP ${r.status}: ${key}`);
        json = await r.json();
        if (!Array.isArray(json.data) || !json.meta?.updated_at) throw new Error(`Invalid v2: ${key}`);
        await writeFile(path, JSON.stringify(json)); break;
      } catch (error) { if (attempt === 2) throw error; }
    }
  }
  return { data: json.data.map(r => ({ code: r.id, name: r.name, ...(r.postal_code ? { postalCode: String(r.postal_code) } : {}) })), source: base, updatedAt: json.meta.updated_at };
}
const lists = {};
async function batch(level, parents) {
  let i = 0;
  await Promise.all(Array.from({ length: 12 }, async () => {
    while (i < parents.length) {
      const parent = parents[i++]; lists[`${level}/${parent}`] = await fetchList(level, parent);
    }
  }));
  console.log(level, parents.length);
}
lists.provinces = await fetchList('provinces');
await batch('regencies', lists.provinces.data.map(r => r.code));
await batch('districts', Object.entries(lists).filter(([k]) => k.startsWith('regencies/')).flatMap(([,v]) => v.data.map(r => r.code)));
await batch('villages', Object.entries(lists).filter(([k]) => k.startsWith('districts/')).flatMap(([,v]) => v.data.map(r => r.code)));
const bytes = gzipSync(JSON.stringify(lists), { level: 9 });
const target = new URL('../../src/modules/regions/data/', import.meta.url);
await mkdir(target, { recursive: true });
await writeFile(new URL('snapshot.json.gz', target), bytes);
await writeFile(new URL('manifest.json', target), JSON.stringify({ source: base, license: 'MIT', retrievedAt: new Date().toISOString(), updatedAt: lists.provinces.updatedAt, sha256: createHash('sha256').update(bytes).digest('hex'), lists: Object.keys(lists).length, regions: Object.values(lists).reduce((n,l) => n + l.data.length, 0) }, null, 2) + '\n');
console.log('SNAPSHOT_OK', bytes.length);
