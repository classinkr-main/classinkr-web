import "server-only"

import { unstable_cache } from "next/cache"

import {
  HARDWARE_FIXED_REPORT_GROUPS,
  HARDWARE_REPORT_GROUP_LABELS,
  HARDWARE_REPORT_GROUPS,
  SALES_COUNTED_OUTBOUND_TYPES,
  isPlannedProgressStatus,
  resolveOutboundType,
  type HardwareReportGroup,
} from "@/lib/hardware/inventory-process"
import { fetchAllSupabaseRows } from "@/lib/repositories/branch-hw"
import {
  HARDWARE_INVENTORY_CACHE_TAG,
  classifyDestination,
  isMissingColumnError,
} from "@/lib/repositories/hardware-inventory"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

// 판매대시보드 — FY(4월 시작) 품목 × 월 "설치 완료 / +배송 예정"(정의서, 갭 문서 §3-4·§6 D10).
// 원장 전량을 키셋으로 읽어 서버에서 센다. 예전 하드웨어 탭은 최근 2,000건만 받아 브라우저에서 셌다 —
// 원장이 커지면 FY 합계가 조용히 줄었다.
//
// 규칙(D10):
//  - 세일즈 + 프로모션만 센다(resolveOutboundType). 유형을 끝까지 모르는 행(시트 행)은 세일즈로 센다.
//  - 창고·샘플·사무실·수리로 가는 출고(내부 이동)는 세지 않는다. 회수는 출발지가 내부면 세지 않는다.
//  - 설치 완료 = 예정이 아닌 출고, 배송 예정 = 예정 출고. 둘 다 occurred_at 의 달에 넣는다.
//    날짜 없는 행은 "날짜 미정" 칸 — 현재 FY 에만 보인다(어느 FY 인지 모르는 열린 건이라서).
//  - 회수는 판매에서 빼지 않고 따로 보인다.
//  - 행은 품목(hardware_items) 단위, report_group 묶음 소계. 전자칠판·카메라·스탠드는 0대여도 늘 보인다.

export const SALES_DASHBOARD_MONTH_COUNT = 12
export const SALES_DASHBOARD_OTHER_GROUP = "other" as const
export const SALES_DASHBOARD_OTHER_GROUP_LABEL = "기타"

export type SalesDashboardGroupKey = HardwareReportGroup | typeof SALES_DASHBOARD_OTHER_GROUP

export interface SalesDashboardCounts {
  /** 설치 완료(예정이 아닌 출고) 수량. */
  installed: number
  /** 배송 예정 수량. */
  planned: number
  /** 회수 수량(판매에서 빼지 않는다). */
  returned: number
}

export interface SalesDashboardLine {
  /** FY 달 순서(4월 → 3월) 12칸. */
  months: SalesDashboardCounts[]
  /** 날짜 없는 행. */
  undated: SalesDashboardCounts
  /** months + undated. */
  total: SalesDashboardCounts
}

export interface SalesDashboardItemRow extends SalesDashboardLine {
  /** hardware_items.id — 품목 목록에 없는 원장 행은 null(이름으로 묶는다). */
  itemId: string | null
  name: string
}

export interface SalesDashboardGroup {
  key: SalesDashboardGroupKey
  label: string
  rows: SalesDashboardItemRow[]
  subtotal: SalesDashboardLine
}

export interface HardwareSalesDashboard {
  fy: number
  /** 오늘이 속한 FY — 화면 기본값·"날짜 미정" 칸이 실리는 FY. */
  currentFy: number
  /** FY 달 키 12개("2026-04" … "2027-03"). */
  months: string[]
  groups: SalesDashboardGroup[]
  grandTotal: SalesDashboardLine
  /** 판매로 센 기록이 있는 FY 들(내림차순, 현재 FY 포함) — FY 선택지. */
  availableFys: number[]
  generatedAt: string
}

/** 집계 입력 — 원장 출고·회수 행에서 필요한 칸만. */
export interface SalesDashboardMovementInput {
  id: string
  item_id: string | null
  product_name: string
  movement_type: string
  quantity: number
  occurred_at: string | null
  from_location: string | null
  to_location: string | null
  status: string | null
  memo: string | null
  outbound_type?: string | null
  customer_id?: string | null
  /** raw.values[11](시트 "유형" 열) — raw 전체 대신 이 칸만 읽는다. */
  sheet_type?: string | null
}

