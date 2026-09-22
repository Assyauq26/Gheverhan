import "server-only";

const STORAGE_BASE =
  (process.env.INTEGRATION_PROXY_URL || "").trim() ||
  "https://integrations.emergentagent.com";
const STORAGE_URL = STORAGE_BASE.replace(/\/+$/, "") + "/objstore/api/v1/storage";
const EMERGENT_KEY = process.env.EMERGENT_LLM_KEY;
export const STORAGE_APP = process.env.STORAGE_APP_NAME || "gheverhan";

let storageKey: string | null = null;

async function initStorage(force = false): Promise<string> {
  if (storageKey && !force) return storageKey;
  const resp = await fetch(`${STORAGE_URL}/init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ emergent_key: EMERGENT_KEY }),
  });
  if (!resp.ok) throw new Error(`storage init failed: ${resp.status}`);
  const json = await resp.json();
  storageKey = json.storage_key as string;
  return storageKey;
}

export async function putObject(
  path: string,
  data: Uint8Array,
  contentType: string,
): Promise<{ path: string; size: number }> {
  const key = await initStorage();
  const resp = await fetch(`${STORAGE_URL}/objects/${path}`, {
    method: "PUT",
    headers: { "X-Storage-Key": key, "Content-Type": contentType },
    body: data,
  });
  if (!resp.ok) throw new Error(`storage put failed: ${resp.status}`);
  return resp.json();
}

export async function getObject(
  path: string,
): Promise<{ data: Uint8Array; contentType: string }> {
  let key = await initStorage();
  let resp = await fetch(`${STORAGE_URL}/objects/${path}`, {
    headers: { "X-Storage-Key": key },
  });
  if (resp.status === 404) {
    key = await initStorage(true);
    resp = await fetch(`${STORAGE_URL}/objects/${path}`, {
      headers: { "X-Storage-Key": key },
    });
  }
  if (!resp.ok) throw new Error(`storage get failed: ${resp.status}`);
  const buf = new Uint8Array(await resp.arrayBuffer());
  return {
    data: buf,
    contentType: resp.headers.get("Content-Type") || "application/octet-stream",
  };
}
