import { NextResponse } from "next/server";
import { createReadinessCheck } from "@/lib/self-hosted/readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const check = createReadinessCheck({
  async database(config, signal) {
    const { probeDatabase } = await import("@/lib/self-hosted/readiness-probes");
    await probeDatabase(config, signal);
  },
  async storage(config, signal) {
    const { probeStorage } = await import("@/lib/self-hosted/readiness-probes");
    await probeStorage(config, signal);
  },
});

export async function GET() {
  const result = await check(process.env);
  const status = result.status === "not_enabled" ? 404 : result.status === "ready" ? 200 : 503;
  return NextResponse.json({ success: status === 200, data: { status: result.status } }, {
    status, headers: { "Cache-Control": "no-store, max-age=0", "X-Robots-Tag": "noindex", ...(status === 503 ? { "Retry-After": "3" } : {}) },
  });
}
