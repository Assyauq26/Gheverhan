import test from 'node:test';
import assert from 'node:assert/strict';
import { pairingExitMessage } from './cli-diagnostics.mjs';
test('early CLI failure reports public facts without leaking arbitrary stderr', () => {
  const facts = 'preflight: os=linux arch=amd64 release=ubuntu:24.04 cpus=2 memory_bytes=4294967296 free_bytes=120000 free_inodes=30000 ports_available=true existing_services=false';
  const result = pairingExitMessage(1, `Bearer synthetic-secret\n${facts}\nPenyiapan dihentikan (host_preflight)\nhttps://secret.example/?code=private`);
  assert.match(result, /exit=1; category=host_preflight/);
  assert.ok(result.endsWith(facts));
  assert.doesNotMatch(result, /synthetic-secret|secret.example|private|Bearer/);
});
test('malformed facts and oversized secret output never become diagnostics', () => {
  for (const raw of ['preflight: os=linux token=synthetic-secret', 'x'.repeat(10000) + 'synthetic-secret', 'connection to https://user:synthetic-secret@host failed']) {
    assert.equal(pairingExitMessage(null, raw), 'CLI exited before pairing checkpoint; exit=unknown; category=unclassified');
  }
});
