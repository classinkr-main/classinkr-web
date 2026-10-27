import "server-only"

import { revalidateTag } from "next/cache"

import { emitNotificationEvent } from "@/lib/notifications/emit-event"
import {
  buildSalesOrderLines,
  nextOrderNo,
  orderNoPrefix,
  salesOrderNeedsHardwareApproval,
  summarizeSalesOrderProducts,
  type SalesOrder,
  type SalesOrderAcceptedVia,
  type SalesOrderLine,
  type SalesOrderStatus,
} from "@/lib/orders/order-lines"
import {
  classifySheetOrderChecks,
  isPlannedLedgerStatus,
  normalizeOrderNo,
  rawOrderNo,
  summarizeOrderFulfillment,
  type SalesOrderFulfillmentLine,
  suggestOrdersForSheetCheck,
  type SheetOrderCheck,
  type SheetOutboundRow,
} from "@/lib/orders/sheet-order-check"
import { getCustomer } from "@/lib/portal/repositories/customers"
import { advanceDealStageSafely } from "@/lib/orders/deal-stage"
import { getDeal } from "@/lib/portal/repositories/deals"
import { getQuoteDocument, getResolvableQuoteVersion } from "@/lib/portal/repositories/quote-documents"
import { normalizeQuoteDetailsFromStructuredJson } from "@/lib/portal/quote-details"
import {
  createHardwareMovements,
  HARDWARE_INVENTORY_CACHE_TAG,
  voidHardwareMovement,
  type CreateHardwareMovementInput,
} from "@/lib/repositories/hardware-inventory"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

// 오더(docs/active/hardware-order-revenue-link-plan-2026-10-22.md §4-3).
// 견적 승인 → (하드웨어면 hardware.finalize 권한자 승인) → 오더번호 + 배송 예정.
// 권한 검사는 API 라우트가 한다 — 이 파일은 상태 전이와 원장 쓰기만 맡는다.

export type { SalesOrder, SalesOrderAcceptedVia, SalesOrderStatus } from "@/lib/orders/order-lines"

interface SalesOrderRow {
  id: string
  order_no: string | null
  status: SalesOrderStatus
  needs_hardware_approval: boolean
  quote_document_id: string
  quote_version_id: string | null
  quote_number: string | null
  deal_id: string | null
  customer_id: string | null
  customer_name: string
  lines: unknown
  total_amount: number | string | null
  currency: string
  accepted_via: SalesOrderAcceptedVia
  requested_by: string | null
  requested_at: string
  decided_by: string | null
  decided_at: string | null
  decision_reason: string | null
  planned_movement_ids: string[] | null
}

/** API 가 상태 코드로 옮기는 오류. */
export class SalesOrderError extends Error {
  status: 400 | 404 | 409 | 422 | 503

  constructor(message: string, status: SalesOrderError["status"]) {
    super(message)
    this.name = "SalesOrderError"
    this.status = status
  }
}

const MISSING_TABLE_MESSAGE = "오더 기능은 DB 업데이트(20261022_sales_orders.sql) 적용 후 사용할 수 있습니다."
const AUTO_DECIDER = "자동(하드웨어 없음)"
const PLANNED_STATUS = "배송 예정"
const WAREHOUSE = "창고"

function rethrow(error: { code?: string; message?: string } | null): never {
  if (error?.code === "42P01" || error?.code === "PGRST205") throw new SalesOrderError(MISSING_TABLE_MESSAGE, 503)
  throw error ?? new Error("오더를 처리하지 못했습니다.")
}

function toSalesOrder(row: SalesOrderRow): SalesOrder {
  return {
    id: row.id,
    orderNo: row.order_no,
    status: row.status,
    needsHardwareApproval: row.needs_hardware_approval,
    quoteDocumentId: row.quote_document_id,
    quoteVersionId: row.quote_version_id,
    quoteNumber: row.quote_number,
    dealId: row.deal_id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    lines: Array.isArray(row.lines) ? (row.lines as SalesOrderLine[]) : [],
    totalAmount: row.total_amount == null ? null : Number(row.total_amount),
    currency: row.currency,
    acceptedVia: row.accepted_via,
    requestedBy: row.requested_by,
    requestedAt: row.requested_at,
    decidedBy: row.decided_by,
    decidedAt: row.decided_at,
    decisionReason: row.decision_reason,
    plannedMovementIds: row.planned_movement_ids ?? [],
  }
}

