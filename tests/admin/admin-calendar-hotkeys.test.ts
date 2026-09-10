import { describe, expect, it } from "vitest"

import { resolveHotkey } from "@/lib/admin-calendar/hotkeys"

describe("단축키 매핑", () => {
  it("화살표는 이전/다음 이동이다", () => {
    expect(resolveHotkey({ key: "ArrowLeft" })).toEqual({ kind: "step", direction: -1 })
    expect(resolveHotkey({ key: "ArrowRight" })).toEqual({ kind: "step", direction: 1 })
  })

  it("t/T는 오늘로 이동이다", () => {
    expect(resolveHotkey({ key: "t" })).toEqual({ kind: "today" })
    expect(resolveHotkey({ key: "T" })).toEqual({ kind: "today" })
  })

  it("m/w/a/l/d는 뷰 전환이다", () => {
    expect(resolveHotkey({ key: "m" })).toEqual({ kind: "view", view: "month" })
    expect(resolveHotkey({ key: "w" })).toEqual({ kind: "view", view: "week" })
    expect(resolveHotkey({ key: "a" })).toEqual({ kind: "view", view: "assignee" })
    expect(resolveHotkey({ key: "l" })).toEqual({ kind: "view", view: "agenda" })
    expect(resolveHotkey({ key: "d" })).toEqual({ kind: "view", view: "timeline" })
  })

  it("n은 새 일정 만들기다", () => {
    expect(resolveHotkey({ key: "n" })).toEqual({ kind: "create" })
  })

  it("/는 검색이다", () => {
    expect(resolveHotkey({ key: "/" })).toEqual({ kind: "search" })
  })

  it("매핑에 없는 키는 null이다", () => {
    expect(resolveHotkey({ key: "x" })).toBeNull()
    expect(resolveHotkey({ key: "Escape" })).toBeNull()
    // 대문자는 t/T 외엔 매핑이 없다 — "M" 은 shift+m 이지 month 단축키가 아니다.
    expect(resolveHotkey({ key: "M" })).toBeNull()
    expect(resolveHotkey({ key: "1" })).toBeNull()
  })
})

describe("수식키 조합은 브라우저 단축키를 존중해 무시한다", () => {
  it("meta 조합은 null이다", () => {
    expect(resolveHotkey({ key: "m", metaKey: true })).toBeNull()
    expect(resolveHotkey({ key: "ArrowLeft", metaKey: true })).toBeNull()
  })

  it("ctrl 조합은 null이다", () => {
    expect(resolveHotkey({ key: "n", ctrlKey: true })).toBeNull()
  })

  it("alt 조합은 null이다", () => {
    expect(resolveHotkey({ key: "t", altKey: true })).toBeNull()
  })

  it("shift 단독은 조합으로 취급하지 않는다 — t/T 매핑이 그대로 적용된다", () => {
    expect(resolveHotkey({ key: "T", shiftKey: true })).toEqual({ kind: "today" })
  })
})

describe("폼 입력 요소 위에서는 죽는다", () => {
  it("input 위에서는 null이다", () => {
    expect(resolveHotkey({ key: "m", target: { tagName: "INPUT" } })).toBeNull()
  })

  it("textarea 위에서는 null이다", () => {
    expect(resolveHotkey({ key: "n", target: { tagName: "TEXTAREA" } })).toBeNull()
  })

  it("select 위에서는 null이다", () => {
    expect(resolveHotkey({ key: "w", target: { tagName: "SELECT" } })).toBeNull()
  })

  it("isContentEditable 요소 위에서는 null이다", () => {
    expect(
      resolveHotkey({ key: "/", target: { tagName: "DIV", isContentEditable: true } })
    ).toBeNull()
  })

  it("tagName 대소문자와 무관하게 인식한다", () => {
    expect(resolveHotkey({ key: "m", target: { tagName: "input" } })).toBeNull()
  })

  it("일반 요소 위에서는 정상 동작한다", () => {
    expect(resolveHotkey({ key: "m", target: { tagName: "DIV" } })).toEqual({
      kind: "view",
      view: "month",
    })
  })

  it("target이 없거나 형태가 이상해도 죽지 않고 안전하게 좁힌다", () => {
    expect(resolveHotkey({ key: "m" })).toEqual({ kind: "view", view: "month" })
    expect(resolveHotkey({ key: "m", target: null })).toEqual({ kind: "view", view: "month" })
    expect(resolveHotkey({ key: "m", target: "not-an-element" })).toEqual({
      kind: "view",
      view: "month",
    })
    expect(resolveHotkey({ key: "m", target: { tagName: 123 } })).toEqual({
      kind: "view",
      view: "month",
    })
  })
})
