// 갈매봇 내부 원격 업무 — 쓰기(등록)의 인자 고르기와 미리보기 → 오더 카드.
//
// 조율기는 레지스트리 쓰기 도구(견적 초안·HW 배송 예정)의 preview 만 부른다. execute 는 사람이 카드에서 확인한 뒤
// POST /api/admin/ai/orders/confirm(confirm.ts)에서만 — 이 파일은 execute 를 부르지 않는다.
// 금액·합계는 preview 가 서버에서 계산한 summary 값만 카드에 싣는다.
import type { ToolArgs, WritePreview } from "@/lib/ops-tools/types"

import { ORDER_TTL_MS } from "../order-state"
import type { AiBlock, OrderField, OrderTicket } from "../types"
import { issueTicket } from "./tickets"
import { TOOL_SCREEN, hrefOf, krw, listOf, num, str, units, productQueryOf, type OpsDeps, type ToolTurnContext } from "./tools"

/** 날짜 — 오늘·내일·모레·YYYY-MM-DD·M월 D일(한국 시각). 없으면 undefined. */
export function plannedDateOf(text: string, now: number): string | undefined {
  const kst = (offsetDays: number) => new Date(now + 9 * 3600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10)
  if (/오늘/.test(text)) return kst(0)
  if (/내일/.test(text)) return kst(1)
  if (/모레/.test(text)) return kst(2)
  const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return iso[0]
  const md = text.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/)
  if (md) {
    const year = Number(kst(0).slice(0, 4))
    return `${year}-${md[1].padStart(2, "0")}-${md[2].padStart(2, "0")}`
  }
  return undefined
}

export type WriteArgsResult =
  | { ok: true; tool: "quote_create_draft" | "hw_plan_movement"; args: ToolArgs; /** 카드에 보일 이름(요약 칸 키 → 이름) */ labels?: Record<string, string> }
  | { ok: false; block: AiBlock }

interface TemplateOption {
  id: string
  label: string
}

function needMore(title: string, missing: string[], linkId: string): AiBlock {
  const href = hrefOf(linkId)
  return {
    kind: "deny",
    card: {
      title,
      target: { label: "더 필요한 값", meta: missing.join(" · ") },
      text: `${missing.join(", ")}을(를) 알려 주시면 오더 카드를 만듭니다. 화면에서 직접 할 수도 있습니다.`,
      ...(href ? { openLabel: "화면에서 직접", openHref: href } : {}),
    },
  }
}

/** 견적 초안 인자 — 열린 딜(페이지 맥락)과 문장 속 템플릿 이름. 고르지 못하면 되묻기 카드. */
export async function quoteDraftArgs(ctx: ToolTurnContext, deps: OpsDeps): Promise<WriteArgsResult> {
  const entity = ctx.context?.entity
  const dealId = entity?.type === "deal" ? entity.id : undefined
  const templatesDef = deps.getTool("quote_templates")
  let templates: TemplateOption[] = []
  if (templatesDef) {
    try {
      const { value } = await deps.run(templatesDef, {}, ctx.actor)
      templates = listOf(value).map((row) => ({ id: str(row.template_id), label: str(row.label) })).filter((t) => t.id)
    } catch {
      templates = []
    }
  }
  const lowered = ctx.text.toLowerCase()
  const matched = templates.filter((t) => lowered.includes(t.label.toLowerCase()) || lowered.includes(t.id.toLowerCase()) || t.label.split(/\s+/).some((w) => w.length >= 2 && /[A-Za-z0-9]/.test(w) && lowered.includes(w.toLowerCase())))
  const missing: string[] = []
  if (!dealId) missing.push("딜(딜 화면을 열고 다시 요청)")
  if (matched.length !== 1) missing.push("견적 템플릿")
  if (missing.length > 0) {
    if (dealId && matched.length !== 1 && templates.length > 0) {
      return {
        ok: false,
        block: {
          kind: "choice",
          card: {
            title: "어느 템플릿으로 만들까요?",
            target: { label: entity?.label ?? "열린 딜", meta: "견적 초안" },
            options: (matched.length > 1 ? matched : templates).slice(0, 4).map((t) => ({ label: t.label, meta: `"${t.label} 견적 초안 만들어 줘"` })),
            note: "템플릿 이름을 넣어 다시 요청하면 오더 카드를 만듭니다.",
          },
        },
      }
    }
    return { ok: false, block: needMore("견적 초안 — 값이 더 필요합니다", missing, "admin:quotes") }
  }
  return { ok: true, tool: "quote_create_draft", args: { deal_id: dealId, template_id: matched[0].id }, labels: { template_id: matched[0].label } }
}

