"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { AlertTriangle, CalendarClock, CheckCircle2, Clock3, ExternalLink, Filter, RefreshCw, XCircle } from "lucide-react"

import { adminFetchJsonCached, getCachedAdminJson } from "@/lib/admin-client"
import type { CrmPriorityBucket, CrmPriorityItem, CrmPriorityLane, CrmPrioritySource } from "@/lib/crm/priority"
import { buildOwnerSelectOptions, useCrmOwners } from "./useCrmOwners"

// 할 일은 이 목록에서 제외한다. 구매 전 리드와 구매 고객의 추가 기회가
// 운영성 할 일과 경쟁하면 매출 우선순위가 다시 흐려진다.
type SourceFilter = "customer" | Exclude<CrmPrioritySource, "task">
type BucketFilter = "all" | CrmPriorityBucket
type LaneFilter = CrmPriorityLane
type LeadContactType = "call" | "sms" | "kakao" | "email"
type LeadContactResult = "answered" | "no_answer" | "callback" | "meeting_set"
type LeadNextSchedule = "keep" | "tomorrow" | "clear"

interface LeadContactDraft {
  itemId: string
  type: LeadContactType
  result: LeadContactResult
  notes: string
  nextSchedule: LeadNextSchedule
}

interface CrmPriorityQueue {
  generatedAt: string
  sources: {
    leadsOk: boolean
    neoAccountsOk: boolean
    tasksOk: boolean
    warnings: string[]
  }
  summary: {
    total: number
    critical: number
    high: number
    leadCount: number
    neoAccountCount: number
    taskCount: number
    ownerCount: number
    bucketCounts: Record<CrmPriorityBucket, number>
    laneTotals: Record<CrmPriorityLane, number>
    laneCritical: number
    sourceTotals?: { lead: number; neoAccount: number; task: number }
    demo?: { total: number; matched: number; unmatched: number }
  }
  buckets: Array<{ bucket: CrmPriorityBucket; label: string; count: number }>
  lanes: Array<{ lane: CrmPriorityLane; label: string; count: number }>
  owners: Array<{ ownerName: string; count: number }>
  items: CrmPriorityItem[]
}

const SOURCE_FILTERS: Array<{ key: SourceFilter; label: string }> = [
  { key: "customer", label: "전체 기회" },
  { key: "lead", label: "구매 전 리드" },
  { key: "neo_account", label: "구매 고객" },
]

const LANE_FILTERS: Array<{ key: LaneFilter; label: string; description: string }> = [
  { key: "sales", label: "신규·추가 매출", description: "컨택·데모 등 새 매출 기회" },
  { key: "renewal", label: "연장", description: "만료 전후 연장 기회" },
  { key: "customer_care", label: "고객관리", description: "잔액·활성도·운영 신호" },
]

const FALLBACK_BUCKETS: Array<{ bucket: CrmPriorityBucket; label: string; count: number }> = [
  { bucket: "today", label: "오늘 처리", count: 0 },
  { bucket: "renewal", label: "연장 관리", count: 0 },
  { bucket: "watch", label: "관찰", count: 0 },
  { bucket: "stale_recovery", label: "장기 회복", count: 0 },
]

const QUEUE_TTL_MS = 90_000
// 홈 첫 화면에서 한 번에 그리는 항목 수. 받아오는 건 최대 12건이고, 나머지는
// "+N건 더 보기"로 펼친다 — 아침 화면이 스크롤 목록이 되지 않게 하는 상한.
const QUEUE_PREVIEW_COUNT = 5
const CURRENT_OWNER_VALUE = "__me"

