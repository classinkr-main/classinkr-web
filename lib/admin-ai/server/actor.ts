import "server-only"

// 로그인한 어드민 스태프를 운영 도구(lib/ops-tools)의 행위자로 — 갈매봇 어댑터 전용.
//
// 범위는 역할에서 나온다(토큰 줄이 아니다). 화면 API 가드와 같은 역할 묶음을 쓴다.
//  - 대화(조회·묻기): CRM_STAFF_ADMIN_API_ROLES — CS 코파일럿·견적 API 와 같은 사람들.
//  - 견적 초안: 견적 API 와 같은 CRM_STAFF_ADMIN_API_ROLES. HW 배송 예정: HW 출고 등록 API 와 같은 HARDWARE_EDITOR_ADMIN_API_ROLES.
//  - pii(연락처 원문): 화면 표시용으로 SUPER_ADMIN·ADMIN 만. 모델 입력은 범위와 상관없이 늘 가린다(llm/adapter.ts).
// 이름은 `galmae-<계정 id>` — 운영 도구 감사(auditOps)에 mcp:galmae-… 로 남고, 확인 경로는 실제 어드민 감사(logAdminAudit)를 따로 남긴다.
import {
  CRM_STAFF_ADMIN_API_ROLES,
  HARDWARE_EDITOR_ADMIN_API_ROLES,
  STAFF_ADMIN_API_ROLES,
  hasAdminApiRole,
  type AdminApiRole,
  type VerifiedAdminContext,
} from "@/lib/admin-auth"
import type { OpsActor, OpsScope } from "@/lib/ops-tools/actor"

export const GALMAE_CHAT_ROLES: readonly AdminApiRole[] = CRM_STAFF_ADMIN_API_ROLES

/** 쓰기 도구(mcpName)별 역할 — 확인 때 다시 검사한다(작성 뒤 역할이 바뀌면 거절). */
export const GALMAE_WRITE_ROLES: Readonly<Record<string, readonly AdminApiRole[]>> = {
  quote_create_draft: CRM_STAFF_ADMIN_API_ROLES,
  hw_plan_movement: HARDWARE_EDITOR_ADMIN_API_ROLES,
}

export type StaffIdentity = Pick<VerifiedAdminContext, "role" | "name" | "userId" | "source" | "capabilities">

/** 표·감사에 쓰는 행위자 키 — 계정 id 가 없으면(개발 우회·레거시 세션) 출처와 이름. */
export function staffKey(admin: StaffIdentity): string {
  const raw = admin.userId?.trim() || `${admin.source}:${admin.name?.trim() || admin.role}`
  return raw.replace(/[^A-Za-z0-9가-힣_:@.-]/g, "").slice(0, 80) || "unknown"
}

export function staffScopes(admin: Pick<VerifiedAdminContext, "role">): OpsScope[] {
  const scopes: OpsScope[] = []
  if (hasAdminApiRole(admin.role, GALMAE_CHAT_ROLES)) scopes.push("read")
  if (hasAdminApiRole(admin.role, GALMAE_WRITE_ROLES.quote_create_draft)) scopes.push("write:quote")
  if (hasAdminApiRole(admin.role, GALMAE_WRITE_ROLES.hw_plan_movement)) scopes.push("write:hw")
  if (hasAdminApiRole(admin.role, STAFF_ADMIN_API_ROLES)) scopes.push("pii")
  return scopes
}

export function staffActor(admin: StaffIdentity): OpsActor {
  return { name: `galmae-${staffKey(admin)}`, scopes: staffScopes(admin), legacy: false }
}

export function canUseWriteTool(admin: Pick<VerifiedAdminContext, "role">, mcpName: string): boolean {
  const roles = GALMAE_WRITE_ROLES[mcpName]
  return Boolean(roles) && hasAdminApiRole(admin.role, roles)
}