export interface SalesDashboardItemInput {
  id: string
  name: string
  active?: boolean | null
  report_group?: string | null
  sort_order?: number | null
}

const INTERNAL_DESTINATIONS = new Set(["warehouse", "sample", "office", "repair"])

function emptyCounts(): SalesDashboardCounts {
  return { installed: 0, planned: 0, returned: 0 }
}

function emptyLine(): SalesDashboardLine {
  return {
    months: Array.from({ length: SALES_DASHBOARD_MONTH_COUNT }, emptyCounts),
    undated: emptyCounts(),
    total: emptyCounts(),
  }
}

function addCounts(target: SalesDashboardCounts, source: SalesDashboardCounts) {
  target.installed += source.installed
  target.planned += source.planned
  target.returned += source.returned
}

function addLine(target: SalesDashboardLine, source: SalesDashboardLine) {
  source.months.forEach((counts, index) => addCounts(target.months[index], counts))
  addCounts(target.undated, source.undated)
  addCounts(target.total, source.total)
}

function lineHasCounts(line: SalesDashboardLine) {
  return line.total.installed !== 0 || line.total.planned !== 0 || line.total.returned !== 0
}

function isReportGroup(value: unknown): value is HardwareReportGroup {
  return typeof value === "string" && (HARDWARE_REPORT_GROUPS as readonly string[]).includes(value)
}

/** "2026-05-03…" → { fy: 2026, index: 1 }. 날짜가 없거나 읽을 수 없으면 null. */
export function fiscalSlotOf(occurredAt: string | null | undefined): { fy: number; index: number } | null {
  const match = /^(\d{4})-(\d{2})/.exec((occurredAt ?? "").trim())
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  if (!Number.isInteger(month) || month < 1 || month > 12) return null
  const fy = month >= 4 ? year : year - 1
  return { fy, index: (month + 8) % 12 }
}

/** 오늘이 속한 FY(4월 시작, KST 기준 날짜). */
export function currentSalesFy(now: Date): number {
  // KST(UTC+9) 날짜로 본다 — 3월 31일 밤 UTC 와 4월 1일 KST 가 갈리는 순간을 운영 기준(KST)에 맞춘다.
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const year = kst.getUTCFullYear()
  return kst.getUTCMonth() + 1 >= 4 ? year : year - 1
}

const MIN_SALES_FY = 2015

/** ?fy= 값 검사. 비면 현재 FY, 형식이 틀리거나 범위(2015 ~ 현재+1) 밖이면 null. */
export function parseSalesDashboardFy(value: string | null, now: Date): number | null {
  const currentFy = currentSalesFy(now)
  const text = value?.trim() ?? ""
  if (text === "") return currentFy
  if (!/^\d{4}$/.test(text)) return null
  const fy = Number(text)
  if (fy < MIN_SALES_FY || fy > currentFy + 1) return null
  return fy
}

export function salesDashboardMonthKeys(fy: number): string[] {
  return Array.from({ length: SALES_DASHBOARD_MONTH_COUNT }, (_, index) => {
    const month = ((index + 3) % 12) + 1
    const year = index < 9 ? fy : fy + 1
    return `${year}-${String(month).padStart(2, "0")}`
  })
}

type CountKind = keyof SalesDashboardCounts

/**
 * 원장 행 하나가 판매대시보드에서 무엇인가. 세지 않으면 null.
 * 출고는 도착지, 회수는 출발지가 내부(창고·샘플·사무실·수리)면 내부 이동이라 뺀다. CRM 고객이 붙은 행은
 * 위치 표기와 무관하게 고객사 행이다.
 */
export function classifySalesDashboardMovement(movement: SalesDashboardMovementInput): CountKind | null {
  const isOutbound = movement.movement_type === "outbound"
  const isReturn = movement.movement_type === "return"
  if (!isOutbound && !isReturn) return null
  if (!Number.isFinite(movement.quantity) || movement.quantity === 0) return null

  const type = resolveOutboundType({
    movement_type: movement.movement_type,
    outbound_type: movement.outbound_type ?? null,
    memo: movement.memo,
    status: movement.status,
    to_location: isOutbound ? movement.to_location : movement.from_location,
    raw: movement.sheet_type ? { values: sheetTypeValues(movement.sheet_type) } : null,
  })
  // 유형을 모르는 행(null)은 세일즈로 센다(D10).
  if (type !== null && !SALES_COUNTED_OUTBOUND_TYPES.includes(type)) return null

  if (!movement.customer_id) {
    const counterpart = isOutbound ? movement.to_location : movement.from_location
    if (INTERNAL_DESTINATIONS.has(classifyDestination(counterpart))) return null
  }

  if (isReturn) return "returned"
  return isPlannedProgressStatus(movement.status) ? "planned" : "installed"
}

