"use client"

// 기록 화면 우측 "이번 주 요약" 패널(2026-09-17 우선순위 A5).
//  - 건수(이번 주·콜/회의·위험 신호·미연결)는 lib/crm/activity-week-summary 의 순수 집계를 그대로 보여준다.
//  - "다음 액션 미완" 목록은 /api/admin/crm/tasks?status=open&dueBefore=<이번 주 끝 KST> 를 이 파일의
//    훅(useWeekOpenTasks)이 adminFetchJsonCached 로 읽는다. 실패해도 이 블록만 인라인 캡션+재시도로 남고
//    화면 전체는 깨지지 않는다.
//  - 행은 링크가 아니라 버튼 → onOpenTask(id, task). 어디로 여는지는 호출부가 정한다.
// 표시용 View 와 데이터 훅을 분리해 호출부가 한 번만 fetch 하고 데스크톱/모바일 두 자리에 그릴 수 있게 했다.

import { useCallback, useEffect, useRef, useState } from "react"
import { AlertTriangle, RefreshCw } from "lucide-react"

import { adminFetchJsonCached } from "@/lib/admin-client"
import { CRM_CACHE_SWR_MS, CRM_CACHE_TTL_MS } from "@/lib/crm/client-cache"
import { activityWeekEndIso, kstDayDiff, type ActivityWeekSummary as WeekSummary } from "@/lib/crm/activity-week-summary"
import { STATUS_TONE_TEXT_CLASS } from "@/lib/crm/status-tone"
import type { CrmTaskRecord, ListCrmTasksResult } from "@/lib/repositories/crm-tasks"
import { INTERACTIVE_TEXT_CLASS, SECONDARY_TEXT_CLASS } from "@/components/admin/crm/home/shared"

export const WEEK_TASKS_LIMIT = 8
const TASKS_URL = "/api/admin/crm/tasks"

export type WeekTasksState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; rows: CrmTaskRecord[]; total: number }

/** 이번 주(일요일 23:59:59.999 KST)까지 마감인 열린 할 일 상위 N — URL 은 캐시 키이기도 하다. */
export function weekOpenTasksUrl(nowMs: number): string {
  const params = new URLSearchParams({
    status: "open",
    limit: String(WEEK_TASKS_LIMIT),
    dueBefore: activityWeekEndIso(nowMs),
  })
  return `${TASKS_URL}?${params.toString()}`
}

type FetchJson = <T>(
  input: string,
  init: undefined,
  options: { cacheKey: string; ttlMs: number; staleWhileRevalidateMs: number; force?: boolean }
) => Promise<T>

/**
 * 성공·실패를 예외 대신 상태로 돌려준다 — 호출부는 throw 를 걱정하지 않고 state 만 그린다.
 * `fetchJson` 주입은 테스트용(기본 adminFetchJsonCached).
 */
export async function loadWeekOpenTasks(
  nowMs: number,
  options: { force?: boolean; fetchJson?: FetchJson } = {}
): Promise<WeekTasksState> {
  const url = weekOpenTasksUrl(nowMs)
  const fetchJson = options.fetchJson ?? (adminFetchJsonCached as FetchJson)
  try {
    const data = await fetchJson<ListCrmTasksResult>(options.force ? `${url}&force=1` : url, undefined, {
      cacheKey: url,
      ttlMs: CRM_CACHE_TTL_MS,
      staleWhileRevalidateMs: CRM_CACHE_SWR_MS,
      force: options.force,
    })
    if (data.health.ok === false && data.health.message && data.rows.length === 0) {
      return { status: "error", message: data.health.message }
    }
    return { status: "ready", rows: data.rows.slice(0, WEEK_TASKS_LIMIT), total: data.pagination.total }
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error && error.message ? error.message : "다음 액션을 불러오지 못했습니다.",
    }
  }
}

/**
 * 마운트 시 1회 로드하고, 이후는 호출부의 reload(force, atMs) 로만 다시 읽는다.
 * nowMs 는 ref 로 들고 있어 기준 시각이 바뀌어도 자동 재조회하지 않는다(새로고침 버튼이 명시적으로 부른다).
 */
export function useWeekOpenTasks(nowMs: number): {
  state: WeekTasksState
  reload: (force?: boolean, atMs?: number) => void
} {
  const [state, setState] = useState<WeekTasksState>({ status: "loading" })
  const seq = useRef(0)
  const nowRef = useRef(nowMs)
  useEffect(() => {
    nowRef.current = nowMs
  }, [nowMs])

  const reload = useCallback((force = false, atMs?: number) => {
    const requestId = ++seq.current
    setState({ status: "loading" })
    void loadWeekOpenTasks(atMs ?? nowRef.current, { force }).then((next) => {
      if (requestId === seq.current) setState(next)
    })
  }, [])

  // 마운트 로드 — 초기 상태가 이미 loading 이라 동기 setState 없이 결과만 비동기로 반영한다.
  useEffect(() => {
    const requestId = ++seq.current
    void loadWeekOpenTasks(nowRef.current, { force: false }).then((next) => {
      if (requestId === seq.current) setState(next)
    })
    return () => {
      seq.current += 1
    }
  }, [])

  return { state, reload }
}

