"use client"

// CRM 기록 표면 — 좌: 컴포저(ActivityQuickForm composer)+필터+타임라인, 우: CrmActionRail(hideForm·hideRecent — 오늘 할 일).
// 기록 생성 폼 SSOT는 rail/ActivityQuickForm — 이 파일은 폼을 직접 들고 있지 않는다.

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Clock,
  FileAudio,
  Filter,
  RefreshCw,
  Search,
  UserRound,
} from "lucide-react"

import { adminFetchJsonCached, getCachedAdminJson } from "@/lib/admin-client"
import Pager from "@/components/admin/ui/Pager"
import CrmActionRail from "./rail/CrmActionRail"
import ActivityQuickForm from "./rail/ActivityQuickForm"
import CrmEventRow from "./CrmEventRow"
import {
  EVENTS_URL,
  SENTIMENT_FILTERS,
  SOURCE_FILTERS,
  TARGET_OPTIONS,
  formatDateTime,
  formatFileSize,
  isActivityTargetType,
  sentimentLabel,
  sentimentTone,
  type CrmEventRecord,
  type CrmEventsResponse,
  type Sentiment,
  type SourceType,
  type TargetType,
} from "./rail/activity-contract"

const CACHE_TTL_MS = 30_000
const PAGE_LIMIT = 50
type ActivityScope = "work" | "all"
const AUTOMATED_EVENT_SOURCES = new Set<SourceType>(["site_inflow", "external_crm", "sheet"])

function listUrl(input: {
  query: string
  targetType: TargetType
  sourceType: SourceType
  sentiment: Sentiment
  scope: ActivityScope
  offset: number
  targetId?: string
}) {
  const params = new URLSearchParams({ limit: String(PAGE_LIMIT), offset: String(input.offset) })
  if (input.query.trim()) params.set("q", input.query.trim())
  if (input.targetType !== "all") params.set("targetType", input.targetType)
  if (input.sourceType !== "all") params.set("sourceType", input.sourceType)
  if (input.sentiment !== "all") params.set("sentiment", input.sentiment)
  if (input.scope === "work" && input.sourceType === "all") params.set("scope", "work")
  if (input.targetId?.trim()) params.set("targetId", input.targetId.trim())
  return `${EVENTS_URL}?${params.toString()}`
}

function mergePage(current: CrmEventsResponse | null, next: CrmEventsResponse, append: boolean): CrmEventsResponse {
  if (!append || !current) return next
  const seen = new Set(current.rows.map((row) => row.id))
  const rows = [...current.rows, ...next.rows.filter((row) => !seen.has(row.id))]
  return {
    ...next,
    rows,
    pagination: {
      ...next.pagination,
      offset: 0,
      returned: rows.length,
    },
  }
}

