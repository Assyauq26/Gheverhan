import { SignJWT, jwtVerify } from "jose";

function getSecret(): Uint8Array {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 16) {
    throw new Error("JWT_SECRET is not configured");
  }
  return new TextEncoder().encode(value);
}

export interface SessionPayload {
  sub: string;
  email: string;
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ email: payload.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setIssuer("gheverhan")
    .setAudience("gheverhan-web")
    .setExpirationTime("7d")
    .sign(getSecret());
}

export async function verifySession(
  token: string,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"],
      issuer: "gheverhan",
      audience: "gheverhan-web",
    });
    return { sub: payload.sub as string, email: payload.email as string };
  } catch {
    return null;
  }
}