/** "D-3" · "D-DAY" · "D+2" · "기한 없음" + 톤. 기존 360 라벨 규약(Customer360DetailShared)과 같은 표기. */
export function taskDueBadge(task: Pick<CrmTaskRecord, "dueAt">, nowMs: number): {
  text: string
  tone: "danger" | "warning" | "neutral"
} {
  const diff = kstDayDiff(task.dueAt, nowMs)
  if (diff === null) return { text: "기한 없음", tone: "neutral" }
  if (diff < 0) return { text: `D+${Math.abs(diff)}`, tone: "danger" }
  if (diff === 0) return { text: "D-DAY", tone: "warning" }
  return { text: `D-${diff}`, tone: "neutral" }
}

const DUE_TONE_CLASS: Record<"danger" | "warning" | "neutral", string> = {
  danger: STATUS_TONE_TEXT_CLASS.danger,
  warning: "text-[#7A520F]",
  neutral: SECONDARY_TEXT_CLASS,
}

function countText(value: number, unit = "건") {
  return `${value.toLocaleString("ko-KR")}${unit}`
}

function StatSkeleton() {
  return (
    <div aria-hidden className="grid grid-cols-2 gap-2">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="rounded-xl bg-[#fafaf8] p-3">
          <div className="h-3 w-16 animate-pulse rounded-md bg-[#f0f0ec]" />
          <div className="mt-2 h-5 w-12 animate-pulse rounded-md bg-[#f0f0ec]" />
        </div>
      ))}
    </div>
  )
}

function TaskSkeleton({ rows }: { rows: number }) {
  return (
    <div aria-hidden className="space-y-2" data-testid="week-tasks-skeleton">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="space-y-1.5 rounded-xl bg-[#fafaf8] p-2.5">
          <div className="h-3.5 w-3/4 animate-pulse rounded-md bg-[#f0f0ec]" />
          <div className="h-3 w-1/2 animate-pulse rounded-md bg-[#f0f0ec]" />
        </div>
      ))}
    </div>
  )
}

export interface ActivityWeekSummaryViewProps {
  /** null 이면 목록을 아직 못 받은 상태 — 값 자리 스켈레톤. */
  summary: WeekSummary | null
  /** 불러온 목록이 이번 주를 다 덮지 못했을 때(하한값) */
  partial?: boolean
  tasks: WeekTasksState
  nowMs: number
  onRetryTasks?: () => void
  /** 미연결 건수 클릭 — 호출부가 대상 필터를 "미연결"로 바꾼다. */
  onFilterUnlinked?: () => void
  /** 미연결 필터가 이미 적용 중이면 버튼을 눌린 상태로 그린다. */
  unlinkedFilterActive?: boolean
  onOpenTask?: (id: string, task: CrmTaskRecord) => void
  /** "card" = 자체 카드 프레임(데스크톱 우측). "plain" = 프레임 없이(모바일 details 안). */
  frame?: "card" | "plain"
  className?: string
}