async function findActiveOrderForQuote(quoteDocumentId: string): Promise<SalesOrder | null> {
  const sb = createSupabaseAdminClient()
  const { data, error } = await sb
    .from("sales_orders")
    .select("*")
    .eq("quote_document_id", quoteDocumentId)
    .in("status", ["pending_approval", "approved"])
    .limit(1)
  if (error) rethrow(error)
  const row = ((data ?? []) as SalesOrderRow[])[0]
  return row ? toSalesOrder(row) : null
}

/**
 * 같은 견적 버전으로 이미 반려·취소된 오더. 고객이 공유 링크에서 "진행"을 다시 눌러도 같은 버전이면
 * 승인 대기로 되살리지 않는다 — 다시 올리려면 담당자가 견적을 고쳐 새 버전으로 승인받는다.
 */
async function findClosedOrderForVersion(quoteDocumentId: string, quoteVersionId: string): Promise<SalesOrder | null> {
  const sb = createSupabaseAdminClient()
  const { data, error } = await sb
    .from("sales_orders")
    .select("*")
    .eq("quote_document_id", quoteDocumentId)
    .eq("quote_version_id", quoteVersionId)
    .in("status", ["rejected", "cancelled"])
    .order("requested_at", { ascending: false })
    .limit(1)
  if (error) rethrow(error)
  const row = ((data ?? []) as SalesOrderRow[])[0]
  return row ? toSalesOrder(row) : null
}

async function getSalesOrderRow(id: string): Promise<SalesOrderRow> {
  const sb = createSupabaseAdminClient()
  const { data, error } = await sb.from("sales_orders").select("*").eq("id", id).limit(1)
  if (error) rethrow(error)
  const row = ((data ?? []) as SalesOrderRow[])[0]
  if (!row) throw new SalesOrderError("오더를 찾을 수 없습니다.", 404)
  return row
}

async function existingOrderNos(now: Date): Promise<string[]> {
  const sb = createSupabaseAdminClient()
  const { data, error } = await sb
    .from("sales_orders")
    .select("order_no")
    .like("order_no", `${orderNoPrefix(now)}-%`)
  if (error) rethrow(error)
  return ((data ?? []) as Array<{ order_no: string | null }>).map((row) => row.order_no ?? "").filter(Boolean)
}

const ORDER_NO_ATTEMPTS = 3

function isUniqueViolation(error: { code?: string } | null) {
  return error?.code === "23505"
}

/**
 * 견적이 승인됐을 때 오더를 만든다(멱등). 이미 살아 있는 오더가 있거나, 같은 견적 버전의 오더가
 * 반려·취소됐으면 새로 만들지 않고 그 오더를 돌려준다.
 * 하드웨어 줄이 있으면 승인 대기로, 없으면 바로 승인(오더번호 발급, 배송 예정 없음)으로 만든다.
 */
