// lib/chatbot/pricing-policy.ts
// 견적 "구성"을 설명할 때 쓰는 항목. OPS 는 전자칠판 내장이라 별도 항목이 아니다.
export const PRICE_COMPOSITION_ITEMS = [
  "카메라·스탠드·벽걸이",
  "소프트웨어 연동",
  "온보딩 범위",
] as const

export const PRICE_FINAL_QUOTE_GUIDANCE =
  "최종 견적과 구체 금액은 단정하지 않고 상담 연결로 맞춤 안내합니다."

export const OPS_BUILTIN_NOTE =
  "전자칠판에 내장된 OPS(윈도우 기반 컴퓨팅)는 별도 견적 항목이 아니라 기본 강점으로 설명합니다."
