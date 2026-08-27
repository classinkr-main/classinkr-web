"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Filter,
  RefreshCw,
  XCircle,
} from "lucide-react"

import { adminFetchJsonCached, getCachedAdminJson } from "@/lib/admin-client"
import type { CrmPriorityBucket, CrmPriorityItem, CrmPriorityLane } from "@/lib/crm/priority"
import { TODAY_CALL_SLOTS, pickTodayCalls, type TodayCall, type TodayCallSlotKey } from "@/lib/crm/today-calls"
import { buildOwnerSelectOptions, useCrmOwners } from "./useCrmOwners"

// 홈 우선순위 패널 = "오늘 전화할 N건" 카드. 숫자 타일·레인 탭·시점 탭을 걷어내고
// 쿼터 믹스(신규 응대 2 · 돈 임박 2 · 다시 움직임 1)로 뽑은 카드만 남긴다.
// 판단(누굴 뽑나)은 lib/crm/today-calls.ts 한 곳에 있다 — 화면은 뽑힌 결과를 그릴 뿐이다.
// 탐색·전수 조회는 고객DB(/admin/crm/customers/unified)가 담당한다.
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

const QUEUE_TTL_MS = 90_000
// 선별 모수 — 쿼터 믹스가 세 슬롯을 다 채우려면 오늘 버킷 밖 후보까지 넉넉히 필요하다(서버 상한 50).
const QUEUE_POOL_LIMIT = 50
const QUEUE_PREVIEW_COUNT = 5
const CURRENT_OWNER_VALUE = "__me"

// 슬롯 색: 신규 응대=그린 틴트, 돈 임박=Warning 캐논, 다시 움직임=중립 — 카드 성격을 한 눈에.
const SLOT_CHIP_CLASS: Record<TodayCallSlotKey, string> = {
  new_response: "bg-[#ECFDF5] text-[#084734]",
  money: "bg-[#FBF1E0] text-[#7A520F]",
  reengage: "bg-[#f0f0ec] text-[#31302E]",
}

