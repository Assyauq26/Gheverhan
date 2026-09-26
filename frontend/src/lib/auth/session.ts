import "server-only";
import { cache } from "react";
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
  /** Quantity total used by the storefront header/bottom navigation. */
  cartCount: number;
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

/**
 * Request-scoped memoization is important because the storefront layout and
 * individual pages/components can ask for the current user during the same
 * render. The cart quantity is selected with the user so the storefront does
 * not need a second cartCount() query just to render its navigation badge.
 */
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE)?.value;
  if (!token) return null;

  const payload = await verifySession(token);
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      isActive: true,
      roles: {
        select: {
          role: {
            select: {
              name: true,
              permissions: {
                select: { permission: { select: { key: true } } },
              },
            },
          },
        },
      },
      cart: {
        select: {
          items: { select: { quantity: true } },
        },
      },
    },
  });

  if (!user || !user.isActive) return null;

  const roles = user.roles.map((r) => r.role.name);
  const permissions = Array.from(
    new Set(
      user.roles.flatMap((r) =>
        r.role.permissions.map((p) => p.permission.key),
      ),
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
    cartCount: user.cart?.items.reduce((s, i) => s + i.quantity, 0) ?? 0,
  };
});

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
