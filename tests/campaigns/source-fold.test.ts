import { describe, expect, it } from "vitest"
import { SOURCE_FOLD_OTHER_COLOR, foldSourceGroups, foldSourceRow } from "@/lib/marketing/source-fold"
import type { LeadDailyBySourcePoint } from "@/lib/marketing/perf"

const rows: LeadDailyBySourcePoint[] = [
  { date: "2026-09-01", meta: 5, homepage: 2, resources: 1, newsletter: 1, channel_talk: 1, chatbot: 1 },
  { date: "2026-09-02", meta: 4, homepage: 1, resources: 1, manual_etc: 2 },
  { date: "2026-09-03", meta: 3, homepage: 2 },
]

describe("foldSourceGroups", () => {
  it("합계 상위 4개는 자기 색, 나머지는 '그 외' 하나로 접고 구성원을 밝힌다", () => {
    const fold = foldSourceGroups(rows)
    expect(fold.series.map((s) => s.key)).toEqual(["meta", "homepage", "resources", "manual_etc", "other"])
    const other = fold.series[fold.series.length - 1]
    expect(other.label).toBe("그 외")
    expect(other.color).toBe(SOURCE_FOLD_OTHER_COLOR)
    expect(other.members).toEqual(["newsletter", "channel_talk", "chatbot"])
    expect(other.total).toBe(3)
    expect(fold.total).toBe(24)
  })

  it("접어서 하나만 남을 상황이면 접지 않는다(그 외 1개 금지)", () => {
    const fold = foldSourceGroups([
      { date: "2026-09-01", meta: 5, homepage: 2, resources: 1, newsletter: 1, channel_talk: 1 },
    ])
    expect(fold.series.map((s) => s.key)).toEqual(["meta", "homepage", "resources", "newsletter", "channel_talk"])
  })

  it("합계 0 인 그룹은 시리즈에 없다 — 없는 소스를 범례에 세우지 않는다", () => {
    const fold = foldSourceGroups([{ date: "2026-09-01", meta: 3 }])
    expect(fold.series.map((s) => s.key)).toEqual(["meta"])
    expect(fold.total).toBe(3)
  })
})

describe("foldSourceRow", () => {
  it("행을 접힌 키로 다시 합친다 — 없는 날은 전부 0(시리즈 키는 항상 존재)", () => {
    const fold = foldSourceGroups(rows)
    expect(foldSourceRow(rows[0], fold)).toEqual({ meta: 5, homepage: 2, resources: 1, manual_etc: 0, other: 3 })
    expect(foldSourceRow(undefined, fold)).toEqual({ meta: 0, homepage: 0, resources: 0, manual_etc: 0, other: 0 })
  })
})
