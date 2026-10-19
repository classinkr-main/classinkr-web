// 시안 모드 시나리오 — 서버 오더 엔진이 붙기 전까지 화면을 움직이게 하는 샘플 데이터.
//
// 여기 있는 고객·금액·재고는 전부 가짜다. 실제 DB 를 읽지도, 쓰지도 않는다.
// 화면은 AdminAiClient.mode === "demo" 일 때 "시안 · 샘플 데이터" 표시를 띄운다.
import { ORDER_TTL_MS } from "./order-state"
import type { AdminAiTurnResult, AiBlock, OrderTicket } from "./types"

export type DemoScenarioKey =
  | "task"
  | "contact"
  | "lead"
  | "summary"
  | "today"
  | "stock"
  | "sms"
  | "pay"
  | "ship"
  | "amount"
  | "delete"
  | "which"

interface DemoScenario {
  /** 추천 항목을 눌렀을 때 사용자 말풍선에 들어갈 문장. */
  say: string
  /** 답을 만드는 동안 한 줄씩 보여 줄 진행 단계. */
  steps: string[]
  text?: string
  order?: Omit<OrderTicket, "id" | "state" | "createdAt" | "expiresAt">
  block?: Exclude<AiBlock, { kind: "order" } | { kind: "steps" } | { kind: "text" }>
}