export async function ensureSalesOrderForAcceptedQuote(input: {
  quoteDocumentId: string
  acceptedVia: SalesOrderAcceptedVia
  actor?: string | null
  now?: Date
}): Promise<{ order: SalesOrder; created: boolean }> {
  const existing = await findActiveOrderForQuote(input.quoteDocumentId)
  if (existing) return { order: existing, created: false }

  const document = await getQuoteDocument(input.quoteDocumentId)
  if (!document) throw new SalesOrderError("견적서를 찾을 수 없습니다.", 404)
  const version = await getResolvableQuoteVersion(document)
  if (!version) throw new SalesOrderError("승인할 견적 버전이 없습니다.", 422)
  const closed = await findClosedOrderForVersion(document.id, version.id)
  if (closed) return { order: closed, created: false }
  const deal = await getDeal(document.deal_id)
  const customer = deal?.customer_id ? await getCustomer(deal.customer_id) : null

  const details = normalizeQuoteDetailsFromStructuredJson(version.structured_json, {})
  const lines = buildSalesOrderLines(document.id, details.lineItems ?? [])
  const needsApproval = salesOrderNeedsHardwareApproval(lines)
  const customerName =
    customer?.name?.trim() || customer?.campus_name?.trim() || customer?.contact_name?.trim() || deal?.title?.trim() || "고객 미지정"
  const now = input.now ?? new Date()

  const base = {
    needs_hardware_approval: needsApproval,
    quote_document_id: document.id,
    quote_version_id: version.id,
    quote_number: document.quote_number ?? null,
    deal_id: document.deal_id ?? null,
    customer_id: deal?.customer_id ?? null,
    customer_name: customerName,
    lines,
    total_amount: version.total_amount ?? null,
    currency: "KRW",
    accepted_via: input.acceptedVia,
    requested_by: input.actor ?? null,
  }

  const sb = createSupabaseAdminClient()
  for (let attempt = 0; attempt < ORDER_NO_ATTEMPTS; attempt += 1) {
    const insert = needsApproval
      ? { ...base, status: "pending_approval", order_no: null }
      : {
          ...base,
          status: "approved",
          order_no: nextOrderNo(await existingOrderNos(now), now),
          decided_by: AUTO_DECIDER,
          decided_at: now.toISOString(),
        }
    const { data, error } = await sb.from("sales_orders").insert(insert).select("*").single()
    if (!error) {
      const order = toSalesOrder(data as SalesOrderRow)
      if (order.status === "approved") await advanceDealStageSafely(order.dealId, "confirmed")
      return { order, created: true }
    }
    if (!isUniqueViolation(error)) rethrow(error)
    // 같은 견적의 오더를 누가 먼저 만들었다(진행 요청 두 번 누름·담당자 처리와 겹침).
    const raced = await findActiveOrderForQuote(input.quoteDocumentId)
    if (raced) return { order: raced, created: false }
    // 아니면 오더번호가 겹친 것 — 다음 번호로 다시.
    if (needsApproval) rethrow(error)
  }
  throw new SalesOrderError("오더번호를 발급하지 못했습니다. 잠시 뒤 다시 시도해 주세요.", 409)
}

/**
 * 견적 승인 경로(고객 공유 링크·담당자 상태 변경)용 — 오더 생성 실패가 승인 자체를 막지 않게 가둔다.
 * 실패하면 null(로그만). 테이블 미적용(503)도 같다. 놓친 오더는 같은 견적으로 다시 부르면 만들어진다(멱등).
 */
export async function ensureSalesOrderForAcceptedQuoteSafely(input: {
  quoteDocumentId: string
  acceptedVia: SalesOrderAcceptedVia
  actor?: string | null
}): Promise<{ order: SalesOrder; created: boolean } | null> {
  try {
    return await ensureSalesOrderForAcceptedQuote(input)
  } catch (error) {
    const label = error instanceof SalesOrderError ? `${error.status} ${error.message}` : error instanceof Error ? error.name : "Error"
    console.error("[sales-orders] order on quote acceptance failed:", label)
    return null
  }
}

/**
 * 담당자가 견적을 "승인됨"으로 바꿔 하드웨어 오더가 승인 대기로 올라왔을 때 이왕찬·지사장에게 알린다.
 * 고객 공유 링크 경로는 견적 진행 알림(quote.accepted)에 같은 안내 줄이 붙으므로 여기서 다시 보내지 않는다.
 * 알림 실패는 삼킨다(fire-and-forget).
 */
