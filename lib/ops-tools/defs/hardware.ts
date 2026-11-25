import "server-only"

import {
  readOptionalBoolean,
  readOptionalDate,
  readOptionalEnum,
  readOptionalNonNegativeInt,
  readOptionalString,
  readRequiredPositiveInt,
  readRequiredString,
} from "@/app/api/admin/hardware/_validation"
import { HARDWARE_OUTBOUND_TYPES, HARDWARE_PROGRESS_STATUS, type HardwareOutboundType } from "@/lib/hardware/inventory-process"
import { type OpsActor, actorDisplayName } from "@/lib/ops-tools/actor"
import { auditOps } from "@/lib/ops-tools/audit"
import { idempotencyConflict } from "@/lib/ops-tools/guard"
import { includesText, limitOf, schema } from "@/lib/ops-tools/defs/shared"
import { OpsToolError } from "@/lib/ops-tools/errors"
import { type ReadToolDef, type WriteToolDef, defineWrite } from "@/lib/ops-tools/types"
import {
  type HardwareMovement,
  createHardwareMovementRows,
  findHardwareMovementsByMcpIdempotencyKey,
  getHardwareDashboard,
  getHardwareMovementsPage,
  listHardwareItems,
} from "@/lib/repositories/hardware-inventory"
import { currentSalesFy, getHardwareSalesDashboard } from "@/lib/repositories/hardware-sales-dashboard"

export const hwStock: ReadToolDef = {
  id: "hw.stock",
  mcpName: "hw_stock",
  risk: "R0",
  requiredScope: "read",
  title: "HW 재고 현황",
  description:
    "품목별 창고 재고·배송 예정(plannedOut)·가용·30일 출고·최소재고·주문 권장과 재고 알림. 어드민 HW 재고 화면과 같은 계산이다. itemId 는 hw_plan_movement 에 쓴다.",
  inputSchema: schema({
    query: { type: "string", description: "품목·분류 이름 일부(없으면 전체)" },
    attention_only: { type: "boolean", description: "부족·주문 권장 품목만" },
  }),
  async run(args) {
    const query = readOptionalString(args, "query", "query")
    const attentionOnly = readOptionalBoolean(args, "attention_only", "attention_only")
    const dashboard = await getHardwareDashboard()
    return {
      totals: dashboard.totals,
      stock: dashboard.stock
        .filter((row) => includesText(query, row.product, row.category) && (!attentionOnly || row.low || row.orderRecommended))
        .map((row) => ({ ...row, lotBalances: undefined })), // 물류번호별 잔고는 길어서 뺀다(JSON 에서 사라진다)
      alerts: dashboard.alerts,
    }
  },
}

export const hwMovements: ReadToolDef = {
  id: "hw.movements",
  mcpName: "hw_movements",
  risk: "R0",
  requiredScope: "read",
  title: "HW 입출고 기록",
  description: "최신순 입출고·회수·조정 기록(무효 제외). offset 으로 더 넘긴다.",
  inputSchema: schema({
    limit: { type: "integer", minimum: 1, maximum: 100, default: 30 },
    offset: { type: "integer", minimum: 0, default: 0 },
  }),
  run: async (args) => getHardwareMovementsPage(readOptionalNonNegativeInt(args, "offset", "offset") ?? 0, limitOf(args, 30, 100) || 1),
}

export const hwSales: ReadToolDef = {
  id: "hw.sales",
  mcpName: "hw_sales",
  risk: "R0",
  requiredScope: "read",
  title: "HW 판매 집계",
  description: "회계연도(4월 시작) 월별 HW 판매·프로모션·샘플 대수. 어드민 HW 판매 대시보드와 같다.",
  inputSchema: schema({ fy: { type: "integer", description: "회계연도 시작 연도(예: 2026 = 2026-04~2027-03). 없으면 올해" } }),
  run: async (args) => getHardwareSalesDashboard(readOptionalNonNegativeInt(args, "fy", "fy") ?? currentSalesFy(new Date())),
}

type HwPlan = {
  /** name 은 기록에 실을 품목 이름 — item_id 로 골랐으면 전처럼 받은 product_name, 이름으로 골랐으면 그 품목의 이름 */
  item: { id: string; name: string }
  quantity: number
  plannedDate: string
  customer: string
  outboundType: HardwareOutboundType
  referenceNo: string | undefined
  lotNo: string | undefined
  memo: string | undefined
}

