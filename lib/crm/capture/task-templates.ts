import type { CaptureActivityType } from "./activity-types"

// 접점 타입별 기본 후속 task 템플릿(capture-layer §8). 강제가 아니라 체크된 기본값이며
// 사용자가 끄거나 날짜를 바꿀 수 있다. memo는 후속 task를 만들지 않는다.

export interface CaptureTaskTemplate {
  offsetDays: number
  title: string
}

export const CAPTURE_TASK_TEMPLATES: Partial<Record<CaptureActivityType, CaptureTaskTemplate>> = {
  event_attended: { offsetDays: 1, title: "행사 참석 후속 안부 전화" },
  visit: { offsetDays: 3, title: "방문 후속 연락" },
  demo_call: { offsetDays: 3, title: "데모 후속 · 자료/견적 발송" },
  check_in_call: { offsetDays: 3, title: "다음 안부 전화" },
  installation: { offsetDays: 7, title: "설치 후 사용 확인" },
  consultation: { offsetDays: 1, title: "상담 후속 액션" },
  quote_sent: { offsetDays: 3, title: "견적 후속 확인" },
  onboarding: { offsetDays: 7, title: "온보딩 사용 점검" },
  cs_issue: { offsetDays: 1, title: "CS 이슈 해결 확인" },
  // memo → 후속 task 없음
}

export function captureTaskTemplate(type: CaptureActivityType): CaptureTaskTemplate | null {
  return CAPTURE_TASK_TEMPLATES[type] ?? null
}

const DAY_MS = 24 * 60 * 60 * 1000

// 기본 마감 = now + offsetDays (배치 기본 offset이 있으면 우선).
export function captureTaskDueAt(
  type: CaptureActivityType,
  now: Date,
  overrideOffsetDays?: number | null
): string | null {
  const template = captureTaskTemplate(type)
  if (!template) return null
  const offset = overrideOffsetDays != null && Number.isFinite(overrideOffsetDays) ? overrideOffsetDays : template.offsetDays
  return new Date(now.getTime() + offset * DAY_MS).toISOString()
}
