// 고객 이력 갈래 판정 표 — 기관 이름은 가짜다("가나학원", "다라에듀" 등). 사람 이름·연락처 없음.
//
// CUSTOMER_HISTORY_ASKS 는 고객 이력 갈래 한 조각으로, CUSTOMER_HISTORY_NOT 은 그 갈래가 아닌 곳(괄호 — read 는 도구·화면 이름)으로 간다.
// 상담·문의·채팅 낱말이 있으면 상담 내역 갈래 몫이고, CRM 단계·목록·금액·방법·담당자 질문은 옛 판정 그대로다.

export const CUSTOMER_HISTORY_ASKS: readonly string[] = [
  "가나학원 결제 문제 있었나?",
  "가나학원 결제·견적 문제 있었어?",
  "이 고객 견적 이슈 있었나?",
  "가나학원 AS 이력 보여 줘",
  "가나학원 API 연동 문제 있었어?",
  "가나학원 CS 케이스 있었나?",
  "가나학원 고객 이력 알려 줘",
  "가나학원 이슈 있었나?",
  "가나학원 칠판 고장 있었나?",
  "해당 고객 미수 문제 있었어?",
  "지난달 가나학원 환불 문제 있었나?",
  "이 고객 이력 보여 줘",
  "가나학원 견적 사고 있었어?",
  "다라에듀 연동 이슈 최근에 있었어?",
  "이 학원 클레임 있었나?",
  "가나학원 수리 기록 있어?",
  "가나학원 결제 이슈 정리해 줘",
  "결제 문제 있었나?",
]

export const CUSTOMER_HISTORY_NOT: ReadonlyArray<[string, string[]]> = [
  // 상담·문의 낱말 — 상담 내역 갈래
  ["가나학원 결제 문의 있었나?", ["consultations"]],
  ["가나학원 상담 이력 보여 줘", ["consultations"]],
  ["해당 고객 문의 이력 있어?", ["consultations"]],
  // 목록·금액·현황 — 조회
  ["가나학원 견적 목록 보여 줘", ["read:quotes_list"]],
  ["가나학원 견적 이력 보여 줘", ["read:quotes_list"]],
  ["가나학원 수금 현황 보여 줘", ["read:payment"]],
  ["가나학원 최근 통화 기록 보여줘", ["read:activity"]],
  // CRM 상담 단계 — 옛 판정
  ["이번 주 상담 단계 리드 목록 보여줘", ["read:lead"]],
  ["지난주 상담 단계 딜 목록 보여줘", ["read:deals_list"]],
  // 담당자
  ["가나학원 담당 누구야?", ["contact"]],
  ["결제 문제는 누구한테 물어?", ["contact"]],
  ["가나학원 AS 문제 누가 맡아?", ["contact"]],
  // 방법·규정·제품 정보
  ["견적 승인 절차가 어떻게 돼?", ["knowledge"]],
  ["환불 규정 알려 줘", ["knowledge"]],
  ["카드 결제 문제 있나요?", ["knowledge"]],
  ["결제 오류 나면 어떻게 해?", ["knowledge"]],
  ["클래스인 결제 문제 있었어?", ["knowledge"]],
  ["칠판 고장 있었나?", ["knowledge"]],
  // 시키는 말 — 쓰기
  ["가나학원 결제 확정해 줘", ["write"]],
]

/** 복합 문장 — 고객 이력 조각과 다른 조각이 둘 다 답해야 한다. */
export const CUSTOMER_HISTORY_COMPOUND: ReadonlyArray<[string, string[]]> = [
  ["이 고객 결제·견적 문제 있었나? 누가 맡아?", ["customer_history", "contact"]],
  ["가나학원 결제 문제 있었나? 담당은 누구야?", ["customer_history", "contact"]],
  ["가나학원 결제 문제 있었나, 재고는 몇 대 남았어?", ["customer_history", "read:hw_stock"]],
]