export function ActivityWeekSummaryView({
  summary,
  partial = false,
  tasks,
  nowMs,
  onRetryTasks,
  onFilterUnlinked,
  unlinkedFilterActive = false,
  onOpenTask,
  frame = "card",
  className,
}: ActivityWeekSummaryViewProps) {
  const risk = summary?.negativeSentiment ?? 0
  const unlinked = summary?.unlinked ?? 0
  const frameClass = frame === "card" ? "rounded-2xl border border-[#e8e8e4] bg-white p-4" : ""

  return (
    <section
      aria-label="이번 주 요약"
      data-testid="activity-week-summary"
      className={`min-w-0 ${frameClass} ${className ?? ""}`}
    >
      {frame === "card" ? (
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2 className="text-[13px] font-bold text-[#111110]">이번 주 요약</h2>
          <span className={`text-[11px] tabular-nums ${SECONDARY_TEXT_CLASS}`}>
            {summary ? summary.weekLabel : "—"}
          </span>
        </div>
      ) : null}

      {summary ? (
        <dl className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-[#fafaf8] p-3">
            <dt className={`text-[11px] font-semibold ${SECONDARY_TEXT_CLASS}`}>이번 주 기록</dt>
            <dd className="mt-1 text-lg font-bold tabular-nums text-[#111110]">{countText(summary.total)}</dd>
          </div>
          <div className="rounded-xl bg-[#fafaf8] p-3">
            <dt className={`text-[11px] font-semibold ${SECONDARY_TEXT_CLASS}`}>콜 · 회의</dt>
            <dd className="mt-1 text-lg font-bold tabular-nums text-[#111110]">
              {countText(summary.calls)}
              <span className={`mx-1 text-[13px] font-medium ${SECONDARY_TEXT_CLASS}`}>·</span>
              {countText(summary.meetings)}
            </dd>
          </div>
          <div className="rounded-xl bg-[#fafaf8] p-3">
            <dt className={`text-[11px] font-semibold ${SECONDARY_TEXT_CLASS}`}>위험 신호</dt>
            <dd
              className={`mt-1 text-lg font-bold tabular-nums ${risk > 0 ? STATUS_TONE_TEXT_CLASS.danger : "text-[#111110]/35"}`}
              data-risk={risk > 0 ? "some" : "none"}
            >
              {countText(risk)}
            </dd>
          </div>
          <div className="rounded-xl bg-[#fafaf8] p-3">
            <dt className={`text-[11px] font-semibold ${SECONDARY_TEXT_CLASS}`}>미연결</dt>
            <dd className="mt-1">
              {onFilterUnlinked ? (
                <button
                  type="button"
                  onClick={onFilterUnlinked}
                  aria-pressed={unlinkedFilterActive}
                  aria-label={`미연결 기록 ${countText(unlinked)} — 목록에서 미연결만 보기`}
                  className={`inline-flex min-h-11 items-center gap-1 rounded-md text-lg font-bold tabular-nums underline-offset-2 hover:underline sm:min-h-0 ${
                    unlinked > 0 ? INTERACTIVE_TEXT_CLASS : "text-[#111110]/35"
                  }`}
                >
                  {countText(unlinked)}
                </button>
              ) : (
                <span className={`text-lg font-bold tabular-nums ${unlinked > 0 ? "text-[#111110]" : "text-[#111110]/35"}`}>
                  {countText(unlinked)}
                </span>
              )}
            </dd>
          </div>
        </dl>
      ) : (
        <StatSkeleton />
      )}

      <p className={`mt-2 text-[11px] ${SECONDARY_TEXT_CLASS}`}>
        {partial ? "현재 필터 · 불러온 목록 기준(더 있음)" : "현재 필터 · 불러온 목록 기준"}
      </p>

      <div className="mt-4">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h3 className="text-[12px] font-bold text-[#111110]">다음 액션 미완</h3>
          <span className={`text-[11px] tabular-nums ${SECONDARY_TEXT_CLASS}`}>
            {tasks.status === "ready" ? `이번 주 마감 ${countText(tasks.total)}` : "이번 주 마감"}
          </span>
        </div>

        {tasks.status === "loading" ? (
          <TaskSkeleton rows={4} />
        ) : tasks.status === "error" ? (
          <div
            role="status"
            className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-[#fafaf8] px-3 py-2 text-[12px] ${STATUS_TONE_TEXT_CLASS.warning}`}
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1">다음 액션을 불러오지 못했습니다. {tasks.message}</span>
            {onRetryTasks ? (
              <button
                type="button"
                onClick={onRetryTasks}
                className={`inline-flex min-h-11 items-center gap-1 rounded px-1 font-semibold underline-offset-2 hover:underline sm:min-h-0 ${INTERACTIVE_TEXT_CLASS}`}
              >
                <RefreshCw className="h-3 w-3" aria-hidden="true" />
                다시 시도
              </button>
            ) : null}
          </div>
        ) : tasks.rows.length === 0 ? (
          <p className={`rounded-xl bg-[#fafaf8] px-3 py-3 text-center text-[12px] ${SECONDARY_TEXT_CLASS}`}>
            이번 주 마감인 미완 액션이 없습니다.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {tasks.rows.map((task) => {
              const due = taskDueBadge(task, nowMs)
              const target = task.targetLabel?.trim() || (task.targetId ? task.targetId : "미연결")
              const owner = task.ownerNameSnapshot?.trim() || "담당 미지정"
              const content = (
                <>
                  <p className="truncate text-[12px] font-semibold text-[#111110]">{task.title}</p>
                  <p className={`mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] ${SECONDARY_TEXT_CLASS}`}>
                    <span className="truncate">{target}</span>
                    <span className={`font-semibold tabular-nums ${DUE_TONE_CLASS[due.tone]}`}>{due.text}</span>
                    <span>{owner}</span>
                  </p>
                </>
              )
              return (
                <li key={task.id}>
                  {onOpenTask ? (
                    <button
                      type="button"
                      onClick={() => onOpenTask(task.id, task)}
                      className="block w-full min-w-0 rounded-xl bg-[#fafaf8] p-2.5 text-left transition-colors hover:bg-[#f0f0ec] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734]"
                    >
                      {content}
                    </button>
                  ) : (
                    <div className="rounded-xl bg-[#fafaf8] p-2.5">{content}</div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}

export type ActivityWeekSummaryProps = Omit<ActivityWeekSummaryViewProps, "tasks" | "onRetryTasks">

/** 단독 사용용 — 훅으로 직접 fetch 한다. CrmActivityClient 는 훅을 한 번 부르고 View 를 두 자리에 그린다. */
export default function ActivityWeekSummary(props: ActivityWeekSummaryProps) {
  const { state, reload } = useWeekOpenTasks(props.nowMs)
  return <ActivityWeekSummaryView {...props} tasks={state} onRetryTasks={() => reload(true)} />
}
