// 사무실·샘플 재고 풀 — 순수 모델(운영자 결정 2026-09-15).
//
// 사무실·샘플 재고는 유닛(관리번호) 기준으로 센다.
//   office   = 사무실 보관 = 가용. 대여할 때 여기서 고른다.
//   showroom = 전시·사내 사용(쇼룸·KC인증 등). 사무실이 보유하지만 가용이 아니다.
//   loaned   = 대여 = 나간 샘플.
// 시트는 샘플이 사무실에서 나갔는지 기록하지 않는다. 그래서 원장(hardware_movements)의 위치 잔량
// "사무실"·"샘플"은 교차 확인(gaps)에만 쓰고 가용 판단에는 쓰지 않는다.
//
// React·네트워크를 모르는 순수 함수라 테스트가 경계(90일·14일·판촉 합계 제외·gaps)를 직접 고정한다
// (tests/admin/hardware-office-sample-pool.test.ts). 화면은 OfficeSamplePoolSection.tsx.

import { isPromotedProduct } from "@/lib/hardware/product"

import type { HardwareSampleUnit, HardwareStockRow, SampleUnitStatus } from "./shared"

export const OFFICE_POOL_LONG_LOAN_DAYS = 90
export const OFFICE_POOL_DUE_SOON_DAYS = 14

// 원장 위치 잔량 키 — lib/repositories/hardware-inventory.ts normalizeLocationName 이 만드는 값.
export const OFFICE_POOL_LEDGER_OFFICE_LOCATION = "사무실"
export const OFFICE_POOL_LEDGER_SAMPLE_LOCATION = "샘플"

// 숨김 품목(내부 코드·비주력). 홈의 옛 재고 위치 맵이 쓰던 목록을 이 섹션이 넘겨받았다(2026-09-15 교체). 단, 이 품목에
// 유닛이나 원장 사무실·샘플 잔량이 생기면 숨기지 않는다 — 풀에서 사라진 샘플이 생기면 안 된다.
export const OFFICE_POOL_HIDDEN_PRODUCTS: ReadonlySet<string> = new Set(["A1", "B1", "D2"])

// 펼친 유닛 목록의 상태 묶음 순서 — 가용 → 사무실 보유 → 나간 샘플 → 예외 → 이력.
export const OFFICE_POOL_STATUS_ORDER: readonly SampleUnitStatus[] = [
  "office",
  "showroom",
  "loaned",
  "repair",
  "converted",
  "retired",
]

// 풀에 살아 있는 상태 — 행 노출 판단에 쓴다. converted·retired 는 이력이라 행을 띄우지 않는다.
const ACTIVE_POOL_STATUSES: ReadonlySet<SampleUnitStatus> = new Set(["office", "showroom", "loaned", "repair"])

// 일괄 액션을 허용하는 출발 상태 — 서버 SAMPLE_EVENT_TRANSITIONS(lib/repositories/hardware-samples.ts)의
// showcase·store 와 같은 값이다. 여기서는 누르기 전 안내만 하고 최종 판정은 서버가 한다.
export const OFFICE_POOL_BULK_ACTION_FROM: Readonly<Record<"showcase" | "store", readonly SampleUnitStatus[]>> = {
  showcase: ["office"],
  store: ["showroom", "repair"],
}

export interface OfficePoolCounts {
  warehouse: { stock: number; available: number; planned: number }
  office: { held: number; available: number; showroom: number }
  loaned: { count: number; long90: number; dueSoon: number }
  repair: number
  ledger: { office: number; sample: number }
  gaps: { office: number; sample: number }
}

