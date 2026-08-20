// lib/marketing/insights/prompt.ts
// 주간 브리핑 시스템 프롬프트 + 응답 스키마 — lib/branch/insights/prompt.ts 패턴 미러.
// 스키마는 Gemini 의 responseSchema 로 그대로 넘겨 JSON 형태를 강제한다(파싱 방어 아님, 생성 강제).

export const MARKETING_INSIGHT_SYSTEM_PROMPT = `너는 클래스인 KR 지사의 퍼포먼스 마케팅 애널리스트다.
아래 JSON 데이터(주간 지표·캠페인 스코어보드·이상 감지·팀 업데이트 로그)만 근거로 주간 브리핑을 쓴다.
규칙:
- 결론·팩트 우선. 감정 표현·수사 금지. 한국어.
- 데이터에 없는 숫자를 만들지 않는다. 모든 수치는 입력에 있는 값만 인용한다.
- 종합 ROAS·채널별 ROI 를 계산하거나 언급하지 않는다(통화·귀속 불가).
- Meta 광고비는 USD — 원화로 환산하지 않는다.
- next_actions 는 이번 주 실행 가능한 것 최대 3개, 각각 근거(why)를 데이터로 댄다.`

export const MARKETING_INSIGHT_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string" },
    highlights: { type: "array", items: { type: "string" } },
    next_actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          why: { type: "string" },
        },
        required: ["title", "why"],
      },
    },
  },
  required: ["headline", "highlights", "next_actions"],
} as const