function RecordingPlayer({ event }: { event: CrmEventRecord }) {
  if (!event.recording) return null
  const { signedUrl, mimeType, fileName, sizeBytes } = event.recording
  return (
    <div className="mt-3 rounded-xl border border-[#e8e8e4] bg-[#fafaf8] p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <FileAudio className="h-4 w-4 shrink-0 text-[#084734]" />
          <p className="truncate text-[12px] font-semibold text-[#111110]">{fileName ?? "녹음파일"}</p>
        </div>
        <span className="shrink-0 text-[11px] font-medium text-[#1a1a1a]/40">{formatFileSize(sizeBytes)}</span>
      </div>
      {signedUrl ? (
        mimeType?.startsWith("video/") ? (
          <video src={signedUrl} controls className="max-h-52 w-full rounded-lg bg-black" />
        ) : (
          <audio src={signedUrl} controls className="w-full" />
        )
      ) : (
        <p className="text-[12px] text-[#B85C33]">녹음 재생 링크를 만들지 못했습니다.</p>
      )}
    </div>
  )
}

function CrmActivityClientInner() {
  const [query, setQuery] = useState("")
  const [filterTarget, setFilterTarget] = useState<TargetType>("all")
  const [filterSource, setFilterSource] = useState<SourceType>("all")
  const [filterSentiment, setFilterSentiment] = useState<Sentiment>("all")
  const [activityScope, setActivityScope] = useState<ActivityScope>("work")
  const [data, setData] = useState<CrmEventsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestSeq = useRef(0)

  const searchParams = useSearchParams()
  const focusTargetId = (searchParams.get("targetId") ?? "").trim()
  const focusTargetTypeParam = (searchParams.get("targetType") ?? "").trim()
  const focusLabelFromQuery = (searchParams.get("targetLabel") ?? "").trim()
  const backParam = (searchParams.get("back") ?? "").trim()

  const focusTargetType = isActivityTargetType(focusTargetTypeParam) ? focusTargetTypeParam : undefined

  const focusLabel = useMemo(() => {
    if (focusLabelFromQuery) return focusLabelFromQuery
    if (!focusTargetId) return ""
    const match = data?.rows.find((row) => row.targetId === focusTargetId)
    return match?.targetLabel ?? ""
  }, [focusLabelFromQuery, focusTargetId, data])

  const focusName = focusLabel || "선택한 고객"
  const backHref = backParam || `/admin/crm/customers/unified?account=${encodeURIComponent(focusTargetId)}`

  const loadEvents = useCallback(
    async (offset: number, options?: { force?: boolean; append?: boolean }) => {
      const append = Boolean(options?.append)
      const url = listUrl({
        query,
        targetType: filterTarget,
        sourceType: filterSource,
        sentiment: filterSentiment,
        scope: activityScope,
        offset,
        targetId: focusTargetId,
      })
      const cached = !append && !options?.force ? getCachedAdminJson<CrmEventsResponse>(url, { cacheKey: url }) : null
      const requestId = ++requestSeq.current

      if (cached) setData(cached)
      setLoading(!append && !cached)
      setLoadingMore(append)
      setRefreshing(Boolean(options?.force))
      setError(null)

      try {
        const next = await adminFetchJsonCached<CrmEventsResponse>(
          options?.force ? `${url}&force=1` : url,
          undefined,
          {
            cacheKey: url,
            ttlMs: CACHE_TTL_MS,
            staleWhileRevalidateMs: 2 * 60_000,
            force: options?.force,
          }
        )
        if (requestId !== requestSeq.current) return
        setData((current) => mergePage(current, next, append))
      } catch (err) {
        if (requestId !== requestSeq.current) return
        setError(err instanceof Error ? err.message : "CRM 기록을 불러오지 못했습니다.")
      } finally {
        if (requestId === requestSeq.current) {
          setLoading(false)
          setLoadingMore(false)
          setRefreshing(false)
        }
      }
    },
    [activityScope, filterSentiment, filterSource, filterTarget, query, focusTargetId]
  )

  useEffect(() => {
    void loadEvents(0)
  }, [loadEvents])

  const handleRailSaved = useCallback(() => {
    void loadEvents(0, { force: true })
  }, [loadEvents])

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-[#111110]">기록</h1>
          <p className="mt-1 text-[13px] text-[#1a1a1a]/45">
            녹음·회의록·메모 → 고객 DB 운영 기록
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadEvents(0, { force: true })}
          disabled={refreshing}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2] disabled:text-[#1a1a1a]/30"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          새로고침
        </button>
      </div>

      {focusTargetId ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#D7EBDD] bg-[#ECFDF5] px-3 py-2">
          <div className="flex min-w-0 items-center gap-2 text-[12px] font-semibold text-[#084734]">
            <UserRound className="h-4 w-4 shrink-0" />
            <span className="truncate">{focusName} 고객의 활동 기록만 보고 있습니다.</span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Link
              href={backHref}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#084734]/25 bg-white px-2.5 text-[12px] font-semibold text-[#084734] transition-colors hover:bg-[#ECFDF5]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {focusName} 상세로
            </Link>
            <Link
              href="/admin/crm/activity"
              className="inline-flex h-8 items-center rounded-lg border border-[#e8e8e4] bg-white px-2.5 text-[12px] font-semibold text-[#1a1a1a]/55 transition-colors hover:bg-[#fafaf8]"
            >
              전체 보기
            </Link>
          </div>
        </div>
      ) : null}

      {/* 좌: 컴포저+필터+타임라인(minmax(0,1fr)) · 우: 액션 레일(독립 스크롤, hideForm — 입력면은 본문 컴포저 하나).
          모바일은 컴포저 → 필터 → 타임라인 → 레일 순 스택(컴포저가 첫 인터랙션 블록). */}
      <section className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4 xl:col-start-1 xl:row-start-1">
          <ActivityQuickForm
            variant="composer"
            defaultTargetType={focusTargetType}
            defaultTargetId={focusTargetId || undefined}
            defaultTargetLabel={focusLabel || undefined}
            onSaved={handleRailSaved}
          />

          <section className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex rounded-lg border border-[#e8e8e4] bg-[#F6F5F4] p-1" role="group" aria-label="기록 범위">
                {([
                  { key: "work", label: "업무 기록" },
                  { key: "all", label: "전체 이벤트" },
                ] as const).map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => {
                      setActivityScope(option.key)
                      if (option.key === "work" && AUTOMATED_EVENT_SOURCES.has(filterSource)) setFilterSource("all")
                    }}
                    aria-pressed={activityScope === option.key}
                    className={`h-8 rounded-md px-3 text-[12px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734] ${
                      activityScope === option.key
                        ? "bg-white text-[#111110] shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                        : "text-[#615D59] hover:text-[#111110]"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-[#1a1a1a]/42">
                {activityScope === "work" ? "사람이 남긴 메모·통화·회의·일정을 우선 표시" : "유입·시트·외부 CRM 자동 이벤트 포함"}
              </p>
            </div>
            <div className="grid gap-3 lg:grid-cols-[minmax(200px,1fr)_auto_auto_auto] lg:items-center">
              <label className="flex h-10 items-center gap-2 rounded-lg border border-[#e8e8e4] bg-[#fafaf8] px-3">
                <Search className="h-4 w-4 text-[#1a1a1a]/35" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="고객명, 요약, 담당자 검색"
                  aria-label="CRM 기록 검색"
                  className="h-full min-w-0 flex-1 bg-transparent text-[13px] font-medium text-[#111110] outline-none placeholder:text-[#1a1a1a]/30"
                />
              </label>

              <label className="flex h-10 items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[12px] text-[#1a1a1a]/50">
                <Filter className="h-3.5 w-3.5" />
                <select
                  value={filterTarget}
                  onChange={(event) => setFilterTarget(event.target.value as TargetType)}
                  className="h-full bg-transparent text-[12px] font-semibold text-[#111110] outline-none"
                  aria-label="대상 필터"
                >
                  {TARGET_OPTIONS.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex h-10 items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[12px] text-[#1a1a1a]/50">
                <Filter className="h-3.5 w-3.5" />
                <select
                  value={filterSource}
                  onChange={(event) => {
                    const next = event.target.value as SourceType
                    setFilterSource(next)
                    if (AUTOMATED_EVENT_SOURCES.has(next)) setActivityScope("all")
                  }}
                  className="h-full bg-transparent text-[12px] font-semibold text-[#111110] outline-none"
                  aria-label="기록 종류 필터"
                >
                  {SOURCE_FILTERS.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex h-10 items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[12px] text-[#1a1a1a]/50">
                <Filter className="h-3.5 w-3.5" />
                <select
                  value={filterSentiment}
                  onChange={(event) => setFilterSentiment(event.target.value as Sentiment)}
                  className="h-full bg-transparent text-[12px] font-semibold text-[#111110] outline-none"
                  aria-label="분위기 필터"
                >
                  {SENTIMENT_FILTERS.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {data ? (
              <details className="mt-3">
                <summary className="cursor-pointer select-none text-[12px] font-semibold text-[#1a1a1a]/50 transition-colors hover:text-[#111110]">
                  기록 요약
                </summary>
                <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
                  <div className="rounded-xl bg-[#fafaf8] p-3">
                    <p className="text-[11px] font-semibold text-[#1a1a1a]/35">
                      {activityScope === "work" ? "업무 기록" : "전체 기록"}
                    </p>
                    <p className="mt-1 text-xl font-bold text-[#111110]">{data.summary.total.toLocaleString("ko-KR")}</p>
                  </div>
                  <div className="rounded-xl bg-[#fafaf8] p-3">
                    <p className="text-[11px] font-semibold text-[#1a1a1a]/35">현재 녹음</p>
                    <p className="mt-1 text-xl font-bold text-[#084734]">{data.summary.recordings.toLocaleString("ko-KR")}</p>
                  </div>
                  <div className="rounded-xl bg-[#fafaf8] p-3">
                    <p className="text-[11px] font-semibold text-[#1a1a1a]/35">미처리 액션</p>
                    <p className="mt-1 text-xl font-bold text-[#111110]">
                      {data.summary.openNextActions.toLocaleString("ko-KR")}
                    </p>
                  </div>
                  <div className="rounded-xl bg-[#FEF3EE] p-3">
                    <p className="text-[11px] font-semibold text-[#B85C33]/70">리스크</p>
                    <p className="mt-1 text-xl font-bold text-[#B85C33]">{data.summary.risks.toLocaleString("ko-KR")}</p>
                  </div>
                </div>
              </details>
            ) : null}
          </section>

          {error ? (
            <div className="flex items-start gap-2 rounded-xl border border-[#F6D5C5] bg-[#FEF3EE] px-3 py-2 text-[12px] text-[#B85C33]">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          {!error && data?.health.ok === false && data.health.message ? (
            <div className="flex items-start gap-2 rounded-xl border border-[#F6D5C5] bg-[#FEF3EE] px-3 py-2 text-[12px] text-[#B85C33]">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{data.health.message}</span>
            </div>
          ) : null}

          <section className="space-y-1.5">
            {data?.rows.map((event) => (
              <CrmEventRow key={event.id} event={event}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${sentimentTone(event.sentiment)}`}>
                    {sentimentLabel(event.sentiment)}
                  </span>
                  {event.stageSignal ? (
                    <span className="rounded-full border border-[#e8e8e4] bg-white px-2 py-0.5 text-[11px] font-semibold text-[#1a1a1a]/50">
                      {event.stageSignal}
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[#1a1a1a]/42">
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {formatDateTime(event.occurredAt)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <UserRound className="h-3.5 w-3.5" />
                    {event.ownerName ?? "담당 미지정"}
                  </span>
                  <span>{event.targetLabel ?? "미연결 고객"}</span>
                </div>

                {event.summary ? <p className="mt-3 text-[13px] font-semibold text-[#111110]">{event.summary}</p> : null}
                {event.body ? (
                  <p className="mt-2 whitespace-pre-wrap text-[13px] leading-5 text-[#1a1a1a]/58">{event.body}</p>
                ) : null}

                <RecordingPlayer event={event} />

                {event.attendees.length || event.meetingPurpose ? (
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-medium text-[#1a1a1a]/45">
                    {event.meetingPurpose ? <span>목적: {event.meetingPurpose}</span> : null}
                    {event.attendees.length ? <span>참석: {event.attendees.join(", ")}</span> : null}
                  </div>
                ) : null}

                {event.decisions.length || event.blockers.length || event.nextActions.length ? (
                  <div className="mt-3 grid gap-2 lg:grid-cols-3">
                    {event.decisions.length ? (
                      <div className="rounded-xl bg-[#fafaf8] p-3">
                        <p className="mb-1 text-[11px] font-bold text-[#1a1a1a]/40">결정/합의</p>
                        <ul className="space-y-1 text-[12px] text-[#111110]">
                          {event.decisions.map((decision) => (
                            <li key={decision}>- {decision}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {event.blockers.length ? (
                      <div className="rounded-xl bg-[#FEF3EE] p-3">
                        <p className="mb-1 text-[11px] font-bold text-[#B85C33]/70">리스크/이견</p>
                        <ul className="space-y-1 text-[12px] text-[#B85C33]">
                          {event.blockers.map((blocker) => (
                            <li key={blocker}>- {blocker}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {event.nextActions.length ? (
                      <div className="rounded-xl bg-[#ECFDF5] p-3">
                        <p className="mb-1 text-[11px] font-bold text-[#084734]/70">다음 액션</p>
                        <ul className="space-y-1 text-[12px] text-[#084734]">
                          {event.nextActions.map((action) => (
                            <li key={`${event.id}-${action.title}`} className="flex items-start gap-1.5">
                              <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                              <span>
                                {action.title}
                                {action.ownerName ? ` · ${action.ownerName}` : ""}
                                {action.dueAt ? ` · ${formatDateTime(action.dueAt)}` : ""}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {event.tags.length ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {event.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-[#fafaf8] px-2 py-0.5 text-[11px] font-semibold text-[#1a1a1a]/45">
                        #{tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </CrmEventRow>
            ))}

            {loading && !data ? (
              <div className="rounded-2xl border border-[#e8e8e4] bg-white p-8 text-center text-[13px] text-[#1a1a1a]/40">
                CRM 기록을 불러오는 중입니다...
              </div>
            ) : data && data.rows.length === 0 ? (
              <div className="rounded-2xl border border-[#e8e8e4] bg-white p-8 text-center text-[13px] text-[#1a1a1a]/40">
                조건에 맞는 {activityScope === "work" ? "업무 기록" : "이벤트"}이 없습니다.
              </div>
            ) : null}

            {data && data.pagination.total > 0 ? (
              <div className="rounded-2xl border border-[#e8e8e4] bg-white px-4 py-3">
                <Pager
                  offset={data.pagination.offset}
                  total={data.pagination.total}
                  pageSize={PAGE_LIMIT}
                  onPrev={() => void loadEvents(Math.max(0, data.pagination.offset - PAGE_LIMIT))}
                  onNext={() => void loadEvents(data.pagination.nextOffset ?? data.pagination.offset + PAGE_LIMIT)}
                  disabled={loading || loadingMore || refreshing}
                  unit="개"
                />
              </div>
            ) : null}
          </section>
        </div>

        <CrmActionRail
          hideForm
          hideRecent
          defaultTargetType={focusTargetType}
          defaultTargetId={focusTargetId || undefined}
          customerName={focusLabel || undefined}
          onActivitySaved={handleRailSaved}
          className="xl:col-start-2 xl:row-start-1"
        />
      </section>
    </div>
  )
}

export default function CrmActivityClient() {
  return (
    <Suspense
      fallback={
        <div className="rounded-2xl border border-[#e8e8e4] bg-white p-8 text-center text-[13px] text-[#1a1a1a]/40">
          CRM 기록을 불러오는 중입니다...
        </div>
      }
    >
      <CrmActivityClientInner />
    </Suspense>
  )
}
