import { describe, expect, it } from "vitest"

import { buildContactLogEntry, channelCarriesResult } from "@/lib/crm/contact-log"

describe("channelCarriesResult", () => {
  it("통화 성격 채널만 결과를 갖는다", () => {
    expect(channelCarriesResult("call")).toBe(true)
    expect(channelCarriesResult("sms")).toBe(true)
    expect(channelCarriesResult("kakao")).toBe(false)
    expect(channelCarriesResult("email")).toBe(false)
  })
})

describe("buildContactLogEntry", () => {
  it("전화·문자는 결과를 그대로 싣는다", () => {
    expect(buildContactLogEntry({ type: "call", result: "answered" })).toEqual({
      type: "call",
      result: "answered",
    })
    expect(buildContactLogEntry({ type: "sms", result: "no_answer" })).toEqual({
      type: "sms",
      result: "no_answer",
    })
  })

  it("카카오·이메일에는 result 키 자체를 붙이지 않는다", () => {
    // UI가 결과 칩을 숨겨도 직전 선택값이 state에 남아 있어 그대로 전송되던 경로를 막는다.
    const kakao = buildContactLogEntry({ type: "kakao", result: "answered" })
    expect(kakao).toEqual({ type: "kakao" })
    expect("result" in kakao).toBe(false)

    const email = buildContactLogEntry({ type: "email", result: "meeting_set", notes: "안내 발송" })
    expect(email).toEqual({ type: "email", notes: "안내 발송" })
    expect("result" in email).toBe(false)
  })

  it("빈 메모·담당자는 떨어뜨리고 공백은 다듬는다", () => {
    expect(buildContactLogEntry({ type: "call", notes: "   ", contacted_by: "" })).toEqual({
      type: "call",
    })
    expect(buildContactLogEntry({ type: "call", notes: "  재시도 필요 ", contacted_by: " Moon " })).toEqual({
      type: "call",
      notes: "재시도 필요",
      contacted_by: "Moon",
    })
  })

  it("결과를 고르지 않은 전화는 result 없이 저장된다", () => {
    expect(buildContactLogEntry({ type: "call" })).toEqual({ type: "call" })
  })
})
