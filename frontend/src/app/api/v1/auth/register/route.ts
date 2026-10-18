import { z } from "zod";
import { ok, handle } from "@/lib/response";
import { requestRegistrationOtp } from "@/modules/auth/auth.service";

export const dynamic = "force-dynamic";
const schema = z.object({
  name: z.string().trim().min(2),
  email: z.string().trim().email(),
  phone: z.string().min(8),
  password: z.string().min(6),
  confirmPassword: z.string(),
  terms: z.literal(true),
}).refine((x) => x.password === x.confirmPassword, { message: "Konfirmasi password tidak sama." });

/** Initiate email verification; NEVER create a user or session without verifying OTP. */
export async function POST(req: Request) {
  return handle(async () => {
    const data = schema.parse(await req.json());
    const result = await requestRegistrationOtp(data);
    return ok({ email: result.email, verificationRequired: true }, 202);
  });
}
