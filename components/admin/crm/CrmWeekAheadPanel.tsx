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
  const [owner, setOwner] = useState<string>("")
  const [data, setData] = useState<ListCrmTasksResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actingId, setActingId] = useState<string | null>(null)

  useEffect(() => {
    if (currentOwner && owner === "") setOwner(CURRENT_OWNER_VALUE)
  }, [currentOwner, owner])

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

  useEffect(() => {
    void load()
  }, [load])

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
              onChange={(event) => setOwner(event.target.value)}
              className="h-full bg-transparent text-[12px] font-semibold text-[#111110] outline-none"
              aria-label="담당자 필터"
            >
              {currentOwner ? <option value={CURRENT_OWNER_VALUE}>내 담당</option> : null}
              <option value="">전체</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => void load({ force: true })}
            disabled={refreshing}
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
