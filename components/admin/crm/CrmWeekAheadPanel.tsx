"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { CalendarClock, CheckCircle2, Clock3, Filter, ListTodo, RefreshCw } from "lucide-react"

import { adminFetchJson, adminFetchJsonCached, getCachedAdminJson } from "@/lib/admin-client"
import {
  WEEK_AHEAD_VISIBLE_BUCKETS,
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
}: {
  compact?: boolean
  embedded?: boolean
}) {
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

  const load = useCallback(
    async (options?: { force?: boolean }) => {
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
        setData(next)
      } catch (err) {
        setError(err instanceof Error ? err.message : "이번 주 할 일을 불러오지 못했습니다.")
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [url]
  )

  // 담당자 해석 확정 전에는 fetch를 열지 않는다 — settle 후 최종 owner URL로 1회만.
  useEffect(() => {
    if (!ownersSettled) return
    void load()
  }, [load, ownersSettled])

  const groups = useMemo(() => {
    const nowMs = Date.now()
    const map: Record<WeekAheadBucket, CrmTaskRecord[]> = { overdue: [], today: [], week: [], snoozed: [], nodue: [], later: [] }
    for (const task of data?.rows ?? []) map[classifyTaskBucket(task, nowMs)].push(task)
    return map
  }, [data])

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
          {WEEK_AHEAD_VISIBLE_BUCKETS.filter((bucket) => groups[bucket].length > 0).map((bucket) => (
            <div key={bucket}>
              <p className={`mb-1.5 text-[11px] font-bold uppercase tracking-[0.06em] ${BUCKET_TONE[bucket]}`}>
                {BUCKET_LABEL[bucket]} ({groups[bucket].length})
              </p>
              <div className="space-y-1.5">
                {groups[bucket].map((task) => (
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
        </div>
      )}
    </section>
  )
}
