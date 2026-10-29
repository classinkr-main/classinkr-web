import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { isLedgerDraftBodyError, parseLedgerDraftUpdateBody } from "@/lib/branch/ledger-draft-body"
import { applyLedgerDraftsWithSheetWrite } from "@/lib/branch/sheet-writeback/apply-service"
import { sheetWriteBlocksReverse } from "@/lib/branch/sheet-writeback/ledger-rules"
import { SHEET_WRITTEN_REVERSE_MESSAGE } from "@/lib/branch/sheet-writeback/messages"
import {
  deleteBranchSalesLedgerDraft,
  isBranchSalesLedgerDraftHasSheetWritesError,
  isBranchSalesLedgerDraftsNotReadyError,
  isBranchSalesLedgerDuplicateActiveCorrectionError,
  isBranchSalesLedgerNonPositiveAmountError,
  isBranchSalesLedgerSupersedeNotCheckedError,
  isBranchSalesLedgerSupersedeNotFoundError,
  isBranchSalesLedgerSupersedeTargetMismatchError,
  isBranchSalesLedgerSupersedeUnavailableError,
  reverseBranchSalesLedgerEntryByDraftId,
  supersedeBranchSalesLedgerEntry,
  updateBranchSalesLedgerDraft,
} from "@/lib/repositories/branch-sales-ledger-drafts"
import {
  isSheetWritesNotReadyError,
  latestSheetWritesByDraftIds,
  type SheetWriteRecord,
} from "@/lib/repositories/branch-sales-ledger-sheet-writes"

// REV 시트 쓰기(ADR-011) — action=apply 는 시트 다시 읽기(8s) + 쓰기·되읽기(8s) + 되돌리기(8s) + DB 를 한 요청에서
// 돈다(lib/branch/sheet-writeback/apply-service.ts). 그 최악 합이 이 상한 안에 든다.
export const maxDuration = 60

// P2-9 — action=supersede의 newDraftId 형식 검증. draft id는 gen_random_uuid()(v4) 산출물이지만
// 형식 검증 자체는 버전 무관 표준 UUID 8-4-4-4-12만 확인한다(과도한 제약 금지).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// REV 시트와 DB를 함께 안전하게 갱신하는 경로가 검증되기 전까지 변경하지 않는다.
function supersedeEnabled(): boolean { return false }

function adminActorName(admin: { name?: string; userId?: string; role: string }) {
  return admin.name?.trim() || admin.userId || admin.role
}

function optionalString(value: unknown) {
  if (value == null) return undefined
  return typeof value === "string" ? value : null
}

function notReadyResponse(error: unknown) {
  if (isBranchSalesLedgerDraftsNotReadyError(error)) {
    return NextResponse.json({ error: (error as Error).message }, { status: 503 })
  }
  return null
}

function duplicateActiveCorrectionResponse(error: unknown) {
  if (isBranchSalesLedgerDuplicateActiveCorrectionError(error)) {
    return NextResponse.json({ error: (error as Error).message }, { status: 409 })
  }
  return null
}

function nonPositiveAmountResponse(error: unknown) {
  if (isBranchSalesLedgerNonPositiveAmountError(error)) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
  return null
}

/**
 * 되돌리기 가드용 — 이 초안의 가장 최근 시트 쓰기 시도. 감사 표가 아직 없으면(마이그레이션 전) 시트에 쓴 적도
 * 없으므로 null(기존 동작). 그 밖의 조회 실패는 던진다 — 시트에 쓴 항목인지 모르는 채 장부만 상쇄하면 시트와
 * 장부가 갈라지므로 fail closed(바깥 catch 가 500).
 */
async function latestSheetWrite(draftId: string): Promise<SheetWriteRecord | null> {
  try {
    return (await latestSheetWritesByDraftIds([draftId])).get(draftId) ?? null
  } catch (error) {
    if (isSheetWritesNotReadyError(error)) return null
    throw error
  }
}

// P2-9 — supersede RPC가 운영 DB에 없으면(fail-closed) 503 + reason으로 명시한다. 훅이 이
// reason만 보고 폴백 없이 즉시 기능을 끄고(capabilities 재확인), 절대 reverse/apply를 순차
// 호출하지 않는다.
function supersedeUnavailableResponse(error: unknown) {
  if (isBranchSalesLedgerSupersedeUnavailableError(error)) {
    return NextResponse.json(
      { error: (error as Error).message, reason: "supersede-unavailable" },
      { status: 503 },
    )
  }
  return null
}

function supersedeNotFoundResponse(error: unknown) {
  if (isBranchSalesLedgerSupersedeNotFoundError(error)) {
    return NextResponse.json({ error: (error as Error).message }, { status: 404 })
  }
  return null
}

