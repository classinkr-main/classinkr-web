import "server-only"

import { createHash } from "crypto"
import { revalidateTag, unstable_cache } from "next/cache"

import { isPromotedProduct } from "@/lib/hardware/product"
import { normalizedAccountKey } from "@/lib/branch/account-key"
import { fetchAllSupabaseRows, listFreshHwInbound, listFreshHwOutbound, listFreshHwStock } from "@/lib/repositories/branch-hw"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export const HARDWARE_INVENTORY_CACHE_TAG = "hardware-inventory"

export const HARDWARE_MOVEMENT_TYPES = [
  "inbound",
  "outbound",
  "return",
  "transfer",
  "repair",
  "adjust",
] as const

export type HardwareMovementType = (typeof HARDWARE_MOVEMENT_TYPES)[number]

export interface HardwareItem {
  id: string
  name: string
  sku: string | null
  category: string | null
  reorder_point: number
  lead_time_days: number
  active: boolean
  source_aliases: string[]
  created_at: string
  updated_at: string
}

export interface HardwareMovement {
  id: string
  item_id: string
  product_name: string
  movement_type: HardwareMovementType
  quantity: number
  occurred_at: string | null
  from_location: string | null
  to_location: string | null
  owner: string | null
  status: string | null
  reference_no: string | null
  memo: string | null
  serials: string[]
  lot_no: string | null
  unit_price: number | null
  amount_usd: number | null
  amount_cny: number | null
  storage_location: string | null
  importer: string | null
  source: "admin_manual" | "sheet_import"
  source_table: string | null
  source_key: string | null
  import_run_id: string | null
  raw: unknown
  created_by: string | null
  created_at: string
  voided_at: string | null
  voided_by: string | null
  void_reason: string | null
  converted_from_movement_id: string | null
  converted_to_movement_id: string | null
}

// 대시보드 원장 읽기 컬럼(T5-A, docs/active/supabase-optimization-execution-plan-2026-09-02.md).
// 대시보드가 읽지 않는 6컬럼(source_table, source_key, import_run_id, created_by, voided_by, void_reason)은
// select에서 제외한다. raw는 서버 recoverMoneyFromRaw용으로 읽되 응답 직전 { crmLink }로 축소한다.
export const HARDWARE_MOVEMENT_LEDGER_COLUMNS =
  "id,item_id,product_name,movement_type,quantity,occurred_at,from_location,to_location,owner,status,reference_no,memo,serials,lot_no,unit_price,amount_usd,amount_cny,storage_location,importer,source,raw,created_at,voided_at,converted_from_movement_id,converted_to_movement_id"

export type HardwareMovementLedgerRow = Omit<
  HardwareMovement,
  "source_table" | "source_key" | "import_run_id" | "created_by" | "voided_by" | "void_reason"
>

// 대시보드 응답용 movement — raw는 클라이언트가 읽는 crmLink만 남기고, planned는 서버 isPlannedStatus로 확정한다.
export type HardwareMovementView = Omit<HardwareMovementLedgerRow, "raw"> & {
  raw: { crmLink: Record<string, unknown> } | null
  planned: boolean
}

// 대시보드 응답용 item — 클라이언트 미사용 sku/active/created_at/updated_at 제외.
export type HardwareItemView = Pick<
  HardwareItem,
  "id" | "name" | "category" | "reorder_point" | "lead_time_days" | "source_aliases"
>

export interface CreateHardwareMovementInput {
  itemId?: string
  productName: string
  movementType: HardwareMovementType
  quantity: number
  occurredAt?: string | null
  fromLocation?: string | null
  toLocation?: string | null
  owner?: string | null
  status?: string | null
  referenceNo?: string | null
  memo?: string | null
  serials?: string[]
  lotNo?: string | null
  unitPrice?: number | null
  amountUsd?: number | null
  amountCny?: number | null
  storageLocation?: string | null
  importer?: string | null
  createdBy?: string | null
  raw?: Record<string, unknown>
}

type HardwareMovementInsertRow = {
  item_id: string
  product_name: string
  movement_type: HardwareMovementType
  quantity: number
  occurred_at: string | null
  from_location: string | null
  to_location: string | null
  owner: string | null
  status: string | null
  reference_no: string | null
  memo: string | null
  serials: string[]
  lot_no: string | null
  unit_price: number | null
  amount_usd: number | null
  amount_cny: number | null
  storage_location: string | null
  importer: string | null
  source: "admin_manual"
  raw: Record<string, unknown>
  created_by: string | null
  converted_from_movement_id?: string
}

export interface UpdateHardwareItemInput {
  reorderPoint?: number
  leadTimeDays?: number
  category?: string | null
  sku?: string | null
  sourceAliases?: string[]
  active?: boolean
}

export interface HardwareStockRow {
  itemId: string
  product: string
  category: string | null
  reorderPoint: number
  leadTimeDays: number
  warehouseStock: number
  plannedOut: number
  availableStock: number
  outbound30d: number
  weeklyOutboundAvg: number
  trendOrderPoint: number
  daysUntilStockout: number | null
  low: boolean
  orderRecommended: boolean
  locationBalances: Array<{ location: string; quantity: number }>
  lotBalances: Array<{ lot: string; quantity: number }>
}

export interface HardwareAlert {
  id: string
  severity: "critical" | "warning" | "info"
  // 알림이 가리키는 품목의 id — 알림 카드의 원탭 조치(QuickMoveButton)가 prepareQuickEntry로
  // 바로 시트를 여는 데 쓴다. id(`${prefix}-${itemId}`)에서 역파싱하지 않고 필드로 직접 싣는다.
  itemId: string
  product: string
  title: string
  detail: string
  // 미가동 품목의 상시 부족 알림 표시 강등용 — 클라이언트가 접힌 그룹으로 내린다.
  muted?: boolean
}

// 미가동(취급 중단) 품목 판정 — 창고가 정확히 0이고 예정·최근 30일 출고가 없으면 "부족" 알림은
// 상시 소음이다. 음수 창고는 원장 이상 실신호이므로 0 초과·미만이 아닌 0 일치로만 본다.
export function isDormantStockRow(row: Pick<HardwareStockRow, "warehouseStock" | "plannedOut" | "outbound30d">): boolean {
  return row.warehouseStock === 0 && row.plannedOut === 0 && row.outbound30d === 0
}

export interface HardwareDashboard {
  items: HardwareItemView[]
  stock: HardwareStockRow[]
  // 최신순 상위 2000행(정렬·voided 제외는 여기서 끝난 상태). 최근 출고·예정 큐는 이 배열의
  // 부분집합이라 따로 싣지 않는다 — 클라이언트가 movement_type·planned로 그대로 파생한다(T5-A).
  movements: HardwareMovementView[]
  // 감사(2026-09-07 #7) — 무효 아닌(voided_at null) 전체 이동 건수. movements.length가 이 값보다
  // 작으면 2000건 캡에 걸려 잘린 상태 — 화면에서 감지 가능하게 하고, 그 너머는
  // getHardwareMovementsPage로 명시적으로 더 불러올 수 있다.
  movementsTotal: number
  alerts: HardwareAlert[]
  totals: {
    warehouseStock: number
    availableStock: number
    plannedOut: number
    outbound30d: number
    lowItems: number
    orderRecommended: number
  }
  importRun: {
    id: string
    status: string
    started_at: string
    finished_at: string | null
    rows_imported: number | null
    rows_skipped: number | null
    error: string | null
  } | null
  // 감사(2026-09-07 #1): replace_hardware_sheet_import RPC가 구버전(20260630 마이그레이션 미적용)이면
  // amount_usd/amount_cny/unit_price/importer 컬럼을 못 채우고 recoverMoneyFromRaw가 raw JSON에서
  // 조용히 복구한다. recoveredFromRawCount > 0이면 그 상태가 지금도 살아 있다는 뜻 — 화면에 노출해
  // "괜찮아 보이지만 실은 raw 백업으로 버티는 중"을 감지 가능하게 만든다(마이그 적용 전 0이 될 수 없다).
  importCosting: {
    recoveredFromRawCount: number
  }
}

export interface HardwareSheetImportResult {
  imported: number
  skipped: number
  runId: string
  snapshotId: string
  snapshotChecksum: string
  snapshotCreatedAt: string
}

const DEFAULT_STOCK_LOCATION = "창고"
const DEFAULT_REPAIR_LOCATION = "수리"
const DEFAULT_CUSTOMER_LOCATION = "고객"
const DEFAULT_SAMPLE_LOCATION = "샘플"
const TREND_WINDOW_DAYS = 30
// 기본 대시보드 응답에 싣는 최신 이동 건수 상한. 기존 계약(T5-A) 그대로 — 홈 요약·검색·입출고
// 탭 등 기존 소비처가 이 배열 전체를 집계에 쓰므로 기본값 자체는 줄이지 않는다(#7 감사 메모 참고).
// 그 너머는 getHardwareMovementsPage로 명시적으로 페이지를 요청해야 한다.
const HARDWARE_MOVEMENTS_DEFAULT_LIMIT = 2000
// 명시적 페이지 요청(getHardwareMovementsPage) 1회당 상한 — 남용 방지.
const HARDWARE_MOVEMENTS_MAX_PAGE_LIMIT = 2000

function cleanString(value: unknown): string | null {
  if (value == null) return null
  const text = String(value).trim()
  return text.length ? text : null
}

