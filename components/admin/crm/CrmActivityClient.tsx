"use client"

// CRM 기록 표면 — 좌: 컴포저(ActivityQuickForm composer)+필터+타임라인, 우: 이번 주 요약(A5)+CrmActionRail(hideForm·hideRecent — 오늘 할 일).
// 기록 생성 폼 SSOT는 rail/ActivityQuickForm — 이 파일은 폼을 직접 들고 있지 않는다.
// 캐시 창(TTL·SWR)은 lib/crm/client-cache.ts SSOT 를 쓴다(P2) — 이 파일에 로컬 TTL 상수를 두지 않는다.

import { Suspense, use, useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
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

import { adminFetchJsonCachedWithMeta, getCachedAdminJson, seedAdminRequestCache } from "@/lib/admin-client"
import { CRM_CACHE_SWR_MS, CRM_CACHE_TTL_MS } from "@/lib/crm/client-cache"
import { isActivityWeekSummaryPartial, summarizeActivityWeek } from "@/lib/crm/activity-week-summary"
import {
  ACTIVITY_PERIOD_PRESETS,
  groupEventsByKstDay,
  resolveActivityPeriod,
  type ActivityPeriodPreset,
} from "@/lib/crm/activity-date-groups"
import { buildActivityEventsUrl, defaultActivityEventsUrl } from "@/lib/crm/activity-events-url"
import type { CrmActivityInitialData } from "@/lib/admin/crm/activity-prefetch"
import type { ListCrmCustomerEventsResult } from "@/lib/repositories/crm-events"
import Pager from "@/components/admin/ui/Pager"
import FreshnessCaption from "./FreshnessCaption"
import { ActivityWeekSummaryView, useWeekOpenTasks } from "./activity/ActivityWeekSummary"
import ActivityDateGroups from "./activity/ActivityDateGroups"
import CrmActionRail from "./rail/CrmActionRail"
import ActivityQuickForm from "./rail/ActivityQuickForm"
import { activityDeepLink } from "./rail/rail-utils"
import CrmEventRow from "./CrmEventRow"
import {
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
  from?: string
  to?: string
}) {
  return buildActivityEventsUrl({
    limit: PAGE_LIMIT,
    offset: input.offset,
    query: input.query,
    targetType: input.targetType,
    sourceType: input.sourceType,
    sentiment: input.sentiment,
    scope: input.scope,
    targetId: input.targetId,
    from: input.from,
    to: input.to,
  })
}

// 프리페치 자체가 없을 때(미인증·역할 부족 등) React use()에 안정된 이미-resolved promise를
// 준다 — 매 렌더 새 promise를 주면 무한 서스펜스로 보일 수 있어 모듈 상수를 재사용한다
// (CRM 홈 CrmHomeClient.tsx와 같은 패턴).
const RESOLVED_NULL_PROMISE: Promise<null> = Promise.resolve(null)

/**
 * P1a — openPrefetchLane 결과(promise)를 React use()로 풀어 onSettled로 흘려보내는 다리.
 * 화면에는 아무것도 그리지 않는다. CrmHomeClient의 PrefetchSourceBridge와 같은 목적.
 */
