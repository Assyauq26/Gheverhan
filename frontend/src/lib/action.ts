import { HttpError } from "@/lib/response";

export type ActionResult<T = unknown> = {
  ok: boolean;
  error?: string;
  unauthorized?: boolean;
  data?: T;
};

/** Wraps a server action body into a consistent, serializable result. */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (err) {
    if (err instanceof HttpError) {
      return { ok: false, error: err.message, unauthorized: err.status === 401 };
    }
    console.error("[action-error]", err);
    return { ok: false, error: "Terjadi kesalahan. Coba lagi." };
  }
}
