import { describe, expect, it } from "vitest"

import {
  mergeCompassTimeline,
  toCompassTimelineEntries,
  type CompassActivityLike,
} from "@/lib/crm/compass-timeline"

function activity(overrides: Partial<CompassActivityLike> & { id: number }): CompassActivityLike {
  return {
    lead_id: 42,
    kind: "call",
    body: "통화 완료",
    actor: "진소망",
    created_at: "2026-08-20T02:00:00.000Z",
    ...overrides,
  }
}

describe("toCompassTimelineEntries", () => {
  it("system 은 노이즈라 제외하고 나머지 5종만 올린다", () => {
    const entries = toCompassTimelineEntries([
      activity({ id: 1, kind: "call" }),
      activity({ id: 2, kind: "note" }),
      activity({ id: 3, kind: "meeting" }),
      activity({ id: 4, kind: "inflow" }),
      activity({ id: 5, kind: "stage_change" }),
      activity({ id: 6, kind: "system" }),
      activity({ id: 7, kind: null }),
      activity({ id: 8, kind: "unknown_future_kind" }),
    ])

    expect(entries.map((entry) => entry.kind).sort()).toEqual([
      "call",
      "inflow",
      "meeting",
      "note",
      "stage_change",
    ])
  })

  it("한글 라벨과 Compass 리드 딥링크를 붙인다", () => {
    const [entry] = toCompassTimelineEntries([activity({ id: 1, kind: "stage_change", lead_id: 77 })])

    expect(entry.kindLabel).toBe("단계 변경")
    expect(entry.href).toBe("https://mkt.classin.co.kr/leads?open=77")
    expect(entry.id).toBe("compass:1")
  })

  it("최신순으로 돌려주고 빈 본문은 null 로 눕힌다", () => {
    const entries = toCompassTimelineEntries([
      activity({ id: 1, created_at: "2026-08-01T00:00:00.000Z" }),
      activity({ id: 2, created_at: "2026-08-25T00:00:00.000Z", body: "   " }),
    ])

    expect(entries.map((entry) => entry.id)).toEqual(["compass:2", "compass:1"])
    expect(entries[0].body).toBeNull()
  })
})

describe("mergeCompassTimeline", () => {
  const crmRows = [
    { id: "crm-old", occurredAt: "2026-08-10T00:00:00.000Z" },
    { id: "crm-new", occurredAt: "2026-08-26T00:00:00.000Z" },
  ]

  it("우리 기록과 Compass 기록을 시간 역순 한 줄로 합친다", () => {
    const compass = toCompassTimelineEntries([
      activity({ id: 1, created_at: "2026-08-20T00:00:00.000Z" }),
      activity({ id: 2, created_at: "2026-08-01T00:00:00.000Z" }),
    ])

    const merged = mergeCompassTimeline(crmRows, compass)

    expect(
      merged.map((item) => (item.kind === "crm" ? item.event.id : item.entry.id))
    ).toEqual(["crm-new", "compass:1", "crm-old", "compass:2"])
  })

  it("동시각이면 우리 원장 기록을 먼저 둔다", () => {
    const compass = toCompassTimelineEntries([activity({ id: 9, created_at: "2026-08-26T00:00:00.000Z" })])
    const merged = mergeCompassTimeline(crmRows, compass)

    expect(merged[0].kind).toBe("crm")
    expect(merged[1].kind).toBe("compass")
  })

  it("Compass 가 비어 있으면 기존 타임라인이 그대로 남는다", () => {
    const merged = mergeCompassTimeline(crmRows, [])
    expect(merged.map((item) => item.kind)).toEqual(["crm", "crm"])
  })
})