export interface OfficeSamplePoolRow extends OfficePoolCounts {
  // itemId 가 있으면 itemId, 없으면(재고 행과 못 이은 유닛) 제품명 기반 키.
  key: string
  itemId: string | null
  product: string
  promoted: boolean
  // 유닛(office·showroom·loaned·repair)이나 원장 사무실·샘플 잔량이 하나라도 있으면 true.
  // false 면 창고 재고만 있는 행이다 — 화면이 기본 접힘으로 둔다.
  hasPoolActivity: boolean
  // office 상태 유닛의 관리번호(정렬)와 같은 순서의 유닛 id.
  availableUnits: string[]
  availableUnitIds: string[]
  // 이 제품의 모든 유닛 — OFFICE_POOL_STATUS_ORDER 순, 같은 상태 안에서는 관리번호 순.
  units: HardwareSampleUnit[]
}

export interface OfficeSamplePool {
  rows: OfficeSamplePoolRow[]
  // 합계는 판촉형(promoted)을 뺀다 — 옛 재고 위치 맵의 "위치별 총량 · 판촉 제외"와 같은 규칙(카드와도 같다).
  totals: OfficePoolCounts
  // 판촉형 행만 모은 합계. 판촉형 행이 없으면 null.
  promotedTotals: OfficePoolCounts | null
  // gaps 가 0 이 아닌 행 수(판촉형 포함).
  gapRowCount: number
}

export interface BuildOfficeSamplePoolInput {
  stockRows: readonly HardwareStockRow[] | null | undefined
  sampleUnits: readonly HardwareSampleUnit[] | null | undefined
  // 로컬 날짜 YYYY-MM-DD. 90일·14일 경계를 이 날짜 기준으로 판정한다.
  todayKey: string
}

const DAY_MS = 86_400_000

// YYYY-MM-DD 앞 10자를 UTC 자정 기준 일수로 바꾼다. 날짜끼리만 비교해 시간대 영향을 받지 않는다.
function dayNumber(value: string | null | undefined): number | null {
  if (!value) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const time = Date.UTC(year, month - 1, day)
  const check = new Date(time)
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null
  return Math.round(time / DAY_MS)
}

// to − from (일). 둘 중 하나라도 날짜가 아니면 null.
export function officePoolDaysBetween(fromKey: string | null | undefined, toKey: string | null | undefined): number | null {
  const from = dayNumber(fromKey)
  const to = dayNumber(toKey)
  if (from == null || to == null) return null
  return to - from
}

// 대여 경과일 — loaned 유닛만. 대여일이 없거나 오늘보다 늦으면 null/0 처리.
export function officePoolLoanElapsedDays(unit: Pick<HardwareSampleUnit, "status" | "loaned_at">, todayKey: string): number | null {
  if (unit.status !== "loaned") return null
  const days = officePoolDaysBetween(unit.loaned_at, todayKey)
  return days == null ? null : Math.max(0, days)
}

// 90일+ — 대여일이 오늘 − 90일과 같거나 그 이전(샘플 트래커 "대여 90일+" 밴드와 같은 경계).
export function isOfficePoolLongLoan(unit: Pick<HardwareSampleUnit, "status" | "loaned_at">, todayKey: string): boolean {
  const elapsed = officePoolLoanElapsedDays(unit, todayKey)
  return elapsed != null && elapsed >= OFFICE_POOL_LONG_LOAN_DAYS
}

// 회수 예정 — 회수 예정일이 14일 이내(당일·14일째 포함)이거나 이미 지난 대여 유닛.
export function isOfficePoolDueSoon(
  unit: Pick<HardwareSampleUnit, "status" | "expected_return_at">,
  todayKey: string
): boolean {
  if (unit.status !== "loaned") return false
  const remaining = officePoolDaysBetween(todayKey, unit.expected_return_at)
  return remaining != null && remaining <= OFFICE_POOL_DUE_SOON_DAYS
}

function emptyCounts(): OfficePoolCounts {
  return {
    warehouse: { stock: 0, available: 0, planned: 0 },
    office: { held: 0, available: 0, showroom: 0 },
    loaned: { count: 0, long90: 0, dueSoon: 0 },
    repair: 0,
    ledger: { office: 0, sample: 0 },
    gaps: { office: 0, sample: 0 },
  }
}

