"use client"

// 열린 할 일 + 빠른 추가 폼 + CS 원클릭 동선 — 폼 상태·mutation은 부모(드로어 본체)가 소유한다.
// Customer360Drawer.tsx 분해(2026-08-28)로 이동 — 로직 무변경.

import { CalendarClock, CheckCircle2, ListChecks, Plus } from "lucide-react"
import type { Customer360 } from "@/lib/repositories/crm-customer-360"
import type { CrmTaskType } from "@/lib/repositories/crm-tasks"
import { CS_MOTIONS, type CsMotion } from "@/lib/crm/cs-motions"
import { formatDay, SectionTitle, TASK_TYPE_OPTIONS } from "./shared"

export default function DrawerTasksSection({
  data,
  actingId,
  taskFormOpen,
  onTaskFormOpenChange,
  taskTitle,
  onTaskTitleChange,
  taskType,
  onTaskTypeChange,
  taskDue,
  onTaskDueChange,
  onAddTask,
  onCompleteTask,
  onCsMotion,
}: {
  data: Customer360
  actingId: string | null
  taskFormOpen: boolean
  onTaskFormOpenChange: (open: boolean) => void
  taskTitle: string
  onTaskTitleChange: (value: string) => void
  taskType: CrmTaskType
  onTaskTypeChange: (value: CrmTaskType) => void
  taskDue: string
  onTaskDueChange: (value: string) => void
  onAddTask: () => void
  onCompleteTask: (taskId: string) => void
  onCsMotion: (motion: CsMotion) => void
}) {
  return (
    <section id="c360-tasks" className="scroll-mt-2 rounded-2xl border border-[#e8e8e4] bg-white p-4">
      <SectionTitle icon={<ListChecks className="h-3.5 w-3.5" />}>
        열린 할 일 {data.tasks.summary.total > 0 ? `(${data.tasks.summary.total})` : ""}
      </SectionTitle>
      <div className="mb-3 space-y-1.5">
        {data.tasks.rows.length === 0 ? (
          <p className="text-[12px] text-[#1a1a1a]/40">열린 할 일이 없습니다.</p>
        ) : (
          data.tasks.rows.map((task) => (
            <div key={task.id} className="flex items-center justify-between gap-2 rounded-xl bg-[#fafaf8] px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-[12px] font-semibold text-[#111110]">{task.title}</p>
                <p className="text-[11px] text-[#1a1a1a]/40">
                  <CalendarClock className="mr-1 inline h-3 w-3" />
                  {task.dueAt ? formatDay(task.dueAt) : "기한 없음"}
                  {task.ownerNameSnapshot ? ` · ${task.ownerNameSnapshot}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onCompleteTask(task.id)}
                disabled={actingId === `task:${task.id}`}
                aria-label={`${task.title} 할 일 완료`}
                className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border border-[#D7EBDD] bg-[#ECFDF5] px-2 text-[11px] font-semibold text-[#084734] transition-colors hover:bg-[#D7EBDD] disabled:opacity-50"
              >
                <CheckCircle2 className="h-3 w-3" />
                완료
              </button>
            </div>
          ))
        )}
      </div>
      <div className="border-t border-[#f0f0ec] pt-3">
        {taskFormOpen ? (
          <div className="flex flex-col gap-2">
            <input
              value={taskTitle}
              aria-label="새 할 일 제목"
              onChange={(event) => onTaskTitleChange(event.target.value)}
              placeholder="새 할 일 제목"
              autoFocus
              className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-2.5 text-[12px] text-[#111110] outline-none focus:border-[#111110]"
            />
            <div className="flex flex-wrap gap-2">
              <select
                value={taskType}
                aria-label="새 할 일 유형"
                onChange={(event) => onTaskTypeChange(event.target.value as CrmTaskType)}
                className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[12px] font-semibold text-[#111110] outline-none"
              >
                {TASK_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={taskDue}
                aria-label="새 할 일 기한"
                onChange={(event) => onTaskDueChange(event.target.value)}
                className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[12px] text-[#111110] outline-none"
              />
              <button
                type="button"
                onClick={onAddTask}
                disabled={!taskTitle.trim() || actingId === "task"}
                className="inline-flex h-9 flex-1 items-center justify-center gap-1 rounded-lg bg-[#111110] px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" />
                내 할 일로 추가
              </button>
              <button
                type="button"
                onClick={() => onTaskFormOpenChange(false)}
                className="inline-flex h-9 items-center rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#1a1a1a]/55 transition-colors hover:bg-[#f5f5f2]"
              >
                취소
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onTaskFormOpenChange(true)}
            aria-expanded={taskFormOpen}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-dashed border-[#dcdcd6] px-3 text-[12px] font-semibold text-[#1a1a1a]/55 transition-colors hover:border-[#111110] hover:text-[#111110]"
          >
            <Plus className="h-3.5 w-3.5" />
            할 일 추가
          </button>
        )}
      </div>
      <div className="mt-3 border-t border-[#f0f0ec] pt-3">
        <p className="mb-1.5 text-[11px] font-semibold text-[#1a1a1a]/45">고객 성공(CS) 동선 · 원클릭</p>
        <div className="flex flex-wrap gap-1.5">
          {CS_MOTIONS.map((motion) => (
            <button
              key={motion.key}
              type="button"
              onClick={() => onCsMotion(motion)}
              disabled={actingId === `cs:${motion.key}`}
              className="inline-flex h-7 items-center gap-1 rounded-full border border-[#e8e8e4] bg-white px-2.5 text-[11px] font-semibold text-[#1a1a1a]/65 transition-colors hover:border-[#084734] hover:text-[#084734] disabled:opacity-50"
            >
              <Plus className="h-3 w-3" />
              {motion.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
