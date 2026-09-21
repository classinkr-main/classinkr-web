"use client"

import { useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import { AlertTriangle, CalendarClock, ListChecks, Loader2, MoonStar, Plus } from "lucide-react"

import { Panel, StatTile, TableEmpty } from "@/components/admin/viz"
import { Toast } from "@/components/admin/crm/leads/shared"
import { MOBILE_TOUCH_TARGET_CLASS } from "@/components/admin/crm/home/shared"
import { adminFetchJson } from "@/lib/admin-client"
import { runOptimistic } from "@/lib/crm/optimistic-update"
import { buildTaskPresetPayload, TASK_QUICK_PRESETS, type TaskQuickPreset } from "@/lib/crm/task-quick-presets"
import type { CrmTaskRecord, CrmTaskTargetType, ListCrmTasksResult } from "@/lib/repositories/crm-tasks"

import {
  formatDateTime,
  TASK_PRIORITY_CLASS,
  TASK_PRIORITY_LABEL,
  TASK_STATUS_LABEL,
  TASK_TYPE_LABEL,
} from "./Customer360DetailShared"

// 되돌리기 배너가 살아 있는 시간(UX 규약 — CrmPriorityQueuePanel.QUEUE_UNDO_WINDOW_MS와 같은 값).
// 이 파일은 그 컴포넌트를 소유하지 않아(홈·큐 파트 소유) 상수만 로컬로 맞춘다.
const QUICK_ADD_UNDO_WINDOW_MS = 8_000

function statusClass(status: string): string {
  if (status === "done") return "border-[#D7EBDD] bg-[#ECFDF5] text-[#084734]"
  if (status === "canceled") return "border-[#e8e8e4] bg-[#f0f0ec] text-[#1a1a1a]/45"
  if (status === "snoozed") return "border-[#ECD29C] bg-[#FBF1E0] text-[#7A520F]"
  return "border-[#e8e8e4] bg-white text-[#1a1a1a]/55"
}

// 마감 지남 여부 — 열린 태스크의 due_at이 현재보다 과거이면 강조.
function isOverdue(task: CrmTaskRecord): boolean {
  if (task.status !== "open" || !task.dueAt) return false
  const time = new Date(task.dueAt).getTime()
  return !Number.isNaN(time) && time < Date.now()
}

function TaskRow({ task }: { task: CrmTaskRecord }) {
  const overdue = isOverdue(task)
  return (
    <li className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-bold text-[#111110]">{task.title}</p>
          {task.detail ? <p className="mt-0.5 text-[12px] leading-relaxed text-[#1a1a1a]/55">{task.detail}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${TASK_PRIORITY_CLASS[task.priority] ?? ""}`}>
            {TASK_PRIORITY_LABEL[task.priority] ?? task.priority}
          </span>
          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusClass(task.status)}`}>
            {TASK_STATUS_LABEL[task.status] ?? task.status}
          </span>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#1a1a1a]/45">
        <span className="inline-flex items-center gap-1 rounded-full bg-[#fafaf8] px-2 py-0.5 font-semibold text-[#1a1a1a]/55">
          {TASK_TYPE_LABEL[task.taskType] ?? task.taskType}
        </span>
        <span className={`inline-flex items-center gap-1 ${overdue ? "font-semibold text-[#B85C33]" : ""}`}>
          <CalendarClock className="h-3 w-3" />
          {task.dueAt ? formatDateTime(task.dueAt) : "기한 없음"}
          {overdue ? " · 지남" : ""}
        </span>
        {task.snoozedUntil ? (
          <span className="inline-flex items-center gap-1">
            <MoonStar className="h-3 w-3" />
            재개 {formatDateTime(task.snoozedUntil)}
          </span>
        ) : null}
        {task.ownerNameSnapshot ? <span>· {task.ownerNameSnapshot}</span> : null}
      </div>
    </li>
  )
}

interface TaskTarget {
  targetType: CrmTaskTargetType
  targetId: string
}

// 360 상세 라우트(app/admin/crm/customers/[key]/page.tsx)의 key 세그먼트를 태스크 대상으로
// 해석한다. lib/repositories/crm-customer-360.ts의 parseUnifiedCustomerKey와 같은 규칙(첫 ':'에서만
// 분리, lead/neo 접두사)이지만, 그 모듈은 "server-only"라 클라이언트 컴포넌트가 값으로 import할 수
// 없어 여기서 같은 규칙을 다시 둔다.
function parseTaskTargetFromKey(raw: string | string[] | undefined): TaskTarget | null {
  const key = Array.isArray(raw) ? raw[0] : raw
  if (!key) return null
  const idx = key.indexOf(":")
  if (idx <= 0) return null
  const source = key.slice(0, idx)
  const entityId = key.slice(idx + 1).trim()
  if (!entityId) return null
  if (source === "lead") return { targetType: "lead", targetId: entityId }
  if (source === "neo") return { targetType: "neo_account", targetId: entityId }
  return null
}

function buildOptimisticTaskRow(payload: ReturnType<typeof buildTaskPresetPayload>, tempId: string, nowIso: string): CrmTaskRecord {
  return {
    id: tempId,
    targetType: payload.targetType,
    targetId: payload.targetId,
    targetLabel: payload.targetLabel ?? null,
    ownerKey: null,
    ownerNameSnapshot: null,
    taskType: payload.taskType,
    title: payload.title,
    detail: null,
    dueAt: payload.dueAt,
    snoozedUntil: null,
    priority: "normal",
    status: "open",
    sourceEventId: null,
    createdBy: null,
    assignedBy: null,
    completedAt: null,
    completedBy: null,
    outcome: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  }
}

interface QuickAddNotice {
  tone: "success" | "error"
  message: string
  undo?: { label: string; onClick: () => void }
}

type TaskSummary = ListCrmTasksResult["summary"]

export default function Customer360DetailTasks({
  tasks,
  customerKey,
  targetLabel: targetLabelProp,
}: {
  tasks: ListCrmTasksResult
  /** 360 클라이언트가 넘기는 통합 키(lead:… / neo:…). 없으면 라우트 파라미터에서 읽는다. */
  customerKey?: string | null
  /** 빠른 추가 할 일에 붙일 고객 표시 이름. 없으면 기존 할 일 행의 라벨을 재사용한다. */
  targetLabel?: string | null
}) {
  const params = useParams<{ key?: string | string[] }>()
  const target = parseTaskTargetFromKey(customerKey ?? params?.key)
  const targetLabel = targetLabelProp?.trim() || (tasks.rows.find((row) => row.targetLabel)?.targetLabel ?? null)

  const [rows, setRows] = useState<CrmTaskRecord[]>(tasks.rows)
  const [summary, setSummary] = useState<TaskSummary>(tasks.summary)
  const [pendingPresetId, setPendingPresetId] = useState<string | null>(null)
  const [notice, setNotice] = useState<QuickAddNotice | null>(null)
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current)
    }
  }, [])

  function showNotice(next: QuickAddNotice) {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current)
    setNotice(next)
    if (next.undo) {
      // 되돌리기 창이 닫히면 버튼만 거둔다 — 성공 문구는 다음 처리·닫기 전까지 남긴다
      // (CrmPriorityQueuePanel.showNotice와 같은 패턴).
      noticeTimerRef.current = setTimeout(() => {
        setNotice((current) => (current === next ? { tone: next.tone, message: next.message } : current))
      }, QUICK_ADD_UNDO_WINDOW_MS)
    }
  }

  // 되돌리기 — 기존 취소 액션(PATCH {action:"cancel"})을 그대로 쓴다. 별도 되돌리기 전용 API는 없다.
  async function undoQuickAdd(taskId: string, presetLabel: string) {
    try {
      await adminFetchJson(`/api/admin/crm/tasks/${encodeURIComponent(taskId)}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "cancel", outcome: "고객 360 빠른 추가 되돌리기" }),
      })
      setRows((prev) => prev.filter((row) => row.id !== taskId))
      setSummary((prev) => ({ ...prev, open: Math.max(0, prev.open - 1), total: Math.max(0, prev.total - 1) }))
      setNotice({ tone: "success", message: `"${presetLabel}" 추가를 되돌렸습니다.` })
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? `되돌리지 못했습니다 (${error.message}).` : "되돌리지 못했습니다.",
      })
    }
  }

  // nowMs는 호출부(아래 onClick)가 클릭 시각에 넘긴다 — 이 함수 안에서 직접 Date.now()를 부르지
  // 않는다. .map()으로 만든 프리셋 칩 각각의 onClick 클로저 안에서 프리셋별 인자를 받는 핸들러가
  // Date.now()를 직접 호출하면 react-hooks/purity가 "렌더 중 비순수 호출"로 오탐한다(실제로는
  // 클릭 시에만 실행되는데도) — 이 신호만 호출부로 끌어올리면 오탐이 사라진다(로컬 확인 완료).
  async function handleQuickAdd(preset: TaskQuickPreset, nowMs: number) {
    if (pendingPresetId || !target) return
    setPendingPresetId(preset.id)
    setNotice(null)

    const payload = buildTaskPresetPayload(preset, { ...target, label: targetLabel }, nowMs)
    const tempId = `optimistic:${preset.id}:${nowMs}`
    const optimisticRow = buildOptimisticTaskRow(payload, tempId, new Date(nowMs).toISOString())

    let createdTask: CrmTaskRecord | null = null
    const result = await runOptimistic<{ rows: CrmTaskRecord[]; summary: TaskSummary }>({
      snapshot: () => ({ rows, summary }),
      apply: () => {
        setRows((prev) => [optimisticRow, ...prev])
        setSummary((prev) => ({ ...prev, open: prev.open + 1, total: prev.total + 1 }))
      },
      commit: async () => {
        const res = await adminFetchJson<{ task: CrmTaskRecord }>("/api/admin/crm/tasks", {
          method: "POST",
          body: JSON.stringify(payload),
        })
        createdTask = res.task
        setRows((prev) => prev.map((row) => (row.id === tempId ? res.task : row)))
      },
      rollback: (saved) => {
        setRows(saved.rows)
        setSummary(saved.summary)
      },
      onError: () => {
        showNotice({ tone: "error", message: `"${preset.label}" 추가에 실패했습니다.` })
      },
    })

    setPendingPresetId(null)

    if (result.ok && createdTask) {
      // TS는 commit 클로저 안에서만 이뤄지는 재할당을 이 시점까지 좁혀 추적하지 못해(널 단독으로
      // 오판) truthy 체크 뒤에도 타입이 never로 좁혀진다 — runOptimistic이 commit을 던지지 않고
      // 끝내야만 result.ok가 true이므로, 그 경로에서 createdTask는 항상 채워져 있다(런타임 보장).
      const task = createdTask as CrmTaskRecord
      showNotice({
        tone: "success",
        message: `"${preset.label}" 할 일을 추가했습니다.`,
        undo: { label: "되돌리기", onClick: () => void undoQuickAdd(task.id, preset.label) },
      })
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatTile icon={<ListChecks className="h-4 w-4" />} label="열린 할 일" value={summary.open} tone="brand" />
        <StatTile
          icon={<AlertTriangle className="h-4 w-4" />}
          label="지연"
          value={summary.overdue}
          tone={summary.overdue > 0 ? "danger" : "neutral"}
        />
        <StatTile icon={<CalendarClock className="h-4 w-4" />} label="오늘 마감" value={summary.dueToday} tone="caution" />
      </div>

      <div>
        <div
          role="group"
          aria-label="할 일 빠른 추가"
          className={`flex flex-wrap items-center gap-1.5 ${MOBILE_TOUCH_TARGET_CLASS}`}
        >
          {TASK_QUICK_PRESETS.map((preset) => {
            const isPending = pendingPresetId === preset.id
            return (
              <button
                key={preset.id}
                type="button"
                disabled={pendingPresetId != null || !target}
                aria-busy={isPending}
                onClick={() => void handleQuickAdd(preset, Date.now())}
                className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 ${
                  isPending
                    ? "border-[#D7EBDD] bg-[#ECFDF5] text-[#084734]"
                    : "border-[#e8e8e4] bg-[#F6F5F4] text-[#31302E] hover:border-[#084734]/40 hover:text-[#084734]"
                }`}
              >
                {isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                ) : (
                  <Plus className="h-3 w-3" aria-hidden />
                )}
                {preset.label}
              </button>
            )
          })}
        </div>
        {!target ? (
          <p className="mt-1.5 text-[11px] text-[#1a1a1a]/40">이 화면에서는 빠른 추가 대상을 확인할 수 없습니다.</p>
        ) : null}
      </div>

      <Panel title={`태스크 (${summary.total})`} description="활성 할 일 — 유형 · 우선순위 · 기한 · 담당">
        {!tasks.health.ok && tasks.health.message ? (
          <p className="mb-3 rounded-xl border border-[#ECD29C] bg-[#FBF1E0] px-3 py-2 text-[12px] text-[#7A520F]">
            {tasks.health.message}
          </p>
        ) : null}
        {rows.length === 0 ? (
          <TableEmpty message="열린 할 일이 없습니다." />
        ) : (
          <ul className="space-y-2.5">
            {rows.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </ul>
        )}
      </Panel>

      {notice ? (
        <Toast
          type={notice.tone === "success" ? "success" : "error"}
          msg={notice.message}
          onDismiss={() => setNotice(null)}
          action={notice.undo}
        />
      ) : null}
    </div>
  )
}
