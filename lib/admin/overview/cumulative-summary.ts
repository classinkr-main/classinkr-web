// Overview 히어로 "누적 고객 · 누적 판매" 순수 집계 — DB 없이 테스트한다.
//
// 두 숫자는 원천이 다르다(REV 장부 / 하드웨어 재고 원장). 서로 더하거나 나누지 않고, 한쪽 조회가
// 실패해도 다른 쪽은 그대로 보여 준다(lib/admin/overview/cumulative.ts가 원천별로 격리한다).
// 정의 정본: docs/active/admin-overview-workspace.md "누적 지표".

import { normalizedAccountKey } from "@/lib/branch/account-key"
import { confirmedMonthAmount, type RevConfidenceSource } from "@/lib/branch/computations/rev-confirmed"
import { isInactiveSheetStatus } from "@/lib/crm-source-linking"

/** 추이 차트에 싣는 개월 수(이번 달 포함). */
export const CUMULATIVE_SERIES_MONTHS = 24

export interface CumulativeMonthPoint {
  /** YYYY-MM (KST) */
  ym: string
  /** 그 달에 새로 더해진 수 */
  added: number
  /** 그 달 말까지의 누적 */
  cumulative: number
}

export interface CumulativeCustomersData {
  /** 결제 이력이 있는 기관 수(정규화 기관 키로 중복 제거) */
  total: number
  /** 이번 회계연도(4월 시작)에 처음 결제가 잡힌 기관 수 */
  fyAdded: number
  /** 이번 달에 처음 결제가 잡힌 기관 수 */
  monthAdded: number
  /** 결제 이력은 있으나 첫 결제 월을 읽을 수 없는 기관 — total에는 들어가고 추이에는 빠진다 */
  undatedCount: number
  /** 장부 회계연도(시작 연도) — REV는 회계연도마다 장부가 하나라 그 해 장부에 남은 기관만 센다 */
  ledgerFiscalYear: number
  series: CumulativeMonthPoint[]
}

export interface CumulativeUnitsData {
  /** 전자칠판 실판매 출고 수량(예정·프로모션·샘플·A/S·내부 이동·무효 제외) */
  total: number
  fyAdded: number
  monthAdded: number
  /** 같은 규칙의 배송 예정 수량 — total에 넣지 않는다 */
  planned: number
  /** 회수 수량 — total에서 빼지 않고 따로 보여 준다 */
  returned: number
  /** 출고일이 없는 실판매 수량 — total에는 들어가고 추이에는 빠진다 */
  undated: number
  /** 원장에서 가장 이른 실판매 출고 월(YYYY-MM). 없으면 null */
  firstYm: string | null
  series: CumulativeMonthPoint[]
}

export type CumulativeSection<T> =
  | { status: "ready"; data: T; asOf: string | null; sourceKind?: "import" | "mirror" }
  | { status: "error"; data: null }
  | { status: "forbidden"; data: null }

export interface OverviewCumulativeSummary {
  generatedAt: string
  customers: CumulativeSection<CumulativeCustomersData>
  units: CumulativeSection<CumulativeUnitsData>
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000

/** KST 기준 YYYY-MM */
export function koreaYm(now: Date): string {
  const kst = new Date(now.getTime() + KST_OFFSET_MS)
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}`
}

/** YYYY-MM이 속한 회계연도(4월 시작)의 첫 달 */
export function fiscalStartYm(ym: string): string {
  const [year, month] = ym.split("-").map(Number)
  const fy = month >= 4 ? year : year - 1
  return `${fy}-04`
}

function shiftYm(ym: string, delta: number): string {
  const [year, month] = ym.split("-").map(Number)
  const index = year * 12 + (month - 1) + delta
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`
}

/** "2026-05-03…" · "2026-05" · "2026.5.3" → "2026-05". 읽을 수 없으면 null */
export function ymOf(value: string | null | undefined): string | null {
  const match = /^(\d{4})[-./](\d{1,2})/.exec((value ?? "").trim())
  if (!match) return null
  const month = Number(match[2])
  if (!Number.isInteger(month) || month < 1 || month > 12) return null
  return `${match[1]}-${String(month).padStart(2, "0")}`
}

/** 월별 첫 등장 목록 → 마지막 N개월 누적 추이. 창 이전 분량은 첫 달의 누적에 실린다. */
export function buildCumulativeSeries(
  addedByYm: ReadonlyMap<string, number>,
  currentYm: string,
  months = CUMULATIVE_SERIES_MONTHS,
): CumulativeMonthPoint[] {
  const firstYm = shiftYm(currentYm, -(months - 1))
  let running = 0
  for (const [ym, count] of addedByYm) {
    if (ym < firstYm) running += count
  }
  const series: CumulativeMonthPoint[] = []
  for (let i = 0; i < months; i += 1) {
    const ym = shiftYm(firstYm, i)
    const added = addedByYm.get(ym) ?? 0
    running += added
    series.push({ ym, added, cumulative: running })
  }
  return series
}

