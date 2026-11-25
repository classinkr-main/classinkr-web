// 갈매봇 내부 원격 업무 — 조회(R0)와 준비 안 된 오더의 거절 카드.
//
// 공용 도구 층(lib/ops-tools)의 레지스트리 정의를 로그인한 스태프를 행위자로 부른다. 정의를 직접 부르지 않고 실행기
// (runOpsTool·presentOpsResult)를 거친다 — 범위 확인·가림·감사가 표면과 상관없이 같다.
//  - 조회: runOpsTool → presentOpsResult(연락처는 pii 범위가 있을 때만 화면에 원문) → 조회 카드(요약 한 줄 두괄식 + 표).
//    통화(₩)·단위(대·명·건)를 붙이고, 해당 어드민 화면 링크(링크 목록 id)를 단다.
//  - 쓰기(견적 초안·HW 배송 예정)는 writes.ts — preview 만, execute 는 확인 경로(confirm.ts)에서만.
// 자료는 deps 로 받는다(서버 연결은 deps.ts, 시험은 가짜 정의).
import type { OpsActor } from "@/lib/ops-tools/actor"
import type { OpsToolDef, ToolArgs, WritePreview } from "@/lib/ops-tools/types"

import { findLinks, internalHrefOf } from "../links"
import type { AdminAiPageContext, AiBlock, ReadCard, ReadCardTable } from "../types"
import type { ReadTarget, WriteKind } from "./router"

export interface OpsDeps {
  getTool: (mcpName: string) => OpsToolDef | undefined
  run: (def: OpsToolDef, args: ToolArgs, actor: OpsActor) => Promise<{ value: unknown }>
  present: (def: OpsToolDef, args: ToolArgs, actor: OpsActor, value: unknown) => Promise<{ value: unknown }>
  /** 쓰기 미리보기 — 정의의 preview(쓰기 없음). 실행기는 preview 만 따로 부르는 길이 없어 어댑터가 정의를 부른다. */
  preview: (def: OpsToolDef, args: ToolArgs, actor: OpsActor) => Promise<WritePreview<unknown>>
  /** 도구 오류 → 사람이 볼 글(입력·규칙 오류는 글, 모르는 오류는 고정 문구). */
  describeError: (error: unknown) => Promise<string>
}

export interface ToolTurnContext {
  text: string
  actor: OpsActor
  context: AdminAiPageContext | null
  now: number
}

/** 링크 목록 id 로 어드민 주소를 꺼낸다(목록에 없으면 undefined — 카드가 링크를 그리지 않는다). */
export const hrefOf = (id: string) => internalHrefOf(id)

export const TOOL_SCREEN: Record<string, { linkId: string; label: string }> = {
  hw_stock: { linkId: "admin:hardware", label: "HW 재고 화면 열기" },
  hw_movements: { linkId: "admin:hardware", label: "HW 입출고 화면 열기" },
  hw_sales: { linkId: "admin:hardware", label: "HW 화면 열기" },
  deals_list: { linkId: "admin:crm-deals", label: "딜 화면 열기" },
  quotes_list: { linkId: "admin:quotes", label: "견적 화면 열기" },
  site_traffic: { linkId: "admin:analytics-tab-visitors", label: "방문자 화면 열기" },
  quote_create_draft: { linkId: "admin:quotes", label: "견적 화면에서 직접 만들기" },
  hw_plan_movement: { linkId: "admin:hardware", label: "HW 화면에서 직접 등록" },
}

// ── 값 꺼내기(도구 결과는 unknown — 모양이 바뀌어도 던지지 않는다) ─────────────────────────────

type Row = Record<string, unknown>
export const isRow = (v: unknown): v is Row => Boolean(v) && typeof v === "object" && !Array.isArray(v)
export const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "")
export const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null)
const firstNum = (row: Row, keys: string[]) => {
  for (const key of keys) {
    const value = num(row[key])
    if (value != null) return value
  }
  return null
}
export const listOf = (value: unknown, keys: string[] = []): Row[] => {
  if (Array.isArray(value)) return value.filter(isRow)
  if (isRow(value)) for (const key of keys) if (Array.isArray(value[key])) return (value[key] as unknown[]).filter(isRow)
  return []
}