const SCENARIOS: Record<DemoScenarioKey, DemoScenario> = {
  task: {
    say: "한빛수학학원 내일 오후 3시에 데모 후속 전화 할 일 잡아 줘. 담당은 나.",
    steps: ["한빛수학학원 확인", "오더 작성"],
    text: "할 일 1건을 만들 준비가 됐습니다. 내용이 맞으면 실행해 주세요.",
    order: {
      type: "crm.task.create",
      risk: "R1",
      icon: "task",
      title: "CRM 할 일 생성",
      target: { label: "한빛수학학원", meta: "리드 · 서울 강남" },
      fields: [
        { key: "title", label: "제목", value: "데모 후속 전화", editable: true },
        { key: "due", label: "기한", value: "2026-09-30 (수) 15:00", editable: true, numeric: true },
        { key: "owner", label: "담당", value: "나", editable: true, hint: "로그인 계정" },
      ],
      confirmLabel: "오더 실행",
      doneText: "할 일을 만들었습니다",
      openLabel: "할 일 열기",
      undo: "window",
    },
  },
  contact: {
    say: "도담영어 방금 통화했어. 다음 주에 다시 연락 달래.",
    steps: ["도담영어 확인", "오더 작성"],
    text: "컨택 기록 1건을 남길 준비가 됐습니다.",
    order: {
      type: "crm.contact.log",
      risk: "R1",
      icon: "note",
      title: "컨택 기록 추가",
      target: { label: "도담영어", meta: "리드 · 경기 분당" },
      fields: [
        { key: "kind", label: "유형", value: "전화", editable: true },
        { key: "note", label: "내용", value: "다음 주 재연락 요청", editable: true },
      ],
      confirmLabel: "오더 실행",
      doneText: "기록을 남겼습니다",
      openLabel: "기록 열기",
      undo: "window",
    },
  },
  lead: {
    say: "새움에듀 데모 끝났어. 상태 바꾸고 내가 맡을게.",
    steps: ["새움에듀 확인", "현재 상태 확인", "오더 작성"],
    text: "바뀌는 값을 확인해 주세요.",
    order: {
      type: "crm.lead.update",
      risk: "R2",
      icon: "lead",
      title: "리드 상태·담당 변경",
      target: { label: "새움에듀", meta: "리드 · 부산 해운대" },
      fields: [
        { key: "status", label: "상태", previous: "상담 중", value: "데모 완료", editable: true },
        { key: "owner", label: "담당", previous: "미배정", value: "나", editable: true },
      ],
      untouched: "메모 · 팔로업 일정",
      confirmLabel: "변경 확인",
      doneText: "변경했습니다",
      openLabel: "리드 열기",
      undo: "window",
    },
  },
  summary: {
    say: "한빛수학학원 최근 기록 요약해 줘.",
    steps: ["한빛수학학원 기록 읽기"],
    text: "최근 2주 동안 접점이 3번 있었고, 어제 데모 뒤로는 후속 기록이 없습니다.",
    block: {
      kind: "read",
      card: {
        icon: "search",
        title: "최근 기록",
        target: { label: "한빛수학학원", meta: "기록 3건 · 방금 읽음" },
        log: [
          { when: "9월 28일", text: "데모 진행 · 86형 4대 관심" },
          { when: "9월 22일", text: "전화 · 데모 일정 확정" },
          { when: "9월 17일", text: "홈페이지 문의 접수" },
        ],
        note: "기록 원문에서 뽑은 요약 · 추측 없음",
        openLabel: "고객 화면에서 열기",
        openHref: "/admin/crm/customers/unified",
      },
    },
  },
  today: {
    say: "오늘 연락할 곳 알려 줘.",
    steps: ["후속조치 목록 읽기"],
    text: "오늘 기한인 후속조치는 3건입니다.",
    block: {
      kind: "read",
      card: {
        icon: "calendar",
        title: "오늘 후속조치",
        target: { label: "3건", meta: "CRM 현황의 순서 그대로" },
        table: {
          head: ["고객", "할 일", "기한"],
          rows: [
            ["도담영어", "쇼룸 안내", "11:00"],
            ["가온학원", "견적 회신 확인", "14:00"],
            ["다온과학", "재연락", "17:00"],
          ],
          textual: true,
        },
        openLabel: "CRM 현황에서 열기",
        openHref: "/admin/crm",
      },
    },
  },
  stock: {
    say: "86형 재고 몇 대야?",
    steps: ["하드웨어 재고 읽기"],
    text: "86형은 지금 바로 나갈 수 있는 수량이 17대입니다.",
    block: {
      kind: "read",
      card: {
        icon: "stock",
        title: "하드웨어 재고",
        target: { label: "86형", meta: "방금 읽음" },
        table: {
          head: ["모델", "가용", "예약", "배송예정"],
          rows: [
            ["S86 Pro", "12", "4", "3"],
            ["S86", "5", "1", "0"],
          ],
          warnColumn: 3,
        },
        note: "배송예정은 아직 들어오지 않은 수량",
        openLabel: "하드웨어 재고에서 열기",
        openHref: "/admin/hardware",
      },
    },
  },
  sms: {
    say: "도담영어 원장님한테 쇼룸 예약 안내 문자 보내 줘.",
    steps: ["도담영어 확인", "수신 동의 확인", "문구 작성"],
    text: "받는 사람과 문구를 확인해 주세요.",
    order: {
      type: "message.sms.send",
      risk: "R3",
      icon: "send",
      title: "문자 1건 발송",
      target: { label: "도담영어 원장", meta: "010-****-1234" },
      fields: [
        { key: "channel", label: "채널", value: "알림톡", hint: "실패 시 문자로 대체" },
        { key: "consent", label: "수신 동의", value: "확인됨", verified: true },
      ],
      message: {
        text: "[Classin] 쇼룸 방문 예약이 확정되었습니다. 10월 2일(금) 14:00, 강남 쇼룸. 변경은 이 번호로 회신해 주세요.",
      },
      confirmLabel: "발송 확인",
      doneText: "발송했습니다",
      openLabel: "고객 열기",
      undo: "none",
    },
  },
  pay: {
    say: "한빛수학학원 1차 입금 들어왔어. 결제 확정해 줘.",
    steps: ["한빛수학학원 거래건 확인", "1차 회차 금액 확인", "결제 확정 권한 확인"],
    text: "금액과 회차를 확인해 주세요.",
    order: {
      type: "payment.confirm",
      risk: "R2",
      sensitive: true,
      icon: "payment",
      title: "결제(수납) 확정",
      target: { label: "한빛수학학원", meta: "거래건 · S86 Pro 4대" },
      amount: { label: "1차 · 계약금", currency: "KRW", value: 13_200_000 },
      fields: [
        { key: "paidAt", label: "입금일", value: "2026-09-29", editable: true, numeric: true },
        { key: "status", label: "상태", previous: "입금 대기", value: "결제 확정" },
      ],
      confirmLabel: "결제 확정",
      doneText: "결제를 확정했습니다",
      openLabel: "거래건 열기",
      capabilityLabel: "결제 확정",
      undo: "none",
    },
  },
  ship: {
    say: "도담영어 출고 예정 건 오늘 나갔어. 확정해.",
    steps: ["출고 예정 건 확인", "가용 재고 확인", "입출고 확정 권한 확인"],
    text: "수량과 출고일을 확인해 주세요.",
    order: {
      type: "hardware.movement.finalize",
      risk: "R2",
      sensitive: true,
      icon: "stock",
      title: "출고 확정",
      target: { label: "S86 Pro", meta: "도담영어 · 경기 분당" },
      fields: [
        { key: "qty", label: "수량", previous: "예정 3", value: "확정 3", numeric: true },
        { key: "date", label: "출고일", value: "2026-09-29", editable: true, numeric: true },
        { key: "status", label: "상태", previous: "배송예정", value: "출고" },
        { key: "stock", label: "가용 재고", previous: "12", value: "9", numeric: true },
      ],
      confirmLabel: "출고 확정",
      doneText: "출고를 확정했습니다",
      openLabel: "재고 원본 열기",
      capabilityLabel: "입출고 확정",
      undo: "none",
      undoNote: "취소는 재고 화면에서",
    },
  },
  amount: {
    say: "가온학원 견적 10% 깎아 줘.",
    steps: ["가온학원 견적 확인", "금액 다시 계산", "금액 변경 권한 확인"],
    text: "새 버전을 만듭니다. 고객에게는 자동으로 나가지 않습니다.",
    order: {
      type: "quote.amount.update",
      risk: "R2",
      sensitive: true,
      icon: "amount",
      title: "견적 금액 변경",
      target: { label: "가온학원", meta: "Q-0142 · v2 → v3 새 버전" },
      amount: { label: "합계", currency: "KRW", previous: 38_000_000, value: 34_200_000 },
      fields: [{ key: "rule", label: "적용", value: "전 품목 일괄 할인 10%" }],
      untouched: "v2는 그대로 남음 · 고객에게 자동 발송하지 않음",
      confirmLabel: "변경 확인",
      doneText: "v3을 만들었습니다",
      openLabel: "견적 열기",
      capabilityLabel: "금액 변경",
      undo: "previous-version",
      undoNote: "이전 버전으로 복귀",
    },
  },
  delete: {
    say: "가온학원 리드 지워 줘.",
    steps: ["오더 카탈로그 확인"],
    block: {
      kind: "deny",
      card: {
        title: "삭제는 오더로 실행하지 않습니다",
        target: { label: "가온학원", meta: "리드" },
        text: "삭제, 계약 서명, 입출고 취소, 매출 마감, 대량 일괄 변경은 해당 화면에서 직접 합니다.",
        openLabel: "고객 화면 열기",
        openHref: "/admin/crm/customers/unified",
      },
    },
  },
  which: {
    say: "한빛학원 상태 바꿔 줘.",
    steps: ["고객 검색"],
    text: "같은 이름으로 2곳이 나왔습니다.",
    block: {
      kind: "choice",
      card: {
        title: "어느 고객인가요?",
        target: { label: "“한빛학원”", meta: "2곳이 검색됨" },
        options: [
          { label: "한빛수학학원", meta: "서울 강남 · 데모 완료" },
          { label: "한빛영어학원", meta: "경기 일산 · 신규" },
        ],
        note: "이름이 겹치면 추측하지 않는다",
      },
    },
  },
}

