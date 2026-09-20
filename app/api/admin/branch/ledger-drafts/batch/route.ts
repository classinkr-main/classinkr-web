import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import {
  isLedgerDraftBodyError,
  LEDGER_DRAFT_BATCH_LIMIT,
  parseLedgerDraftCreateBody,
  parseLedgerDraftUpdateBody,
} from "@/lib/branch/ledger-draft-body"
import {
  applyBranchSalesLedgerDraft,
  createBranchSalesLedgerDraft,
  isBranchSalesLedgerDraftsNotReadyError,
  isBranchSalesLedgerDuplicateActiveCorrectionError,
  isBranchSalesLedgerNonPositiveAmountError,
  updateBranchSalesLedgerDraft,
  type BranchSalesLedgerDraft,
} from "@/lib/repositories/branch-sales-ledger-drafts"

// 라운드4 P0-1(docs/active/sales-ledger-input-speed-plan-2026-09-20.md §4) — 초안 배치 API.
// 셀 1건=요청 1건이던 매트릭스 붙여넣기·일괄 체크·일괄 적용을 요청 1건으로 묶는다. 건별 계약은
// 단건 라우트(../route.ts, ../[id]/route.ts)와 동일하게 유지한다(60초 중복 방어, expectedUpdatedAt
// 낙관적 잠금, 양수 금액 검증, applied로의 직접 PATCH 금지) — 이 라우트는 그 검증을 다시 만들지
// 않고 lib/branch/ledger-draft-body.ts의 같은 파서를 그대로 호출한다.
//
// adminActorName/notReadyResponse류 번역기는 단건 라우트들과 문구가 같지만 이 파일에 다시
// 선언한다 — Next App Router 규약상 route.ts 모듈은 HTTP 핸들러(및 runtime 등 정해진 설정
// 필드)만 export할 수 있어 단건 라우트에서 헬퍼 함수를 import해 쓸 수 없다(단건 라우트
// route.ts·[id]/route.ts도 서로 adminActorName을 각자 다시 선언해 온 것과 같은 기존 관례).

function adminActorName(admin: { name?: string; userId?: string; role: string }) {
  return admin.name?.trim() || admin.userId || admin.role
}

// 요청 항목 shape(문서화용 — 실제 검증은 processBatchWriteItem이 런타임에 수행한다):
//   | { op: "create"; input: Record<string, unknown> }
//   | { op: "update"; id: string; input: Record<string, unknown>; expectedUpdatedAt?: string }
type BatchWriteResult =
  | { index: number; ok: true; status: 200 | 201; draft: BranchSalesLedgerDraft; dedupedRecent?: boolean }
  | {
      index: number
      ok: false
      status: 400 | 404 | 409 | 503 | 500
      error: string
      draft?: BranchSalesLedgerDraft
      reason?: "checked-by-other"
    }

type BatchActionResult =
  | { id: string; ok: true; status: 200; draft: BranchSalesLedgerDraft }
  | { id: string; ok: false; status: 400 | 404 | 409 | 503 | 500; error: string; draft?: BranchSalesLedgerDraft }

/**
 * 항목 단위 예외 번역 — 단건 라우트들의 카탈로그·문구를 그대로 재사용한다(notReady->503,
 * duplicateActiveCorrection->409, nonPositiveAmount->400, 그 외->fallbackMessage로 500).
 * 부분 실패를 결과 배열에만 담고 전체 요청은 계속 200으로 응답하므로(운영 장애 안전 규칙 —
 * 부분 실패를 성공으로 숨기지 않되, 나머지 항목 처리를 막지도 않는다), 각 항목의 실패도
 * 여기서 한 번씩 로그를 남긴다(단건 라우트의 catch 블록과 동일하게).
 */
function translateWriteError(
  logLabel: string,
  error: unknown,
  fallbackMessage: string,
): { ok: false; status: 400 | 409 | 503 | 500; error: string } {
  console.error(logLabel, error)
  if (isBranchSalesLedgerDraftsNotReadyError(error)) {
    return { ok: false, status: 503, error: (error as Error).message }
  }
  if (isBranchSalesLedgerDuplicateActiveCorrectionError(error)) {
    return { ok: false, status: 409, error: (error as Error).message }
  }
  if (isBranchSalesLedgerNonPositiveAmountError(error)) {
    return { ok: false, status: 400, error: (error as Error).message }
  }
  return { ok: false, status: 500, error: fallbackMessage }
}