const isUniqueViolation = (e: unknown) => Boolean(e && typeof e === "object" && (e as { code?: unknown }).code === "23505")

const normalizeName = (v: string) => v.replace(/\s+/g, " ").trim()

/**
 * 품목 고르기 — 새 품목 행을 만들지 않는다(점검 R8: 전에는 이름이 조금만 달라도 hardware_items 에 유령 품목이 생겼다).
 * item_id 가 있으면 그 품목, 없으면 이름(공백 정리)이 정확히 같은 기존 품목이 하나일 때만. 아니면 후보를 싣고 거절한다.
 */
async function resolveExistingItem(itemId: string | undefined, productName: string) {
  const items = await listHardwareItems()
  if (itemId) {
    const found = items.find((i) => i.id === itemId)
    if (!found) throw new OpsToolError("그 item_id 의 품목이 없다. hw_stock 의 itemId 를 쓴다.", "item_not_found")
    return { id: found.id, name: found.name }
  }
  const wanted = normalizeName(productName)
  const exact = items.filter((i) => normalizeName(i.name) === wanted || (i.source_aliases ?? []).some((a) => normalizeName(a) === wanted))
  if (exact.length === 1) return { id: exact[0].id, name: exact[0].name }
  const candidates = (exact.length > 1 ? exact : items.filter((i) => includesText(wanted, i.name) || includesText(i.name, wanted)))
    .slice(0, 10)
    .map((i) => ({ item_id: i.id, name: i.name }))
  throw new OpsToolError(
    exact.length > 1
      ? `'${wanted}' 와 같은 이름의 품목이 ${exact.length}개다. item_id 로 하나를 골라 다시 부른다. 후보: ${JSON.stringify(candidates)}`
      : `'${wanted}' 와 이름이 정확히 같은 품목이 없다. 새 품목은 만들지 않는다 — item_id 로 다시 부른다. 후보: ${JSON.stringify(candidates)}`,
    "item_not_exact"
  )
}

const movementOutput = (rows: Pick<HardwareMovement, "id" | "product_name" | "quantity" | "occurred_at" | "to_location" | "status" | "lot_no">[]) =>
  rows.map((r) => ({ id: r.id, product: r.product_name, quantity: r.quantity, planned_date: r.occurred_at, to: r.to_location, status: r.status, lot_no: r.lot_no }))