export const units = (n: number, unit: string) => `${n.toLocaleString("ko-KR")}${unit}`
export const krw = (n: number) => `₩${Math.round(n).toLocaleString("ko-KR")}`
const day = (v: unknown) => str(v).slice(0, 10)

/** 품목 낱말 — "T1 재고", "86형 몇 대" 처럼 영문·숫자가 든 낱말이나 "…형". 없으면 undefined(전체). */
export function productQueryOf(text: string): string | undefined {
  const token = text.match(/[A-Za-z]+\d*[A-Za-z0-9-]*|\d+\s*형|\d+인치/)
  return token ? token[0].replace(/\s+/g, "") : undefined
}

// ── 기간 말(검토 동작-4) ─────────────────────────────────────────────────────────────────
// 조회 도구는 기간 인자를 받지 않는다(입출고는 최신순, 견적은 갱신순, 방문은 7·14·30·90일). 그래서
//  - 입출고: 날짜(occurred_at)가 있으니 넉넉히(100건) 받아 기간으로 거른다. 100건이 다 기간 안이면 "최근 100건 안에서"라고 밝힌다.
//  - 견적: 기간으로 거를 날짜가 갱신일뿐이라 거르지 않는다. 기간을 물었으면 합계 숫자를 결론으로 내지 않고 화면으로 안내한다.
//  - 방문: 도구 구간과 다르면 실제로 본 구간을 밝힌다. 두 구간 비교는 화면으로 안내한다.
// 날짜는 KST 달력 기준이다.

export interface Period {
  label: string
  /** YYYY-MM-DD(포함). */
  from: string
  to: string
  /** 방문 도구 구간으로 그대로 바꿀 수 있는 최근 N일. */
  days?: number
}

const DAY_MS = 24 * 60 * 60 * 1000
const KST_MS = 9 * 60 * 60 * 1000
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const md = (date: string) => `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`
const rangeLabel = (name: string, from: string, to: string) => `${name}(${from === to ? md(from) : `${md(from)}~${md(to)}`})`

/** 기간 말을 KST 날짜 구간으로. 기간 말이 없으면 null, 있는데 해석하지 못하면 "unsupported". */
export function periodOf(text: string, now: number): Period | "unsupported" | null {
  const today = Date.parse(`${ymd(now + KST_MS)}T00:00:00Z`)
  const weekday = (new Date(today).getUTCDay() + 6) % 7 // 월=0
  const make = (name: string, fromMs: number, toMs: number, days?: number): Period => {
    const from = ymd(fromMs)
    const to = ymd(toMs)
    return { label: rangeLabel(name, from, to), from, to, ...(days ? { days } : {}) }
  }
  const recent = text.match(/(?:최근|지난)\s*(\d{1,3})\s*일/)
  if (recent) {
    const n = Math.max(1, Number(recent[1]))
    return make(`최근 ${n}일`, today - (n - 1) * DAY_MS, today, n)
  }
  if (/오늘/.test(text)) return make("오늘", today, today)
  if (/어제/.test(text)) return make("어제", today - DAY_MS, today - DAY_MS)
  if (/이번\s*주/.test(text)) return make("이번 주", today - weekday * DAY_MS, today)
  if (/지난\s*주/.test(text)) return make("지난주", today - (weekday + 7) * DAY_MS, today - (weekday + 1) * DAY_MS)
  const first = new Date(today)
  first.setUTCDate(1)
  if (/이번\s*달/.test(text)) return make("이번 달", first.getTime(), today)
  if (/지난\s*달/.test(text)) {
    const end = first.getTime() - DAY_MS
    const start = new Date(end)
    start.setUTCDate(1)
    return make("지난달", start.getTime(), end)
  }
  if (/올해/.test(text)) {
    const jan = new Date(today)
    jan.setUTCMonth(0, 1)
    return make("올해", jan.getTime(), today)
  }
  if (/\d{1,2}\s*월|분기|작년|상반기|하반기|\d{4}\s*년|지난\s*해/.test(text)) return "unsupported"
  return null
}

