// 갈매봇 "고객 이력" — 화면·채널과 무관한 함수 findCustomerHistory(question, deps, options).
//
// 매니저가 "가나학원 결제·견적 문제 있었나?", "이 고객 AS 이력 보여 줘"를 물으면 그 고객의 CRM 활동 기록(crm_customer_events) 중
// 태그가 billing·quote·as·api·cs-case 인 최근 기록(날짜·제목·요지·다음 할 일·출처)과 담당 영업(NEO 스냅숏 owner_name, 리드는 담당)을 준다.
//
// 모델 없이 돈다(결정형):
//  - 고객: 질문 속 고객(CRM 통합 고객 이름 — findCustomersInText) 또는 열린 화면의 고객. 여럿이면 첫 고객만 읽고 나머지는 이름만 밝힌다.
//  - 태그: 질문의 주제 말(결제·견적·AS·API·CS 케이스)로 고른다. 주제 말이 없으면("가나학원 이슈 있었나?") 다섯 태그 전부.
//  - 기간 말: tools.ts 의 periodOf(KST 달력). 해석하지 못하면 기간 없이 찾고 그렇다고 밝힌다.
// 권한·개인정보:
//  - 기록 글(제목·요지·다음 할 일)은 상담 내역 찾기와 같은 역할 규칙(actor.ts canReadConsultationContent)만 본다. 아니면 건수만.
//    담당 영업은 담당자 찾기(고객사 담당)와 같이 갈매봇 역할이면 본다.
//  - 글은 상담 내역 요지와 같은 가림(redactSummary)을 거친 한 줄이다. 본문(body)·녹음·참석자는 읽지 않는다.
//  - 위컴 단체방은 이 갈래를 통째로 막는다(lib/wecom/aibot-bridge.ts groupScopedDeps). 이 파일은 로그를 남기지 않는다.
// 자료는 deps 로 받는다(서버 연결은 customer-history-deps.ts, 시험은 가짜). 이 파일은 I/O 를 하지 않는다.
import type { CustomerRef } from "@/lib/internal-cs-chat/contact"

import { internalHrefOf } from "../links"
import type { AiBlock, ReadCard } from "../types"
import { redactSummary } from "./consultations"
import { periodOf, type Period } from "./tools"

/** 고객 이력이 읽는 태그 — 수기 기록 형식 문서(docs/active/crm-customer-events-manual-note-format-2026-11-26.md)와 같은 낱말. */
export const CUSTOMER_HISTORY_TAGS = ["billing", "quote", "as", "api", "cs-case"] as const
export type CustomerHistoryTag = (typeof CUSTOMER_HISTORY_TAGS)[number]

export const CUSTOMER_HISTORY_TAG_LABEL: Readonly<Record<CustomerHistoryTag, string>> = {
  billing: "결제",
  quote: "견적",
  as: "AS",
  api: "API",
  "cs-case": "CS 케이스",
}

const TAG_WORDS: ReadonlyArray<readonly [CustomerHistoryTag, RegExp]> = [
  ["billing", /결제|입금|수금|미수|미납|정산|환불|청구|세금\s*계산서/],
  ["quote", /견적/],
  ["as", /(?<![a-z])a\/?s(?![a-z])|에이에스|수리|고장|파손|불량|교체/i],
  ["api", /(?<![a-z])api(?![a-z])|연동|에이피아이/i],
  ["cs-case", /(?<![a-z])cs\s*케이스|씨에스\s*케이스|cs-case/i],
]

/** 질문의 주제 말 → 태그. 주제 말이 없으면 다섯 태그 전부(all). */
export function customerHistoryTagsOf(question: string): { tags: CustomerHistoryTag[]; all: boolean } {
  const tags = TAG_WORDS.filter(([, match]) => match.test(question)).map(([tag]) => tag)
  return tags.length ? { tags, all: false } : { tags: [...CUSTOMER_HISTORY_TAGS], all: true }
}

export type CustomerHistoryTargetType = "neo_account" | "lead"

export interface CustomerHistoryTarget {
  targetType: CustomerHistoryTargetType
  targetId: string
}

