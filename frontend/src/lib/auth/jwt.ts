import { SignJWT, jwtVerify } from "jose";

function getSecret(): Uint8Array {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 16) {
    throw new Error("JWT_SECRET is not configured");
  }
  return new TextEncoder().encode(value);
}

/**
 * Preview and production sessions must not have interchangeable claims.
 *
 * This prevents accidental cross-environment acceptance even if a deployment
 * has been given the wrong signing key. It does NOT make it safe to share
 * JWT_SECRET: anyone who obtains a shared HS256 key can mint either identity.
 * Vercel production and preview MUST use independently generated secrets.
 */
function sessionIdentity() {
  return process.env.VERCEL_ENV === "preview"
    ? { issuer: "gheverhan-preview", audience: "gheverhan-web-preview" }
    : { issuer: "gheverhan", audience: "gheverhan-web" };
}

export interface SessionPayload {
  sub: string;
  email: string;
}

export async function signSession(payload: SessionPayload): Promise<string> {
  const { issuer, audience } = sessionIdentity();
  return new SignJWT({ email: payload.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setIssuer(issuer)
    .setAudience(audience)
    .setExpirationTime("7d")
    .sign(getSecret());
}

export async function verifySession(
  token: string,
): Promise<SessionPayload | null> {
  try {
    const { issuer, audience } = sessionIdentity();
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"],
      issuer,
      audience,
    });
    return { sub: payload.sub as string, email: payload.email as string };
  } catch {
    return null;
  }
}
