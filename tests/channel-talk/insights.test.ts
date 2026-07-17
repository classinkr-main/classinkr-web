import { describe, expect, it } from "vitest"

// 채널톡 탭 통계 패널의 순수 집계 — 유형(태그) 분포와 일별 응답(상담 활동) 추이.
// 어드민 페이지가 클라이언트에서 그대로 소비하므로 서버 의존 없이 순수 함수로 고정한다.
import {
  aggregateConversationTags,
  aggregateDailyActivity,
  computeChannelConversationStats,
} from "@/lib/channel-talk-insights"

interface RecordLike {
  state?: string
  tags?: string[]
  matchedLeadId?: string
  lastMessageAt?: string
  messageCount?: number
}

function record(overrides: RecordLike = {}) {
  return {
    state: "opened",
    tags: [],
    messageCount: 2,
    ...overrides,
  }
}

describe("computeChannelConversationStats", () => {
  it("counts states, lead matches, and last-7-days activity relative to now", () => {
    const now = new Date("2026-07-17T12:00:00.000Z").getTime()
    const stats = computeChannelConversationStats(
      [
        record({ state: "opened", lastMessageAt: "2026-07-16T00:00:00.000Z", matchedLeadId: "lead-1" }),
        record({ state: "closed", lastMessageAt: "2026-07-01T00:00:00.000Z" }),
        record({ state: "snoozed" }),
        record({ state: "weird-state" }),
      ],
      now
    )

    expect(stats.total).toBe(4)
    expect(stats.byState).toEqual({ opened: 1, closed: 1, snoozed: 1, unknown: 1 })
    expect(stats.matchedLeads).toBe(1)
    expect(stats.unmatched).toBe(3)
    expect(stats.last7Days).toBe(1)
  })
})

describe("aggregateConversationTags", () => {
  it("returns top tags by count with stable tie-break by name", () => {
    const rows = aggregateConversationTags(
      [
        record({ tags: ["기존고객/사용문의", "Meta"] }),
        record({ tags: ["기존고객/사용문의"] }),
        record({ tags: ["잠재고객/기능문의"] }),
        record({ tags: ["잠재고객/기능문의"] }),
        record({ tags: [" ", ""] }),
        record({ tags: undefined }),
      ],
      3
    )

    expect(rows).toEqual([
      { tag: "기존고객/사용문의", count: 2 },
      { tag: "잠재고객/기능문의", count: 2 },
      { tag: "Meta", count: 1 },
    ])
  })

  it("caps the list at topN and drops blank tags", () => {
    const rows = aggregateConversationTags(
      [record({ tags: ["a", "b", "c", "d"] })],
      2
    )
    expect(rows).toHaveLength(2)
  })
})

describe("aggregateDailyActivity", () => {
  it("buckets conversations and message counts per KST day, oldest first, zero-filling gaps", () => {
    const now = new Date("2026-07-17T12:00:00.000Z").getTime() // KST 7/17 21:00
    const days = aggregateDailyActivity(
      [
        // KST 7/17 (UTC 10:44)
        record({ lastMessageAt: "2026-07-17T10:44:00.000Z", messageCount: 5 }),
        // KST 7/16 (UTC 15:30 = KST 7/17 00:30 아님 — 15:30+9=00:30 다음날 → KST 7/17)
        record({ lastMessageAt: "2026-07-16T15:30:00.000Z", messageCount: 3 }),
        // KST 7/15 (UTC 05:00 = KST 14:00)
        record({ lastMessageAt: "2026-07-15T05:00:00.000Z", messageCount: 2 }),
        // 범위 밖 (14일 이전)
        record({ lastMessageAt: "2026-06-01T00:00:00.000Z", messageCount: 9 }),
        // 날짜 없음 — 제외
        record({ lastMessageAt: undefined, messageCount: 9 }),
      ],
      3,
      now
    )

    expect(days).toHaveLength(3)
    expect(days.map((day) => day.date)).toEqual(["2026-07-15", "2026-07-16", "2026-07-17"])
    expect(days[0]).toEqual({ date: "2026-07-15", label: "7/15", conversations: 1, messages: 2 })
    // UTC 7/16 15:30 은 KST 로 7/17 00:30 — 7/17 버킷에 잡혀야 한다.
    expect(days[1]).toEqual({ date: "2026-07-16", label: "7/16", conversations: 0, messages: 0 })
    expect(days[2]).toEqual({ date: "2026-07-17", label: "7/17", conversations: 2, messages: 8 })
  })
})
