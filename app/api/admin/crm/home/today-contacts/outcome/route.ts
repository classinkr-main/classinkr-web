import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext, type VerifiedAdminContext } from "@/lib/admin-auth"
import {
  parseTodayContactOutcomeRequest,
  parseTodayContactOutcomeUndoRequest,
  recordTodayContactOutcome,
  undoTodayContactOutcome,
  type TodayContactActor,
} from "@/lib/crm/account-contact-record"
import { findAdminCrmOwner, listAdminUserDirectoryCached } from "@/lib/repositories/admin-users"

// 현황 "오늘 연락"(C안 ①) 행 안 결과 기록(POST)·되돌리기(DELETE). 경로 규칙은 lib/crm/account-contact-record.ts.
// Home 자기 테이블(crm_customer_events·crm_tasks·lead_contact_logs·leads.follow_up_at)에만 쓴다 — Compass·외부 NeoCRM 쓰기 0.
// 응답은 평평한 JSON(TodayContactOutcomeResponse · TodayContactOutcomeUndoResponse, lib/crm/today-contact-types.ts).

async function resolveActor(admin: VerifiedAdminContext): Promise<TodayContactActor> {
  // 작성자 이름은 다른 연락 경로(리드 logs·할 일 PATCH)와 같은 순서(admin.name → userId → role).
  const name = admin.name?.trim() || admin.userId || admin.role
  // 다음 일정 할 일의 담당 = 저장한 사람(통합 결정). 담당 키 해석 실패는 fail-soft(이름 스냅샷만 남는다).
  try {
    const resolved = findAdminCrmOwner(await listAdminUserDirectoryCached(), admin)
    return {
      name: admin.name?.trim() || resolved.owner?.displayName?.trim() || name,
      ownerKey: resolved.owner?.ownerKey ?? resolved.ownerKeys[0] ?? null,
    }
  } catch (error) {
    console.error("[today-contacts outcome] resolve actor", error)
    return { name, ownerKey: null }
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const body = await req.json().catch(() => null)
  const now = new Date()
  const parsed = parseTodayContactOutcomeRequest(body, now.getTime())
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  try {
    const actor = await resolveActor(admin)
    const result = await recordTodayContactOutcome(parsed.value, actor, now)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json(result.body, { status: result.status })
  } catch (error) {
    console.error("[POST /api/admin/crm/home/today-contacts/outcome]", error)
    return NextResponse.json({ error: "Failed to record today contact outcome" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const body = await req.json().catch(() => null)
  const parsed = parseTodayContactOutcomeUndoRequest(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  try {
    const actor = await resolveActor(admin)
    const result = await undoTodayContactOutcome(parsed.value, actor)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json(result.body, { status: result.status })
  } catch (error) {
    console.error("[DELETE /api/admin/crm/home/today-contacts/outcome]", error)
    return NextResponse.json({ error: "Failed to undo today contact outcome" }, { status: 500 })
  }
}
