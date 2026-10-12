import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { parseTaskDueAt } from "@/lib/crm/task-due-at"
import { parseUnifiedCustomerKeyList } from "@/lib/crm/unified-customer-key"
import { isCrmTasksNotReadyError } from "@/lib/repositories/crm-tasks"
import {
  CRM_TASK_BULK_MAX_TARGETS,
  CRM_TASK_BULK_NOTE_MAX,
  CRM_TASK_BULK_TITLE_MAX,
  createCrmTasksForTargets,
  type CreateCrmTasksForTargetsResult,
} from "@/lib/repositories/crm-tasks-bulk"

// POST /api/admin/crm/tasks/bulk — 통합 고객 목록에서 고른 고객마다 같은 할 일을 하나씩 만든다(SG7 콜 큐 투입).
//
// 요청: { keys: string[], title: string, dueAt?: string | null, note?: string }
//  - keys: 통합 고객 행 키(`lead:<uuid>` · `neo:<accountId>` · `customer:<uuid>`). 중복 제거 후 최대 200개
//    (초과 400). 해석 못 하는 키는 invalid 로 되돌려 준다.
//  - title: 앞뒤 공백 제거 후 1~120자.
//  - dueAt: 단건 할 일 POST·PATCH 와 같은 해석(lib/crm/task-due-at.ts — 키 없음·null·"" = 기한 없음,
//    날짜 문자열 = 그 시각). 해석 못 하는 값은 400.
//  - note: 할 일 메모(detail). 문자열만, 최대 2,000자.
// 응답(성공): { created, skipped, invalid, failed }
//  - 같은 대상에 같은 제목의 열린 할 일(open·snoozed)이 이미 있으면 skipped(중복 방지).
//  - failed: 생성이 실패한 대상의 행 키(부분 실패). 생성을 시도한 대상이 전부 실패하면 500.
// 캐시: 생성은 저장소 createCrmTask 를 건별로 태워 할 일 Data Cache 태그·우선순위 큐 구독자 무효화를
// 그대로 탄다. 기록: created_by·assigned_by 에 작성자(단건 POST 와 같은 규칙), 서버 로그에 건수 요약.
// 담당자는 비워 둔다(계약에 담당 필드가 없다 — 할 일 화면에서 재배정한다).

function adminActorName(admin: { name?: string; userId?: string; role: string }) {
  return admin.name?.trim() || admin.userId || admin.role
}

export async function POST(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const raw = body as Record<string, unknown>

  const title = typeof raw.title === "string" ? raw.title.trim() : ""
  if (!title) return NextResponse.json({ error: "할 일 제목은 필수입니다." }, { status: 400 })
  if (title.length > CRM_TASK_BULK_TITLE_MAX) {
    return NextResponse.json(
      { error: `할 일 제목은 ${CRM_TASK_BULK_TITLE_MAX}자 이하로 입력하세요.` },
      { status: 400 }
    )
  }

  const due = parseTaskDueAt(raw.dueAt)
  if (!due.ok) return NextResponse.json({ error: due.error }, { status: 400 })

  if (raw.note != null && typeof raw.note !== "string") {
    return NextResponse.json({ error: "note는 문자열이어야 합니다." }, { status: 400 })
  }
  const note = typeof raw.note === "string" ? raw.note.trim() : ""
  if (note.length > CRM_TASK_BULK_NOTE_MAX) {
    return NextResponse.json(
      { error: `메모는 ${CRM_TASK_BULK_NOTE_MAX.toLocaleString("ko-KR")}자 이하로 입력하세요.` },
      { status: 400 }
    )
  }

  const parsed = parseUnifiedCustomerKeyList(raw.keys, CRM_TASK_BULK_MAX_TARGETS)
  if (!parsed.ok) {
    return NextResponse.json(
      parsed.reason === "too_many" ? { error: parsed.error, limit: parsed.limit } : { error: parsed.error },
      { status: 400 }
    )
  }
  const { targets, invalid } = parsed

  if (targets.length === 0) {
    return NextResponse.json({ created: 0, skipped: 0, invalid, failed: [] })
  }

  const actor = adminActorName(admin)
  let result: CreateCrmTasksForTargetsResult
  try {
    result = await createCrmTasksForTargets({
      targets,
      title,
      dueAt: due.dueAt ?? null,
      note: note || null,
      createdBy: actor,
    })
  } catch (error) {
    console.error("[POST /api/admin/crm/tasks/bulk]", error)
    if (isCrmTasksNotReadyError(error)) {
      return NextResponse.json({ error: error.message }, { status: 503 })
    }
    return NextResponse.json({ error: "할 일 일괄 생성에 실패했습니다." }, { status: 500 })
  }

  console.info(
    `[POST /api/admin/crm/tasks/bulk] actor=${actor} targets=${targets.length} created=${result.created} skipped=${result.skipped} failed=${result.failed.length} invalid=${invalid.length}`
  )

  const payload = { created: result.created, skipped: result.skipped, invalid, failed: result.failed }
  // 생성을 시도한 대상이 전부 실패했으면(0건 생성) 성공으로 보이지 않게 500 — 건수는 함께 싣는다.
  if (result.failed.length > 0 && result.created === 0 && result.failed.length === targets.length - result.skipped) {
    return NextResponse.json({ ...payload, error: "할 일 일괄 생성에 실패했습니다." }, { status: 500 })
  }
  return NextResponse.json(payload)
}
