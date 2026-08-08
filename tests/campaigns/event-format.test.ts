import { describe, expect, it } from "vitest"
import { distinguishingLabels, formatRange, previewText, statusTone, won, pct } from "@/components/admin/campaigns/event-format"

describe("formatRange", () => {
  it("formats a single day with M/D", () => {
    expect(formatRange("2026-07-18T00:00:00.000Z", null)).toBe("7/18")
  })
  it("formats a range as start ~ end", () => {
    expect(formatRange("2026-07-18T00:00:00.000Z", "2026-07-20T00:00:00.000Z")).toBe("7/18 ~ 7/20")
  })
})

describe("previewText", () => {
  it("returns null for empty/whitespace input", () => {
    expect(previewText(null)).toBeNull()
    expect(previewText("   ")).toBeNull()
  })
  it("truncates beyond maxLength with an ellipsis", () => {
    const long = "a".repeat(200)
    const result = previewText(long, 160)
    expect(result?.length).toBe(160)
    expect(result?.endsWith("…")).toBe(true)
  })
})

describe("statusTone", () => {
  it("DESIGN.md 운영 상태 스케일 — 진행=Success 그린, 예정=Warning(파랑 금지), 마감=뉴트럴", () => {
    expect(statusTone("진행 중")).toContain("#084734")
    expect(statusTone("예정")).toContain("#A8741A")
    expect(statusTone("예정")).not.toContain("blue")
    expect(statusTone("마감")).not.toContain("#084734")
  })
})

/*
 * 차트 축·타임라인 바 라벨 — 공통 접두어를 벗겨 구분되는 꼬리를 남긴다.
 * 실제 사고: 행사명이 전부 "Classin Meets ○○"라 slice(0,13)이 네 라벨을 모두
 * "Classin Meets…"로 만들어 축에서 행사를 구분할 수 없었다.
 */
describe("distinguishingLabels", () => {
  it("공통 접두어를 벗겨 구분되는 꼬리를 남긴다", () => {
    expect(
      distinguishingLabels(["Classin Meets July", "Classin Meets Incheon", "Classin Meets Busan"])
    ).toEqual(["July", "Incheon", "Busan"])
  })

  it("접두어는 공백 경계로 되돌려 자른다 — 단어 중간을 벗기지 않는다", () => {
    expect(distinguishingLabels(["세미나 부산", "세미나 북구"])).toEqual(["부산", "북구"])
  })

  it("항목이 하나뿐이면 벗기지 않는다(길이 제한만 적용)", () => {
    expect(distinguishingLabels(["Classin Meets July"], 30)).toEqual(["Classin Meets July"])
  })

  it("공통 접두어가 없으면 원문 유지 + 길이 제한만 적용", () => {
    expect(distinguishingLabels(["여름 세미나", "겨울 설명회"], 14)).toEqual(["여름 세미나", "겨울 설명회"])
  })

  it("완전히 같은 이름은 원문으로 폴백한다(빈 라벨 금지)", () => {
    const labels = distinguishingLabels(["같은 행사", "같은 행사"])
    expect(labels[0]).not.toBe("")
  })

  it("벗긴 뒤에도 길면 max 로 말줄임한다", () => {
    const [label] = distinguishingLabels(
      ["Classin Meets 아주아주아주아주 긴 행사 이름", "Classin Meets B"],
      10
    )
    expect(label.length).toBeLessThanOrEqual(10)
    expect(label.endsWith("…")).toBe(true)
  })
})

describe("won/pct", () => {
  it("renders — for null/undefined", () => {
    expect(won(null)).toBe("—")
    expect(pct(undefined)).toBe("—")
  })
  it("formats a number", () => {
    expect(pct(42)).toBe("42%")
  })
})
