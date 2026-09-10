import { NextRequest, NextResponse } from "next/server"
import { unstable_cache } from "next/cache"
import { shareInFlightByArgs } from "@/lib/server/share-in-flight"
import { BRANCH_READ_ADMIN_API_ROLES, verifyAdmin } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { listHwInbound, listHwOutbound, listHwStock, BRANCH_HW_CACHE_TAG } from "@/lib/repositories/branch-hw"
import { getHardwareDashboard, HARDWARE_INVENTORY_CACHE_TAG } from "@/lib/repositories/hardware-inventory"

// 재고 SSOT = 입출고 원장(hardware_movements, /admin/hardware 콘솔과 동일 소스) —
// 2026-07-10 운영 결정(마스터플랜 §7 / money-mesh §2.4). 시트 스테이징(branch_hw_*)은
// 임포트 버퍼로 강등: sheet_stock 참고 표기용으로만 남기고, 원장이 비어 있는 환경
// (마이그레이션/임포트 전)에서만 기존 스테이징 계산으로 통째 폴백한다.
const HW_PATTERNS: Array<{ key: string; match: RegExp; threshold: number; thresholdSheet: number }> = [
  { key: "IFP86",  match: /86[""]?\s*IFP/i, threshold: 2, thresholdSheet: 5 },
  { key: "IFP75",  match: /75[""]?\s*IFP/i, threshold: 2, thresholdSheet: 5 },
  { key: "IFP65",  match: /65[""]?\s*IFP/i, threshold: 1, thresholdSheet: 3 },
  { key: "T1",     match: /\bT1\b/i, threshold: 2, thresholdSheet: 5 },
  { key: "S1",     match: /\bS1\b/i, threshold: 2, thresholdSheet: 5 },
  { key: "STD1",   match: /\bSTD1\b/i, threshold: 2, thresholdSheet: 5 },
  { key: "OPS",    match: /\bOPS\b/i, threshold: 5, thresholdSheet: 5 },
]

/**
 * 콜드 Fluid 인스턴스 재계산 방지 — 4개 소스(listHwInbound/listHwOutbound/listHwStock/
 * getHardwareDashboard)는 이미 각자 unstable_cache지만, 이 조립(패턴별 재고 매핑·설치 최근
 * 내역 도출)엔 캐시가 없어 소스가 전부 히트여도 4개 소스 각각의 캐시 조회 왕복 + CPU
 * 재계산이 매 요청 겹쳤다. 이 라우트는 쿼리 파라미터가 없어 인자·캐시 키도 고정이다.
 * 태그는 새로 만들지 않고 하위 소스가 이미 쓰는 두 태그를 재사용한다 — 시트 스테이징
 * 재동기화(app/api/admin/branch/sync)나 원장 쓰기(하드웨어 콘솔 6경로) 중 무엇이 일어나도
 * 이 조립 캐시가 함께 무효화된다.
 */
async function assembleBranchHwPayload() {
  const [inbound, outbound, stock, ledger] = await Promise.all([
    listHwInbound(), listHwOutbound(), listHwStock(),
    getHardwareDashboard().catch(() => null),
  ])
  const ledgerRows = ledger?.stock ?? []
  const ledgerReady = ledgerRows.length > 0

  // 출고 시트의 "예정" 행(배송 예정 등)은 아직 창고에 있는 물량이다.
  // 실재고 = 입고 − 완료된 출고, 가용 재고 = 실재고 − 출고 예정. (원장·스테이징 공통 정의)
  const isPlannedOutbound = (progress: string | null) => (progress ?? "").includes("예정")
  const stockByPattern = HW_PATTERNS.map((p) => {
    const fromSheet = stock.filter((r) => p.match.test(r.product)).reduce((s, r) => s + r.quantity, 0)

    if (ledgerReady) {
      // 원장 SSOT: 하드웨어 콘솔과 동일한 수치·low 정책(reorder point 기반)을 그대로 쓴다.
      const rows = ledgerRows.filter((r) => p.match.test(r.product))
      const io = rows.reduce((s, r) => s + r.warehouseStock, 0)
      const plannedOut = rows.reduce((s, r) => s + r.plannedOut, 0)
      const available = rows.reduce((s, r) => s + r.availableStock, 0)
      return {
        product: p.key,
        io_stock: io,
        planned_out: plannedOut,
        available_stock: available,
        sheet_stock: fromSheet,
        low: rows.some((r) => r.low) || (rows.length === 0 && fromSheet <= p.thresholdSheet),
      }
    }

    // 폴백(원장 미구축 환경): 기존 스테이징 계산 유지.
    const inboundRows = inbound.filter((r) => p.match.test(r.product))
    const outboundRows = outbound.filter((r) => p.match.test(r.product))
    const inSum = inboundRows.reduce((s, r) => s + r.quantity, 0)
    const outSum = outboundRows.filter((r) => !isPlannedOutbound(r.progress)).reduce((s, r) => s + r.quantity, 0)
    const plannedOut = outboundRows.filter((r) => isPlannedOutbound(r.progress)).reduce((s, r) => s + r.quantity, 0)
    const fromIO = inSum - outSum
    const available = fromIO - plannedOut
    const hasIoLedger = inboundRows.length > 0 || outboundRows.length > 0
    return {
      product: p.key,
      io_stock: fromIO,
      planned_out: plannedOut,
      available_stock: available,
      sheet_stock: fromSheet,
      low: (hasIoLedger && available <= p.threshold) || fromSheet <= p.thresholdSheet,
    }
  })
  const installRows = outbound.filter((r) => (r.progress ?? "").includes("설치"))
  const byCustomer = new Map<string, { quantity: number; latest: string | null }>()
  for (const r of installRows) {
    const customer = (r.destination ?? "").trim()
    if (!customer) continue
    const cur = byCustomer.get(customer) ?? { quantity: 0, latest: null }
    cur.quantity += r.quantity
    if (r.outbound_date && (!cur.latest || r.outbound_date > cur.latest)) cur.latest = r.outbound_date
    byCustomer.set(customer, cur)
  }
  const recent_installs = Array.from(byCustomer.entries())
    .map(([customer, v]) => ({ customer, quantity: v.quantity, date: v.latest }))
    .sort((a, b) => {
      if (a.date && b.date) return b.date.localeCompare(a.date)
      if (a.date) return -1
      if (b.date) return 1
      return b.quantity - a.quantity
    })
    .slice(0, 8)
  return {
    stock: stockByPattern,
    recent_installs,
    // 위젯·감사용: 이 응답의 재고가 어느 원천에서 나왔는지 명시.
    source: ledgerReady ? "ledger" : "sheet_staging",
  }
}

const getCachedBranchHwPayload = unstable_cache(
  // 같은 인스턴스의 동시 미스·재검증은 shareInFlightByArgs 로 한 번만 계산한다(unstable_cache 는 인스턴스 안 동시 호출을 합치지 않는다).
  shareInFlightByArgs("branch-hw-assembled-v1", assembleBranchHwPayload),
  ["branch-hw-assembled-v1"],
  { revalidate: 60, tags: [BRANCH_HW_CACHE_TAG, HARDWARE_INVENTORY_CACHE_TAG] },
)

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req, BRANCH_READ_ADMIN_API_ROLES); if (err) return err
  try {
    return adminCachedJson(await getCachedBranchHwPayload())
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