const COMPARE = /비교|대비|차이/

// ── 상태 이름표(검토 동작-8) — 표에 영문 코드가 그대로 나오지 않게. 모르는 값은 그대로 둔다. ──
const STATUS_LABEL: Readonly<Record<string, string>> = {
  draft: "초안",
  pending_approval: "승인 대기",
  shared: "공유됨",
  sent: "발송",
  accepted: "수락",
  expired: "만료",
  archived: "보관",
  consult: "상담",
  demo: "데모",
  quote: "견적",
  proposal: "제안",
  decision: "의사결정",
  order: "오더/설치",
  won: "완료",
  lost: "실패",
  open: "진행",
  planned: "예정",
  inbound: "입고",
  outbound: "출고",
}
export const statusLabel = (value: unknown) => {
  const raw = str(value)
  return STATUS_LABEL[raw] ?? raw
}

// ── 조회 ────────────────────────────────────────────────────────────────────────────────

type ToolName = Extract<ReadTarget, { kind: "tool" }>["tool"]

const QUOTE_LIMIT = 10
const MOVEMENT_LIMIT = 10
const MOVEMENT_PERIOD_LIMIT = 100

function trafficDays(text: string, period: Period | "unsupported" | null): number {
  if (period && period !== "unsupported" && period.days && [7, 14, 30, 90].includes(period.days)) return period.days
  if (/90|분기/.test(text)) return 90
  if (/14일|2\s*주/.test(text)) return 14
  if (/7일|일주|이번\s*주|지난\s*주/.test(text)) return 7
  return 30
}

function argsForRead(tool: ToolName, ctx: ToolTurnContext, period: Period | "unsupported" | null): ToolArgs {
  const entity = ctx.context?.entity
  switch (tool) {
    case "hw_stock": {
      const query = productQueryOf(ctx.text)
      return { ...(query ? { query } : {}), ...(/부족|주문\s*권장|모자/.test(ctx.text) ? { attention_only: true } : {}) }
    }
    case "hw_movements":
      return { limit: period && period !== "unsupported" ? MOVEMENT_PERIOD_LIMIT : MOVEMENT_LIMIT }
    case "deals_list":
      return { limit: 10, ...(entity && (entity.type === "customer" || entity.type === "lead") ? { query: entity.label } : {}) }
    case "quotes_list":
      return { limit: QUOTE_LIMIT, ...(entity && (entity.type === "customer" || entity.type === "lead") ? { query: entity.label } : {}) }
    case "site_traffic":
      return { range_days: trafficDays(ctx.text, period) }
    default:
      return {}
  }
}

interface ReadView {
  summary: string
  card: Omit<ReadCard, "openLabel" | "openHref">
}

function viewHwStock(value: unknown, args: ToolArgs): ReadView {
  const stock = listOf(value, ["stock"])
  const query = str(args.query)
  const rows = stock.slice(0, 8)
  const available = stock.reduce((sum, row) => sum + (num(row.availableStock) ?? 0), 0)
  const summary =
    stock.length === 0
      ? `${query || "조건"}에 맞는 품목이 없습니다.`
      : stock.length === 1
        ? `${str(stock[0].product)} 가용 재고는 ${units(num(stock[0].availableStock) ?? 0, "대")}입니다.`
        : `${query ? `${query} ` : ""}품목 ${stock.length}개의 가용 재고는 모두 ${units(available, "대")}입니다.`
  const table: ReadCardTable = {
    head: ["품목", "가용", "창고", "배송 예정"],
    rows: rows.map((row) => [
      str(row.product),
      units(num(row.availableStock) ?? 0, "대"),
      units(num(row.warehouseStock) ?? 0, "대"),
      units(num(row.plannedOut) ?? 0, "대"),
    ]),
    warnColumn: 3,
  }
  const low = stock.filter((row) => row.low === true || row.orderRecommended === true).length
  return {
    summary,
    card: {
      icon: "stock",
      title: "HW 재고",
      target: { label: query || "전체 품목", meta: `${stock.length}개 품목` },
      table,
      ...(low > 0 ? { note: `부족·주문 권장 ${low}개 품목` } : stock.length > rows.length ? { note: `상위 ${rows.length}개만 보입니다` } : {}),
    },
  }
}

