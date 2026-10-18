import { z } from "zod";
import { ok, handle } from "@/lib/response";
import { resendRegistrationOtp } from "@/modules/auth/auth.service";

export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  return handle(async () => {
    const data = z.object({ email: z.string().email() }).parse(await req.json());
    await resendRegistrationOtp(data.email);
    return ok({ message: "Kode OTP telah dikirim." });
  });
}
