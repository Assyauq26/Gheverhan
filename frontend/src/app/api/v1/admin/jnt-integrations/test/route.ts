import { z } from "zod";
import { handle, ok, HttpError } from "@/lib/response";
import { assertSameOrigin } from "@/lib/mutation-origin";
import { requireJntSettingsManager } from "@/modules/jnt/jnt-settings";
import { jntCheckFee, jntTrack } from "@/modules/jnt/jnt-transport";
import { jntEnvironments, tariffInputSchema } from "@/modules/jnt/jnt-protocol";
import { consumeAuthBucket, authRateLimitRealm } from "@/lib/auth/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Only read-only tariff and tracking probes. Creating/cancelling AWB is never a "connection test".
const schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("tariff"), environment: z.enum(jntEnvironments), input: tariffInputSchema }).strict(),
  z.object({ kind: z.literal("tracking"), environment: z.enum(jntEnvironments), input: z.object({ awb: z.string().max(25) }).strict() }).strict(),
]);
export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const actor = await requireJntSettingsManager();
    if (Number(req.headers.get("content-length")) > 2048) throw new HttpError("Payload terlalu besar", 413);
    const raw = await req.text();
    if (raw.length > 2048) throw new HttpError("Payload terlalu besar", 413);
    let data: unknown;
    try { data = JSON.parse(raw); } catch { throw new HttpError("JSON tidak valid", 422); }
    const input = schema.parse(data);
    const window = Math.floor(Date.now() / 60000);
    await consumeAuthBucket("jntprobe:" + authRateLimitRealm() + ":" + actor.id + ":" + window, 6, new Date((window + 1) * 60000));
    const result = input.kind === "tariff"
      ? await jntCheckFee(input.environment, input.input)
      : await jntTrack(input.environment, input.input.awb);
    const response = ok(result);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  });
}