export const hwPlanMovement: WriteToolDef = defineWrite<HwPlan>({
  id: "hw.plan_movement",
  mcpName: "hw_plan_movement",
  risk: "R1",
  requiredScope: "write:hw",
  title: "HW 배송 예정 등록",
  description:
    "창고에서 고객에게 나갈 출고를 '배송 예정'으로 등록한다(가용에서 미리 빠진다, 창고 재고는 그대로). 실제 출고 확정·입고·조정은 하지 않는다 — 어드민 HW 화면에서 사람이 확정한다.",
  inputSchema: schema(
    {
      item_id: { type: "string", description: "hw_stock 의 itemId(있으면 품목을 정확히 고른다)" },
      product_name: { type: "string", description: "품목 이름(hw_stock 의 product)" },
      quantity: { type: "integer", minimum: 1 },
      planned_date: { type: "string", format: "date", description: "배송 예정일 YYYY-MM-DD" },
      customer: { type: "string", description: "받는 곳(학원·고객명)" },
      outbound_type: { type: "string", enum: [...HARDWARE_OUTBOUND_TYPES], default: "sales", description: "sales(세일즈)·promotion·as·sample" },
      reference_no: { type: "string", description: "주문·계약 번호(중복 등록을 막는 데 쓰인다)" },
      lot_no: { type: "string", description: "물류 번호" },
      memo: { type: "string", maxLength: 500 },
    },
    ["product_name", "quantity", "planned_date", "customer"]
  ),
  async preview(args) {
    const plannedDate = readOptionalDate(args, "planned_date", "planned_date")
    if (!plannedDate) throw new OpsToolError("planned_date(배송 예정일)가 필요하다.")
    const memo = readOptionalString(args, "memo", "memo")
    const itemId = readOptionalString(args, "item_id", "item_id")
    const productName = readRequiredString(args, "product_name", "product_name")
    const quantity = readRequiredPositiveInt(args, "quantity", "quantity")
    const customer = readRequiredString(args, "customer", "customer")
    const outboundType = readOptionalEnum(args, "outbound_type", "outbound_type", HARDWARE_OUTBOUND_TYPES) ?? "sales"
    const referenceNo = readOptionalString(args, "reference_no", "reference_no")
    const lotNo = readOptionalString(args, "lot_no", "lot_no")
    const found = await resolveExistingItem(itemId, productName)
    // item_id 로 고른 경우 기록의 품목 이름은 전처럼 받은 이름이다(바꾸기 전 동작). 다르면 미리보기 경고로만 알린다
    const item = itemId ? { id: found.id, name: productName } : found
    const warnings = itemId && normalizeName(found.name) !== normalizeName(productName)
      ? [{ code: "product_name_differs", message: `item_id 의 품목 이름은 ${found.name} 이다(받은 이름: ${productName}).` }]
      : []
    return {
      plan: { item, quantity, plannedDate, customer, outboundType, referenceNo, lotNo, memo },
      summary: { item_id: item.id, product: item.name, quantity, planned_date: plannedDate, to: customer, outbound_type: outboundType, status: HARDWARE_PROGRESS_STATUS.planned },
      warnings,
    }
  },
  async execute({ plan }, actor, meta) {
    const name = actorDisplayName(actor)
    const input = {
      itemId: plan.item.id,
      productName: plan.item.name,
      movementType: "outbound" as const,
      quantity: plan.quantity,
      occurredAt: plan.plannedDate,
      fromLocation: "창고",
      toLocation: plan.customer,
      status: HARDWARE_PROGRESS_STATUS.planned,
      outboundType: plan.outboundType,
      referenceNo: plan.referenceNo,
      lotNo: plan.lotNo,
      memo: [plan.memo, `MCP 등록(${actor.name})`].filter(Boolean).join(" · "),
      createdBy: name,
      raw: {
        mcp: {
          caller: actor.name,
          ...(meta.idempotency ? { idempotency_key_hash: meta.idempotency.keyHash, args_fingerprint: meta.idempotency.fingerprint } : {}),
        },
      },
    }
    let rows: HardwareMovement[]
    try {
      rows = await createHardwareMovementRows(input, { actor: { userId: null, name, isInventoryManager: false } })
    } catch (e) {
      // 같은 키로 동시에 들어온 두 번째 호출 — 유니크 색인(마이그레이션 20261125_hardware_movements_mcp_idempotency_unique)이
      // 23505 로 막았다. 먼저 만든 행을 찾아 "이미 처리됨, 처음 결과"로 돌려준다. 색인 전에는 이 갈래에 오지 않는다
      if (!meta.idempotency || !isUniqueViolation(e)) throw e
      const existing = await findHardwareMovementsByMcpIdempotencyKey(actor.name, meta.idempotency.keyHash)
      if (!existing.length) throw e // 다른 유니크 제약(원본 키 등)이다
      const stored = (existing[0].raw as { mcp?: { args_fingerprint?: unknown } } | null)?.mcp?.args_fingerprint
      if (stored !== meta.idempotency.fingerprint) throw idempotencyConflict()
      return { output: movementOutput(existing), replayed: true }
    }
    const audit = await auditOps(actor, {
      action: "hardware.plan_movement",
      targetType: "hardware_movement",
      targetId: rows[0]?.id,
      payload: { ids: rows.map((r) => r.id), product_name: rows[0]?.product_name, quantity: rows.reduce((s, r) => s + r.quantity, 0) },
    })
    // 결과 꼴은 바꾸기 전과 같은 배열 하나. 감사 실패는 로그 코드로만(전에는 logAudit 이 삼켰다)
    return { output: movementOutput(rows), ...(audit.ok ? {} : { auditFailure: audit.code }) }
  },
  async findExisting(actor: OpsActor, keyHash: string) {
    const rows = await findHardwareMovementsByMcpIdempotencyKey(actor.name, keyHash)
    if (!rows.length) return null
    const mcp = (rows[0].raw as { mcp?: { args_fingerprint?: unknown } } | null)?.mcp
    return { result: { output: movementOutput(rows) }, fingerprint: typeof mcp?.args_fingerprint === "string" ? mcp.args_fingerprint : null }
  },
})