function queueUrl(source: SourceFilter, owner: string, lane: LaneFilter, bucket: BucketFilter, limit: number) {
  // 응답 요약 스키마가 바뀌면 메모리 캐시의 이전 payload와 섞이지 않도록 버전을 올린다.
  const params = new URLSearchParams({ limit: String(limit), source, lane, v: "2" })
  if (owner) params.set("owner", owner)
  if (bucket !== "all") params.set("bucket", bucket)
  return `/api/admin/crm/home/priority-queue?${params.toString()}`
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function severityBorderClass(item: CrmPriorityItem) {
  if (item.severity === "critical") return "border-l-[#B85C33]"
  if (item.severity === "high") return "border-l-[#084734]"
  return "border-l-[#A39E98]"
}

function leadIdFromPriorityItem(item: CrmPriorityItem) {
  return item.source === "lead" && item.id.startsWith("lead:") ? item.id.slice("lead:".length) : null
}

function taskIdFromPriorityItem(item: CrmPriorityItem) {
  return item.source === "task" && item.id.startsWith("task:") ? item.id.slice("task:".length) : null
}

function tomorrowMorningIso() {
  const next = new Date()
  next.setDate(next.getDate() + 1)
  next.setHours(9, 0, 0, 0)
  return next.toISOString()
}

export default function CrmPriorityQueuePanel({
  refreshKey = 0,
  compact = false,
  embedded = false,
  previewCount = QUEUE_PREVIEW_COUNT,
}: {
  refreshKey?: number
  compact?: boolean
  embedded?: boolean
  /** 접힌 상태에서 그릴 항목 수. 나머지는 "+N건 더 보기"로 펼친다(추가 요청 없음). */
  previewCount?: number
}) {
  const [expanded, setExpanded] = useState(false)
  const [source, setSource] = useState<SourceFilter>("customer")
  const [lane, setLane] = useState<LaneFilter>("sales")
  const [bucket, setBucket] = useState<BucketFilter>("all")
  const [owner, setOwner] = useState("")
  const [data, setData] = useState<CrmPriorityQueue | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actingId, setActingId] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [leadContactDraft, setLeadContactDraft] = useState<LeadContactDraft | null>(null)
  const { owners: crmOwners, currentOwner, health: ownerHealth } = useCrmOwners()

  const url = useMemo(
    () => queueUrl(source, owner, lane, bucket, compact ? 4 : 12),
    [source, owner, lane, bucket, compact]
  )
  // 받아온 큐(최대 12건)에서 먼저 previewCount개만 그린다 — 펼침은 추가 요청 없이 같은 배열을 쓴다.
  const visibleItems = useMemo(
    () => (expanded ? (data?.items ?? []) : (data?.items ?? []).slice(0, previewCount)),
    [data, expanded, previewCount]
  )
  const hiddenItemCount = Math.max(0, (data?.items.length ?? 0) - visibleItems.length)
  const unloadedItemCount = Math.max(0, (data?.summary.total ?? 0) - (data?.items.length ?? 0))
  const bucketOptions = data?.buckets.length ? data.buckets : FALLBACK_BUCKETS
  const laneCopy = LANE_FILTERS.find((filter) => filter.key === lane) ?? LANE_FILTERS[0]
  const ownerOptions = useMemo(() => buildOwnerSelectOptions(data?.owners, crmOwners), [crmOwners, data?.owners])

  // 필터를 연타하면 요청이 겹친다. 늦게 끝난 이전 요청이 최신 화면을 덮어쓰면
  // 제목(레인)과 목록이 어긋난 채로 남으므로, 마지막 요청만 상태에 반영한다.
  const requestSeq = useRef(0)

  const load = useCallback(
    async (options?: { force?: boolean }) => {
      const seq = ++requestSeq.current
      const isLatest = () => requestSeq.current === seq

      const cached = getCachedAdminJson<CrmPriorityQueue>(url, { cacheKey: url })
      if (cached && !options?.force) setData(cached)
      // 레인·소스·시점 필터가 바뀌어 새 URL 캐시가 없으면 이전 큐를 남기지 않는다.
      // 제목은 새 레인인데 목록은 직전 레인인 짧은 상태 불일치를 막는다.
      else if (!options?.force) setData(null)

      setLoading(!cached)
      setRefreshing(Boolean(options?.force))
      setError(null)
      try {
        const next = await adminFetchJsonCached<CrmPriorityQueue>(
          options?.force ? `${url}&force=1` : url,
          undefined,
          {
            cacheKey: url,
            ttlMs: QUEUE_TTL_MS,
            staleWhileRevalidateMs: 5 * 60_000,
            force: options?.force,
          }
        )
        if (!isLatest()) return
        setData(next)
      } catch (err) {
        if (!isLatest()) return
        setError(err instanceof Error ? err.message : "우선순위를 불러오지 못했습니다.")
      } finally {
        if (isLatest()) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    },
    [url]
  )

  // 홈 새로고침(refreshKey 증가)은 "지금 다시 세어 달라"는 뜻이다. force 없이 load()만
  // 다시 부르면 90초 TTL 캐시가 그대로 돌아와 화면이 아무것도 바뀌지 않는다.
  const lastRefreshKey = useRef(refreshKey)
  useEffect(() => {
    const forced = lastRefreshKey.current !== refreshKey
    lastRefreshKey.current = refreshKey
    void load(forced ? { force: true } : undefined)
  }, [load, refreshKey])

  const handleLeadAction = useCallback(
    async (item: CrmPriorityItem, action: "snooze" | "close") => {
      const leadId = leadIdFromPriorityItem(item)
      if (!leadId) return
      if (action === "close" && !window.confirm(`${item.title} 리드를 종료 처리할까요?\n우선순위 큐에서는 제외됩니다.`)) return

      setActingId(`${item.id}:${action}`)
      setActionMessage(null)
      setError(null)
      try {
        if (action === "close") {
          await adminFetchJsonCached<{ lead: unknown }>(`/api/admin/leads/${encodeURIComponent(leadId)}`, {
            method: "PATCH",
            body: JSON.stringify({ status: "closed", follow_up_at: null }),
          })
          setActionMessage("리드를 종료 처리해 우선순위 큐에서 제외했습니다.")
          await load({ force: true })
          return
        }
        await adminFetchJsonCached<{ lead: unknown }>(`/api/admin/leads/${encodeURIComponent(leadId)}`, {
          method: "PATCH",
          // 미루기는 실제 연락 결과가 아니다. 상태와 연락 로그는 건드리지 않는다.
          body: JSON.stringify({ follow_up_at: tomorrowMorningIso() }),
        })
        setActionMessage("연락 결과를 만들지 않고 내일 오전 9시 팔로업으로 옮겼습니다.")
        await load({ force: true })
      } catch (err) {
        setError(err instanceof Error ? err.message : "리드 처리에 실패했습니다.")
      } finally {
        setActingId(null)
      }
    },
    [load]
  )

  const saveLeadContactResult = useCallback(
    async (item: CrmPriorityItem) => {
      const leadId = leadIdFromPriorityItem(item)
      const draft = leadContactDraft
      if (!leadId || !draft || draft.itemId !== item.id) return

      setActingId(`${item.id}:contact`)
      setActionMessage(null)
      setError(null)
      // 기록 저장과 상태 갱신은 별개의 두 요청이다. 뒤쪽이 실패했을 때 "저장 실패"라고만 하면
      // 이미 남은 연락 기록을 운영자가 다시 입력해 중복이 생긴다 — 어디까지 됐는지 말한다.
      let logSaved = false
      try {
        await adminFetchJsonCached<{ log: unknown }>(`/api/admin/leads/${encodeURIComponent(leadId)}/logs`, {
          method: "POST",
          body: JSON.stringify({
            type: draft.type,
            result: draft.result,
            notes: draft.notes.trim() || undefined,
          }),
        })
        logSaved = true

        const patch: { status: "contacted"; follow_up_at?: string | null } = { status: "contacted" }
        if (draft.nextSchedule === "tomorrow") patch.follow_up_at = tomorrowMorningIso()
        if (draft.nextSchedule === "clear") patch.follow_up_at = null
        await adminFetchJsonCached<{ lead: unknown }>(`/api/admin/leads/${encodeURIComponent(leadId)}`, {
          method: "PATCH",
          body: JSON.stringify(patch),
        })

        setLeadContactDraft(null)
        setActionMessage("선택한 채널·결과로 연락 기록을 저장했습니다.")
        await load({ force: true })
      } catch (err) {
        const detail = err instanceof Error ? err.message : "알 수 없는 오류"
        if (logSaved) {
          // 기록은 남았다 — 폼을 닫아 재입력(중복 기록)을 막고 남은 작업만 알린다.
          setLeadContactDraft(null)
          setError(`연락 기록은 저장됐지만 상태·다음 일정 반영에 실패했습니다(${detail}). 리드 보드에서 상태를 확인하세요.`)
          await load({ force: true })
        } else {
          setError(`연락 기록을 저장하지 못했습니다(${detail}). 입력은 그대로 두었으니 다시 시도하세요.`)
        }
      } finally {
        setActingId(null)
      }
    },
    [leadContactDraft, load]
  )

  const handleTaskAction = useCallback(
    async (item: CrmPriorityItem, action: "done" | "tomorrow") => {
      const taskId = taskIdFromPriorityItem(item)
      if (!taskId) return

      setActingId(`${item.id}:${action}`)
      setActionMessage(null)
      setError(null)
      try {
        await adminFetchJsonCached<{ task: unknown }>(`/api/admin/crm/tasks/${encodeURIComponent(taskId)}`, {
          method: "PATCH",
          body: JSON.stringify(
            action === "done"
              ? { action: "complete", outcome: "우선순위 큐에서 완료 처리" }
              : { action: "snooze" }
          ),
        })
        setActionMessage(action === "done" ? "할 일을 완료 처리했습니다." : "할 일을 내일 오전으로 미뤘습니다.")
        await load({ force: true })
      } catch (err) {
        setError(err instanceof Error ? err.message : "할 일 처리에 실패했습니다.")
      } finally {
        setActingId(null)
      }
    },
    [load]
  )

  return (
    <section className={embedded ? "" : `rounded-xl border border-[#e8e8e4] bg-white p-4 ${compact ? "" : "mb-4"}`}>
      <div className={`mb-3 flex flex-col gap-3 ${compact || embedded ? "" : "2xl:flex-row 2xl:items-center 2xl:justify-between"}`}>
        {embedded ? null : (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1a1a1a]/30">
              ClassIn Operation
            </p>
            <h2 className="mt-1 text-[18px] font-bold text-[#111110]">{laneCopy.label} 우선순위</h2>
            <p className="mt-0.5 text-[11px] leading-relaxed text-[#615D59]">
              {laneCopy.description} · 시점 범주 우선, 같은 범주에서는 점수 높은 순
              {/* 캐시로 뜨는 목록이라 "지금 상태"인지 아닌지를 화면에서 알 수 있어야 한다. */}
              {data?.generatedAt ? ` · 기준 ${formatDate(data.generatedAt)}` : ""}
            </p>
          </div>
        )}
        <div className={`flex flex-col gap-2 ${compact || embedded ? "" : "sm:flex-row sm:items-center"}`}>
          <div className="inline-flex border-b border-[#e8e8e4]" aria-label="기회 유형 필터">
            {SOURCE_FILTERS.map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => setSource(filter.key)}
                aria-pressed={source === filter.key}
                className={`h-9 whitespace-nowrap border-b-2 px-3 text-[12px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734] ${
                  source === filter.key
                    ? "border-[#111110] text-[#111110]"
                    : "border-transparent text-[#1a1a1a]/45 hover:text-[#111110]"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <label className="flex h-9 items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[12px] text-[#1a1a1a]/50">
            <Filter className="h-3.5 w-3.5" />
            <select
              value={owner}
              onChange={(event) => setOwner(event.target.value)}
              className="h-full min-w-[112px] bg-transparent text-[12px] font-semibold text-[#111110] outline-none"
              aria-label="담당자 필터"
            >
              <option value="">담당 전체</option>
              {currentOwner ? (
                <option value={CURRENT_OWNER_VALUE}>내 담당 · {currentOwner.displayName}</option>
              ) : null}
              {ownerOptions.map((option) => (
                <option key={option.ownerName} value={option.ownerName}>
                  {option.label}
                  {option.teamRoleLabel ? ` · ${option.teamRoleLabel}` : ""}
                  {option.count > 0 ? ` (${option.count})` : ""}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void load({ force: true })}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2]"
            disabled={refreshing}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            새로고침
          </button>
        </div>
      </div>

      {data && !compact ? (
        // 현황판 — 선택한 레인의 오늘 처리량과 세 레인 전체 규모를 함께 보여준다.
        <div className="mb-4 grid grid-cols-2 border-y border-[#e8e8e4] sm:grid-cols-[minmax(0,1.15fr)_repeat(3,minmax(0,1fr))]">
          <div className="border-b border-[#e8e8e4] py-3 pr-3 sm:border-b-0">
            <p className="text-[11px] font-semibold text-[#1a1a1a]/35">오늘 처리</p>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-[38px] font-extrabold leading-none tracking-[-0.045em] tabular-nums text-[#111110]">
                {(data.summary.bucketCounts?.today ?? 0).toLocaleString("ko-KR")}
              </span>
              <span className="text-[11px] font-medium text-[#615D59]">
                / 후보 {(data.summary.laneTotals?.[lane] ?? 0).toLocaleString("ko-KR")}
              </span>
            </div>
            {data.summary.laneCritical > 0 ? (
              <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-[#B85C33]">
                <AlertTriangle className="h-3 w-3" />
                긴급 후보 {data.summary.laneCritical.toLocaleString("ko-KR")}
              </p>
            ) : (
              <p className="mt-1.5 text-[11px] font-medium text-[#1a1a1a]/35">긴급 없음</p>
            )}
          </div>
          {LANE_FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => {
                setLane(filter.key)
                setBucket("all")
              }}
              aria-label={`${filter.label} ${(data.summary.laneTotals?.[filter.key] ?? 0).toLocaleString("ko-KR")}건`}
              aria-pressed={lane === filter.key}
              className={`relative border-b border-l border-[#e8e8e4] px-3 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734] sm:border-b-0 ${
                lane === filter.key
                  ? "after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-[#084734]"
                  : "hover:text-[#084734]"
              }`}
            >
              <p className={`text-[11px] font-semibold ${lane === filter.key ? "text-[#084734]" : "text-[#615D59]"}`}>
                {filter.label}
              </p>
              <p className={`mt-1 text-[28px] font-extrabold leading-none tracking-[-0.035em] tabular-nums ${lane === filter.key ? "text-[#084734]" : "text-[#111110]"}`}>
                {(data.summary.laneTotals?.[filter.key] ?? 0).toLocaleString("ko-KR")}
              </p>
            </button>
          ))}
        </div>
      ) : null}

      {/*
        쇼룸 캘린더 일정 중 고객을 못 붙인 건 — 제목이 자유 텍스트라 전수 매칭이 안 된다.
        조용히 버리면 "데모가 없다"로 오인되므로 건수를 그대로 드러낸다.
      */}
      {data?.summary.demo && data.summary.demo.unmatched > 0 ? (
        <div className="mb-3 flex items-start gap-2 border-l-2 border-[#A39E98] px-3 py-2 text-[12px] text-[#1a1a1a]/55">
          <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#1a1a1a]/35" />
          <span>
            쇼룸 캘린더 데모 {data.summary.demo.total}건 중 {data.summary.demo.unmatched}건은 고객을
            찾지 못해 우선순위에 반영되지 않았습니다 — 캘린더 제목에 고객명이 없거나 표기가 다릅니다.
          </span>
        </div>
      ) : null}

      {ownerHealth?.ok === false && ownerHealth.message ? (
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-[#F6D5C5] bg-[#FEF3EE] px-3 py-2 text-[12px] text-[#B85C33]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{ownerHealth.message}</span>
        </div>
      ) : null}

      {compact || embedded ? (
        <div className="mb-2 flex flex-wrap border-b border-[#e8e8e4]" aria-label="업무 목적 필터">
          {LANE_FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => {
                setLane(filter.key)
                setBucket("all")
              }}
              aria-pressed={lane === filter.key}
              className={`h-9 border-b-2 px-3 text-[12px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734] ${
                lane === filter.key
                  ? "border-[#084734] text-[#084734]"
                  : "border-transparent text-[#1a1a1a]/45 hover:text-[#111110]"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center gap-x-4 border-b border-[#e8e8e4]" aria-label="처리 시점 필터">
        <span className="h-9 py-2.5 text-[11px] font-semibold text-[#1a1a1a]/35">처리 시점</span>
        <button
          type="button"
          onClick={() => setBucket("all")}
          aria-pressed={bucket === "all"}
          className={`h-9 border-b-2 text-[12px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734] ${
            bucket === "all"
              ? "border-[#084734] text-[#084734]"
              : "border-transparent text-[#1a1a1a]/45 hover:text-[#111110]"
          }`}
        >
          전체
        </button>
        {bucketOptions.map((option) => (
          <button
            key={option.bucket}
            type="button"
            onClick={() => setBucket(option.bucket)}
            aria-pressed={bucket === option.bucket}
            className={`inline-flex h-9 items-center gap-1.5 border-b-2 text-[12px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734] ${
              bucket === option.bucket
                ? "border-[#084734] text-[#084734]"
                : "border-transparent text-[#1a1a1a]/45 hover:text-[#111110]"
            }`}
          >
            <span>{option.label}</span>
            <span className={bucket === option.bucket ? "text-[#084734]/65" : "text-[#1a1a1a]/30"}>
              {option.count.toLocaleString("ko-KR")}
            </span>
          </button>
        ))}
      </div>

      {error ? (
        <div role="alert" className="mb-3 rounded-xl border border-[#F6D5C5] bg-[#FEF3EE] px-3 py-2 text-[12px] font-medium text-[#B85C33]">
          {error}
        </div>
      ) : null}

      {actionMessage ? (
        <div role="status" aria-live="polite" className="mb-3 rounded-xl border border-[#D7EBDD] bg-[#ECFDF5] px-3 py-2 text-[12px] font-medium text-[#084734]">
          {actionMessage}
        </div>
      ) : null}

      {data?.sources.warnings.length ? (
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-[#F6D5C5] bg-[#FEF3EE] px-3 py-2 text-[12px] text-[#B85C33]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{data.sources.warnings.join(" ")}</span>
        </div>
      ) : null}

      <div className="overflow-hidden border-y border-[#f0f0ec]">
        {loading && !data ? (
          <div className="p-6 text-center text-[13px] text-[#1a1a1a]/40">우선순위를 계산 중입니다...</div>
        ) : data && data.items.length > 0 ? (
          <div className="divide-y divide-[#f0f0ec]">
            {visibleItems.map((item) =>
              compact ? (
                // 사이드바 컴팩트: 이름을 먼저 읽고 상태·권장 행동은 보조 메타로 확인한다.
                <div key={item.id} className={`border-l-2 p-2.5 transition-colors hover:bg-[#fafaf8] ${severityBorderClass(item)}`}>
                  <Link href={item.href} className="group flex items-center gap-1">
                    <span className="truncate text-[13px] font-bold text-[#111110]">{item.title}</span>
                    <ExternalLink className="h-3 w-3 shrink-0 text-[#1a1a1a]/25 group-hover:text-[#111110]" />
                  </Link>
                  <p className="mt-0.5 truncate text-[11px] text-[#1a1a1a]/45">
                    {item.reason}
                    {item.ownerName ? ` · ${item.ownerName}` : ""}
                    {` · ${formatDate(item.dueAt ?? item.updatedAt)}`}
                  </p>
                  <div className="mt-1 flex items-center gap-2 text-[10px] font-semibold">
                    <span className="text-[#084734]">{item.bucketLabel}</span>
                    <span className="text-[#1a1a1a]/35">
                      {item.actionLabel} · {item.score}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-1.5">
                    {item.source === "task" ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void handleTaskAction(item, "done")}
                          disabled={actingId === `${item.id}:done` || actingId === `${item.id}:tomorrow`}
                          className="inline-flex h-6 items-center gap-1 rounded-md border border-[#e8e8e4] bg-white px-2 text-[10px] font-semibold text-[#084734] transition-colors hover:border-[#084734] disabled:opacity-50"
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          완료
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleTaskAction(item, "tomorrow")}
                          disabled={actingId === `${item.id}:done` || actingId === `${item.id}:tomorrow`}
                          className="inline-flex h-6 items-center gap-1 rounded-md border border-[#e8e8e4] bg-white px-2 text-[10px] font-semibold text-[#1a1a1a]/60 transition-colors hover:bg-[#f5f5f2] disabled:opacity-50"
                        >
                          <Clock3 className="h-3 w-3" />
                          내일
                        </button>
                      </>
                    ) : null}
                    <Link
                      href={item.href}
                      className="ml-auto inline-flex h-6 items-center gap-1 rounded-md border border-[#e8e8e4] bg-white px-2 text-[10px] font-semibold text-[#1a1a1a]/55 transition-colors hover:bg-[#f5f5f2] hover:text-[#111110]"
                    >
                      열기
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              ) : (
                <div
                  key={item.id}
                  className={`grid gap-3 border-l-2 p-3 transition-colors hover:bg-[#fafaf8] lg:grid-cols-[minmax(0,1fr)_120px_112px] 2xl:grid-cols-[minmax(0,1fr)_120px_112px_160px] ${severityBorderClass(item)}`}
                >
                  <div className="min-w-0">
                    <Link href={item.href} className="group inline-flex max-w-full items-center gap-1.5">
                      <span className="truncate text-[14px] font-bold text-[#111110]">{item.title}</span>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-[#1a1a1a]/25 group-hover:text-[#111110]" />
                    </Link>
                    <p className="mt-0.5 truncate text-[12px] text-[#1a1a1a]/45">{item.subtitle ?? item.reason}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium">
                      <span className="text-[#1a1a1a]/35">{item.statusLabel}</span>
                      <span className="text-[#084734]">{item.bucketLabel}</span>
                      <span className="text-[#1a1a1a]/30">{item.actionLabel}</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-[#1a1a1a]/35">근거</p>
                    <p className="mt-1 text-[12px] font-medium text-[#111110]">{item.reason}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-[#1a1a1a]/35">담당·기준일</p>
                    <p className="mt-1 truncate text-[12px] font-medium text-[#111110]">{item.ownerName ?? "미배정"}</p>
                    <p className="text-[11px] text-[#1a1a1a]/35">{formatDate(item.dueAt ?? item.updatedAt)}</p>
                  </div>
                  <div className="flex flex-col gap-2 lg:col-span-3 lg:flex-row lg:items-center lg:justify-between 2xl:col-span-1 2xl:flex-col 2xl:items-end 2xl:justify-start">
                    <div className="flex items-center justify-between gap-2 2xl:justify-end">
                      <span className="text-[10px] font-semibold text-[#615D59]" aria-label={`우선순위 점수 ${item.score}점`}>
                        우선순위
                        <strong className="ml-1 text-[14px] tabular-nums text-[#111110]">{item.score}</strong>
                      </span>
                      <Link
                        href={item.href}
                        className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[11px] font-semibold text-[#1a1a1a]/55 transition-colors hover:bg-[#f5f5f2] hover:text-[#111110]"
                      >
                        열기
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </div>
                    {item.source === "lead" ? (
                      <div className="flex flex-wrap gap-1.5 lg:justify-end">
                        <button
                          type="button"
                          onClick={() =>
                            setLeadContactDraft((current) =>
                              current?.itemId === item.id
                                ? null
                                : {
                                    itemId: item.id,
                                    type: "call",
                                    result: "answered",
                                    notes: "",
                                    nextSchedule: "keep",
                                  }
                            )
                          }
                          aria-expanded={leadContactDraft?.itemId === item.id}
                          disabled={actingId?.startsWith(`${item.id}:`) === true}
                          className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[11px] font-semibold text-[#084734] transition-colors hover:border-[#084734] disabled:opacity-50"
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          연락 결과
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleLeadAction(item, "snooze")}
                          disabled={actingId?.startsWith(`${item.id}:`) === true}
                          className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[11px] font-semibold text-[#1a1a1a]/60 transition-colors hover:bg-[#f5f5f2] hover:text-[#111110] disabled:opacity-50"
                        >
                          <Clock3 className="h-3 w-3" />
                          내일로
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleLeadAction(item, "close")}
                          disabled={actingId?.startsWith(`${item.id}:`) === true}
                          className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[11px] font-semibold text-[#1a1a1a]/45 transition-colors hover:border-[#B85C33] hover:text-[#B85C33] disabled:opacity-50"
                        >
                          <XCircle className="h-3 w-3" />
                          종료
                        </button>
                      </div>
                    ) : item.source === "task" ? (
                      <div className="flex flex-wrap gap-1.5 lg:justify-end">
                        <button
                          type="button"
                          onClick={() => void handleTaskAction(item, "done")}
                          disabled={actingId === `${item.id}:done` || actingId === `${item.id}:tomorrow`}
                          className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[11px] font-semibold text-[#084734] transition-colors hover:border-[#084734] disabled:opacity-50"
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          완료
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleTaskAction(item, "tomorrow")}
                          disabled={actingId === `${item.id}:done` || actingId === `${item.id}:tomorrow`}
                          className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[11px] font-semibold text-[#1a1a1a]/60 transition-colors hover:bg-[#f5f5f2] hover:text-[#111110] disabled:opacity-50"
                        >
                          <Clock3 className="h-3 w-3" />
                          내일로
                        </button>
                      </div>
                    ) : null}
                  </div>
                  {item.source === "lead" && leadContactDraft?.itemId === item.id ? (
                    <div className="border-l-2 border-[#084734] bg-white p-3 lg:col-span-3 2xl:col-span-4">
                      <div className="grid gap-2 lg:grid-cols-[140px_160px_minmax(180px,1fr)_170px_auto] lg:items-end">
                        <label className="grid gap-1 text-[11px] font-semibold text-[#1a1a1a]/55">
                          연락 채널
                          <select
                            value={leadContactDraft.type}
                            onChange={(event) =>
                              setLeadContactDraft((current) =>
                                current ? { ...current, type: event.target.value as LeadContactType } : current
                              )
                            }
                            className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[12px] font-semibold text-[#111110] outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
                          >
                            <option value="call">콜</option>
                            <option value="sms">문자</option>
                            <option value="kakao">카카오톡</option>
                            <option value="email">이메일</option>
                          </select>
                        </label>
                        <label className="grid gap-1 text-[11px] font-semibold text-[#1a1a1a]/55">
                          실제 결과
                          <select
                            value={leadContactDraft.result}
                            onChange={(event) =>
                              setLeadContactDraft((current) =>
                                current ? { ...current, result: event.target.value as LeadContactResult } : current
                              )
                            }
                            className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[12px] font-semibold text-[#111110] outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
                          >
                            <option value="answered">연결됨</option>
                            <option value="no_answer">부재</option>
                            <option value="callback">콜백 요청</option>
                            <option value="meeting_set">미팅 확정</option>
                          </select>
                        </label>
                        <label className="grid gap-1 text-[11px] font-semibold text-[#1a1a1a]/55">
                          한 줄 메모
                          <input
                            value={leadContactDraft.notes}
                            onChange={(event) =>
                              setLeadContactDraft((current) =>
                                current ? { ...current, notes: event.target.value } : current
                              )
                            }
                            placeholder="확인한 사실만 기록"
                            className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] text-[#111110] outline-none placeholder:text-[#1a1a1a]/30 focus-visible:ring-2 focus-visible:ring-[#084734]"
                          />
                        </label>
                        <label className="grid gap-1 text-[11px] font-semibold text-[#1a1a1a]/55">
                          다음 일정
                          <select
                            value={leadContactDraft.nextSchedule}
                            onChange={(event) =>
                              setLeadContactDraft((current) =>
                                current ? { ...current, nextSchedule: event.target.value as LeadNextSchedule } : current
                              )
                            }
                            className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[12px] font-semibold text-[#111110] outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
                          >
                            <option value="keep">기존 일정 유지</option>
                            <option value="tomorrow">내일 오전 9시</option>
                            <option value="clear">일정 비우기</option>
                          </select>
                        </label>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setLeadContactDraft(null)}
                            disabled={actingId === `${item.id}:contact`}
                            className="h-9 rounded-lg px-3 text-[12px] font-semibold text-[#1a1a1a]/55 hover:text-[#111110] disabled:opacity-50"
                          >
                            취소
                          </button>
                          <button
                            type="button"
                            onClick={() => void saveLeadContactResult(item)}
                            disabled={actingId === `${item.id}:contact`}
                            className="h-9 rounded-lg bg-[#084734] px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                          >
                            {actingId === `${item.id}:contact` ? "저장 중" : "결과 저장"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            )}
            {data.items.length > previewCount ? (
              <button
                type="button"
                onClick={() => setExpanded((value) => !value)}
                className="w-full bg-white py-2 text-[12px] font-semibold text-[#1a1a1a]/55 transition-colors hover:bg-[#fafaf8] hover:text-[#111110]"
              >
                {expanded
                  ? `접기 · 상위 ${previewCount}건만`
                  : `+${hiddenItemCount}건 펼치기 · 전체 후보 ${data.summary.total.toLocaleString("ko-KR")}건`}
              </button>
            ) : null}
            {expanded && unloadedItemCount > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-2 bg-[#fafaf8] px-3 py-2 text-[11px] text-[#1a1a1a]/50">
                <span>상위 {data.items.length}건만 표시 중 · 나머지 {unloadedItemCount.toLocaleString("ko-KR")}건</span>
                <Link
                  href={source === "neo_account" ? "/admin/crm/customers/unified?view=upsell" : "/admin/crm/customers/leads"}
                  className="font-semibold text-[#084734] underline-offset-2 hover:underline"
                >
                  전체 목록에서 계속 보기
                </Link>
              </div>
            ) : null}
          </div>
        ) : !data ? (
          // 실패와 "할 일 없음"은 다른 상태다 — 못 불러온 것을 "없다"로 말하지 않는다.
          <div className="p-6 text-center text-[13px] text-[#1a1a1a]/40">
            우선순위를 불러오지 못했습니다. 위 새로고침으로 다시 시도하세요.
          </div>
        ) : (
          <PriorityQueueEmptyState
            laneLabel={laneCopy.label}
            lane={lane}
            laneTotals={data.summary.laneTotals}
            bucket={bucket}
            bucketLabel={bucketOptions.find((option) => option.bucket === bucket)?.label ?? null}
            bucketTotal={Object.values(data.summary.bucketCounts ?? {}).reduce((sum, count) => sum + count, 0)}
            ownerFiltered={owner !== ""}
            onClearBucket={() => setBucket("all")}
            onClearOwner={() => setOwner("")}
            onSelectLane={(next) => {
              setLane(next)
              setBucket("all")
            }}
          />
        )}
      </div>

      {/*
        할 일은 이 큐에서 의도적으로 뺐다(매출 기회와 경쟁시키지 않기 위해). 그런데 건수를
        아무 데도 안 보여주면 "할 일이 없다"로 읽힌다 — 규모와 갈 곳을 한 줄로 남긴다.
      */}
      {(data?.summary.sourceTotals?.task ?? 0) > 0 ? (
        <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-[11px] text-[#1a1a1a]/45">
          <span>
            이 목록에는 할 일이 빠져 있습니다 · 활성 할 일{" "}
            <b className="font-semibold text-[#111110]">
              {(data?.summary.sourceTotals?.task ?? 0).toLocaleString("ko-KR")}건
            </b>
          </span>
          <Link href="/admin/crm/activity" className="font-semibold text-[#084734] underline-offset-2 hover:underline">
            할 일에서 보기
          </Link>
        </p>
      ) : null}
    </section>
  )
}

/**
 * 빈 목록은 원인이 셋이다 — 시점 필터, 담당자 필터, 정말 없음. 셋을 구분하지 않으면
 * 운영자가 "왜 비었지"를 필터를 하나씩 되돌리며 알아내야 한다. 원인과 되돌릴 버튼을 같이 준다.
 */
function PriorityQueueEmptyState({
  laneLabel,
  lane,
  laneTotals,
  bucket,
  bucketLabel,
  bucketTotal,
  ownerFiltered,
  onClearBucket,
  onClearOwner,
  onSelectLane,
}: {
  laneLabel: string
  lane: LaneFilter
  laneTotals: Record<CrmPriorityLane, number>
  bucket: BucketFilter
  bucketLabel: string | null
  bucketTotal: number
  ownerFiltered: boolean
  onClearBucket: () => void
  onClearOwner: () => void
  onSelectLane: (lane: LaneFilter) => void
}) {
  const otherLanes = LANE_FILTERS.filter((filter) => filter.key !== lane && (laneTotals?.[filter.key] ?? 0) > 0)
  const bucketFiltered = bucket !== "all"
  const resolvedCause = bucketFiltered && bucketTotal > 0 ? "bucket" : ownerFiltered ? "owner" : "none"

  return (
    <div className="px-4 py-6 text-center">
      <p className="text-[13px] font-semibold text-[#111110]">
        {resolvedCause === "bucket"
          ? `‘${bucketLabel ?? "선택한 시점"}’에 해당하는 건이 없습니다`
          : resolvedCause === "owner"
            ? `선택한 담당자의 ${laneLabel} 건이 없습니다`
            : `${laneLabel} 레인은 지금 비어 있습니다`}
      </p>
      <p className="mt-1 text-[12px] text-[#1a1a1a]/45">
        {resolvedCause === "bucket"
          ? `시점 필터를 풀면 이 레인에 ${bucketTotal.toLocaleString("ko-KR")}건이 있습니다.`
          : resolvedCause === "owner"
            ? "담당 전체로 넓히면 다른 담당자의 건이 보일 수 있습니다."
            : "처리할 후보가 없다는 뜻입니다 — 데이터 누락이 아닙니다."}
      </p>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
        {resolvedCause === "bucket" ? (
          <button
            type="button"
            onClick={onClearBucket}
            className="inline-flex h-8 items-center rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2]"
          >
            시점 필터 해제
          </button>
        ) : null}
        {ownerFiltered ? (
          <button
            type="button"
            onClick={onClearOwner}
            className="inline-flex h-8 items-center rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2]"
          >
            담당 전체로 보기
          </button>
        ) : null}
        {otherLanes.map((filter) => (
          <button
            key={filter.key}
            type="button"
            onClick={() => onSelectLane(filter.key)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2]"
          >
            {filter.label}
            <span className="tabular-nums text-[#084734]">{laneTotals[filter.key].toLocaleString("ko-KR")}</span>
          </button>
        ))}
        <Link
          href="/admin/crm/customers/leads"
          className="inline-flex h-8 items-center rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#1a1a1a]/60 transition-colors hover:bg-[#f5f5f2] hover:text-[#111110]"
        >
          리드 보드 열기
        </Link>
      </div>
    </div>
  )
}
