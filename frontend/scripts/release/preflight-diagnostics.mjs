/** Add safe typed failure output to the exact reviewed candidate; SQL/gates stay unchanged. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
export const candidateChecksum = '5d61f30f6fb08530748e2d88324a907ea51bf1ec2f64bae3d5f9a377f7a99cc4';
const original = `main().catch(() => {
  console.error(
    "Release preflight BLOCKED: database/configuration check failed; no write was attempted",
  );
  process.exitCode = 1;
});
`;
const replacement = `main().catch((error) => {
  console.log(JSON.stringify(safeProbeFailure(error, 'RELEASE_PREFLIGHT', 'runtime')));
  process.exitCode = 1;
});
`;
export function instrumentCandidate(source) {
  if (typeof source !== 'string' || !source.endsWith(original) || source.indexOf(original) !== source.lastIndexOf(original)) throw new Error('Unreviewed preflight boundary');
  return `import { safeProbeFailure } from './prisma-safe-error.mjs';\n` + source.slice(0, -original.length) + replacement;
}
export function prepareReleaseDiagnostics(file) {
  const source = readFileSync(file, 'utf8');
  if (createHash('sha256').update(source).digest('hex') !== candidateChecksum) throw new Error('Unreviewed preflight source');
  writeFileSync(file, instrumentCandidate(source));
  return () => writeFileSync(file, source);
}
