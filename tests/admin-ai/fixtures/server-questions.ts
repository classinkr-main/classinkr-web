// 갈매봇 서버 갈래 시험 문장(사람 이름·연락처·실제 고객 기관 없음 — 기관 이름은 시안과 같은 가짜 이름).

/** 클래스인 정보 질문 20개 — 답·담당자·링크 블록만 나오고 오더는 0개. */
export const INFO_QUESTIONS: readonly string[] = [
  "수업 녹화는 어떻게 켜?",
  "학생이 수업 링크로 입장이 안 될 때 방법 알려 줘",
  "견적서에 할인을 넣어도 되나?",
  "환불 규정이 어떻게 돼?",
  "카메라 화질이 흐릴 때 확인할 것",
  "칠판 기능에서 PDF 올리는 방법",
  "교사 계정 추가는 어떻게 해?",
  "출고 확정하면 취소 가능한가요",
  "결제 수단 뭐뭐 돼",
  "앱 설치가 안 될 때 어떻게 해",
  "숙제 보내는 방법 알려 줘",
  "출석 체크 기능이 있어?",
  "녹화 영상 삭제하려면 어떻게 해요",
  "요금제 차이가 뭐야",
  "카메라 담당 누구야?",
  "결제 오류 누구한테 물어봐?",
  "견적서 링크 알려줘",
  "결제 확정하는 화면 어디서 해?",
  "할인 승인 규칙이 뭐야",
  "화면 공유가 끊겨요 원인이 뭐야",
]

/** 복합 질문 10개 — [문장, 조각 수, 조각별 갈래]. */
export const COMPOUND_QUESTIONS: ReadonlyArray<[string, number, string[]]> = [
  ["견적서에 할인 넣는 방법은 어떻게 하고, 할인 승인은 누구한테 물어?", 2, ["knowledge", "contact"]],
  ["T1 재고 몇 대야? 그리고 견적서 링크 알려 줘", 2, ["read", "link"]],
  ["녹화가 안 될 때 어떻게 해? 카메라 담당은 누구야?", 2, ["knowledge", "contact"]],
  ["환불 규정 알려 주고, 견적 화면은 어디서 해?", 2, ["knowledge", "link"]],
  ["출고 현황 보여 줘. 출고 확정은 누가 해?", 2, ["read", "contact"]],
  ["학생 계정 만드는 방법이 뭐야? 그리고 판매 현황 보여 줘", 2, ["knowledge", "read"]],
  ["딜 목록 보여 주고, 견적 승인 절차는 어떻게 돼?", 2, ["read", "knowledge"]],
  ["수업 링크로 입장이 안 돼요. 누구한테 물어봐?", 2, ["knowledge", "contact"]],
  ["가용 재고 몇 대야? 방문자 현황도 보여 줘? 견적 목록도 보여 줘", 3, ["read", "read", "read"]],
  ["카메라 화질 설정은 어떻게 해? 고객 상세 바로가기 알려 줘", 2, ["knowledge", "link"]],
]

/** 미끼 낱말 질문 15개 — [문장, 가면 안 되는 갈래]. 낱말 하나에 끌려 엉뚱한 갈래로 가지 않는다. */
export const DECOY_QUESTIONS: ReadonlyArray<[string, string[]]> = [
  ["채팅창에 문자가 깨져 보여요", ["write", "read", "link"]],
  ["환불 버튼은 학생 앱에서 어떻게 눌러?", ["write", "read"]],
  ["문자 인증이 안 와요 어떻게 해요", ["write", "read"]],
  ["수업 링크로 들어가면 오류가 나요", ["link", "write"]],
  ["재고 관리 방법 알려줘", ["read", "write"]],
  ["담당 선생님이 수업 녹화하는 법", ["contact", "write"]],
  ["견적서에 할인 넣는 방법", ["write", "read"]],
  ["숙제 보내는 방법이 뭐야", ["write"]],
  ["녹화 영상 삭제하려면 어떻게 해요", ["write"]],
  ["수업 예약 기능 있어?", ["write"]],
  ["학생 등록은 어떻게 해?", ["write"]],
  ["수업 일정 확정되면 학생한테 알림 가?", ["write"]],
  ["결제 링크가 열리지 않는다는 문의는 어떻게 답해?", ["link", "write"]],
  ["출고라는 말이 무슨 뜻이야", ["read", "write"]],
  ["누구나 쓸 수 있는 기본 화면 설정 방법", ["contact", "write"]],
]

/**
 * 쉼표 없는 이음·"A랑 B"·명령 둘 — [문장, 조각별 갈래(쓰기는 write:종류, 조회는 read:도구)].
 * 2026-11 서버 1단계 검토(동작-2): 질문 하나가 말없이 버려지던 문장들.
 */
export const COMPOUND_NO_COMMA: ReadonlyArray<[string, string[]]> = [
  ["환불 규정 알려 주고 담당자도 알려 줘", ["knowledge", "contact"]],
  ["출고 예정 3대 등록하고, 견적 초안도 만들어 줘", ["write:hw_plan", "write:quote_draft"]],
  ["T1 카메라 2대 출고 예정 등록하고 견적 초안도 만들어 줘", ["write:hw_plan", "write:quote_draft"]],
  ["견적 목록이랑 딜 목록 보여 줘", ["read:quotes_list", "read:deals_list"]],
  ["재고 현황하고 방문자 현황 알려 줘", ["read:hw_stock", "read:site_traffic"]],
  ["T1 카메라랑 86형 재고", ["read:hw_stock"]],
  ["요금제 차이 설명해 주고, 견적 목록도 보여 줘", ["knowledge", "read:quotes_list"]],
  ["딜 목록 보여 주고 견적 화면 링크도 줘", ["read:deals_list", "link"]],
  // 끊으면 안 되는 이음 — 한 조각
  ["상태 바꾸고 내가 맡을게", ["write:lead"]],
]

/** 조회 재현율(동작-3) — [문장, 조회 대상(도구 이름 또는 화면 주제)]. */
export const READ_RECALL: ReadonlyArray<[string, string]> = [
  ["지난 7일 방문자 몇 명이야?", "site_traffic"],
  ["T1 카메라 가용 재고", "hw_stock"],
  ["주문 권장 뜬 품목 있어?", "hw_stock"],
  ["어제 출고된 거 있어?", "hw_movements"],
  ["재고 부족한 품목", "hw_stock"],
  ["가용 재고 0인 품목", "hw_stock"],
  ["오늘 할 일 뭐야", "task"],
  ["가온학원 딜 단계 뭐야", "deals_list"],
  ["이번 달 출고 내역 보여 줘", "hw_movements"],
  ["입고된 품목 있어?", "hw_movements"],
]

/** 미끼 낱말 추가분(동작-3·동작-7) — [문장, 가야 할 갈래]. */
export const DECOY_MORE: ReadonlyArray<[string, string]> = [
  ["견적 초안 만드는 법 알려 줘", "knowledge"],
  ["누가 수업에 들어왔는지 확인하는 방법", "knowledge"],
  ["카메라 담당자 연락처", "contact"],
  ["HW 재고 화면 링크 줘", "link"],
  ["쇼룸 예약 화면 바로가기", "link"],
  ["리드 목록 페이지 어디 있어?", "link"],
  ["공개 요금 페이지 주소 알려 줘", "link"],
]