function viewHwMovements(value: unknown, period: Period | "unsupported" | null): ReadView {
  const all = listOf(value, ["movements", "rows", "items"])
  const ranged = period && period !== "unsupported" ? period : null
  const inRange = ranged ? all.filter((row) => day(row.occurred_at) >= ranged.from && day(row.occurred_at) <= ranged.to) : all
  const rows = inRange.slice(0, 10)
  // 받은 기록이 상한까지 꽉 찼고 가장 오래된 날도 기간 안이면 더 오래된 기록이 남았을 수 있다.
  const oldest = all.length ? day(all[all.length - 1].occurred_at) : ""
  const truncated = Boolean(ranged && all.length >= MOVEMENT_PERIOD_LIMIT && oldest >= ranged.from)
  let summary: string
  if (ranged) {
    summary = inRange.length
      ? `${ranged.label} 입출고는 ${truncated ? `최근 ${MOVEMENT_PERIOD_LIMIT}건 안에서 ` : ""}${units(inRange.length, "건")}입니다.`
      : `${ranged.label} 입출고 기록이 없습니다.`
  } else if (period === "unsupported") {
    summary = `요청한 기간은 아직 거르지 못해 최근 기록 ${units(rows.length, "건")}을 보여 드립니다. 기간별로는 HW 화면에서 확인해 주세요.`
  } else {
    summary = rows.length ? `최근 입출고 ${rows.length}건입니다.` : "입출고 기록이 없습니다."
  }
  return {
    summary,
    card: {
      icon: "stock",
      title: "HW 입출고",
      target: { label: ranged ? ranged.label : "최근 기록", meta: `${inRange.length}건` },
      table: {
        head: ["날짜", "품목", "수량", "상태"],
        rows: rows.map((row) => [day(row.occurred_at), str(row.product_name), units(num(row.quantity) ?? 0, "대"), statusLabel(row.status) || statusLabel(row.movement_type)]),
        textual: true,
      },
      ...(inRange.length > rows.length ? { note: `상위 ${rows.length}건만 보입니다` } : {}),
    },
  }
}

function viewHwSales(value: unknown): ReadView {
  const data = isRow(value) ? value : {}
  const total = isRow(data.grandTotal) && isRow(data.grandTotal.total) ? data.grandTotal.total : {}
  const installed = num(total.installed) ?? 0
  const planned = num(total.planned) ?? 0
  const groups = listOf(data.groups)
  const fy = num(data.fy)
  return {
    summary: `${fy ? `FY${fy} ` : ""}HW 판매(설치 완료)는 ${units(installed, "대")}입니다.`,
    card: {
      icon: "stock",
      title: "HW 판매 집계",
      target: { label: fy ? `FY${fy}(4월 시작)` : "올해 회계연도", meta: `배송 예정 ${units(planned, "대")}` },
      table: {
        head: ["분류", "설치 완료", "배송 예정"],
        rows: groups.slice(0, 8).map((group) => {
          const sub = isRow(group.subtotal) && isRow(group.subtotal.total) ? group.subtotal.total : {}
          return [str(group.label), units(num(sub.installed) ?? 0, "대"), units(num(sub.planned) ?? 0, "대")]
        }),
      },
    },
  }
}

function viewDeals(value: unknown): ReadView {
  const rows = listOf(value)
  return {
    summary: rows.length ? `딜 ${rows.length}건입니다(최근 갱신순).` : "조건에 맞는 딜이 없습니다.",
    card: {
      icon: "search",
      title: "딜",
      target: { label: "최근 갱신순", meta: `${rows.length}건` },
      table: {
        head: ["고객", "딜", "단계", "담당"],
        rows: rows.slice(0, 10).map((row) => [str(row.customer_name), str(row.title), statusLabel(row.stage) || statusLabel(row.status), str(row.owner)]),
        textual: true,
      },
    },
  }
}

