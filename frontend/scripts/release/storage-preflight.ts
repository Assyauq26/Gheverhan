import { storageAuthHeaders } from "../../src/lib/storage-auth-headers";

/** Read-only metadata probe. Never returns provider bodies or credentials. */
export async function verifyPrivateProductBucket(
  env: Record<string, string | undefined>,
): Promise<{ status: "PASS" | "BLOCKED"; reason: string }> {
  const ref = env.R21_EXPECTED_SUPABASE_REF || "";
  const bucket = env.SUPABASE_PRODUCT_IMAGES_BUCKET || "product-images";
  const origin = (env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (
    !/^[a-z0-9]{20}$/.test(ref) ||
    origin !== `https://${ref}.supabase.co` ||
    !/^[a-zA-Z0-9_-]{1,100}$/.test(bucket) ||
    !key
  ) return { status: "BLOCKED", reason: "STORAGE_TARGET_UNVERIFIED" };
  try {
    const response = await fetch(`${origin}/storage/v1/bucket/${encodeURIComponent(bucket)}`, {
      headers: storageAuthHeaders(key),
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
      redirect: "error",
    });
    if (!response.ok) return { status: "BLOCKED", reason: "BUCKET_METADATA_UNAVAILABLE" };
    const data = await response.json();
    if (data?.id !== bucket || data?.public !== false)
      return { status: "BLOCKED", reason: "PRIVATE_BUCKET_NOT_VERIFIED" };
    return { status: "PASS", reason: "PRIVATE_BUCKET_VERIFIED" };
  } catch {
    return { status: "BLOCKED", reason: "BUCKET_METADATA_UNAVAILABLE" };
  }
}