export function notifyHardwareOrderApprovalRequested(order: SalesOrder) {
  if (order.status !== "pending_approval") return
  const products = summarizeSalesOrderProducts(order.lines)
    .map((entry) => `${entry.product} ×${entry.quantity}`)
    .join(" · ")
  const unmapped = order.lines.filter((line) => line.unmappedHardware).map((line) => line.itemName)
  emitNotificationEvent({
    eventType: "hardware.order.approval_requested",
    notificationType: "approval_required",
    categoryTag: "general",
    severity: "info",
    scopeTag: "org_admin",
    title: `하드웨어 승인 요청 — ${order.customerName}`,
    message: [
      `견적 ${order.quoteNumber ?? "-"} · 담당자 승인 처리${order.requestedBy ? ` (${order.requestedBy})` : ""}`,
      products ? `품목: ${products}` : null,
      unmapped.length ? `재고 품목 확인 필요: ${unmapped.join(", ")}` : null,
      "하드웨어 탭 '하드웨어 승인 대기'에서 이왕찬·지사장이 승인하면 오더번호와 배송 예정이 생깁니다.",
    ]
      .filter(Boolean)
      .join("\n"),
    routeUrl: "/admin/hardware",
    source: "sales_order",
    sourceId: order.id,
    payload: {
      salesOrderId: order.id,
      quoteDocumentId: order.quoteDocumentId,
      quoteNumber: order.quoteNumber,
      dealId: order.dealId,
      customerName: order.customerName,
    },
    channels: ["wecom_webhook"],
  }).catch(() => {
    console.error("[sales-orders] approval request notification failed")
  })
}

/** 반려·취소된 오더 뒤에 같은 견적으로 다시 올라온 살아 있는 오더(승인 대기·승인됨). */
export interface SalesOrderSuccessor {
  id: string
  status: SalesOrderStatus
  orderNo: string | null
  requestedAt: string
}

export type SalesOrderWithFulfillment = SalesOrder & {
  fulfillment?: SalesOrderFulfillmentLine[]
  successor?: SalesOrderSuccessor | null
}

/**
 * 반려·취소 오더마다 같은 견적의 살아 있는 오더를 찾는다(견적당 하나뿐 — 유니크 인덱스). 반려 카드가
 * "새 버전이 다시 올라와 승인 대기에 있습니다"로 할 일을 닫는 데 쓴다. 조회 실패는 null(목록은 그대로).
 */
async function attachSuccessors(orders: SalesOrderWithFulfillment[]): Promise<SalesOrderWithFulfillment[]> {
  const closed = orders.filter((order) => order.status === "rejected" || order.status === "cancelled")
  const quoteIds = Array.from(new Set(closed.map((order) => order.quoteDocumentId)))
  if (quoteIds.length === 0) return orders
  const sb = createSupabaseAdminClient()
  const { data, error } = await sb
    .from("sales_orders")
    .select("id,status,order_no,requested_at,quote_document_id")
    .in("quote_document_id", quoteIds)
    .in("status", ["pending_approval", "approved"])
  if (error) {
    console.error("[sales-orders] successor lookup failed:", error.message)
    return orders
  }
  const byQuote = new Map<string, SalesOrderSuccessor>()
  for (const row of (data ?? []) as Array<{
    id: string
    status: SalesOrderStatus
    order_no: string | null
    requested_at: string
    quote_document_id: string
  }>) {
    byQuote.set(row.quote_document_id, { id: row.id, status: row.status, orderNo: row.order_no, requestedAt: row.requested_at })
  }
  return orders.map((order) =>
    order.status === "rejected" || order.status === "cancelled"
      ? { ...order, successor: byQuote.get(order.quoteDocumentId) ?? null }
      : order
  )
}

export async function listSalesOrders(
  options: { statuses?: SalesOrderStatus[]; limit?: number; withFulfillment?: boolean; withSuccessor?: boolean } = {}
): Promise<SalesOrderWithFulfillment[]> {
  const sb = createSupabaseAdminClient()
  let query = sb.from("sales_orders").select("*").order("requested_at", { ascending: false }).limit(options.limit ?? 100)
  if (options.statuses?.length) query = query.in("status", options.statuses)
  const { data, error } = await query
  if (error) rethrow(error)
  const listed: SalesOrderWithFulfillment[] = ((data ?? []) as SalesOrderRow[]).map(toSalesOrder)
  const orders = options.withSuccessor ? await attachSuccessors(listed) : listed
  if (!options.withFulfillment) return orders

  // 오더 대비 출고 — 원장(시트 줄·앱 예정·앱 확정)에서 같은 오더번호를 센다. 실패해도 목록은 돌려준다.
  const orderNos = orders.map((order) => order.orderNo).filter((value): value is string => Boolean(value))
  if (orderNos.length === 0) return orders
  const { data: movements, error: movementsError } = await sb
    .from("hardware_movements")
    .select("product_name,quantity,status,raw")
    .eq("movement_type", "outbound")
    .is("voided_at", null)
    .in("raw->>order_no", orderNos)
  if (movementsError) {
    console.error("[sales-orders] fulfillment lookup failed:", movementsError.message)
    return orders
  }
  const ledger = ((movements ?? []) as Array<{ product_name: string | null; quantity: number | string; status: string | null; raw: unknown }>).map(
    (movement) => ({
      orderNo: rawOrderNo(movement.raw),
      productName: movement.product_name,
      quantity: Number(movement.quantity) || 0,
      status: movement.status,
    })
  )
  return orders.map((order) => (order.orderNo ? { ...order, fulfillment: summarizeOrderFulfillment(order, ledger) } : order))
}