function sheetTypeValues(sheetType: string): unknown[] {
  const values: unknown[] = new Array(12).fill(null)
  values[11] = sheetType
  return values
}

function compareItems(a: SalesDashboardItemInput, b: SalesDashboardItemInput) {
  const left = a.sort_order ?? Number.MAX_SAFE_INTEGER
  const right = b.sort_order ?? Number.MAX_SAFE_INTEGER
  if (left !== right) return left - right
  return a.name.localeCompare(b.name, "ko")
}

/** 순수 집계 — DB 없이 테스트한다. */
export function aggregateHardwareSalesDashboard(input: {
  movements: readonly SalesDashboardMovementInput[]
  items: readonly SalesDashboardItemInput[]
  fy: number
  now: Date
}): HardwareSalesDashboard {
  const { fy, now } = input
  const currentFy = currentSalesFy(now)
  const itemsById = new Map(input.items.map((item) => [item.id, item]))
  const lines = new Map<string, { item: SalesDashboardItemInput | null; name: string; line: SalesDashboardLine }>()
  const fys = new Set<number>([currentFy])

  for (const movement of input.movements) {
    const kind = classifySalesDashboardMovement(movement)
    if (!kind) continue
    const slot = fiscalSlotOf(movement.occurred_at)
    if (slot) fys.add(slot.fy)
    // 날짜 없는 행은 현재 FY 의 "날짜 미정" 칸에만 싣는다.
    if (slot ? slot.fy !== fy : fy !== currentFy) continue

    const item = movement.item_id ? itemsById.get(movement.item_id) ?? null : null
    const key = item ? `item:${item.id}` : `name:${movement.product_name.trim()}`
    let entry = lines.get(key)
    if (!entry) {
      entry = { item, name: item?.name ?? movement.product_name.trim(), line: emptyLine() }
      lines.set(key, entry)
    }
    const bucket = slot ? entry.line.months[slot.index] : entry.line.undated
    bucket[kind] += movement.quantity
    entry.line.total[kind] += movement.quantity
  }

  // 고정 묶음 품목은 0대여도 행을 만든다(활성 품목만 — 비활성은 기록이 있을 때만).
  for (const item of input.items) {
    if (!isReportGroup(item.report_group) || !HARDWARE_FIXED_REPORT_GROUPS.includes(item.report_group)) continue
    if (item.active === false) continue
    const key = `item:${item.id}`
    if (!lines.has(key)) lines.set(key, { item, name: item.name, line: emptyLine() })
  }

  const grouped = new Map<SalesDashboardGroupKey, Array<{ item: SalesDashboardItemInput | null; name: string; line: SalesDashboardLine }>>()
  for (const entry of lines.values()) {
    const fixedItem = entry.item && isReportGroup(entry.item.report_group) && HARDWARE_FIXED_REPORT_GROUPS.includes(entry.item.report_group)
    if (!fixedItem && !lineHasCounts(entry.line)) continue
    const groupKey: SalesDashboardGroupKey = entry.item && isReportGroup(entry.item.report_group)
      ? entry.item.report_group
      : SALES_DASHBOARD_OTHER_GROUP
    const list = grouped.get(groupKey) ?? []
    list.push(entry)
    grouped.set(groupKey, list)
  }

  const groupOrder: SalesDashboardGroupKey[] = [...HARDWARE_REPORT_GROUPS, SALES_DASHBOARD_OTHER_GROUP]
  const grandTotal = emptyLine()
  const groups: SalesDashboardGroup[] = []
  for (const groupKey of groupOrder) {
    const entries = grouped.get(groupKey)
    const fixed = groupKey !== SALES_DASHBOARD_OTHER_GROUP && HARDWARE_FIXED_REPORT_GROUPS.includes(groupKey)
    if (!entries?.length && !fixed) continue
    const sorted = (entries ?? []).sort((a, b) =>
      compareItems(a.item ?? { id: "", name: a.name }, b.item ?? { id: "", name: b.name })
    )
    const subtotal = emptyLine()
    for (const entry of sorted) addLine(subtotal, entry.line)
    addLine(grandTotal, subtotal)
    groups.push({
      key: groupKey,
      label: groupKey === SALES_DASHBOARD_OTHER_GROUP ? SALES_DASHBOARD_OTHER_GROUP_LABEL : HARDWARE_REPORT_GROUP_LABELS[groupKey],
      rows: sorted.map((entry) => ({ itemId: entry.item?.id ?? null, name: entry.name, ...entry.line })),
      subtotal,
    })
  }

  return {
    fy,
    currentFy,
    months: salesDashboardMonthKeys(fy),
    groups,
    grandTotal,
    availableFys: Array.from(fys).sort((a, b) => b - a),
    generatedAt: now.toISOString(),
  }
}