// 위에서부터 먼저 걸린다 — "삭제" 가 "기록" 보다 앞서야 "기록 삭제해 줘" 가 거절로 간다.
const KEYWORDS: ReadonlyArray<[RegExp, DemoScenarioKey]> = [
  [/지워|삭제/, "delete"],
  [/한빛학원/, "which"],
  [/결제|입금|수납/, "pay"],
  [/출고|입고|입출고/, "ship"],
  [/깎|할인|금액|견적/, "amount"],
  [/문자|알림톡|보내/, "sms"],
  [/재고/, "stock"],
  [/상태|담당|맡을/, "lead"],
  [/통화|컨택|연락 달/, "contact"],
  [/할 ?일|전화|잡아/, "task"],
  [/오늘|연락할/, "today"],
  [/요약|기록/, "summary"],
]

export function matchDemoScenario(text: string): DemoScenarioKey | null {
  const normalized = text.trim()
  if (!normalized) return null
  for (const [pattern, key] of KEYWORDS) {
    if (pattern.test(normalized)) return key
  }
  return null
}

export function demoScenarioPrompt(key: DemoScenarioKey): string {
  return SCENARIOS[key].say
}

export function demoScenarioSteps(key: DemoScenarioKey): string[] {
  return SCENARIOS[key].steps
}

export const DEMO_FALLBACK_TEXT =
  "시안 모드라 준비된 예시만 답합니다. 「재고」「할 일」「상태」「문자」「결제」「출고」「견적」「삭제」 같은 말을 넣어 보세요."

export function buildDemoTurn(
  key: DemoScenarioKey,
  input: { now: number; orderId: string; pagePath?: string }
): AdminAiTurnResult {
  const scenario = SCENARIOS[key]
  const blocks: AiBlock[] = []
  if (scenario.text) blocks.push({ kind: "text", text: scenario.text })

  if (scenario.order) {
    const order: OrderTicket = {
      ...scenario.order,
      // 시나리오 상수를 공유하지 않도록 복사한다 — 카드에서 값을 고쳐도 다음 오더에 새지 않는다.
      fields: scenario.order.fields.map((field) => ({ ...field })),
      message: scenario.order.message ? { ...scenario.order.message } : undefined,
      id: input.orderId,
      state: "draft",
      createdAt: input.now,
      expiresAt: input.now + ORDER_TTL_MS,
      pagePath: input.pagePath,
    }
    blocks.push({ kind: "order", orderId: order.id })
    return { blocks, order }
  }

  if (scenario.block) blocks.push(scenario.block)
  return { blocks }
}
