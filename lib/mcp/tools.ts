import "server-only"

/**
 * 홈 MCP 도구 — 어드민이 쓰는 저장소 함수를 얇게 감싼다(숫자가 어드민 화면과 같도록).
 * 쓰기는 둘뿐이고 되돌릴 수 있는 것만 한다: 견적 초안(draft, 공유·발송 없음), HW 배송 예정 출고(확정은 사람이).
 * 쓰기는 audit_logs 에 `mcp:<호출자>` 로 남는다. 입력 검사는 HW 입출고 API 와 같은 읽기 함수를 쓴다.
 */
import {
  HardwareApiValidationError,
  readOptionalBoolean,
  readOptionalDate,
  readOptionalEnum,
  readOptionalNonNegativeInt,
  readOptionalString,
  readOptionalUuid,
  readRequiredEnum,
  readRequiredPositiveInt,
  readRequiredString,
  toErrorResponse,
} from "@/app/api/admin/hardware/_validation"
import { getCachedTrafficSummary } from "@/lib/admin/traffic-summary"
import { parseVisitorStatsRange } from "@/lib/admin-visitor-stats"
import { logAudit } from "@/lib/auth/audit"
import { evaluateChatbotQuery } from "@/lib/chatbot/service"
import { HARDWARE_OUTBOUND_TYPES, HARDWARE_PROGRESS_STATUS } from "@/lib/hardware/inventory-process"
import type { McpCaller, ToolResult } from "@/lib/mcp/server"
import type { PartnerQuoteLineItemInput } from "@/lib/partners-types"
import { logActivity } from "@/lib/portal/repositories/activity"
import { listDealListItems } from "@/lib/portal/repositories/deals"
import { listPortalDocuments } from "@/lib/portal/repositories/documents"
import {
  createQuoteDocument,
  createQuoteDocumentVersion,
  getQuoteDocument,
  getResolvableQuoteVersion,
} from "@/lib/portal/repositories/quote-documents"
import { createHardwareMovementRows, getHardwareDashboard, getHardwareMovementsPage } from "@/lib/repositories/hardware-inventory"
import { currentSalesFy, getHardwareSalesDashboard } from "@/lib/repositories/hardware-sales-dashboard"
import {
  buildStandardQuoteDetails,
  buildStandardQuoteTitle,
  isRetiredQuoteTemplate,
  mergeStandardQuoteLineItems,
  resolveQuoteSupplier,
  STANDARD_QUOTE_TEMPLATES,
  type StandardQuoteTemplateId,
} from "@/lib/standard-quote-template"

/** 도구 결과 글자 상한 — 넘으면 자르고 알린다(Claude 문맥 보호) */
export const MAX_RESULT_CHARS = 100_000

type Args = Record<string, unknown>
type ToolDef = {
  name: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  annotations: { title: string; readOnlyHint: boolean; destructiveHint: false; idempotentHint: boolean; openWorldHint: false }
}
type Tool = { def: ToolDef; run: (args: Args, caller: McpCaller) => Promise<unknown> }

const QUOTE_TEMPLATE_IDS = STANDARD_QUOTE_TEMPLATES.map((t) => t.id).filter((id) => !isRetiredQuoteTemplate(id))

