import { describe, expect, it } from "vitest"

import { detectForm, routeMessage, routeSegment, splitSegments } from "@/lib/admin-ai/server/router"

import { INTENT_ASKS, INTENT_COMMANDS } from "../fixtures/intent-table"
import { COMPOUND_QUESTIONS, DECOY_QUESTIONS, INFO_QUESTIONS } from "../fixtures/server-questions"

const DEMO_TO_WRITE: Record<string, string> = { sms: "send", amount: "amount", pay: "pay", ship: "ship", lead: "lead", task: "task" }

describe("서버 결정형 갈래 — 시안과 같은 질문/명령 판정(R4·F1)", () => {
  it("의문형·조회형 33개는 어느 조각도 쓰기로 가지 않는다", () => {
    expect(INTENT_ASKS).toHaveLength(33)
    for (const text of INTENT_ASKS) {
      for (const decision of routeMessage(text)) expect(decision.branch, text).not.toBe("write")
    }
  })

  it("시키는 말 8개는 쓰기로 가고 시안과 같은 종류다", () => {
    for (const [text, demoKey] of INTENT_COMMANDS) {
      const decisions = routeMessage(text)
      expect(decisions, text).toHaveLength(1)
      expect(decisions[0].branch, text).toBe("write")
      expect(decisions[0].write, text).toBe(DEMO_TO_WRITE[demoKey])
    }
  })

  it("시안의 실제 오더 문장 6개도 쓰기 한 조각이다(서술 조각은 맥락으로 붙는다)", () => {
    const orders: Array<[string, string]> = [
      ["한빛수학학원 1차 입금 들어왔어. 결제 확정해 줘.", "pay"],
      ["도담영어 출고 예정 건 오늘 나갔어. 확정해.", "ship"],
      ["가온학원 견적 10% 깎아 줘.", "amount"],
      ["도담영어 원장님한테 쇼룸 예약 안내 문자 보내 줘.", "send"],
      ["새움에듀 데모 끝났어. 상태 바꾸고 내가 맡을게.", "lead"],
      ["한빛수학학원 내일 오후 3시에 데모 후속 전화 할 일 잡아 줘. 담당은 나.", "task"],
    ]
    for (const [text, kind] of orders) {
      const decisions = routeMessage(text)
      expect(decisions.map((d) => d.branch), text).toEqual(["write"])
      expect(decisions[0].write, text).toBe(kind)
    }
  })

  it("등록할 수 있는 쓰기 두 가지를 알아본다", () => {
    expect(routeSegment("가온학원 견적 초안 만들어 줘").write).toBe("quote_draft")
    expect(routeSegment("T1 카메라 3대 내일 출고 예정 등록해 줘").write).toBe("hw_plan")
    expect(routeSegment("견적 초안 삭제해 줘").write).toBe("delete")
  })
})

describe("정보 질문·복합 질문·미끼 낱말", () => {
  it("정보 질문 20개는 묻기 갈래(답·담당자·링크)로만 간다", () => {
    expect(INFO_QUESTIONS).toHaveLength(20)
    for (const text of INFO_QUESTIONS) {
      for (const decision of routeMessage(text)) {
        expect(["knowledge", "contact", "link"], text).toContain(decision.branch)
      }
    }
  })

  it("복합 질문 10개는 조각 수만큼 나뉘고 조각마다 맞는 갈래다", () => {
    expect(COMPOUND_QUESTIONS).toHaveLength(10)
    for (const [text, count, branches] of COMPOUND_QUESTIONS) {
      const decisions = routeMessage(text)
      expect(decisions.length, text).toBe(count)
      expect(decisions.map((d) => d.branch), text).toEqual(branches)
    }
  })

  it("미끼 낱말 15개는 엉뚱한 갈래로 가지 않는다", () => {
    expect(DECOY_QUESTIONS).toHaveLength(15)
    for (const [text, forbidden] of DECOY_QUESTIONS) {
      for (const decision of routeMessage(text)) expect(forbidden, `${text} → ${decision.branch}`).not.toContain(decision.branch)
    }
  })

  it("점수가 가까우면 되묻기 후보 2개를 낸다", () => {
    const decision = routeSegment("견적서 링크 어디 있는지 누가 알아")
    expect(decision.clarify).toBeDefined()
    expect(decision.clarify).toHaveLength(2)
  })

  it("조각 나누기 — 쉼표 없는 이음은 한 조각, 서술은 붙는다", () => {
    expect(splitSegments("상태 바꾸고 내가 맡을게")).toHaveLength(1)
    expect(splitSegments("입금 들어왔어. 결제 확정해 줘.")).toEqual(["입금 들어왔어 결제 확정해 줘"])
    expect(detectForm("결제 확정 취소할 수 있어")).toBe("question")
    expect(detectForm("견적 초안 만들어줘")).toBe("command")
  })
})
