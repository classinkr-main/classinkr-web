import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  CHAT_INPUT_MAX_HEIGHT_PX,
  CHAT_INPUT_MIN_HEIGHT_PX,
  CHAT_NEAR_BOTTOM_THRESHOLD_PX,
  isNearBottom,
  resolveChatInputHeight,
  resolveListScrollTopAfterInputResize,
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

describe("resolveListScrollTopAfterInputResize", () => {
  // 목록 scrollHeight 461, 입력창 92px 일 때 clientHeight 366(맨 아래 scrollTop 95), auto(44px)로 줄이면 414(최대 47).
  it("높이가 바뀌었고 맨 아래를 보고 있었으면 맨 아래로 둔다", () => {
    expect(
      resolveListScrollTopAfterInputResize({ heightChanged: true, wasNearBottom: true, prevScrollTop: 71, scrollTop: 47, scrollHeight: 461 })
    ).toBe(461)
  })

  it("Safari: 여러 줄에서 글자만 쳐 높이가 그대로여도, 재는 동안 깎인 scrollTop 을 되돌린다", () => {
    expect(
      resolveListScrollTopAfterInputResize({ heightChanged: false, wasNearBottom: true, prevScrollTop: 95, scrollTop: 47, scrollHeight: 461 })
    ).toBe(95)
  })

  it("위로 올려 읽는 중이면 높이가 바뀌어도 원래 위치로 되돌리고 맨 아래로 끌어내리지 않는다", () => {
    expect(
      resolveListScrollTopAfterInputResize({ heightChanged: true, wasNearBottom: false, prevScrollTop: 30, scrollTop: 10, scrollHeight: 461 })
    ).toBe(30)
  })

  it("Chromium·Firefox 처럼 스크롤 앵커링이 이미 되돌렸으면 건드리지 않는다", () => {
    expect(
      resolveListScrollTopAfterInputResize({ heightChanged: false, wasNearBottom: true, prevScrollTop: 95, scrollTop: 95, scrollHeight: 461 })
    ).toBeNull()
    expect(
      resolveListScrollTopAfterInputResize({ heightChanged: true, wasNearBottom: false, prevScrollTop: 0, scrollTop: 0, scrollHeight: 461 })
    ).toBeNull()
  })
})

describe("FloatingChatbot 입력창 높이 맞춤 연결", () => {
  // 입력 폼과 높이 맞춤은 components/ui/chatbot/ChatComposer.tsx 에 있다.
  const source = readFileSync(join(process.cwd(), "components/ui/chatbot/ChatComposer.tsx"), "utf8")

  it("재기 전 목록 scrollTop 을 잡아 두고, 높이를 정한 뒤 resolveListScrollTopAfterInputResize 로 되돌린다", () => {
    const body = source.match(/const resize = \(\) => \{([\s\S]*?)\n {8}\}/)?.[1] ?? ""
    expect(body).not.toBe("")
    const capture = body.indexOf("const prevScrollTop = container ? container.scrollTop : 0")
    const collapse = body.indexOf('el.style.height = "auto"')
    const restore = body.indexOf("resolveListScrollTopAfterInputResize({")
    expect(capture).toBeGreaterThan(-1)
    expect(collapse).toBeGreaterThan(capture)
    expect(restore).toBeGreaterThan(collapse)
    expect(body).toContain("heightChanged: height !== prev")
  })
})