function summarize(results: ReadonlyArray<{ ok: boolean }>) {
  const succeeded = results.filter((result) => result.ok).length
  return { total: results.length, succeeded, failed: results.length - succeeded }
}

async function processCreateItem(input: Record<string, unknown>, index: number, actor: string): Promise<BatchWriteResult> {
  const parsed = parseLedgerDraftCreateBody(input)
  if (isLedgerDraftBodyError(parsed)) {
    return { index, ok: false, status: parsed.status, error: parsed.error }
  }
  try {
    const { draft, dedupedRecent } = await createBranchSalesLedgerDraft(parsed, actor)
    // 단건 POST와 동일: dedupedRecent(더블클릭/더블탭 방어로 기존 초안을 그대로 반환)면 200,
    // 새로 만들었으면 201.
    return { index, ok: true, status: dedupedRecent ? 200 : 201, draft, dedupedRecent }
  } catch (error) {
    return {
      index,
      ...translateWriteError(
        "[POST /api/admin/branch/ledger-drafts/batch:create]",
        error,
        "Failed to create sales ledger draft",
      ),
    }
  }
}

async function processUpdateItem(
  id: string,
  input: Record<string, unknown>,
  expectedUpdatedAtRaw: unknown,
  index: number,
  actor: string,
): Promise<BatchWriteResult> {
  // 단건 [id]/route.ts와 동일하게, applied로의 직접 전이는 action=apply(이 라우트의 PATCH)
  // 전용이다 — 파서 호출 전에 먼저 거부한다.
  if (input.status === "applied") {
    return { index, ok: false, status: 400, error: "Use action=apply to apply a checked draft" }
  }

  const parsed = parseLedgerDraftUpdateBody(input)
  if (isLedgerDraftBodyError(parsed)) {
    return { index, ok: false, status: parsed.status, error: parsed.error }
  }

  if (expectedUpdatedAtRaw !== undefined && (typeof expectedUpdatedAtRaw !== "string" || !expectedUpdatedAtRaw.trim())) {
    return { index, ok: false, status: 400, error: "expectedUpdatedAt must be a non-empty string" }
  }
  const expectedUpdatedAt = typeof expectedUpdatedAtRaw === "string" ? expectedUpdatedAtRaw : undefined

  try {
    const result = await updateBranchSalesLedgerDraft(
      id,
      parsed,
      actor,
      expectedUpdatedAt ? { expectedUpdatedAt } : undefined,
    )

    if (result.outcome === "not-found") {
      return { index, ok: false, status: 404, error: "Draft not found" }
    }
    if (result.outcome === "conflict") {
      return {
        index,
        ok: false,
        status: 409,
        error: "다른 곳에서 먼저 수정되었습니다. 최신 내용을 확인한 뒤 다시 시도하세요.",
        draft: result.draft,
      }
    }
    if (result.outcome === "checked-by-other") {
      return {
        index,
        ok: false,
        status: 409,
        error: "다른 사람이 체크한 초안입니다 — 체크 큐에서 체크를 해제한 뒤 수정하세요.",
        draft: result.draft,
        reason: "checked-by-other",
      }
    }
    return { index, ok: true, status: 200, draft: result.draft }
  } catch (error) {
    return {
      index,
      ...translateWriteError(
        "[POST /api/admin/branch/ledger-drafts/batch:update]",
        error,
        "Failed to update sales ledger draft",
      ),
    }
  }
}

async function processBatchWriteItem(rawItem: unknown, index: number, actor: string): Promise<BatchWriteResult> {
  if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) {
    return { index, ok: false, status: 400, error: "Invalid batch item" }
  }
  // Partial<BatchWriteItem>는 두 변형의 공통 키(op·input)만 남기고 좁혀서 id/expectedUpdatedAt에
  // 접근할 수 없다(유니온의 keyof는 교집합) — 어차피 아래에서 typeof로 직접 런타임 검증하므로
  // 평범한 Record로 받는다.
  const item = rawItem as Record<string, unknown>

  if (item.op === "create") {
    if (!item.input || typeof item.input !== "object" || Array.isArray(item.input)) {
      return { index, ok: false, status: 400, error: "input must be an object" }
    }
    return processCreateItem(item.input as Record<string, unknown>, index, actor)
  }

  if (item.op === "update") {
    if (typeof item.id !== "string" || !item.id.trim()) {
      return { index, ok: false, status: 400, error: "id must be a non-empty string" }
    }
    if (!item.input || typeof item.input !== "object" || Array.isArray(item.input)) {
      return { index, ok: false, status: 400, error: "input must be an object" }
    }
    return processUpdateItem(item.id, item.input as Record<string, unknown>, item.expectedUpdatedAt, index, actor)
  }

  return { index, ok: false, status: 400, error: `Unsupported op: ${String(item.op)}` }
}

