/** Manual provider contract drill against a real disposable Supabase Storage API.
 * Accepts only loopback origins; the runner generates disposable credentials.
 * Does not use the application database.
 */
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { createServer } from "node:http";

async function main() {
assert.equal(process.env.GHEVERHAN_ISOLATED_TESTS, "1");
const origin = new URL(process.env.GHEVERHAN_PRIVATE_STORAGE_ORIGIN || "http://invalid");
assert.equal(origin.protocol, "http:");
assert.ok(["127.0.0.1", "localhost"].includes(origin.hostname));
assert.equal(origin.pathname, "/");
assert.equal(origin.search, "");
assert.equal(origin.username, "");
assert.equal(origin.password, "");
const service = process.env.GHEVERHAN_PRIVATE_STORAGE_SERVICE_KEY;
assert.ok(service);
const bucket = "drill-" + randomUUID();
const auth = { Authorization: `Bearer ${service}`, apikey: service };
const hashes: string[] = [];
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=", "base64");
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const paths: string[] = [];
let created = false;
// The official API runs without Kong. This local adapter only strips Kong's
// /storage/v1 prefix; authentication, RLS and object I/O remain in the real API.
const proxy = createServer(async (req, res) => {
  try {
    const requestPath = req.url;
    assert.ok(requestPath?.startsWith("/storage/v1/"));
    assert.ok(requestPath);
    const body: Buffer[] = [];
    for await (const chunk of req) body.push(Buffer.from(chunk));
    const headers = new Headers();
    for (const key of ["authorization", "apikey", "content-type", "x-upsert", "cache-control"])
      if (typeof req.headers[key] === "string") headers.set(key, req.headers[key]);
    const upstream = await fetch(new URL(requestPath.slice("/storage/v1".length), origin), {
      method: req.method, headers,
      ...(body.length ? { body: Buffer.concat(body) } : {}),
      signal: AbortSignal.timeout(15000),
    });
    res.writeHead(upstream.status, { "Content-Type": upstream.headers.get("Content-Type") || "application/json" });
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch { res.writeHead(502).end(); }
});
try {
  const health = await fetch(new URL("/status", origin));
  assert.equal(health.status, 200);
  const create = await fetch(new URL("/bucket", origin), {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ id: bucket, name: bucket, public: false }),
  });
  assert.ok(create.ok, `Private bucket creation HTTP ${create.status}`);
  created = true;
  const metadata = await fetch(new URL(`/bucket/${bucket}`, origin), { headers: auth });
  assert.equal((await metadata.json()).public, false);
  await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  const address = proxy.address();
  assert.ok(address && typeof address !== "string");
  process.env.SUPABASE_URL = `http://127.0.0.1:${address.port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = service;
  process.env.SUPABASE_PRODUCT_IMAGES_BUCKET = bucket;
  process.env.SUPABASE_STORE_BRANDING_BUCKET = bucket;
  process.env.STORAGE_APP_NAME = "gheverhan-private-drill";
  const { putObject, getObject, removeObject } = await import("../../src/lib/storage");
  for (const namespace of ["product-images", "store-branding"]) {
  for (const staged of [false, true]) {
    const id = randomUUID();
    const path = `gheverhan-private-drill/${namespace}/${staged ? "staged-" + id : randomUUID()}/${id}.png`;
    paths.push(path);
    await putObject(path, png, "image/png", AbortSignal.timeout(15000));
    const stored = await getObject(path, AbortSignal.timeout(15000));
    assert.equal(hash(stored.data), hash(png));
    hashes.push(hash(stored.data));
    // The application preserves the complete logical object path inside the bucket.
    const key = path;
    for (const prefix of ["/object/public/", "/object/"]) {
      const denied = await fetch(new URL(`${prefix}${bucket}/${key}`, origin));
      assert.ok(!denied.ok, `Anonymous private read unexpectedly allowed: ${denied.status}`);
    }
    const wrong = await fetch(new URL(`/object/${bucket}/${key}`, origin), { headers: { Authorization: "Bearer invalid" } });
    assert.ok(!wrong.ok);
    await assert.rejects(putObject(path, png, "image/png", AbortSignal.timeout(15000)));
    await removeObject(path, AbortSignal.timeout(15000));
    await assert.rejects(getObject(path, AbortSignal.timeout(15000)));
  }
  }
  assert.equal(hashes.length, 4);
  console.log(JSON.stringify({ status: "PASS", provider: "real-disposable-supabase-storage-api", privateBucket: true, legacyAndStagedByteIntegrity: hashes.length === 4, brandingNamespaceVerified: true, anonymousPublicAndPrivateDenied: true, invalidBearerDenied: true, duplicateUploadDenied: true, deleteVerified: true, limitations: "Provider/helper contract only; application authorization/finalization/cleanup covered separately by PostgreSQL/browser suites. Not Production verification." }));
} finally {
  // Delete only the unique bucket created by this drill, after its objects.
  if (created) {
    if (paths.length) await fetch(new URL(`/object/${bucket}`, origin), { method: "DELETE", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ prefixes: paths }) });
    const deleted = await fetch(new URL(`/bucket/${bucket}`, origin), { method: "DELETE", headers: auth });
    assert.ok(deleted.ok, `Disposable bucket cleanup HTTP ${deleted.status}`);
  }
  proxy.closeAllConnections();
  await new Promise<void>((resolve) => proxy.close(() => resolve()));
}

}
main().catch((error: unknown) => { console.error("Private Storage provider drill FAILED:", error instanceof assert.AssertionError ? error.message : error instanceof Error ? error.name : "UnknownError"); process.exitCode = 1; });
