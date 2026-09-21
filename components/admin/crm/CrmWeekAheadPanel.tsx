"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { CalendarClock, CheckCircle2, Clock3, Filter, ListTodo, RefreshCw } from "lucide-react"

import { adminFetchJson, adminFetchJsonCached, getCachedAdminJson } from "@/lib/admin-client"
import { CRM_CACHE_SWR_MS } from "@/lib/crm/client-cache"
import { runOptimistic } from "@/lib/crm/optimistic-update"
import { STATUS_TONE_CLASS, STATUS_TONE_TEXT_STRONG_CLASS } from "@/lib/crm/status-tone"
import {
  WEEK_AHEAD_PREVIEW_ROWS,
  budgetWeekAheadBuckets,
  classifyTaskBucket,
  kstDayStart,
  type WeekAheadBucket,
} from "@/lib/crm/week-ahead"
import type { CrmTaskRecord, ListCrmTasksResult } from "@/lib/repositories/crm-tasks"
import CrmNoticeBanner from "./CrmNoticeBanner"
import { INTERACTIVE_TEXT_CLASS, SECONDARY_TEXT_CLASS } from "./home/shared"
import { buildOwnerSelectOptions, useCrmOwners } from "./useCrmOwners"

const TTL_MS = 90_000
const CURRENT_OWNER_VALUE = "__me"
// 한 번에 불러오는 활성 할 일 상한(서버 최대 200). 넘치는 건수는 summary.total로 화면에 알린다.
const FETCH_LIMIT = 100
// 담당자 해석 관찰용 — useCrmOwners와 동일 URL·cacheKey·TTL(인플라이트 공유, 추가 네트워크 없음).
const OWNERS_URL = "/api/admin/crm/owners"
const OWNERS_TTL_MS = 120_000
/** '완료'·'내일로' 성공 배너의 되돌리기 버튼이 살아 있는 시간(UX 규약 1). */
export const WEEK_AHEAD_UNDO_WINDOW_MS = 8_000
/**
 * 낙관 반영(행 제거·미루기)을 서버 응답 위에 덧씌우는 시간. 할 일 저장소는 쓰기 뒤
 * revalidateTag(tag, "max")(SWR)라 force 없는 재검증이 처리 전 행을 한 번 더 돌려줄 수 있다.
 * 헤더 새로고침(force)은 이 목록을 비운다.
 */
const OVERRIDE_MS = 120_000
const DAY_MS = 24 * 60 * 60 * 1000
const KST_MORNING_OFFSET_MS = 9 * 60 * 60 * 1000

const BUCKET_LABEL: Record<WeekAheadBucket, string> = {
  overdue: "지연",
  today: "오늘",
  week: "이번 주",
  snoozed: "미룬 일",
  nodue: "기한 없음",
  later: "이후",
}
// 버킷 헤더 색 — 상태색은 lib/crm/status-tone.ts 토큰, 보조 정보는 SECONDARY_TEXT_CLASS(UX 규약 6).
const BUCKET_TONE: Record<WeekAheadBucket, string> = {
  overdue: STATUS_TONE_TEXT_STRONG_CLASS.danger,
  today: "text-[#084734]",
  week: "text-[#111110]",
  snoozed: STATUS_TONE_TEXT_STRONG_CLASS.warning,
  nodue: SECONDARY_TEXT_CLASS,
  later: SECONDARY_TEXT_CLASS,
}

function formatDay(value: string | null) {
  if (!value) return "기한 없음"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "기한 없음"
  return new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit", weekday: "short" }).format(date)
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date)
}

// 미루기 기본값(내일 09:00 KST) — 서버 defaultSnoozeUntil(lib/repositories/crm-tasks.ts)과 같은 규칙.
// 낙관 반영에만 쓰고 서버에는 보내지 않는다(서버가 자기 시각으로 계산).
function tomorrowMorningIso(nowMs = Date.now()) {
  return new Date(kstDayStart(nowMs) + DAY_MS + KST_MORNING_OFFSET_MS).toISOString()
}

function errorDetail(err: unknown) {
  return err instanceof Error && err.message ? err.message : "알 수 없는 오류"
}

