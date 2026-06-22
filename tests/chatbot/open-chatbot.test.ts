import { describe, expect, it } from "vitest"

import { buildChatbotOpenDetail, CHATBOT_OPEN_EVENT } from "@/lib/chatbot/open-chatbot"

describe("buildChatbotOpenDetail", () => {
  it("keeps the source and passes intent through", () => {
    expect(buildChatbotOpenDetail({ source: "cta", intent: "demo" })).toEqual({
      source: "cta",
      intent: "demo",
    })
  })

  it("trims prefill and omits it when empty", () => {
    expect(buildChatbotOpenDetail({ source: "teaser", prefill: "  요금 구성  " })).toEqual({
      source: "teaser",
      prefill: "요금 구성",
    })
    expect(buildChatbotOpenDetail({ source: "button", prefill: "   " })).toEqual({
      source: "button",
    })
  })

  it("exposes a stable event name", () => {
    expect(CHATBOT_OPEN_EVENT).toBe("classin:chatbot-open")
  })
})
