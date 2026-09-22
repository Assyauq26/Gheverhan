import { handle, fail } from "@/lib/response";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getObject } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Private payment proof serving. Requires payment.read permission; auth via session cookie. */
export async function GET(req: Request) {
  return handle(async () => {
    await requirePermission(PERMISSIONS.PAYMENT_READ);
    const path = new URL(req.url).searchParams.get("path");
    if (!path) return fail("path diperlukan", 400);
    const { data, contentType } = await getObject(path);
    return new Response(Buffer.from(data), {
      headers: { "Content-Type": contentType, "Cache-Control": "private, no-store" },
    });
  });
}
