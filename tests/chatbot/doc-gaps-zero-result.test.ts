import { describe, expect, it } from "vitest"

import { filterMappedZeroResultSearches } from "@/lib/chatbot/doc-gaps"

describe("doc gaps zero-result filtering", () => {
  it("removes zero-result searches that already map to a docs article through a question cluster", () => {
    const searches = [
      { query: "칠판은 뭐있나요", count: 1, lastSeenAt: "2026-05-20T00:00:00.000Z" },
      { query: "새로운 미해결 질문", count: 2, lastSeenAt: "2026-05-21T00:00:00.000Z" },
    ]

    expect(filterMappedZeroResultSearches(searches, [" 칠판은 뭐있나요 "])).toEqual([
      { query: "새로운 미해결 질문", count: 2, lastSeenAt: "2026-05-21T00:00:00.000Z" },
    ])
  })
})
