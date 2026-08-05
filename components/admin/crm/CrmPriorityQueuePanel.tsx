"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { AlertTriangle, Building2, CalendarClock, CheckCircle2, Clock3, ExternalLink, Filter, ListChecks, PhoneCall, RefreshCw } from "lucide-react"

import { adminFetchJsonCached, getCachedAdminJson } from "@/lib/admin-client"
import type { CrmPriorityBucket, CrmPriorityItem, CrmPrioritySource } from "@/lib/crm/priority"
import { buildOwnerSelectOptions, useCrmOwners } from "./useCrmOwners"

// 할 일은 이 목록에서 빠지고 상단 현황판에 건수로만 남는다("고객 운영 우선순위"라는
// 이름값 — 고객과 할 일이 한 목록에서 경쟁하면 상위 5건이 할 일로 쏠린다).
type SourceFilter = "customer" | Exclude<CrmPrioritySource, "task">
type BucketFilter = "all" | CrmPriorityBucket

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
    sourceTotals?: { lead: number; neoAccount: number; task: number }
    demo?: { total: number; matched: number; unmatched: number }
  }
  buckets: Array<{ bucket: CrmPriorityBucket; label: string; count: number }>
  owners: Array<{ ownerName: string; count: number }>
  items: CrmPriorityItem[]
}

