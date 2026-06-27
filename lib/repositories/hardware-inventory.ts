import "server-only"

import { createHash } from "crypto"
import { revalidateTag } from "next/cache"

import { listHwInbound, listHwOutbound, listHwStock } from "@/lib/repositories/branch-hw"
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
  createdBy?: string | null
  raw?: Record<string, unknown>
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
  if (/^(?:본사\s*)?창고$|^warehouse$/i.test(text)) return DEFAULT_STOCK_LOCATION
  if (/^(?:본사\s*)?사무실$|^office$/i.test(text)) return "사무실"
  if (/샘플|대여|데모|demo|sample/i.test(text)) return DEFAULT_SAMPLE_LOCATION
  if (/수리|a\/?s|as센터|repair/i.test(text)) return DEFAULT_REPAIR_LOCATION
  if (/^외부\/?고객$|^고객$/i.test(text)) return DEFAULT_CUSTOMER_LOCATION
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

function isPlannedStatus(status: string | null | undefined) {
  const text = status ?? ""
  return /예정|예약|대기|planned/i.test(text)
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

async function listAll<T>(table: string, order = "created_at", ascending = false): Promise<T[]> {
  const sb = createSupabaseAdminClient()
  const { data, error } = await sb
    .from(table)
    .select("*")
    .order(order, { ascending })
  if (error) throw error
  return (data ?? []) as T[]
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

export async function listHardwareMovements(limit = 300): Promise<HardwareMovement[]> {
  const sb = createSupabaseAdminClient()
  const { data, error } = await sb
    .from("hardware_movements")
    .select("*")
    .order("occurred_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as HardwareMovement[]
}

async function listAllHardwareMovements(): Promise<HardwareMovement[]> {
  return listAll<HardwareMovement>("hardware_movements")
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

export async function createHardwareMovement(input: CreateHardwareMovementInput): Promise<HardwareMovement> {
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

  await ensureNoDuplicateCrmMovement({
    productName,
    referenceNo: input.referenceNo,
    status: input.status,
  })

  const sb = createSupabaseAdminClient()
  const { data, error } = await sb
    .from("hardware_movements")
    .insert({
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
      source: "admin_manual",
      raw: input.raw ?? {},
      created_by: cleanString(input.createdBy),
    })
    .select("*")
    .single()
  if (error) throw error

  revalidateTag(HARDWARE_INVENTORY_CACHE_TAG, "max")
  return data as HardwareMovement
}

export async function confirmPlannedHardwareMovement(
  id: string,
  input: { occurredAt?: string | null; actor?: string | null }
): Promise<HardwareMovement> {
  const sb = createSupabaseAdminClient()
  const { data, error } = await sb.rpc("confirm_hardware_planned_movement", {
    planned_id: id,
    actor: cleanString(input.actor) ?? "admin",
    occurred_on: input.occurredAt || null,
  })
  if (error) throw error

  revalidateTag(HARDWARE_INVENTORY_CACHE_TAG, "max")
  return data as HardwareMovement
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
  patch: { status: "success" | "failed"; rowsImported?: number; rowsSkipped?: number; error?: string }
) {
  const sb = createSupabaseAdminClient()
  const { error } = await sb
    .from("hardware_import_runs")
    .update({
      status: patch.status,
      rows_imported: patch.rowsImported,
      rows_skipped: patch.rowsSkipped,
      error: patch.error,
      finished_at: new Date().toISOString(),
    })
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
  source_table: string
  source_key: string
  raw: unknown
}

export async function importHardwareFromBranchSheets(): Promise<HardwareSheetImportResult> {
  const runId = await startImportRun()

  try {
    const [inbound, outbound, stock] = await Promise.all([
      listHwInbound(),
      listHwOutbound(),
      listHwStock(),
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
      if (isRecord(row.raw) && row.raw.source === "재고현황") continue
      const name = normalizeProductName(row.product)
      if (outboundOrInboundProducts.has(name)) continue
      productInputs.push({ name, category: row.category })
    }

    const itemsByName = await ensureHardwareItems(productInputs)
    const rows: ImportMovementRow[] = []
    let skipped = 0

    inbound.forEach((row, index) => {
      const product = normalizeProductName(row.product)
      const item = itemsByName.get(product)
      if (!item || row.quantity <= 0) {
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
        serials: row.serials ?? [],
        source_table: "branch_hw_inbound",
        source_key: hashSourceKey(["inbound", index, row.logistics_no, row.inbound_date, row.product, row.quantity, row.serials, row.storage, row.remarks]),
        raw: row.raw ?? {},
      })
    })

    outbound.forEach((row, index) => {
      const product = normalizeProductName(row.product)
      const item = itemsByName.get(product)
      if (!item || row.quantity <= 0) {
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
        source_table: "branch_hw_outbound",
        source_key: hashSourceKey(["outbound", index, row.logistics_no, row.outbound_date, row.owner, row.product, row.quantity, row.destination, row.progress, row.type, row.remarks]),
        raw: row.raw ?? {},
      })
    })

    stock.forEach((row, index) => {
      if (isRecord(row.raw) && row.raw.source === "재고현황") return
      const product = normalizeProductName(row.product)
      if (outboundOrInboundProducts.has(product)) return
      const item = itemsByName.get(product)
      if (!item || row.quantity <= 0) {
        skipped += 1
        return
      }

      rows.push({
        item_id: item.id,
        product_name: product,
        movement_type: "adjust",
        quantity: row.quantity,
        occurred_at: null,
        from_location: null,
        to_location: DEFAULT_STOCK_LOCATION,
        owner: null,
        status: "현재고 이관",
        reference_no: null,
        memo: "재고현황 직접 재고 이관",
        serials: [],
        source_table: "branch_hw_stock",
        source_key: hashSourceKey(["stock", index, row.product, row.category, row.quantity, row.raw]),
        raw: row.raw ?? {},
      })
    })

    const sb = createSupabaseAdminClient()
    const { data, error } = await sb.rpc("replace_hardware_sheet_import", {
      rows,
      run_id: runId,
    })
    if (error) throw error

    const imported = typeof data === "number" ? data : rows.length
    await finishImportRun(runId, { status: "success", rowsImported: imported, rowsSkipped: skipped })
    revalidateTag(HARDWARE_INVENTORY_CACHE_TAG, "max")
    return { imported, skipped, runId }
  } catch (error) {
    await finishImportRun(runId, {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
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

export async function getHardwareDashboard(): Promise<HardwareDashboard> {
  const [items, movements, importRun] = await Promise.all([
    listHardwareItems(),
    listAllHardwareMovements(),
    getLatestImportRun(),
  ])
  const activeMovements = movements.filter((movement) => !movement.voided_at)
  const cutoff30d = Date.now() - TREND_WINDOW_DAYS * 24 * 60 * 60 * 1000

  const rows = items
    .filter((item) => item.active)
    .map((item): HardwareStockRow => {
      const itemMovements = activeMovements.filter((movement) => movement.item_id === item.id)
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
    .slice(0, 120)
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

export const hardwareInventoryDefaults = {
  defaultStockLocation: DEFAULT_STOCK_LOCATION,
  defaultRepairLocation: DEFAULT_REPAIR_LOCATION,
}
