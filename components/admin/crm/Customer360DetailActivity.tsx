"use client"

import { useMemo, useRef, useState } from "react"
import { ArrowUpRight, CheckCircle2, Circle } from "lucide-react"

import { adminFetchJson } from "@/lib/admin-client"
import type { CustomerTimelinePage } from "@/lib/repositories/crm-customer-timeline"

import { Panel, TableEmpty } from "@/components/admin/viz"
import {
  COMPASS_TIMELINE_SOURCE_LABEL,
  compassTimelineGroup,
  mergeCompassTimeline,
  type CompassTimelineEntry,
  type CompassTimelineGroup,
} from "@/lib/crm/compass-timeline"
import type { Customer360Compass } from "@/lib/repositories/crm-customer-360"
import type { Customer360Money } from "@/lib/repositories/crm-customer-360"
import type { ListCrmDealsResult } from "@/lib/repositories/crm-deals"
import { buildCustomerPurchaseHistory, compareCustomerHistory, isCompassVisit, isCustomerVisit, purchaseHistoryMatches, type CustomerHistoryFilter, type CustomerPurchaseHistoryEntry } from "@/lib/crm/customer-history"
import { formatCrmMoney } from "@/lib/crm/money-format"
import { moneyTimelineStatusLabel } from "@/lib/crm/money-timeline"
import type { CrmCustomerEventRecord, ListCrmCustomerEventsResult } from "@/lib/repositories/crm-events"

import {
  Chip,
  formatDateTime,
  SENTIMENT_LABEL,
} from "./Customer360DetailShared"
import { eventSourceIcon, eventSourceLabel } from "./event-source-meta"

type ActivityFilter = CustomerHistoryFilter

const FILTERS: Array<{ key: ActivityFilter; label: string }> = [
  { key: "all", label: "전체" },
  { key: "order", label: "오더" },
  { key: "visit", label: "방문·미팅" },
  { key: "hardware", label: "하드웨어" },
  { key: "software", label: "소프트웨어" },
  { key: "memo", label: "메모" },
  { key: "meeting", label: "회의록" },
  { key: "cs_inflow", label: "CS·웹유입" },
  { key: "calls_etc", label: "통화·기타" },
]

/** Compass 활동 묶음(lib/crm/compass-timeline.ts)을 이 화면의 필터 축에 눕힌다(종류를 새로 만들지 않는다).
 *  memo·note·시트(import) → 메모, meeting → 회의록, inflow·폼 답변 → CS·웹유입, 콜·문자·액션·알림톡·단계 변경 → 통화·기타. */
const COMPASS_GROUP_FILTER: Record<CompassTimelineGroup, ActivityFilter> = {
  memo: "memo",
  meeting: "meeting",
  inflow: "cs_inflow",
  other: "calls_etc",
}

function compassMatchesFilter(entry: CompassTimelineEntry, filter: ActivityFilter): boolean {
  if (filter === "all") return true
  if (filter === "visit") return isCompassVisit(entry)
  return COMPASS_GROUP_FILTER[compassTimelineGroup(entry.kind)] === filter
}

function matchesFilter(event: CrmCustomerEventRecord, filter: ActivityFilter): boolean {
  if (filter === "all") return true
  if (filter === "visit") return isCustomerVisit(event)
  if (["order", "hardware", "software"].includes(filter)) return false
  if (filter === "memo") return event.sourceType === "manual_note"
  if (filter === "meeting") return event.sourceType === "meeting_minutes"
  if (filter === "cs_inflow") {
    return (
      event.sourceType === "site_inflow" ||
      event.sourceType === "lead_contact_log" ||
      event.tags.some((t) => {
        const lower = t.toLowerCase()
        return lower.includes("cs") || lower.includes("chatbot") || lower.includes("channel") || lower.includes("demo")
      })
    )
  }
  // 통화·기타 = 메모/회의록/CS웹유입을 제외한 나머지 출처.
  return (
    event.sourceType !== "manual_note" &&
    event.sourceType !== "meeting_minutes" &&
    event.sourceType !== "site_inflow" &&
    event.sourceType !== "lead_contact_log"
  )
}

function sentimentClass(sentiment: string): string {
  if (sentiment === "risk") return "bg-[#FCE9E9] text-[#B43E3E]"
  if (sentiment === "positive") return "bg-[#ECFDF5] text-[#084734]"
  return "bg-[#f0f0ec] text-[#1a1a1a]/55"
}

