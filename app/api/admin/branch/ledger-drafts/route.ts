import { NextRequest, NextResponse } from "next/server"

import { adminCachedJson } from "@/lib/admin-api-response"
import { BRANCH_READ_ADMIN_API_ROLES, CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { isLedgerDraftBodyError, parseLedgerDraftCreateBody } from "@/lib/branch/ledger-draft-body"
import {
  BRANCH_SALES_LEDGER_DRAFT_STATUSES,
  createBranchSalesLedgerDraft,
  isBranchSalesLedgerDraftsNotReadyError,
  listBranchSalesLedgerDrafts,
  listBranchSalesLedgerEntries,
  probeSupersedeAvailable,
  type BranchSalesLedgerDraftStatus,
} from "@/lib/repositories/branch-sales-ledger-drafts"

const STATUSES = new Set<string>(BRANCH_SALES_LEDGER_DRAFT_STATUSES)

function adminActorName(admin: { name?: string; userId?: string; role: string }) {
  return admin.name?.trim() || admin.userId || admin.role
}

function parseBoundedInt(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(Math.floor(parsed), max))
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
    // P2-9 — capabilities.supersede: probeSupersedeAvailable()가 실패해도(네트워크 등) GET
    // 전체는 계속 성공해야 한다. Promise.all 자체는 그대로 쓰되(병렬 조회는 유지) 이 프로브
    // 호출에만 .catch(() => false)를 걸어 강등한다 — 나머지 두 목록 조회는 지금처럼 실패 시
    // 그대로 던져 500이 나야 하지만, 이 프로브의 실패는 GET 자체를 막을 이유가 없다.
    const [draftResult, entryResult, reversedEntryResult, supersedeAvailable] = await Promise.all([
      listBranchSalesLedgerDrafts({ status, limit }),
      listBranchSalesLedgerEntries({ limit: 200 }),
      listBranchSalesLedgerEntries({ status: "reversed", limit: 200 }),
      probeSupersedeAvailable().catch(() => false),
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
      capabilities: { supersede: supersedeAvailable },
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
    // 라운드4(P0-1) — 검증 순서·문구는 lib/branch/ledger-draft-body.ts로 옮겨졌고, 배치 라우트
    // (app/api/admin/branch/ledger-drafts/batch)도 같은 파서를 쓴다. 응답은 기존과 바이트 단위로
    // 동일하다(tests/api/branch-ledger-drafts-route.test.ts 회귀 보호).
    const parsed = parseLedgerDraftCreateBody(raw)
    if (isLedgerDraftBodyError(parsed)) {
      return NextResponse.json({ error: parsed.error }, { status: parsed.status })
    }

    const { draft, dedupedRecent } = await createBranchSalesLedgerDraft(parsed, actor)

    // dedupedRecent=true: 직전 60초 내 동일 입력의 열린 초안을 그대로 돌려준 것(더블클릭/더블탭
    // 방어, 웨이브7 I1) — 새 리소스를 만들지 않았으므로 201이 아니라 200으로 응답한다.
    return NextResponse.json({ draft, dedupedRecent }, { status: dedupedRecent ? 200 : 201 })
  } catch (error) {
    console.error("[POST /api/admin/branch/ledger-drafts]", error)
    return notReadyResponse(error) ?? NextResponse.json({ error: "Failed to create sales ledger draft" }, { status: 500 })
  }
}
