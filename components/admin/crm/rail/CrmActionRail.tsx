"use client"

// CRM 우측 액션 레일 — "생성 및 기록들 보기, 오른쪽 따로 스크롤".
// 구성(위→아래): ① 기록 빠른 생성(ActivityQuickForm 컴팩트) ② 오늘 할 일 요약(crm_tasks 상위 N)
// ③ 최근 기록 타임라인(targetId 딥링크). 데이터는 전부 자체 fetch(adminFetchJsonCached) —
// 부모와의 결합은 props(고객 프리셀렉트)와 onActivitySaved 콜백뿐이다.
//
// 스크롤: xl+에서 sticky + max-h(100dvh-오프셋) + overflow-y-auto로 본문과 독립 스크롤.
// (admin 레이아웃은 lg+에서 main이 스크롤 컨테이너 — body overflow-x sticky 함정과 무관)
// 모바일(<xl)은 섹션 스택 폴백: 각 섹션이 접이식 카드가 된다.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  Check,
  ChevronDown,
  History,
  ListChecks,
  Loader2,
  MoonStar,
  NotebookPen,
} from "lucide-react"

import { adminFetch, adminFetchJsonCached } from "@/lib/admin-client"
import { Skeleton } from "@/components/admin/viz"
import type { CrmTaskRecord, ListCrmTasksResult } from "@/lib/repositories/crm-tasks"

import ActivityQuickForm from "./ActivityQuickForm"
import {
  EVENTS_URL,
  formatDateTime,
  sourceLabel,
  type ActivityTargetType,
  type CrmEventsResponse,
} from "./activity-contract"
import { activityDeepLink, rankRailTasks, taskDueLabel } from "./rail-utils"

const TASKS_URL = "/api/admin/crm/tasks"
const RAIL_CACHE_TTL_MS = 30_000
const RAIL_TASK_LIMIT = 7
const RAIL_EVENT_LIMIT = 15

export interface CrmActionRailProps {
  /** 고객 프리셀렉트 — 대상 타입("lead" | "neo_account" | "customer" | "deal" | "unknown") */
  defaultTargetType?: ActivityTargetType
  /** 고객 프리셀렉트 — 대상 ID. 주면 할 일·최근 기록도 이 대상으로 스코프된다. */
  defaultTargetId?: string
  /** 고객 프리셀렉트 — 표시 이름(빠른 생성 폼 라벨) */
  customerName?: string
  /** 레일에서 기록 저장 성공 시 부모 갱신 콜백(타임라인 즉시 반영) */
  onActivitySaved?: () => void
  className?: string
}

const DUE_TONE: Record<"danger" | "caution" | "neutral", string> = {
  danger: "font-semibold text-[#B85C33]",
  caution: "font-semibold text-[#7A520F]",
  neutral: "text-[#1a1a1a]/45",
}

