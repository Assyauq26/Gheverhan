import "server-only";
import { putLocalObject, getLocalObject, removeLocalObject } from "./storage-local";

function localProvider(): boolean {
  const provider = process.env.STORAGE_PROVIDER || "supabase";
  if (!["supabase", "local"].includes(provider)) throw new Error("Invalid storage provider");
  return provider === "local";
}
import { resolveStorageObject, type StorageBucket } from "./storage-path";
import { storageAuthHeaders } from "./storage-auth-headers";

export const STORAGE_APP = process.env.STORAGE_APP_NAME || "gheverhan";

function config() {
  const origin = (process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const url = new URL(origin || "http://invalid");
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (
    !(url.protocol === "https:" || (loopback && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !key
  ) {
    throw new Error(
      "Supabase Storage is not configured (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)",
    );
  }
  return { origin, key };
}

function bucketName(bucket: StorageBucket): string {
  const value = (
    bucket === "product-images"
      ? process.env.SUPABASE_PRODUCT_IMAGES_BUCKET || "product-images"
      : bucket === "store-branding" ? process.env.SUPABASE_STORE_BRANDING_BUCKET || "store-branding"
      : process.env.SUPABASE_PAYMENT_PROOFS_BUCKET || "payment-proofs"
  ).trim();
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(value))
    throw new Error("Invalid storage bucket configuration");
  return value;
}

function objectUrl(bucket: StorageBucket, key: string): string {
  const { origin } = config();
  return `${origin}/storage/v1/object/${encodeURIComponent(bucketName(bucket))}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

function headers(contentType?: string): HeadersInit {
  const { key } = config();
  return {
    ...storageAuthHeaders(key),
    ...(contentType ? { "Content-Type": contentType } : {}),
  };
}

/** Object references stay application-relative; no privileged URL or token enters the database. */
export async function putObject(
  path: string,
  data: Uint8Array,
  contentType: string,
  signal?: AbortSignal,
): Promise<{ path: string; size: number }> {
  if (localProvider()) return putLocalObject(path, STORAGE_APP, data, contentType, signal);
  const object = resolveStorageObject(path, STORAGE_APP);
  const mimeByExtension: Record<string, string> = {
    jpg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    pdf: "application/pdf",
  };
  if (
    mimeByExtension[object.extension] !== contentType ||
    data.length === 0 ||
    data.length > 4 * 1024 * 1024
  ) {
    throw new Error("Invalid storage upload");
  }
  const response = await fetch(objectUrl(object.bucket, object.key), {
    method: "POST",
    headers: {
      ...headers(contentType),
      "x-upsert": "false",
      "Cache-Control": "no-store",
    },
    body: Buffer.from(data),
    cache: "no-store",
    signal,
  });
  if (!response.ok)
    throw new Error(`Storage upload failed (${response.status})`);
  return { path, size: data.length };
}

export async function getObject(
  path: string,
  signal?: AbortSignal,
): Promise<{ data: Uint8Array; contentType: string }> {
  if (localProvider()) return getLocalObject(path, STORAGE_APP, signal);
  const object = resolveStorageObject(path, STORAGE_APP);
  const response = await fetch(objectUrl(object.bucket, object.key), {
    headers: headers(),
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw new Error(`Storage read failed (${response.status})`);
  const data = new Uint8Array(await response.arrayBuffer());
  return {
    data,
    contentType:
      response.headers.get("Content-Type") || "application/octet-stream",
  };
}

/** For compensating failed DB writes only. Caller must enforce ownership and authorization. */
export async function removeObject(path: string, signal?: AbortSignal): Promise<void> {
  if (localProvider()) return removeLocalObject(path, STORAGE_APP, signal);
  const object = resolveStorageObject(path, STORAGE_APP);
  const { origin } = config();
  const response = await fetch(
    `${origin}/storage/v1/object/${encodeURIComponent(bucketName(object.bucket))}`,
    {
      method: "DELETE",
      headers: headers("application/json"),
      body: JSON.stringify({ prefixes: [object.key] }),
      cache: "no-store",
      signal,
    },
  );
  if (!response.ok)
    throw new Error(`Storage cleanup failed (${response.status})`);
}
