import { NextResponse } from "next/server"

import { STAFF_ADMIN_API_ROLES, type AdminApiRole, type VerifiedAdminContext } from "@/lib/admin-auth"
import { TeamContactAreaTakenError, TeamContactsNotReadyError, type TeamContactActor } from "@/lib/repositories/team-contacts"

// /api/admin/team-contacts 라우트 공용(라우트 파일은 HTTP 메서드만 내보낼 수 있다).
//
// 담당자 표에는 사람 이름이 들어 있다 — 읽기는 관리자(SUPER_ADMIN·ADMIN), 쓰기(만들기·고치기·비활성화·확인일·CSV 넣기)는
// 최고 관리자(SUPER_ADMIN)만. 화면의 버튼 숨김은 보안 경계가 아니다 — 이 상수가 경계다.
//
// 이 읽기 경계는 "표 전체"(모든 영역·비활성 행·비고·확인자)에 대한 것이다. 갈매봇 1:1 담당자 안내(GALMAE_CHAT_ROLES —
// SUPER_ADMIN·ADMIN·BRANCH·EDITOR)는 질문 하나에 맞는 영역 한 행의 1차·대리 이름·연락 방법 종류·준비물·확인일만 낸다
// (누구에게 물을지 알리는 것이 그 답의 목적이다 — 일부러 넓다). 비고·확인자·다른 영역은 내지 않는다. 단체방은 이름 없이 역할만.
// 정리: docs/active/internal-team-contacts-2026-11-26.md §3.

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
