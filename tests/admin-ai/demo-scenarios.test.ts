import { describe, expect, it } from "vitest"

import {
  buildDemoTurn,
  demoScenarioPrompt,
  demoScenarioRisk,
  demoScenarioSteps,
  matchDemoScenario,
  type DemoScenarioKey,
} from "@/lib/admin-ai/demo-scenarios"
import { COMMON_ASK_ITEMS } from "@/lib/admin-ai/suggestions"

// 점검 R4 — 묻기만 했는데 실행 오더 카드(R2 민감)가 나오던 문장 표.
// 시나리오 id 가 정확히 무엇이든 "R1 이상 오더 카드로 가지 않는다" 가 계약이다.
const QUESTIONS: ReadonlyArray<[string, DemoScenarioKey | null]> = [
  // 점검 때 실제로 오더 카드가 뜬 문장 — 담당·누구
  ["카메라 화질 HQ 담당 누구야", "who"],
  ["결제 오류 누구한테 물어봐?", "who"],
  ["SMS 인증 안 되는데 본사 누구", "who"],
  ["출고 누구 담당이야?", "who"],
  ["견적 할인 승인은 누가 해?", "who"],
  ["입금 확인은 담당자가 누구예요", "who"],
  // 링크
  ["견적서 링크 알려줘", "link"],
  ["결제 확정하는 화면 어디서 해?", "link"],
  ["출고 등록 화면 링크 좀", "link"],
  ["고객 상세 바로가기 알려 줘", "link"],
  // 정책·되나
  ["결제 확정 전에 입금 확인 안 해도 되나?", "knowledge"],
  ["견적 금액 바꿔도 되나요", "knowledge"],
  ["출고 확정하면 취소 가능한가요", "knowledge"],
  ["할인 10% 넘게 해도 되나?", "knowledge"],
  ["문자 발송 정책이 어떻게 돼?", "knowledge"],
  // 초안·예정
  ["견적 초안 만들어줘", "knowledge"],
  ["출고 예정 등록", "knowledge"],
  ["결제 예정일이 언제야?", "knowledge"],
  ["입고 예정 건 알려줘", "knowledge"],
  ["문자 초안 써 줘", "knowledge"],
]

describe("시안 시나리오 — 질문형 문장 먼저 판정(R4)", () => {
  it("질문 20개는 어느 것도 R1 이상 오더 카드로 가지 않는다", () => {
    expect(QUESTIONS).toHaveLength(20)
    for (const [text, expected] of QUESTIONS) {
      const key = matchDemoScenario(text)
      expect(key, text).toBe(expected)
      expect(key === null ? null : demoScenarioRisk(key), text).toBeNull()
      if (key) expect(buildDemoTurn(key, { now: 1, orderId: "x" }).order, text).toBeUndefined()
    }
  })

  it("실제로 시키는 말은 그대로 오더 카드로 간다", () => {
    const orders: ReadonlyArray<[string, DemoScenarioKey]> = [
      ["한빛수학학원 1차 입금 들어왔어. 결제 확정해 줘.", "pay"],
      ["도담영어 출고 예정 건 오늘 나갔어. 확정해.", "ship"],
      ["가온학원 견적 10% 깎아 줘.", "amount"],
      ["도담영어 원장님한테 쇼룸 예약 안내 문자 보내 줘.", "sms"],
      ["새움에듀 데모 끝났어. 상태 바꾸고 내가 맡을게.", "lead"],
      ["한빛수학학원 내일 오후 3시에 데모 후속 전화 할 일 잡아 줘. 담당은 나.", "task"],
    ]
    for (const [text, key] of orders) expect(matchDemoScenario(text), text).toBe(key)
  })

  it("묻는 말이어도 조회 시나리오가 있는 것은 조회로 간다(오더 아님)", () => {
    expect(matchDemoScenario("86형 재고 몇 대야?")).toBe("stock")
    expect(matchDemoScenario("오늘 연락할 곳 알려 줘.")).toBe("today")
    for (const key of ["stock", "today"] as const) expect(demoScenarioRisk(key)).toBeNull()
  })

  it("삭제 요청은 초안·예정이 섞여도 거절로 간다", () => {
    expect(matchDemoScenario("견적 초안 삭제해 줘")).toBe("delete")
    expect(matchDemoScenario("가온학원 리드 지워 줘.")).toBe("delete")
  })

  it("추천 문장(say)은 자기 시나리오로 돌아온다 — 칩을 눌러도 같은 답이 나온다", () => {
    const keys: DemoScenarioKey[] = [
      "task", "contact", "lead", "summary", "today", "stock", "sms", "pay", "ship", "amount",
      "delete", "which", "who", "knowledge", "link",
    ]
    for (const key of keys) expect(matchDemoScenario(demoScenarioPrompt(key)), key).toBe(key)
  })

  it("공통 추천 칩은 담당자·링크·정책 묻기이고 모두 조회(R0)다", () => {
    expect(COMMON_ASK_ITEMS.map((item) => item.label)).toEqual(["담당자 찾기", "링크 찾기", "정책 묻기"])
    for (const item of COMMON_ASK_ITEMS) {
      expect(item.risk).toBe("R0")
      expect(demoScenarioRisk(item.scenario)).toBeNull()
    }
  })

  it("묻기 시나리오는 오더 없이 글 한 줄과 묻기 카드(담당자·답·링크)를 낸다(B4)", () => {
    const expected = { who: "contact", knowledge: "answer", link: "links" } as const
    for (const key of ["who", "knowledge", "link"] as const) {
      const turn = buildDemoTurn(key, { now: 1, orderId: "x" })
      expect(turn.blocks.map((block) => block.kind), key).toEqual(["text", expected[key]])
      expect(turn.order, key).toBeUndefined()
    }
  })
})

describe("시안 카드 문구 — 실제처럼 보이는 말을 쓰지 않는다(R16)", () => {
  it("진행 단계에 '권한 확인' 이 없다", () => {
    for (const key of ["pay", "ship", "amount", "task", "lead", "sms"] as const) {
      expect(demoScenarioSteps(key).join(" "), key).not.toContain("권한 확인")
    }
  })

  it("문자 오더의 수신 동의는 서버가 확인한 사실로 표시되지 않는다", () => {
    const consent = buildDemoTurn("sms", { now: 1, orderId: "x" }).order?.fields.find(
      (field) => field.key === "consent"
    )
    expect(consent?.verified).toBeFalsy()
    expect(consent?.value).not.toBe("확인됨")
  })
})