function supersedeNotCheckedResponse(error: unknown) {
  if (isBranchSalesLedgerSupersedeNotCheckedError(error)) {
    return NextResponse.json({ error: (error as Error).message }, { status: 409 })
  }
  return null
}

function supersedeTargetMismatchResponse(error: unknown) {
  if (isBranchSalesLedgerSupersedeTargetMismatchError(error)) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
  return null
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin
  const actor = adminActorName(admin)
  const { id } = await params
  let action = "update"

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    const raw = body as Record<string, unknown>
    action = typeof raw.action === "string" ? raw.action : "update"

    if (action === "apply") {
      // 반영의 유일한 진입점(tests/branch/sheet-write-surface.test.ts 래칫) — 스위치가 꺼져 있으면 지금처럼 장부에만,
      // 켜져 있으면 '2. REV' 에도 쓴다. 서비스는 항목 오류를 던지지 않고 결과(status·error·sheet)에 담는다
      // (마이그레이션 미적용 503·활성 정정 중복 409·0 이하 금액 400·체크 완료 아님 409 — 기존 번역과 같은 문구).
      // 202 는 "시트 반영 여부 모름"(ok:false) — 장부는 반영하지 않았고 다시 보내지도 않았다.
      const { results } = await applyLedgerDraftsWithSheetWrite([id], actor)
      const result = results.find((item) => item.id === id)
      if (!result) throw new Error("apply-service returned no result for the requested draft")
      if (result.ok && result.draft) {
        return NextResponse.json({ draft: result.draft, sheet: result.sheet })
      }
      return NextResponse.json(
        {
          ok: false,
          error: result.error ?? result.sheet.message,
          sheet: result.sheet,
          ...(result.draft ? { draft: result.draft } : {}),
        },
        { status: result.ok ? 500 : result.status },
      )
    }
    if (action === "reverse") {
      // id는 draft id다(기존 apply와 동일 계약) — draft_id로 연결된 내부 원장 entry를 찾아
      // active->reversed로 상쇄한다. draft.status 자체는 건드리지 않는다(감사 추적 보존).
      const reason = optionalString(raw.reason)
      if (reason === null) return NextResponse.json({ error: "reason must be a string" }, { status: 400 })

      // REV 시트 쓰기(ADR-011) — 시트에 쓴 정정을 장부에서만 상쇄하면 시트에는 새 값이 남아 화면(미러)이 되돌린
      // 줄 모르게 된다. 시트가 정본이므로 되돌리기는 시트에서 직접 하거나 원래 값으로 다시 입력해 반영한다.
      // "sending" 도 막는다 — 장부 항목은 시트 쓰기를 되읽어 확인한 뒤에만 생기므로, 항목이 있는데 시도가 sending 이면
      // 시트에는 쓰였고 감사 행 갱신만 실패한 것이다(항목이 없으면 어차피 상쇄할 것이 없다). 판정 정본은 ledger-rules.ts.
      const sheetWrite = await latestSheetWrite(id)
      if (sheetWriteBlocksReverse(sheetWrite?.status, sheetWrite?.code)) {
        return NextResponse.json({ error: SHEET_WRITTEN_REVERSE_MESSAGE, reason: "sheet-written" }, { status: 409 })
      }

      const entry = await reverseBranchSalesLedgerEntryByDraftId(id, actor, reason)
      if (!entry) {
        return NextResponse.json({ error: "해당 초안에 연결된 적용 항목을 찾을 수 없습니다." }, { status: 404 })
      }
      return NextResponse.json({ entry })
    }
    if (action === "supersede") {
      // 이 RPC는 DB 안에서는 원자적이지만 REV 시트 쓰기·감사 경로와 원자적으로 묶이지 않는다.
      // 시트 기록이 있거나 동시 쓰기가 진행 중일 때 DB만 바뀌는 일을 막기 위해 서버에서 차단한다.
      // RPC 적용 여부나 클라이언트 값으로 이 가드를 우회하지 않는다.
      if (!supersedeEnabled()) {
        return NextResponse.json(
          { error: "REV 시트 정합성 검증 전에는 적용값 대체를 사용할 수 없습니다.", reason: "supersede-unavailable" },
          { status: 503 },
        )
      }
      // P2-9 "적용된 값을 한 번에 바꾸기" — id는 옛(대체될) 초안 id, body.newDraftId는 이미
      // checked로 만들어 둔 새 값 초안 id다. 두 동작(반전+적용)을 RPC 한 번(=DB 한 트랜잭션)
      // 으로 묶어 원자적으로 처리한다 — 서버는 절대 reverse/apply를 순차 호출하지 않는다.
      const newDraftId = raw.newDraftId
      if (typeof newDraftId !== "string" || !UUID_RE.test(newDraftId)) {
        return NextResponse.json({ error: "newDraftId must be a UUID string" }, { status: 400 })
      }
      const reason = optionalString(raw.reason)
      if (reason === null) return NextResponse.json({ error: "reason must be a string" }, { status: 400 })

      const draft = await supersedeBranchSalesLedgerEntry(id, newDraftId, actor, reason)
      if (!draft) {
        return NextResponse.json({ error: "적용값 대체에 실패했습니다." }, { status: 500 })
      }
      return NextResponse.json({ draft })
    }
    if (action !== "update") return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 })

    // "applied"로의 직접 전이는 전용 액션(action=apply)만 허용한다 — 이 거부를 파서 호출보다
    // 앞에 라우트 자신의 코드로 남겨 둔다(tests/api/branch-ledger-drafts-route.test.ts가 이
    // 라우트 소스에서 이 리터럴을 직접 스캔한다). 파서(parseLedgerDraftUpdateBody)도 동일 거부를
    // 자체적으로 갖고 있어 배치 라우트가 이 라우트를 거치지 않고도 같은 보호를 받는다.
    if (raw.status === "applied") {
      return NextResponse.json({ error: "Use action=apply to apply a checked draft" }, { status: 400 })
    }

    const parsed = parseLedgerDraftUpdateBody(raw)
    if (isLedgerDraftBodyError(parsed)) {
      return NextResponse.json({ error: parsed.error }, { status: parsed.status })
    }
    const update = parsed

    // 낙관적 잠금(웨이브7 I4, 선택): 전달하면 DB의 실제 updated_at과 비교해 CAS로 반영한다.
    // 생략하면 기존 무조건 덮어쓰기 동작과 동일(하위호환).
    if (raw.expectedUpdatedAt !== undefined && (typeof raw.expectedUpdatedAt !== "string" || !raw.expectedUpdatedAt.trim())) {
      return NextResponse.json({ error: "expectedUpdatedAt must be a non-empty string" }, { status: 400 })
    }
    const expectedUpdatedAt = typeof raw.expectedUpdatedAt === "string" ? raw.expectedUpdatedAt : undefined

    const result = await updateBranchSalesLedgerDraft(
      id,
      update,
      actor,
      expectedUpdatedAt ? { expectedUpdatedAt } : undefined,
    )

    if (result.outcome === "not-found") {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 })
    }
    if (result.outcome === "conflict") {
      return NextResponse.json(
        {
          error: "다른 곳에서 먼저 수정되었습니다. 최신 내용을 확인한 뒤 다시 시도하세요.",
          draft: result.draft,
        },
        { status: 409 },
      )
    }
    // 라운드4(P0-2) — 다른 사람이 자가 체크한 초안을 매트릭스 재편집이 조용히 덮어쓰지 않도록
    // 안내한다(repository의 updateBranchSalesLedgerDraft 참고).
    if (result.outcome === "checked-by-other") {
      return NextResponse.json(
        {
          error: "다른 사람이 체크한 초안입니다 — 체크 큐에서 체크를 해제한 뒤 수정하세요.",
          draft: result.draft,
          reason: "checked-by-other",
        },
        { status: 409 },
      )
    }
    return NextResponse.json({ draft: result.draft })
  } catch (error) {
    console.error(`[PATCH /api/admin/branch/ledger-drafts/${id}]`, error)
    return (
      notReadyResponse(error) ??
      duplicateActiveCorrectionResponse(error) ??
      nonPositiveAmountResponse(error) ??
      (action === "supersede" ? supersedeUnavailableResponse(error) : null) ??
      (action === "supersede" ? supersedeNotFoundResponse(error) : null) ??
      (action === "supersede" ? supersedeNotCheckedResponse(error) : null) ??
      (action === "supersede" ? supersedeTargetMismatchResponse(error) : null) ??
      NextResponse.json({ error: "Failed to update sales ledger draft" }, { status: 500 })
    )
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin
  const { id } = await params

  try {
    const deleted = await deleteBranchSalesLedgerDraft(id)
    if (!deleted) return NextResponse.json({ error: "Draft not found" }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    // 시트 쓰기 감사 행이 있는 초안(반영을 한 번이라도 시도 — 거절·실패 포함)은 감사 기록을 지키려고 하드 삭제를 막는다
    // (FK ON DELETE RESTRICT). 원인 없는 500 이 아니라 409 + 안내 — 큐는 그 초안을 취소(cancelled)로 정리한다.
    if (isBranchSalesLedgerDraftHasSheetWritesError(error)) {
      return NextResponse.json({ error: error.message, reason: "sheet-write-history" }, { status: 409 })
    }
    console.error(`[DELETE /api/admin/branch/ledger-drafts/${id}]`, error)
    return notReadyResponse(error) ?? NextResponse.json({ error: "Failed to delete sales ledger draft" }, { status: 500 })
  }
}