// 창고·샘플·사무실·수리로 간 줄은 고객 출고가 아니다 — 시트 확인 대상에서 뺀다(원장 위치 정규화 어휘).
const NON_CUSTOMER_LOCATIONS = new Set(["창고", "샘플", "사무실", "수리"])
const SHEET_CHECK_SCAN_LIMIT = 1000

function seoulDateKey(value: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(value)
  )
}

/**
 * 시트 확인 필요 — 오더 기능을 쓰기 시작한 날(첫 오더 요청일, 한국 시간) 이후의 시트 고객 출고 줄 중
 * 오더번호가 없거나, 모르는 번호거나, 승인 안 된(취소된) 오더거나, 오더에 없는 품목·수량 초과인 줄.
 * 날짜 없는 예정 줄도 본다. 오더가 하나도 없으면 빈 목록(기능을 아직 안 쓰는 중).
 */
export async function listSheetOrderChecks(): Promise<{ since: string | null; checks: SheetOrderCheck[] }> {
  const sb = createSupabaseAdminClient()
  const { data: first, error: firstError } = await sb
    .from("sales_orders")
    .select("requested_at")
    .order("requested_at", { ascending: true })
    .limit(1)
  if (firstError) rethrow(firstError)
  const firstRequestedAt = ((first ?? []) as Array<{ requested_at: string }>)[0]?.requested_at
  if (!firstRequestedAt) return { since: null, checks: [] }
  const since = seoulDateKey(firstRequestedAt)

  const { data: movements, error: movementsError } = await sb
    .from("hardware_movements")
    .select("id,product_name,quantity,occurred_at,status,to_location,raw")
    .eq("source", "sheet_import")
    .eq("movement_type", "outbound")
    .is("voided_at", null)
    .or(`occurred_at.gte.${since},occurred_at.is.null`)
    .order("occurred_at", { ascending: false, nullsFirst: true })
    .limit(SHEET_CHECK_SCAN_LIMIT)
  if (movementsError) throw movementsError

  const rows: SheetOutboundRow[] = ((movements ?? []) as Array<{
    id: string
    product_name: string | null
    quantity: number | string
    occurred_at: string | null
    status: string | null
    to_location: string | null
    raw: unknown
  }>)
    .filter((movement) => !NON_CUSTOMER_LOCATIONS.has((movement.to_location ?? "").trim()))
    .map((movement) => ({
      id: movement.id,
      productName: movement.product_name ?? "",
      quantity: Number(movement.quantity) || 0,
      occurredAt: movement.occurred_at,
      status: movement.status,
      customer: movement.to_location,
      orderNoRaw: rawOrderNo(movement.raw),
    }))

  const orderNos = Array.from(new Set(rows.map((row) => normalizeOrderNo(row.orderNoRaw)).filter(Boolean))) as string[]
  let orders: SalesOrder[] = []
  if (orderNos.length > 0) {
    const { data, error } = await sb.from("sales_orders").select("*").in("order_no", orderNos)
    if (error) rethrow(error)
    orders = ((data ?? []) as SalesOrderRow[]).map(toSalesOrder)
  }
  const checks = classifySheetOrderChecks(rows, orders)

  // 고칠 번호 후보 — 번호 없음·없는 번호·오더에 없는 품목만. 최근 승인 오더에서 찾는다(실패해도 목록은 그대로).
  if (checks.some((check) => SUGGESTION_KINDS.has(check.kind))) {
    const { data: approved, error: approvedError } = await sb
      .from("sales_orders")
      .select("*")
      .eq("status", "approved")
      .order("requested_at", { ascending: false })
      .limit(SUGGESTION_ORDER_LIMIT)
    if (approvedError) {
      console.error("[sales-orders] sheet check suggestion lookup failed:", approvedError.message)
    } else {
      const approvedOrders = ((approved ?? []) as SalesOrderRow[]).map(toSalesOrder)
      for (const check of checks) {
        if (SUGGESTION_KINDS.has(check.kind)) check.suggestions = suggestOrdersForSheetCheck(check, approvedOrders)
      }
    }
  }
  return { since, checks }
}

