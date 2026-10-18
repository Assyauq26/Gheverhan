import { z } from "zod";
import { ok, handle, HttpError } from "@/lib/response";
import { verifyRegistrationOtp } from "@/modules/auth/auth.service";
import { createSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
const schema = z.object({ email: z.string().email(), otp: z.string().regex(/^\d{6}$/) });

export async function POST(req: Request) {
  return handle(async () => {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
      throw new HttpError("Layanan autentikasi belum dikonfigurasi", 503);
    }
    const input = schema.parse(await req.json());
    const user = await verifyRegistrationOtp(input.email, input.otp);
    await createSession(user.id, user.email, user.sessionVersion);
    return ok({ id: user.id, name: user.name, email: user.email }, 201);
  });
}