export interface CustomerHistoryOwner {
  name: string
  /** neo: NEO 스냅숏(crm_neo_customer_snapshots.owner_name), lead: 리드 담당(leads.assigned_to). */
  from: "neo" | "lead"
  /** NEO 스냅숏이 오래됐다(is_stale). */
  stale?: boolean
}

export interface CustomerHistoryProfile {
  targets: CustomerHistoryTarget[]
  owner: CustomerHistoryOwner | null
  /** 담당 영업을 읽지 못했다 — "담당 없음"과 구분한다. */
  ownerFailed?: boolean
  /** NEO UID(스냅숏 uid) — 있으면 카드에 싣는다. */
  uid?: string | null
  /** 카드에 그대로 적을 안내(연결 NEO 계정을 확인하지 못함 등). */
  notes?: string[]
}

export interface CustomerHistoryEventRecord {
  id: string
  occurredAt: string
  title: string
  summary: string | null
  nextActions: Array<{ title: string; dueAt: string | null; done: boolean }>
  sourceType: string
  sourceId: string | null
  tags: string[]
}

export interface CustomerHistoryEventBatch {
  /** 최신순 상위 limit 건. */
  events: CustomerHistoryEventRecord[]
  /** 맞는 기록 전체 건수. */
  total: number
  /** 기록 표를 쓸 수 없다(마이그레이션 전 등) — 0건이 "기록 없음"이 아니다. */
  unavailable?: string | null
}

export interface CustomerHistoryDeps {
  /** 질문 글 속 고객(CRM 통합 고객). */
  findCustomersInText?: (question: string) => Promise<CustomerRef[]>
  /** 고객 → 기록 대상(NEO 계정·리드)과 담당 영업. null 이면 이 고객 종류는 아직 읽지 않는다(포털 고객 등). */
  loadProfile: (customer: CustomerRef) => Promise<CustomerHistoryProfile | null>
  listEvents: (input: {
    targets: readonly CustomerHistoryTarget[]
    tags: readonly CustomerHistoryTag[]
    limit: number
    from?: string
    to?: string
  }) => Promise<CustomerHistoryEventBatch>
}

export interface CustomerHistoryViewer {
  /** 기록 글(제목·요지·다음 할 일)을 볼 수 있는가 — 상담 내역 찾기와 같은 역할(canReadConsultationContent). */
  canReadContent: boolean
}

export interface FindCustomerHistoryOptions {
  openCustomer?: CustomerRef | null
  actor: CustomerHistoryViewer
  now: number
}

export interface CustomerHistoryItem {
  id: string
  /** KST 날짜(YYYY-MM-DD). */
  date: string | null
  title: string
  summary: string | null
  /** 아직 안 끝난 첫 다음 할 일(기한이 있으면 붙인다). */
  nextAction: string | null
  /** 출처 — 기록 종류(수기 기록·회의록·통화…)와 수기 기록의 전달본 파일 이름. */
  source: string
  tags: CustomerHistoryTag[]
}

export type CustomerHistoryStatus = "ok" | "no_customer" | "unsupported" | "failed"

export interface CustomerHistoryResult {
  status: CustomerHistoryStatus
  customer: { name: string; key: string } | null
  /** 고객을 어디서 잡았나 — 질문 글 / 열린 화면. */
  customerFrom: "question" | "page" | null
  /** 질문에 함께 걸린 다른 고객 이름 — 첫 고객만 읽었다. */
  alternatives: string[]
  tags: CustomerHistoryTag[]
  allTags: boolean
  period: Period | null
  periodUnsupported: boolean
  owner: CustomerHistoryOwner | null
  ownerFailed: boolean
  uid: string | null
  /** 최신순 상위 MAX 건. 기록 글을 볼 수 없는 역할이면 빈 목록(건수만). */
  items: CustomerHistoryItem[]
  total: number
  more: number
  restricted: boolean
  eventsFailed: boolean
  unavailable: string | null
  notes: string[]
}

export const MAX_CUSTOMER_HISTORY_ITEMS = 5
/** 고객 화면이 하나로 정해지지 않을 때 여는 곳 — 통합 고객 목록. */
export const CUSTOMER_HISTORY_LINK_ID = "admin:crm-customers-unified"