const SUGGESTION_KINDS = new Set<SheetOrderCheck["kind"]>(["missing_order_no", "unknown_order_no", "product_not_in_order"])
const SUGGESTION_ORDER_LIMIT = 300

function plannedMovementInputs(order: SalesOrderRow, orderNo: string, actor: string | null): CreateHardwareMovementInput[] {
  const lines = Array.isArray(order.lines) ? (order.lines as SalesOrderLine[]) : []
  const inputs: CreateHardwareMovementInput[] = []
  // 견적 줄 × 재고 품목마다 한 줄 — reference_no 가 견적 줄 참조라 CRM 오더 대사에서 그 줄이 사라진다.
  for (const line of lines) {
    for (const entry of line.hardwareProducts ?? []) {
      if (!(entry.quantity > 0)) continue
      inputs.push({
        productName: entry.product,
        movementType: "outbound",
        quantity: entry.quantity,
        occurredAt: null,
        fromLocation: WAREHOUSE,
        toLocation: order.customer_name,
        status: PLANNED_STATUS,
        referenceNo: line.quoteLineRef,
        memo: `오더 ${orderNo}${order.quote_number ? ` · 견적 ${order.quote_number}` : ""} · ${line.itemName}`,
        createdBy: actor,
        raw: {
          order_no: orderNo,
          sales_order_id: order.id,
          quote_document_id: order.quote_document_id,
          quote_line_ref: line.quoteLineRef,
        },
      })
    }
  }
  return inputs
}

/**
 * 하드웨어 승인 — 오더번호를 먼저 잡고(상태 전이), 배송 예정을 만든다. 배송 예정 생성이 실패하면
 * 오더를 승인 대기로 되돌린다. 같은 오더를 두 사람이 동시에 승인해도 한 번만 통과한다.
 */
export async function approveSalesOrder(id: string, input: { actor: string | null; now?: Date }): Promise<SalesOrder> {
  const row = await getSalesOrderRow(id)
  if (row.status !== "pending_approval") throw new SalesOrderError("이미 처리된 오더입니다.", 409)
  const now = input.now ?? new Date()
  const sb = createSupabaseAdminClient()

  let claimed: SalesOrderRow | null = null
  for (let attempt = 0; attempt < ORDER_NO_ATTEMPTS && !claimed; attempt += 1) {
    const orderNo = nextOrderNo(await existingOrderNos(now), now)
    const { data, error } = await sb
      .from("sales_orders")
      .update({ status: "approved", order_no: orderNo, decided_by: input.actor, decided_at: now.toISOString() })
      .eq("id", id)
      .eq("status", "pending_approval")
      .select("*")
    if (error) {
      if (isUniqueViolation(error)) continue
      rethrow(error)
    }
    const updated = ((data ?? []) as SalesOrderRow[])[0]
    if (!updated) throw new SalesOrderError("이미 처리된 오더입니다.", 409)
    claimed = updated
  }
  if (!claimed?.order_no) throw new SalesOrderError("오더번호를 발급하지 못했습니다. 잠시 뒤 다시 시도해 주세요.", 409)

  const inputs = plannedMovementInputs(claimed, claimed.order_no, input.actor)
  if (inputs.length > 50) {
    await revertApproval(id, claimed.order_no)
    throw new SalesOrderError("한 오더의 배송 예정은 50줄까지입니다. 견적을 나눠 주세요.", 422)
  }

  let movementIds: string[] = []
  try {
    // 하드웨어 줄을 전부 못 찾은 오더는 배송 예정 없이 번호만 받는다(승인 화면이 경고를 보여 준다).
    const movements = inputs.length ? await createHardwareMovements(inputs) : []
    movementIds = movements.map((movement) => movement.id)
  } catch (error) {
    await revertApproval(id, claimed.order_no)
    const message = error instanceof Error ? error.message : "배송 예정을 만들지 못했습니다."
    throw new SalesOrderError(`배송 예정을 만들지 못해 승인을 되돌렸습니다: ${message}`, 422)
  }

  if (movementIds.length) {
    const { data, error } = await sb
      .from("sales_orders")
      .update({ planned_movement_ids: movementIds })
      .eq("id", id)
      .select("*")
    // 배송 예정은 이미 raw.sales_order_id 로 오더를 가리킨다 — 목록 갱신 실패로 승인을 뒤집지 않는다.
    if (!error) {
      const updated = ((data ?? []) as SalesOrderRow[])[0]
      if (updated) claimed = updated
    } else {
      console.error("[sales-orders] planned_movement_ids update failed:", error.message)
    }
  }
  // 오더번호가 붙었으니 딜을 확정으로 올린다(전진만).
  await advanceDealStageSafely(claimed.deal_id, "confirmed")
  revalidateTag(HARDWARE_INVENTORY_CACHE_TAG, "max")
  return toSalesOrder(claimed)
}

