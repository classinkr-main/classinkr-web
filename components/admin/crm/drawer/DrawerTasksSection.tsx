"use client"

// 열린 할 일 + 빠른 추가 폼 + CS 원클릭 동선 — 폼 상태·mutation은 부모(드로어 본체)가 소유한다.
// Customer360Drawer.tsx 분해(2026-08-28)로 이동 — 로직 무변경.

import { useMemo, useState } from "react"
import { CalendarClock, CheckCircle2, ListChecks, Plus } from "lucide-react"
import type { Customer360 } from "@/lib/repositories/crm-customer-360"
import type { CrmTaskType } from "@/lib/repositories/crm-tasks"
import { CS_MOTIONS, type CsMotion } from "@/lib/crm/cs-motions"
import { parseQuickTask } from "@/lib/crm/task-quick-parse"
import { getBusinessDateParts } from "@/lib/business-time"
import { useCrmOwners, type CrmOwnerOption } from "@/components/admin/crm/useCrmOwners"
import { formatDay, SectionTitle, TASK_TYPE_OPTIONS } from "./shared"

// "YYYY-MM-DD" → "M/D"(선행 0 제거) — 파싱 미리보기 한 줄용.
function toMonthDay(iso: string): string {
  const [, month, day] = iso.split("-")
  return `${Number(month)}/${Number(day)}`
}

// 파서가 돌려준 이름(별칭일 수도 있음)을 useCrmOwners의 정본 담당자로 되짚는다.
function resolveOwner(name: string, owners: CrmOwnerOption[]): CrmOwnerOption | null {
  return owners.find((owner) => owner.displayName === name || owner.ownerAliases.includes(name)) ?? null
}

function resolveOwnerDisplayName(name: string, owners: CrmOwnerOption[]): string {
  return resolveOwner(name, owners)?.displayName ?? name
}

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
  taskOwner,
  onTaskOwnerChange,
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
  /** 한 줄 입력에서 파싱돼 정본 담당자로 해석된 사람. null 이면 제출 시 "나"에게 배정된다. */
  taskOwner: { ownerKey: string; displayName: string } | null
  onTaskOwnerChange: (owner: { ownerKey: string; displayName: string } | null) => void
  onAddTask: () => void
  onCompleteTask: (taskId: string) => void
  onCsMotion: (motion: CsMotion) => void
}) {
  const { owners } = useCrmOwners()

  // 담당자 후보 = 표시 이름 + 별칭(중복 제거) — 한 줄 파서의 멤버 목록으로 그대로 넘긴다.
  const memberNames = useMemo(
    () =>
      Array.from(new Set(owners.flatMap((owner) => [owner.displayName, ...owner.ownerAliases].filter(Boolean)))),
    [owners]
  )
  const today = getBusinessDateParts().date

  // 입력창은 원문을 그대로 보여준다(타이핑 중 글자가 갑자기 사라지면 안 되니까) — 실제
  // 제출값(taskTitle, 부모 소유)에는 파싱·정리된 제목만 반영한다. taskType·기한도 사용자가
  // 아직 손대지 않은 동안에만(typeTouched/dueTouched) 파싱값으로 계속 맞춰준다.
  const [rawTitle, setRawTitle] = useState(taskTitle)
  const [typeTouched, setTypeTouched] = useState(false)
  const [dueTouched, setDueTouched] = useState(false)

  // 부모가 taskTitle을 비우는 두 경우(제출 성공, 고객 전환)를 그대로 따라간다 — 렌더 중
  // 이전 값과 비교해 즉시 맞추는 공식 패턴(effect의 추가 렌더 한 번을 피한다).
  const [prevTaskTitle, setPrevTaskTitle] = useState(taskTitle)
  if (taskTitle !== prevTaskTitle) {
    setPrevTaskTitle(taskTitle)
    if (taskTitle === "") {
      setRawTitle("")
      setTypeTouched(false)
      setDueTouched(false)
    }
  }

  const parsed = useMemo(
    () => parseQuickTask(rawTitle, { memberNames, today }),
    [rawTitle, memberNames, today]
  )

  // 미리보기 한 줄: "담당 OO · 기한 M/D · 유형 라벨". 파싱 결과가 전부 없으면 빈 문자열 —
  // 컨테이너는 고정 높이라 레이아웃은 그대로 유지된다.
  const previewText = useMemo(() => {
    const segments: string[] = []
    if (parsed.ownerNames.length > 0) {
      segments.push(`담당 ${parsed.ownerNames.map((name) => resolveOwnerDisplayName(name, owners)).join(", ")}`)
    }
    if (parsed.start && parsed.due && parsed.start !== parsed.due) {
      segments.push(`기간 ${toMonthDay(parsed.start)}~${toMonthDay(parsed.due)}`)
    } else if (parsed.due) {
      segments.push(`기한 ${toMonthDay(parsed.due)}`)
    }
    const typeLabel = parsed.taskType
      ? TASK_TYPE_OPTIONS.find((option) => option.value === parsed.taskType)?.label
      : null
    if (typeLabel) segments.push(`유형 ${typeLabel}`)
    return segments.join(" · ")
  }, [parsed, owners])

  function handleTitleInputChange(value: string) {
    setRawTitle(value)
    const next = parseQuickTask(value, { memberNames, today })
    if (!typeTouched && next.taskType && next.taskType !== taskType) {
      onTaskTypeChange(next.taskType)
    }
    if (!dueTouched && next.due && next.due !== taskDue) {
      onTaskDueChange(next.due)
    }
    // 담당자는 파싱된 첫 이름을 정본 명부(useCrmOwners)로 되짚어 ownerKey 로 올린다 — 미리보기에
    // 보이는 사람과 실제 배정되는 사람이 같아야 한다. 명부에 없는 이름이면 배정하지 않는다(나에게).
    const firstOwner = next.ownerNames.length > 0 ? resolveOwner(next.ownerNames[0], owners) : null
    const nextOwner = firstOwner ? { ownerKey: firstOwner.ownerKey, displayName: firstOwner.displayName } : null
    if ((nextOwner?.ownerKey ?? null) !== (taskOwner?.ownerKey ?? null)) onTaskOwnerChange(nextOwner)
    // 저장되는 제목은 파싱·정리된 문장 — 담당·기한 토큰까지 다 걷어내 비면 원문을 쓴다.
    const finalTitle = next.title || value
    if (finalTitle !== taskTitle) onTaskTitleChange(finalTitle)
  }

  function handleTaskTypeSelect(value: CrmTaskType) {
    setTypeTouched(true)
    onTaskTypeChange(value)
  }

  function handleTaskDueInput(value: string) {
    setDueTouched(true)
    onTaskDueChange(value)
  }

  function handleOpenForm() {
    setTypeTouched(false)
    setDueTouched(false)
    onTaskFormOpenChange(true)
  }

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
              value={rawTitle}
              aria-label="새 할 일 제목"
              onChange={(event) => handleTitleInputChange(event.target.value)}
              placeholder="새 할 일 제목"
              autoFocus
              className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-2.5 text-[12px] text-[#111110] outline-none focus:border-[#111110]"
            />
            <p className="h-4 truncate text-[11px] leading-4 text-[#1a1a1a]/45">{previewText}</p>
            <div className="flex flex-wrap gap-2">
              <select
                value={taskType}
                aria-label="새 할 일 유형"
                onChange={(event) => handleTaskTypeSelect(event.target.value as CrmTaskType)}
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
                onChange={(event) => handleTaskDueInput(event.target.value)}
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
            onClick={handleOpenForm}
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
