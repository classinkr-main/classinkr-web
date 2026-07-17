import { NextRequest, NextResponse } from "next/server"

import { adminCachedJson } from "@/lib/admin-api-response"
import { BRANCH_READ_ADMIN_API_ROLES, CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import {
  BRANCH_SALES_LEDGER_DRAFT_KINDS,
  BRANCH_SALES_LEDGER_DRAFT_STATUSES,
  createBranchSalesLedgerDraft,
  isBranchSalesLedgerDraftsNotReadyError,
  listBranchSalesLedgerDrafts,
  listBranchSalesLedgerEntries,
  type BranchSalesLedgerDraftKind,
  type BranchSalesLedgerDraftStatus,
} from "@/lib/repositories/branch-sales-ledger-drafts"

const KINDS = new Set<string>(BRANCH_SALES_LEDGER_DRAFT_KINDS)
const STATUSES = new Set<string>(BRANCH_SALES_LEDGER_DRAFT_STATUSES)
const MONTH_RE = /^\d{4}-\d{2}$/

function adminActorName(admin: { name?: string; userId?: string; role: string }) {
  return admin.name?.trim() || admin.userId || admin.role
}

function parseBoundedInt(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(Math.floor(parsed), max))
}

function optionalString(value: unknown) {
  if (value == null) return undefined
  return typeof value === "string" ? value : null
}

function optionalRecord(value: unknown) {
  if (value == null) return undefined
  return typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function optionalInteger(value: unknown) {
  if (value == null || value === "") return undefined
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.floor(numeric) : null
}

function requiredAmount(value: unknown) {
  if (value == null || value === "") return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function notReadyResponse(error: unknown) {
  if (isBranchSalesLedgerDraftsNotReadyError(error)) {
    return NextResponse.json({ error: (error as Error).message }, { status: 503 })
  }
  return null
}

export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, BRANCH_READ_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    const url = new URL(req.url)
    const statusParam = url.searchParams.get("status")
    const status: BranchSalesLedgerDraftStatus | "all" =
      statusParam && STATUSES.has(statusParam) ? (statusParam as BranchSalesLedgerDraftStatus) : "all"
    const limit = parseBoundedInt(url.searchParams.get("limit"), 50, 1, 200)
    // 되돌리기 부활 버그(P0) 수정: 이 GET은 entries에 active만 담아 내려주므로(레포지토리 기본
    // 필터), 상쇄(reversed)된 draft_id를 클라가 알 방법이 없었다 — reversedDraftIds는 클라
    // useState(new Set())라 새로고침/재마운트마다 비워지고, entries 목록에서도 사라진 항목은
    // "아직 동기화 안 된 신규 적용"으로 오인돼 되살아났다. reversed 항목을 별도(status:"reversed")로
    // 200 한도까지 조회해 draft_id 목록을 함께 내려준다 — active 조회와 합쳐서 하나의 200 한도로
    // 자르면 reversed가 밀려날 수 있어 반드시 별도 조회+별도 한도를 쓴다.
    const [draftResult, entryResult, reversedEntryResult] = await Promise.all([
      listBranchSalesLedgerDrafts({ status, limit }),
      listBranchSalesLedgerEntries({ limit: 200 }),
      listBranchSalesLedgerEntries({ status: "reversed", limit: 200 }),
    ])

    const reversedDraftIds = Array.from(
      new Set(
        reversedEntryResult.entries
          .map((entry) => entry.draftId)
          .filter((draftId): draftId is string => Boolean(draftId)),
      ),
    )

    return adminCachedJson({
      ...draftResult,
      entries: entryResult.entries,
      ledgerHealth: entryResult.health,
      reversedDraftIds,
    })
  } catch (error) {
    console.error("[GET /api/admin/branch/ledger-drafts]", error)
    return NextResponse.json({ error: "Failed to load sales ledger drafts" }, { status: 500 })
  }
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
    const kind = typeof raw.kind === "string" && KINDS.has(raw.kind) ? (raw.kind as BranchSalesLedgerDraftKind) : null
    const customer = typeof raw.customer === "string" ? raw.customer.trim() : ""
    const month = typeof raw.month === "string" && MONTH_RE.test(raw.month) ? raw.month : null
    const amount = requiredAmount(raw.amount)
    const metadata = optionalRecord(raw.metadata)
    const sourceSheetRow = optionalInteger(raw.sourceSheetRow)
    const sourceSnapshot = optionalRecord(raw.sourceSnapshot)

    if (!kind) return NextResponse.json({ error: "Invalid draft kind" }, { status: 400 })
    if (!customer) return NextResponse.json({ error: "고객/계정명은 필수입니다." }, { status: 400 })
    if (!month) return NextResponse.json({ error: "월은 YYYY-MM 형식이어야 합니다." }, { status: 400 })
    if (amount == null) return NextResponse.json({ error: "금액은 숫자여야 합니다." }, { status: 400 })
    // 웨이브7(I5): 감액은 amount를 음수/0으로 넣는 게 아니라 장부 가감(반전 후 재적용)으로
    // 표현한다 — admin API를 통한 인간 입력은 항상 양수만 받는다(시스템 자동 제안의 0원
    // 플레이스홀더는 repository를 직접 호출해 이 경로를 거치지 않는다).
    if (amount <= 0) {
      return NextResponse.json(
        { error: "감액은 장부 가감으로 처리하세요. 금액은 0보다 커야 합니다." },
        { status: 400 },
      )
    }
    if (metadata === null) return NextResponse.json({ error: "metadata must be an object" }, { status: 400 })
    if (sourceSheetRow === null) return NextResponse.json({ error: "sourceSheetRow must be a number" }, { status: 400 })
    if (sourceSnapshot === null) return NextResponse.json({ error: "sourceSnapshot must be an object" }, { status: 400 })

    const draft = await createBranchSalesLedgerDraft({
      kind,
      sourceDealId: optionalString(raw.sourceDealId),
      sourceSheetRow,
      sourceSnapshot,
      customer,
      manager: optionalString(raw.manager),
      team: optionalString(raw.team),
      month,
      amount,
      currency: optionalString(raw.currency),
      note: optionalString(raw.note),
      metadata,
    }, actor)

    return NextResponse.json({ draft }, { status: 201 })
  } catch (error) {
    console.error("[POST /api/admin/branch/ledger-drafts]", error)
    return notReadyResponse(error) ?? NextResponse.json({ error: "Failed to create sales ledger draft" }, { status: 500 })
  }
}
