import { NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/mutation-origin";
import { getCurrentUser } from "@/lib/auth/session";
import { handle, HttpError } from "@/lib/response";
import { writeAudit } from "@/modules/audit/audit.service";
import {
  isJntPlatformOwner, jntEnvironment, jntSettingsInput,
  readJntPublicStatus, saveJntSettings,
} from "@/infrastructure/shipping/jnt/official-config";

export const dynamic = "force-dynamic";

async function owner() {
  const user = await getCurrentUser(false);
  if (!user) throw new HttpError("Harap login sebagai pemilik platform", 401);
  if (!isJntPlatformOwner(user)) throw new HttpError("Hanya Super Admin pemilik SaaS yang dapat mengubah integrasi", 403);
  return user;
}
function privateResponse(data: unknown) {
  const response = NextResponse.json({ success: true, data });
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}
export async function GET(req: Request) {
  return handle(async () => {
    await owner();
    const env = jntEnvironment.parse(new URL(req.url).searchParams.get("environment") ?? "sandbox");
    return privateResponse(await readJntPublicStatus(env));
  });
}
export async function PUT(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const actor = await owner();
    if (Number(req.headers.get("content-length") || 0) > 16384) throw new HttpError("Konfigurasi terlalu besar", 413);
    const body = jntSettingsInput.parse(await req.json());
    const saved = await saveJntSettings(body, actor.id);
    // Audit only nonsecret flags; never log input body, decrypted config or auth headers.
    await writeAudit({
      userId: actor.id,
      action: "jnt.integration.updated",
      entity: "JntPlatformIntegration",
      entityId: body.environment,
      meta: { environment: body.environment, enabled: body.enabled },
    });
    return privateResponse(saved);
  });
}
