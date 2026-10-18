import { assertMutationOrigin } from "@/lib/mutation-origin";
import { registrationSchema } from "@/modules/auth/registration-schema";
import { ok, handle } from "@/lib/response";
import { requestRegistrationOtp } from "@/modules/auth/auth.service";

export const dynamic = "force-dynamic";
/** Initiate email verification; NEVER create a user or session without verifying OTP. */
export async function POST(req: Request) {
  return handle(async () => {
    assertMutationOrigin(req);
    const data = registrationSchema.parse(await req.json());
    const result = await requestRegistrationOtp(data);
    return ok({ email: result.email, verificationRequired: true }, 202);
  });
}
