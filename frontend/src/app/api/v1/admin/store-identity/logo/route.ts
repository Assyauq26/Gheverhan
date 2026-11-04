import { handle, HttpError } from "@/lib/response";
import { getCurrentUser } from "@/lib/auth/session";
import { getDashboardIdentity } from "@/modules/appearance/dashboard";
import { readLogo } from "@/modules/appearance/media";
import { appearanceSessionHash } from "@/modules/appearance/session";
export const dynamic = "force-dynamic";
/** Any local staff may see the saved dashboard logo, not arbitrary staging/history assets. */
export async function GET(req: Request) {
  return handle(async () => {
    const snapshot = await getDashboardIdentity();
    const id = new URL(req.url).searchParams.get("id");
    if (!id || id !== snapshot.identity.logoAssetId) throw new HttpError("Logo tidak ditemukan", 404);
    const actor = await getCurrentUser(false);
    if (!actor?.isAdmin) throw new HttpError("Akses admin diperlukan", actor ? 403 : 401);
    const object = await readLogo(id, { id: actor.id, sessionHash: await appearanceSessionHash() });
    return new Response(Buffer.from(object.data), { headers: {
      "Content-Type": "image/webp", "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff",
    } });
  });
}
