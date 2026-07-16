import { describe, expect, it } from "vitest"

import { detectChatbotCategory, type ChatbotCategory } from "@/lib/chatbot/classification"
import { TOPIC_TAG_DICTIONARY, normalizeTopicTags } from "@/lib/chatbot/topic-crosswalk"

const CHATBOT_CATEGORIES: ChatbotCategory[] = [
  "billing",
  "hardware",
  "troubleshooting",
  "onboarding",
  "admin",
  "classroom",
  "consultation",
  "general",
]

describe("TOPIC_TAG_DICTIONARY", () => {
  it("holds 15~25 real-tag entries that all map to a valid ChatbotCategory", () => {
    const keys = Object.keys(TOPIC_TAG_DICTIONARY)
    expect(keys.length).toBeGreaterThanOrEqual(15)
    expect(keys.length).toBeLessThanOrEqual(25)
    for (const value of Object.values(TOPIC_TAG_DICTIONARY)) {
      expect(CHATBOT_CATEGORIES).toContain(value)
    }
  })
})

describe("normalizeTopicTags", () => {
  it("resolves core dictionary tags", () => {
    expect(normalizeTopicTags(["결제"])).toBe("billing")
    expect(normalizeTopicTags(["환불"])).toBe("billing")
    expect(normalizeTopicTags(["전자칠판"])).toBe("hardware")
    expect(normalizeTopicTags(["보드"])).toBe("hardware")
    expect(normalizeTopicTags(["수업"])).toBe("classroom")
    expect(normalizeTopicTags(["온보딩"])).toBe("onboarding")
    expect(normalizeTopicTags(["상담"])).toBe("consultation")
  })

  it("lets the dictionary override the public classifier for CS-specific tags", () => {
    // 공개 분류기는 '설치'를 hardware, '출결'을 classroom 으로 본다. CS 사전은 이를 의도적으로 오버라이드한다.
    expect(detectChatbotCategory("설치")).toBe("hardware")
    expect(normalizeTopicTags(["설치"])).toBe("troubleshooting")

    expect(detectChatbotCategory("출결")).toBe("classroom")
    expect(normalizeTopicTags(["출결"])).toBe("admin")

    expect(normalizeTopicTags(["로그인"])).toBe("troubleshooting")
    expect(normalizeTopicTags(["출석"])).toBe("admin")
  })

  it("normalizes case and surrounding whitespace", () => {
    expect(normalizeTopicTags(["  결제 "])).toBe("billing")
    expect(normalizeTopicTags(["OPS"])).toBe("hardware")
    expect(normalizeTopicTags(["Api"])).toBe("admin")
    expect(normalizeTopicTags(["BOARD"])).toBe("hardware")
  })

  it("handles structured prefix tags by stripping the prefix", () => {
    expect(normalizeTopicTags(["area:board"])).toBe("hardware")
    expect(normalizeTopicTags(["topic:결제"])).toBe("billing")
  })

  it("returns the first matching tag in array order", () => {
    expect(normalizeTopicTags(["환불", "수업"])).toBe("billing")
    expect(normalizeTopicTags(["수업", "환불"])).toBe("classroom")
  })

  it("falls back to detectChatbotCategory when no dictionary key matches exactly", () => {
    // 정확 사전 키가 아니지만 분류기가 잡아내는 자연어 태그.
    expect(normalizeTopicTags(["결제하고 싶어요"])).toBe("billing")
    expect(normalizeTopicTags(["카메라 안켜짐"])).toBe("troubleshooting")
  })

  it("returns null when nothing resolves to a concrete topic", () => {
    expect(normalizeTopicTags(["기타"])).toBeNull()
    expect(normalizeTopicTags(["topic:recording"])).toBeNull()
    expect(normalizeTopicTags(["zzz"])).toBeNull()
  })

  it("returns null for empty or blank input", () => {
    expect(normalizeTopicTags([])).toBeNull()
    expect(normalizeTopicTags(["", "   "])).toBeNull()
  })
})
