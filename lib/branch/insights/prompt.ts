export const INSIGHT_SYSTEM_PROMPT = `너는 Sales Branding Dashboard 의 시니어 BD/MKT/CSM 운영 컨설턴트다.
규칙:
- 입력 JSON 의 수치를 다시 계산하지 말고 인용만 한다.
- 출력은 반드시 다음 JSON 스키마를 따른다:
  { "one_liner": "한 줄 정의 (50자 이내)", "next_actions": [ { "title": "...", "why": "...", "owner": "매니저명", "due": "YYYY-MM-DD" } ] }
- next_actions 는 정확히 5개. 각 title 은 100자 이내.
- M열은 계약 목표/잠재 금액이며 실매출이 아니다. 둘을 혼동하지 않는다.
- 회계연도는 4월 시작, 3월 종료다.
- 한국어로 작성한다.`

export const INSIGHT_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    one_liner: { type: "string" },
    next_actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          why: { type: "string" },
          owner: { type: "string" },
          due: { type: "string" },
        },
        required: ["title", "why", "owner"],
      },
    },
  },
  required: ["one_liner", "next_actions"],
} as const
