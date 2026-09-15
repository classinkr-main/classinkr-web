import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { matchCaptureRows } from "@/lib/crm/capture/matching"
import { parseTabularGrid, parseUnstructuredLines, type ColumnMap } from "@/lib/crm/capture/parsers"
import { getCaptureBatchWithRows, replaceCaptureRows } from "@/lib/crm/capture/repository"
import { getCrmUnifiedCustomers, type CrmUnifiedCustomerRow } from "@/lib/repositories/crm-unified-customers"

export const dynamic = "force-dynamic"

// 감사 2026-09-07 §9 — getCrmUnifiedCustomers 자신의 주석("내부 일괄 매칭은 전체 고객 집합을
// 읽어야 한다")과 달리 limit이 함수 내부에서 2,000으로 clamp된다(lib/repositories/
// crm-unified-customers.ts:771, clampInteger(options.limit, 100, 1, 2_000)) — 그 파일은
// CRM 코어 소유라 이 저장소에서는 읽기만 허용된다. limit 인자를 아무리 키워도 소용없으므로,
// 이 라우트가 소유한 곳에서 offset 페이지를 이어 붙여 우회한다. 기반 스냅샷은 60초
// unstable_cache라 페이지를 여러 번 불러도 매번 leads/neo-accounts/portal을 다시 읽지 않는다.
const UNIFIED_CUSTOMER_PAGE_LIMIT = 2_000
// 페이지가 끝나지 않는 버그(예: nextOffset 계산 오류)로 무한 루프에 빠지지 않게 하는 안전판.
// 실제 고객 수보다 훨씬 큰 상한이라 정상 케이스에서는 절대 걸리지 않는다.
const UNIFIED_CUSTOMER_MAX_ROWS = 50_000

async function getAllUnifiedCustomersForMatching(): Promise<CrmUnifiedCustomerRow[]> {
  const all: CrmUnifiedCustomerRow[] = []
  let offset: number | null = 0
  while (offset !== null && all.length < UNIFIED_CUSTOMER_MAX_ROWS) {
    const page = await getCrmUnifiedCustomers({ limit: UNIFIED_CUSTOMER_PAGE_LIMIT, offset })
    all.push(...page.rows)
    offset = page.pagination.hasMore ? page.pagination.nextOffset : null
  }
  return all
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin
  const { id } = await params

  try {
    const loaded = await getCaptureBatchWithRows(id)
    if (!loaded) return NextResponse.json({ error: "Batch not found" }, { status: 404 })
    const { batch, rows: existingRows } = loaded
    if (batch.status === "applied" || batch.status === "canceled") {
      return NextResponse.json({ error: "이미 적용되었거나 취소된 배치는 다시 파싱할 수 없습니다." }, { status: 409 })
    }
    if (existingRows.some((row) => row.applyStatus === "applied" || row.createdEventId || row.createdTaskId || row.createdLeadId)) {
      return NextResponse.json(
        { error: "이미 일부 적용된 배치는 다시 파싱할 수 없습니다. 남은 행을 이어서 검토하세요." },
        { status: 409 }
      )
    }

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    const rawInput = typeof (body as Record<string, unknown>).raw === "string" ? ((body as Record<string, unknown>).raw as string) : ""
    if (!rawInput.trim()) return NextResponse.json({ error: "입력 텍스트가 비어 있습니다." }, { status: 400 })

    const mode = (body as Record<string, unknown>).mode === "text" ? "text" : "table"
    const hasHeader = typeof (body as Record<string, unknown>).hasHeader === "boolean" ? ((body as Record<string, unknown>).hasHeader as boolean) : undefined
    const mapping = Array.isArray((body as Record<string, unknown>).mapping) ? ((body as Record<string, unknown>).mapping as ColumnMap) : undefined

    const parsed = mode === "text" ? parseUnstructuredLines(rawInput) : parseTabularGrid(rawInput, { hasHeader, mapping }).rows
    if (parsed.length === 0) return NextResponse.json({ error: "해석된 행이 없습니다." }, { status: 400 })
    if (parsed.length > 2_000) {
      return NextResponse.json({ error: "한 번에 최대 2,000행까지 분석할 수 있습니다." }, { status: 413 })
    }

    const customerRows = await getAllUnifiedCustomersForMatching()
    const matched = matchCaptureRows(parsed, customerRows)
    const rows = await replaceCaptureRows(batch, matched)

    const refreshed = await getCaptureBatchWithRows(id)
    return NextResponse.json({ batch: refreshed?.batch ?? batch, rows })
  } catch (error) {
    console.error(`[POST /api/admin/crm/capture/batches/${id}/parse]`, error)
    return NextResponse.json({ error: "Failed to parse capture batch" }, { status: 500 })
  }
}
