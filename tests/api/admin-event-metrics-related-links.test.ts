import { describe, expect, it } from "vitest"
import { sanitizeRelatedLinks } from "@/app/api/admin/event-metrics/[id]/route"

describe("sanitizeRelatedLinks", () => {
  it("keeps valid {label,url} entries and trims whitespace", () => {
    const result = sanitizeRelatedLinks([
      { label: "  블로그 후기  ", url: " https://blog.classin.co.kr/incheon " },
    ])
    expect(result).toEqual([{ label: "블로그 후기", url: "https://blog.classin.co.kr/incheon" }])
  })

  it("drops entries with an empty label", () => {
    const result = sanitizeRelatedLinks([{ label: "  ", url: "https://example.com" }])
    expect(result).toEqual([])
  })

  it("drops entries whose url is not http(s)", () => {
    const result = sanitizeRelatedLinks([
      { label: "위험한 링크", url: "javascript:alert(1)" },
      { label: "상대경로", url: "/local/path" },
    ])
    expect(result).toEqual([])
  })

  it("returns [] for non-array input", () => {
    expect(sanitizeRelatedLinks(undefined)).toEqual([])
    expect(sanitizeRelatedLinks("not-an-array")).toEqual([])
  })

  it("caps at 10 entries", () => {
    const many = Array.from({ length: 15 }, (_, i) => ({
      label: `링크 ${i}`,
      url: `https://example.com/${i}`,
    }))
    expect(sanitizeRelatedLinks(many)).toHaveLength(10)
  })
})
