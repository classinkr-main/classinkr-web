// 고객 이력 갈래 판정 — 상담 내역 갈래·CRM 상담 단계 질문·조회·담당자와 부딪히지 않게 판정 표로 고정한다.
import { describe, expect, it } from "vitest"

import { isConsultationAsk, isCustomerHistoryAsk, routeMessage, routeSegment } from "@/lib/admin-ai/server/router"

import { CUSTOMER_HISTORY_ASKS, CUSTOMER_HISTORY_COMPOUND, CUSTOMER_HISTORY_NOT } from "../fixtures/customer-history-table"
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

const branchOf = (decision: ReturnType<typeof routeSegment>) =>
  decision.branch === "read" && decision.read
    ? `read:${decision.read.kind === "tool" ? decision.read.tool : decision.read.topic}`
    : decision.branch

describe("고객 이력 갈래 — 판정 표", () => {
  it("고객 이력을 묻는 말은 한 조각, 고객 이력 갈래다(되묻기 없음)", () => {
    expect(CUSTOMER_HISTORY_ASKS.length).toBeGreaterThanOrEqual(15)
    for (const text of CUSTOMER_HISTORY_ASKS) {
      expect(isCustomerHistoryAsk(text), text).toBe(true)
      expect(isConsultationAsk(text), text).toBe(false)
      const decisions = routeMessage(text)
      expect(decisions, text).toHaveLength(1)
      expect(decisions[0].branch, text).toBe("customer_history")
      expect(decisions[0].clarify, text).toBeUndefined()
    }
  })

  it("상담·문의, 목록·현황, CRM 상담 단계, 담당자, 방법·규정, 시키는 말은 이 갈래가 아니다", () => {
    for (const [text, expected] of CUSTOMER_HISTORY_NOT) {
      expect(isCustomerHistoryAsk(text), text).toBe(false)
      expect(routeMessage(text).map(branchOf), text).toEqual(expected)
    }
  })

  it("복합 문장은 고객 이력 조각과 다른 조각을 둘 다 답한다", () => {
    for (const [text, expected] of CUSTOMER_HISTORY_COMPOUND) {
      expect(routeMessage(text).map(branchOf), text).toEqual(expected)
    }
  })

  it("기존 판정 표(상담 내역·CRM 상담 단계 포함)의 어느 문장도 고객 이력 점수를 받지 않는다 — 기존 갈래·되묻기가 그대로다", () => {
    const existing = [
      ...INTENT_ASKS,
      ...INTENT_COMMANDS.map(([text]) => text),
      ...INFO_QUESTIONS,
      ...COMPOUND_QUESTIONS.map(([text]) => text),
      ...DECOY_QUESTIONS.map(([text]) => text),
      ...COMPOUND_NO_COMMA.map(([text]) => text),
      ...READ_RECALL.map(([text]) => text),
      ...DECOY_MORE.map(([text]) => text),
      ...CONSULTATION_ASKS,
      ...CONSULTATION_NOT.map(([text]) => text),
      ...CONSULTATION_CRM_KEEP.map(([text]) => text),
      ...CONSULTATION_COMPOUND.map(([text]) => text),
    ]
    expect(existing.length).toBeGreaterThan(150)
    for (const text of existing) {
      for (const decision of routeMessage(text)) {
        expect(decision.scores.customer_history, `${text} / ${decision.text}`).toBe(0)
        expect(decision.branch, text).not.toBe("customer_history")
      }
    }
  })

  it("고객 이력 문장은 상담 내역 점수를 받지 않는다(두 갈래가 서로 겹치지 않는다)", () => {
    for (const text of CUSTOMER_HISTORY_ASKS) {
      for (const decision of routeMessage(text)) expect(decision.scores.consultations, text).toBe(0)
    }
  })

  it("시키는 말은 고객 이력 낱말이 있어도 쓰기다", () => {
    expect(routeSegment("가나학원 결제 문제 기록 남겨 줘").branch).toBe("write")
  })

  it("영문 낱말 속 as·api 는 주제 말이 아니다(classin·rapid)", () => {
    expect(isCustomerHistoryAsk("가나학원 classin 이슈 있었나?")).toBe(true) // 이슈 + 지난 일 — 주제 없이 전부
    expect(isCustomerHistoryAsk("classin 결제 문제 있었어?")).toBe(false) // 제품 질문
    expect(isCustomerHistoryAsk("rapid 문제 있었나?")).toBe(false) // 고객·주제 없음
  })
})
