"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { CalendarClock, CheckCircle2, Clock3, Filter, ListTodo, RefreshCw } from "lucide-react"

import { adminFetchJson, adminFetchJsonCached, getCachedAdminJson } from "@/lib/admin-client"
import {
  WEEK_AHEAD_PREVIEW_ROWS,
  budgetWeekAheadBuckets,
  classifyTaskBucket,
  type WeekAheadBucket,
} from "@/lib/crm/week-ahead"
import type { CrmTaskRecord, ListCrmTasksResult } from "@/lib/repositories/crm-tasks"
import { useCrmOwners } from "./useCrmOwners"

const TTL_MS = 90_000
const CURRENT_OWNER_VALUE = "__me"
// 담당자 해석 관찰용 — useCrmOwners와 동일 URL·cacheKey·TTL(인플라이트 공유, 추가 네트워크 없음).
const OWNERS_URL = "/api/admin/crm/owners"
const OWNERS_TTL_MS = 120_000

const BUCKET_LABEL: Record<WeekAheadBucket, string> = {
  overdue: "지연",
  today: "오늘",
  week: "이번 주",
  snoozed: "미룬 일",
  nodue: "기한 없음",
  later: "이후",
}
const BUCKET_TONE: Record<WeekAheadBucket, string> = {
  overdue: "text-[#B85C33]",
  today: "text-[#084734]",
  week: "text-[#111110]",
  snoozed: "text-[#7A520F]",
  nodue: "text-[#1a1a1a]/55",
  later: "text-[#1a1a1a]/45",
}

function formatDay(value: string | null) {
  if (!value) return "기한 없음"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "기한 없음"
  return new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit", weekday: "short" }).format(date)
}