/**
 * HW 배송 예정 인자 — 품목·수량·날짜·받는 곳(열린 고객). 품목은 재고 조회(hw_stock)로 기존 품목 하나를 골라 item_id 로 넘긴다
 * (새 품목을 만들지 않는다). 빠진 값이 있거나 품목이 여럿이면 되묻는다.
 */
export async function hwPlanArgs(ctx: ToolTurnContext, deps: OpsDeps): Promise<WriteArgsResult> {
  const product = productQueryOf(ctx.text)
  const quantity = ctx.text.match(/(\d+)\s*(?:대|개|세트)/)?.[1]
  const plannedDate = plannedDateOf(ctx.text, ctx.now)
  const entity = ctx.context?.entity
  const customer = entity && (entity.type === "customer" || entity.type === "lead") ? entity.label : undefined
  const missing = [
    ...(product ? [] : ["품목"]),
    ...(quantity ? [] : ["수량"]),
    ...(plannedDate ? [] : ["배송 예정일"]),
    ...(customer ? [] : ["받는 곳(고객 화면을 열고 다시 요청)"]),
  ]
  if (missing.length > 0) return { ok: false, block: needMore("배송 예정 — 값이 더 필요합니다", missing, "admin:hardware") }

  const stockDef = deps.getTool("hw_stock")
  let items: Array<{ id: string; name: string }> = []
  if (stockDef) {
    try {
      const { value } = await deps.run(stockDef, { query: product }, ctx.actor)
      items = listOf(value, ["stock"]).map((row) => ({ id: str(row.itemId), name: str(row.product) })).filter((item) => item.id)
    } catch {
      items = []
    }
  }
  if (items.length !== 1) {
    if (items.length > 1) {
      return {
        ok: false,
        block: {
          kind: "choice",
          card: {
            title: "어느 품목인가요?",
            target: { label: product ?? "품목", meta: `${items.length}개 후보` },
            options: items.slice(0, 4).map((item) => ({ label: item.name, meta: `"${item.name} ${quantity}대 배송 예정 등록해 줘"` })),
            note: "이름이 겹치면 추측하지 않습니다.",
          },
        },
      }
    }
    return { ok: false, block: needMore("배송 예정 — 품목을 찾지 못했습니다", [`품목(${product} 와 맞는 품목 없음)`], "admin:hardware") }
  }
  return {
    ok: true,
    tool: "hw_plan_movement",
    args: { item_id: items[0].id, product_name: items[0].name, quantity: Number(quantity), planned_date: plannedDate, customer },
  }
}

const SUMMARY_LABEL: Record<string, string> = {
  customer: "고객",
  template_id: "템플릿",
  subtotal: "공급가",
  vat: "부가세",
  product: "품목",
  quantity: "수량",
  planned_date: "배송 예정일",
  to: "받는 곳",
  outbound_type: "출고 유형",
  status: "상태",
}

/** 미리보기 결과 → 오더 카드 값. 금액은 서버가 계산한 summary.total 만 쓴다(화면·모델이 계산하지 않는다). */
export function orderFromPreview(input: {
  id: string
  tool: "quote_create_draft" | "hw_plan_movement"
  preview: WritePreview<unknown>
  now: number
  pagePath?: string
  ticket?: string
  title: string
}): OrderTicket {
  const summary = input.preview.summary
  const fields: OrderField[] = Object.entries(summary)
    .filter(([key]) => SUMMARY_LABEL[key] && key !== "total")
    .map(([key, value]) => ({
      key,
      label: SUMMARY_LABEL[key],
      value:
        typeof value === "number"
          ? key === "quantity"
            ? units(value, "대")
            : krw(value)
          : str(value),
      numeric: typeof value === "number",
    }))
  for (const warning of input.preview.warnings.slice(0, 3)) {
    fields.push({ key: `warning-${fields.length}`, label: "주의", value: str(warning.message) || str(warning.code) })
  }
  const quote = input.tool === "quote_create_draft"
  const total = num(summary.total)
  const screen = TOOL_SCREEN[input.tool]
  const directHref = screen ? hrefOf(screen.linkId) : undefined
  return {
    id: input.id,
    type: quote ? "quote.draft.create" : "hw.movement.plan",
    risk: "R1",
    icon: quote ? "amount" : "stock",
    title: input.title,
    target: quote
      ? { label: str(summary.customer) || "딜", meta: "견적 초안(draft) · 버전 1" }
      : { label: str(summary.to) || "받는 곳", meta: "HW 배송 예정" },
    fields,
    ...(quote && total != null ? { amount: { label: "합계(VAT 포함)", currency: "KRW" as const, value: total } } : {}),
    untouched: quote ? "공유 링크·발송·승인은 하지 않습니다" : "창고 재고·출고 확정은 그대로입니다(가용에서만 미리 빠집니다)",
    confirmLabel: quote ? "견적 초안 만들기" : "배송 예정 등록",
    doneText: quote ? "견적 초안을 만들었습니다" : "배송 예정을 등록했습니다",
    undo: "none",
    undoNote: "되돌리기는 화면에서 합니다",
    state: "draft",
    createdAt: input.now,
    expiresAt: input.now + ORDER_TTL_MS,
    ...(input.pagePath ? { pagePath: input.pagePath } : {}),
    server: {
      ...(input.ticket ? { ticket: input.ticket } : {}),
      ...(directHref ? { directHref, directLabel: screen.label } : {}),
    },
  }
}

