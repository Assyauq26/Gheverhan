import { handle, ok, HttpError } from "@/lib/response";
import { assertSameOrigin } from "@/lib/mutation-origin";
import { listJntSettings, requireJntSettingsManager, saveJntSettings } from "@/modules/jnt/jnt-settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
function privateResponse(data: unknown) {
  const response = ok(data);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}
export async function GET() {
  return handle(async () => {
    await requireJntSettingsManager();
    return privateResponse(await listJntSettings());
  });
}
export async function PUT(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const actor = await requireJntSettingsManager();
    if (Number(req.headers.get("content-length")) > 8192) throw new HttpError("Payload terlalu besar", 413);
    const raw = await req.text();
    if (raw.length > 8192) throw new HttpError("Payload terlalu besar", 413);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { throw new HttpError("JSON tidak valid", 422); }
    return privateResponse(await saveJntSettings(body, actor.id));
  });
}
