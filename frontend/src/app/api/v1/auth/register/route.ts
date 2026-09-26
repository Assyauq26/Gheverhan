import { z } from "zod";
import { ok, handle, HttpError } from "@/lib/response";
import { registerCustomer } from "@/modules/auth/auth.service";
import { createSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  password: z.string().min(6),
});

export async function POST(req: Request) {
  return handle(async () => {
    // Validate the signing secret before touching the database. Without this
    // guard a successful registration could be committed and then fail while
    // creating the session cookie, leaving the customer with a false error.
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
      throw new HttpError("Layanan autentikasi belum dikonfigurasi", 503);
    }

    const body = schema.parse(await req.json());
    const user = await registerCustomer(body);
    await createSession(user.id, user.email);
    return ok({ id: user.id, name: user.name, email: user.email }, 201);
  });
}