// ── 조율기 연결 ──────────────────────────────────────────────────────────────────────────

export interface WriteDeps {
  ops: OpsDeps
  /** 확인 표 서명 비밀(ADMIN_AI_TICKET_SECRET). 없으면 미리보기까지만 — 카드는 "화면에서 직접 등록". */
  ticketSecret: string | null
  /** 행위자 키(actor.ts staffKey) — 표의 sub. */
  sub: string
  newId: () => string
}

const WRITE_TITLE: Record<"quote_create_draft" | "hw_plan_movement", string> = {
  quote_create_draft: "견적 초안 만들기",
  hw_plan_movement: "HW 배송 예정 등록",
}

/**
 * 쓰기 한 조각 — 인자 고르기 → preview(쓰기 없음) → 오더 카드(+ 서명 표). execute 는 부르지 않는다.
 * 오더 id 는 표 id(jti)와 같다 — 화면의 오더와 서버 실행 키가 하나로 이어진다.
 */
export async function previewWriteTurn(
  kind: "quote_draft" | "hw_plan",
  ctx: ToolTurnContext,
  deps: WriteDeps
): Promise<{ blocks: AiBlock[]; order?: OrderTicket }> {
  const picked = kind === "quote_draft" ? await quoteDraftArgs(ctx, deps.ops) : await hwPlanArgs(ctx, deps.ops)
  if (!picked.ok) return { blocks: [picked.block] }

  const def = deps.ops.getTool(picked.tool)
  if (!def || def.risk !== "R1") return { blocks: [{ kind: "text", text: "이 오더의 도구를 찾지 못했습니다. 화면에서 직접 해 주세요." }] }

  let preview: WritePreview<unknown>
  try {
    preview = await deps.ops.preview(def, picked.args, ctx.actor)
  } catch (error) {
    const screen = TOOL_SCREEN[picked.tool]
    const href = screen ? hrefOf(screen.linkId) : undefined
    return {
      blocks: [
        {
          kind: "deny",
          card: {
            title: "오더를 만들 수 없습니다",
            target: { label: WRITE_TITLE[picked.tool], meta: "미리보기 실패" },
            text: await deps.ops.describeError(error),
            ...(href ? { openLabel: screen.label, openHref: href } : {}),
          },
        },
      ],
    }
  }

  const issued = deps.ticketSecret
    ? issueTicket({ tool: picked.tool, args: picked.args, summary: preview.summary, sub: deps.sub }, deps.ticketSecret, ctx.now)
    : null
  const order = orderFromPreview({
    id: issued?.payload.jti ?? deps.newId(),
    tool: picked.tool,
    preview,
    now: ctx.now,
    pagePath: ctx.context?.path,
    ticket: issued?.ticket,
    title: WRITE_TITLE[picked.tool],
  })
  if (picked.labels) {
    const labels = picked.labels
    order.fields = order.fields.map((field) => (labels[field.key] ? { ...field, value: labels[field.key] } : field))
  }
  const total = num(preview.summary.total)
  const lead =
    picked.tool === "quote_create_draft"
      ? `견적 초안을 만들 준비가 됐습니다${total != null ? ` — 합계 ${krw(total)}` : ""}.`
      : `배송 예정 ${str(preview.summary.product)} ${units(num(preview.summary.quantity) ?? 0, "대")}를 등록할 준비가 됐습니다.`
  const tail = issued ? " 카드에서 확인하면 실행합니다." : " 확인 서명 설정이 없어 여기서는 실행하지 않습니다 — 화면에서 직접 등록해 주세요."
  return { blocks: [{ kind: "text", text: `${lead}${tail}` }, { kind: "order", orderId: order.id }], order }
}
