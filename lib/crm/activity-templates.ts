// CRM 기록 컴포저 템플릿 SSOT (기획 §11.2 A2).
// ActivityQuickForm 의 템플릿 칩이 이 배열만 읽는다 — 항목을 더하거나 문구를 고치면 여기 한 곳만 바꾼다.
// mode 는 activity-contract 의 FormMode(컴포저가 실제로 저장하는 sourceType) 값이어야 한다.
// 팀별 템플릿(서버 저장)은 후속 — 지금은 정적 상수다.

import type { FormMode, Sentiment } from "@/components/admin/crm/rail/activity-contract"

export type ActivityTemplateSentiment = Exclude<Sentiment, "all">

export interface ActivityTemplate {
  /** 안정 식별자(테스트·추후 서버 템플릿 병합 키). */
  id: string
  /** 칩 라벨. */
  label: string
  /** 적용 시 전환할 컴포저 모드(= 저장되는 sourceType). */
  mode: FormMode
  /** 본문 프리필. 줄바꿈 포함 가능. 커서 마커 없음 — 단순 문자열. */
  body: string
  /** 적용 시 채울 분위기. 없으면 중립으로 되돌린다(이전 템플릿의 감정이 남지 않게). */
  sentiment?: ActivityTemplateSentiment
  /** 다음 액션 제안 문구. 자동으로 할 일을 만들지 않고 힌트로만 보여 준다. */
  nextActionHint?: string
}

export const ACTIVITY_TEMPLATES: readonly ActivityTemplate[] = [
  {
    id: "renewal_call",
    label: "재계약 콜",
    mode: "call",
    body: "재계약 논의 통화\n- 현재 이용 현황: \n- 갱신 조건/견적: \n- 고객 반응: ",
    sentiment: "neutral",
    nextActionHint: "재계약 조건 회신",
  },
  {
    id: "demo_request",
    label: "데모 요청",
    mode: "call",
    body: "데모 요청 접수\n- 희망 일정: \n- 참석 인원/대상: \n- 관심 기능: ",
    sentiment: "positive",
    nextActionHint: "데모 일정 확정",
  },
  {
    id: "complaint",
    label: "불만 접수",
    mode: "call",
    body: "불만 접수\n- 문제 상황: \n- 발생 시점: \n- 요청 사항: \n- 1차 안내 내용: ",
    sentiment: "risk",
    nextActionHint: "불만 처리 결과 회신",
  },
  {
    id: "visit_minutes",
    label: "방문 회의록",
    mode: "meeting_minutes",
    body: "방문 회의\n- 논의 주제: \n- 고객 요구: \n- 합의/결정: \n- 리스크: ",
    sentiment: "neutral",
    nextActionHint: "회의 후속 자료 발송",
  },
  {
    id: "sms_no_answer",
    label: "미응답 문자",
    mode: "sms",
    body: "부재중 안내 문자 발송 — 재통화 가능 시간 회신 요청",
    sentiment: "neutral",
    nextActionHint: "재통화",
  },
  {
    id: "payment_confirmed",
    label: "결제 확인",
    mode: "manual_note",
    body: "결제 확인\n- 결제 항목/금액: \n- 결제일: \n- 세금계산서/영수증: ",
    sentiment: "positive",
  },
]

/** 템플릿이 컴포저에 채우는 필드 묶음. */
export interface ActivityTemplatePrefill {
  mode: FormMode
  body: string
  sentiment: ActivityTemplateSentiment
}

export type ApplyActivityTemplateResult =
  | { needsConfirm: true }
  | ({ needsConfirm: false } & ActivityTemplatePrefill)

/** 템플릿 → 프리필 값. 감정이 없는 템플릿은 중립으로 되돌린다. */
export function activityTemplatePrefill(template: ActivityTemplate): ActivityTemplatePrefill {
  return { mode: template.mode, body: template.body, sentiment: template.sentiment ?? "neutral" }
}

/**
 * 순수 함수 — 현재 본문이 비어 있으면(공백만 있어도 빈 것으로 본다) 프리필을 돌려주고,
 * 이미 적힌 본문이 있으면 앞에 붙이거나 덮어쓰지 않고 `{ needsConfirm: true }` 만 돌려준다.
 * 덮어쓰기 확인은 UI 몫이며, 확인 뒤에는 `activityTemplatePrefill` 로 같은 값을 적용한다.
 */
export function applyActivityTemplate(
  template: ActivityTemplate,
  current: { body: string }
): ApplyActivityTemplateResult {
  if (current.body.trim().length > 0) return { needsConfirm: true }
  return { needsConfirm: false, ...activityTemplatePrefill(template) }
}

export function findActivityTemplate(id: string): ActivityTemplate | null {
  return ACTIVITY_TEMPLATES.find((template) => template.id === id) ?? null
}
