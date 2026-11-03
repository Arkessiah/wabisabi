import type { NextRequest } from "next/server";

// Solo servidor. El backend que emite los tokens vive fuera de este repo, así que
// la validez y el rol se le preguntan a él (`/me`, el mismo que usa el dashboard).
// Falla cerrado: sin backend, sin token o sin rol reconocido → no autorizado.
const AUTH_API_URL =
  process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export const ADMIN_ROLES = ["admin", "superadmin", "root"];
export const SUPERADMIN_ROLES = ["superadmin", "root"];

export async function verifyAdminToken(
  request: NextRequest,
  allowedRoles: string[] = ADMIN_ROLES,
): Promise<{ valid: boolean; userId?: string; role?: string }> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ") || authHeader.length <= 7) {
    return { valid: false };
  }

  try {
    const res = await fetch(`${AUTH_API_URL}/me`, {
      headers: { Authorization: authHeader },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { valid: false };

    const data = await res.json();
    const user = data?.user ?? data;
    const role = typeof user?.role === "string" ? user.role : undefined;
    if (!role || !allowedRoles.includes(role)) return { valid: false };

    return { valid: true, userId: user?.id, role };
  } catch {
    return { valid: false };
  }
}