// ── DB 읽기 ───────────────────────────────────────────────────────────────────
// raw 전체(시트 행 원문) 대신 유형 열 하나만 JSON 경로로 읽는다 — 페이로드를 작게 둔다.
const SALES_DASHBOARD_BASE_COLUMNS =
  "id,item_id,product_name,movement_type,quantity,occurred_at,from_location,to_location,status,memo,sheet_type:raw->values->>11"
const SALES_DASHBOARD_PROCESS_COLUMNS = "outbound_type,customer_id"

let processColumnsMissing = false
let itemProcessColumnsMissing = false

async function readMovements(columns: string): Promise<SalesDashboardMovementInput[]> {
  const sb = createSupabaseAdminClient()
  return fetchAllSupabaseRows<SalesDashboardMovementInput>((afterId, limit) => {
    let query = sb
      .from("hardware_movements")
      .select(columns)
      .in("movement_type", ["outbound", "return"])
      .is("voided_at", null)
      .order("id", { ascending: true })
      .limit(limit)
    if (afterId) query = query.gt("id", afterId)
    return query
  })
}

export async function listSalesDashboardMovements(): Promise<SalesDashboardMovementInput[]> {
  if (!processColumnsMissing) {
    try {
      return await readMovements(`${SALES_DASHBOARD_BASE_COLUMNS},${SALES_DASHBOARD_PROCESS_COLUMNS}`)
    } catch (error) {
      if (!isMissingColumnError(error)) throw error
      // 마이그레이션 전 DB — 유형·고객 칸 없이 읽는다(유형은 시트 유형·메모로 추정된다).
      processColumnsMissing = true
    }
  }
  return readMovements(SALES_DASHBOARD_BASE_COLUMNS)
}

export async function listSalesDashboardItems(): Promise<SalesDashboardItemInput[]> {
  const sb = createSupabaseAdminClient()
  if (!itemProcessColumnsMissing) {
    const { data, error } = await sb.from("hardware_items").select("id,name,active,report_group,sort_order")
    if (!error) return (data ?? []) as SalesDashboardItemInput[]
    if (!isMissingColumnError(error)) throw error
    itemProcessColumnsMissing = true
  }
  const { data, error } = await sb.from("hardware_items").select("id,name,active")
  if (error) throw error
  return (data ?? []) as SalesDashboardItemInput[]
}

async function computeHardwareSalesDashboard(fy: number): Promise<HardwareSalesDashboard> {
  const [movements, items] = await Promise.all([listSalesDashboardMovements(), listSalesDashboardItems()])
  return aggregateHardwareSalesDashboard({ movements, items, fy, now: new Date() })
}

// 쓰기 경로가 HARDWARE_INVENTORY_CACHE_TAG 를 무효화하므로 기록 직후에도 바로 맞는다.
// fy 인자가 캐시 키에 들어간다 — FY 마다 숫자 몇백 개짜리 결과만 캐시한다(원장 행은 캐시하지 않는다).
const getHardwareSalesDashboardCached = unstable_cache(
  computeHardwareSalesDashboard,
  ["hardware-sales-dashboard-v1"],
  { tags: [HARDWARE_INVENTORY_CACHE_TAG], revalidate: 300 }
)

export function getHardwareSalesDashboard(fy: number): Promise<HardwareSalesDashboard> {
  return getHardwareSalesDashboardCached(fy)
}
