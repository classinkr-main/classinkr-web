import { describe, expect, it } from "vitest"

import {
  CHAT_INPUT_MAX_HEIGHT_PX,
  CHAT_INPUT_MIN_HEIGHT_PX,
  CHAT_NEAR_BOTTOM_THRESHOLD_PX,
  isNearBottom,
  resolveChatInputHeight,
} from "@/components/ui/chatbot-input-autosize"

describe("chatbot input autosize constants", () => {
  it("matches min-h-11 · max-h-28 and the scroll threshold", () => {
    expect(CHAT_INPUT_MIN_HEIGHT_PX).toBe(44)
    expect(CHAT_INPUT_MAX_HEIGHT_PX).toBe(112)
    expect(CHAT_NEAR_BOTTOM_THRESHOLD_PX).toBe(45)
  })
})

describe("resolveChatInputHeight", () => {
  it("keeps one line at the minimum without a scrollbar", () => {
    expect(resolveChatInputHeight(44)).toEqual({ height: 44, overflowY: "hidden" })
  })

  it("grows with content between the limits", () => {
    expect(resolveChatInputHeight(68)).toEqual({ height: 68, overflowY: "hidden" })
    expect(resolveChatInputHeight(92)).toEqual({ height: 92, overflowY: "hidden" })
  })

  it("stops at the maximum without a scrollbar when content fits exactly", () => {
    expect(resolveChatInputHeight(112)).toEqual({ height: 112, overflowY: "hidden" })
  })

  it("caps at the maximum and scrolls inside once content overflows", () => {
    expect(resolveChatInputHeight(140)).toEqual({ height: 112, overflowY: "auto" })
  })

  it("never shrinks below the minimum", () => {
    expect(resolveChatInputHeight(30)).toEqual({ height: 44, overflowY: "hidden" })
  })

  it("falls back to the minimum for an unusable scrollHeight", () => {
    expect(resolveChatInputHeight(0)).toEqual({ height: 44, overflowY: "hidden" })
    expect(resolveChatInputHeight(-5)).toEqual({ height: 44, overflowY: "hidden" })
    expect(resolveChatInputHeight(Number.NaN)).toEqual({ height: 44, overflowY: "hidden" })
  })

  it("rounds fractional heights up so the last line is not clipped", () => {
    expect(resolveChatInputHeight(67.2)).toEqual({ height: 68, overflowY: "hidden" })
  })

  it("uses computed limits when they are usable", () => {
    expect(resolveChatInputHeight(60, 52, 130)).toEqual({ height: 60, overflowY: "hidden" })
    expect(resolveChatInputHeight(40, 52, 130)).toEqual({ height: 52, overflowY: "hidden" })
    expect(resolveChatInputHeight(150, 52, 130)).toEqual({ height: 130, overflowY: "auto" })
  })

  it("falls back to the default limits when computed limits are NaN or not positive", () => {
    expect(resolveChatInputHeight(90, Number.NaN, Number.NaN)).toEqual({ height: 90, overflowY: "hidden" })
    expect(resolveChatInputHeight(140, Number.NaN, Number.NaN)).toEqual({ height: 112, overflowY: "auto" })
    expect(resolveChatInputHeight(20, 0, -1)).toEqual({ height: 44, overflowY: "hidden" })
    expect(resolveChatInputHeight(Number.NaN, Number.NaN, Number.NaN)).toEqual({ height: 44, overflowY: "hidden" })
  })
})

describe("isNearBottom", () => {
  it("is true when the remaining distance equals the threshold", () => {
    expect(isNearBottom({ scrollHeight: 1000, scrollTop: 555, clientHeight: 400 })).toBe(true)
  })

  it("is false one pixel past the threshold", () => {
    expect(isNearBottom({ scrollHeight: 1000, scrollTop: 554, clientHeight: 400 })).toBe(false)
  })

  it("is true at the very bottom and when content is shorter than the viewport", () => {
    expect(isNearBottom({ scrollHeight: 1000, scrollTop: 600, clientHeight: 400 })).toBe(true)
    expect(isNearBottom({ scrollHeight: 300, scrollTop: 0, clientHeight: 400 })).toBe(true)
  })

  it("accepts a custom threshold", () => {
    expect(isNearBottom({ scrollHeight: 1000, scrollTop: 590, clientHeight: 400 }, 10)).toBe(true)
    expect(isNearBottom({ scrollHeight: 1000, scrollTop: 589, clientHeight: 400 }, 10)).toBe(false)
  })
})
