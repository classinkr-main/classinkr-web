// 고객 360 "태스크" 탭의 빠른 추가 칩 — 프리셋 정의와 마감 계산(KST)만 담당하는 순수 모듈(§13 Q2).
// 서버 enum·레코드 계약은 lib/repositories/crm-tasks.ts가 정본이라 타입만 재사용한다(그 파일은
// "server-only"라 값 import는 클라이언트 번들에 서버 코드를 끌어들인다 — type-only import는 컴파일
// 시 지워지므로 안전하다. Customer360DetailTasks.tsx가 이미 같은 방식으로 CrmTaskRecord를 쓴다).
import type { CrmTaskTargetType, CrmTaskType } from "@/lib/repositories/crm-tasks"

const KST_OFFSET_MS = 9 * 60 * 60 * 1000

export type TaskQuickPresetDue = "tomorrow_10" | "this_friday_18" | "next_monday_10" | "in3_10"

export interface TaskQuickPreset {
  id: string
  label: string
  taskType: CrmTaskType
  due: TaskQuickPresetDue
}

export const TASK_QUICK_PRESETS: readonly TaskQuickPreset[] = [
  { id: "call_tomorrow", label: "내일 재통화", taskType: "call", due: "tomorrow_10" },
  { id: "quote_this_week", label: "이번 주 견적 발송", taskType: "quote", due: "this_friday_18" },
  { id: "demo_next_week", label: "다음 주 데모 준비", taskType: "demo", due: "next_monday_10" },
  { id: "renewal_talk", label: "재계약 논의", taskType: "renewal", due: "in3_10" },
]

interface KstDateParts {
  year: number
  month: number
  date: number
  /** 0=일 1=월 … 6=토 (Date.prototype.getUTCDay 규약과 동일) */
  weekday: number
}

// now(ms)를 KST 벽시계 기준 연/월/일/요일로 읽는다. 호스트 타임존에 기대지 않도록 +9h 이동 뒤
// UTC getter로 읽는 표준 트릭 — lib/repositories/crm-tasks.ts의 defaultSnoozeUntil과 같은 방식이다.
function kstDateParts(nowMs: number): KstDateParts {
  const shifted = new Date(nowMs + KST_OFFSET_MS)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    date: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
  }
}

// KST 달력 날짜(base + dayOffset)의 hour:00 KST를 실제 UTC ISO 인스턴트로 바꾼다.
// "Y-M-D hour:00 KST" == "Y-M-D (hour-9):00 UTC" — Date.UTC의 자동 오버플로 정규화 덕분에
// hour가 9보다 작아도(자정 넘어가는 시각) 안전하게 전날로 넘어간다.
function kstInstantIso(base: KstDateParts, dayOffset: number, hour: number): string {
  const ms = Date.UTC(base.year, base.month, base.date + dayOffset, hour, 0, 0) - KST_OFFSET_MS
  return new Date(ms).toISOString()
}

/**
 * 프리셋의 마감 시각(ISO, UTC) — KST 벽시계 기준으로 고정 계산한다.
 *
 * - tomorrow_10: 내일 10:00 KST.
 * - this_friday_18: 가장 가까운 금요일(오늘 포함) 18:00 KST. 단 오늘이 금요일이고 이미 18시가
 *   지났으면 다음 주 금요일로 민다. "이번 주"의 경계(일요일을 앞/뒤 어느 주로 볼지)는 명시하지
 *   않고, 실용적으로 "아직 지나지 않은 가장 가까운 금요일"을 고른다.
 * - next_monday_10: 다음 주 월요일 10:00 KST. 오늘이 월요일이면 오늘을 건너뛰고 +7일로 민다 —
 *   그 외 요일은 계산되는 월요일이 이미 항상 "다음 주"다.
 * - in3_10: 오늘부터 +3일, 10:00 KST(요일 계산 없는 단순 상대 오프셋).
 */
export function resolveTaskPresetDueAt(preset: TaskQuickPreset, nowMs: number): string {
  const today = kstDateParts(nowMs)
  switch (preset.due) {
    case "tomorrow_10":
      return kstInstantIso(today, 1, 10)
    case "this_friday_18": {
      const FRIDAY = 5
      const daysUntilFriday = (FRIDAY - today.weekday + 7) % 7
      const candidate = kstInstantIso(today, daysUntilFriday, 18)
      return new Date(candidate).getTime() <= nowMs ? kstInstantIso(today, daysUntilFriday + 7, 18) : candidate
    }
    case "next_monday_10": {
      const MONDAY = 1
      const daysUntilMonday = (MONDAY - today.weekday + 7) % 7
      return kstInstantIso(today, daysUntilMonday === 0 ? 7 : daysUntilMonday, 10)
    }
    case "in3_10":
      return kstInstantIso(today, 3, 10)
    default:
      return kstInstantIso(today, 1, 10)
  }
}

export interface TaskPresetTarget {
  targetType: CrmTaskTargetType
  targetId: string
  label?: string | null
}

export interface TaskQuickPresetPayload {
  title: string
  taskType: CrmTaskType
  dueAt: string
  targetType: CrmTaskTargetType
  targetId: string
  targetLabel?: string
}

/** 프리셋 + 대상 → POST /api/admin/crm/tasks 바디(app/api/admin/crm/tasks/route.ts가 읽는 필드만). */
export function buildTaskPresetPayload(
  preset: TaskQuickPreset,
  target: TaskPresetTarget,
  nowMs: number
): TaskQuickPresetPayload {
  const payload: TaskQuickPresetPayload = {
    title: preset.label,
    taskType: preset.taskType,
    dueAt: resolveTaskPresetDueAt(preset, nowMs),
    targetType: target.targetType,
    targetId: target.targetId,
  }
  const label = target.label?.trim()
  if (label) payload.targetLabel = label
  return payload
}
