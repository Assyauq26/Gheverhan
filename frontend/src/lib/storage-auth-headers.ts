/** Supabase sb_secret keys are opaque, not JWT bearer tokens. */
export function storageAuthHeaders(key: string): Record<string, string> {
  if (!key || key.startsWith("sb_publishable_")) {
    throw new Error("Privileged Supabase Storage API key is not configured");
  }
  if (key.startsWith("sb_secret_")) return { apikey: key };
  // Preserve existing legacy JWT service_role header behavior.
  return { apikey: key, Authorization: `Bearer ${key}` };
}