// ─── 순수 헬퍼(export — tests/crm/week-ahead-optimistic.test.tsx) ─────────────

/** 행 낙관 제거 — summary.total도 함께 줄여 "이 밖에 N건 더 있음" 문구가 어긋나지 않게 한다. */
export function removeTaskRow(data: ListCrmTasksResult | null, taskId: string): ListCrmTasksResult | null {
  if (!data) return data
  if (!data.rows.some((row) => row.id === taskId)) return data
  return {
    ...data,
    rows: data.rows.filter((row) => row.id !== taskId),
    summary: {
      ...data.summary,
      total: Math.max(0, data.summary.total - 1),
      returned: Math.max(0, data.summary.returned - 1),
    },
  }
}

/** 행 필드 낙관 반영(미루기 등). 없는 행이면 그대로. */
export function patchTaskRow(
  data: ListCrmTasksResult | null,
  taskId: string,
  patch: Partial<CrmTaskRecord>
): ListCrmTasksResult | null {
  if (!data) return data
  if (!data.rows.some((row) => row.id === taskId)) return data
  return { ...data, rows: data.rows.map((row) => (row.id === taskId ? { ...row, ...patch } : row)) }
}

/** 되돌리기·롤백 뒤 행 복원 — 있으면 원본 값으로 교체, 없으면 다시 넣는다(정렬은 버킷 분류가 한다). */
export function restoreTaskRow(data: ListCrmTasksResult | null, task: CrmTaskRecord): ListCrmTasksResult | null {
  if (!data) return data
  if (data.rows.some((row) => row.id === task.id)) {
    return { ...data, rows: data.rows.map((row) => (row.id === task.id ? task : row)) }
  }
  return {
    ...data,
    rows: [...data.rows, task],
    summary: { ...data.summary, total: data.summary.total + 1, returned: data.summary.returned + 1 },
  }
}

/**
 * 미루기 되돌리기 2단계(기한 복원) PATCH 바디. 원래 기한이 없던 할 일은 dueAt: null을 명시해 서버가
 * due_at을 지우게 한다 — undefined로 두면 JSON.stringify가 키를 빼 "그대로"(내일 09:00 유지)가 된다.
 */
export function buildDueAtRestoreBody(task: Pick<CrmTaskRecord, "dueAt">): { action: "update"; dueAt: string | null } {
  return { action: "update", dueAt: task.dueAt ?? null }
}

/** 기한 복원 성공 문구 — 원래 기한이 없던 할 일은 기한 없음으로 돌아갔다고 밝힌다. */
export function snoozeUndoRestoredMessage(task: Pick<CrmTaskRecord, "title" | "dueAt">): string {
  return task.dueAt
    ? `'${task.title}' 미루기를 되돌렸습니다 — 기한 ${formatDateTime(task.dueAt)}로 복원.`
    : `'${task.title}' 미루기를 되돌렸습니다 — 원래대로 기한 없는 할 일입니다.`
}

/** 화면에 그리는 행 순서(버킷 순 · 예산 적용). 포커스 이동 계산과 렌더가 같은 규칙을 쓴다. */
export function visibleTaskOrder(rows: CrmTaskRecord[], budget: number | null, nowMs: number): string[] {
  const map: Record<WeekAheadBucket, CrmTaskRecord[]> = { overdue: [], today: [], week: [], snoozed: [], nodue: [], later: [] }
  for (const task of rows) map[classifyTaskBucket(task, nowMs)].push(task)
  return budgetWeekAheadBuckets(map, budget).slices.flatMap((slice) => slice.tasks.map((task) => task.id))
}

/** 행이 빠진 뒤 포커스를 옮길 행 id — 같은 자리, 없으면 앞 행, 그것도 없으면 null(heading). */
export function focusTargetAfterTaskRemoval(
  rows: CrmTaskRecord[],
  removedId: string,
  budget: number | null,
  nowMs: number
): string | null {
  const before = visibleTaskOrder(rows, budget, nowMs)
  const index = before.indexOf(removedId)
  const after = visibleTaskOrder(
    rows.filter((row) => row.id !== removedId),
    budget,
    nowMs
  )
  if (after.length === 0) return null
  const at = index < 0 ? 0 : Math.min(index, after.length - 1)
  return after[at] ?? null
}

