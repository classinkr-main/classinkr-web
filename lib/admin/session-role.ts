// 브라우저 세션에 저장된 관리자 역할(sessionStorage "admin_role")로 버튼 노출을 가늠한다.
// 보안 경계가 아니다 — 실제 권한 검사는 각 API의 verifyAdmin·requireVerifiedAdminContext가 한다. 이 판정은
// 눌러도 403만 날 버튼을 미리 숨기거나 라벨을 정직하게 바꾸는 데만 쓴다(라운드 5 S-5).
// 역할 묶음은 lib/admin-auth.ts의 *_ADMIN_API_ROLES와 같은 값을 쓴다.

export function readSessionAdminRole(): string | null {
  if (typeof window === "undefined") return null
  try {
    const role = window.sessionStorage.getItem("admin_role")?.trim().toUpperCase()
    return role ? role : null
  } catch {
    return null
  }
}

export function sessionRoleIn(roles: readonly string[]): boolean {
  const role = readSessionAdminRole()
  return role != null && roles.includes(role)
}

// lib/admin-auth.ts는 서버 전용(next/headers·crypto)이라 클라이언트가 import할 수 없어 값을 옮겨 둔다.
// tests/admin/session-role.test.ts가 두 목록이 서버 정본과 같은지 대조한다.
/** 시트 동기화(POST /api/admin/branch/sync — verifyAdmin 기본 = STAFF_ADMIN_API_ROLES). */
export const SESSION_SHEET_SYNC_ROLES = ["SUPER_ADMIN", "ADMIN"] as const
/** 매칭 후보 생성 등 CRM 운영 쓰기(CRM_STAFF_ADMIN_API_ROLES). */
export const SESSION_CRM_STAFF_ROLES = ["SUPER_ADMIN", "ADMIN", "BRANCH", "EDITOR"] as const