function StringList({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null
  return (
    <div>
      <p className="text-[11px] font-semibold text-[#1a1a1a]/35">{label}</p>
      <ul className="mt-1 space-y-0.5">
        {items.map((item, i) => (
          <li key={`${item}-${i}`} className="text-[14px] leading-6 text-[#1a1a1a]/70">
            · {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ActivityCard({ event }: { event: CrmCustomerEventRecord }) {
  const detail =
    event.meetingPurpose ||
    event.attendees.length > 0 ||
    event.decisions.length > 0 ||
    event.blockers.length > 0 ||
    event.nextActions.length > 0 ||
    event.tags.length > 0 ||
    event.body

  return (
    <li className="flex gap-3">
      <span
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
          event.sentiment === "risk" ? "bg-[#FCE9E9] text-[#B43E3E]" : "bg-[#fafaf8] text-[#1a1a1a]/45"
        }`}
      >
        {eventSourceIcon(event.sourceType)}
      </span>
      <div className="min-w-0 flex-1 rounded-2xl border border-[#f0f0ec] bg-white p-3.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-[#1a1a1a]/45">
            {eventSourceLabel(event.sourceType)}
          </span>
          <span className="text-[11px] text-[#1a1a1a]/35">{formatDateTime(event.occurredAt)}</span>
          {event.ownerName ? <span className="text-[11px] text-[#1a1a1a]/35">· {event.ownerName}</span> : null}
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${sentimentClass(event.sentiment)}`}>
            {SENTIMENT_LABEL[event.sentiment] ?? event.sentiment}
          </span>
        </div>

        <p className="mt-1 text-[14px] font-bold text-[#111110]">{event.title}</p>
        {event.summary ? <p className="mt-0.5 text-[14px] leading-6 text-[#1a1a1a]/55">{event.summary}</p> : null}

        {event.recording ? (
          <div className="mt-3">
            <p className="mb-1 break-words text-[12px] text-[#615D59]">{event.recording.fileName ?? "녹음 파일"}</p>
            {event.recording.signedUrl ? <audio controls preload="none" src={event.recording.signedUrl} aria-label={`${event.title} 녹음 재생`} className="h-10 w-full max-w-full" /> : <p className="text-[12px] text-[#7A520F]">녹음 파일 연결을 확인하지 못했습니다.</p>}
          </div>
        ) : null}

        {detail ? (
          <details className="mt-3 space-y-2.5 border-t border-[#f5f5f2] pt-3">
            <summary className="min-h-8 cursor-pointer text-[12px] font-medium text-[#084734]">기록 상세 · 본문·다음 액션</summary>
            {event.meetingPurpose ? (
              <div>
                <p className="text-[11px] font-semibold text-[#1a1a1a]/35">미팅 목적</p>
                <p className="mt-0.5 text-[12px] text-[#1a1a1a]/70">{event.meetingPurpose}</p>
              </div>
            ) : null}

            {event.attendees.length > 0 ? (
              <div>
                <p className="text-[11px] font-semibold text-[#1a1a1a]/35">참석자</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {event.attendees.map((person, i) => (
                    <Chip key={`${person}-${i}`}>{person}</Chip>
                  ))}
                </div>
              </div>
            ) : null}

            <StringList label="결정 사항" items={event.decisions} />
            <StringList label="블로커" items={event.blockers} />

            {event.nextActions.length > 0 ? (
              <div>
                <p className="text-[11px] font-semibold text-[#1a1a1a]/35">다음 액션</p>
                <ul className="mt-1 space-y-1">
                  {event.nextActions.map((action, i) => (
                    <li key={`${action.title}-${i}`} className="flex items-start gap-1.5 text-[12px]">
                      {action.done ? (
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#084734]" />
                      ) : (
                        <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#1a1a1a]/30" />
                      )}
                      <span className={action.done ? "text-[#1a1a1a]/40 line-through" : "text-[#1a1a1a]/70"}>
                        {action.title}
                        {action.ownerName ? ` · ${action.ownerName}` : ""}
                        {action.dueAt ? ` · ${formatDateTime(action.dueAt)}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {event.body && event.body !== event.summary ? (
              <p className="whitespace-pre-line text-[14px] leading-6 text-[#1a1a1a]/70">{event.body}</p>
            ) : null}

            {event.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {event.tags.map((tag) => (
                  <Chip key={tag} className="bg-[#ECFDF5] text-[#084734]">
                    #{tag}
                  </Chip>
                ))}
              </div>
            ) : null}
          </details>
        ) : null}
      </div>
    </li>
  )
}

/**
 * Compass 활동 카드 — 우리 원장이 아니라 마케팅팀 앱에서 온 기록이라 소스 라벨을 항상 붙인다.
 * actor 는 표시용 문자열일 뿐이다(Compass는 공용 계정 앱 — 어드민 신원과 매핑하지 않는다).
 */
function CompassActivityCard({ entry }: { entry: CompassTimelineEntry }) {
  const [expanded, setExpanded] = useState(false)
  const body = entry.body
  // 장문은 3줄로 접고 펼칠 수 있게 한다 — 잘라 버리지 않는다.
  const isLong = Boolean(body && (body.length > 140 || body.split("\n").length > 3))

  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#084734]/25 text-[10px] font-bold text-[#084734]">
        C
      </span>
      <div className="min-w-0 flex-1 rounded-2xl border border-[#f0f0ec] bg-white p-3.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-[#084734]">
            {COMPASS_TIMELINE_SOURCE_LABEL} · {entry.kindLabel}
          </span>
          <span className="text-[11px] text-[#1a1a1a]/35">{formatDateTime(entry.occurredAt)}</span>
          {entry.actor ? <span className="text-[11px] text-[#1a1a1a]/35">· {entry.actor}</span> : null}
        </div>
        {body ? (
          <>
            <p
              className={`mt-1 whitespace-pre-line text-[14px] leading-6 text-[#1a1a1a]/70 ${
                isLong && !expanded ? "line-clamp-3" : ""
              }`}
            >
              {body}
            </p>
            {isLong ? (
              <button
                type="button"
                onClick={() => setExpanded((prev) => !prev)}
                aria-expanded={expanded}
                className="mt-1 text-[11px] font-semibold text-[#1a1a1a]/45 transition-colors hover:text-[#111110]"
              >
                {expanded ? "접기" : "펼치기"}
              </button>
            ) : null}
          </>
        ) : (
          <p className="mt-1 text-[12px] text-[#1a1a1a]/35">본문 없음</p>
        )}
        <a
          href={entry.href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-0.5 text-[11px] font-semibold text-[#084734] transition-colors hover:underline"
        >
          Compass에서 열기
          <ArrowUpRight className="h-3 w-3" />
        </a>
      </div>
    </li>
  )
}

function PurchaseHistoryCard({ row }: { row: CustomerPurchaseHistoryEntry }) {
  const isMoney = row.kind === "money"
  const title = isMoney ? row.entry.title : row.item.product
  const source = isMoney ? row.entry.sourceLabel : row.item.source === "hw_outbound" ? `HW 출고${row.detail.outboundType ? ` · ${row.detail.outboundType}` : ""}` : "주문 품목"
  const rawStatus = isMoney ? moneyTimelineStatusLabel(row.entry) : null
  const status = isMoney ? rawStatus && /^\d+$/.test(rawStatus) ? "상태 미확인" : rawStatus : row.item.evidence === "confirmed" ? "고객 연결 확정" : "고객명 일치 · 추정"
  return <li className="rounded-xl border border-black/[0.08] bg-white p-3.5">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[12px] font-medium text-[#084734]">{source}</p>
        <p className="mt-1 break-words text-[14px] font-semibold text-[#111110]">{title}</p>
        <p className="mt-1 text-[12px] text-[#615D59]">{row.at ? formatDateTime(row.at) : "날짜 미확인"}{!isMoney && row.item.source === "deal_line_items" ? " · 최근 수정일" : ""}{isMoney && row.entry.ownerName ? ` · ${row.entry.ownerName}` : ""}</p>
      </div>
      <p className="shrink-0 text-right text-[14px] font-semibold tabular-nums text-[#111110]">{isMoney ? row.entry.amount == null ? "금액 미확인" : formatCrmMoney({ amount: row.entry.amount, currency: row.entry.currency }) : `${row.detail.quantity.toLocaleString("ko-KR")}개`}</p>
    </div>
    <p className="mt-2 text-[12px] text-[#615D59]">{status}{!isMoney ? ` · ${row.detail.ref}` : ""}</p>
    {!isMoney && row.detail.serials.length ? <details className="mt-2 text-[12px] text-[#615D59]"><summary className="cursor-pointer py-1">시리얼 번호 {row.detail.serials.length}개</summary><p className="mt-2 break-all">{row.detail.serials.join(" · ")}</p></details> : null}
  </li>
}

export default function Customer360DetailActivity({
  activity,
  compass,
  customerKey,
  generatedAt,
  money,
  deals,
}: {
  customerKey?: string
  generatedAt?: string
  activity: ListCrmCustomerEventsResult
  compass: Customer360Compass
  money?: Customer360Money
  deals?: ListCrmDealsResult
}) {
  const [filter, setFilter] = useState<ActivityFilter>("all")
  const [query, setQuery] = useState("")
  const [visible, setVisible] = useState(30)
  const [history, setHistory] = useState(() => ({
    seedActivity: activity, seedCompass: compass,
    rows: activity.rows, entries: compass.entries,
    crmTotal: activity.health.ok ? activity.summary.total : null,
    crmCursor: activity.pagination?.nextOffset ?? null,
    compassCursor: compass.pagination?.nextOffset ?? null,
    before: generatedAt ?? activity.generatedAt,
  }))
  const [loadingMore, setLoadingMore] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)
  const inFlight = useRef(false)
  if (history.seedActivity !== activity || history.seedCompass !== compass) {
    // 최초 원천 장애가 복구되면 새 스냅샷의 커서로 다시 시작한다.
    // 이미 읽은 로그는 ID로 합쳐 유지하고, 복구된 원천의 이전 로그도 열어 둔다.
    const recovered = (!history.seedActivity.health.ok && activity.health.ok)
      || (history.seedCompass.down && !compass.down)
    setHistory({ ...history, seedActivity: activity, seedCompass: compass,
      ...(recovered ? {
        crmCursor: activity.pagination?.nextOffset ?? null,
        compassCursor: compass.pagination?.nextOffset ?? null,
        before: generatedAt ?? activity.generatedAt,
      } : {}),
      crmTotal: activity.health.ok ? activity.summary.total : history.crmTotal,
      rows: [...new Map([...history.rows, ...activity.rows].map(row => [row.id, row])).values()],
      entries: [...new Map([...history.entries, ...compass.entries].map(entry => [entry.id, entry])).values()],
    })
  }
  const loadMore = async () => {
    if (!customerKey || inFlight.current) return
    inFlight.current = true
    setLoadingMore(true)
    setPageError(null)
    try {
      const params = new URLSearchParams({
        crmOffset: String(history.crmCursor ?? activity.summary.total),
        compassOffset: String(history.compassCursor ?? compass.pagination?.total ?? compass.entries.length),
        before: history.before,
      })
      const page = await adminFetchJson<CustomerTimelinePage>(`/api/admin/crm/customers/${encodeURIComponent(customerKey)}/timeline?${params}`)
      if (!page.activity.health.ok) throw new Error(page.activity.health.message ?? "CRM 기록을 확인하지 못했습니다.")
      if (page.compass.down) throw new Error("Compass 기록을 확인하지 못했습니다. 다시 시도해 주세요.")
      setHistory(current => ({ ...current,
        rows: [...new Map([...current.rows, ...page.activity.rows].map(row => [row.id, row])).values()],
        entries: [...new Map([...current.entries, ...page.compass.entries].map(entry => [entry.id, entry])).values()],
        crmCursor: page.activity.pagination.nextOffset,
        compassCursor: page.compass.pagination?.nextOffset ?? null,
      }))
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "기록을 불러오지 못했습니다.")
    } finally {
      inFlight.current = false
      setLoadingMore(false)
    }
  }
  const rows = history.rows
  const merged = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return [
      ...mergeCompassTimeline(rows.filter(event => matchesFilter(event, filter)), history.entries.filter(entry => compassMatchesFilter(entry, filter))).map(item => ({ ...item, id: item.kind === "crm" ? `crm:${item.event.id}` : item.entry.id })),
      ...buildCustomerPurchaseHistory(money, deals).filter(entry => purchaseHistoryMatches(entry, filter)),
    ].filter(item => {
      if (!needle) return true
      const text = item.kind === "crm" ? [item.event.title, item.event.body, item.event.summary, ...item.event.tags].join(" ") : item.kind === "compass" ? item.entry.body ?? "" : item.kind === "money" ? [item.entry.title, item.entry.sourceLabel, item.entry.status].join(" ") : [item.item.product, item.detail.ref, ...item.detail.serials].join(" ")
      return text.toLocaleLowerCase().includes(needle)
    }).sort(compareCustomerHistory)
  }, [rows, history.entries, money, deals, filter, query])
  const hasMore = history.crmCursor != null || history.compassCursor != null

  return (
    <Panel
      title={money ? "고객 로그·구매 기록" : `전체 로그 · ${((history.crmTotal ?? history.rows.length) + history.entries.length).toLocaleString("ko-KR")}건`}
      description={
        `${activity.health.ok ? `CRM 전체 ${activity.summary.total}건` : "CRM 확인 불가 · 최근 로그 유지"} · Compass 불러온 로그 ${history.entries.length}건${money ? ` · NEO 오더 ${money.orders.length}건` : ""} · 최신순${hasMore ? " · 이전 기록 더 보기 가능" : ""}`
      }
      action={
        <div className="flex flex-wrap gap-1">
          {FILTERS.filter(item => money ? ["all", "order", "visit", "hardware", "software"].includes(item.key) : !["order", "hardware", "software"].includes(item.key)).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => { setFilter(item.key); setVisible(30) }}
              aria-pressed={filter === item.key}
              className={`min-h-11 rounded-md px-2.5 text-[12px] font-semibold transition-colors ${
                filter === item.key ? "text-[#084734] underline underline-offset-4" : "text-[#615D59] hover:text-[#111110]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      }
    >
      {money ? <p className="mb-3 text-[12px] text-[#615D59]">오더·수금·품목·실출고는 개별 기록입니다. 원천 간 금액·수량은 합산하지 않습니다. NEO 오더·수금은 최근 최대 200건입니다.</p> : null}
      {money?.sourceWarnings?.length ? <p role="alert" className="mb-3 text-[13px] text-[#B43E3E]">{money.sourceWarnings.join(" ")}</p> : null}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input type="search" aria-label="고객 이력 검색" placeholder="내용·품목·주문번호·시리얼 검색" value={query} onChange={event => { setQuery(event.target.value); setVisible(30) }} className="min-h-11 min-w-0 w-full rounded-md border border-black/[0.08] bg-white px-3 text-[14px] text-[#111110] outline-offset-2 focus-visible:outline-2 focus-visible:outline-[#084734] sm:w-auto sm:flex-1" />
        {money ? <select aria-label="활동 기록 유형" value={["memo", "meeting", "cs_inflow", "calls_etc"].includes(filter) ? filter : "all"} onChange={event => { setFilter(event.target.value as ActivityFilter); setVisible(30) }} className="min-h-11 rounded-md border border-black/[0.08] bg-white px-3 text-[13px] text-[#615D59] focus-visible:outline-2 focus-visible:outline-[#084734]">
          <option value="all">기록 유형</option>
          {FILTERS.filter(item => ["memo", "meeting", "cs_inflow", "calls_etc"].includes(item.key)).map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
        </select> : null}
        <span role="status" className="text-[12px] text-[#615D59]">불러온 기록 중 {merged.length.toLocaleString("ko-KR")}건</span>
      </div>
      {money?.lineItemsMeta?.truncated || money?.lineItemsMeta?.note ? <p className="mb-3 text-[12px] text-[#7A520F]">{money.lineItemsMeta.truncated ? "주문 품목은 일부 조회 결과입니다. " : ""}{money.lineItemsMeta.note}</p> : null}
      {!activity.health.ok && activity.health.message ? (
        <p className="mb-3 rounded-xl border border-[#ECD29C] bg-[#FBF1E0] px-3 py-2 text-[12px] text-[#7A520F]">
          {activity.health.message}
        </p>
      ) : null}

      {/* 연결이 끊긴 것과 활동이 없는 것은 다른 사실이다 — 배지로 강등해 말한다. */}
      {compass.down ? (
        <p className="mb-3 flex items-center gap-2 border-l-2 border-[#B43E3E] px-3 py-2 text-[12px] text-[#1a1a1a]/55">
          Compass 연결이 끊겨 마케팅 활동을 병합하지 못했습니다.
        </p>
      ) : null}

      {merged.length === 0 ? (
        <TableEmpty message={filter === "all" ? "기록된 활동이 없습니다." : "해당 유형의 기록이 없습니다."} />
      ) : (
        <ul className="space-y-3">
          {merged.slice(0, visible).map((item) =>
            item.kind === "crm" ? (
              <ActivityCard key={item.event.id} event={item.event} />
            ) : item.kind === "compass" ? (
              <CompassActivityCard key={item.entry.id} entry={item.entry} />
            ) : <PurchaseHistoryCard key={item.id} row={item} />
          )}
        </ul>
      )}
      {merged.length > visible ? <button type="button" onClick={() => setVisible(count => count + 30)} className="mt-4 min-h-11 w-full rounded-md border border-black/[0.08] text-[13px] font-semibold text-[#084734]">목록 더 보기 · {merged.length - visible}건 남음</button> : null}
      {pageError ? <p role="alert" className="mt-4 text-[13px] text-[#B43E3E]">{pageError}</p> : null}
      {customerKey && hasMore ? (
        <button type="button" disabled={loadingMore} onClick={() => void loadMore()} className="mt-4 min-h-11 w-full rounded-md border border-[#e8e8e4] px-4 text-[13px] font-semibold text-[#084734] hover:bg-[#F6F5F4] disabled:opacity-50">
          {loadingMore ? "이전 기록 불러오는 중…" : "이전 기록 더 보기"}
        </button>
      ) : null}
    </Panel>
  )
}