const schema = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false })
const read = (name: string, title: string, description: string, inputSchema: Record<string, unknown>, run: Tool["run"]): Tool => ({
  def: { name, title, description, inputSchema, annotations: { title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  run,
})
const write = (name: string, title: string, description: string, inputSchema: Record<string, unknown>, run: Tool["run"]): Tool => ({
  def: { name, title, description, inputSchema, annotations: { title, readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } },
  run,
})

const limitOf = (args: Args, fallback: number, max: number) => Math.min(readOptionalNonNegativeInt(args, "limit", "limit") ?? fallback, max)
const includesText = (needle: string | undefined, ...hay: Array<string | null | undefined>) =>
  !needle || hay.some((v) => v?.toLocaleLowerCase("ko-KR").includes(needle.toLocaleLowerCase("ko-KR")))
const actorName = (caller: McpCaller) => `mcp:${caller.name}`

const TOOLS: Tool[] = [
  read(
    "hw_stock",
    "HW 재고 현황",
    "품목별 창고 재고·배송 예정(plannedOut)·가용·30일 출고·최소재고·주문 권장과 재고 알림. 어드민 HW 재고 화면과 같은 계산이다. itemId 는 hw_plan_movement 에 쓴다.",
    schema({
      query: { type: "string", description: "품목·분류 이름 일부(없으면 전체)" },
      attention_only: { type: "boolean", description: "부족·주문 권장 품목만" },
    }),
    async (args) => {
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
    }
  ),
  read(
    "hw_movements",
    "HW 입출고 기록",
    "최신순 입출고·회수·조정 기록(무효 제외). offset 으로 더 넘긴다.",
    schema({
      limit: { type: "integer", minimum: 1, maximum: 100, default: 30 },
      offset: { type: "integer", minimum: 0, default: 0 },
    }),
    async (args) => getHardwareMovementsPage(readOptionalNonNegativeInt(args, "offset", "offset") ?? 0, limitOf(args, 30, 100) || 1)
  ),
  read(
    "hw_sales",
    "HW 판매 집계",
    "회계연도(4월 시작) 월별 HW 판매·프로모션·샘플 대수. 어드민 HW 판매 대시보드와 같다.",
    schema({ fy: { type: "integer", description: "회계연도 시작 연도(예: 2026 = 2026-04~2027-03). 없으면 올해" } }),
    async (args) => getHardwareSalesDashboard(readOptionalNonNegativeInt(args, "fy", "fy") ?? currentSalesFy(new Date()))
  ),
  read(
    "deals_list",
    "딜 목록",
    "견적을 붙일 딜 찾기 — 고객(학원)명·딜 제목 일부로 거른다. 최근 갱신순.",
    schema({ query: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 100, default: 30 } }),
    async (args) => {
      const query = readOptionalString(args, "query", "query")
      const deals = await listDealListItems()
      return deals
        .filter((d) => includesText(query, d.customer_name, d.customer_campus_name, d.title))
        .slice(0, limitOf(args, 30, 100))
        .map((d) => ({
          id: d.id,
          title: d.title,
          customer_name: d.customer_name,
          campus: d.customer_campus_name,
          region: d.customer_region_label,
          stage: d.current_stage,
          status: d.status,
          owner: d.owner_name,
          updated_at: d.updated_at,
        }))
    }
  ),
  read(
    "quotes_list",
    "견적 목록",
    "견적 문서(최신 갱신순) — 번호·고객·딜·상태·합계. 삭제된 견적은 빠진다.",
    schema({
      deal_id: { type: "string", format: "uuid" },
      status: { type: "string", description: "draft·sent·accepted 등" },
      query: { type: "string", description: "고객명·견적 제목·번호 일부" },
      limit: { type: "integer", minimum: 1, maximum: 100, default: 30 },
    }),
    async (args) => {
      const query = readOptionalString(args, "query", "query")
      const { documents } = await listPortalDocuments({
        type: "quote",
        dealId: readOptionalUuid(args, "deal_id", "deal_id") ?? undefined,
        status: readOptionalString(args, "status", "status"),
      })
      return documents.filter((d) => includesText(query, d.customer_name, d.title, d.document_number, d.deal_title)).slice(0, limitOf(args, 30, 100))
    }
  ),
  read(
    "quote_get",
    "견적 상세",
    "견적 문서 하나와 최신 버전(품목 줄·공급자·합계·유효기한).",
    schema({ id: { type: "string", format: "uuid" } }, ["id"]),
    async (args) => {
      const id = readOptionalUuid(args, "id", "id")
      if (!id) throw new HardwareApiValidationError("id(견적 문서 uuid)가 필요하다.")
      const document = await getQuoteDocument(id)
      if (!document) throw new HardwareApiValidationError("그 id 의 견적이 없다(삭제됐을 수 있다).")
      const version = await getResolvableQuoteVersion(document)
      // content_html(렌더 사본)은 길고 structured_json 과 같은 내용이라 뺀다
      return { document, version: version ? { ...version, content_html: undefined } : null }
    }
  ),
  read(
    "quote_templates",
    "견적 템플릿",
    "quote_create_draft 에 쓰는 표준 견적 템플릿과 기본 품목 줄(줄 번호·이름·수량·단가). DB 를 부르지 않는다.",
    schema({}),
    async () =>
      STANDARD_QUOTE_TEMPLATES.filter((t) => QUOTE_TEMPLATE_IDS.includes(t.id)).map((t) => ({
        template_id: t.id,
        label: t.label,
        description: t.description,
        lines: t.lines.map((line, index) => ({
          line_number: index + 1,
          name: line.itemName,
          quantity: line.quantity,
          unit_price: line.unitPrice ?? null,
          status: line.lineStatus ?? "priced",
        })),
      }))
  ),
  read(
    "chatbot_ask",
    "챗봇 답 미리보기",
    "공개 챗봇에 질문을 넣어 실제 답·출처·상담 연결 판단을 본다. 분석 로그에 남지 않는다. internal=true 면 내부 CS 문서까지 근거로 쓴다(코파일럿과 같음).",
    schema({ question: { type: "string", maxLength: 1000 }, internal: { type: "boolean", default: false } }, ["question"]),
    async (args) => {
      const question = readRequiredString(args, "question", "question")
      if (question.length > 1000) throw new HardwareApiValidationError("question 은 1000자까지.")
      const res = await evaluateChatbotQuery(question, {
        generateAnswer: true,
        includeInternalDocs: readOptionalBoolean(args, "internal", "internal") ?? false,
      })
      return {
        answer: res.answer,
        answerMode: res.answerMode,
        confidence: res.confidence,
        needsHandoff: res.needsHandoff,
        handoffIntent: res.handoffIntent,
        unresolved: res.unresolved,
        category: res.detectedCategory,
        intent: res.detectedIntent,
        sources: res.sources,
        suggestedQuestions: res.suggestedQuestions,
        warning: res.warning,
      }
    }
  ),
  read(
    "site_traffic",
    "사이트 방문·유입",
    "홈페이지 방문자·페이지뷰 일별, 홈 유입 흐름, 이벤트·버튼 클릭 수, 리드 전환. 어드민 Analytics 방문자 탭과 같은 값(60초 캐시).",
    schema({ range_days: { type: "integer", enum: [7, 14, 30, 90], default: 30 } }),
    async (args) => {
      const raw = args.range_days
      return getCachedTrafficSummary(parseVisitorStatsRange(raw == null ? null : String(raw)))
    }
  ),
  write(
    "quote_create_draft",
    "견적 초안 만들기",
    "딜에 표준 템플릿 견적 초안(draft, 버전 1)을 만든다. 공급자(SW=클래스인/HW=퀴드러닝)·합계는 어드민 작성기와 같은 계산이다. 공유 링크·발송·승인은 하지 않는다 — 어드민 견적 탭에서 열어 옵션·담당자를 고친 뒤 사람이 보낸다. 줄을 안 주면 템플릿 기본 수량·단가를 쓴다(quote_templates 로 먼저 본다).",
    schema(
      {
        deal_id: { type: "string", format: "uuid", description: "deals_list 의 id" },
        template_id: { type: "string", enum: QUOTE_TEMPLATE_IDS },
        lines: {
          type: "array",
          maxItems: 30,
          items: schema({ line_number: { type: "integer", minimum: 1 }, quantity: { type: "integer", minimum: 0 }, unit_price: { type: "number", minimum: 0 } }, ["line_number"]),
        },
        valid_until: { type: "string", format: "date", description: "YYYY-MM-DD" },
        internal_memo: { type: "string", maxLength: 500 },
      },
      ["deal_id", "template_id"]
    ),
    async (args, caller) => {
      const dealId = readOptionalUuid(args, "deal_id", "deal_id")
      if (!dealId) throw new HardwareApiValidationError("deal_id(딜 uuid)가 필요하다.")
      const templateId = readRequiredEnum(args, "template_id", "template_id", QUOTE_TEMPLATE_IDS) as StandardQuoteTemplateId
      const lineItems = applyLineOverrides(templateId, args.lines)
      const validUntil = readOptionalDate(args, "valid_until", "valid_until")
      const memo = readOptionalString(args, "internal_memo", "internal_memo")
      const [deal] = await listDealListItems({ dealId })
      if (!deal) throw new HardwareApiValidationError("그 id 의 딜이 없다.")

      const details = buildStandardQuoteDetails(
        {
          templateId,
          recipientCompanyName: deal.customer_name ?? undefined,
          ...resolveQuoteSupplier(templateId),
          validUntil,
          internalMemo: [memo, `MCP 초안(${caller.name})`].filter(Boolean).join(" · "),
          lineItems,
        },
        templateId
      )
      const document = await createQuoteDocument({
        deal_id: deal.id,
        status: "draft",
        current_version_id: null,
        created_by: null,
        created_by_role: "admin",
        approved_by: null,
        approved_at: null,
      })
      const version = await createQuoteDocumentVersion({
        quote_document_id: document.id,
        version_number: 1,
        title: buildStandardQuoteTitle(details),
        content_html: null,
        structured_json: { quoteDetails: details },
        subtotal: details.subtotalAmount ?? 0,
        discount_amount: details.discountAmount ?? 0,
        tax_amount: details.vatAmount ?? 0,
        total_amount: details.grandTotalAmount ?? 0,
        valid_until: details.validUntil ?? null,
        created_by: null,
      })
      const summary = `견적서 ${document.quote_number} 초안 생성(MCP ${caller.name})`
      await logAudit({
        actorUserId: null,
        actorDisplayName: actorName(caller),
        actorRole: "MCP",
        action: "quote.create_draft",
        targetType: "quote_document",
        targetId: document.id,
        payload: { quote_number: document.quote_number, deal_id: deal.id, template_id: templateId, total_amount: version.total_amount },
      })
      if (deal.partner_account_id) {
        // 딜 활동 기록(포털 견적 생성과 같은 줄) — 실패해도 초안은 이미 만들어졌으니 막지 않는다
        await logActivity({
          partner_account_id: deal.partner_account_id,
          customer_id: deal.customer_id,
          deal_id: deal.id,
          actor_user_id: null,
          actor_role: "admin",
          action_type: "create",
          target_type: "quote_document",
          target_id: document.id,
          summary,
          before_json: null,
          after_json: { ...document, current_version_id: version.id } as unknown as Record<string, unknown>,
        }).catch((e) => console.error("[mcp] 견적 활동 기록 실패", e instanceof Error ? e.message : e))
      }
      return {
        id: document.id,
        quote_number: document.quote_number,
        status: "draft",
        title: version.title,
        customer: deal.customer_name,
        subtotal: version.subtotal,
        vat: version.tax_amount,
        total: version.total_amount,
        lines: details.lineItems?.map((l) => ({ name: l.itemName, quantity: l.quantity, unit_price: l.unitPrice, status: l.lineStatus })),
        next: "어드민 견적 탭에서 이 번호를 열어 옵션·담당자 연락처를 확인한 뒤 공유한다.",
      }
    }
  ),
  write(
    "hw_plan_movement",
    "HW 배송 예정 등록",
    "창고에서 고객에게 나갈 출고를 '배송 예정'으로 등록한다(가용에서 미리 빠진다, 창고 재고는 그대로). 실제 출고 확정·입고·조정은 하지 않는다 — 어드민 HW 화면에서 사람이 확정한다.",
    schema(
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
    async (args, caller) => {
      const name = actorName(caller)
      const plannedDate = readOptionalDate(args, "planned_date", "planned_date")
      if (!plannedDate) throw new HardwareApiValidationError("planned_date(배송 예정일)가 필요하다.")
      const memo = readOptionalString(args, "memo", "memo")
      const rows = await createHardwareMovementRows(
        {
          itemId: readOptionalString(args, "item_id", "item_id"),
          productName: readRequiredString(args, "product_name", "product_name"),
          movementType: "outbound",
          quantity: readRequiredPositiveInt(args, "quantity", "quantity"),
          occurredAt: plannedDate,
          fromLocation: "창고",
          toLocation: readRequiredString(args, "customer", "customer"),
          status: HARDWARE_PROGRESS_STATUS.planned,
          outboundType: readOptionalEnum(args, "outbound_type", "outbound_type", HARDWARE_OUTBOUND_TYPES) ?? "sales",
          referenceNo: readOptionalString(args, "reference_no", "reference_no"),
          lotNo: readOptionalString(args, "lot_no", "lot_no"),
          memo: [memo, `MCP 등록(${caller.name})`].filter(Boolean).join(" · "),
          createdBy: name,
          raw: { mcp: { caller: caller.name } },
        },
        { actor: { userId: null, name, isInventoryManager: false } }
      )
      await logAudit({
        actorUserId: null,
        actorDisplayName: name,
        actorRole: "MCP",
        action: "hardware.plan_movement",
        targetType: "hardware_movement",
        targetId: rows[0]?.id,
        payload: { ids: rows.map((r) => r.id), product_name: rows[0]?.product_name, quantity: rows.reduce((s, r) => s + r.quantity, 0) },
      })
      return rows.map((r) => ({ id: r.id, product: r.product_name, quantity: r.quantity, planned_date: r.occurred_at, to: r.to_location, status: r.status, lot_no: r.lot_no }))
    }
  ),
]

/** 템플릿 기본 줄 위에 줄 번호별 수량·단가만 덮는다 — 줄을 더하거나 빼지는 않는다(작성기에서 사람이) */
function applyLineOverrides(templateId: StandardQuoteTemplateId, raw: unknown): PartnerQuoteLineItemInput[] {
  const lines = mergeStandardQuoteLineItems(templateId)
  if (raw == null) return lines
  if (!Array.isArray(raw) || raw.length > 30) throw new HardwareApiValidationError("lines 는 30개까지의 배열.")
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new HardwareApiValidationError("lines 의 각 항목은 객체.")
    const o = entry as Args
    const lineNumber = readRequiredPositiveInt(o, "line_number", "line_number")
    const target = lines[lineNumber - 1]
    if (!target) throw new HardwareApiValidationError(`line_number ${lineNumber} 은 이 템플릿에 없다(1~${lines.length}).`)
    const quantity = readOptionalNonNegativeInt(o, "quantity", "quantity")
    const unitPrice = o.unit_price
    if (unitPrice != null && (typeof unitPrice !== "number" || !Number.isFinite(unitPrice) || unitPrice < 0)) {
      throw new HardwareApiValidationError("unit_price 는 0 이상의 수.")
    }
    lines[lineNumber - 1] = { ...target, quantity: quantity ?? target.quantity, unitPrice: (unitPrice as number | undefined) ?? target.unitPrice }
  }
  return lines
}

const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.def.name, t]))