const KST_MS = 9 * 60 * 60 * 1000
const TITLE_MAX = 40
const SUMMARY_MAX = 60
const ACTION_MAX = 40
/** 스냅숏 기본값·빈 담당 — 담당이 정해지지 않았다. */
const UNASSIGNED_OWNER = /^(?:담당\s*미지정|미지정|미배정|없음|-+)$/
/** 수기 기록 source_id 로 쓰는 전달본 파일 이름 꼴 — 영문·숫자·점·밑줄·대시. 그 밖(채널 id 등)은 싣지 않는다. */
const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/

const SOURCE_LABEL: Readonly<Record<string, string>> = {
  manual_note: "수기 기록",
  meeting_minutes: "회의록",
  recording: "녹음",
  calendar_event: "일정",
  lead_contact_log: "연락 로그",
  external_crm: "NEO CRM",
  sheet: "시트",
  call: "통화",
  sms: "문자",
  site_inflow: "홈페이지 유입",
}

const oneLine = (value: string) => value.replace(/\s+/g, " ").trim()
const clip = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value)
const cleanText = (value: string | null | undefined, max: number) => {
  const line = value ? oneLine(redactSummary(value)) : ""
  return line ? clip(line, max) : null
}

function kstDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return null
  return new Date(ms + KST_MS).toISOString().slice(0, 10)
}

/** KST 날짜 구간 → occurred_at 범위(ISO). */
function periodRange(period: Period): { from: string; to: string } {
  return {
    from: new Date(`${period.from}T00:00:00+09:00`).toISOString(),
    to: new Date(`${period.to}T23:59:59.999+09:00`).toISOString(),
  }
}

function sourceOf(event: CustomerHistoryEventRecord): string {
  const label = SOURCE_LABEL[event.sourceType] ?? "기록"
  const file = event.sourceType === "manual_note" && event.sourceId && FILE_NAME.test(event.sourceId) ? event.sourceId : null
  return file ? `${label} · ${file}` : label
}

function nextActionOf(event: CustomerHistoryEventRecord): string | null {
  const open = event.nextActions.find((action) => !action.done && action.title.trim())
  if (!open) return null
  const title = cleanText(open.title, ACTION_MAX)
  if (!title) return null
  const due = kstDate(open.dueAt)
  return due ? `${title}(${due}까지)` : title
}

function itemOf(event: CustomerHistoryEventRecord): CustomerHistoryItem {
  const tags = CUSTOMER_HISTORY_TAGS.filter((tag) => event.tags.includes(tag))
  return {
    id: event.id,
    date: kstDate(event.occurredAt),
    title: cleanText(event.title, TITLE_MAX) ?? "제목 없음",
    summary: cleanText(event.summary, SUMMARY_MAX),
    nextAction: nextActionOf(event),
    source: sourceOf(event),
    tags,
  }
}

function normalizeOwner(owner: CustomerHistoryOwner | null | undefined): CustomerHistoryOwner | null {
  const name = owner?.name ? oneLine(owner.name) : ""
  if (!owner || !name || UNASSIGNED_OWNER.test(name)) return null
  return { ...owner, name }
}

async function settle<T>(task: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    return { ok: true, value: await task() }
  } catch {
    return { ok: false }
  }
}

function emptyResult(base: Pick<CustomerHistoryResult, "tags" | "allTags" | "period" | "periodUnsupported">): CustomerHistoryResult {
  return {
    status: "no_customer",
    customer: null,
    customerFrom: null,
    alternatives: [],
    ...base,
    owner: null,
    ownerFailed: false,
    uid: null,
    items: [],
    total: 0,
    more: 0,
    restricted: false,
    eventsFailed: false,
    unavailable: null,
    notes: [],
  }
}

