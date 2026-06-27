import { describe, expect, it } from "vitest"

import { classifyTaskBucket } from "@/lib/crm/week-ahead"

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
