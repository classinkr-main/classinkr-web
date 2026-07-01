import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import {
  applyBranchSalesLedgerDraft,
  BRANCH_SALES_LEDGER_DRAFT_KINDS,
  BRANCH_SALES_LEDGER_DRAFT_STATUSES,
  deleteBranchSalesLedgerDraft,
  isBranchSalesLedgerDraftsNotReadyError,
  updateBranchSalesLedgerDraft,
  type BranchSalesLedgerDraftKind,
  type BranchSalesLedgerDraftStatus,
  type BranchSalesLedgerDraftUpdateInput,
} from "@/lib/repositories/branch-sales-ledger-drafts"

const KINDS = new Set<string>(BRANCH_SALES_LEDGER_DRAFT_KINDS)
const STATUSES = new Set<string>(BRANCH_SALES_LEDGER_DRAFT_STATUSES)
const MONTH_RE = /^\d{4}-\d{2}$/

function adminActorName(admin: { name?: string; userId?: string; role: string }) {
  return admin.name?.trim() || admin.userId || admin.role
}

function optionalString(value: unknown) {
  if (value == null) return undefined
  return typeof value === "string" ? value : null
}

function optionalAmount(value: unknown) {
  if (value === undefined) return undefined
  if (value == null || value === "") return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function optionalInteger(value: unknown) {
  if (value === undefined) return undefined
  if (value == null || value === "") return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.floor(numeric) : null
}

function optionalRecord(value: unknown) {
  if (value === undefined) return undefined
  if (value == null) return null
  return typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function notReadyResponse(error: unknown) {
  if (isBranchSalesLedgerDraftsNotReadyError(error)) {
    return NextResponse.json({ error: (error as Error).message }, { status: 503 })
  }
  return null
}

function parseUpdate(raw: Record<string, unknown>): BranchSalesLedgerDraftUpdateInput | NextResponse {
  const update: BranchSalesLedgerDraftUpdateInput = {}

  if (raw.kind !== undefined) {
    if (typeof raw.kind !== "string" || !KINDS.has(raw.kind)) return NextResponse.json({ error: "Invalid draft kind" }, { status: 400 })
    update.kind = raw.kind as BranchSalesLedgerDraftKind
  }

  if (raw.status !== undefined) {
    if (typeof raw.status !== "string" || !STATUSES.has(raw.status)) return NextResponse.json({ error: "Invalid draft status" }, { status: 400 })
    if (raw.status === "applied") return NextResponse.json({ error: "Use action=apply to apply a checked draft" }, { status: 400 })
    update.status = raw.status as BranchSalesLedgerDraftStatus
  }

  if (raw.sourceDealId !== undefined) update.sourceDealId = optionalString(raw.sourceDealId)
  if (raw.sourceSheetRow !== undefined) {
    const sourceSheetRow = optionalInteger(raw.sourceSheetRow)
    if (sourceSheetRow === undefined) return NextResponse.json({ error: "sourceSheetRow must be a number" }, { status: 400 })
    update.sourceSheetRow = sourceSheetRow
  }
  if (raw.sourceSnapshot !== undefined) {
    const sourceSnapshot = optionalRecord(raw.sourceSnapshot)
    if (sourceSnapshot === null) return NextResponse.json({ error: "sourceSnapshot must be an object" }, { status: 400 })
    update.sourceSnapshot = sourceSnapshot
  }
  if (raw.customer !== undefined) {
    if (typeof raw.customer !== "string" || !raw.customer.trim()) return NextResponse.json({ error: "고객/계정명은 필수입니다." }, { status: 400 })
    update.customer = raw.customer.trim()
  }
  if (raw.manager !== undefined) update.manager = optionalString(raw.manager)
  if (raw.team !== undefined) update.team = optionalString(raw.team)
  if (raw.month !== undefined) {
    if (typeof raw.month !== "string" || !MONTH_RE.test(raw.month)) return NextResponse.json({ error: "월은 YYYY-MM 형식이어야 합니다." }, { status: 400 })
    update.month = raw.month
  }
  if (raw.amount !== undefined) {
    const amount = optionalAmount(raw.amount)
    if (amount == null) return NextResponse.json({ error: "금액은 숫자여야 합니다." }, { status: 400 })
    update.amount = amount
  }
  if (raw.currency !== undefined) update.currency = optionalString(raw.currency)
  if (raw.note !== undefined) update.note = optionalString(raw.note)
  if (raw.metadata !== undefined) {
    const metadata = optionalRecord(raw.metadata)
    if (metadata === null) return NextResponse.json({ error: "metadata must be an object" }, { status: 400 })
    update.metadata = metadata
  }

  return update
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
    if (action !== "update") return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 })

    const update = parseUpdate(raw)
    if (update instanceof NextResponse) return update

    const draft = await updateBranchSalesLedgerDraft(id, update, actor)
    if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 })
    return NextResponse.json({ draft })
  } catch (error) {
    console.error(`[PATCH /api/admin/branch/ledger-drafts/${id}]`, error)
    return notReadyResponse(error) ?? NextResponse.json({ error: "Failed to update sales ledger draft" }, { status: 500 })
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
