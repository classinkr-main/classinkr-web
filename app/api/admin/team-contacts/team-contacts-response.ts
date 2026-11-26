import { NextResponse } from "next/server"

import { STAFF_ADMIN_API_ROLES, type AdminApiRole, type VerifiedAdminContext } from "@/lib/admin-auth"
import { TeamContactAreaTakenError, TeamContactsNotReadyError, type TeamContactActor } from "@/lib/repositories/team-contacts"

// /api/admin/team-contacts 라우트 공용(라우트 파일은 HTTP 메서드만 내보낼 수 있다).
//
// 담당자 표에는 사람 이름이 들어 있다 — 읽기는 관리자(SUPER_ADMIN·ADMIN), 쓰기(만들기·고치기·비활성화·확인일·CSV 넣기)는
// 최고 관리자(SUPER_ADMIN)만. 화면의 버튼 숨김은 보안 경계가 아니다 — 이 상수가 경계다.

export const TEAM_CONTACTS_READ_ROLES: readonly AdminApiRole[] = STAFF_ADMIN_API_ROLES
export const TEAM_CONTACTS_WRITE_ROLES: readonly AdminApiRole[] = ["SUPER_ADMIN"]

export function teamContactActor(admin: Pick<VerifiedAdminContext, "name" | "userId" | "role">): TeamContactActor {
  return { name: (admin.name?.trim() || admin.userId || admin.role).slice(0, 80) }
}

export async function readJsonObject(req: Request): Promise<Record<string, unknown> | null> {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object" || Array.isArray(body)) return null
  return body as Record<string, unknown>
}

export function teamContactWriteError(error: unknown, label: string) {
  if (error instanceof TeamContactsNotReadyError) return NextResponse.json({ error: error.message }, { status: 503 })
  if (error instanceof TeamContactAreaTakenError) return NextResponse.json({ error: error.message }, { status: 409 })
  console.error(`[${label}]`, error instanceof Error ? error.message : error)
  return NextResponse.json({ error: "담당자 표를 저장하지 못했습니다." }, { status: 500 })
}
