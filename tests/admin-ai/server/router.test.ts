import { describe, expect, it } from "vitest"

import { detectForm, isConsultationAsk, routeMessage, routeSegment, splitSegments } from "@/lib/admin-ai/server/router"

import {
  CONSULTATION_ASKS,
  CONSULTATION_COMPOUND,
  CONSULTATION_CRM_KEEP,
  CONSULTATION_NOT,
  INTENT_ASKS,
  INTENT_COMMANDS,
} from "../fixtures/intent-table"
import {
  COMPOUND_NO_COMMA,
  COMPOUND_QUESTIONS,
  DECOY_MORE,
  DECOY_QUESTIONS,
  INFO_QUESTIONS,
  READ_RECALL,
} from "../fixtures/server-questions"

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

describe("상담 내역 갈래 — 판정 표(새 문장 30개)", () => {
  it("상담 내역을 찾는 말 20개는 한 조각, 상담 내역 갈래다(되묻기 없음)", () => {
    expect(CONSULTATION_ASKS).toHaveLength(20)
    for (const text of CONSULTATION_ASKS) {
      const decisions = routeMessage(text)
      expect(decisions, text).toHaveLength(1)
      expect(decisions[0].branch, text).toBe("consultations")
      expect(decisions[0].clarify, text).toBeUndefined()
    }
  })

  it("상담 낱말이 있어도 정보·담당자·화면 질문 10개는 이 갈래가 아니다", () => {
    expect(CONSULTATION_NOT).toHaveLength(10)
    expect(CONSULTATION_ASKS.length + CONSULTATION_NOT.length).toBe(30)
    for (const [text, branch] of CONSULTATION_NOT) {
      expect(isConsultationAsk(text), text).toBe(false)
      const decisions = routeMessage(text)
      expect(decisions.map((d) => d.branch), text).toEqual([branch])
    }
  })

  it("기존 판정 표의 어느 문장도 상담 내역 점수를 받지 않는다 — 기존 갈래·되묻기가 그대로다", () => {
    const existing = [
      ...INTENT_ASKS,
      ...INTENT_COMMANDS.map(([text]) => text),
      ...INFO_QUESTIONS,
      ...COMPOUND_QUESTIONS.map(([text]) => text),
      ...DECOY_QUESTIONS.map(([text]) => text),
      ...COMPOUND_NO_COMMA.map(([text]) => text),
      ...READ_RECALL.map(([text]) => text),
      ...DECOY_MORE.map(([text]) => text),
    ]
    expect(existing.length).toBeGreaterThan(100)
    for (const text of existing) {
      for (const decision of routeMessage(text)) {
        expect(decision.scores.consultations, `${text} / ${decision.text}`).toBe(0)
        expect(decision.branch, text).not.toBe("consultations")
      }
    }
  })

  const branchOf = (decision: ReturnType<typeof routeSegment>) =>
    decision.branch === "read" && decision.read
      ? `read:${decision.read.kind === "tool" ? decision.read.tool : decision.read.topic}`
      : decision.branch

  it("CRM 상담 단계·일정 문장 — 상담이 다른 대상의 이름이면 옛 판정 그대로다", () => {
    for (const [text, expected] of CONSULTATION_CRM_KEEP) {
      expect(isConsultationAsk(text), text).toBe(false)
      expect(routeMessage(text).map(branchOf), text).toEqual(expected)
    }
  })

  it("복합 문장은 상담 내역 조각과 다른 조각을 둘 다 답한다", () => {
    for (const [text, expected] of CONSULTATION_COMPOUND) {
      expect(routeMessage(text).map(branchOf), text).toEqual(expected)
    }
  })

  it("시키는 말은 상담 낱말이 있어도 쓰기다", () => {
    expect(routeSegment("가나학원 상담 기록 남겨 줘").branch).toBe("write")
  })
})
