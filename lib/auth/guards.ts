/**
 * Auth Guards — Supabase Auth 기반 관리자 권한 검사
 *
 * 사용법:
 *   const { user, profile } = await requireRole('SUPER_ADMIN', 'ADMIN');
 *   const user = await requireSession();
 */

import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AdminRole, AdminProfile } from "@/lib/supabase/database.types";

/* ─── Error ─── */

export class AuthError extends Error {
  constructor(
    message: string,
    public statusCode: number = 401
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/* ─── Session 확인 ─── */

export async function requireSession() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new AuthError("로그인이 필요합니다", 401);
  }

  return user;
}

/* ─── Admin Profile 조회 ─── */

export async function getAdminProfile(
  userId: string
): Promise<AdminProfile | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("admin_profiles")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error || !data) return null;
  return data as AdminProfile;
}

/* ─── 역할 기반 접근 제어 ─── */

export async function requireRole(...roles: AdminRole[]) {
  const user = await requireSession();

  const profile = await getAdminProfile(user.id);

  if (!profile) {
    throw new AuthError("관리자 프로필이 없습니다. 관리자 초대가 필요합니다.", 403);
  }

  if (profile.status !== "ACTIVE") {
    throw new AuthError(
      profile.status === "SUSPENDED"
        ? "계정이 정지되었습니다."
        : "초대를 수락한 후 접근할 수 있습니다.",
      403
    );
  }

  if (!roles.includes(profile.role)) {
    throw new AuthError(
      `이 작업은 ${roles.join(" 또는 ")} 권한이 필요합니다.`,
      403
    );
  }

  return { user, profile };
}

/* ─── 권한 맵 ─── */

const PERMISSION_MAP: Record<string, AdminRole[]> = {
  "dashboard.read": ["SUPER_ADMIN", "ADMIN", "EDITOR", "VIEWER"],
  "post.read": ["SUPER_ADMIN", "ADMIN", "EDITOR", "VIEWER"],
  "post.create": ["SUPER_ADMIN", "ADMIN", "EDITOR"],
  "post.update": ["SUPER_ADMIN", "ADMIN", "EDITOR"],
  "post.delete": ["SUPER_ADMIN", "ADMIN"],
  "post.publish": ["SUPER_ADMIN", "ADMIN"],
  "post.unpublish": ["SUPER_ADMIN", "ADMIN"],
  "lead.read": ["SUPER_ADMIN", "ADMIN", "EDITOR", "VIEWER"],
  "lead.update": ["SUPER_ADMIN", "ADMIN"],
  "lead.delete": ["SUPER_ADMIN", "ADMIN"],
  "user.read": ["SUPER_ADMIN", "ADMIN"],
  "user.invite": ["SUPER_ADMIN"],
  "user.role.update": ["SUPER_ADMIN"],
  "audit.read": ["SUPER_ADMIN", "ADMIN"],
  "settings.read": ["SUPER_ADMIN", "ADMIN"],
  "settings.update": ["SUPER_ADMIN", "ADMIN"],
};

export async function requirePermission(permission: string) {
  const allowedRoles = PERMISSION_MAP[permission];
  if (!allowedRoles) {
    throw new AuthError(`알 수 없는 권한: ${permission}`, 400);
  }
  return requireRole(...allowedRoles);
}

/* ─── API Route 헬퍼 ─── */

/**
 * API Route에서 AuthError를 Response로 변환
 *
 * 사용법:
 *   try {
 *     const { user, profile } = await requireRole('ADMIN');
 *     // ... 비즈니스 로직
 *   } catch (e) {
 *     return handleAuthError(e);
 *   }
 */
export function handleAuthError(error: unknown): Response {
  if (error instanceof AuthError) {
    return Response.json(
      { error: error.message },
      { status: error.statusCode }
    );
  }
  console.error("Unexpected auth error:", error);
  return Response.json(
    { error: "인증 처리 중 오류가 발생했습니다." },
    { status: 500 }
  );
}
