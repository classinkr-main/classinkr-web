import "server-only"

import {
  readOptionalDate,
  readOptionalNonNegativeInt,
  readOptionalString,
  readOptionalUuid,
  readRequiredEnum,
  readRequiredPositiveInt,
} from "@/app/api/admin/hardware/_validation"
import { auditOps } from "@/lib/ops-tools/audit"
import { limitOf, schema } from "@/lib/ops-tools/defs/shared"
import { OpsToolError } from "@/lib/ops-tools/errors"
import { type ReadToolDef, type ToolArgs, type WriteToolDef, defineWrite } from "@/lib/ops-tools/types"
import type { PartnerQuoteDetailsInput, PartnerQuoteLineItemInput } from "@/lib/partners-types"
import { logActivity } from "@/lib/portal/repositories/activity"
import { listDealListItems } from "@/lib/portal/repositories/deals"
import { searchDealsForMcp, searchQuotesForMcp } from "@/lib/portal/repositories/mcp-queries"
import {
  createQuoteDocument,
  createQuoteDocumentVersion,
  getQuoteDocument,
  getResolvableQuoteVersion,
} from "@/lib/portal/repositories/quote-documents"
import type { DealListItem } from "@/lib/portal/types"
import {
  buildStandardQuoteDetails,
  buildStandardQuoteTitle,
  isRetiredQuoteTemplate,
  mergeStandardQuoteLineItems,
  resolveQuoteSupplier,
  STANDARD_QUOTE_TEMPLATES,
  type StandardQuoteTemplateId,
} from "@/lib/standard-quote-template"

const QUOTE_TEMPLATE_IDS = STANDARD_QUOTE_TEMPLATES.map((t) => t.id).filter((id) => !isRetiredQuoteTemplate(id))

/**
 * 목록 끝에 붙이는 "더 있음" 표시 — 조건에 맞는 항목이 limit 을 넘거나 검색이 상한에서 멈췄을 때만 붙는다.
 * 결과는 계속 배열이고, 표시는 마지막 한 칸이다(항목 꼴은 그대로). tools/list(이름·설명·입력 칸)는 바꾸지 않는다 —
 * 기간(updatedFrom·updatedTo) 거르기는 조회 모듈이 받지만 도구 입력 칸으로는 열지 않았다(tests/mcp/fixtures/tools-list.before.json 동결).
 */
export const MORE_RESULTS_NOTE = "조건에 맞는 항목이 더 있다. limit 을 올리거나 query·기간으로 좁혀 다시 부른다."
const withMore = <T>(items: T[], more: boolean): Array<T | { more: true; note: string }> => (more ? [...items, { more: true as const, note: MORE_RESULTS_NOTE }] : items)

export const dealsList: ReadToolDef = {
  id: "deals.list",
  mcpName: "deals_list",
  risk: "R0",
  requiredScope: "read",
  title: "딜 목록",
  description: "견적을 붙일 딜 찾기 — 고객(학원)명·딜 제목 일부로 거른다. 최근 갱신순.",
  inputSchema: schema({ query: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 100, default: 30 } }),
  async run(args) {
    const { items, more } = await searchDealsForMcp({
      query: readOptionalString(args, "query", "query"),
      limit: limitOf(args, 30, 100),
    })
    return withMore(
      items.map((d) => ({
        id: d.id,
        title: d.title,
        customer_name: d.customer_name,
        campus: d.customer_campus_name,
        region: d.customer_region_label,
        stage: d.current_stage,
        status: d.status,
        owner: d.owner_name,
        updated_at: d.updated_at,
      })),
      more
    )
  },
}

export const quotesList: ReadToolDef = {
  id: "quotes.list",
  mcpName: "quotes_list",
  risk: "R0",
  requiredScope: "read",
  title: "견적 목록",
  description: "견적 문서(최신 갱신순) — 번호·고객·딜·상태·합계. 삭제된 견적은 빠진다.",
  inputSchema: schema({
    deal_id: { type: "string", format: "uuid" },
    status: { type: "string", description: "draft·sent·accepted 등" },
    query: { type: "string", description: "고객명·견적 제목·번호 일부" },
    limit: { type: "integer", minimum: 1, maximum: 100, default: 30 },
  }),
  async run(args) {
    const { items, more } = await searchQuotesForMcp({
      query: readOptionalString(args, "query", "query"),
      dealId: readOptionalUuid(args, "deal_id", "deal_id") ?? undefined,
      status: readOptionalString(args, "status", "status"),
      limit: limitOf(args, 30, 100),
    })
    return withMore(items, more)
  },
}

