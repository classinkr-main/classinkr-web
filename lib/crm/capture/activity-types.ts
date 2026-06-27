// 접점 캡처 활동 타입(capture-layer §5). crm_customer_events / crm_tasks와 별개로
// 캡처 단계에서 행 단위 접점 분류 + 후속 task 템플릿의 기준이 된다.

export const CAPTURE_ACTIVITY_TYPES = [
  "event_attended",
  "visit",
  "demo_call",
  "check_in_call",
  "installation",
  "consultation",
  "quote_sent",
  "onboarding",
  "cs_issue",
  "memo",
] as const

export type CaptureActivityType = (typeof CAPTURE_ACTIVITY_TYPES)[number]

export const CAPTURE_ACTIVITY_LABELS: Record<CaptureActivityType, string> = {
  event_attended: "행사 참석",
  visit: "방문",
  demo_call: "데모 콜",
  check_in_call: "안부 전화",
  installation: "설치",
  consultation: "상담",
  quote_sent: "견적 발송",
  onboarding: "교육/온보딩",
  cs_issue: "CS 이슈",
  memo: "기타 메모",
}

export function captureActivityLabel(type: CaptureActivityType): string {
  return CAPTURE_ACTIVITY_LABELS[type] ?? "기타 메모"
}

export function isCaptureActivityType(value: unknown): value is CaptureActivityType {
  return typeof value === "string" && (CAPTURE_ACTIVITY_TYPES as readonly string[]).includes(value)
}