export const listTools = () => TOOLS.map((t) => t.def)

const text = (value: string, isError?: boolean): ToolResult => ({ content: [{ type: "text", text: value }], ...(isError ? { isError } : {}) })

/** 도구 실행 — 입력 오류는 isError 결과로(사람·Claude 가 고칠 수 있다). 모르는 오류는 던져 server.ts 가 감춘다 */
export async function callTool(name: string, rawArgs: unknown, caller: McpCaller): Promise<ToolResult> {
  const tool = TOOL_BY_NAME.get(name)
  if (!tool) return text(`모르는 도구: ${name.slice(0, 60)}`, true)
  if (rawArgs != null && (typeof rawArgs !== "object" || Array.isArray(rawArgs))) return text("arguments 는 객체여야 한다.", true)
  try {
    const out = JSON.stringify(await tool.run((rawArgs ?? {}) as Args, caller), null, 1)
    return text(out.length > MAX_RESULT_CHARS ? `${out.slice(0, MAX_RESULT_CHARS)}\n…(잘림: ${out.length}자 중 ${MAX_RESULT_CHARS}자. 조건을 좁혀 다시 부른다)` : out)
  } catch (e) {
    // HW 입출고 API 와 같은 판정(검증·규칙·중복·재고 부족 → 4xx). 4xx 는 고칠 수 있는 오류라 글을 그대로 돌려준다
    const res = toErrorResponse(e, "")
    if (res.status < 500) return text(((await res.json()) as { error?: string }).error ?? "입력을 확인한다.", true)
    throw e
  }
}