export async function POST(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin
  const actor = adminActorName(admin)

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const raw = body as Record<string, unknown>
    const items = raw.items
    if (!Array.isArray(items) || items.length === 0 || items.length > LEDGER_DRAFT_BATCH_LIMIT) {
      return NextResponse.json(
        { error: `items must be an array of 1 to ${LEDGER_DRAFT_BATCH_LIMIT} entries` },
        { status: 400 },
      )
    }

    // 운영 장애 안전 규칙 — 항목은 순서대로 순차 처리하고 한 항목의 실패가 나머지를 막지
    // 않는다. 부분 실패를 summary로 명시해 전체 성공으로 숨기지 않는다.
    const results: BatchWriteResult[] = []
    for (let index = 0; index < items.length; index += 1) {
      results.push(await processBatchWriteItem(items[index], index, actor))
    }

    return NextResponse.json({ results, summary: summarize(results) })
  } catch (error) {
    console.error("[POST /api/admin/branch/ledger-drafts/batch]", error)
    return NextResponse.json({ error: "Failed to process sales ledger draft batch" }, { status: 500 })
  }
}

async function processCheckId(id: string, actor: string): Promise<BatchActionResult> {
  try {
    const result = await updateBranchSalesLedgerDraft(id, { status: "checked" }, actor)

    if (result.outcome === "not-found") {
      return { id, ok: false, status: 404, error: "Draft not found" }
    }
    if (result.outcome === "conflict") {
      return {
        id,
        ok: false,
        status: 409,
        error: "다른 곳에서 먼저 수정되었습니다. 최신 내용을 확인한 뒤 다시 시도하세요.",
        draft: result.draft,
      }
    }
    if (result.outcome === "checked-by-other") {
      return {
        id,
        ok: false,
        status: 409,
        error: "다른 사람이 체크한 초안입니다 — 체크 큐에서 체크를 해제한 뒤 수정하세요.",
        draft: result.draft,
      }
    }
    return { id, ok: true, status: 200, draft: result.draft }
  } catch (error) {
    return {
      id,
      ...translateWriteError(
        "[PATCH /api/admin/branch/ledger-drafts/batch:check]",
        error,
        "Failed to update sales ledger draft",
      ),
    }
  }
}

async function processApplyId(id: string, actor: string): Promise<BatchActionResult> {
  try {
    const draft = await applyBranchSalesLedgerDraft(id, actor)
    if (!draft) {
      return { id, ok: false, status: 409, error: "체크 완료 초안만 적용할 수 있습니다." }
    }
    return { id, ok: true, status: 200, draft }
  } catch (error) {
    return {
      id,
      ...translateWriteError(
        "[PATCH /api/admin/branch/ledger-drafts/batch:apply]",
        error,
        "Failed to update sales ledger draft",
      ),
    }
  }
}

export async function PATCH(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin
  const actor = adminActorName(admin)

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    const raw = body as Record<string, unknown>

    const action = raw.action
    if (action !== "check" && action !== "apply") {
      return NextResponse.json({ error: 'action must be "check" or "apply"' }, { status: 400 })
    }

    const ids = raw.ids
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > LEDGER_DRAFT_BATCH_LIMIT) {
      return NextResponse.json(
        { error: `ids must be an array of 1 to ${LEDGER_DRAFT_BATCH_LIMIT} entries` },
        { status: 400 },
      )
    }
    if (!ids.every((id) => typeof id === "string" && id.trim().length > 0)) {
      return NextResponse.json({ error: "ids must be non-empty strings" }, { status: 400 })
    }

    // 중복 id는 그대로(멱등) 처리한다 — updateBranchSalesLedgerDraft/applyBranchSalesLedgerDraft가
    // 이미 멱등이라 같은 id를 두 번 처리해도 결과가 안전하다.
    const results: BatchActionResult[] = []
    for (const id of ids as string[]) {
      results.push(action === "check" ? await processCheckId(id, actor) : await processApplyId(id, actor))
    }

    return NextResponse.json({ results, summary: summarize(results) })
  } catch (error) {
    console.error("[PATCH /api/admin/branch/ledger-drafts/batch]", error)
    return NextResponse.json({ error: "Failed to process sales ledger draft batch" }, { status: 500 })
  }
}