function PrefetchSourceBridge<T>({
  promise,
  onSettled,
}: {
  promise: Promise<T | null>
  onSettled: (value: T | null) => void
}) {
  const value = use(promise)
  useEffect(() => {
    onSettled(value)
  }, [value, onSettled])
  return null
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

// A4 — 날짜 그룹(ActivityDateGroups)이 그룹당 여러 번 그리는 행 하나. 펼침·감정·액션 칩은
// CrmEventRow가, 상세(요약·본문·녹음·결정/리스크/다음액션·태그)는 여기서 children으로 준다 —
// 그룹핑 도입 전(평평한 목록)과 마크업이 같다.
function ActivityEventRow({ event }: { event: CrmEventRecord }) {
  return (
    <CrmEventRow event={event}>
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
  )
}

function CrmActivityClientInner({ initialData }: { initialData?: CrmActivityInitialData | null }) {
  const [query, setQuery] = useState("")
  const [filterTarget, setFilterTarget] = useState<TargetType>("all")
  const [filterSource, setFilterSource] = useState<SourceType>("all")
  const [filterSentiment, setFilterSentiment] = useState<Sentiment>("all")
  const [activityScope, setActivityScope] = useState<ActivityScope>("work")
  // A4 기간 칩 — 기본 "전체", 세션 state(URL 미반영). 변경 시 캐시 키(URL)의 from/to가 바뀐다.
  const [period, setPeriod] = useState<ActivityPeriodPreset>("all")
  const [data, setData] = useState<CrmEventsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 신선도 캡션(P2): 화면에 있는 데이터를 받은 시각 · 백그라운드 재검증 중 · 마지막 갱신 실패 여부.
  const [receivedAt, setReceivedAt] = useState<number | null>(null)
  const [revalidating, setRevalidating] = useState(false)
  const [staleReason, setStaleReason] = useState<"error" | null>(null)
  // 이번 주 요약(A5)의 기준 시각 — 렌더마다 흔들리지 않게 상태로 잡고 강제 새로고침 때만 갱신한다.
  const [nowMs, setNowMs] = useState(() => Date.now())
  const requestSeq = useRef(0)
  const router = useRouter()

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
      const { from, to } = resolveActivityPeriod(period, Date.now())
      const url = listUrl({
        query,
        targetType: filterTarget,
        sourceType: filterSource,
        sentiment: filterSentiment,
        scope: activityScope,
        offset,
        targetId: focusTargetId,
        from,
        to,
      })
      const cached = !append && !options?.force ? getCachedAdminJson<CrmEventsResponse>(url, { cacheKey: url }) : null
      const requestId = ++requestSeq.current

      if (cached) setData(cached)
      setLoading(!append && !cached)
      setLoadingMore(append)
      setRefreshing(Boolean(options?.force))
      setError(null)

      try {
        const result = await adminFetchJsonCachedWithMeta<CrmEventsResponse>(
          options?.force ? `${url}&force=1` : url,
          undefined,
          {
            cacheKey: url,
            ttlMs: CRM_CACHE_TTL_MS,
            staleWhileRevalidateMs: CRM_CACHE_SWR_MS,
            force: options?.force,
            // 새로고침(force)은 실패를 만료 캐시로 대체하지 않고 throw 한다 — "방금 새로고침했으니
            // 최신"이라는 오인을 막는다. 일반 로드는 폴백을 허용하되 staleReason 으로 드러낸다.
            staleIfError: !options?.force,
            // SWR 고속 경로의 백그라운드 갱신 결과 — 더 늦게 시작한 요청이 화면을 갈아치웠으면 버린다.
            onRevalidated: ({ data: fresh, error: revalidateError }) => {
              if (requestId !== requestSeq.current) return
              setRevalidating(false)
              if (revalidateError !== undefined) {
                setStaleReason("error")
                return
              }
              if (!fresh) return
              setData((current) => mergePage(current, fresh, append))
              setReceivedAt(Date.now())
              setStaleReason(null)
            },
          }
        )
        if (requestId !== requestSeq.current) return
        setData((current) => mergePage(current, result.data, append))
        if (!result.stale) {
          setReceivedAt(Date.now())
          setStaleReason(null)
          setRevalidating(false)
        } else {
          setReceivedAt(result.staleSince ?? null)
          if (result.staleReason === "error") {
            // staleIfError 폴백 — 네트워크로 새로 받은 게 아니라 만료 캐시다. 성공처럼 두지 않는다.
            setStaleReason("error")
            setRevalidating(false)
          } else {
            setStaleReason(null)
            setRevalidating(true)
          }
        }
      } catch (err) {
        if (requestId !== requestSeq.current) return
        setRevalidating(false)
        if (cached) setStaleReason("error")
        setError(err instanceof Error ? err.message : "CRM 기록을 불러오지 못했습니다.")
      } finally {
        if (requestId === requestSeq.current) {
          setLoading(false)
          setLoadingMore(false)
          setRefreshing(false)
        }
      }
    },
    [activityScope, filterSentiment, filterSource, filterTarget, query, period, focusTargetId]
  )

  // P1a — 최초 로드는 아래 PrefetchSourceBridge(seedEvents)가 담당한다(프리페치가 없으면
  // RESOLVED_NULL_PROMISE가 즉시 resolve되어 지금까지와 같은 마운트 시점에 fetch된다).
  // 이 효과는 그 뒤로 필터·기간이 바뀔 때만 재조회한다 — 마운트 첫 실행은 건너뛴다(중복 호출 방지).
  const skipNextFilterReloadRef = useRef(true)
  useEffect(() => {
    if (skipNextFilterReloadRef.current) {
      skipNextFilterReloadRef.current = false
      return
    }
    void loadEvents(0)
  }, [loadEvents])

  const weekTasks = useWeekOpenTasks(nowMs)
  const reloadWeekTasks = weekTasks.reload

  const forceReload = useCallback(() => {
    const at = Date.now()
    setNowMs(at)
    reloadWeekTasks(true, at)
    void loadEvents(0, { force: true })
  }, [loadEvents, reloadWeekTasks])

  const handleRailSaved = useCallback(() => {
    forceReload()
  }, [forceReload])

  // P1a — 서버 프리페치 첫 페이지를 요청 캐시에 심은 뒤 loadEvents(0)를 부른다(CRM 홈과 같은
  // 규약). 프리페치가 없거나(null) 실패했으면 seedAdminRequestCache를 건너뛰고 그냥
  // 클라이언트 fetch로 떨어진다 — defaultActivityEventsUrl()과 이 화면의 기본 필터(스코프
  // work·필터 전체·기간 전체)가 정확히 같은 URL을 계산해야 캐시가 적중한다.
  const seedEvents = useCallback(
    (value: ListCrmCustomerEventsResult | null) => {
      if (value !== null) {
        seedAdminRequestCache(defaultActivityEventsUrl(), value, {
          ttlMs: CRM_CACHE_TTL_MS,
          staleWhileRevalidateMs: CRM_CACHE_SWR_MS,
          generatedAt: initialData?.events.generatedAt,
        })
      }
      void loadEvents(0)
    },
    [loadEvents, initialData?.events.generatedAt]
  )

  // 이번 주 요약(A5) — 현재 필터로 불러온 목록 기준. 페이지가 더 있으면 하한값으로 표기한다.
  const weekSummary = useMemo(
    () => (data ? summarizeActivityWeek(data.rows, { nowMs, weekStartsOn: 1 }) : null),
    [data, nowMs]
  )
  // A4 — 날짜 그룹(occurredAt 기준 KST 달력일). 병합("더 보기")도 같은 날짜면 자동으로 합쳐진다.
  const dayGroups = useMemo(() => (data ? groupEventsByKstDay(data.rows, nowMs) : []), [data, nowMs])
  const weekSummaryPartial = useMemo(
    () => Boolean(data && weekSummary && isActivityWeekSummaryPartial(data.rows, weekSummary, data.pagination.hasMore)),
    [data, weekSummary]
  )

  const handleFilterUnlinked = useCallback(() => {
    setFilterTarget((current) => (current === "unknown" ? "all" : "unknown"))
  }, [])

  // 기록 화면에는 360 드로어가 없다 — 할 일의 대상 고객으로 스코프된 타임라인(기존 딥링크)으로 연다.
  const handleOpenTask = useCallback(
    (_id: string, task: { targetId: string | null; targetType: string; targetLabel: string | null }) => {
      if (!task.targetId) return
      router.push(
        activityDeepLink({ targetId: task.targetId, targetType: task.targetType, targetLabel: task.targetLabel })
      )
    },
    [router]
  )

  const weekSummaryViewProps = {
    summary: weekSummary,
    partial: weekSummaryPartial,
    tasks: weekTasks.state,
    nowMs,
    onRetryTasks: () => reloadWeekTasks(true),
    onFilterUnlinked: handleFilterUnlinked,
    unlinkedFilterActive: filterTarget === "unknown",
    onOpenTask: handleOpenTask,
  }

  return (
    <div className="space-y-5">
      {/* P1a — 서버 프리페치 레인(openPrefetchLane)을 독립 Suspense 안에서 소비한다. 화면에는
          아무것도 그리지 않고, 첫 페이지가 오면 요청 캐시에 심은 뒤 loadEvents(0)를 부른다.
          프리페치가 없으면(null) RESOLVED_NULL_PROMISE가 즉시 resolve되어 지금까지와 같은
          시점에 클라이언트 fetch가 시작된다(CRM 홈 CrmHomeClient.tsx와 같은 패턴). */}
      <Suspense fallback={null}>
        <PrefetchSourceBridge
          promise={initialData?.events.promise ?? RESOLVED_NULL_PROMISE}
          onSettled={seedEvents}
        />
      </Suspense>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-[#111110]">기록</h1>
          <p className="mt-1 text-[13px] text-[#1a1a1a]/45">
            녹음·회의록·메모 → 고객 DB 운영 기록
          </p>
        </div>
        <button
          type="button"
          onClick={forceReload}
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

      {/* 좌: 컴포저+필터+타임라인(minmax(0,1fr), 2행 span) · 우: 이번 주 요약(1행) + 액션 레일(2행, 독립 스크롤, hideForm).
          모바일은 컴포저 → 필터 → 신선도 캡션 → 이번 주 요약(접힌 details) → 타임라인 → 레일 순 스택.
          요약 View 는 두 자리에 그리지만 할 일 fetch(useWeekOpenTasks)는 위에서 한 번만 한다. */}
      <section className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4 xl:col-start-1 xl:row-span-2 xl:row-start-1">
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

            {/* A4 칩 행 2줄 — 기간(세션 state, URL 미반영)과 분위기(기존 filterSentiment와 동기화).
                분위기는 칩 하나로 통일하고 아래 select 그리드에서는 뺐다(중복 컨트롤 금지). */}
            <div className="mb-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="기간 필터">
              {ACTIVITY_PERIOD_PRESETS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setPeriod(option.key)}
                  aria-pressed={period === option.key}
                  className={`inline-flex min-h-11 items-center justify-center rounded-full border px-3 text-[12px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734] sm:min-h-0 sm:h-8 ${
                    period === option.key
                      ? "border-[#084734]/25 bg-[#ECFDF5] text-[#084734]"
                      : "border-[#e8e8e4] bg-white text-[#615D59] hover:text-[#111110]"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="mb-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="분위기 필터">
              {SENTIMENT_FILTERS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setFilterSentiment(option.key)}
                  aria-pressed={filterSentiment === option.key}
                  className={`inline-flex min-h-11 items-center justify-center rounded-full border px-3 text-[12px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734] sm:min-h-0 sm:h-8 ${
                    filterSentiment === option.key
                      ? "border-[#084734]/25 bg-[#ECFDF5] text-[#084734]"
                      : "border-[#e8e8e4] bg-white text-[#615D59] hover:text-[#111110]"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(200px,1fr)_auto_auto] lg:items-center">
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

          {/* 신선도 캡션(P2) — 필터 바로 아래, 목록 위. 목록을 아직 못 받았으면 기준 시각이 없으므로 생략. */}
          {data || receivedAt !== null ? (
            <FreshnessCaption
              generatedAt={data?.generatedAt ?? null}
              receivedAt={receivedAt}
              refreshing={refreshing || revalidating}
              staleReason={staleReason}
              onRefresh={forceReload}
              className="px-1"
            />
          ) : null}

          {/* 모바일(<xl): 목록 위에 접힌 이번 주 요약. 데스크톱은 우측 열의 카드가 대신한다. */}
          <details className="rounded-2xl border border-[#e8e8e4] bg-white xl:hidden">
            <summary className="flex cursor-pointer select-none items-center justify-between gap-2 px-4 py-3 text-[13px] font-bold text-[#111110]">
              <span>이번 주 요약</span>
              <span className="text-[11px] font-semibold tabular-nums text-[#615D59]">
                {weekSummary ? `${weekSummary.weekLabel} · ${weekSummary.total.toLocaleString("ko-KR")}건` : "—"}
              </span>
            </summary>
            <div className="border-t border-[#e8e8e4] px-4 pb-4 pt-3">
              <ActivityWeekSummaryView {...weekSummaryViewProps} frame="plain" />
            </div>
          </details>

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

          <section className="space-y-4" aria-label="기록 목록">
            <ActivityDateGroups
              groups={dayGroups}
              renderRow={(event: CrmEventRecord) => <ActivityEventRow key={event.id} event={event} />}
            />

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

        <ActivityWeekSummaryView
          {...weekSummaryViewProps}
          frame="card"
          className="hidden xl:col-start-2 xl:row-start-1 xl:block"
        />

        <CrmActionRail
          hideForm
          hideRecent
          defaultTargetType={focusTargetType}
          defaultTargetId={focusTargetId || undefined}
          customerName={focusLabel || undefined}
          onActivitySaved={handleRailSaved}
          className="xl:col-start-2 xl:row-start-2"
        />
      </section>
    </div>
  )
}

export default function CrmActivityClient({ initialData }: { initialData?: CrmActivityInitialData | null } = {}) {
  return (
    <Suspense
      fallback={
        <div className="rounded-2xl border border-[#e8e8e4] bg-white p-8 text-center text-[13px] text-[#1a1a1a]/40">
          CRM 기록을 불러오는 중입니다...
        </div>
      }
    >
      <CrmActivityClientInner initialData={initialData} />
    </Suspense>
  )
}
