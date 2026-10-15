import { HttpError } from "./response";
/** Browser mutations must be same-origin; authenticated non-browser clients may omit Origin. */
export function assertMutationOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) throw new HttpError("Origin tidak diizinkan", 403);
}
