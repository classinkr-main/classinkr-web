import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { convertLeadToCrm, type LeadConversionFailureCode } from "@/lib/crm/lead-conversion"

/**
 * 단체 전환 — 리드 여러 건을 CRM 고객·거래로 한 번에 올린다.
 *
 * 한 요청의 상한을 25건으로 낮게 잡았다. 전환 1건은 고객 조회·생성, 딜 생성, 활동 로그,
 * 소스 링크까지 대여섯 번의 DB 왕복을 하므로 수백 건을 한 요청에 넣으면 함수 실행 시간
 * 한도에 걸려 "어디까지 갔는지 모르는 실패"가 된다. 클라이언트가 선택분을 25건씩 끊어
 * 반복 호출하며 진행률을 보여주는 쪽이 중단·재시도 모두 안전하다.
 */
const MAX_BULK_CONVERT = 25

/** 전환은 순차로 돈다 — 첫 건이 "Classin Direct Sales" 파트너 계정을 만들고 나면 뒤 건들이
 *  그것을 재사용한다. 병렬로 쏘면 같은 계정을 동시에 만들어 중복 행이 생길 수 있다. */
export async function POST(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const body = await req.json().catch(() => null)
  const rawIds = (body as { ids?: unknown } | null)?.ids
  if (!Array.isArray(rawIds)) {
    return NextResponse.json({ error: "전환할 리드 ID 목록이 필요합니다." }, { status: 400 })
  }

  const ids = Array.from(
    new Set(rawIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0))
  )
  if (ids.length === 0) {
    return NextResponse.json({ error: "전환할 리드가 없습니다." }, { status: 400 })
  }
  if (ids.length > MAX_BULK_CONVERT) {
    return NextResponse.json(
      { error: `한 번에 전환할 수 있는 리드는 최대 ${MAX_BULK_CONVERT}건입니다.`, limit: MAX_BULK_CONVERT },
      { status: 400 }
    )
  }

  type BulkConvertRow = {
    leadId: string
    ok: boolean
    /** 실패 사유 — 이미 전환됨/없음(정상 거절)과 error(사고)를 구분한다. */
    code?: LeadConversionFailureCode | "error"
    error?: string
    customerId?: string
    customerName?: string
    dealId?: string
    dealCode?: string | null
    /** 전환 직후 이동 링크 — 성공 행을 바로 눌러 들어갈 수 있게 한다. */
    dealUrl?: string
    customerUrl?: string
  }

  const results: BulkConvertRow[] = []
  for (const leadId of ids) {
    try {
      const result = await convertLeadToCrm(leadId, { userId: admin.userId, role: admin.role })
      if (!result.ok) {
        results.push({ leadId, ok: false, code: result.code, error: result.error })
        continue
      }
      results.push({
        leadId,
        ok: true,
        customerId: result.customer.id,
        customerName: result.customer.name,
        dealId: result.deal.id,
        dealCode: result.deal.deal_code ?? null,
        dealUrl: result.links.deal,
        customerUrl: result.links.customer,
      })
    } catch (error) {
      // 한 건의 사고가 나머지 전환을 막지 않는다 — 실패 행만 사유와 함께 남긴다.
      console.error("[POST /api/admin/leads/bulk-convert]", leadId, error)
      results.push({
        leadId,
        ok: false,
        code: "error",
        error: error instanceof Error ? error.message : "리드를 CRM으로 전환하지 못했습니다.",
      })
    }
  }

  const converted = results.filter((row) => row.ok).length
  // 이미 전환됐거나 사라진 리드는 "실패"가 아니라 건너뜀 — 재시도해도 결과가 같다.
  const skipped = results.filter(
    (row) => !row.ok && (row.code === "already_converted" || row.code === "not_found")
  ).length

  return NextResponse.json({
    requested: ids.length,
    converted,
    skipped,
    failed: results.length - converted - skipped,
    results,
  })
}
