import { describe, expect, it } from "vitest"

import {
  budgetWeekAheadBuckets,
  classifyTaskBucket,
  type WeekAheadBucket,
} from "@/lib/crm/week-ahead"

// 2026-06-27T05:00:00Z == 2026-06-27 14:00 KST
const NOW = new Date("2026-06-27T05:00:00.000Z").getTime()

function at(iso: string) {
  return { status: "open", dueAt: iso }
}

describe("classifyTaskBucket", () => {
  it("classifies snoozed regardless of due date", () => {
    expect(classifyTaskBucket({ status: "snoozed", dueAt: "2026-06-20T00:00:00.000Z" }, NOW)).toBe("snoozed")
  })

  it("classifies past-due open tasks as overdue", () => {
    expect(classifyTaskBucket(at("2026-06-27T01:00:00.000Z"), NOW)).toBe("overdue")
    expect(classifyTaskBucket(at("2026-06-20T00:00:00.000Z"), NOW)).toBe("overdue")
  })

  it("classifies same KST day (future hours) as today", () => {
    // 2026-06-27 23:00 KST == 14:00Z, still 6/27 in KST
    expect(classifyTaskBucket(at("2026-06-27T14:00:00.000Z"), NOW)).toBe("today")
  })

  it("classifies within the next 7 days as week", () => {
    expect(classifyTaskBucket(at("2026-06-29T05:00:00.000Z"), NOW)).toBe("week")
    expect(classifyTaskBucket(at("2026-07-02T05:00:00.000Z"), NOW)).toBe("week")
  })

  it("classifies beyond 7 days as later (hidden from the worktable)", () => {
    expect(classifyTaskBucket(at("2026-07-20T05:00:00.000Z"), NOW)).toBe("later")
  })

  it("classifies missing/invalid due dates as nodue", () => {
    expect(classifyTaskBucket({ status: "open", dueAt: null }, NOW)).toBe("nodue")
    expect(classifyTaskBucket({ status: "open", dueAt: "not-a-date" }, NOW)).toBe("nodue")
  })
})

function groupsOf(counts: Partial<Record<WeekAheadBucket, number>>): Record<WeekAheadBucket, string[]> {
  const empty: Record<WeekAheadBucket, string[]> = {
    overdue: [], today: [], week: [], snoozed: [], nodue: [], later: [],
  }
  for (const [bucket, count] of Object.entries(counts)) {
    empty[bucket as WeekAheadBucket] = Array.from({ length: count ?? 0 }, (_, i) => `${bucket}-${i}`)
  }
  return empty
}

describe("budgetWeekAheadBuckets", () => {
  it("우선순위 순(지연 → 오늘 → 이번 주)으로 예산을 채운다", () => {
    const result = budgetWeekAheadBuckets(groupsOf({ overdue: 4, today: 5, week: 3 }), 6)
    expect(result.slices.map((slice) => slice.bucket)).toEqual(["overdue", "today"])
    expect(result.slices[0].tasks).toHaveLength(4)
    expect(result.slices[1].tasks).toHaveLength(2)
    expect(result.shownCount).toBe(6)
  })

  it("헤더용 total은 잘라내기 전 버킷 총량을 유지한다", () => {
    const result = budgetWeekAheadBuckets(groupsOf({ overdue: 9 }), 3)
    expect(result.slices[0].tasks).toHaveLength(3)
    expect(result.slices[0].total).toBe(9)
  })

  it("잘린 건수를 hiddenCount로 돌려준다 — 예산 밖 버킷 전체 포함", () => {
    const result = budgetWeekAheadBuckets(groupsOf({ overdue: 4, today: 5, week: 3, nodue: 10 }), 6)
    expect(result.totalCount).toBe(22)
    expect(result.hiddenCount).toBe(16)
  })

  it("한 건도 못 채운 버킷은 빈 헤더로 남기지 않는다", () => {
    const result = budgetWeekAheadBuckets(groupsOf({ overdue: 6, week: 2 }), 6)
    expect(result.slices.map((slice) => slice.bucket)).toEqual(["overdue"])
  })

  it("budget이 null이면 제한 없이 전부 돌려준다", () => {
    const result = budgetWeekAheadBuckets(groupsOf({ overdue: 4, today: 5, nodue: 10 }), null)
    expect(result.shownCount).toBe(19)
    expect(result.hiddenCount).toBe(0)
    expect(result.slices).toHaveLength(3)
  })

  it("표시 대상이 아닌 later 버킷은 예산에도 총량에도 넣지 않는다", () => {
    const result = budgetWeekAheadBuckets(groupsOf({ today: 2, later: 30 }), 6)
    expect(result.totalCount).toBe(2)
    expect(result.slices.map((slice) => slice.bucket)).toEqual(["today"])
  })

  it("빈 입력은 빈 결과", () => {
    const result = budgetWeekAheadBuckets(groupsOf({}), 6)
    expect(result.slices).toEqual([])
    expect(result.totalCount).toBe(0)
    expect(result.hiddenCount).toBe(0)
  })
})
