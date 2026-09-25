import "server-only";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { signSession, verifySession } from "@/lib/auth/jwt";
import { HttpError } from "@/lib/response";
import { ADMIN_ROLES, type PermissionKey } from "@/lib/auth/permissions";

const COOKIE = process.env.AUTH_COOKIE_NAME ?? "gh_session";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  roles: string[];
  permissions: string[];
  isAdmin: boolean;
}

export async function createSession(userId: string, email: string) {
  const token = await signSession({ sub: userId, email });
  const cookieStore = await cookies();
  cookieStore.set(COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE)?.value;
  if (!token) return null;
  const payload = await verifySession(token);
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    include: {
      roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
    },
  });
  if (!user || !user.isActive) return null;

  const roles = user.roles.map((r) => r.role.name);
  const permissions = Array.from(
    new Set(
      user.roles.flatMap((r) => r.role.permissions.map((p) => p.permission.key)),
    ),
  );
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    roles,
    permissions,
    isAdmin: roles.some((r) => ADMIN_ROLES.includes(r)),
  };
}

export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw new HttpError("Anda harus login terlebih dahulu", 401);
  return user;
}

export async function requirePermission(
  permission: PermissionKey,
): Promise<AuthUser> {
  const user = await requireUser();
  if (!user.permissions.includes(permission)) {
    throw new HttpError("Anda tidak memiliki izin untuk aksi ini", 403);
  }
  return user;
}

export async function requireAdmin(): Promise<AuthUser> {
  const user = await requireUser();
  if (!user.isAdmin) throw new HttpError("Akses admin diperlukan", 403);
  return user;
}
