import { NextRequest, NextResponse } from "next/server"

import { STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { logAdminAudit } from "@/lib/auth/audit"
import { csvFileName } from "@/lib/crm/csv"
import { parseUnifiedQueryOptions } from "@/lib/crm/unified-query-options"
import {
  CRM_UNIFIED_EXPORT_MAX_ROWS,
  getCrmUnifiedCustomersForExport,
} from "@/lib/repositories/crm-unified-customers"

import { buildUnifiedCustomersCsv } from "./unified-customers-csv"

// GET /api/admin/crm/customers/export — 통합 고객 목록의 "현재 조건 전체"를 CSV 로 내려준다(SG8).
//
// 쿼리: 통합 목록(GET /api/admin/crm/customers/unified)과 같은 파라미터를 같은 파서로 읽는다 —
//   q · source · lifecycle · view · owner(__me 포함) · tag · includeUnconfirmed · 세그먼트 조건
//   (expDays · depDays · noContactDays · minBalanceCny · kinds · risk · billing · owners · regions ·
//   tagsAll · tagsAny + OR 그룹 `or` — 세그먼트 허브) · sort · dir. limit/offset 은 받지 않는다(페이지가 아니라
//   조건 전체). 파서는 lib/crm/unified-query-options.ts 하나(통합 목록·대상 미리보기와 공용).
//   keys(반복 또는 쉼표) — 선택한 행만(현재 조건과 AND, 최대 500).
// 상한: CRM_UNIFIED_EXPORT_MAX_ROWS(5,000)행. 넘으면 앞 5,000행(목록과 같은 정렬)만 싣고 응답 헤더
//   X-Export-Truncated: 1 · X-Export-Total: 전체 건수로 알린다(화면이 "N명 중 5,000명만" 안내).
// 역할: SUPER_ADMIN · ADMIN 만 — 연락처 원문이 포함된 개인정보 파일이다(리드 보드 CSV 와 같은 수준,
//   메모·기록 본문 제외). 내보낼 때마다 감사 로그(crm.customers.export)를 남긴다.

const MAX_SELECTED_KEYS = 500

function parseKeys(searchParams: URLSearchParams): string[] | undefined {
  const values = searchParams
    .getAll("keys")
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean)
  if (values.length === 0) return undefined
  return [...new Set(values)].slice(0, MAX_SELECTED_KEYS)
}

export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    const url = new URL(req.url)
    const keys = parseKeys(url.searchParams)

    const result = await getCrmUnifiedCustomersForExport(
      { ...(await parseUnifiedQueryOptions(url.searchParams, admin)), keys },
      CRM_UNIFIED_EXPORT_MAX_ROWS
    )

    const now = new Date(result.generatedAt)
    const csv = buildUnifiedCustomersCsv(result.rows, now.getTime())
    const fileName = csvFileName(keys ? "crm-customers-selected" : "crm-customers", now)

    // 개인정보 파일 반출 흔적 — 조건·건수만 남기고 행 내용은 남기지 않는다. 실패해도 내보내기는 막지 않는다.
    await logAdminAudit({
      admin,
      action: "crm.customers.export",
      targetType: "crm_customer",
      payload: {
        rows: result.rows.length,
        total: result.total,
        truncated: result.truncated,
        selected: keys?.length ?? 0,
        view: url.searchParams.get("view") ?? "all",
        conditions: result.segmentLabels,
      },
    })

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
        "X-Export-Total": String(result.total),
        "X-Export-Rows": String(result.rows.length),
        "X-Export-Limit": String(result.limit),
        "X-Export-Truncated": result.truncated ? "1" : "0",
        "X-Export-Compass": result.meta.compass,
      },
    })
  } catch (error) {
    console.error("[GET /api/admin/crm/customers/export]", error)
    return NextResponse.json({ error: "고객 목록 CSV를 만들지 못했습니다." }, { status: 500 })
  }
}
