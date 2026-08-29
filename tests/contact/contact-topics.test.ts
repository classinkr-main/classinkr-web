import { describe, expect, it } from "vitest"

import {
  CONTACT_TOPICS,
  EVENT_CONTACT_TOPICS,
  isContactTopic,
} from "@/lib/contact/topics"

/**
 * 문의 유형은 `leads.source_detail` 에 그대로 실리는 집계 키다. 컬럼에 CHECK 제약이
 * 없어서, 값이 조용히 바뀌면 과거 리드와 끊긴 채 통계만 갈라진다 — 그래서 값 자체를
 * 고정 기대값으로 박아 둔다. 유형을 늘리는 것은 자유지만 **기존 값 변경은 이 테스트가
 * 막는다**.
 */
const EXPECTED_TOPIC_VALUES = [
  "도입 상담",
  "수업 운영 상담",
  "결제/영수증/계약",
  "계정/접속/기술 지원",
  "하드웨어/설치/AS",
  "행사 신청",
  "세미나 신청",
] as const

describe("문의 유형 SSOT", () => {
  it("기존 집계 키를 보존한다", () => {
    expect(CONTACT_TOPICS.map((topic) => topic.value)).toEqual([...EXPECTED_TOPIC_VALUES])
  })

  it("값이 중복되지 않는다", () => {
    const values = CONTACT_TOPICS.map((topic) => topic.value)
    expect(new Set(values).size).toBe(values.length)
  })

  it("행사 선택기를 띄우는 유형은 행사·세미나 둘뿐이다", () => {
    expect([...EVENT_CONTACT_TOPICS].sort()).toEqual(["세미나 신청", "행사 신청"])
  })

  describe("isContactTopic", () => {
    it("등록된 유형을 통과시킨다", () => {
      for (const value of EXPECTED_TOPIC_VALUES) {
        expect(isContactTopic(value)).toBe(true)
      }
    })

    it("미등록 문자열과 비문자열을 거부한다", () => {
      // 공개 폼이 보내는 값이 아니라 임의 주입에 해당한다.
      expect(isContactTopic("도입상담")).toBe(false)
      expect(isContactTopic(" 도입 상담 ")).toBe(false)
      expect(isContactTopic("checkout_request:hardware")).toBe(false)
      expect(isContactTopic("")).toBe(false)
      expect(isContactTopic(undefined)).toBe(false)
      expect(isContactTopic(null)).toBe(false)
      expect(isContactTopic(123)).toBe(false)
    })
  })
})