const SOURCE_FILTERS: Array<{ key: SourceFilter; label: string }> = [
  { key: "customer", label: "전체" },
  { key: "lead", label: "리드" },
  { key: "neo_account", label: "ClassIn 고객" },
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

function queueUrl(source: SourceFilter, owner: string, bucket: BucketFilter, limit: number) {
  const params = new URLSearchParams({ limit: String(limit), source })
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

function severityClass(item: CrmPriorityItem) {
  if (item.severity === "critical") return "border-[#F6D5C5] bg-[#FEF3EE] text-[#B85C33]"
  if (item.severity === "high") return "border-[#D7EBDD] bg-[#ECFDF5] text-[#084734]"
  return "border-[#e8e8e4] bg-[#fafaf8] text-[#1a1a1a]/55"
}

function sourceIcon(source: CrmPrioritySource) {
  if (source === "task") return <ListChecks className="h-3.5 w-3.5" />
  return source === "lead" ? <PhoneCall className="h-3.5 w-3.5" /> : <Building2 className="h-3.5 w-3.5" />
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
  const [bucket, setBucket] = useState<BucketFilter>("today")
  const [owner, setOwner] = useState("")
  const [data, setData] = useState<CrmPriorityQueue | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actingId, setActingId] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const { owners: crmOwners, currentOwner, health: ownerHealth } = useCrmOwners()

  const url = useMemo(() => queueUrl(source, owner, bucket, compact ? 4 : 12), [source, owner, bucket, compact])
  // 받아온 큐(최대 12건)에서 먼저 previewCount개만 그린다 — 펼침은 추가 요청 없이 같은 배열을 쓴다.
  const visibleItems = useMemo(
    () => (expanded ? (data?.items ?? []) : (data?.items ?? []).slice(0, previewCount)),
    [data, expanded, previewCount]
  )
  const hiddenItemCount = Math.max(0, (data?.items.length ?? 0) - visibleItems.length)
  const bucketOptions = data?.buckets.length ? data.buckets : FALLBACK_BUCKETS
  const ownerOptions = useMemo(() => buildOwnerSelectOptions(data?.owners, crmOwners), [crmOwners, data?.owners])

  const load = useCallback(
    async (options?: { force?: boolean }) => {
      const cached = getCachedAdminJson<CrmPriorityQueue>(url, { cacheKey: url })
      if (cached && !options?.force) setData(cached)

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
        setData(next)
      } catch (err) {
        setError(err instanceof Error ? err.message : "우선순위를 불러오지 못했습니다.")
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [url]
  )

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  const handleLeadAction = useCallback(
    async (item: CrmPriorityItem, action: "done" | "tomorrow") => {
      const leadId = leadIdFromPriorityItem(item)
      if (!leadId) return

      setActingId(`${item.id}:${action}`)
      setActionMessage(null)
      setError(null)
      try {
        const followUpAt = action === "tomorrow" ? tomorrowMorningIso() : null
        await adminFetchJsonCached<{ log: unknown }>(`/api/admin/leads/${encodeURIComponent(leadId)}/logs`, {
          method: "POST",
          body: JSON.stringify({
            type: "call",
            result: action === "done" ? "answered" : "no_answer",
            notes:
              action === "done"
                ? "CRM 우선순위 큐에서 연락 완료 처리"
                : "CRM 우선순위 큐에서 부재 기록 후 내일 팔로업",
          }),
        })
        await adminFetchJsonCached<{ ok: true }>(`/api/admin/leads/${encodeURIComponent(leadId)}`, {
          method: "PATCH",
          body: JSON.stringify({
            status: "contacted",
            follow_up_at: followUpAt,
          }),
        })
        setActionMessage(action === "done" ? "연락 기록을 남기고 리드를 연락중으로 옮겼습니다." : "부재 기록을 남기고 내일 팔로업으로 넘겼습니다.")
        await load({ force: true })
      } catch (err) {
        setError(err instanceof Error ? err.message : "리드 처리에 실패했습니다.")
      } finally {
        setActingId(null)
      }
    },
    [load]
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
    <section className={embedded ? "" : `rounded-2xl border border-[#e8e8e4] bg-white p-4 ${compact ? "" : "mb-4"}`}>
      <div className={`mb-3 flex flex-col gap-3 ${compact || embedded ? "" : "lg:flex-row lg:items-center lg:justify-between"}`}>
        {embedded ? null : (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1a1a1a]/30">
              ClassIn Operation
            </p>
            <h2 className="mt-1 text-[18px] font-bold text-[#111110]">고객 운영 우선순위</h2>
            <p className="mt-0.5 text-[11px] text-[#1a1a1a]/40">
              컨택·데모·유입 감도·반응 가중 · 방치 신호는 봉우리 이후 감쇠
              <span className="text-[#1a1a1a]/30">(Derived)</span>
            </p>
          </div>
        )}
        <div className={`flex flex-col gap-2 ${compact || embedded ? "" : "sm:flex-row sm:items-center"}`}>
          <div className="inline-flex rounded-lg border border-[#e8e8e4] bg-[#fafaf8] p-1">
            {SOURCE_FILTERS.map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => setSource(filter.key)}
                className={`h-7 whitespace-nowrap rounded-md px-3 text-[12px] font-semibold transition-colors ${
                  source === filter.key
                    ? "bg-[#111110] text-white"
                    : "text-[#1a1a1a]/55 hover:bg-white hover:text-[#111110]"
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
        // 현황판 — 왼쪽에 "오늘 처리"를 크게 세우고, 나머지는 구성 내역으로 붙인다.
        // 할 일은 목록에서 빠졌으므로 여기서 건수 + 딥링크로만 존재한다.
        <div className="mb-3 grid gap-2 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)]">
          <div className="rounded-xl border border-[#e8e8e4] bg-[#fafaf8] p-3">
            <p className="text-[11px] font-semibold text-[#1a1a1a]/35">오늘 처리</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-[28px] font-bold leading-none tabular-nums text-[#111110]">
                {(data.summary.bucketCounts.today ?? 0).toLocaleString("ko-KR")}
              </span>
              <span className="text-[12px] font-medium text-[#1a1a1a]/40">
                / 후보 {data.summary.total.toLocaleString("ko-KR")}
              </span>
            </div>
            {data.summary.critical > 0 ? (
              <p className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-[#F6D5C5] bg-[#FEF3EE] px-2 py-0.5 text-[11px] font-semibold text-[#B85C33]">
                <AlertTriangle className="h-3 w-3" />
                긴급 {data.summary.critical.toLocaleString("ko-KR")}
              </p>
            ) : (
              <p className="mt-1.5 text-[11px] font-medium text-[#1a1a1a]/35">긴급 없음</p>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-[#f0f0ec] bg-white p-3">
              <p className="text-[11px] font-semibold text-[#1a1a1a]/35">리드</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-[#111110]">
                {(data.summary.sourceTotals?.lead ?? data.summary.leadCount).toLocaleString("ko-KR")}
              </p>
            </div>
            <div className="rounded-xl border border-[#f0f0ec] bg-white p-3">
              <p className="text-[11px] font-semibold text-[#1a1a1a]/35">ClassIn 고객</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-[#111110]">
                {(data.summary.sourceTotals?.neoAccount ?? data.summary.neoAccountCount).toLocaleString("ko-KR")}
              </p>
            </div>
            <Link
              href="/admin/crm/activity"
              className="group rounded-xl border border-[#f0f0ec] bg-white p-3 transition-colors hover:border-[#D7EBDD] hover:bg-[#ECFDF5]"
            >
              <p className="flex items-center gap-1 text-[11px] font-semibold text-[#1a1a1a]/35">
                할 일
                <ExternalLink className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
              </p>
              <p className="mt-1 text-xl font-bold tabular-nums text-[#084734]">
                {(data.summary.sourceTotals?.task ?? data.summary.taskCount).toLocaleString("ko-KR")}
              </p>
            </Link>
          </div>
        </div>
      ) : null}

      {/*
        쇼룸 캘린더 일정 중 고객을 못 붙인 건 — 제목이 자유 텍스트라 전수 매칭이 안 된다.
        조용히 버리면 "데모가 없다"로 오인되므로 건수를 그대로 드러낸다.
      */}
      {data?.summary.demo && data.summary.demo.unmatched > 0 ? (
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-[#e8e8e4] bg-[#fafaf8] px-3 py-2 text-[12px] text-[#1a1a1a]/55">
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

      <div className="mb-3 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setBucket("all")}
          className={`h-8 rounded-full border px-3 text-[12px] font-semibold transition-colors ${
            bucket === "all"
              ? "border-[#084734] bg-[#084734] text-white"
              : "border-[#e8e8e4] bg-white text-[#1a1a1a]/60 hover:bg-[#fafaf8] hover:text-[#111110]"
          }`}
        >
          전체
        </button>
        {bucketOptions.map((option) => (
          <button
            key={option.bucket}
            type="button"
            onClick={() => setBucket(option.bucket)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold transition-colors ${
              bucket === option.bucket
                ? "border-[#084734] bg-[#084734] text-white"
                : "border-[#e8e8e4] bg-white text-[#1a1a1a]/60 hover:bg-[#fafaf8] hover:text-[#111110]"
            }`}
          >
            <span>{option.label}</span>
            <span className={bucket === option.bucket ? "text-white/70" : "text-[#1a1a1a]/35"}>
              {option.count.toLocaleString("ko-KR")}
            </span>
          </button>
        ))}
      </div>

      {error ? (
        <div className="mb-3 rounded-xl border border-[#F6D5C5] bg-[#FEF3EE] px-3 py-2 text-[12px] font-medium text-[#B85C33]">
          {error}
        </div>
      ) : null}

      {actionMessage ? (
        <div className="mb-3 rounded-xl border border-[#D7EBDD] bg-[#ECFDF5] px-3 py-2 text-[12px] font-medium text-[#084734]">
          {actionMessage}
        </div>
      ) : null}

      {data?.sources.warnings.length ? (
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-[#F6D5C5] bg-[#FEF3EE] px-3 py-2 text-[12px] text-[#B85C33]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{data.sources.warnings.join(" ")}</span>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-[#f0f0ec]">
        {loading && !data ? (
          <div className="p-6 text-center text-[13px] text-[#1a1a1a]/40">우선순위를 계산 중입니다...</div>
        ) : data && data.items.length > 0 ? (
          <div className="divide-y divide-[#f0f0ec]">
            {visibleItems.map((item) =>
              compact ? (
                // 사이드바 컴팩트: 3줄(배지+점수 / 이름 / 사유·담당·날짜) + 한 줄 액션
                <div key={item.id} className="p-2.5 transition-colors hover:bg-[#fafaf8]">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${severityClass(
                        item
                      )}`}
                    >
                      {sourceIcon(item.source)}
                      {item.actionLabel}
                    </span>
                    <span className="shrink-0 text-[14px] font-bold tabular-nums text-[#111110]">{item.score}</span>
                  </div>
                  <Link href={item.href} className="group mt-1 flex items-center gap-1">
                    <span className="truncate text-[13px] font-bold text-[#111110]">{item.title}</span>
                    <ExternalLink className="h-3 w-3 shrink-0 text-[#1a1a1a]/25 group-hover:text-[#111110]" />
                  </Link>
                  <p className="mt-0.5 truncate text-[11px] text-[#1a1a1a]/45">
                    {item.reason}
                    {item.ownerName ? ` · ${item.ownerName}` : ""}
                    {` · ${formatDate(item.dueAt ?? item.updatedAt)}`}
                  </p>
                  <div className="mt-2 flex items-center gap-1.5">
                    {item.source === "lead" || item.source === "task" ? (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            void (item.source === "lead"
                              ? handleLeadAction(item, "done")
                              : handleTaskAction(item, "done"))
                          }
                          disabled={actingId === `${item.id}:done` || actingId === `${item.id}:tomorrow`}
                          className="inline-flex h-6 items-center gap-1 rounded-md border border-[#D7EBDD] bg-[#ECFDF5] px-2 text-[10px] font-semibold text-[#084734] transition-colors hover:bg-[#D7EBDD] disabled:opacity-50"
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          완료
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void (item.source === "lead"
                              ? handleLeadAction(item, "tomorrow")
                              : handleTaskAction(item, "tomorrow"))
                          }
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
                  className="grid gap-3 p-3 transition-colors hover:bg-[#fafaf8] lg:grid-cols-[minmax(0,1fr)_120px_112px_160px]"
                >
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${severityClass(
                          item
                        )}`}
                      >
                        {sourceIcon(item.source)}
                        {item.actionLabel}
                      </span>
                      <span className="rounded-full bg-[#ECFDF5] px-2 py-0.5 text-[11px] font-semibold text-[#084734]">
                        {item.bucketLabel}
                      </span>
                      <span className="text-[11px] font-medium text-[#1a1a1a]/35">{item.statusLabel}</span>
                    </div>
                    <Link href={item.href} className="group inline-flex max-w-full items-center gap-1.5">
                      <span className="truncate text-[14px] font-bold text-[#111110]">{item.title}</span>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-[#1a1a1a]/25 group-hover:text-[#111110]" />
                    </Link>
                    <p className="mt-0.5 truncate text-[12px] text-[#1a1a1a]/45">{item.subtitle ?? item.reason}</p>
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
                  <div className="flex flex-col gap-2 lg:items-end">
                    <div className="flex items-center justify-between gap-2 lg:justify-end">
                      <span className="text-[18px] font-bold tabular-nums text-[#111110]">{item.score}</span>
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
                          onClick={() => void handleLeadAction(item, "done")}
                          disabled={actingId === `${item.id}:done` || actingId === `${item.id}:tomorrow`}
                          className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#D7EBDD] bg-[#ECFDF5] px-2 text-[11px] font-semibold text-[#084734] transition-colors hover:bg-[#D7EBDD] disabled:opacity-50"
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          연락 완료
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleLeadAction(item, "tomorrow")}
                          disabled={actingId === `${item.id}:done` || actingId === `${item.id}:tomorrow`}
                          className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[11px] font-semibold text-[#1a1a1a]/60 transition-colors hover:bg-[#f5f5f2] hover:text-[#111110] disabled:opacity-50"
                        >
                          <Clock3 className="h-3 w-3" />
                          내일 팔로업
                        </button>
                      </div>
                    ) : item.source === "task" ? (
                      <div className="flex flex-wrap gap-1.5 lg:justify-end">
                        <button
                          type="button"
                          onClick={() => void handleTaskAction(item, "done")}
                          disabled={actingId === `${item.id}:done` || actingId === `${item.id}:tomorrow`}
                          className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#D7EBDD] bg-[#ECFDF5] px-2 text-[11px] font-semibold text-[#084734] transition-colors hover:bg-[#D7EBDD] disabled:opacity-50"
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
                  : `+${hiddenItemCount}건 더 보기 · 이 큐 ${data.items.length}건`}
              </button>
            ) : null}
          </div>
        ) : (
          <div className="p-6 text-center text-[13px] text-[#1a1a1a]/40">오늘 표시할 우선순위가 없습니다.</div>
        )}
      </div>
    </section>
  )
}
