import { handle, ok, HttpError } from "@/lib/response";
import { getDashboardIdentity } from "@/modules/appearance/dashboard";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  return handle(async () => {
    const identity = await getDashboardIdentity();
    if (new URL(req.url).search) throw new HttpError("Parameter identitas tidak didukung", 422);
    const response = ok(identity);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Vary", "Cookie");
    return response;
  });
}