function normalizeProductName(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

function normalizeLocationName(value: unknown): string | null {
  const text = cleanString(value)
  if (!text) return null
  if (/샘플|대여|데모|demo|sample/i.test(text)) return DEFAULT_SAMPLE_LOCATION
  if (/수리|a\/?s|as센터|repair/i.test(text)) return DEFAULT_REPAIR_LOCATION
  if (/사무실|office/i.test(text)) return "사무실"
  if (/창고|warehouse/i.test(text)) return DEFAULT_STOCK_LOCATION
  // FPL(풀필먼트) 위탁 창고 — 판매 가능한 창고 풀에 속한다(2026-08 운영 확정: 인천 더조은).
  // 시트에는 사이트명이 그대로 적히므로 창고로 정규화하고, 원문은 storage_location·raw에 보존한다.
  if (/인천\s*더조은|\bfpl\b/i.test(text)) return DEFAULT_STOCK_LOCATION
  if (/^외부\/?고객$|^고객$|고객사/i.test(text)) return DEFAULT_CUSTOMER_LOCATION
  return text
}

function classifyDestination(value: unknown): "warehouse" | "sample" | "office" | "repair" | "customer" | "other" {
  const location = normalizeLocationName(value)
  if (!location) return "other"
  if (location === DEFAULT_STOCK_LOCATION) return "warehouse"
  if (location === DEFAULT_SAMPLE_LOCATION) return "sample"
  if (location === "사무실") return "office"
  if (location === DEFAULT_REPAIR_LOCATION) return "repair"
  if (location === DEFAULT_CUSTOMER_LOCATION) return "customer"
  return "other"
}

function isSampleLikeText(...values: unknown[]) {
  return values.some((value) => /샘플|대여|데모|demo|sample/i.test(cleanString(value) ?? ""))
}

function hashSourceKey(parts: unknown[]) {
  return createHash("sha1").update(JSON.stringify(parts)).digest("hex")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (isRecord(error) && typeof error.message === "string") return error.message
  return String(error)
}

function isPlannedStatus(status: string | null | undefined) {
  const text = status ?? ""
  return /예정|예약|대기|planned/i.test(text)
}

function movementLotKey(movement: Pick<HardwareMovement, "lot_no" | "source" | "reference_no">): string | null {
  const direct = cleanString(movement.lot_no)
  if (direct) return direct
  // Sheet-imported inbound/outbound rows carry the logistics number (물류No) in reference_no.
  if (movement.source === "sheet_import") {
    const ref = cleanString(movement.reference_no)
    if (ref) return ref
  }
  return null
}

function isCrmReference(value: string | null | undefined) {
  const text = cleanString(value)
  return Boolean(text && (/^deal:/i.test(text) || /^xiaoshouyi:/i.test(text)))
}

function normalizeAliases(values: string[] | undefined) {
  return Array.from(
    new Set((values ?? []).map((value) => normalizeProductName(value)).filter(Boolean))
  )
}

function defaultReorderPoint(product: string) {
  if (/86["”]?\s*IFP/i.test(product)) return 2
  if (/75["”]?\s*IFP/i.test(product)) return 2
  if (/65["”]?\s*IFP/i.test(product)) return 1
  if (/\bOPS\b/i.test(product)) return 5
  if (/\b(?:T1|S1|STD1)\b/i.test(product)) return 2
  return 1
}

function defaultCategory(product: string, category: string | null) {
  if (category) return category
  if (/IFP|board|칠판/i.test(product)) return "전자칠판"
  if (/\bOPS\b/i.test(product)) return "OPS"
  if (/\b(?:T1|S1)\b|카메라/i.test(product)) return "카메라"
  if (/\bSTD1\b|stand|스탠드/i.test(product)) return "스탠드"
  return null
}

// 전량 조회 — PostgREST 1000행 캡을 id 키셋 페이지네이션으로 우회한다(fetchAllSupabaseRows).
// 키셋은 id 오름차순으로 읽으므로, 기존 반환 순서 계약(order 컬럼 기준)은 JS 재정렬로 유지한다.
// columns: 명시 컬럼 목록(기본 "*"). id는 키셋 페이지네이션에 필요하므로 목록에 반드시 포함해야 한다.
async function listAll<T extends { id: string }>(
  table: string,
  columns = "*",
  order = "created_at",
  ascending = false
): Promise<T[]> {
  const sb = createSupabaseAdminClient()
  const rows = await fetchAllSupabaseRows<T>((afterId, limit) => {
    let query = sb.from(table).select(columns).order("id", { ascending: true }).limit(limit)
    if (afterId) query = query.gt("id", afterId)
    return query
  })
  const direction = ascending ? 1 : -1
  return rows.sort((a, b) => {
    const left = String((a as Record<string, unknown>)[order] ?? "")
    const right = String((b as Record<string, unknown>)[order] ?? "")
    if (left !== right) return left < right ? -direction : direction
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

export async function listHardwareItems(): Promise<HardwareItem[]> {
  const sb = createSupabaseAdminClient()
  const { data, error } = await sb
    .from("hardware_items")
    .select("*")
    .order("active", { ascending: false })
    .order("name", { ascending: true })
  if (error) throw error
  return (data ?? []) as HardwareItem[]
}

// The live sheet-import RPC doesn't persist amount_usd/unit_price/importer (the costing
// migration is pending on prod), so file-imported movements stash those in `raw`. Recover
// them here when the dedicated column is null — a no-op once the migration is applied.
function recoverMoneyFromRaw<T extends Pick<HardwareMovement, "raw" | "amount_usd" | "amount_cny" | "unit_price" | "importer">>(rows: T[]): T[] {
  return rows.map((row) => {
    const raw = isRecord(row.raw) ? row.raw : {}
    const rawNum = (key: string): number | null => {
      const value = raw[key]
      return typeof value === "number" && Number.isFinite(value) ? value : null
    }
    const rawStr = (key: string): string | null => {
      const value = raw[key]
      return typeof value === "string" && value.trim() ? value.trim() : null
    }
    return {
      ...row,
      amount_usd: row.amount_usd ?? rawNum("amount_usd"),
      amount_cny: row.amount_cny ?? rawNum("amount_cny"),
      unit_price: row.unit_price ?? rawNum("unit_price"),
      importer: row.importer ?? rawStr("importer"),
    }
  })
}

// 감사(2026-09-07 #1) — recoverMoneyFromRaw는 건드리지 않는다(동작 변경 없음). 이 함수는 같은
// 조건을 "감지"만 별도로 한다: 시트 이관(sheet_import) 행인데 대시보드용 컬럼이 비어 있어
// raw JSON에서 실제로 값을 끌어왔는지. admin_manual 행은 처음부터 컬럼에 값이 들어가므로
// 이 신호와 무관하다(recoverMoneyFromRaw가 아무것도 안 바꾸는 no-op 케이스).
function isMoneyRecoveredFromRaw(
  row: Pick<HardwareMovement, "raw" | "amount_usd" | "amount_cny" | "unit_price" | "importer" | "source">
): boolean {
  if (row.source !== "sheet_import") return false
  const raw = isRecord(row.raw) ? row.raw : {}
  const rawHasNum = (key: string) => {
    const value = raw[key]
    return typeof value === "number" && Number.isFinite(value)
  }
  const rawHasStr = (key: string) => {
    const value = raw[key]
    return typeof value === "string" && value.trim().length > 0
  }
  return (
    (row.amount_usd == null && rawHasNum("amount_usd")) ||
    (row.amount_cny == null && rawHasNum("amount_cny")) ||
    (row.unit_price == null && rawHasNum("unit_price")) ||
    (row.importer == null && rawHasStr("importer"))
  )
}

// 시트 임포트 경로는 listCurrentSheetImportMovements가 따로 전량(select "*")을 읽으므로 무관하다.
async function listAllHardwareMovements(): Promise<{
  rows: HardwareMovementLedgerRow[]
  moneyRecoveredFromRawCount: number
}> {
  const rows = await listAll<HardwareMovementLedgerRow>("hardware_movements", HARDWARE_MOVEMENT_LEDGER_COLUMNS)
  // recoveredFromRawCount는 병합 전(raw 컬럼 원본) 기준으로 세야 한다 — recoverMoneyFromRaw가
  // 이미 병합한 뒤에는 "컬럼이 비어 있었는지"를 되돌릴 수 없다(값이 있으면 원래 컬럼인지 복구인지
  // 구분 불가).
  const moneyRecoveredFromRawCount = rows.reduce((count, row) => count + (isMoneyRecoveredFromRaw(row) ? 1 : 0), 0)
  return { rows: recoverMoneyFromRaw(rows), moneyRecoveredFromRawCount }
}

export interface HardwareCustomerLink {
  accountKey: string
  name: string
}

interface HardwareCustomerMovementRow {
  id: string
  to_location: string | null
  status: string | null
}

const GENERIC_HARDWARE_DESTINATIONS = new Set(
  ["창고", "샘플", "고객", "수리", "사무실", "본사", "office", "외부/고객", "외부", "재고"].map((value) =>
    value.toLocaleLowerCase("ko-KR")
  )
)

/**
 * REV 장부의 하드웨어 역링크용 경량 투영. 실제(non-planned), non-voided 출고의
 * 고객 목적지만 읽어 전체 재고 대시보드 조립과 600KB 응답을 피한다.
 */
async function getHardwareCustomerLinksUncached(): Promise<HardwareCustomerLink[]> {
  const sb = createSupabaseAdminClient()
  const rows = await fetchAllSupabaseRows<HardwareCustomerMovementRow>((afterId, limit) => {
    let query = sb
      .from("hardware_movements")
      .select("id,to_location,status")
      .eq("movement_type", "outbound")
      .is("voided_at", null)
      .order("id", { ascending: true })
      .limit(limit)
    if (afterId) query = query.gt("id", afterId)
    return query
  })

  const customers = new Map<string, string>()
  for (const row of rows) {
    if (isPlannedStatus(row.status)) continue
    const name = row.to_location?.trim()
    if (!name || GENERIC_HARDWARE_DESTINATIONS.has(name.toLocaleLowerCase("ko-KR"))) continue
    const accountKey = normalizedAccountKey(name)
    if (accountKey && !customers.has(accountKey)) customers.set(accountKey, name)
  }

  return Array.from(customers, ([accountKey, name]) => ({ accountKey, name })).sort((a, b) =>
    a.name.localeCompare(b.name, "ko")
  )
}

// 장부 워크벤치가 콜드로드마다 부르는데 출고 전량 키셋 스캔이다 — 대시보드와 같은 무효화
// 태그를 달아, 원장 쓰기 6경로가 즉시 갱신하고 그 사이 반복 호출은 캐시가 받는다.
const getHardwareCustomerLinksCached = unstable_cache(
  () => getHardwareCustomerLinksUncached(),
  ["hardware-customer-links"],
  { tags: [HARDWARE_INVENTORY_CACHE_TAG], revalidate: 120 }
)

export function getHardwareCustomerLinks(): Promise<HardwareCustomerLink[]> {
  return getHardwareCustomerLinksCached()
}

async function getLatestImportRun(): Promise<HardwareDashboard["importRun"]> {
  const sb = createSupabaseAdminClient()
  const { data, error } = await sb
    .from("hardware_import_runs")
    .select("id,status,started_at,finished_at,rows_imported,rows_skipped,error")
    .eq("source", "branch_hw_sheet")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data as HardwareDashboard["importRun"]
}

async function ensureHardwareItems(
  products: Array<{ name: string; category?: string | null }>
): Promise<Map<string, HardwareItem>> {
  const names = Array.from(new Set(products.map((p) => normalizeProductName(p.name)).filter(Boolean)))
  if (names.length === 0) return new Map()

  const rows = names.map((name) => {
    const source = products.find((p) => normalizeProductName(p.name) === name)
    const category = defaultCategory(name, source?.category ?? null)
    return {
      name,
      category,
      reorder_point: defaultReorderPoint(name),
      lead_time_days: 14,
      source_aliases: [name],
    }
  })

  const sb = createSupabaseAdminClient()
  const { error: upsertError } = await sb
    .from("hardware_items")
    .upsert(rows, { onConflict: "name", ignoreDuplicates: true })
  if (upsertError) throw upsertError

  const { data, error } = await sb
    .from("hardware_items")
    .select("*")
    .in("name", names)
  if (error) throw error

  return new Map((data ?? []).map((item) => [item.name, item as HardwareItem]))
}

async function ensureNoDuplicateCrmMovement(input: {
  productName: string
  referenceNo?: string | null
  status?: string | null
}) {
  if (!isCrmReference(input.referenceNo)) return

  const sb = createSupabaseAdminClient()
  const { data, error } = await sb
    .from("hardware_movements")
    .select("id,status,voided_at,converted_to_movement_id")
    .eq("source", "admin_manual")
    .eq("reference_no", input.referenceNo)
    .eq("product_name", input.productName)
    .is("voided_at", null)
    .limit(5)
  if (error) throw error

  const existingRows = (data ?? []) as Array<{
    id: string
    status: string | null
    voided_at: string | null
    converted_to_movement_id: string | null
  }>
  if (existingRows.length === 0) return

  const creatingPlanned = isPlannedStatus(input.status)
  const existingPlanned = existingRows.find((row) => isPlannedStatus(row.status))
  const existingActual = existingRows.find((row) => !isPlannedStatus(row.status))

  if (creatingPlanned && existingRows.length > 0) {
    throw new Error("이미 같은 CRM 오더가 배송 예정 또는 출고 기록으로 반영되어 있습니다.")
  }
  if (!creatingPlanned && existingActual) {
    throw new Error("이미 같은 CRM 오더가 실제 출고로 반영되어 있습니다.")
  }
  if (!creatingPlanned && existingPlanned) {
    throw new Error("같은 CRM 오더의 배송 예정이 이미 있습니다. 예정 목록에서 출고 완료 처리하세요.")
  }
}

function lotFifoRank(lot: string): number | null {
  if (/^FY/i.test(lot)) return 0
  const hMatch = /^H(\d+)/i.exec(lot)
  return hMatch ? Number(hMatch[1]) : null
}

/** FIFO 정렬 — 가장 먼저 소진될 로트가 앞. FY < H1 < … < H숫자 < 그 밖(C1·Sample 등, 처음 본 날짜순). */
function compareLotsFifo(
  a: { lot: string; firstSeen: number },
  b: { lot: string; firstSeen: number }
): number {
  const aRank = lotFifoRank(a.lot)
  const bRank = lotFifoRank(b.lot)
  if (aRank != null && bRank != null && aRank !== bRank) return aRank - bRank
  if (aRank != null && bRank == null) return -1
  if (aRank == null && bRank != null) return 1
  if (a.firstSeen !== b.firstSeen) return a.firstSeen - b.firstSeen
  return a.lot.localeCompare(b.lot, "ko")
}

/** 이동 1건이 로트 잔량에 주는 변화 — 입고/반납(+) · 출고(예정 포함, −) · 보정(방향대로) · 이동/수리(0). */
function lotDeltaOf(movement: Pick<HardwareMovement, "movement_type" | "quantity" | "from_location" | "to_location">): number {
  if (movement.movement_type === "inbound" || movement.movement_type === "return") return movement.quantity
  if (movement.movement_type === "outbound") return -movement.quantity
  if (movement.movement_type === "adjust") {
    return movement.from_location && !movement.to_location ? -movement.quantity : movement.quantity
  }
  return 0
}

/** 양수 로트를 FIFO 순서대로 need 만큼 소진한다. 소진하지 못한 나머지를 돌려준다. */
function drainLotsFifo(lots: ResolvedHardwareLot[], need: number): number {
  let remaining = need
  for (const lot of lots) {
    if (remaining <= 0) break
    if (lot.quantity <= 0) continue
    const take = Math.min(remaining, lot.quantity)
    lot.quantity -= take
    remaining -= take
  }
  return remaining
}

export type HardwareLotLedgerMovement = Pick<
  HardwareMovement,
  | "lot_no"
  | "source"
  | "reference_no"
  | "movement_type"
  | "quantity"
  | "from_location"
  | "to_location"
  | "occurred_at"
  | "created_at"
>

export interface ResolvedHardwareLot {
  lot: string
  quantity: number
  firstSeen: number
}

export interface ResolvedHardwareLotBalances {
  /** 양수 잔량 로트만, FIFO 순서(가장 먼저 소진될 로트가 앞). */
  lots: ResolvedHardwareLot[]
  /** 흡수할 양수 로트가 없어 남은 초과 출고 — "원장 점검 필요" 신호. */
  unabsorbedOverdraw: number
  /** 차감할 로트가 없어 남은 로트 미기록 감소분(출고·음수 보정). */
  unattributedReduction: number
}

/**
 * 로트 잔량 정본 해석기 — 화면 표시(computeHardwareStockRow)와 새 출고 자동 배정
 * (allocateOutboundLots)이 **반드시 이 함수 하나**를 쓴다. 둘이 따로 계산하면 화면이 보여준
 * 로트와 실제로 찍히는 로트가 갈라진다.
 *
 * ── 왜 단순 합산이 아닌가 (2026-09-14 운영 실측) ───────────────────────────────
 * 예전에는 로트 키가 있는 이동만 로트별로 합산하고 음수는 숨겼다. 그 결과 운영 화면이 실물에
 * 없는 옛 로트를 재고로 보여줬다 — STD1 에 H4 1·H5 10·H6 3, T1 에 H6 6. 실제 재고는 전부
 * H8·C1 물량이다(운영자 확인). 원인은 시트 원장의 두 가지 기록 습관이다.
 *
 *  1. **로트를 넘는 출고.** 설치 기록에 그 시점의 "현행 세대" 이름을 붙이는 경우가 많아,
 *     STD1 은 H8 입고 19대에 H8 출고가 27대로 기록돼 H8 이 −8 이 됐다. 그 8대는 실제로는
 *     선반에 남아 있던 옛 로트에서 나간 것이다. 음수를 숨기면 그 사실이 사라지고, 옛 로트는
 *     한 대도 줄지 않은 채 남는다.
 *  2. **로트 없는 출고·보정.** 배송 예정 출고와 현재고 보정 다수가 로트 키 없이 들어온다.
 *     합산에서 빠지니 로트 잔량은 줄지 않는다.
 *
 * ── 해석 규칙 (순서 무관 · 결정적) ───────────────────────────────────────────────
 *  ① 로트 키가 있는 이동을 로트별로 합산한다.
 *  ② 음수가 된 로트의 초과분은 FIFO(가장 오래된 양수 로트부터)로 흡수한다 — 기록된 로트가
 *     아니라 실제로 나간 물량의 출처를 복원한다.
 *  ③ 로트 없는 감소분(출고·음수 보정)도 FIFO 로 차감한다 — 새 출고 자동 배정과 같은 규약이다.
 *
 * 날짜 순서로 재생하지 않는 이유: 시트 원장은 입고일보다 설치일이 앞서는 행이 흔하고(H6 입고
 * 2025-11-03 이전에 H6 출고 4건), occurred_at 이 빈 행도 있으며 created_at 은 임포트 시각
 * 하나로 뭉쳐 있다. 순서에 기대면 결과가 데이터 노이즈에 흔들린다.
 *
 * 운영 교차검증(2026-09-14): 해석 결과가 T1(판촉) H8 10 = 가용 10, 75" IFP H8 1 = 가용 1,
 * S1 C1 1 = 가용 1 로 정확히 맞고, 전 품목에서 H8 이전 로트가 사라졌다.
 * 로트 없는 **증가분**(보정+)은 어느 로트인지 알 수 없어 로트에 넣지 않는다 — 로트 합계가
 * 가용 재고보다 작게 나오는 품목(OPS·케이블 등)은 그 미기록분이다.
 */
export function resolveHardwareLotBalances(
  movements: readonly HardwareLotLedgerMovement[]
): ResolvedHardwareLotBalances {
  const byLot = new Map<string, ResolvedHardwareLot>()
  let unlottedReduction = 0

  for (const movement of movements) {
    const delta = lotDeltaOf(movement)
    if (delta === 0) continue

    const lot = movementLotKey(movement)
    if (!lot) {
      // 로트를 알 수 없는 증가분은 귀속시킬 곳이 없다 — 감소분만 FIFO 로 차감한다(규칙 ③).
      if (delta < 0) unlottedReduction += -delta
      continue
    }

    const current = byLot.get(lot) ?? { lot, quantity: 0, firstSeen: Number.POSITIVE_INFINITY }
    current.quantity += delta
    const seenAt = movementDate(movement)
    if (seenAt > 0 && seenAt < current.firstSeen) current.firstSeen = seenAt
    byLot.set(lot, current)
  }

  const ordered = Array.from(byLot.values()).sort(compareLotsFifo)

  // 규칙 ②: 초과 출고를 모아 음수 로트는 0 으로 되돌리고, 그만큼 오래된 양수 로트에서 흡수한다.
  let overdraw = 0
  for (const lot of ordered) {
    if (lot.quantity < 0) {
      overdraw += -lot.quantity
      lot.quantity = 0
    }
  }
  const unabsorbedOverdraw = drainLotsFifo(ordered, overdraw)

  // 규칙 ③
  const unattributedReduction = drainLotsFifo(ordered, unlottedReduction)

  return {
    lots: ordered.filter((lot) => lot.quantity > 0),
    unabsorbedOverdraw,
    unattributedReduction,
  }
}

function splitMoney(value: number | null | undefined, quantity: number, totalQuantity: number) {
  if (value == null) return null
  if (!Number.isFinite(value) || totalQuantity <= 0) return null
  return Math.round((value * quantity / totalQuantity) * 100) / 100
}

function withAutoLotRaw(
  raw: Record<string, unknown> | undefined,
  allocation: { lotNo: string | null; quantity: number; autoAssigned: boolean },
  totalQuantity: number,
  splitCount: number
) {
  const base = raw ?? {}
  if (!allocation.autoAssigned) return base
  return {
    ...base,
    autoLot: {
      strategy: "fifo",
      lotNo: allocation.lotNo,
      allocatedQuantity: allocation.quantity,
      requestedQuantity: totalQuantity,
      splitCount,
    },
  }
}

function allocationReferenceNo(input: CreateHardwareMovementInput, index: number, allocationCount: number, lotNo: string | null) {
  const referenceNo = cleanString(input.referenceNo)
  if (!referenceNo || allocationCount <= 1 || index === 0 || isPlannedStatus(input.status)) return referenceNo
  const lotSuffix = cleanString(lotNo)?.replace(/[^\p{L}\p{N}_-]+/gu, "-") || `split-${index + 1}`
  return `${referenceNo}:lot:${lotSuffix}`
}

function buildMovementInsertRow(
  input: CreateHardwareMovementInput,
  options: {
    itemId: string
    productName: string
    quantity: number
    lotNo: string | null
    serials: string[]
    referenceNo?: string | null
    raw?: Record<string, unknown>
    convertedFromMovementId?: string
  }
): HardwareMovementInsertRow {
  return {
    item_id: options.itemId,
    product_name: options.productName,
    movement_type: input.movementType,
    quantity: options.quantity,
    occurred_at: input.occurredAt || null,
    from_location: normalizeLocationName(input.fromLocation),
    to_location: normalizeLocationName(input.toLocation),
    owner: cleanString(input.owner),
    status: cleanString(input.status),
    reference_no: cleanString(options.referenceNo ?? input.referenceNo),
    memo: cleanString(input.memo),
    serials: options.serials,
    lot_no: options.lotNo,
    unit_price: input.unitPrice ?? null,
    amount_usd: splitMoney(input.amountUsd, options.quantity, input.quantity),
    amount_cny: splitMoney(input.amountCny, options.quantity, input.quantity),
    storage_location: cleanString(input.storageLocation),
    importer: cleanString(input.importer),
    source: "admin_manual",
    raw: options.raw ?? input.raw ?? {},
    created_by: cleanString(input.createdBy),
    ...(options.convertedFromMovementId
      ? { converted_from_movement_id: options.convertedFromMovementId }
      : {}),
  }
}

async function insertHardwareMovementRows(rows: HardwareMovementInsertRow[]): Promise<HardwareMovement[]> {
  if (rows.length === 0) return []

  const sb = createSupabaseAdminClient()
  const { data, error } = await sb
    .from("hardware_movements")
    .insert(rows)
    .select("*")
  if (error) throw error

  return (data ?? []) as HardwareMovement[]
}

async function allocateOutboundLots(input: {
  itemId: string
  productName: string
  quantity: number
  explicitLotNo?: string | null
  excludeMovementIds?: string[]
}): Promise<Array<{ lotNo: string | null; quantity: number; autoAssigned: boolean }>> {
  const explicitLotNo = cleanString(input.explicitLotNo)
  const excluded = new Set(input.excludeMovementIds ?? [])
  const sb = createSupabaseAdminClient()
  // 품목당 이동이 1000행을 넘으면 lot 잔량이 조용히 틀어진다 — id 키셋으로 전량 읽는다.
  const data = await fetchAllSupabaseRows<HardwareMovement>((afterId, limit) => {
    let query = sb
      .from("hardware_movements")
      .select("*")
      .eq("item_id", input.itemId)
      .is("voided_at", null)
      .order("id", { ascending: true })
      .limit(limit)
    if (afterId) query = query.gt("id", afterId)
    return query
  })

  // 화면(computeHardwareStockRow)과 같은 해석기로 잔량을 낸다 — 따로 합산하면 화면에 없는 옛 로트
  // (예: STD1 H4·H5)가 새 출고에 자동으로 찍힌다(2026-09-14 운영 실측으로 재현).
  const lots = resolveHardwareLotBalances(data.filter((movement) => !excluded.has(movement.id))).lots
    .map((lot) => ({ lotNo: lot.lot, quantity: lot.quantity }))

  // 운영자가 로트를 **지정**했으면 그 로트 잔량을 검사한다 — 특정 로트를 골랐다는 명시적 판단이라,
  // 기록과 어긋나면 알려주는 편이 맞다. 지정을 비우면 아래 자동 배정으로 가며 그쪽은 막히지 않는다.
  if (explicitLotNo) {
    const explicit = lots.find((lot) => lot.lotNo === explicitLotNo)
    const available = explicit?.quantity ?? 0
    if (available < input.quantity) {
      throw new Error(
        `${input.productName} ${explicitLotNo} lot 재고가 부족합니다. 요청 ${input.quantity}대, 가능 ${available}대입니다. 로트 지정을 비우면 자동 배정됩니다.`
      )
    }
    return [{ lotNo: explicitLotNo, quantity: input.quantity, autoAssigned: false }]
  }

  let remaining = input.quantity
  const allocations: Array<{ lotNo: string | null; quantity: number; autoAssigned: boolean }> = []
  for (const lot of lots) {
    if (remaining <= 0) break
    const quantity = Math.min(remaining, lot.quantity)
    allocations.push({ lotNo: lot.lotNo, quantity, autoAssigned: true })
    remaining -= quantity
  }

  // 정책(운영자 결정 2026-09-14): **로트가 모자라도 출고를 막지 않는다.** 해석 가능한 만큼 FIFO 로
  // 배정하고 나머지는 로트 미지정(lot_no NULL) 한 줄로 기록한다.
  // 예전에는 여기서 throw 했다. 그런데 운영 원장은 로트 기록이 부분적이라(시트 임포트 385건 전부
  // lot_no NULL, OPS·A1·D2·케이블은 로트 기록이 아예 없음) 실제 출고를 원장에 남길 방법이 없었다.
  // 로트는 추적 메타데이터이고, 출고 자체를 기록하지 못하게 막는 것이 더 큰 손실이다.
  // 나중에 로트가 확인되면 이 줄을 수정해 로트를 채우면 되고, 로트 해석기가 그 사이를 흡수한다.
  if (remaining > 0) {
    allocations.push({ lotNo: null, quantity: remaining, autoAssigned: true })
  }

  return allocations
}

async function buildMovementInsertRows(
  input: CreateHardwareMovementInput,
  itemId: string,
  productName: string,
  options: { excludeMovementIds?: string[]; convertedFromMovementId?: string } = {}
): Promise<HardwareMovementInsertRow[]> {
  const serials = input.serials ?? []
  const allocations =
    input.movementType === "outbound" && !isPlannedStatus(input.status)
      ? await allocateOutboundLots({
          itemId,
          productName,
          quantity: input.quantity,
          explicitLotNo: input.lotNo,
          excludeMovementIds: options.excludeMovementIds,
        })
      : [{ lotNo: cleanString(input.lotNo), quantity: input.quantity, autoAssigned: false }]

  let serialOffset = 0
  return allocations.map((allocation, allocationIndex) => {
    const allocationSerials =
      serials.length === input.quantity
        ? serials.slice(serialOffset, serialOffset + allocation.quantity)
        : serials
    serialOffset += allocation.quantity
    return buildMovementInsertRow(input, {
      itemId,
      productName,
      quantity: allocation.quantity,
      lotNo: allocation.lotNo,
      serials: allocationSerials,
      referenceNo: allocationReferenceNo(input, allocationIndex, allocations.length, allocation.lotNo),
      raw: withAutoLotRaw(input.raw, allocation, input.quantity, allocations.length),
      convertedFromMovementId: options.convertedFromMovementId,
    })
  })
}

async function resolveHardwareMovementTarget(input: CreateHardwareMovementInput) {
  const productName = normalizeProductName(input.productName)
  if (!productName) throw new Error("제품명은 필수입니다.")
  if (!HARDWARE_MOVEMENT_TYPES.includes(input.movementType)) {
    throw new Error("입출고 유형이 올바르지 않습니다.")
  }
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new Error("수량은 1 이상 정수여야 합니다.")
  }

  let itemId = input.itemId
  if (!itemId) {
    const items = await ensureHardwareItems([{ name: productName }])
    itemId = items.get(productName)?.id
  }
  if (!itemId) throw new Error("하드웨어 품목을 만들 수 없습니다.")

  return { itemId, productName }
}

export async function createHardwareMovements(inputs: CreateHardwareMovementInput[]): Promise<HardwareMovement[]> {
  if (inputs.length === 0) return []
  if (inputs.length > 50) throw new Error("한 번에 저장할 수 있는 하드웨어 기록은 최대 50건입니다.")

  const rows: HardwareMovementInsertRow[] = []
  const batchCrmKeys = new Set<string>()

  for (const input of inputs) {
    const { itemId, productName } = await resolveHardwareMovementTarget(input)
    const referenceNo = cleanString(input.referenceNo)
    if (referenceNo && isCrmReference(referenceNo)) {
      const key = `${referenceNo}\u0000${productName}\u0000${isPlannedStatus(input.status) ? "planned" : "actual"}`
      if (batchCrmKeys.has(key)) {
        throw new Error("같은 CRM 오더와 품목이 장바구니에 중복으로 담겨 있습니다.")
      }
      batchCrmKeys.add(key)
    }

    await ensureNoDuplicateCrmMovement({
      productName,
      referenceNo: input.referenceNo,
      status: input.status,
    })

    rows.push(...await buildMovementInsertRows(input, itemId, productName))
  }

  const inserted = await insertHardwareMovementRows(rows)
  if (inserted.length === 0) throw new Error("하드웨어 입출고 기록을 만들 수 없습니다.")

  revalidateTag(HARDWARE_INVENTORY_CACHE_TAG, "max")
  return inserted
}

export async function createHardwareMovementRows(input: CreateHardwareMovementInput): Promise<HardwareMovement[]> {
  const inserted = await createHardwareMovements([input])
  if (inserted.length === 0) throw new Error("하드웨어 입출고 기록을 만들 수 없습니다.")
  return inserted
}

export async function createHardwareMovement(input: CreateHardwareMovementInput): Promise<HardwareMovement> {
  const inserted = await createHardwareMovementRows(input)
  const movement = inserted[0]
  if (!movement) throw new Error("하드웨어 입출고 기록을 만들 수 없습니다.")
  return movement
}

function isMissingRpcError(error: { code?: string; message?: string }, rpcName: string) {
  return (
    error.code === "PGRST202" ||
    new RegExp(`${rpcName}|schema cache|function`, "i").test(error.message ?? "")
  )
}

/**
 * 확정할 예정 행의 로트 배정을 앱에서 계산한다 — v3 RPC 로 넘길 값.
 *
 * 로트 규칙을 SQL 에 두 번째로 구현하지 않기 위해서다(v2 는 lot_no 칸만 봐서, lot_no 가 전부 NULL 인
 * 운영 원장에서 확정이 전부 실패했다). 예정 행이 없거나 확정 대상이 아니면 빈 배정을 돌려준다 —
 * 그 경우 v3 가 표준 오류 문구("찾을 수 없습니다" 등)로 거절하므로 검증을 여기서 중복하지 않는다.
 */
async function planConfirmLotAllocations(
  id: string,
  confirmQty: number | null
): Promise<Array<{ lotNo: string | null; quantity: number }>> {
  const sb = createSupabaseAdminClient()
  const { data, error } = await sb
    .from("hardware_movements")
    .select("id,item_id,product_name,quantity,lot_no,movement_type,status,voided_at")
    .eq("id", id)
    .maybeSingle()
  if (error) throw error

  const planned = data as Pick<
    HardwareMovement,
    "id" | "item_id" | "product_name" | "quantity" | "lot_no" | "movement_type" | "status" | "voided_at"
  > | null
  if (!planned || planned.voided_at || planned.movement_type !== "outbound" || !isPlannedStatus(planned.status)) {
    return []
  }

  const effectiveQty = Math.min(confirmQty ?? planned.quantity, planned.quantity)
  if (!Number.isFinite(effectiveQty) || effectiveQty <= 0) return []

  // 확정되는 예정 행 자신은 잔량 계산에서 뺀다 — 로트 없는 예정 출고는 해석기에서 FIFO 로 로트를
  // 예약하므로, 빼지 않으면 자기가 잡아 둔 로트를 자기가 못 쓰는 셈이 된다.
  const allocations = await allocateOutboundLots({
    itemId: planned.item_id,
    productName: planned.product_name,
    quantity: effectiveQty,
    explicitLotNo: planned.lot_no,
    excludeMovementIds: [planned.id],
  })
  return allocations.map(({ lotNo, quantity }) => ({ lotNo, quantity }))
}

export async function confirmPlannedHardwareMovement(
  id: string,
  input: { occurredAt?: string | null; actor?: string | null; confirmQty?: number | null }
): Promise<HardwareMovement> {
  const sb = createSupabaseAdminClient()
  const args = {
    planned_id: id,
    actor: input.actor ?? null,
    occurred_on: input.occurredAt ?? null,
    confirm_qty: input.confirmQty ?? null,
  }

  // v3: 로트 배정은 앱이 계산해 넘기고, 로트가 모자라면 나머지를 로트 미지정으로 기록한다.
  const lotAllocations = await planConfirmLotAllocations(id, input.confirmQty ?? null)
  const v3 = await sb.rpc("confirm_hardware_planned_movement_v3", {
    ...args,
    lot_allocations: lotAllocations.map((allocation) => ({ lot_no: allocation.lotNo, quantity: allocation.quantity })),
  })
  if (!v3.error) {
    revalidateTag(HARDWARE_INVENTORY_CACHE_TAG, "max")
    return v3.data as HardwareMovement
  }
  if (!isMissingRpcError(v3.error, "confirm_hardware_planned_movement_v3")) throw v3.error

  // v3 마이그레이션(20260914_hardware_confirm_planned_v3.sql)이 아직 없으면 v2 로 떨어진다 — 배포와
  // 마이그레이션 적용 순서를 분리하기 위해서다. 이 경로는 예전과 똑같이 동작하므로 더 나빠지지 않는다.
  const v2 = await sb.rpc("confirm_hardware_planned_movement_v2", args)
  if (!v2.error) {
    revalidateTag(HARDWARE_INVENTORY_CACHE_TAG, "max")
    return v2.data as HardwareMovement
  }

  if (!isMissingRpcError(v2.error, "confirm_hardware_planned_movement_v2")) {
    // v2 는 lot_no 칸만 봐서 로트 미지정 예정 출고를 전부 거절한다. 운영자가 이유를 알 수 있게
    // "무엇이 빠졌는지"를 문구로 드러낸다 — 원문만 보이면 재고가 정말 없는 것으로 오해한다.
    if (/lot 재고가 부족/.test(v2.error.message ?? "")) {
      throw new Error(
        `확정 기능 업데이트(DB v3)가 아직 적용되지 않아 로트 미지정 출고를 확정할 수 없습니다. 관리자에게 적용을 요청하세요. (원래 오류: ${v2.error.message})`
      )
    }
    throw v2.error
  }

  const legacy = await sb.rpc("confirm_hardware_planned_movement", args)
  if (legacy.error) throw legacy.error

  revalidateTag(HARDWARE_INVENTORY_CACHE_TAG, "max")
  return legacy.data as HardwareMovement
}

export async function voidHardwareMovement(
  id: string,
  input: { reason?: string | null; actor?: string | null }
): Promise<HardwareMovement> {
  const reason = cleanString(input.reason) ?? "관리자 취소"
  const sb = createSupabaseAdminClient()
  const { data: existing, error: existingError } = await sb
    .from("hardware_movements")
    .select("id,source,voided_at")
    .eq("id", id)
    .maybeSingle()
  if (existingError) throw existingError
  if (!existing) throw new Error("원장 기록을 찾을 수 없습니다.")
  const row = existing as { id: string; source: string; voided_at: string | null }
  if (row.source !== "admin_manual") {
    throw new Error("시트 이관 기록은 직접 취소할 수 없습니다. 수기 조정으로 보정하세요.")
  }
  if (row.voided_at) {
    throw new Error("이미 취소되었거나 처리된 원장 기록입니다.")
  }

  const { data, error } = await sb
    .from("hardware_movements")
    .update({
      voided_at: new Date().toISOString(),
      voided_by: cleanString(input.actor),
      void_reason: reason,
    })
    .eq("id", id)
    .select("*")
    .single()
  if (error) throw error

  revalidateTag(HARDWARE_INVENTORY_CACHE_TAG, "max")
  return data as HardwareMovement
}

export async function updateHardwareMovement(
  id: string,
  input: CreateHardwareMovementInput,
  options?: { canFinalize?: boolean }
): Promise<HardwareMovement> {
  const productName = normalizeProductName(input.productName)
  if (!productName) throw new Error("제품명은 필수입니다.")
  if (!HARDWARE_MOVEMENT_TYPES.includes(input.movementType)) {
    throw new Error("입출고 유형이 올바르지 않습니다.")
  }
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new Error("수량은 1 이상 정수여야 합니다.")
  }

  const sb = createSupabaseAdminClient()
  const { data: existing, error: existingError } = await sb
    .from("hardware_movements")
    .select("id,source,movement_type,status,voided_at,converted_from_movement_id,converted_to_movement_id")
    .eq("id", id)
    .maybeSingle()
  if (existingError) throw existingError
  if (!existing) throw new Error("원장 기록을 찾을 수 없습니다.")
  const row = existing as {
    source: string
    movement_type: string
    status: string | null
    voided_at: string | null
    converted_from_movement_id: string | null
    converted_to_movement_id: string | null
  }
  if (row.source !== "admin_manual") {
    throw new Error("시트 이관 기록은 수정할 수 없습니다. 수기 조정으로 보정하세요.")
  }
  if (row.voided_at) {
    throw new Error("취소된 기록은 수정할 수 없습니다.")
  }
  if (row.converted_from_movement_id || row.converted_to_movement_id) {
    throw new Error("전환된 기록은 수정할 수 없습니다.")
  }
  // 권한 정렬: 확정·취소가 hardware.finalize인데 update는 무제한이면 실현 원장을 우회 재작성할 수
  // 있다. 예정(planned) 행 편집은 에디터 업무라 열어두고, (1) 실현 기록 수정과 (2) 예정→실현
  // 상태 전환(확정 우회)만 finalize를 요구한다.
  if (options?.canFinalize === false) {
    const wasPlanned = row.movement_type === "outbound" && isPlannedStatus(row.status)
    if (!wasPlanned) {
      throw new Error("실제 반영된 기록 수정은 확정 권한(hardware.finalize)이 필요합니다.")
    }
    const staysPlanned = input.movementType === "outbound" && isPlannedStatus(cleanString(input.status))
    if (!staysPlanned) {
      throw new Error("예정을 실제 출고로 바꾸는 확정은 확정 권한(hardware.finalize)이 필요합니다.")
    }
  }

  let itemId = input.itemId
  if (!itemId) {
    const items = await ensureHardwareItems([{ name: productName }])
    itemId = items.get(productName)?.id
  }
  if (!itemId) throw new Error("하드웨어 품목을 만들 수 없습니다.")

  const { data, error } = await sb
    .from("hardware_movements")
    .update({
      item_id: itemId,
      product_name: productName,
      movement_type: input.movementType,
      quantity: input.quantity,
      occurred_at: input.occurredAt || null,
      from_location: normalizeLocationName(input.fromLocation),
      to_location: normalizeLocationName(input.toLocation),
      owner: cleanString(input.owner),
      status: cleanString(input.status),
      reference_no: cleanString(input.referenceNo),
      memo: cleanString(input.memo),
      serials: input.serials ?? [],
      lot_no: cleanString(input.lotNo),
      unit_price: input.unitPrice ?? null,
      amount_usd: input.amountUsd ?? null,
      amount_cny: input.amountCny ?? null,
      storage_location: cleanString(input.storageLocation),
      importer: cleanString(input.importer),
    })
    .eq("id", id)
    .select("*")
    .single()
  if (error) throw error

  revalidateTag(HARDWARE_INVENTORY_CACHE_TAG, "max")
  return data as HardwareMovement
}

export async function updateHardwareItem(
  id: string,
  input: UpdateHardwareItemInput
): Promise<HardwareItem> {
  const patch: Record<string, unknown> = {}
  if (input.reorderPoint != null) patch.reorder_point = input.reorderPoint
  if (input.leadTimeDays != null) patch.lead_time_days = input.leadTimeDays
  if (input.category !== undefined) patch.category = cleanString(input.category)
  if (input.sku !== undefined) patch.sku = cleanString(input.sku)
  if (input.sourceAliases !== undefined) patch.source_aliases = normalizeAliases(input.sourceAliases)
  if (input.active != null) patch.active = input.active

  if (Object.keys(patch).length === 0) {
    throw new Error("변경할 값이 없습니다.")
  }

  const sb = createSupabaseAdminClient()
  const { data, error } = await sb
    .from("hardware_items")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single()
  if (error) throw error

  revalidateTag(HARDWARE_INVENTORY_CACHE_TAG, "max")
  return data as HardwareItem
}

async function startImportRun() {
  const sb = createSupabaseAdminClient()
  const { data, error } = await sb
    .from("hardware_import_runs")
    .insert({ source: "branch_hw_sheet", status: "running" })
    .select("id")
    .single()
  if (error) throw error
  return String(data.id)
}

async function finishImportRun(
  id: string,
  patch: {
    status: "success" | "failed"
    rowsImported?: number
    rowsSkipped?: number
    error?: string
    raw?: Record<string, unknown>
  }
) {
  const sb = createSupabaseAdminClient()
  const update: Record<string, unknown> = {
    status: patch.status,
    rows_imported: patch.rowsImported,
    rows_skipped: patch.rowsSkipped,
    error: patch.error,
    finished_at: new Date().toISOString(),
  }
  if (patch.raw) update.raw = patch.raw
  const { error } = await sb
    .from("hardware_import_runs")
    .update(update)
    .eq("id", id)
  if (error) throw error
}

interface ImportMovementRow {
  item_id: string
  product_name: string
  movement_type: HardwareMovementType
  quantity: number
  occurred_at: string | null
  from_location: string | null
  to_location: string | null
  owner: string | null
  status: string | null
  reference_no: string | null
  memo: string | null
  serials: string[]
  unit_price: number | null
  amount_usd: number | null
  // 보관처 원문 — FPL 사이트명("인천 더조은")처럼 to_location이 창고로 정규화되는 경우에도
  // 실제 물리 위치를 잃지 않도록 RPC의 storage_location 컬럼에 그대로 싣는다.
  storage_location?: string | null
  source_table: string
  source_key: string
  source_digest: string
  raw: unknown
}

// Position-independent natural identity for sheet rows. source_key = fingerprint
// (product + date + 물류No + a stable intra-group ordinal) so two identical bulk-PO
// lines get distinct keys that survive reorder; source_digest = content hash so the
// additive merge can tell an edited row from an unchanged one. Stock-reconciliation
// (adjust) rows are keyed product-only (one official figure per product).
function sheetIdentityTiebreak(row: ImportMovementRow): string {
  return JSON.stringify([(row.serials ?? []).join("|"), row.memo ?? "", row.quantity, JSON.stringify(row.raw ?? {})])
}

function assignSheetImportIdentity(rows: ImportMovementRow[]) {
  const groups = new Map<string, ImportMovementRow[]>()
  for (const row of rows) {
    if (row.source_table === "branch_hw_stock") continue
    const groupKey = JSON.stringify([row.source_table, row.product_name, row.occurred_at ?? "", row.reference_no ?? ""])
    const bucket = groups.get(groupKey)
    if (bucket) bucket.push(row)
    else groups.set(groupKey, [row])
  }
  for (const bucket of groups.values()) {
    bucket.sort((a, b) => {
      const ta = sheetIdentityTiebreak(a)
      const tb = sheetIdentityTiebreak(b)
      return ta < tb ? -1 : ta > tb ? 1 : 0
    })
    bucket.forEach((row, ordinal) => {
      row.source_key = hashSourceKey([row.source_table, row.product_name, row.occurred_at ?? "", row.reference_no ?? "", ordinal])
      row.source_digest = hashSourceKey([
        row.quantity, row.status ?? "", row.from_location ?? "", row.to_location ?? "",
        row.owner ?? "", (row.serials ?? []).join("|"), row.memo ?? "", row.reference_no ?? "",
        String(row.unit_price ?? ""), String(row.amount_usd ?? ""),
      ])
    })
  }
  for (const row of rows) {
    if (row.source_table !== "branch_hw_stock") continue
    row.source_key = hashSourceKey(["stock-reconciliation", row.product_name])
    row.source_digest = hashSourceKey([row.quantity, row.from_location ?? "", row.to_location ?? ""])
  }
}

interface HardwareSheetImportSnapshot {
  id: string
  checksum: string
  created_at: string
}

// row.raw 등 unknown 데이터에 BigInt/순환참조가 섞이면 JSON.stringify가 throw → import 전체 중단.
// 안전 직렬화: BigInt는 문자열로, 순환은 생략. 정상 데이터는 출력 동일이라 checksum 불변.
function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>()
  return JSON.stringify(value, (_key, val) => {
    if (typeof val === "bigint") return val.toString()
    if (typeof val === "object" && val !== null) {
      if (seen.has(val)) return undefined
      seen.add(val)
    }
    return val
  })
}

function checksumImportSnapshot(value: unknown) {
  return createHash("sha256").update(safeStringify(value)).digest("hex")
}

function getImportWarehouseBalances(rows: ImportMovementRow[]) {
  const balances = new Map<string, number>()
  const apply = (product: string, delta: number) => {
    balances.set(product, (balances.get(product) ?? 0) + delta)
  }

  for (const row of rows) {
    const product = normalizeProductName(row.product_name)
    if (!product) continue

    if (row.movement_type === "inbound") {
      if ((normalizeLocationName(row.to_location) ?? DEFAULT_STOCK_LOCATION) === DEFAULT_STOCK_LOCATION) {
        apply(product, row.quantity)
      }
    } else if (row.movement_type === "outbound") {
      if (isPlannedStatus(row.status)) continue
      if ((normalizeLocationName(row.from_location) ?? DEFAULT_STOCK_LOCATION) === DEFAULT_STOCK_LOCATION) {
        apply(product, -row.quantity)
      }
    } else if (row.movement_type === "return") {
      if (normalizeLocationName(row.from_location) === DEFAULT_STOCK_LOCATION) apply(product, -row.quantity)
      if ((normalizeLocationName(row.to_location) ?? DEFAULT_STOCK_LOCATION) === DEFAULT_STOCK_LOCATION) {
        apply(product, row.quantity)
      }
    } else if (row.movement_type === "transfer" || row.movement_type === "repair") {
      if ((normalizeLocationName(row.from_location) ?? DEFAULT_STOCK_LOCATION) === DEFAULT_STOCK_LOCATION) {
        apply(product, -row.quantity)
      }
      if (normalizeLocationName(row.to_location) === DEFAULT_STOCK_LOCATION) apply(product, row.quantity)
    } else if (row.movement_type === "adjust") {
      if (row.from_location && !row.to_location) {
        if (normalizeLocationName(row.from_location) === DEFAULT_STOCK_LOCATION) apply(product, -row.quantity)
      } else if ((normalizeLocationName(row.to_location) ?? DEFAULT_STOCK_LOCATION) === DEFAULT_STOCK_LOCATION) {
        apply(product, row.quantity)
      }
    }
  }

  return balances
}

async function listCurrentSheetImportMovements() {
  const sb = createSupabaseAdminClient()
  const { data, error } = await sb
    .from("hardware_movements")
    .select("*")
    .eq("source", "sheet_import")
  if (error) throw error
  return data ?? []
}

async function createHardwareSheetImportSnapshot(input: {
  runId: string
  actor?: string | null
  sourcePayload: Record<string, unknown>
  candidateMovements: ImportMovementRow[]
  previousSheetMovements: unknown[]
}): Promise<HardwareSheetImportSnapshot> {
  const rowCounts = {
    previous_sheet_movements: input.previousSheetMovements.length,
    candidate_movements: input.candidateMovements.length,
    branch_hw_inbound: Array.isArray(input.sourcePayload.branch_hw_inbound)
      ? input.sourcePayload.branch_hw_inbound.length
      : 0,
    branch_hw_outbound: Array.isArray(input.sourcePayload.branch_hw_outbound)
      ? input.sourcePayload.branch_hw_outbound.length
      : 0,
    branch_hw_stock: Array.isArray(input.sourcePayload.branch_hw_stock)
      ? input.sourcePayload.branch_hw_stock.length
      : 0,
  }
  const checksumInput = {
    sourcePayload: input.sourcePayload,
    candidateMovements: input.candidateMovements,
    previousSheetMovements: input.previousSheetMovements,
    rowCounts,
  }

  const sb = createSupabaseAdminClient()
  const { data, error } = await sb
    .from("hardware_sheet_import_snapshots")
    .insert({
      import_run_id: input.runId,
      created_by: cleanString(input.actor),
      source_payload: input.sourcePayload,
      candidate_movements: input.candidateMovements,
      previous_sheet_movements: input.previousSheetMovements,
      row_counts: rowCounts,
      checksum: checksumImportSnapshot(checksumInput),
    })
    .select("id,checksum,created_at")
    .single()
  if (error) throw new Error(getErrorMessage(error))
  return data as HardwareSheetImportSnapshot
}

export async function importHardwareFromBranchSheets(
  options: { actor?: string | null } = {}
): Promise<HardwareSheetImportResult> {
  const runId = await startImportRun()

  try {
    const [inbound, outbound, stock] = await Promise.all([
      listFreshHwInbound(),
      listFreshHwOutbound(),
      listFreshHwStock(),
    ])
    const outboundOrInboundProducts = new Set<string>()
    const productInputs: Array<{ name: string; category?: string | null }> = []

    for (const row of inbound) {
      productInputs.push({ name: row.product })
      outboundOrInboundProducts.add(normalizeProductName(row.product))
    }
    for (const row of outbound) {
      productInputs.push({ name: row.product })
      outboundOrInboundProducts.add(normalizeProductName(row.product))
    }
    for (const row of stock) {
      productInputs.push({ name: row.product, category: row.category })
    }

    const itemsByName = await ensureHardwareItems(productInputs)
    const rows: ImportMovementRow[] = []
    let skipped = 0

    inbound.forEach((row) => {
      const product = normalizeProductName(row.product)
      const item = itemsByName.get(product)
      if (!item || !Number.isFinite(row.quantity) || row.quantity <= 0) {
        skipped += 1
        return
      }

      rows.push({
        item_id: item.id,
        product_name: product,
        movement_type: "inbound",
        quantity: row.quantity,
        occurred_at: row.inbound_date,
        from_location: normalizeLocationName(row.importer),
        to_location: normalizeLocationName(row.storage) ?? DEFAULT_STOCK_LOCATION,
        owner: cleanString(row.importer),
        status: "입고",
        reference_no: cleanString(row.logistics_no),
        memo: cleanString(row.remarks),
        storage_location: cleanString(row.storage),
        serials: row.serials ?? [],
        // Inbound cost is imported in USD (hardware is sourced in USD); the parser
        // already stripped any currency symbol so the number is currency-agnostic.
        unit_price: row.unit_price,
        amount_usd: row.amount,
        source_table: "branch_hw_inbound",
        source_key: "",
        source_digest: "",
        raw: row.raw ?? {},
      })
    })

    outbound.forEach((row) => {
      const product = normalizeProductName(row.product)
      const item = itemsByName.get(product)
      if (!item || !Number.isFinite(row.quantity) || row.quantity <= 0) {
        skipped += 1
        return
      }

      const sampleLike = isSampleLikeText(row.type, row.remarks, row.destination, row.progress)
      rows.push({
        item_id: item.id,
        product_name: product,
        movement_type: "outbound",
        quantity: row.quantity,
        occurred_at: row.outbound_date,
        from_location: DEFAULT_STOCK_LOCATION,
        to_location: sampleLike
          ? DEFAULT_SAMPLE_LOCATION
          : normalizeLocationName(row.destination) ?? DEFAULT_CUSTOMER_LOCATION,
        owner: cleanString(row.owner),
        status: sampleLike ? cleanString(row.progress) ?? "샘플/대여" : cleanString(row.progress) ?? "출고",
        reference_no: cleanString(row.logistics_no),
        memo: [row.type, row.remarks].map(cleanString).filter(Boolean).join(" · ") || null,
        serials: row.serials ?? [],
        // Outbound revenue lives in branch_hw_outbound (매출 USD col). unit_price is
        // an inbound-cost concept, so it stays null; amount_usd carries the sale revenue
        // (mirrors how inbound sets amount_usd from the 입고 sheet amount).
        unit_price: null,
        amount_usd: row.revenue ?? null,
        source_table: "branch_hw_outbound",
        source_key: "",
        source_digest: "",
        raw: row.raw ?? {},
      })
    })

    const warehouseBalances = getImportWarehouseBalances(rows)
    // 재고현황은 제품별 총량표다. 같은 정규화 제품이 여러 행이면 마지막 공식 수치를 사용해
    // 제품당 하나의 보정 행만 만든다(product-only source_key 충돌 방지).
    const officialByProduct = new Map<string, { item: { id: string }; quantity: number; raw: unknown }>()
    for (const row of stock) {
      const product = normalizeProductName(row.product)
      let item = itemsByName.get(product)
      if (!item) {
        const stockItem = await ensureHardwareItems([{ name: product, category: row.category }])
        item = stockItem.get(product)
        if (item) itemsByName.set(product, item)
      }
      if (!item || !Number.isFinite(row.quantity)) {
        skipped += 1
        continue
      }
      officialByProduct.set(product, { item, quantity: row.quantity, raw: row.raw })
    }
    for (const [product, info] of officialByProduct) {
      const currentWarehouseStock = warehouseBalances.get(product) ?? 0
      const adjustmentDelta = info.quantity - currentWarehouseStock
      if (adjustmentDelta === 0) continue
      const adjustmentQuantity = Math.abs(adjustmentDelta)

      rows.push({
        item_id: info.item.id,
        product_name: product,
        movement_type: "adjust",
        quantity: adjustmentQuantity,
        occurred_at: null,
        from_location: adjustmentDelta < 0 ? DEFAULT_STOCK_LOCATION : null,
        to_location: adjustmentDelta > 0 ? DEFAULT_STOCK_LOCATION : null,
        owner: null,
        status: "현재고 보정",
        reference_no: null,
        memo: `재고현황 현재고 ${info.quantity}대 기준 보정`,
        serials: [],
        unit_price: null,
        amount_usd: null,
        source_table: "branch_hw_stock",
        source_key: "",
        source_digest: "",
        raw: {
          source: "branch_hw_stock_reconciliation",
          stock_row: info.raw ?? {},
          official_quantity: info.quantity,
          calculated_warehouse_quantity: currentWarehouseStock,
          adjustment_delta: adjustmentDelta,
        },
      })
      warehouseBalances.set(product, info.quantity)
    }

    assignSheetImportIdentity(rows)

    const previousSheetMovements = await listCurrentSheetImportMovements()
    const snapshot = await createHardwareSheetImportSnapshot({
      runId,
      actor: options.actor,
      sourcePayload: {
        branch_hw_inbound: inbound,
        branch_hw_outbound: outbound,
        branch_hw_stock: stock,
      },
      candidateMovements: rows,
      previousSheetMovements,
    })
    const additiveMerge =
      process.env.HARDWARE_SHEET_ADDITIVE_MERGE === "1" ||
      process.env.HARDWARE_SHEET_ADDITIVE_MERGE === "true"
    const sb = createSupabaseAdminClient()
    const { data, error } = await sb.rpc(
      additiveMerge ? "merge_hardware_sheet_import" : "replace_hardware_sheet_import",
      { rows, run_id: runId, snapshot_id: snapshot.id }
    )
    if (error) throw error

    const mergeCounts =
      additiveMerge && data && typeof data === "object"
        ? (data as { inserted?: number; updated?: number; tombstoned?: number; revived?: number })
        : null
    const imported = mergeCounts
      ? (Number(mergeCounts.inserted) || 0) + (Number(mergeCounts.updated) || 0)
      : typeof data === "number"
        ? data
        : rows.length
    await finishImportRun(runId, {
      status: "success",
      rowsImported: imported,
      rowsSkipped: skipped,
      raw: {
        mode: additiveMerge ? "additive_merge" : "replace",
        merge: mergeCounts,
        snapshot_id: snapshot.id,
        snapshot_checksum: snapshot.checksum,
        snapshot_created_at: snapshot.created_at,
      },
    })
    revalidateTag(HARDWARE_INVENTORY_CACHE_TAG, "max")
    return {
      imported,
      skipped,
      runId,
      snapshotId: snapshot.id,
      snapshotChecksum: snapshot.checksum,
      snapshotCreatedAt: snapshot.created_at,
    }
  } catch (error) {
    await finishImportRun(runId, {
      status: "failed",
      error: getErrorMessage(error),
    }).catch(() => undefined)
    throw error
  }
}

export interface HardwareSheetImportSnapshotSummary {
  id: string
  importRunId: string
  createdAt: string
  createdBy: string | null
  checksum: string
  // 스냅샷 생성 시점에 이미 계산해 둔 카운트(row_counts, createHardwareSheetImportSnapshot 참고) —
  // previous_sheet_movements 원본 배열(품목당 이동 전체를 담아 큼)을 다시 읽지 않고도
  // "복원하면 몇 건으로 되돌아가는지"를 목록에서 바로 보여줄 수 있다.
  previousMovementCount: number
  candidateMovementCount: number
}

// 감사(2026-09-07 #4): restore_hardware_sheet_import_snapshot RPC(20260701_hardware_restore_
// snapshot_guard.sql — previous_sheet_movements가 비어 있으면 fail-closed로 거부)는 있는데
// UI/API 어디에도 연결돼 있지 않았다. 이 함수가 화면에 노출할 스냅샷 목록을 만든다(최신순).
export async function listHardwareSheetImportSnapshots(limit = 10): Promise<HardwareSheetImportSnapshotSummary[]> {
  const sb = createSupabaseAdminClient()
  const { data, error } = await sb
    .from("hardware_sheet_import_snapshots")
    .select("id,import_run_id,created_at,created_by,checksum,row_counts")
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) throw error

  return ((data ?? []) as Array<{
    id: string
    import_run_id: string
    created_at: string
    created_by: string | null
    checksum: string
    row_counts: unknown
  }>).map((row) => {
    const counts = isRecord(row.row_counts) ? row.row_counts : {}
    const readCount = (key: string) => (typeof counts[key] === "number" ? (counts[key] as number) : 0)
    return {
      id: row.id,
      importRunId: row.import_run_id,
      createdAt: row.created_at,
      createdBy: row.created_by,
      checksum: row.checksum,
      previousMovementCount: readCount("previous_sheet_movements"),
      candidateMovementCount: readCount("candidate_movements"),
    }
  })
}

export interface HardwareSheetImportRestoreResult {
  restoredCount: number
}

// 실행하면 되돌릴 수 없다 — 현재 sheet_import 원장을 전부 지우고 스냅샷 시점으로 교체한다
// (restore_hardware_sheet_import_snapshot RPC, security definer). 호출부(API 라우트)가
// hardware.finalize capability를 요구하고 감사 로그를 남겨야 한다 — 이 함수 자체는 그 게이트를
// 강제하지 않으므로(레포지토리 계층은 항상 호출부의 권한 검증에 의존) 단독 호출 금지.
export async function restoreHardwareSheetImportSnapshot(
  snapshotId: string,
  actor: string | null
): Promise<HardwareSheetImportRestoreResult> {
  const sb = createSupabaseAdminClient()
  const { data, error } = await sb.rpc("restore_hardware_sheet_import_snapshot", {
    snapshot_id: snapshotId,
    actor: actor ?? null,
  })
  if (error) throw error

  revalidateTag(HARDWARE_INVENTORY_CACHE_TAG, "max")
  return { restoredCount: typeof data === "number" ? data : 0 }
}

function applyLocationDelta(map: Map<string, number>, location: string | null | undefined, delta: number) {
  const key = normalizeLocationName(location)
  if (!key) return
  map.set(key, (map.get(key) ?? 0) + delta)
}

function movementDate(movement: Pick<HardwareMovement, "occurred_at" | "created_at">) {
  const value = movement.occurred_at ?? movement.created_at
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : 0
}

// 응답에 실리는 raw 투영 — 클라이언트 extractCrmLink(inventory/shared.tsx)와 같은 판정으로 raw가 객체이고
// raw.crmLink가 객체일 때만 { crmLink }를 남긴다. 시트 임포트 행의 raw는 원본 시트 행 전체라 응답 대부분을
// 차지하는데, recoverMoneyFromRaw가 이미 금액·수입자를 컬럼으로 끌어올린 뒤라 여기서 버려도 안전하다.
// 수정 API는 raw를 patch로 받을 때만 덮어쓰고 클라이언트는 보내지 않으므로 저장본은 그대로다.
function extractRawCrmLink(raw: unknown): HardwareMovementView["raw"] {
  if (!isRecord(raw)) return null
  const crmLink = raw.crmLink
  return isRecord(crmLink) ? { crmLink } : null
}

function toMovementView(movement: HardwareMovementLedgerRow): HardwareMovementView {
  const { raw, ...rest } = movement
  return { ...rest, raw: extractRawCrmLink(raw), planned: isPlannedStatus(movement.status) }
}

function toItemView(item: HardwareItem): HardwareItemView {
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    reorder_point: item.reorder_point,
    lead_time_days: item.lead_time_days,
    source_aliases: item.source_aliases,
  }
}

export interface HardwareStockRowComputeInput {
  item: Pick<HardwareItem, "id" | "name" | "category" | "reorder_point" | "lead_time_days">
  // 이 품목(item_id)에 속한 취소되지 않은(voided_at null) 이동만 — 호출부(getHardwareDashboardUncached)가
  // 이미 item_id별로 버킷팅해서 넘긴다. 순서는 무관(합산·최신값 비교만 하고 상태를 안 들고 다닌다).
  itemMovements: readonly HardwareMovementLedgerRow[]
  // Date.now() - 30일(ms) — 호출부가 한 번만 계산해 모든 품목에 같은 시각 기준을 적용한다.
  // 이 함수 안에서 다시 Date.now()를 부르면 같은 배치 안에서도 품목마다 경계가 미세하게 어긋나고,
  // 테스트가 벽시계에 의존하게 된다.
  cutoff30dMs: number
}

// 재고 산식 엔진 — 위치별/lot별 잔량, 30일 출고 추세, 재주문점을 한 품목 단위로 계산하는 순수 함수.
// 감사(2026-09-07 #3): getHardwareDashboardUncached의 .map() 콜백에 인라인으로만 있어 실측 테스트가
// 0건이었다. 로직은 그대로 옮겼다(동작 변경 없음) — 재사용하는 모듈 스코프 헬퍼(classifyDestination·
// movementLotKey·applyLocationDelta·movementDate·isPlannedStatus·isPromotedProduct)와 위치 상수는
// 이 파일 안이라 그대로 참조한다.
export function computeHardwareStockRow(input: HardwareStockRowComputeInput): HardwareStockRow {
  const { item, itemMovements, cutoff30dMs } = input
  const locationBalances = new Map<string, number>()
  let plannedOut = 0
  let outbound30d = 0

  for (const movement of itemMovements) {
    const qty = movement.quantity
    const occurredTime = movementDate(movement)
    const destinationKind = classifyDestination(movement.to_location)

    if (movement.movement_type === "inbound") {
      applyLocationDelta(locationBalances, movement.to_location ?? DEFAULT_STOCK_LOCATION, qty)
    } else if (movement.movement_type === "outbound") {
      if (isPlannedStatus(movement.status)) {
        plannedOut += qty
      } else {
        applyLocationDelta(locationBalances, movement.from_location ?? DEFAULT_STOCK_LOCATION, -qty)
        applyLocationDelta(locationBalances, movement.to_location ?? DEFAULT_CUSTOMER_LOCATION, qty)
      }
      if (occurredTime >= cutoff30dMs && destinationKind !== "sample" && destinationKind !== "office" && destinationKind !== "repair") {
        outbound30d += qty
      }
    } else if (movement.movement_type === "return") {
      applyLocationDelta(locationBalances, movement.from_location, -qty)
      applyLocationDelta(locationBalances, movement.to_location ?? DEFAULT_STOCK_LOCATION, qty)
    } else if (movement.movement_type === "transfer") {
      applyLocationDelta(locationBalances, movement.from_location ?? DEFAULT_STOCK_LOCATION, -qty)
      applyLocationDelta(locationBalances, movement.to_location, qty)
    } else if (movement.movement_type === "repair") {
      applyLocationDelta(locationBalances, movement.from_location ?? DEFAULT_STOCK_LOCATION, -qty)
      applyLocationDelta(locationBalances, movement.to_location ?? DEFAULT_REPAIR_LOCATION, qty)
    } else if (movement.movement_type === "adjust") {
      if (movement.from_location && !movement.to_location) {
        applyLocationDelta(locationBalances, movement.from_location, -qty)
      } else {
        applyLocationDelta(locationBalances, movement.to_location ?? DEFAULT_STOCK_LOCATION, qty)
      }
    }
  }

  const warehouseStock = locationBalances.get(DEFAULT_STOCK_LOCATION) ?? 0
  const availableStock = warehouseStock - plannedOut
  const weeklyOutboundAvg = outbound30d > 0 ? outbound30d / TREND_WINDOW_DAYS * 7 : 0
  const trendOrderPoint = Math.ceil((weeklyOutboundAvg * item.lead_time_days / 7) + item.reorder_point)
  const dailyAvg = outbound30d > 0 ? outbound30d / TREND_WINDOW_DAYS : 0
  const daysUntilStockout = dailyAvg > 0 ? Math.max(0, Math.floor(availableStock / dailyAvg)) : null
  const locationRows = Array.from(locationBalances.entries())
    .filter(([, quantity]) => quantity !== 0)
    .map(([location, quantity]) => ({ location, quantity }))
    .sort((a, b) => {
      if (a.location === DEFAULT_STOCK_LOCATION) return -1
      if (b.location === DEFAULT_STOCK_LOCATION) return 1
      return Math.abs(b.quantity) - Math.abs(a.quantity)
    })
  // lot 잔량은 새 출고 자동 배정과 같은 해석기로 낸다(resolveHardwareLotBalances 주석 참조).
  // 표시 순서는 기존 계약대로 수량 내림차순이다.
  const lotRows = resolveHardwareLotBalances(itemMovements)
    .lots.map(({ lot, quantity }) => ({ lot, quantity }))
    .sort((a, b) => b.quantity - a.quantity)

  return {
    itemId: item.id,
    product: item.name,
    category: item.category,
    reorderPoint: item.reorder_point,
    leadTimeDays: item.lead_time_days,
    warehouseStock,
    plannedOut,
    availableStock,
    outbound30d,
    weeklyOutboundAvg,
    trendOrderPoint,
    daysUntilStockout,
    // 판촉(promoted) 라인엔 재주문 개념이 없다 — 부족/주문검토 축에서 제외하고,
    // 음수·이상치는 알림 빌더의 "원장 점검 필요"로 따로 올린다(운영 결정 2026-08-19).
    low: !isPromotedProduct(item.name) && availableStock <= item.reorder_point,
    orderRecommended: !isPromotedProduct(item.name) && availableStock <= trendOrderPoint,
    locationBalances: locationRows,
    lotBalances: lotRows,
  }
}

async function getHardwareDashboardUncached(): Promise<HardwareDashboard> {
  const [items, movementsResult, importRun] = await Promise.all([
    listHardwareItems(),
    listAllHardwareMovements(),
    getLatestImportRun(),
  ])
  const { rows: movements, moneyRecoveredFromRawCount } = movementsResult
  const activeMovements = movements.filter((movement) => !movement.voided_at)
  const cutoff30d = Date.now() - TREND_WINDOW_DAYS * 24 * 60 * 60 * 1000

  // item_id별로 한 번만 버킷팅 — 기존 items.map 안 activeMovements.filter는 O(items×movements).
  // activeMovements 순서를 유지하며 push하므로 항목별 정렬은 filter와 동일.
  const movementsByItem = new Map<string, HardwareMovementLedgerRow[]>()
  for (const movement of activeMovements) {
    const id = movement.item_id
    if (!id) continue
    const bucket = movementsByItem.get(id)
    if (bucket) bucket.push(movement)
    else movementsByItem.set(id, [movement])
  }

  const rows = items
    .filter((item) => item.active)
    .map((item): HardwareStockRow =>
      // 재고 산식 엔진(위치·lot 잔량·30일 추세·재주문점)은 computeHardwareStockRow로 추출했다
      // (감사 2026-09-07 #3) — 로직은 그대로, 여기서는 품목별 이동 버킷과 30일 경계만 넘긴다.
      computeHardwareStockRow({
        item,
        itemMovements: movementsByItem.get(item.id) ?? [],
        cutoff30dMs: cutoff30d,
      })
    )
    .sort((a, b) => {
      if (a.low !== b.low) return a.low ? -1 : 1
      if (a.orderRecommended !== b.orderRecommended) return a.orderRecommended ? -1 : 1
      return a.product.localeCompare(b.product, "ko")
    })

  // 최근 출고(30건)·예정 큐는 이 배열의 부분집합이라 여기서 만들지 않는다 — 클라이언트가
  // 같은 순서·같은 판정으로 파생한다. 예정 큐는 확정을 기다리는 할 일 목록이라 상한이
  // 따로 없고, 2000건 캡만 그 상한 역할을 한다.
  //
  // 감사(2026-09-07 #7): 2000건 캡 너머는 지금까지 화면에서 아예 닿을 방법이 없었다(무페이징
  // 통짜 응답 + 클라이언트는 받은 배열만 자름). movementsTotal을 실어 "전체 대비 몇 건을
  // 보고 있는지"를 감지 가능하게 하고, getHardwareMovementsPage(아래)가 그 너머를 페이지로
  // 읽어올 수 있게 한다. 기본 응답(이 함수)은 그대로 최신 2000건 — 기존 소비처(홈 요약·검색·
  // 입출고 탭 등)가 이 배열 전체를 집계에 쓰므로 기본값을 줄이면 그 집계들이 조용히 틀어진다.
  const sortedActiveMovements = activeMovements.slice().sort((a, b) => movementDate(b) - movementDate(a))
  const movementRows = sortedActiveMovements.slice(0, HARDWARE_MOVEMENTS_DEFAULT_LIMIT).map(toMovementView)

  const alerts: HardwareAlert[] = []
  for (const row of rows) {
    // 음수 창고 = 부족이 아니라 원장 이상 — 재주문 경보 대신 점검 신호로 올린다.
    // (현재 실사례: STD1(promoted) −16. 판촉 라인은 low 자체가 꺼져 있어 이 분기가 유일한 경보.)
    if (row.warehouseStock < 0) {
      alerts.push({
        id: `check-${row.itemId}`,
        severity: "critical",
        itemId: row.itemId,
        product: row.product,
        title: "원장 점검 필요",
        detail: `창고 ${row.warehouseStock}대 · 가용 ${row.availableStock}대 — ${
          isPromotedProduct(row.product) ? "promoted 판정 또는 시트 수치 정리 필요" : "원장 유형·시트 수치 정리 필요"
        }`,
      })
    } else if (row.low) {
      alerts.push({
        id: `low-${row.itemId}`,
        severity: "critical",
        itemId: row.itemId,
        product: row.product,
        title: "최소재고 미만",
        detail: `가용 ${row.availableStock}대 / 최소 ${row.reorderPoint}대`,
        ...(isDormantStockRow(row) ? { muted: true } : {}),
      })
    } else if (row.orderRecommended) {
      alerts.push({
        id: `order-${row.itemId}`,
        severity: "warning",
        itemId: row.itemId,
        product: row.product,
        title: "주문 검토 시점",
        detail: `최근 30일 출고 ${row.outbound30d}대, 권장 주문 기준 ${row.trendOrderPoint}대`,
      })
    }
    if (row.plannedOut > 0) {
      alerts.push({
        id: `planned-${row.itemId}`,
        severity: "info",
        itemId: row.itemId,
        product: row.product,
        title: "배송 예정 반영",
        detail: `배송 예정 ${row.plannedOut}대가 가용 재고에서 차감됩니다.`,
      })
    }
  }

  // 실신호가 캡에 밀리지 않게 muted(미가동 품목 소음)와 분리해 각각 캡을 적용한다.
  // 원장 점검(음수 재고)은 가장 급한 실신호 — 재고행 정렬과 무관하게 목록 최상단에 둔다.
  const checkAlerts = alerts.filter((alert) => alert.id.startsWith("check-"))
  const activeAlerts = [
    ...checkAlerts,
    ...alerts.filter((alert) => !alert.muted && !alert.id.startsWith("check-")),
  ].slice(0, 12)
  const mutedAlerts = alerts.filter((alert) => alert.muted).slice(0, 12)

  return {
    items: items.map(toItemView),
    stock: rows,
    movements: movementRows,
    movementsTotal: sortedActiveMovements.length,
    alerts: [...activeAlerts, ...mutedAlerts],
    totals: {
      warehouseStock: rows.reduce((sum, row) => sum + row.warehouseStock, 0),
      availableStock: rows.reduce((sum, row) => sum + row.availableStock, 0),
      plannedOut: rows.reduce((sum, row) => sum + row.plannedOut, 0),
      outbound30d: rows.reduce((sum, row) => sum + row.outbound30d, 0),
      lowItems: rows.filter((row) => row.low).length,
      orderRecommended: rows.filter((row) => row.orderRecommended).length,
    },
    importRun,
    importCosting: { recoveredFromRawCount: moneyRecoveredFromRawCount },
  }
}

// 대시보드 = 전체 ledger 집계 비용. 쓰기 6경로가 HARDWARE_INVENTORY_CACHE_TAG로 즉시 무효화하므로
// 수정은 바로 반영되고, Date.now() 기반 30일 창의 시간 드리프트만 revalidate 상한(120s)으로 제한.
// 키 버전(v2, 2026-09-14): lot 잔량 해석 규칙이 바뀌었다(resolveHardwareLotBalances). 키를 그대로
// 두면 배포 직후에도 Data Cache 가 옛 규칙으로 계산한 대시보드(실물에 없는 H4·H5·H6 재고)를
// SWR 로 먼저 돌려주고, 재검증이 끝날 때까지 화면이 틀린 로트를 계속 보여준다.
const getHardwareDashboardCached = unstable_cache(
  () => getHardwareDashboardUncached(),
  ["hardware-dashboard-v2"],
  { tags: [HARDWARE_INVENTORY_CACHE_TAG], revalidate: 120 }
)

export function getHardwareDashboard(): Promise<HardwareDashboard> {
  return getHardwareDashboardCached()
}

export interface HardwareMovementsPage {
  movements: HardwareMovementView[]
  movementsTotal: number
}

// 감사(2026-09-07 #7) — 기본 대시보드(getHardwareDashboard)는 최신 2000건까지만 싣는다(기존
// 소비처의 집계가 그 배열 전체에 의존해 기본값은 그대로 둔다, 위 HARDWARE_MOVEMENTS_DEFAULT_LIMIT
// 주석 참고). 2000건보다 오래된 이동은 지금까지 화면에서 닿을 방법이 전혀 없었다 — 이 함수가
// 그 간극을 메운다: offset/limit으로 명시적 페이지를 읽어온다(내역 탭 "더 불러오기" 전용).
// 대시보드처럼 stock·alerts·totals를 다시 계산하지 않는다 — 이동 목록만 필요할 때 그 무거운
// 재계산을 또 하지 않기 위함이다.
async function getHardwareMovementsPageUncached(offset: number, limit: number): Promise<HardwareMovementsPage> {
  const { rows: movements } = await listAllHardwareMovements()
  const activeMovements = movements.filter((movement) => !movement.voided_at)
  const sorted = activeMovements.slice().sort((a, b) => movementDate(b) - movementDate(a))
  const safeOffset = Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), HARDWARE_MOVEMENTS_MAX_PAGE_LIMIT) : HARDWARE_MOVEMENTS_MAX_PAGE_LIMIT
  return {
    movements: sorted.slice(safeOffset, safeOffset + safeLimit).map(toMovementView),
    movementsTotal: sorted.length,
  }
}

// 대시보드와 같은 태그로 무효화한다 — 쓰기 6경로가 즉시 갱신하고, 그 사이 반복 페이지 요청은
// 캐시가 받는다(짧은 revalidate로 30일 창 같은 시간 드리프트 걱정은 없음 — 이 함수는 시간 창을
// 계산하지 않는다).
const getHardwareMovementsPageCached = unstable_cache(
  (offset: number, limit: number) => getHardwareMovementsPageUncached(offset, limit),
  ["hardware-movements-page"],
  { tags: [HARDWARE_INVENTORY_CACHE_TAG], revalidate: 120 }
)

export function getHardwareMovementsPage(offset: number, limit: number): Promise<HardwareMovementsPage> {
  return getHardwareMovementsPageCached(offset, limit)
}

export interface InboundUnitPriceBasis {
  unitPrice: number | null
  currency: "USD"
  source: "lot" | "product_avg" | null
}

/**
 * Inbound-cost valuation basis for a hardware item, in USD.
 *
 * - `lotKey` provided → "실매출" (lot-specific) basis: the average inbound unit
 *   price across non-voided inbound movements whose `movementLotKey` matches.
 *   Falls back to `amount_usd / quantity` per row when `unit_price` is null.
 * - no lot match (or no `lotKey`) → "예상" (product) basis: the quantity-weighted
 *   average inbound unit price for the item.
 * - no priced inbound at all → `{ unitPrice: null, source: null }` (caller shows
 *   "미산정"). Currency is always USD; no FX is fabricated here.
 */
export async function getInboundUnitPriceBasis(input: {
  itemId: string
  lotKey?: string | null
}): Promise<InboundUnitPriceBasis> {
  const itemId = cleanString(input.itemId)
  if (!itemId) return { unitPrice: null, currency: "USD", source: null }

  const sb = createSupabaseAdminClient()
  // 입고 이동이 1000행을 넘으면 평균 단가가 앞쪽 행만으로 계산된다 — id 키셋으로 전량 읽는다.
  const inboundRows = await fetchAllSupabaseRows<
    Pick<HardwareMovement, "id" | "quantity" | "lot_no" | "reference_no" | "source" | "unit_price" | "amount_usd">
  >((afterId, limit) => {
    let query = sb
      .from("hardware_movements")
      .select("id,quantity,lot_no,reference_no,source,unit_price,amount_usd")
      .eq("item_id", itemId)
      .eq("movement_type", "inbound")
      .is("voided_at", null)
      .order("id", { ascending: true })
      .limit(limit)
    if (afterId) query = query.gt("id", afterId)
    return query
  })

  // Per-row inbound unit price in USD: prefer explicit unit_price, else derive
  // from amount_usd / quantity. Returns null when neither yields a usable number.
  const rowUnitPrice = (row: (typeof inboundRows)[number]): number | null => {
    if (row.unit_price != null && Number.isFinite(row.unit_price)) return row.unit_price
    if (
      row.amount_usd != null &&
      Number.isFinite(row.amount_usd) &&
      Number.isFinite(row.quantity) &&
      row.quantity > 0
    ) {
      return row.amount_usd / row.quantity
    }
    return null
  }

  const lotKey = cleanString(input.lotKey)
  if (lotKey) {
    // movementLotKey: lot_no first, else reference_no for sheet_import rows.
    const lotRows = inboundRows.filter((row) => {
      const key =
        cleanString(row.lot_no) ??
        (row.source === "sheet_import" ? cleanString(row.reference_no) : null)
      return key === lotKey
    })
    const priced = lotRows.map(rowUnitPrice).filter((value): value is number => value != null)
    if (priced.length > 0) {
      const avg = priced.reduce((sum, value) => sum + value, 0) / priced.length
      return { unitPrice: avg, currency: "USD", source: "lot" }
    }
  }

  // Product fallback: quantity-weighted average inbound unit price.
  let weightedSum = 0
  let weightTotal = 0
  for (const row of inboundRows) {
    const price = rowUnitPrice(row)
    if (price == null) continue
    const weight = Number.isFinite(row.quantity) && row.quantity > 0 ? row.quantity : 1
    weightedSum += price * weight
    weightTotal += weight
  }
  if (weightTotal > 0) {
    return { unitPrice: weightedSum / weightTotal, currency: "USD", source: "product_avg" }
  }

  return { unitPrice: null, currency: "USD", source: null }
}

export const hardwareInventoryDefaults = {
  defaultStockLocation: DEFAULT_STOCK_LOCATION,
  defaultRepairLocation: DEFAULT_REPAIR_LOCATION,
}