/** 고객 이력 찾기. 결정형이고 같은 자료·같은 질문이면 늘 같은 결과다. 던지지 않는다(실패는 status·eventsFailed·ownerFailed 로). */
export async function findCustomerHistory(
  question: string,
  deps: CustomerHistoryDeps,
  options: FindCustomerHistoryOptions
): Promise<CustomerHistoryResult> {
  const { tags, all } = customerHistoryTagsOf(question)
  const periodRaw = periodOf(question, options.now)
  const period = periodRaw && periodRaw !== "unsupported" ? periodRaw : null
  const base = emptyResult({ tags, allTags: all, period, periodUnsupported: periodRaw === "unsupported" })

  const found = deps.findCustomersInText ? await settle(() => deps.findCustomersInText!(question)) : null
  const inText = found?.ok ? found.value : []
  let customer: CustomerRef | null = inText[0] ?? null
  let customerFrom: CustomerHistoryResult["customerFrom"] = customer ? "question" : null
  if (!customer && options.openCustomer) {
    customer = options.openCustomer
    customerFrom = "page"
  }
  if (!customer) {
    // 고객 찾기 자체가 실패했으면 "고객을 찾지 못했다"가 아니라 "읽지 못했다"다.
    return found && !found.ok ? { ...base, status: "failed" } : base
  }

  const alternatives = [...new Set(inText.slice(1).map((other) => oneLine(other.name)).filter(Boolean))].slice(0, 3)
  const withCustomer = { ...base, customer: { name: customer.name, key: customer.key }, customerFrom, alternatives }

  const profileResult = await settle(() => deps.loadProfile(customer as CustomerRef))
  if (!profileResult.ok) return { ...withCustomer, status: "failed" }
  const profile = profileResult.value
  if (!profile || profile.targets.length === 0) return { ...withCustomer, status: "unsupported" }

  const owner = normalizeOwner(profile.owner)
  const range = period ? periodRange(period) : null
  const eventsResult = await settle(() =>
    deps.listEvents({ targets: profile.targets, tags, limit: MAX_CUSTOMER_HISTORY_ITEMS, ...(range ?? {}) })
  )
  const batch = eventsResult.ok ? eventsResult.value : null
  const events = (batch?.events ?? [])
    .filter((event) => event && typeof event.id === "string" && event.tags.some((tag) => (tags as readonly string[]).includes(tag)))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id))
  const total = batch ? Math.max(batch.total, events.length) : 0
  const restricted = !options.actor.canReadContent
  const items = restricted ? [] : events.slice(0, MAX_CUSTOMER_HISTORY_ITEMS).map(itemOf)
  const uid = profile.uid ? cleanText(profile.uid, 40) : null

  return {
    ...withCustomer,
    status: "ok",
    owner,
    ownerFailed: Boolean(profile.ownerFailed),
    uid,
    items,
    total,
    more: restricted ? 0 : Math.max(0, total - items.length),
    restricted,
    eventsFailed: !eventsResult.ok,
    unavailable: batch?.unavailable ?? null,
    notes: (profile.notes ?? []).filter(Boolean),
  }
}

// ── 카드 ─────────────────────────────────────────────────────────────────────────────────

function topicOf(result: CustomerHistoryResult): string {
  return result.tags.map((tag) => CUSTOMER_HISTORY_TAG_LABEL[tag]).join("·")
}

function ownerLine(result: CustomerHistoryResult): string {
  if (result.ownerFailed && !result.owner) return "담당 영업을 읽지 못했습니다."
  if (!result.owner) return "담당 영업은 지정되지 않았습니다."
  const from = result.owner.from === "neo" ? `NEO 기준${result.owner.stale ? ", 오래된 스냅숏" : ""}` : "리드 담당"
  return `담당 영업: ${result.owner.name}(${from}).`
}

function periodName(period: Period): string {
  return period.label.split("(")[0].trim()
}

function headlineOf(result: CustomerHistoryResult): string {
  const name = result.customer?.name ?? "고객"
  const topic = topicOf(result)
  const periodTail = result.period ? `(${periodName(result.period)})` : ""
  if (result.eventsFailed) return `${name} 활동 기록을 읽지 못했습니다 — 고객 화면에서 확인해 주세요.`
  if (result.unavailable) return `${name} 활동 기록을 아직 읽을 수 없습니다(${result.unavailable}).`
  if (result.total === 0) return `${name}에 ${topic} 관련 기록이 없습니다${periodTail}.`
  if (result.restricted) return `${name}에 ${topic} 관련 기록 ${result.total}건이 있습니다${periodTail}.`
  const latest = result.items[0]?.date
  return `${name} ${topic} 관련 기록 ${result.total}건을 찾았습니다${periodTail}${latest ? ` — 최근 ${latest}` : ""}.`
}

