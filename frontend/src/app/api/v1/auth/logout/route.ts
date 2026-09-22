import { ok } from "@/lib/response";
import { destroySession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST() {
  destroySession();
  return ok({ loggedOut: true });
}
