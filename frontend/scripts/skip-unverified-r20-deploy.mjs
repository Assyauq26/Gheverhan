// Netlify ignore: exit0 skips; exit1 proceeds. No credential inspection.
const branches = new Set([
  'integration/r20-release-hardening-cart-sync',
  'security/r20-test-toolchain-upgrades',
]);
const target = process.env.HEAD || process.env.BRANCH || '';
process.exit(branches.has(target) ? 0 : 1);