async function revertApproval(id: string, orderNo: string) {
  const sb = createSupabaseAdminClient()
  const { error } = await sb
    .from("sales_orders")
    .update({ status: "pending_approval", order_no: null, decided_by: null, decided_at: null })
    .eq("id", id)
    .eq("order_no", orderNo)
  if (error) console.error("[sales-orders] approval revert failed:", error.message)
}

/**
 * 반려를 영업 쪽에 알린다 — 반려·취소 카드의 "담당에게 알리기". 견적을 고쳐 새 버전으로 승인받으면 다시
 * 승인 대기로 올라온다는 안내를 붙인다. 알림 실패는 삼킨다(fire-and-forget).
 */
export function notifyHardwareOrderRejected(order: SalesOrder, actor: string | null) {
  if (order.status !== "rejected") return
  emitNotificationEvent({
    eventType: "hardware.order.rejected",
    notificationType: "action_required",
    categoryTag: "general",
    severity: "info",
    scopeTag: "org_admin",
    title: `하드웨어 반려 — ${order.customerName} 견적 수정 필요`,
    message: [
      `견적 ${order.quoteNumber ?? "-"} · ${order.decidedBy ?? "-"} 반려`,
      order.decisionReason ? `사유: ${order.decisionReason}` : null,
      "견적을 고쳐 새 버전으로 승인받으면 하드웨어 승인 대기로 다시 올라옵니다. 같은 버전은 고객이 다시 눌러도 올라오지 않습니다.",
      actor ? `알림 보낸 사람: ${actor}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    routeUrl: `/admin/quotes/${order.quoteDocumentId}/view`,
    source: "sales_order",
    sourceId: order.id,
    payload: {
      salesOrderId: order.id,
      quoteDocumentId: order.quoteDocumentId,
      quoteNumber: order.quoteNumber,
      dealId: order.dealId,
      customerName: order.customerName,
      reason: order.decisionReason,
    },
    channels: ["wecom_webhook"],
  }).catch(() => {
    console.error("[sales-orders] rejection notification failed")
  })
}

/** 반려된 오더를 영업 쪽에 다시 알린다. 반려 상태가 아니면 409. */
export async function remindRejectedSalesOrder(id: string, input: { actor: string | null }): Promise<SalesOrder> {
  const order = toSalesOrder(await getSalesOrderRow(id))
  if (order.status !== "rejected") throw new SalesOrderError("반려된 오더만 담당에게 알릴 수 있습니다.", 409)
  notifyHardwareOrderRejected(order, input.actor)
  return order
}

export async function rejectSalesOrder(
  id: string,
  input: { actor: string | null; reason: string; now?: Date }
): Promise<SalesOrder> {
  const reason = input.reason.trim()
  if (!reason) throw new SalesOrderError("반려 사유를 적어 주세요.", 400)
  const row = await getSalesOrderRow(id)
  if (row.status !== "pending_approval") throw new SalesOrderError("이미 처리된 오더입니다.", 409)
  const sb = createSupabaseAdminClient()
  const { data, error } = await sb
    .from("sales_orders")
    .update({
      status: "rejected",
      decided_by: input.actor,
      decided_at: (input.now ?? new Date()).toISOString(),
      decision_reason: reason,
    })
    .eq("id", id)
    .eq("status", "pending_approval")
    .select("*")
  if (error) rethrow(error)
  const updated = ((data ?? []) as SalesOrderRow[])[0]
  if (!updated) throw new SalesOrderError("이미 처리된 오더입니다.", 409)
  return toSalesOrder(updated)
}

/** 승인된 오더를 취소한다 — 아직 배송 예정인 줄만 취소하고, 이미 출고 확정된 줄이 있으면 막는다. */
export async function cancelApprovedSalesOrder(
  id: string,
  input: { actor: string | null; reason: string; now?: Date }
): Promise<SalesOrder> {
  const reason = input.reason.trim()
  if (!reason) throw new SalesOrderError("취소 사유를 적어 주세요.", 400)
  const row = await getSalesOrderRow(id)
  if (row.status !== "approved") throw new SalesOrderError("승인된 오더만 취소할 수 있습니다.", 409)
  const sb = createSupabaseAdminClient()
  if (row.order_no) {
    // 시트 출고 줄이 이 오더번호로 실렸거나(앱 예정은 그때 대체돼 취소된다) 앱에서 출고 확정했으면 이미 나간 오더다.
    const { data: carried, error: carriedError } = await sb
      .from("hardware_movements")
      .select("id,status")
      .eq("movement_type", "outbound")
      .eq("raw->>order_no", row.order_no)
      .is("voided_at", null)
      .limit(50)
    if (carriedError) throw carriedError
    if (((carried ?? []) as Array<{ status: string | null }>).some((movement) => !isPlannedLedgerStatus(movement.status))) {
      throw new SalesOrderError("이미 출고된 줄이 있어 오더를 취소할 수 없습니다. 출고 기록(시트 포함)을 먼저 정리해 주세요.", 409)
    }
  }
  const movementIds = row.planned_movement_ids ?? []
  if (movementIds.length) {
    // 배송 예정을 출고 확정하면 실제 출고 줄이 converted_from_movement_id 로 예정 줄을 가리킨다(전량 확정이면
    // 예정 줄은 voided 로 닫히고, 부분 확정이면 수량만 줄어든다). 살아 있는 실제 출고가 하나라도 있으면 막는다.
    const { data: shipped, error: shippedError } = await sb
      .from("hardware_movements")
      .select("id")
      .in("converted_from_movement_id", movementIds)
      .is("voided_at", null)
      .limit(1)
    if (shippedError) throw shippedError
    if ((shipped ?? []).length > 0) {
      throw new SalesOrderError("이미 출고 확정된 줄이 있어 오더를 취소할 수 없습니다. 출고 기록을 먼저 정리해 주세요.", 409)
    }
    const { data, error } = await sb.from("hardware_movements").select("id,voided_at").in("id", movementIds)
    if (error) throw error
    for (const movement of (data ?? []) as Array<{ id: string; voided_at: string | null }>) {
      if (movement.voided_at) continue
      await voidHardwareMovement(movement.id, { reason: `오더 ${row.order_no ?? ""} 취소: ${reason}`, actor: input.actor })
    }
  }
  const { data, error } = await sb
    .from("sales_orders")
    .update({
      status: "cancelled",
      decided_by: input.actor,
      decided_at: (input.now ?? new Date()).toISOString(),
      decision_reason: `취소(${row.order_no ?? "번호 없음"}): ${reason}`,
    })
    .eq("id", id)
    .eq("status", "approved")
    .select("*")
  if (error) rethrow(error)
  const updated = ((data ?? []) as SalesOrderRow[])[0]
  if (!updated) throw new SalesOrderError("이미 처리된 오더입니다.", 409)
  revalidateTag(HARDWARE_INVENTORY_CACHE_TAG, "max")
  return toSalesOrder(updated)
}
