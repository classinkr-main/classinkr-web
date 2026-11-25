import "server-only"

import { unstable_cache } from "next/cache"

import { readRevDealsPreferActiveWithSource } from "@/lib/branch/read-rev-deals"
import { HARDWARE_INVENTORY_CACHE_TAG } from "@/lib/repositories/hardware-inventory"
import {
  classifySalesDashboardMovement,
  currentSalesFy,
  listSalesDashboardItems,
  listSalesDashboardMovements,
} from "@/lib/repositories/hardware-sales-dashboard"
import {
  koreaYm,
  summarizeCumulativeCustomers,
  summarizeCumulativeUnits,
  type CumulativeCustomersData,
  type CumulativeSection,
  type CumulativeUnitMovementInput,
  type CumulativeUnitsData,
  type OverviewCumulativeSummary,
} from "./cumulative-summary"

// 누적 고객 — REV 장부(액티브 임포트 우선, 없으면 시트 미러). 이번 회계연도 장부 하나를 읽는다:
// 장부가 회계연도마다 하나라, 그 해 장부에 남지 않은 과거 기관은 셀 수 없다(화면에 "FY 장부 기준"으로 밝힌다).
async function loadCustomers(now: Date): Promise<CumulativeSection<CumulativeCustomersData>> {
  const fiscalYear = currentSalesFy(now)
  const { deals, source } = await readRevDealsPreferActiveWithSource(fiscalYear)
  return {
    status: "ready",
    data: summarizeCumulativeCustomers(deals, now, fiscalYear),
    asOf: source.asOf,
    sourceKind: source.kind,
  }
}

// 누적 판매 — 하드웨어 재고 원장 전량을 판매대시보드 규칙(D10)으로 분류한 뒤 전자칠판 묶음만 남긴다.
async function computeUnits(currentYm: string): Promise<CumulativeUnitsData> {
  const [movements, items] = await Promise.all([listSalesDashboardMovements(), listSalesDashboardItems()])
  const boardItemIds = new Set(items.filter((item) => item.report_group === "board").map((item) => item.id))
  const rows: CumulativeUnitMovementInput[] = []
  for (const movement of movements) {
    if (!movement.item_id || !boardItemIds.has(movement.item_id)) continue
    const kind = classifySalesDashboardMovement(movement)
    if (!kind) continue
    rows.push({ kind, quantity: movement.quantity, occurred_at: movement.occurred_at })
  }
  // currentYm 은 캐시 키 — 달이 바뀌면 새로 센다. 같은 달 안의 "now"는 월 단위 집계에 영향이 없다.
  const [year, month] = currentYm.split("-").map(Number)
  return summarizeCumulativeUnits(rows, new Date(Date.UTC(year, month - 1, 15)))
}

// 원장 쓰기 경로가 HARDWARE_INVENTORY_CACHE_TAG 를 무효화하므로 출고 기록 직후에도 맞는다.
const computeUnitsCached = unstable_cache(computeUnits, ["overview-cumulative-units-v1"], {
  tags: [HARDWARE_INVENTORY_CACHE_TAG],
  revalidate: 300,
})

async function loadUnits(now: Date): Promise<CumulativeSection<CumulativeUnitsData>> {
  return { status: "ready", data: await computeUnitsCached(koreaYm(now)), asOf: null }
}

/** 원천별로 실패를 격리한다 — 한쪽이 실패해도 다른 쪽은 ready로 내려간다. 실패를 0으로 바꾸지 않는다. */
export async function getOverviewCumulative(now = new Date()): Promise<OverviewCumulativeSummary> {
  const [customers, units] = await Promise.allSettled([loadCustomers(now), loadUnits(now)])
  if (customers.status === "rejected") console.error("[overview/cumulative] customers", customers.reason)
  if (units.status === "rejected") console.error("[overview/cumulative] units", units.reason)
  return {
    generatedAt: now.toISOString(),
    customers: customers.status === "fulfilled" ? customers.value : { status: "error", data: null },
    units: units.status === "fulfilled" ? units.value : { status: "error", data: null },
  }
}
