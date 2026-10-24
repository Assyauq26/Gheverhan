import { HttpError } from "./response";

/** APP_ORIGIN is server configuration, never inferred from forwarded request headers. */
function expectedOrigin(req: Request): string {
  const configured = process.env.APP_ORIGIN;
  if (!configured) return new URL(req.url).origin;
  try {
    const url = new URL(configured);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
      url.username || url.password || url.pathname !== "/" || url.search || url.hash
    ) throw new Error("Invalid app origin");
    return url.origin;
  } catch {
    throw new HttpError("Origin aplikasi belum dikonfigurasi dengan benar", 503);
  }
}

/** Upload routes require an explicit matching browser Origin. */
export function assertSameOrigin(req: Request) {
  if (req.headers.get("origin") !== expectedOrigin(req))
    throw new HttpError("Origin tidak diizinkan", 403);
}

/** Browser mutations must be same-origin; authenticated non-browser clients may omit Origin. */
export function assertMutationOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && origin !== expectedOrigin(req))
    throw new HttpError("Origin tidak diizinkan", 403);
}
