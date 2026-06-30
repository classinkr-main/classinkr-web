"use client"

import { AlertTriangle, CalendarClock, ListChecks, MoonStar } from "lucide-react"

import { Panel, StatTile, TableEmpty } from "@/components/admin/viz"
import type { CrmTaskRecord, ListCrmTasksResult } from "@/lib/repositories/crm-tasks"

import {
  formatDateTime,
  TASK_PRIORITY_CLASS,
  TASK_PRIORITY_LABEL,
  TASK_STATUS_LABEL,
  TASK_TYPE_LABEL,
} from "./Customer360DetailShared"

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
            미룸 {formatDateTime(task.snoozedUntil)}
          </span>
        ) : null}
        {task.ownerNameSnapshot ? <span>· {task.ownerNameSnapshot}</span> : null}
      </div>
    </li>
  )
}

export default function Customer360DetailTasks({ tasks }: { tasks: ListCrmTasksResult }) {
  const { summary, rows } = tasks

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
    </div>
  )
}