// 섹션 카드 — 모바일(<xl)에서는 헤더 탭으로 접고 펼치는 스택 폴백, xl+에서는 항상 펼침.
function RailSection({
  icon,
  title,
  caption,
  defaultOpenOnMobile = true,
  children,
}: {
  icon: ReactNode
  title: string
  caption?: string
  defaultOpenOnMobile?: boolean
  children: ReactNode
}) {
  const [mobileOpen, setMobileOpen] = useState(defaultOpenOnMobile)

  return (
    <section className="rounded-2xl border border-[#e8e8e4] bg-white">
      <button
        type="button"
        onClick={() => setMobileOpen((value) => !value)}
        aria-expanded={mobileOpen}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left xl:pointer-events-none"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="text-[#084734]">{icon}</span>
          <span className="min-w-0">
            <span className="block text-[13px] font-bold text-[#111110]">{title}</span>
            {caption ? <span className="mt-0.5 block truncate text-[11px] text-[#1a1a1a]/40">{caption}</span> : null}
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[#1a1a1a]/35 transition-transform xl:hidden ${mobileOpen ? "rotate-180" : ""}`}
        />
      </button>
      <div className={`border-t border-[#f0f0ec] px-4 pb-4 pt-3 ${mobileOpen ? "" : "hidden xl:block"}`}>{children}</div>
    </section>
  )
}

function RailHealthNotice({ message }: { message: string }) {
  return (
    <p className="flex items-start gap-1.5 rounded-xl border border-[#F6D5C5] bg-[#FEF3EE] px-3 py-2 text-[11px] text-[#B85C33]">
      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
      <span>{message}</span>
    </p>
  )
}

function RailSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="space-y-1.5">
          <Skeleton className="h-3.5 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  )
}

export default function CrmActionRail({
  defaultTargetType,
  defaultTargetId,
  customerName,
  onActivitySaved,
  className = "",
}: CrmActionRailProps) {
  const scopedTargetId = defaultTargetId?.trim() || ""

  const [tasks, setTasks] = useState<ListCrmTasksResult | null>(null)
  const [tasksLoading, setTasksLoading] = useState(true)
  const [tasksError, setTasksError] = useState<string | null>(null)
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null)

  const [recent, setRecent] = useState<CrmEventsResponse | null>(null)
  const [recentLoading, setRecentLoading] = useState(true)
  const [recentError, setRecentError] = useState<string | null>(null)

  const taskSeq = useRef(0)
  const recentSeq = useRef(0)

  const tasksUrl = `${TASKS_URL}?status=active&limit=30${scopedTargetId ? `&targetId=${encodeURIComponent(scopedTargetId)}` : ""}`
  const recentUrl = `${EVENTS_URL}?limit=${RAIL_EVENT_LIMIT}&offset=0${scopedTargetId ? `&targetId=${encodeURIComponent(scopedTargetId)}` : ""}`

  const loadTasks = useCallback(
    async (options?: { force?: boolean }) => {
      const requestId = ++taskSeq.current
      setTasksError(null)
      try {
        const data = await adminFetchJsonCached<ListCrmTasksResult>(
          options?.force ? `${tasksUrl}&force=1` : tasksUrl,
          undefined,
          { cacheKey: tasksUrl, ttlMs: RAIL_CACHE_TTL_MS, force: options?.force }
        )
        if (requestId !== taskSeq.current) return
        setTasks(data)
      } catch (error) {
        if (requestId !== taskSeq.current) return
        setTasksError(error instanceof Error ? error.message : "할 일을 불러오지 못했습니다.")
      } finally {
        if (requestId === taskSeq.current) setTasksLoading(false)
      }
    },
    [tasksUrl]
  )

  const loadRecent = useCallback(
    async (options?: { force?: boolean }) => {
      const requestId = ++recentSeq.current
      setRecentError(null)
      try {
        const data = await adminFetchJsonCached<CrmEventsResponse>(
          options?.force ? `${recentUrl}&force=1` : recentUrl,
          undefined,
          { cacheKey: recentUrl, ttlMs: RAIL_CACHE_TTL_MS, force: options?.force }
        )
        if (requestId !== recentSeq.current) return
        setRecent(data)
      } catch (error) {
        if (requestId !== recentSeq.current) return
        setRecentError(error instanceof Error ? error.message : "최근 기록을 불러오지 못했습니다.")
      } finally {
        if (requestId === recentSeq.current) setRecentLoading(false)
      }
    },
    [recentUrl]
  )

  useEffect(() => {
    void loadTasks()
  }, [loadTasks])

  useEffect(() => {
    void loadRecent()
  }, [loadRecent])

  // 상태 전이는 명시 액션 API만 사용한다(complete/snooze) — 임의 상태 PATCH 금지.
  const runTaskAction = useCallback(
    async (task: CrmTaskRecord, action: "complete" | "snooze") => {
      setPendingTaskId(task.id)
      try {
        const response = await adminFetch(`${TASKS_URL}/${encodeURIComponent(task.id)}`, {
          method: "PATCH",
          body: JSON.stringify({ action }),
        })
        const payload = await response.json().catch(() => null)
        if (!response.ok) {
          throw new Error(payload?.error ?? (action === "complete" ? "완료 처리에 실패했습니다." : "미루기에 실패했습니다."))
        }
        await loadTasks({ force: true })
      } catch (error) {
        setTasksError(error instanceof Error ? error.message : "할 일 처리에 실패했습니다.")
      } finally {
        setPendingTaskId(null)
      }
    },
    [loadTasks]
  )

  const handleSaved = useCallback(() => {
    // 저장된 기록이 할 일(tasksCreated)도 만들 수 있으므로 두 섹션 모두 강제 갱신.
    void loadRecent({ force: true })
    void loadTasks({ force: true })
    onActivitySaved?.()
  }, [loadRecent, loadTasks, onActivitySaved])

  const now = new Date()
  const railTasks = tasks ? rankRailTasks(tasks.rows, now, RAIL_TASK_LIMIT) : []

  return (
    <aside
      aria-label="CRM 액션 레일"
      className={`min-w-0 space-y-3 xl:sticky xl:top-6 xl:max-h-[calc(100dvh-3rem)] xl:self-start xl:overflow-y-auto xl:overscroll-contain xl:pb-6 ${className}`}
    >
      <RailSection
        icon={<NotebookPen className="h-4 w-4" />}
        title="기록 빠른 생성"
        caption={customerName ? `${customerName} 대상으로 저장` : "메모·회의록·녹음을 바로 남깁니다"}
      >
        <ActivityQuickForm
          compact
          defaultTargetType={defaultTargetType}
          defaultTargetId={scopedTargetId || undefined}
          defaultTargetLabel={customerName}
          onSaved={handleSaved}
        />
      </RailSection>

      <RailSection
        icon={<ListChecks className="h-4 w-4" />}
        title="오늘 할 일"
        caption="지남·오늘 마감 우선 · 미루기 기본 재개는 내일 오전 9시(KST)"
        defaultOpenOnMobile={false}
      >
        {tasksError ? <RailHealthNotice message={tasksError} /> : null}
        {!tasksError && tasks?.health.ok === false && tasks.health.message ? (
          <RailHealthNotice message={tasks.health.message} />
        ) : null}

        {tasksLoading && !tasks ? (
          <RailSkeleton rows={4} />
        ) : railTasks.length === 0 ? (
          <p className="py-3 text-center text-[12px] text-[#1a1a1a]/35">지금 처리할 할 일이 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {railTasks.map((task) => {
              const due = taskDueLabel(task, now)
              const pending = pendingTaskId === task.id
              return (
                <li key={task.id} className="rounded-xl bg-[#fafaf8] p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-semibold text-[#111110]">{task.title}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
                        <span className={DUE_TONE[due.tone]}>{due.text}</span>
                        {task.targetId ? (
                          <Link
                            href={activityDeepLink({
                              targetId: task.targetId,
                              targetType: task.targetType,
                              targetLabel: task.targetLabel,
                            })}
                            className="truncate text-[#084734] underline-offset-2 hover:underline"
                          >
                            {task.targetLabel ?? task.targetId}
                          </Link>
                        ) : task.targetLabel ? (
                          <span className="truncate text-[#1a1a1a]/45">{task.targetLabel}</span>
                        ) : null}
                        {task.ownerNameSnapshot ? (
                          <span className="text-[#1a1a1a]/35">{task.ownerNameSnapshot}</span>
                        ) : null}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {pending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-[#1a1a1a]/35" />
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => void runTaskAction(task, "complete")}
                            disabled={pendingTaskId != null}
                            title="완료"
                            aria-label={`${task.title} 완료`}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[#D7EBDD] bg-[#ECFDF5] text-[#084734] transition-colors hover:bg-[#D7EBDD] disabled:opacity-40"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void runTaskAction(task, "snooze")}
                            disabled={pendingTaskId != null}
                            title="미루기 — 내일 오전 9시(KST)에 다시"
                            aria-label={`${task.title} 미루기`}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[#e8e8e4] bg-white text-[#7A520F] transition-colors hover:bg-[#FBF1E0] disabled:opacity-40"
                          >
                            <MoonStar className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        <div className="mt-3 border-t border-[#f0f0ec] pt-2 text-right">
          <Link
            href="/admin/crm"
            className="text-[11px] font-semibold text-[#084734] underline-offset-2 hover:underline"
          >
            할 일 전체 보기
          </Link>
        </div>
      </RailSection>

      <RailSection
        icon={<History className="h-4 w-4" />}
        title="최근 기록"
        caption={scopedTargetId ? "이 고객의 최근 활동" : `최근 ${RAIL_EVENT_LIMIT}건`}
        defaultOpenOnMobile={false}
      >
        {recentError ? <RailHealthNotice message={recentError} /> : null}
        {!recentError && recent?.health.ok === false && recent.health.message ? (
          <RailHealthNotice message={recent.health.message} />
        ) : null}

        {recentLoading && !recent ? (
          <RailSkeleton rows={5} />
        ) : !recent || recent.rows.length === 0 ? (
          <p className="py-3 text-center text-[12px] text-[#1a1a1a]/35">아직 남긴 기록이 없습니다.</p>
        ) : (
          <ul className="space-y-1.5">
            {recent.rows.map((event) => {
              const meta = (
                <>
                  <span className="shrink-0 rounded-full bg-[#fafaf8] px-1.5 py-0.5 text-[10px] font-semibold text-[#1a1a1a]/45">
                    {sourceLabel(event.sourceType)}
                  </span>
                  <span className="shrink-0 text-[10px] text-[#1a1a1a]/35 tabular-nums">
                    {formatDateTime(event.occurredAt)}
                  </span>
                </>
              )
              const body = (
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-medium text-[#111110]">{event.title}</span>
                  <span className="block truncate text-[10px] text-[#1a1a1a]/40">
                    {event.targetLabel ?? "미연결 고객"}
                  </span>
                </span>
              )
              return (
                <li key={event.id}>
                  {event.targetId ? (
                    <Link
                      href={activityDeepLink({
                        targetId: event.targetId,
                        targetType: event.targetType,
                        targetLabel: event.targetLabel,
                      })}
                      className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-[#fafaf8]"
                    >
                      {body}
                      {meta}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-2 px-1.5 py-1.5">
                      {body}
                      {meta}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        <div className="mt-3 border-t border-[#f0f0ec] pt-2 text-right">
          <Link
            href={scopedTargetId ? activityDeepLink({ targetId: scopedTargetId, targetType: defaultTargetType, targetLabel: customerName }) : "/admin/crm/activity"}
            className="text-[11px] font-semibold text-[#084734] underline-offset-2 hover:underline"
          >
            기록 전체 보기
          </Link>
        </div>
      </RailSection>
    </aside>
  )
}
