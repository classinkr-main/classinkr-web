import { describe, expect, it } from "vitest"
import { formatRange, previewText, statusTone, won, pct } from "@/components/admin/campaigns/event-format"

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
  it("returns a distinct class string per status", () => {
    expect(statusTone("진행 중")).toContain("emerald")
    expect(statusTone("예정")).toContain("blue")
    expect(statusTone("마감")).not.toContain("emerald")
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