function viewQuotes(value: unknown, period: Period | "unsupported" | null): ReadView {
  const rows = listOf(value)
  const amounts = rows.map((row) => firstNum(row, ["total_amount", "total", "grand_total", "amount"]))
  const sum = amounts.reduce<number>((acc, v) => acc + (v ?? 0), 0)
  const asked = period === "unsupported" ? "요청한 기간" : period ? period.label.replace(/\(.*\)$/, "") : null
  // 견적 목록은 기간으로 거르지 못한다 — 기간을 물었으면 합계 숫자를 결론으로 내지 않는다.
  const summary = asked
    ? `견적 목록은 아직 기간으로 거르지 못합니다. ${asked} 합계는 견적 화면에서 확인해 주세요 — 아래는 최근 갱신 ${units(rows.length, "건")}입니다.`
    : rows.length
      ? `견적 ${units(rows.length, "건")}(최근 갱신 ${QUOTE_LIMIT}건까지), 합계 ${krw(sum)}(VAT 포함 금액 기준)입니다.`
      : "조건에 맞는 견적이 없습니다."
  return {
    summary,
    card: {
      icon: "search",
      title: "견적",
      target: { label: "최근 갱신순", meta: `${rows.length}건` },
      table: {
        head: ["번호", "고객", "상태", "합계"],
        rows: rows.slice(0, 10).map((row, index) => [
          str(row.document_number) || str(row.quote_number),
          str(row.customer_name),
          statusLabel(row.status),
          amounts[index] != null ? krw(amounts[index] as number) : "-",
        ]),
      },
    },
  }
}

function viewTraffic(value: unknown, args: ToolArgs, period: Period | "unsupported" | null, text: string): ReadView {
  const data = isRow(value) ? value : {}
  const totals = isRow(data.totals) ? data.totals : data
  const visitors = firstNum(totals, ["visitors", "uniqueVisitors", "unique_visitors", "sessions"])
  const views = firstNum(totals, ["pageViews", "pageviews", "page_views", "views"])
  const range = num(args.range_days) ?? 30
  const base = visitors != null ? `최근 ${range}일 방문자는 ${units(visitors, "명")}입니다.` : `최근 ${range}일 방문 요약입니다.`
  const askedOther =
    period === "unsupported" ? "요청한 기간" : period && period.days !== range ? period.label.replace(/\(.*\)$/, "") : null
  const notes: string[] = []
  if (COMPARE.test(text)) notes.push("두 구간 비교는 아직 한 번에 보지 못합니다 — Analytics 방문자 화면에서 비교해 주세요.")
  else if (askedOther) notes.push(`${askedOther}이 아니라 최근 ${range}일 기준입니다 — ${askedOther}만 보려면 Analytics 방문자 화면에서 확인해 주세요.`)
  return {
    summary: [base, ...notes].join(" "),
    card: {
      icon: "search",
      title: "사이트 방문",
      target: { label: `최근 ${range}일`, meta: "Analytics 방문자 탭과 같은 값" },
      table: {
        head: ["항목", "값"],
        rows: [
          ...(visitors != null ? [["방문자", units(visitors, "명")]] : []),
          ...(views != null ? [["페이지뷰", units(views, "회")]] : []),
        ],
      },
    },
  }
}

function viewOf(tool: ToolName, value: unknown, args: ToolArgs, period: Period | "unsupported" | null, text: string): ReadView {
  switch (tool) {
    case "hw_stock":
      return viewHwStock(value, args)
    case "hw_movements":
      return viewHwMovements(value, period)
    case "hw_sales":
      return viewHwSales(value)
    case "deals_list":
      return viewDeals(value)
    case "quotes_list":
      return viewQuotes(value, period)
    case "site_traffic":
      return viewTraffic(value, args, period, text)
  }
}

