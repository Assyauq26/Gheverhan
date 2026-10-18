import { assertMutationOrigin } from "@/lib/mutation-origin";
import { registrationResendSchema } from "@/modules/auth/registration-schema";
import { ok, handle } from "@/lib/response";
import { resendRegistrationOtp } from "@/modules/auth/auth.service";

export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  return handle(async () => {
    assertMutationOrigin(req);
    const data = registrationResendSchema.parse(await req.json());
    await resendRegistrationOtp(data.email, data.challengeId);
    return ok({ message: "Kode OTP telah dikirim." });
  });
}