function denyBlock(title: string, label: string, text: string): AiBlock {
  const openHref = internalHrefOf(CUSTOMER_HISTORY_LINK_ID)
  return {
    kind: "deny",
    card: {
      title,
      target: { label, meta: "고객 이력" },
      text,
      ...(openHref ? { openLabel: "통합 고객 화면 열기", openHref } : {}),
    },
  }
}

/** 찾기 결과 → 블록. 결론 한 줄(두괄식, 담당 영업 포함)이 맨 위다. */
export function customerHistoryBlocks(result: CustomerHistoryResult): AiBlock[] {
  if (result.status === "no_customer") {
    return [
      denyBlock(
        "어느 고객인지 찾지 못했습니다",
        "고객 이름 필요",
        "통합 고객 이름을 넣어 다시 물어봐 주세요(예: \"가나학원 결제 문제 있었나?\"). 고객 화면을 연 채로 물어도 됩니다."
      ),
    ]
  }
  if (result.status === "failed") {
    return [denyBlock("고객 이력을 읽지 못했습니다", result.customer?.name ?? "고객 이력", "잠시 뒤 다시 물어봐 주시거나 고객 화면에서 확인해 주세요.")]
  }
  if (result.status === "unsupported") {
    return [
      denyBlock(
        "이 고객은 아직 이력을 읽지 않습니다",
        result.customer?.name ?? "고객 이력",
        "갈매봇 고객 이력은 리드와 NEO 고객만 읽습니다. 고객 화면에서 확인해 주세요."
      ),
    ]
  }

  const notes: string[] = []
  if (result.customerFrom === "page") notes.push("열린 화면의 고객 기준입니다.")
  if (result.restricted && result.total > 0) notes.push("기록 내용은 CS 담당 역할만 볼 수 있습니다 — 내용은 CS 담당에게 요청해 주세요.")
  if (result.more > 0) notes.push(`최신 ${result.items.length}건만 보였습니다. 나머지 ${result.more}건은 고객 화면 활동 기록에서 보세요.`)
  if (result.alternatives.length) notes.push(`질문에 걸린 다른 고객(${result.alternatives.join(", ")})은 따로 물어봐 주세요.`)
  if (result.periodUnsupported) notes.push("기간 말을 해석하지 못해 기간 없이 찾았습니다(오늘·어제·이번 주·지난주·이번 달·지난달·올해·최근 N일을 알아듣습니다).")
  notes.push(...result.notes)
  notes.push(`태그 ${result.tags.join("·")} 중 하나가 붙은 기록만 봅니다 — 태그 없는 기록은 고객 화면에서 확인해 주세요.`)

  const openHref = internalHrefOf(CUSTOMER_HISTORY_LINK_ID)
  const card: ReadCard = {
    icon: "search",
    title: "고객 이력",
    target: {
      label: result.customer?.name ?? "고객",
      meta: [result.allTags ? "결제·견적·AS·API·CS 케이스" : topicOf(result), `${result.total}건`, result.uid ? `UID ${result.uid}` : ""]
        .filter(Boolean)
        .join(" · "),
    },
    ...(result.items.length
      ? {
          table: {
            head: ["날짜", "기록", "다음 할 일", "출처"],
            rows: result.items.map((item) => [
              item.date ?? "-",
              item.summary ? `${item.title} — ${item.summary}` : item.title,
              item.nextAction ?? "-",
              item.source,
            ]),
            textual: true,
          },
        }
      : {}),
    note: notes.join(" "),
    ...(openHref ? { openLabel: "통합 고객 화면 열기", openHref } : {}),
    internalOnly: true,
  }
  return [{ kind: "text", text: `${headlineOf(result)} ${ownerLine(result)}` }, { kind: "read", card }]
}