export const quoteGet: ReadToolDef = {
  id: "quotes.get",
  mcpName: "quote_get",
  risk: "R0",
  requiredScope: "read",
  title: "견적 상세",
  description: "견적 문서 하나와 최신 버전(품목 줄·공급자·합계·유효기한).",
  inputSchema: schema({ id: { type: "string", format: "uuid" } }, ["id"]),
  async run(args) {
    const id = readOptionalUuid(args, "id", "id")
    if (!id) throw new OpsToolError("id(견적 문서 uuid)가 필요하다.")
    const document = await getQuoteDocument(id)
    if (!document) throw new OpsToolError("그 id 의 견적이 없다(삭제됐을 수 있다).", "not_found")
    const version = await getResolvableQuoteVersion(document)
    // content_html(렌더 사본)은 길고 structured_json 과 같은 내용이라 뺀다
    return { document, version: version ? { ...version, content_html: undefined } : null }
  },
}

export const quoteTemplates: ReadToolDef = {
  id: "quotes.templates",
  mcpName: "quote_templates",
  risk: "R0",
  requiredScope: "read",
  title: "견적 템플릿",
  description: "quote_create_draft 에 쓰는 표준 견적 템플릿과 기본 품목 줄(줄 번호·이름·수량·단가). DB 를 부르지 않는다.",
  inputSchema: schema({}),
  run: async () =>
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
    })),
}

/** 기준 단가(템플릿 표준가)와 다른 단가 지정 한 줄 — preview 경고와 감사 payload 에만 싣는다(MCP 결과 꼴은 그대로) */
export type PriceOverrideWarning = {
  line_number: number
  name: string
  template_unit_price: number | null
  unit_price: number
  diff: number | null
  change_pct: number | null
}

/**
 * 템플릿 기본 줄 위에 줄 번호별 수량·단가만 덮는다 — 줄을 더하거나 빼지는 않는다(작성기에서 사람이).
 * 단가를 기준 단가와 다르게 준 줄은 경고로 모은다. 합계는 여기서 받지 않는다(buildStandardQuoteDetails 가 계산).
 */
export function applyLineOverrides(templateId: StandardQuoteTemplateId, raw: unknown): { lines: PartnerQuoteLineItemInput[]; priceWarnings: PriceOverrideWarning[] } {
  const lines = mergeStandardQuoteLineItems(templateId)
  const priceWarnings: PriceOverrideWarning[] = []
  if (raw == null) return { lines, priceWarnings }
  if (!Array.isArray(raw) || raw.length > 30) throw new OpsToolError("lines 는 30개까지의 배열.")
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new OpsToolError("lines 의 각 항목은 객체.")
    const o = entry as ToolArgs
    const lineNumber = readRequiredPositiveInt(o, "line_number", "line_number")
    const target = lines[lineNumber - 1]
    if (!target) throw new OpsToolError(`line_number ${lineNumber} 은 이 템플릿에 없다(1~${lines.length}).`)
    const quantity = readOptionalNonNegativeInt(o, "quantity", "quantity")
    const unitPrice = o.unit_price
    if (unitPrice != null && (typeof unitPrice !== "number" || !Number.isFinite(unitPrice) || unitPrice < 0)) {
      throw new OpsToolError("unit_price 는 0 이상의 수.")
    }
    const base = typeof target.unitPrice === "number" ? target.unitPrice : null
    if (typeof unitPrice === "number" && unitPrice !== base) {
      const diff = base == null ? null : unitPrice - base
      priceWarnings.push({
        line_number: lineNumber,
        name: target.itemName ?? "",
        template_unit_price: base,
        unit_price: unitPrice,
        diff,
        change_pct: base ? Math.round((unitPrice - base) / base * 1000) / 10 : null,
      })
    }
    lines[lineNumber - 1] = { ...target, quantity: quantity ?? target.quantity, unitPrice: (unitPrice as number | undefined) ?? target.unitPrice }
  }
  return { lines, priceWarnings }
}

