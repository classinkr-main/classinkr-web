import "server-only"

import { createHash } from "crypto"
import { revalidateTag, unstable_cache } from "next/cache"

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
  product: string
  title: string
  detail: string
}

export interface HardwareDashboard {
  items: HardwareItem[]
  stock: HardwareStockRow[]
  movements: HardwareMovement[]
  recentOutbound: HardwareMovement[]
  plannedMovements: HardwareMovement[]
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

function movementLotKey(movement: HardwareMovement): string | null {
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
async function listAll<T extends { id: string }>(table: string, order = "created_at", ascending = false): Promise<T[]> {
  const sb = createSupabaseAdminClient()
  const rows = await fetchAllSupabaseRows<T>((afterId, limit) => {
    let query = sb.from(table).select("*").order("id", { ascending: true }).limit(limit)
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
function recoverMoneyFromRaw(rows: HardwareMovement[]): HardwareMovement[] {
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

async function listAllHardwareMovements(): Promise<HardwareMovement[]> {
  const rows = await listAll<HardwareMovement>("hardware_movements")
  return recoverMoneyFromRaw(rows)
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

  const balances = new Map<string, { lotNo: string; quantity: number; firstSeen: number }>()
  for (const movement of data) {
    if (excluded.has(movement.id)) continue
    const lotNo = movementLotKey(movement)
    if (!lotNo) continue

    let delta = 0
    if (movement.movement_type === "inbound" || movement.movement_type === "return") {
      delta = movement.quantity
    } else if (movement.movement_type === "outbound") {
      delta = -movement.quantity
    } else if (movement.movement_type === "adjust") {
      delta = movement.from_location && !movement.to_location ? -movement.quantity : movement.quantity
    }
    if (delta === 0) continue

    const current = balances.get(lotNo) ?? { lotNo, quantity: 0, firstSeen: Number.POSITIVE_INFINITY }
    current.quantity += delta
    const seenAt = movementDate(movement)
    if (seenAt > 0 && seenAt < current.firstSeen) current.firstSeen = seenAt
    balances.set(lotNo, current)
  }

  const lots = Array.from(balances.values())
    .filter((row) => row.quantity > 0)
    .sort((a, b) => {
      const aRank = lotFifoRank(a.lotNo)
      const bRank = lotFifoRank(b.lotNo)
      if (aRank != null && bRank != null && aRank !== bRank) return aRank - bRank
      if (aRank != null && bRank == null) return -1
      if (aRank == null && bRank != null) return 1
      if (a.firstSeen !== b.firstSeen) return a.firstSeen - b.firstSeen
      return a.lotNo.localeCompare(b.lotNo, "ko")
    })

  if (explicitLotNo) {
    const explicit = lots.find((lot) => lot.lotNo === explicitLotNo)
    const available = explicit?.quantity ?? 0
    if (available < input.quantity) {
      throw new Error(
        `${input.productName} ${explicitLotNo} lot 재고가 부족합니다. 요청 ${input.quantity}대, 가능 ${available}대입니다.`
      )
    }
    return [{ lotNo: explicitLotNo, quantity: input.quantity, autoAssigned: false }]
  }

  let remaining = input.quantity
  const allocations: Array<{ lotNo: string; quantity: number; autoAssigned: boolean }> = []
  for (const lot of lots) {
    if (remaining <= 0) break
    const quantity = Math.min(remaining, lot.quantity)
    allocations.push({ lotNo: lot.lotNo, quantity, autoAssigned: true })
    remaining -= quantity
  }

  if (remaining > 0) {
    const available = input.quantity - remaining
    throw new Error(
      `${input.productName} lot 재고가 부족합니다. 요청 ${input.quantity}대, 자동 배정 가능 ${available}대입니다.`
    )
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

  const v2 = await sb.rpc("confirm_hardware_planned_movement_v2", args)
  if (!v2.error) {
    revalidateTag(HARDWARE_INVENTORY_CACHE_TAG, "max")
    return v2.data as HardwareMovement
  }

  const missingRpc =
    v2.error.code === "PGRST202" ||
    /confirm_hardware_planned_movement_v2|schema cache|function/i.test(v2.error.message)
  if (!missingRpc) throw v2.error

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
  input: CreateHardwareMovementInput
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
    .select("id,source,voided_at,converted_from_movement_id,converted_to_movement_id")
    .eq("id", id)
    .maybeSingle()
  if (existingError) throw existingError
  if (!existing) throw new Error("원장 기록을 찾을 수 없습니다.")
  const row = existing as {
    source: string
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

function applyLocationDelta(map: Map<string, number>, location: string | null | undefined, delta: number) {
  const key = normalizeLocationName(location)
  if (!key) return
  map.set(key, (map.get(key) ?? 0) + delta)
}

function movementDate(movement: HardwareMovement) {
  const value = movement.occurred_at ?? movement.created_at
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : 0
}

async function getHardwareDashboardUncached(): Promise<HardwareDashboard> {
  const [items, movements, importRun] = await Promise.all([
    listHardwareItems(),
    listAllHardwareMovements(),
    getLatestImportRun(),
  ])
  const activeMovements = movements.filter((movement) => !movement.voided_at)
  const cutoff30d = Date.now() - TREND_WINDOW_DAYS * 24 * 60 * 60 * 1000

  // item_id별로 한 번만 버킷팅 — 기존 items.map 안 activeMovements.filter는 O(items×movements).
  // activeMovements 순서를 유지하며 push하므로 항목별 정렬은 filter와 동일.
  const movementsByItem = new Map<string, HardwareMovement[]>()
  for (const movement of activeMovements) {
    const id = movement.item_id
    if (!id) continue
    const bucket = movementsByItem.get(id)
    if (bucket) bucket.push(movement)
    else movementsByItem.set(id, [movement])
  }

  const rows = items
    .filter((item) => item.active)
    .map((item): HardwareStockRow => {
      const itemMovements = movementsByItem.get(item.id) ?? []
      const locationBalances = new Map<string, number>()
      const lotBalances = new Map<string, number>()
      let plannedOut = 0
      let outbound30d = 0

      for (const movement of itemMovements) {
        const qty = movement.quantity
        const occurredTime = movementDate(movement)
        const destinationKind = classifyDestination(movement.to_location)

        const lotKey = movementLotKey(movement)
        if (lotKey) {
          // lot 잔량 = 입고/반납(+) − 출고(예정 포함, −). 이동/수리는 lot 보존(0).
          let lotDelta = 0
          if (movement.movement_type === "inbound" || movement.movement_type === "return") {
            lotDelta = qty
          } else if (movement.movement_type === "outbound") {
            lotDelta = -qty
          } else if (movement.movement_type === "adjust") {
            lotDelta = movement.from_location && !movement.to_location ? -qty : qty
          }
          if (lotDelta !== 0) lotBalances.set(lotKey, (lotBalances.get(lotKey) ?? 0) + lotDelta)
        }

        if (movement.movement_type === "inbound") {
          applyLocationDelta(locationBalances, movement.to_location ?? DEFAULT_STOCK_LOCATION, qty)
        } else if (movement.movement_type === "outbound") {
          if (isPlannedStatus(movement.status)) {
            plannedOut += qty
          } else {
            applyLocationDelta(locationBalances, movement.from_location ?? DEFAULT_STOCK_LOCATION, -qty)
            applyLocationDelta(locationBalances, movement.to_location ?? DEFAULT_CUSTOMER_LOCATION, qty)
          }
          if (occurredTime >= cutoff30d && destinationKind !== "sample" && destinationKind !== "office" && destinationKind !== "repair") {
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
      const lotRows = Array.from(lotBalances.entries())
        .filter(([, quantity]) => quantity > 0)
        .map(([lot, quantity]) => ({ lot, quantity }))
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
        low: availableStock <= item.reorder_point,
        orderRecommended: availableStock <= trendOrderPoint,
        locationBalances: locationRows,
        lotBalances: lotRows,
      }
    })
    .sort((a, b) => {
      if (a.low !== b.low) return a.low ? -1 : 1
      if (a.orderRecommended !== b.orderRecommended) return a.orderRecommended ? -1 : 1
      return a.product.localeCompare(b.product, "ko")
    })

  const movementRows = activeMovements
    .slice()
    .sort((a, b) => movementDate(b) - movementDate(a))
    .slice(0, 2000)
  const recentOutbound = movementRows
    .filter((movement) => movement.movement_type === "outbound")
    .slice(0, 30)
  const plannedMovements = movementRows
    .filter((movement) => movement.movement_type === "outbound" && isPlannedStatus(movement.status))
    .slice(0, 30)

  const alerts: HardwareAlert[] = []
  for (const row of rows) {
    if (row.low) {
      alerts.push({
        id: `low-${row.itemId}`,
        severity: "critical",
        product: row.product,
        title: "최소재고 미만",
        detail: `가용 ${row.availableStock}대 / 최소 ${row.reorderPoint}대`,
      })
    } else if (row.orderRecommended) {
      alerts.push({
        id: `order-${row.itemId}`,
        severity: "warning",
        product: row.product,
        title: "주문 검토 시점",
        detail: `최근 30일 출고 ${row.outbound30d}대, 권장 주문 기준 ${row.trendOrderPoint}대`,
      })
    }
    if (row.plannedOut > 0) {
      alerts.push({
        id: `planned-${row.itemId}`,
        severity: "info",
        product: row.product,
        title: "배송 예정 반영",
        detail: `배송 예정 ${row.plannedOut}대가 가용 재고에서 차감됩니다.`,
      })
    }
  }

  return {
    items,
    stock: rows,
    movements: movementRows,
    recentOutbound,
    plannedMovements,
    alerts: alerts.slice(0, 12),
    totals: {
      warehouseStock: rows.reduce((sum, row) => sum + row.warehouseStock, 0),
      availableStock: rows.reduce((sum, row) => sum + row.availableStock, 0),
      plannedOut: rows.reduce((sum, row) => sum + row.plannedOut, 0),
      outbound30d: rows.reduce((sum, row) => sum + row.outbound30d, 0),
      lowItems: rows.filter((row) => row.low).length,
      orderRecommended: rows.filter((row) => row.orderRecommended).length,
    },
    importRun,
  }
}

// 대시보드 = 전체 ledger 집계 비용. 쓰기 6경로가 HARDWARE_INVENTORY_CACHE_TAG로 즉시 무효화하므로
// 수정은 바로 반영되고, Date.now() 기반 30일 창의 시간 드리프트만 revalidate 상한(120s)으로 제한.
const getHardwareDashboardCached = unstable_cache(
  () => getHardwareDashboardUncached(),
  ["hardware-dashboard"],
  { tags: [HARDWARE_INVENTORY_CACHE_TAG], revalidate: 120 }
)

export function getHardwareDashboard(): Promise<HardwareDashboard> {
  return getHardwareDashboardCached()
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