function queueUrl(owner: string, limit: number) {
  // v=3: 레인·시점 파라미터를 제거한 "오늘 전화" 페이로드 — 이전 캐시와 섞이지 않게 버전 분리.
  const params = new URLSearchParams({ limit: String(limit), source: "customer", v: "3" })
  if (owner) params.set("owner", owner)
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

// 메타 칩의 "경과 시간" — 유입 시각(dueAt) 기준. 밴드는 함축이 목적이라 시간 단위 하나만 쓴다.
function formatAgeHours(value: string | null) {
  if (!value) return null
  const diff = Date.now() - new Date(value).getTime()
  if (!Number.isFinite(diff) || diff < 0) return null
  const hours = Math.floor(diff / 3_600_000)
  return hours >= 24 ? `${Math.floor(hours / 24)}일` : `${hours}h`
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
  /** 처음 그릴 카드 수(=쿼터 믹스 총량). "다음 후보"는 같은 응답 안에서 펼친다. */
  previewCount?: number
}) {
  const [showMore, setShowMore] = useState(false)
  const [owner, setOwner] = useState("")
  const [data, setData] = useState<CrmPriorityQueue | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actingId, setActingId] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [leadContactDraft, setLeadContactDraft] = useState<LeadContactDraft | null>(null)
  const { owners: crmOwners, currentOwner, health: ownerHealth } = useCrmOwners()

  const cardCount = compact ? Math.min(previewCount, 4) : previewCount
  const url = useMemo(() => queueUrl(owner, QUEUE_POOL_LIMIT), [owner])
  const ownerOptions = useMemo(() => buildOwnerSelectOptions(data?.owners, crmOwners), [crmOwners, data?.owners])

  // 필터를 연타하면 요청이 겹친다. 늦게 끝난 이전 요청이 최신 화면을 덮어쓰지 않게
  // 마지막 요청만 상태에 반영한다.
  const requestSeq = useRef(0)

  const load = useCallback(
    async (options?: { force?: boolean }) => {
      const seq = ++requestSeq.current
      const isLatest = () => requestSeq.current === seq

      const cached = getCachedAdminJson<CrmPriorityQueue>(url, { cacheKey: url })
      if (cached && !options?.force) setData(cached)
      // 담당자 필터가 바뀌어 새 URL 캐시가 없으면 이전 큐를 남기지 않는다.
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
        setError(err instanceof Error ? err.message : "오늘 전화 목록을 불러오지 못했습니다.")
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

  const { calls, overflow, totals, meta } = useMemo(
    () => pickTodayCalls(data?.items ?? [], { limit: cardCount }),
    [data, cardCount]
  )
  const visibleCalls = useMemo(
    () => (showMore ? [...calls, ...overflow.slice(0, cardCount)] : calls),
    [calls, overflow, showMore, cardCount]
  )
  const slotSummary = TODAY_CALL_SLOTS.map((slot) => `${slot.label} ${slot.quota}`).join(" · ")

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
          setActionMessage("리드를 종료 처리해 오늘 전화 목록에서 제외했습니다.")
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
      // 로그 POST가 연락중 상태까지 한 계약으로 맞춘다. 다음 일정만 별도 PATCH이며,
      // 그 부분 실패에서는 저장된 기록을 다시 입력하지 않도록 폼을 닫고 범위를 밝힌다.
      let logSaved = false
      try {
        const contactResult = await adminFetchJsonCached<{
          log: unknown
          statusSync: "updated" | "unchanged" | "failed"
          warning?: string
        }>(`/api/admin/leads/${encodeURIComponent(leadId)}/logs`, {
          method: "POST",
          body: JSON.stringify({
            type: draft.type,
            result: draft.result,
            notes: draft.notes.trim() || undefined,
          }),
        })
        logSaved = true

        const patch: { follow_up_at?: string | null } = {}
        if (draft.nextSchedule === "tomorrow") patch.follow_up_at = tomorrowMorningIso()
        if (draft.nextSchedule === "clear") patch.follow_up_at = null
        if ("follow_up_at" in patch) {
          await adminFetchJsonCached<{ lead: unknown }>(`/api/admin/leads/${encodeURIComponent(leadId)}`, {
            method: "PATCH",
            body: JSON.stringify(patch),
          })
        }

        setLeadContactDraft(null)
        setActionMessage(contactResult.warning ?? "선택한 채널·결과로 연락 기록을 저장했습니다.")
        await load({ force: true })
      } catch (err) {
        const detail = err instanceof Error ? err.message : "알 수 없는 오류"
        if (logSaved) {
          // 기록은 남았다 — 폼을 닫아 재입력(중복 기록)을 막고 남은 작업만 알린다.
          setLeadContactDraft(null)
          setError(`연락 기록·상태는 저장됐지만 다음 일정 반영에 실패했습니다(${detail}). 리드 보드에서 일정을 확인하세요.`)
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
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        {embedded ? null : (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1a1a1a]/30">
              ClassIn Operation
            </p>
            <h2 className="mt-1 text-[18px] font-bold text-[#111110]">
              오늘 전화할 {calls.length > 0 ? `${calls.length}건` : "고객"}
            </h2>
            <p className="mt-0.5 text-[11px] leading-relaxed text-[#615D59]">
              {slotSummary} 믹스 · 처리하면 다음 후보가 올라옵니다
              {/* 캐시로 뜨는 목록이라 "지금 상태"인지 아닌지를 화면에서 알 수 있어야 한다. */}
              {data?.generatedAt ? ` · 기준 ${formatDate(data.generatedAt)}` : ""}
            </p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
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
          <div className="divide-y divide-[#f0f0ec]" aria-hidden>
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={`sk-${index}`} className="flex items-center gap-3 p-3">
                <div className="h-5 w-16 animate-pulse rounded-full bg-[#f0f0ec]" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="h-4 w-1/3 animate-pulse rounded bg-[#f0f0ec]" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-[#f5f5f2]" />
                </div>
              </div>
            ))}
          </div>
        ) : data && visibleCalls.length > 0 ? (
          <div className="divide-y divide-[#f0f0ec]">
            {visibleCalls.map((call: TodayCall) => {
              const item = call.item
              return (
                <div
                  key={item.id}
                  className={`grid gap-2.5 border-l-2 p-3 transition-colors hover:bg-[#fafaf8] lg:grid-cols-[minmax(0,1fr)_150px_auto] ${severityBorderClass(item)}`}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`inline-flex h-[22px] shrink-0 items-center rounded-full px-2 text-[11px] font-semibold ${SLOT_CHIP_CLASS[call.slot]}`}>
                        {call.slotLabel}
                      </span>
                      <Link href={item.href} className="group inline-flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-[14px] font-bold text-[#111110]">{item.title}</span>
                        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-[#1a1a1a]/25 group-hover:text-[#111110]" />
                      </Link>
                      {item.subtitle ? (
                        <span className="truncate text-[12px] text-[#1a1a1a]/45">{item.subtitle}</span>
                      ) : null}
                      {call.groupedCount > 0 ? (
                        <span className="shrink-0 rounded-md bg-[#f0f0ec] px-1.5 py-0.5 text-[10px] font-semibold text-[#1a1a1a]/55">
                          같은 기관 +{call.groupedCount}건
                        </span>
                      ) : null}
                    </div>
                    {/* 왜 오늘 이 사람인가 — 점수 숫자 대신 근거 문장이 카드의 중심이다. */}
                    <p className="mt-1 text-[13px] font-semibold text-[#111110]">{item.reason}</p>
                    <p className="mt-0.5 text-[11px] font-medium text-[#1a1a1a]/40">
                      {item.actionLabel} · {item.statusLabel}
                    </p>
                  </div>
                  <div className="lg:pt-0.5">
                    <p className="text-[11px] font-semibold text-[#1a1a1a]/35">담당·기준일</p>
                    <p className="mt-1 truncate text-[12px] font-medium text-[#111110]">{item.ownerName ?? "미배정"}</p>
                    <p className="text-[11px] text-[#1a1a1a]/35">{formatDate(item.dueAt ?? item.updatedAt)}</p>
                  </div>
                  <div className="flex flex-wrap items-start gap-1.5 lg:justify-end">
                    {item.source === "lead" ? (
                      <>
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
                      </>
                    ) : item.source === "task" ? (
                      <>
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
                      </>
                    ) : null}
                    <Link
                      href={item.href}
                      className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[11px] font-semibold text-[#1a1a1a]/55 transition-colors hover:bg-[#f5f5f2] hover:text-[#111110]"
                    >
                      열기
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                  {item.source === "lead" && leadContactDraft?.itemId === item.id ? (
                    <div className="border-l-2 border-[#084734] bg-white p-3 lg:col-span-3">
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
            })}
            {overflow.length > 0 ? (
              <button
                type="button"
                onClick={() => setShowMore((value) => !value)}
                className="w-full bg-white py-2 text-[12px] font-semibold text-[#1a1a1a]/55 transition-colors hover:bg-[#fafaf8] hover:text-[#111110]"
              >
                {showMore
                  ? `접기 · 오늘 전화 ${calls.length}건만`
                  : `다음 후보 ${Math.min(cardCount, overflow.length)}건 더 보기`}
              </button>
            ) : null}
          </div>
        ) : !data ? (
          // 실패와 "할 일 없음"은 다른 상태다 — 못 불러온 것을 "없다"로 말하지 않는다.
          <div className="p-6 text-center text-[13px] text-[#1a1a1a]/40">
            오늘 전화 목록을 불러오지 못했습니다. 위 새로고침으로 다시 시도하세요.
          </div>
        ) : (
          <div className="px-4 py-6 text-center">
            <p className="text-[13px] font-semibold text-[#111110]">
              {owner ? "선택한 담당자의 오늘 전화 후보가 없습니다" : "오늘 전화할 후보가 없습니다"}
            </p>
            <p className="mt-1 text-[12px] text-[#1a1a1a]/45">
              {owner
                ? "담당 전체로 넓히면 다른 담당자의 후보가 보일 수 있습니다."
                : "처리할 후보가 없다는 뜻입니다 — 데이터 누락이 아닙니다."}
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
              {owner ? (
                <button
                  type="button"
                  onClick={() => setOwner("")}
                  className="inline-flex h-8 items-center rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2]"
                >
                  담당 전체로 보기
                </button>
              ) : null}
              <Link
                href="/admin/crm/customers/unified"
                className="inline-flex h-8 items-center rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#1a1a1a]/60 transition-colors hover:bg-[#f5f5f2] hover:text-[#111110]"
              >
                고객DB에서 찾아보기
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* 메타 광고 리드 — 절대다수 유입원이라 카드에 섞지 않는다. 건수 + 상위 몇 건만
          한 줄로 함축하고, 응대 작업은 리드 보드의 메타 필터 뷰로 보낸다. 카드가 비어도 보인다. */}
      {data && meta.total > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-lg bg-[#fafaf8] px-3 py-2.5">
          <span className="inline-flex h-[22px] items-center rounded-full bg-[#111110] px-2 text-[11px] font-semibold text-white">
            메타 광고
          </span>
          {/* 풀 상한(50건) 안에서 센 수 — 상한에 닿았으면 "+"로 절단을 드러낸다. */}
          <span className="text-[12px] font-semibold tabular-nums text-[#111110]">
            리드 {meta.total.toLocaleString("ko-KR")}건{(data?.items.length ?? 0) >= QUEUE_POOL_LIMIT ? "+" : ""}
          </span>
          <span className="text-[11px] tabular-nums text-[#1a1a1a]/45">
            오늘 응대 대상 {meta.today.toLocaleString("ko-KR")}건{(data?.items.length ?? 0) >= QUEUE_POOL_LIMIT ? "+" : ""}
          </span>
          <span aria-hidden className="text-[#1a1a1a]/20">·</span>
          {meta.top.map((item) => {
            const age = formatAgeHours(item.dueAt)
            return (
              <Link
                key={item.id}
                href={item.href}
                className="inline-flex h-[22px] max-w-[160px] items-center gap-1 rounded-full border border-[#e8e8e4] bg-white px-2 text-[11px] font-medium text-[#111110] transition-colors hover:border-[#c8c8c4]"
              >
                <span className="truncate">{item.title}</span>
                {age ? <span className="shrink-0 tabular-nums text-[#1a1a1a]/40">{age}</span> : null}
              </Link>
            )
          })}
          {meta.total > meta.top.length ? (
            <span className="text-[11px] tabular-nums text-[#1a1a1a]/40">+{meta.total - meta.top.length}</span>
          ) : null}
          <Link
            href="/admin/crm/customers/leads?group=meta&filter=unresponded"
            className="ml-auto shrink-0 text-[11px] font-semibold text-[#084734] underline-offset-2 hover:underline"
          >
            메타 리드만 보기
          </Link>
        </div>
      ) : null}

      {/* 판단 근거를 요약 한 줄로 — "왜 5건뿐인가"에 답하고, 전수 탐색은 고객DB로 보낸다. */}
      {data ? (
        <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-[11px] text-[#1a1a1a]/45">
          <span>
            오늘 후보 <b className="font-semibold text-[#111110]">{totals.today.toLocaleString("ko-KR")}건</b>
            {" · "}신규 응대 {totals.slots.new_response.toLocaleString("ko-KR")} · 돈 임박{" "}
            {totals.slots.money.toLocaleString("ko-KR")} · 다시 움직임 {totals.slots.reengage.toLocaleString("ko-KR")}
            {data.summary.laneCritical > 0 ? (
              <>
                {" · "}
                <span className="font-semibold text-[#B85C33]">긴급 {data.summary.laneCritical.toLocaleString("ko-KR")}</span>
              </>
            ) : null}
          </span>
          <Link href="/admin/crm/customers/unified" className="font-semibold text-[#084734] underline-offset-2 hover:underline">
            전체는 고객DB에서 보기
          </Link>
        </p>
      ) : null}

      {/*
        할 일은 이 큐에서 의도적으로 뺐다(매출 기회와 경쟁시키지 않기 위해). 그런데 건수를
        아무 데도 안 보여주면 "할 일이 없다"로 읽힌다 — 규모와 갈 곳을 한 줄로 남긴다.
      */}
      {(data?.summary.sourceTotals?.task ?? 0) > 0 ? (
        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] text-[#1a1a1a]/45">
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
