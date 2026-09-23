import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { isLedgerDraftBodyError, parseLedgerDraftUpdateBody } from "@/lib/branch/ledger-draft-body"
import {
  applyBranchSalesLedgerDraft,
  deleteBranchSalesLedgerDraft,
  isBranchSalesLedgerDraftsNotReadyError,
  isBranchSalesLedgerDuplicateActiveCorrectionError,
  isBranchSalesLedgerNonPositiveAmountError,
  reverseBranchSalesLedgerEntryByDraftId,
  updateBranchSalesLedgerDraft,
} from "@/lib/repositories/branch-sales-ledger-drafts"

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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin
  const actor = adminActorName(admin)
  const { id } = await params

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    const raw = body as Record<string, unknown>
    const action = typeof raw.action === "string" ? raw.action : "update"

    if (action === "apply") {
      const draft = await applyBranchSalesLedgerDraft(id, actor)
      if (!draft) {
        return NextResponse.json({ error: "체크 완료 초안만 적용할 수 있습니다." }, { status: 409 })
      }
      return NextResponse.json({ draft })
    }
    if (action === "reverse") {
      // id는 draft id다(기존 apply와 동일 계약) — draft_id로 연결된 내부 원장 entry를 찾아
      // active->reversed로 상쇄한다. draft.status 자체는 건드리지 않는다(감사 추적 보존).
      const reason = optionalString(raw.reason)
      if (reason === null) return NextResponse.json({ error: "reason must be a string" }, { status: 400 })

      const entry = await reverseBranchSalesLedgerEntryByDraftId(id, actor, reason)
      if (!entry) {
        return NextResponse.json({ error: "해당 초안에 연결된 적용 항목을 찾을 수 없습니다." }, { status: 404 })
      }
      return NextResponse.json({ entry })
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
    console.error(`[DELETE /api/admin/branch/ledger-drafts/${id}]`, error)
    return notReadyResponse(error) ?? NextResponse.json({ error: "Failed to delete sales ledger draft" }, { status: 500 })
  }
}