export default function CrmWeekAheadPanel({
  compact = false,
  embedded = false,
  previewRows = WEEK_AHEAD_PREVIEW_ROWS,
  refreshKey = 0,
}: {
  compact?: boolean
  embedded?: boolean
  /** 접힌 상태에서 그릴 할 일 행 수(버킷 합산). 나머지는 "+N건 더 보기"로 펼친다. */
  previewRows?: number
  /** 값이 바뀌면 캐시를 건너뛰고 다시 조회한다(홈 새로고침 연동). */
  refreshKey?: number
}) {
  const [expanded, setExpanded] = useState(false)
  const { currentOwner } = useCrmOwners()
  // 담당자(__me) 해석 확정 게이트(감사 #9) — 해석 전 전체(owner 없음) 요청 + 해석 후 __me
  // 재요청의 이중 fetch를 제거한다. useCrmOwners는 실패 시에도 currentOwner=null만 유지해
  // 로딩/실패를 구분할 수 없으므로, 같은 cacheKey의 동일 요청을 직접 관찰해(성공·실패 무관)
  // settle 시점을 잡는다. useCrmOwners의 effect가 먼저 등록되므로 settle 시점에는
  // currentOwner 반영이 끝나 있다(같은 프라미스에 먼저 구독).
  const [ownersSettled, setOwnersSettled] = useState(false)
  useEffect(() => {
    let mounted = true
    void adminFetchJsonCached<unknown>(OWNERS_URL, undefined, {
      cacheKey: OWNERS_URL,
      ttlMs: OWNERS_TTL_MS,
      staleWhileRevalidateMs: 5 * 60_000,
    })
      .catch(() => null)
      .then(() => {
        if (mounted) setOwnersSettled(true)
      })
    return () => {
      mounted = false
    }
  }, [])

  // 사용자가 직접 고르기 전(null)에는 해석 결과에서 기본 담당(내 담당)을 파생한다 —
  // "해석 후 setOwner 왕복"이 사라져 최종 owner URL이 한 번에 선다.
  const [ownerChoice, setOwnerChoice] = useState<string | null>(null)
  const owner = ownerChoice ?? (currentOwner ? CURRENT_OWNER_VALUE : "")
  const [data, setData] = useState<ListCrmTasksResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actingId, setActingId] = useState<string | null>(null)

  const url = useMemo(() => {
    const params = new URLSearchParams({ status: "active", limit: "100" })
    if (owner) params.set("owner", owner)
    return `/api/admin/crm/tasks?${params.toString()}`
  }, [owner])

  // 담당자를 바꾸면 요청이 겹친다. 늦게 끝난 이전 요청이 최신 목록을 덮어쓰지 않도록
  // 마지막 요청만 상태에 반영한다.
  const requestSeq = useRef(0)

  const load = useCallback(
    async (options?: { force?: boolean }) => {
      const seq = ++requestSeq.current
      const isLatest = () => requestSeq.current === seq

      const cached = getCachedAdminJson<ListCrmTasksResult>(url, { cacheKey: url })
      if (cached && !options?.force) setData(cached)
      setLoading(!cached)
      setRefreshing(Boolean(options?.force))
      setError(null)
      try {
        const next = await adminFetchJsonCached<ListCrmTasksResult>(
          options?.force ? `${url}&force=1` : url,
          undefined,
          { cacheKey: url, ttlMs: TTL_MS, staleWhileRevalidateMs: 5 * 60_000, force: options?.force }
        )
        if (!isLatest()) return
        setData(next)
      } catch (err) {
        if (!isLatest()) return
        setError(err instanceof Error ? err.message : "이번 주 할 일을 불러오지 못했습니다.")
      } finally {
        if (isLatest()) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    },
    [url]
  )

  // 담당자 해석 확정 전에는 fetch를 열지 않는다 — settle 후 최종 owner URL로 1회만.
  // 홈 새로고침(refreshKey)은 TTL 캐시를 건너뛰어야 실제로 다시 세어진다.
  const lastRefreshKey = useRef(refreshKey)
  useEffect(() => {
    if (!ownersSettled) return
    const forced = lastRefreshKey.current !== refreshKey
    lastRefreshKey.current = refreshKey
    void load(forced ? { force: true } : undefined)
  }, [load, ownersSettled, refreshKey])

  const groups = useMemo(() => {
    const nowMs = Date.now()
    const map: Record<WeekAheadBucket, CrmTaskRecord[]> = { overdue: [], today: [], week: [], snoozed: [], nodue: [], later: [] }
    for (const task of data?.rows ?? []) map[classifyTaskBucket(task, nowMs)].push(task)
    return map
  }, [data])

  // 요약 표면(홈)에서 버킷을 전부 펼치면 활성 할 일이 많을 때 수십 행이 된다 —
  // 지연 → 오늘 → 이번 주 순으로 previewRows개까지만 그리고 나머지는 "+N건 더 보기"로 접는다.
  const budgeted = useMemo(
    () => budgetWeekAheadBuckets(groups, expanded ? null : previewRows),
    [groups, expanded, previewRows]
  )

  const handleAction = useCallback(
    async (task: CrmTaskRecord, action: "complete" | "snooze") => {
      setActingId(`${task.id}:${action}`)
      setError(null)
      try {
        await adminFetchJson(`/api/admin/crm/tasks/${encodeURIComponent(task.id)}`, {
          method: "PATCH",
          body: JSON.stringify(action === "complete" ? { action: "complete", outcome: "주간 작업대에서 완료" } : { action: "snooze" }),
        })
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
      <div className={`mb-3 flex flex-col gap-2 ${compact || embedded ? "" : "sm:flex-row sm:items-center sm:justify-between"}`}>
        {embedded ? null : (
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#fafaf8] text-[#1a1a1a]/45">
              <ListTodo className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-[15px] font-bold text-[#111110]">이번 주 해야 할 일</h2>
              {compact ? null : (
                <p className="text-[11px] text-[#1a1a1a]/40">지연 · 오늘 · 이번 주 · 미룬 일을 한 번에.</p>
              )}
            </div>
          </div>
        )}
        <div className="flex items-center gap-2">
          <label className="flex h-9 items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[12px] text-[#1a1a1a]/50">
            <Filter className="h-3.5 w-3.5" />
            <select
              value={owner}
              onChange={(event) => setOwnerChoice(event.target.value)}
              className="h-full bg-transparent text-[12px] font-semibold text-[#111110] outline-none"
              aria-label="담당자 필터"
            >
              {currentOwner ? <option value={CURRENT_OWNER_VALUE}>내 담당</option> : null}
              <option value="">전체</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => {
              // owner settle 전 클릭 시 전체 스코프 URL로 한 번 새는 것 방지(코덱스 리뷰 P2)
              if (!ownersSettled) return
              void load({ force: true })
            }}
            disabled={refreshing || !ownersSettled}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2]"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            새로고침
          </button>
        </div>
      </div>

      {error ? (
        <div className="mb-3 rounded-xl border border-[#F6D5C5] bg-[#FEF3EE] px-3 py-2 text-[12px] font-medium text-[#B85C33]">
          {error}
        </div>
      ) : null}

      {data && !data.health.ok && data.health.message ? (
        <div className="mb-3 rounded-xl border border-[#e8e8e4] bg-white px-3 py-2 text-[12px] font-medium text-[#1a1a1a]/55">
          {data.health.message}
        </div>
      ) : null}

      {loading && !data ? (
        <div className="p-6 text-center text-[13px] text-[#1a1a1a]/40">할 일을 불러오는 중입니다...</div>
      ) : data && data.rows.length === 0 ? (
        <div className="p-6 text-center text-[13px] text-[#1a1a1a]/40">열린 할 일이 없습니다.</div>
      ) : (
        <div className="space-y-3">
          {budgeted.slices.map(({ bucket, tasks, total }) => (
            <div key={bucket}>
              {/* 헤더 카운트는 잘라내기 전 버킷 총량 — 미리보기가 총량을 숨기지 않게 한다 */}
              <p className={`mb-1.5 text-[11px] font-bold uppercase tracking-[0.06em] ${BUCKET_TONE[bucket]}`}>
                {BUCKET_LABEL[bucket]} ({total})
              </p>
              <div className="space-y-1.5">
                {tasks.map((task) => (
                  <div key={task.id} className="flex items-center justify-between gap-2 rounded-xl bg-[#fafaf8] px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-semibold text-[#111110]">{task.title}</p>
                      <p className="truncate text-[11px] text-[#1a1a1a]/40">
                        <CalendarClock className="mr-1 inline h-3 w-3" />
                        {formatDay(task.dueAt)}
                        {task.targetLabel ? ` · ${task.targetLabel}` : ""}
                        {task.ownerNameSnapshot ? ` · ${task.ownerNameSnapshot}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void handleAction(task, "complete")}
                        disabled={actingId === `${task.id}:complete` || actingId === `${task.id}:snooze`}
                        className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#D7EBDD] bg-[#ECFDF5] px-2 text-[11px] font-semibold text-[#084734] transition-colors hover:bg-[#D7EBDD] disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        완료
                      </button>
                      {bucket !== "snoozed" ? (
                        <button
                          type="button"
                          onClick={() => void handleAction(task, "snooze")}
                          disabled={actingId === `${task.id}:complete` || actingId === `${task.id}:snooze`}
                          className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[11px] font-semibold text-[#1a1a1a]/60 transition-colors hover:bg-[#f5f5f2] disabled:opacity-50"
                        >
                          <Clock3 className="h-3 w-3" />
                          내일로
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {budgeted.totalCount > previewRows ? (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="w-full rounded-xl border border-[#e8e8e4] bg-white py-2 text-[12px] font-semibold text-[#1a1a1a]/55 transition-colors hover:border-[#c8c8c4] hover:text-[#111110]"
            >
              {expanded
                ? `접기 · 상위 ${previewRows}건만`
                : `+${budgeted.hiddenCount}건 더 보기 · 전체 ${budgeted.totalCount}건`}
            </button>
          ) : null}
        </div>
      )}
    </section>
  )
}