function addCounts(target: OfficePoolCounts, source: OfficePoolCounts) {
  target.warehouse.stock += source.warehouse.stock
  target.warehouse.available += source.warehouse.available
  target.warehouse.planned += source.warehouse.planned
  target.office.held += source.office.held
  target.office.available += source.office.available
  target.office.showroom += source.office.showroom
  target.loaned.count += source.loaned.count
  target.loaned.long90 += source.loaned.long90
  target.loaned.dueSoon += source.loaned.dueSoon
  target.repair += source.repair
  target.ledger.office += source.ledger.office
  target.ledger.sample += source.ledger.sample
  target.gaps.office += source.gaps.office
  target.gaps.sample += source.gaps.sample
}

function normalizeProductKey(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase()
}

function ledgerQuantity(row: HardwareStockRow, location: string): number {
  return row.locationBalances.find((balance) => balance.location === location)?.quantity ?? 0
}

function compareAssetCode(a: string, b: string): number {
  return a.localeCompare(b, "ko", { numeric: true })
}

// 행 순서 — 옛 재고 위치 맵(HardwareInventoryClient featuredRank·boardInch, 2026-09-15 제거)의 순서를 그대로 옮겼다.
// 86" → 75" → T1 → T1(판촉) → STD1 → STD1(판촉), 그다음 보드(인치 큰 순), 나머지는 재고 응답 순서.
function featuredRank(product: string): number | null {
  const promo = isPromotedProduct(product)
  if (/86["”]?\s*IFP/i.test(product) && !promo) return 0
  if (/75["”]?\s*IFP/i.test(product) && !promo) return 1
  if (/\bT1\b/i.test(product) && !promo) return 2
  if (/\bT1\b/i.test(product) && promo) return 3
  if (/\bSTD1\b/i.test(product) && !promo) return 4
  if (/\bSTD1\b/i.test(product) && promo) return 5
  return null
}

function boardInch(product: string): number | null {
  const match = /(\d{2,3})\s*["”]?\s*IFP/i.exec(product)
  return match ? Number(match[1]) : null
}

interface PoolEntry {
  key: string
  itemId: string | null
  product: string
  order: number
  stockRow: HardwareStockRow | null
  units: HardwareSampleUnit[]
}

function statusRank(status: SampleUnitStatus): number {
  const index = OFFICE_POOL_STATUS_ORDER.indexOf(status)
  return index === -1 ? OFFICE_POOL_STATUS_ORDER.length : index
}

function buildRow(entry: PoolEntry, todayKey: string): OfficeSamplePoolRow {
  const counts = emptyCounts()
  const row = entry.stockRow
  if (row) {
    counts.warehouse.stock = row.warehouseStock
    counts.warehouse.available = row.availableStock
    counts.warehouse.planned = row.plannedOut
    counts.ledger.office = ledgerQuantity(row, OFFICE_POOL_LEDGER_OFFICE_LOCATION)
    counts.ledger.sample = ledgerQuantity(row, OFFICE_POOL_LEDGER_SAMPLE_LOCATION)
  }

  const units = entry.units.slice().sort((a, b) => {
    const rankDiff = statusRank(a.status) - statusRank(b.status)
    return rankDiff !== 0 ? rankDiff : compareAssetCode(a.asset_code, b.asset_code)
  })

  let activeUnits = 0
  const available: HardwareSampleUnit[] = []
  for (const unit of units) {
    if (ACTIVE_POOL_STATUSES.has(unit.status)) activeUnits += 1
    if (unit.status === "office") {
      counts.office.available += 1
      available.push(unit)
    } else if (unit.status === "showroom") {
      counts.office.showroom += 1
    } else if (unit.status === "loaned") {
      counts.loaned.count += 1
      if (isOfficePoolLongLoan(unit, todayKey)) counts.loaned.long90 += 1
      if (isOfficePoolDueSoon(unit, todayKey)) counts.loaned.dueSoon += 1
    } else if (unit.status === "repair") {
      counts.repair += 1
    }
  }
  counts.office.held = counts.office.available + counts.office.showroom
  counts.gaps.office = counts.ledger.office - counts.office.held
  counts.gaps.sample = counts.ledger.sample - counts.loaned.count

  return {
    ...counts,
    key: entry.key,
    itemId: entry.itemId,
    product: entry.product,
    promoted: isPromotedProduct(entry.product),
    hasPoolActivity: activeUnits > 0 || counts.ledger.office !== 0 || counts.ledger.sample !== 0,
    availableUnits: available.map((unit) => unit.asset_code),
    availableUnitIds: available.map((unit) => unit.id),
    units,
  }
}

export function officePoolGapTotal(counts: Pick<OfficePoolCounts, "gaps">): number {
  return Math.abs(counts.gaps.office) + Math.abs(counts.gaps.sample)
}

export function buildOfficeSamplePool({ stockRows, sampleUnits, todayKey }: BuildOfficeSamplePoolInput): OfficeSamplePool {
  const entries: PoolEntry[] = []
  const byItemId = new Map<string, PoolEntry>()
  const byProduct = new Map<string, PoolEntry>()

  for (const row of stockRows ?? []) {
    const entry: PoolEntry = {
      key: row.itemId || `product:${normalizeProductKey(row.product)}`,
      itemId: row.itemId || null,
      product: row.product,
      order: entries.length,
      stockRow: row,
      units: [],
    }
    entries.push(entry)
    if (entry.itemId) byItemId.set(entry.itemId, entry)
    const productKey = normalizeProductKey(row.product)
    if (!byProduct.has(productKey)) byProduct.set(productKey, entry)
  }

  for (const unit of sampleUnits ?? []) {
    const productKey = normalizeProductKey(unit.product_name)
    let entry = (unit.item_id ? byItemId.get(unit.item_id) : undefined) ?? byProduct.get(productKey)
    if (!entry) {
      // 재고 행과 못 이은 유닛(비활성 품목·이름 변경) — 풀에서 사라지지 않게 자기 행을 만든다.
      entry = {
        key: unit.item_id ?? `product:${productKey}`,
        itemId: unit.item_id,
        product: unit.product_name,
        order: Number.MAX_SAFE_INTEGER,
        stockRow: null,
        units: [],
      }
      entries.push(entry)
      if (entry.itemId) byItemId.set(entry.itemId, entry)
      byProduct.set(productKey, entry)
    }
    entry.units.push(unit)
  }

  const rows = entries
    .map((entry, index) => ({ row: buildRow(entry, todayKey), order: entry.order === Number.MAX_SAFE_INTEGER ? entries.length + index : entry.order }))
    .filter(({ row }) => {
      const hidden = OFFICE_POOL_HIDDEN_PRODUCTS.has(row.product.trim().toUpperCase())
      if (hidden && !row.hasPoolActivity) return false
      return row.warehouse.stock !== 0 || row.hasPoolActivity
    })
    .sort((a, b) => {
      const aRank = featuredRank(a.row.product)
      const bRank = featuredRank(b.row.product)
      if (aRank != null || bRank != null) {
        if (aRank == null) return 1
        if (bRank == null) return -1
        if (aRank !== bRank) return aRank - bRank
      }
      const aInch = boardInch(a.row.product)
      const bInch = boardInch(b.row.product)
      if (aInch != null || bInch != null) {
        if (aInch == null) return 1
        if (bInch == null) return -1
        if (aInch !== bInch) return bInch - aInch
      }
      return a.order - b.order
    })
    .map(({ row }) => row)

  const totals = emptyCounts()
  const promotedTotals = emptyCounts()
  let hasPromoted = false
  let gapRowCount = 0
  for (const row of rows) {
    if (row.promoted) {
      hasPromoted = true
      addCounts(promotedTotals, row)
    } else {
      addCounts(totals, row)
    }
    if (officePoolGapTotal(row) > 0) gapRowCount += 1
  }

  return { rows, totals, promotedTotals: hasPromoted ? promotedTotals : null, gapRowCount }
}
