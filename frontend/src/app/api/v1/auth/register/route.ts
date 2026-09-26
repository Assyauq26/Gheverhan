import { z } from "zod";
import { ok, handle } from "@/lib/response";
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
    const body = schema.parse(await req.json());
    const user = await registerCustomer(body);
    // Session signing requires JWT_SECRET to be available in the Netlify function runtime.
    await createSession(user.id, user.email);
    return ok({ id: user.id, name: user.name, email: user.email }, 201);
  });
}