type QuotePlan = {
  deal: Pick<DealListItem, "id" | "customer_name" | "partner_account_id" | "customer_id">
  templateId: StandardQuoteTemplateId
  details: PartnerQuoteDetailsInput
  priceWarnings: PriceOverrideWarning[]
}

export const quoteCreateDraft: WriteToolDef = defineWrite<QuotePlan>({
  id: "quotes.create_draft",
  mcpName: "quote_create_draft",
  risk: "R1",
  requiredScope: "write:quote",
  // 견적 문서에는 키를 실을 칸이 없다 — 같은 키 동시 실행은 공용 저장소(없으면 인스턴스 메모리)로 막는다
  sharedIdempotency: true,
  title: "견적 초안 만들기",
  description:
    "딜에 표준 템플릿 견적 초안(draft, 버전 1)을 만든다. 공급자(SW=클래스인/HW=퀴드러닝)·합계는 어드민 작성기와 같은 계산이다. 공유 링크·발송·승인은 하지 않는다 — 어드민 견적 탭에서 열어 옵션·담당자를 고친 뒤 사람이 보낸다. 줄을 안 주면 템플릿 기본 수량·단가를 쓴다(quote_templates 로 먼저 본다).",
  inputSchema: schema(
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
  async preview(args, actor) {
    const dealId = readOptionalUuid(args, "deal_id", "deal_id")
    if (!dealId) throw new OpsToolError("deal_id(딜 uuid)가 필요하다.")
    const templateId = readRequiredEnum(args, "template_id", "template_id", QUOTE_TEMPLATE_IDS) as StandardQuoteTemplateId
    const { lines: lineItems, priceWarnings } = applyLineOverrides(templateId, args.lines)
    const validUntil = readOptionalDate(args, "valid_until", "valid_until")
    const memo = readOptionalString(args, "internal_memo", "internal_memo")
    const [deal] = await listDealListItems({ dealId })
    if (!deal) throw new OpsToolError("그 id 의 딜이 없다.", "not_found")

    // 내부 메모는 바꾸기 전과 같다. 합계(subtotal·VAT·total)는 이 계산값만 쓴다 — 호출 인자에서 합계를 받지 않는다
    const details = buildStandardQuoteDetails(
      {
        templateId,
        recipientCompanyName: deal.customer_name ?? undefined,
        ...resolveQuoteSupplier(templateId),
        validUntil,
        internalMemo: [memo, `MCP 초안(${actor.name})`].filter(Boolean).join(" · "),
        lineItems,
      },
      templateId
    )
    return {
      plan: {
        deal: { id: deal.id, customer_name: deal.customer_name, partner_account_id: deal.partner_account_id, customer_id: deal.customer_id },
        templateId,
        details,
        priceWarnings,
      },
      summary: {
        deal_id: deal.id,
        customer: deal.customer_name,
        template_id: templateId,
        subtotal: details.subtotalAmount ?? 0,
        vat: details.vatAmount ?? 0,
        total: details.grandTotalAmount ?? 0,
      },
      warnings: priceWarnings.map((w) => ({ code: "unit_price_differs", ...w })),
    }
  },
  async execute({ plan }, actor) {
    const { deal, templateId, details, priceWarnings } = plan
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
    const summary = `견적서 ${document.quote_number} 초안 생성(MCP ${actor.name})`
    const audit = await auditOps(actor, {
      action: "quote.create_draft",
      targetType: "quote_document",
      targetId: document.id,
      payload: {
        quote_number: document.quote_number,
        deal_id: deal.id,
        template_id: templateId,
        total_amount: version.total_amount,
        ...(priceWarnings.length ? { price_overrides: priceWarnings.length } : {}),
      },
    })
    if (deal.partner_account_id) {
      // 딜 활동 기록(포털 견적 생성과 같은 줄) — 실패해도 초안은 이미 만들어졌으니 막지 않는다. 로그에는 코드만
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
      }).catch((e: unknown) => console.error(`[mcp] activity_failed tool=quote_create_draft code=${e instanceof Error ? e.name.replace(/\W/g, "") : "unknown"}`))
    }
    // 결과 꼴은 바꾸기 전과 같다. 감사 실패는 로그 코드로만(전에는 logAudit 이 삼켰다)
    const output = {
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
    return { output, ...(audit.ok ? {} : { auditFailure: audit.code }) }
  },
})