type TaskOverride = { until: number; patch: Partial<CrmTaskRecord> | null }

interface PanelNotice {
  tone: "success" | "warning"
  message: string
  undo?: { run: () => Promise<void> }
}

interface PanelError {
  message: string
  retry?: () => void
}

function TaskRowsSkeleton() {
  return (
    <div className="space-y-1.5" aria-hidden>
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={`sk-${index}`} className="flex items-center justify-between gap-2 rounded-xl bg-[#fafaf8] px-3 py-2">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="h-3.5 w-1/2 animate-pulse rounded bg-[#f0f0ec]" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-[#f0f0ec]" />
          </div>
          <div className="h-7 w-14 animate-pulse rounded-lg bg-[#f0f0ec]" />
        </div>
      ))}
    </div>
  )
}

export default function CrmWeekAheadPanel({
  compact = false,
  embedded = false,
  previewRows = WEEK_AHEAD_PREVIEW_ROWS,
  refreshKey = 0,
  softRefreshKey = 0,
}: {
  compact?: boolean
  embedded?: boolean
  /** 접힌 상태에서 그릴 할 일 행 수(버킷 합산). 나머지는 "+N건 더 보기"로 펼친다. */
  previewRows?: number
  /** 값이 바뀌면 캐시를 건너뛰고 다시 조회한다(홈 새로고침 연동). */
  refreshKey?: number
  /** 값이 바뀌면 force 없이 다시 조회한다 — TTL 이 지난 경우에만 네트워크를 탄다(홈 자동 갱신). */
  softRefreshKey?: number
}) {
  const [expanded, setExpanded] = useState(false)
  const { owners: crmOwners, currentOwner } = useCrmOwners()
  // 홈 큐(CrmPriorityQueuePanel)와 같은 디렉터리 기반 담당자 목록 — 할 일 응답에는 담당자 집계가
  // 없으므로 건수 없이 이름·역할만 쓴다. 값(ownerKey)은 /api/admin/crm/tasks?owner= 가 그대로
  // owner_key 필터로 받는다.
  const ownerOptions = useMemo(() => buildOwnerSelectOptions(undefined, crmOwners), [crmOwners])
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
      staleWhileRevalidateMs: CRM_CACHE_SWR_MS,
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
  const [error, setError] = useState<PanelError | null>(null)
  const [refreshWarning, setRefreshWarning] = useState<string | null>(null)
  const [actingId, setActingId] = useState<string | null>(null)
  const [notice, setNotice] = useState<PanelNotice | null>(null)
  const [undoPending, setUndoPending] = useState(false)
  // 항상 마운트된 SR 통지 영역(UX 규약 7).
  const [liveMessage, setLiveMessage] = useState("")
  const [focusRequest, setFocusRequest] = useState<{ taskId: string | null; seq: number } | null>(null)

  const overridesRef = useRef(new Map<string, TaskOverride>())
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rowRefs = useRef(new Map<string, HTMLDivElement>())
  const headingRef = useRef<HTMLHeadingElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  const url = useMemo(() => {
    const params = new URLSearchParams({ status: "active", limit: String(FETCH_LIMIT) })
    if (owner) params.set("owner", owner)
    return `/api/admin/crm/tasks?${params.toString()}`
  }, [owner])

  // 낙관 반영을 서버 응답 위에 덧씌운다(OVERRIDE_MS 참고).
  const withOverrides = useCallback((next: ListCrmTasksResult | null) => {
    if (!next) return next
    const map = overridesRef.current
    if (map.size === 0) return next
    const now = Date.now()
    for (const [id, entry] of map) if (entry.until <= now) map.delete(id)
    if (map.size === 0) return next
    let result: ListCrmTasksResult | null = next
    for (const [id, entry] of map) {
      result = entry.patch === null ? removeTaskRow(result, id) : patchTaskRow(result, id, entry.patch)
    }
    return result
  }, [])
  const setOverride = useCallback((taskId: string, patch: Partial<CrmTaskRecord> | null) => {
    overridesRef.current.set(taskId, { until: Date.now() + OVERRIDE_MS, patch })
  }, [])
  const clearOverride = useCallback((taskId: string) => {
    overridesRef.current.delete(taskId)
  }, [])

  // 담당자를 바꾸면 요청이 겹친다. 늦게 끝난 이전 요청이 최신 목록을 덮어쓰지 않도록
  // 마지막 요청만 상태에 반영한다.
  const requestSeq = useRef(0)

  const load = useCallback(
    async (options?: { force?: boolean; background?: boolean }) => {
      const seq = ++requestSeq.current
      const isLatest = () => requestSeq.current === seq
      const force = Boolean(options?.force)
      // background: 쓰기 성공 뒤 재검증 — 목록·오류 배너를 건드리지 않고 도착한 값만 반영(force 없음).
      const background = Boolean(options?.background) && !force

      if (force) overridesRef.current.clear()
      if (!background) {
        const cached = getCachedAdminJson<ListCrmTasksResult>(url, { cacheKey: url })
        if (cached && !force) setData(withOverrides(cached))
        setLoading(!cached)
        setError(null)
      }
      setRefreshing(force)
      setRefreshWarning(null)
      try {
        const next = await adminFetchJsonCached<ListCrmTasksResult>(
          force ? `${url}&force=1` : url,
          undefined,
          {
            cacheKey: url,
            ttlMs: TTL_MS,
            staleWhileRevalidateMs: CRM_CACHE_SWR_MS,
            force,
            onRevalidated: ({ data: fresh }) => {
              if (fresh && isLatest()) setData(withOverrides(fresh))
            },
          }
        )
        if (!isLatest()) return
        setData(withOverrides(next))
      } catch (err) {
        if (!isLatest()) return
        const detail = err instanceof Error ? err.message : "이번 주 할 일을 불러오지 못했습니다."
        if (background) {
          setRefreshWarning(`할 일 목록 갱신에 실패했습니다(${detail}). 표시된 목록은 처리 전 기준일 수 있습니다.`)
        } else {
          setError({ message: detail, retry: () => void load({ force: true }) })
        }
      } finally {
        if (isLatest()) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    },
    [url, withOverrides]
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

  // 백그라운드 자동 갱신(홈의 60초 가시 구간 틱) — force 없이, 목록·오류 배너를 건드리지 않는
  // background 재검증으로 돈다: 캐시가 신선하면 네트워크 없이 끝나고, 실패해도 목록을 비우지 않는다.
  const lastSoftRefreshKey = useRef(softRefreshKey)
  useEffect(() => {
    if (!ownersSettled) return
    if (lastSoftRefreshKey.current === softRefreshKey) return
    lastSoftRefreshKey.current = softRefreshKey
    void load({ background: true })
  }, [load, ownersSettled, softRefreshKey])

  useEffect(() => () => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current)
  }, [])

  // 처리 뒤 포커스 이동 — 사라진 행 자리의 다음 행 첫 버튼, 없으면 섹션 heading(tabIndex=-1).
  useEffect(() => {
    if (!focusRequest) return
    const row = focusRequest.taskId ? rowRefs.current.get(focusRequest.taskId) : null
    const target = row?.querySelector<HTMLElement>("button:not([disabled])") ?? headingRef.current ?? listRef.current
    target?.focus()
  }, [focusRequest])

  const announce = useCallback((text: string) => setLiveMessage(text), [])
  const requestFocus = useCallback((taskId: string | null) => {
    setFocusRequest((prev) => ({ taskId, seq: (prev?.seq ?? 0) + 1 }))
  }, [])
  const showNotice = useCallback((next: PanelNotice) => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current)
    setNotice(next)
    if (next.undo) {
      // 되돌리기 창이 닫히면 버튼만 거둔다 — 성공 문구는 다음 처리·닫기 전까지 남긴다.
      noticeTimerRef.current = setTimeout(() => {
        setNotice((current) => (current === next ? { tone: next.tone, message: next.message } : current))
      }, WEEK_AHEAD_UNDO_WINDOW_MS)
    }
  }, [])

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

  // 미루기 되돌리기 2단계 — 기한 복원(update dueAt)만. reopen은 이미 서버에 반영·화면에 그려진 뒤라
  // 여기서 실패해도 행은 "다시 열림 + 기한 내일"인 서버 상태 그대로 두고, 기한만 좁게 재시도한다.
  // (reopenCrmTask는 due_at을 건드리지 않아 이 PATCH가 실제로 필요하다.) 원래 기한이 없던 할 일도
  // 건너뛰지 않는다 — dueAt: null로 보내 미루기가 채운 내일 09:00을 지운다(buildDueAtRestoreBody).
  const restoreTaskDueAt = useCallback(
    async (task: CrmTaskRecord, reopened: CrmTaskRecord) => {
      const taskUrl = `/api/admin/crm/tasks/${encodeURIComponent(task.id)}`
      const body = buildDueAtRestoreBody(task)
      setActingId(`${task.id}:restore-due`)
      setError(null)
      try {
        await adminFetchJson(taskUrl, { method: "PATCH", body: JSON.stringify(body) })
        setData((prev) => restoreTaskRow(prev, { ...reopened, dueAt: body.dueAt }))
        const message = snoozeUndoRestoredMessage(task)
        showNotice({ tone: "success", message })
        announce(message)
        requestFocus(task.id)
        void load({ background: true })
      } catch (err) {
        // 부분 실패: 행은 다시 열렸지만 기한은 내일로 남아 있다 — 성공과 섞지 않고 범위를 밝힌다.
        const target = task.dueAt ? `기한(${formatDateTime(task.dueAt)}) 복원` : "기한 지우기(원래 기한 없음)"
        const message = `'${task.title}' 할 일은 다시 열었지만 ${target}에 실패했습니다(${errorDetail(err)}). 기한이 내일 오전 9시로 남아 있습니다 — 기한만 다시 시도하거나 할 일 화면에서 고치세요.`
        setError({ message, retry: () => void restoreTaskDueAt(task, reopened) })
        announce(message)
      } finally {
        setActingId(null)
      }
    },
    [announce, load, requestFocus, showNotice]
  )

  // 되돌리기: 완료 → reopen. 미루기 → reopen 뒤 이전 기한 복원(restoreTaskDueAt, 별도 단계).
  // reopen이 성공하면 그 즉시 로컬 상태를 서버와 맞추고(override 해제 + 행 복원), 두 번째 PATCH의
  // 실패는 부분 실패로 따로 다룬다 — 한 try에 묶으면 두 번째만 실패했을 때 화면(미룬 일)과 서버(open)가
  // 어긋난 채 override TTL까지 남는다. 기한이 없던 할 일도 2단계를 탄다 — 서버 update가 dueAt: null을
  // "기한 지움"으로 받으므로(app/api/admin/crm/tasks/[id]/route.ts) 기한 없음까지 정확히 되돌린다.
  const undoTaskAction = useCallback(
    async (task: CrmTaskRecord, action: "complete" | "snooze") => {
      const taskUrl = `/api/admin/crm/tasks/${encodeURIComponent(task.id)}`
      setUndoPending(true)
      setError(null)
      try {
        await adminFetchJson(taskUrl, { method: "PATCH", body: JSON.stringify({ action: "reopen" }) })
      } catch (err) {
        setUndoPending(false)
        setError({
          message: `되돌리기에 실패했습니다(${errorDetail(err)}). 할 일 화면에서 상태를 확인하세요.`,
          retry: () => void undoTaskAction(task, action),
        })
        return
      }
      // reopen 반영: 서버는 status/snoozed_until/completed_*만 되돌린다. 미루기였다면 due_at은
      // 아직 미룬 값(낙관 패치에 쓴 내일 09:00)이다.
      const snoozedDueAt = overridesRef.current.get(task.id)?.patch?.dueAt ?? tomorrowMorningIso()
      const reopened: CrmTaskRecord = {
        ...task,
        status: "open",
        snoozedUntil: null,
        completedAt: null,
        completedBy: null,
        dueAt: action === "snooze" ? snoozedDueAt : task.dueAt,
      }
      clearOverride(task.id)
      setData((prev) => restoreTaskRow(prev, reopened))
      // 되돌리기 버튼이 달린 성공 배너는 소비됐다 — 다음 단계 결과(성공/부분 실패)가 대신한다.
      setNotice(null)
      setUndoPending(false)

      if (action === "snooze") {
        await restoreTaskDueAt(task, reopened)
        return
      }
      const message = `'${task.title}' 완료를 되돌렸습니다 — 다시 열린 할 일입니다.`
      showNotice({ tone: "success", message })
      announce(message)
      requestFocus(task.id)
      void load({ background: true })
    },
    [announce, clearOverride, load, requestFocus, restoreTaskDueAt, showNotice]
  )

  const handleAction = useCallback(
    async (task: CrmTaskRecord, action: "complete" | "snooze") => {
      const rows = data?.rows ?? []
      const budget = expanded ? null : previewRows
      const nextFocusId = action === "complete" ? focusTargetAfterTaskRemoval(rows, task.id, budget, Date.now()) : task.id
      const snoozePatch: Partial<CrmTaskRecord> = {
        status: "snoozed",
        snoozedUntil: tomorrowMorningIso(),
        dueAt: tomorrowMorningIso(),
      }
      const actionLabel = action === "complete" ? "완료" : "내일로 미루기"

      setActingId(`${task.id}:${action}`)
      setNotice(null)
      setError(null)
      const result = await runOptimistic<ListCrmTasksResult | null>({
        snapshot: () => data,
        apply: () => {
          if (action === "complete") {
            setOverride(task.id, null)
            setData((prev) => removeTaskRow(prev, task.id))
          } else {
            setOverride(task.id, snoozePatch)
            setData((prev) => patchTaskRow(prev, task.id, snoozePatch))
          }
        },
        commit: () =>
          adminFetchJson(`/api/admin/crm/tasks/${encodeURIComponent(task.id)}`, {
            method: "PATCH",
            body: JSON.stringify(
              action === "complete" ? { action: "complete", outcome: "주간 작업대에서 완료" } : { action: "snooze" }
            ),
          }),
        rollback: (saved) => {
          clearOverride(task.id)
          setData((current) => restoreTaskRow(current ?? saved, task))
        },
        onError: (err) => {
          const message = `'${task.title}' ${actionLabel} 처리에 실패했습니다(${errorDetail(err)}). 행을 원래대로 두었습니다.`
          setError({ message, retry: () => void handleAction(task, action) })
          announce(message)
        },
      })
      setActingId(null)
      if (!result.ok) {
        requestFocus(task.id)
        return
      }
      const message =
        action === "complete"
          ? `'${task.title}' 할 일을 완료 처리했습니다.`
          : `'${task.title}' 할 일을 내일 오전 9시로 미뤘습니다.`
      showNotice({ tone: "success", message, undo: { run: () => undoTaskAction(task, action) } })
      announce(action === "complete" ? `${message} 다음 행으로 이동합니다.` : message)
      requestFocus(nextFocusId)
      void load({ background: true })
    },
    [announce, clearOverride, data, expanded, load, previewRows, requestFocus, setOverride, showNotice, undoTaskAction]
  )

  const sourceDown = data != null && !data.health.ok

  return (
    <section className={embedded ? "" : `rounded-2xl border border-[#e8e8e4] bg-white p-4 ${compact ? "" : "mb-4"}`}>
      <div className={`mb-3 flex flex-col gap-2 ${compact || embedded ? "" : "sm:flex-row sm:items-center sm:justify-between"}`}>
        {embedded ? null : (
          <div className="flex items-center gap-2">
            <span className={`flex h-8 w-8 items-center justify-center rounded-lg bg-[#fafaf8] ${SECONDARY_TEXT_CLASS}`}>
              <ListTodo className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <h2 ref={headingRef} tabIndex={-1} className="text-[15px] font-bold text-[#111110] outline-none">
                이번 주 해야 할 일
              </h2>
              {data?.generatedAt ? (
                <p className={`text-[11px] ${SECONDARY_TEXT_CLASS}`}>기준 {formatDateTime(data.generatedAt)}</p>
              ) : null}
            </div>
          </div>
        )}
        <div className="flex items-center gap-2">
          <label className={`flex h-9 items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[12px] ${SECONDARY_TEXT_CLASS}`}>
            <Filter className="h-3.5 w-3.5" />
            <select
              value={owner}
              onChange={(event) => setOwnerChoice(event.target.value)}
              className="h-full bg-transparent text-[12px] font-semibold text-[#111110] outline-none"
              aria-label="담당자 필터"
            >
              {currentOwner ? <option value={CURRENT_OWNER_VALUE}>내 담당</option> : null}
              <option value="">전체</option>
              {ownerOptions.map((option) => (
                <option key={option.ownerName} value={option.ownerName}>
                  {option.label}
                  {option.teamRoleLabel ? ` · ${option.teamRoleLabel}` : ""}
                </option>
              ))}
            </select>
          </label>
          {/* force 재조회는 이 명시 새로고침 버튼(과 실패 재시도)에만 남긴다(UX 규약 2). */}
          <button
            type="button"
            onClick={() => {
              // owner settle 전 클릭 시 전체 스코프 URL로 한 번 새는 것 방지(코덱스 리뷰 P2)
              if (!ownersSettled) return
              void load({ force: true })
            }}
            disabled={refreshing || !ownersSettled}
            aria-busy={refreshing || undefined}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            새로고침
          </button>
        </div>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {liveMessage}
      </p>

      {error ? (
        <CrmNoticeBanner
          tone="danger"
          className="mb-3"
          message={error.message}
          action={error.retry ? { label: "다시 시도", onClick: error.retry, pending: actingId != null || refreshing } : undefined}
          onDismiss={() => setError(null)}
        />
      ) : null}

      {refreshWarning ? (
        <CrmNoticeBanner
          tone="warning"
          className="mb-3"
          message={refreshWarning}
          action={{ label: "다시 시도", onClick: () => void load({ force: true }), pending: refreshing }}
          onDismiss={() => setRefreshWarning(null)}
        />
      ) : null}

      {notice ? (
        <CrmNoticeBanner
          tone={notice.tone}
          className="mb-3"
          message={notice.message}
          action={notice.undo ? { label: "되돌리기", onClick: () => void notice.undo?.run(), pending: undoPending } : undefined}
          onDismiss={() => setNotice(null)}
        />
      ) : null}

      {/* 소스 실패는 "할 일 없음"과 다른 상태 — 서버는 실패 시 health.ok=false, rows=[]로 200을 준다.
          Danger 톤 alert + 재시도로 그리고 아래 빈 상태 문구는 건너뛴다. */}
      {sourceDown ? (
        <CrmNoticeBanner
          tone="danger"
          className="mb-3"
          title="할 일 목록을 확인할 수 없습니다"
          message={data?.health.message ?? "할 일 저장소 응답이 실패했습니다 — 할 일이 없는 것이 아니라 확인할 수 없는 상태입니다."}
          action={{ label: "다시 시도", onClick: () => void load({ force: true }), pending: refreshing }}
        />
      ) : null}

      <div ref={listRef} tabIndex={-1} className="outline-none">
        {loading && !data ? (
          <TaskRowsSkeleton />
        ) : !data ? (
          // 요청 자체가 실패해 data가 없다 — 빈 본문 대신 "확인 불가"와 재시도를 그린다.
          <div className="px-4 py-6 text-center">
            <p className={`text-[13px] font-semibold ${STATUS_TONE_TEXT_STRONG_CLASS.danger}`}>
              이번 주 할 일을 불러오지 못했습니다 — 할 일이 없는 것이 아니라 확인할 수 없는 상태입니다.
            </p>
            <button
              type="button"
              onClick={() => void load({ force: true })}
              disabled={refreshing || !ownersSettled}
              aria-busy={refreshing || undefined}
              className={`mt-3 inline-flex min-h-11 items-center rounded-lg border bg-white px-3 text-[12px] font-semibold disabled:opacity-50 sm:h-8 sm:min-h-0 ${STATUS_TONE_CLASS.danger}`}
            >
              다시 시도
            </button>
          </div>
        ) : data.rows.length === 0 ? (
          sourceDown ? null : (
            <div className={`p-6 text-center text-[13px] ${SECONDARY_TEXT_CLASS}`}>
              열린 할 일이 없습니다 — 처리할 것이 없다는 뜻이며 데이터 누락이 아닙니다.
            </div>
          )
        ) : (
          <div className="space-y-3">
            {budgeted.slices.map(({ bucket, tasks, total }) => (
              <div key={bucket}>
                {/* 헤더 카운트는 잘라내기 전 버킷 총량 — 미리보기가 총량을 숨기지 않게 한다 */}
                <p className={`mb-1.5 text-[11px] font-bold uppercase tracking-[0.06em] ${BUCKET_TONE[bucket]}`}>
                  {BUCKET_LABEL[bucket]} ({total})
                </p>
                <div className="space-y-1.5">
                  {tasks.map((task) => {
                    // complete·snooze·restore-due(되돌리기 2단계) 모두 같은 행의 연타를 막는다.
                    const acting = actingId?.startsWith(`${task.id}:`) === true
                    return (
                      <div
                        key={task.id}
                        ref={(node) => {
                          if (node) rowRefs.current.set(task.id, node)
                          else rowRefs.current.delete(task.id)
                        }}
                        data-task-row={task.id}
                        className="flex items-center justify-between gap-2 rounded-xl bg-[#fafaf8] px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-[12px] font-semibold text-[#111110]">{task.title}</p>
                          <p className={`truncate text-[11px] ${SECONDARY_TEXT_CLASS}`}>
                            <CalendarClock className="mr-1 inline h-3 w-3" aria-hidden />
                            {formatDay(task.dueAt)}
                            {task.targetLabel ? ` · ${task.targetLabel}` : ""}
                            {task.ownerNameSnapshot ? ` · ${task.ownerNameSnapshot}` : ""}
                          </p>
                        </div>
                        {/* 44px 터치 타깃은 홈 루트가 강제한다(home-shell). 여기서는 버튼 간격만 둔다. */}
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleAction(task, "complete")}
                            disabled={acting}
                            aria-busy={acting || undefined}
                            className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#D7EBDD] bg-[#ECFDF5] px-2 text-[11px] font-semibold text-[#084734] transition-colors hover:bg-[#D7EBDD] disabled:opacity-50"
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            {actingId === `${task.id}:complete` ? "완료 중" : "완료"}
                          </button>
                          {bucket !== "snoozed" ? (
                            <button
                              type="button"
                              onClick={() => void handleAction(task, "snooze")}
                              disabled={acting}
                              aria-busy={acting || undefined}
                              className={`inline-flex h-7 items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[11px] font-semibold transition-colors hover:bg-[#f5f5f2] disabled:opacity-50 ${INTERACTIVE_TEXT_CLASS}`}
                            >
                              <Clock3 className="h-3 w-3" />
                              {actingId === `${task.id}:snooze` ? "옮기는 중" : "내일로"}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}

            {budgeted.totalCount > previewRows ? (
              <button
                type="button"
                onClick={() => setExpanded((value) => !value)}
                aria-expanded={expanded}
                className={`w-full rounded-xl border border-[#e8e8e4] bg-white py-2 text-[12px] font-semibold transition-colors hover:border-[#c8c8c4] hover:text-[#111110] ${INTERACTIVE_TEXT_CLASS}`}
              >
                {expanded
                  ? `접기 · 상위 ${previewRows}건만`
                  : `+${budgeted.hiddenCount}건 더 보기 · 전체 ${budgeted.totalCount}건`}
              </button>
            ) : null}

            {/* 서버에서 잘린 건수 — 불러온 행보다 활성 할 일 총량(summary.total)이 크면 숨기지 않고 알린다. */}
            {data.summary.total > data.rows.length ? (
              <p className={`text-[11px] ${SECONDARY_TEXT_CLASS}`}>
                이 밖에 {(data.summary.total - data.rows.length).toLocaleString("ko-KR")}건 더 있음 · 활성 할 일{" "}
                {data.summary.total.toLocaleString("ko-KR")}건 중 상위 {data.rows.length.toLocaleString("ko-KR")}건만 표시
              </p>
            ) : null}
          </div>
        )}
      </div>
    </section>
  )
}
