import { SignJWT, jwtVerify } from "jose";
import { createHash, randomUUID } from "node:crypto";

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

export async function signSession(payload: SessionPayload & { version?: number }): Promise<string> {
  const { issuer, audience } = sessionIdentity();
  return new SignJWT({ email: payload.email, ver: payload.version ?? 0 })
    .setJti(randomUUID())
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setIssuer(issuer)
    .setAudience(audience)
    .setExpirationTime("7d")
    .sign(getSecret());
}

export interface VerifiedSession extends SessionPayload {
  version: number;
  tokenHash: string;
  expiresAt: Date;
}

export async function verifySessionClaims(
  token: string,
): Promise<VerifiedSession | null> {
  try {
    const { issuer, audience } = sessionIdentity();
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"],
      issuer,
      audience,
    });
    const version = payload.ver ?? 0; // Existing signed sessions remain valid at version zero.
    if (typeof payload.sub !== "string" || !payload.sub ||
        typeof payload.email !== "string" || !payload.email ||
        typeof payload.exp !== "number" || !Number.isFinite(payload.exp) ||
        !Number.isSafeInteger(version) || (version as number) < 0 ||
        (payload.jti !== undefined && (typeof payload.jti !== "string" || !payload.jti))) return null;
    return {
      sub: payload.sub, email: payload.email, version: version as number,
      tokenHash: createHash("sha256").update(payload.jti ?? token).digest("hex"),
      expiresAt: new Date(payload.exp * 1000),
    };
  } catch {
    return null;
  }
}

/** Compatibility API for callers that need only verified identity claims. */
export async function verifySession(token: string): Promise<SessionPayload | null> {
  const claims = await verifySessionClaims(token);
  return claims ? { sub: claims.sub, email: claims.email } : null;
}
