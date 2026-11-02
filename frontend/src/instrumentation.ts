/**
 * Runtime-only self-hosted startup guard.
 *
 * No-op on the existing Gheverhan profile. The installer must create/mount the
 * installation-owned local media root before launching this process.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getStoreProfile, parseSelfHostedConfig } = await import("./lib/self-hosted/config");
  const { assertExistingLocalStorageRoot } = await import("./lib/self-hosted/storage-root");
  if (getStoreProfile(process.env) !== "self-hosted") return;
  const store = parseSelfHostedConfig(process.env);
  assertExistingLocalStorageRoot(store.storageRoot);
}
