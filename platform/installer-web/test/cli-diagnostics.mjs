/** Never serialize arbitrary stderr: it can contain tokens or device codes. */
export function pairingExitMessage(code, stderr) {
  const bounded = String(stderr).slice(-4096);
  const host = bounded.match(/^preflight: os=[a-z]+ arch=[a-z0-9]+ release=[a-z0-9:.]* cpus=\d+ memory_bytes=\d+ free_bytes=\d+ free_inodes=\d+ ports_available=(?:true|false) existing_services=(?:true|false)$/m)?.[0];
  const category = bounded.match(/\((host_preflight|private_state|operation_failed)\)/)?.[1] ?? 'unclassified';
  const exit = Number.isInteger(code) ? code : 'unknown';
  return `CLI exited before pairing checkpoint; exit=${exit}; category=${category}${host ? '; ' + host : ''}`;
}