const SCREEN_TEXT: Record<Extract<ReadTarget, { kind: "screen" }>["topic"], string> = {
  payment: "결제·수금",
  messaging: "문자·알림톡 발송 이력",
  task: "할 일·후속조치",
  activity: "통화·컨택 기록",
  lead: "리드 상태·담당",
  showroom: "쇼룸 예약",
}

function screenBlock(target: Extract<ReadTarget, { kind: "screen" }>): AiBlock {
  const link = findLinks(target.query, { audience: "internal", limit: 1 })[0]
  return {
    kind: "deny",
    card: {
      title: "아직 준비 중 — 화면에서 확인",
      target: { label: SCREEN_TEXT[target.topic], meta: "갈매봇 조회 도구 없음" },
      text: `${SCREEN_TEXT[target.topic]}은 아직 갈매봇이 조회하지 않습니다. 화면에서 확인해 주세요.`,
      ...(link && link.audience === "internal" ? { openLabel: `${link.label} 열기`, openHref: link.href } : {}),
    },
  }
}

export async function readBlocks(target: ReadTarget, ctx: ToolTurnContext, deps: OpsDeps): Promise<AiBlock[]> {
  if (target.kind === "screen") return [screenBlock(target)]
  const def = deps.getTool(target.tool)
  if (!def || def.risk !== "R0") return [{ kind: "text", text: "이 조회 도구를 찾지 못했습니다." }]
  const period = periodOf(ctx.text, ctx.now)
  const args = argsForRead(target.tool, ctx, period)
  try {
    const { value } = await deps.run(def, args, ctx.actor)
    const presented = await deps.present(def, args, ctx.actor, value)
    const view = viewOf(target.tool, presented.value, args, period, ctx.text)
    const screen = TOOL_SCREEN[target.tool]
    const openHref = screen ? hrefOf(screen.linkId) : undefined
    return [
      { kind: "text", text: view.summary },
      { kind: "read", card: { ...view.card, ...(openHref ? { openLabel: screen.label, openHref } : {}) } },
    ]
  } catch (error) {
    return [{ kind: "text", text: `조회하지 못했습니다. ${await deps.describeError(error)}` }]
  }
}

// ── 쓰기(미리보기까지) ───────────────────────────────────────────────────────────────────

const NOT_READY: Record<Exclude<WriteKind, "quote_draft" | "hw_plan">, { label: string; query: string }> = {
  send: { label: "문자·알림톡 발송", query: "캠페인" },
  pay: { label: "결제 확정", query: "수금" },
  ship: { label: "출고 확정", query: "하드웨어" },
  amount: { label: "견적 금액 변경", query: "견적" },
  lead: { label: "리드 상태·담당 변경", query: "리드" },
  task: { label: "할 일 만들기", query: "리드" },
  note: { label: "컨택 기록 남기기", query: "활동" },
  delete: { label: "삭제", query: "" },
  showroom: { label: "쇼룸 예약", query: "쇼룸" },
  other: { label: "이 요청", query: "" },
}

/** 기획의 다른 오더 — 아직 준비 중이라 거절 카드 + 화면 링크. 삭제는 갈매봇이 하지 않는 일이다. */
export function notReadyBlock(kind: Exclude<WriteKind, "quote_draft" | "hw_plan">): AiBlock {
  const entry = NOT_READY[kind]
  const link = entry.query ? findLinks(entry.query, { audience: "internal", limit: 1 })[0] : undefined
  const text =
    kind === "delete"
      ? "삭제는 갈매봇이 하지 않습니다. 화면에서 직접 확인하고 지워 주세요."
      : `${entry.label}은 아직 준비 중입니다. 화면에서 직접 해 주세요.`
  return {
    kind: "deny",
    card: {
      title: kind === "delete" ? "갈매봇이 하지 않는 일" : "아직 준비 중 — 화면에서",
      target: { label: entry.label, meta: "오더를 만들지 않았습니다" },
      text,
      ...(link && link.audience === "internal" ? { openLabel: `${link.label} 열기`, openHref: link.href } : {}),
    },
  }
}