function sumSince(addedByYm: ReadonlyMap<string, number>, fromYm: string, toYm: string): number {
  let total = 0
  for (const [ym, count] of addedByYm) {
    if (ym >= fromYm && ym <= toYm) total += count
  }
  return total
}

// ─── 누적 고객 ────────────────────────────────────────────────────────────

export interface CumulativeCustomerDealInput extends RevConfidenceSource {
  customer_name: string
  status: string | null
  first_payment: string | null
  monthly_payments: Record<string, number> | null
}

/**
 * 한 장부 행의 "첫 결제 월". 첫 결제일 칸과, 오늘까지의 확정 금액이 0보다 큰 가장 이른 달 중 이른 쪽.
 * 둘 다 없으면 결제 이력이 없는 행이라 null. 확정 판정은 rev-confirmed.ts(SSOT)만 쓴다.
 */
export function firstPaidYm(deal: CumulativeCustomerDealInput, currentYm: string): string | null | "undated" {
  const fromFirstPayment = ymOf(deal.first_payment)
  let earliestConfirmed: string | null = null
  for (const [ym, raw] of Object.entries(deal.monthly_payments ?? {})) {
    const normalized = ymOf(ym)
    if (!normalized || normalized > currentYm) continue
    const total = Number(raw)
    if (!Number.isFinite(total)) continue
    if (confirmedMonthAmount(deal, ym, total) > 0 && (!earliestConfirmed || normalized < earliestConfirmed)) {
      earliestConfirmed = normalized
    }
  }
  const candidates = [fromFirstPayment, earliestConfirmed].filter((ym): ym is string => ym !== null && ym <= currentYm)
  if (candidates.length > 0) return candidates.sort()[0]
  // 첫 결제일 칸에 값은 있는데 날짜로 읽히지 않는 행 — 결제 이력은 있으므로 센다.
  if ((deal.first_payment ?? "").trim() !== "" && fromFirstPayment === null) return "undated"
  return null
}

export function summarizeCumulativeCustomers(
  deals: readonly CumulativeCustomerDealInput[],
  now: Date,
  ledgerFiscalYear: number,
): CumulativeCustomersData {
  const currentYm = koreaYm(now)
  const firstByAccount = new Map<string, string | "undated">()
  for (const deal of deals) {
    if (isInactiveSheetStatus(deal.status)) continue
    const key = normalizedAccountKey(deal.customer_name)
    if (!key) continue
    const first = firstPaidYm(deal, currentYm)
    if (first === null) continue
    const previous = firstByAccount.get(key)
    if (previous === undefined || previous === "undated" || (first !== "undated" && first < previous)) {
      firstByAccount.set(key, first)
    }
  }

  const addedByYm = new Map<string, number>()
  let undatedCount = 0
  for (const first of firstByAccount.values()) {
    if (first === "undated") {
      undatedCount += 1
      continue
    }
    addedByYm.set(first, (addedByYm.get(first) ?? 0) + 1)
  }

  return {
    total: firstByAccount.size,
    fyAdded: sumSince(addedByYm, fiscalStartYm(currentYm), currentYm),
    monthAdded: addedByYm.get(currentYm) ?? 0,
    undatedCount,
    ledgerFiscalYear,
    series: buildCumulativeSeries(addedByYm, currentYm),
  }
}

// ─── 누적 판매 대수 ───────────────────────────────────────────────────────

/** 판매대시보드 분류(classifySalesDashboardMovement)를 이미 거친 전자칠판 행 */
export interface CumulativeUnitMovementInput {
  kind: "installed" | "planned" | "returned" | "promotionInstalled" | "promotionPlanned"
  quantity: number
  occurred_at: string | null
}

export function summarizeCumulativeUnits(
  movements: readonly CumulativeUnitMovementInput[],
  now: Date,
): CumulativeUnitsData {
  const currentYm = koreaYm(now)
  const addedByYm = new Map<string, number>()
  let total = 0
  let planned = 0
  let returned = 0
  let undated = 0
  for (const movement of movements) {
    const quantity = Math.abs(Number(movement.quantity) || 0)
    if (quantity === 0) continue
    if (movement.kind === "planned") {
      planned += quantity
      continue
    }
    if (movement.kind === "returned") {
      returned += quantity
      continue
    }
    if (movement.kind !== "installed") continue
    total += quantity
    const ym = ymOf(movement.occurred_at)
    if (!ym) {
      undated += quantity
      continue
    }
    addedByYm.set(ym, (addedByYm.get(ym) ?? 0) + quantity)
  }

  const yms = Array.from(addedByYm.keys()).sort()
  return {
    total,
    fyAdded: sumSince(addedByYm, fiscalStartYm(currentYm), currentYm),
    monthAdded: addedByYm.get(currentYm) ?? 0,
    planned,
    returned,
    undated,
    firstYm: yms[0] ?? null,
    series: buildCumulativeSeries(addedByYm, currentYm),
  }
}
