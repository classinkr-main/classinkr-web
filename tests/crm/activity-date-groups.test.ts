import { describe, expect, it } from "vitest"

import {
  ACTIVITY_PERIOD_PRESETS,
  groupEventsByKstDay,
  resolveActivityPeriod,
} from "@/lib/crm/activity-date-groups"

// 기준 시각 — 2026-09-21 09:00 KST (=2026-09-21T00:00:00.000Z)
const NOW = new Date("2026-09-21T00:00:00.000Z").getTime()

function row(occurredAt: string) {
  return { occurredAt }
}

describe("groupEventsByKstDay", () => {
  it("오늘·어제·그 이전을 라벨로 구분한다(KST 기준)", () => {
    const groups = groupEventsByKstDay(
      [
        row("2026-09-21T05:00:00.000Z"), // 2026-09-21 14:00 KST = 오늘
        row("2026-09-20T10:00:00.000Z"), // 2026-09-20 19:00 KST = 어제
        row("2026-09-18T00:00:00.000Z"), // 2026-09-18 09:00 KST = 그 이전
      ],
      NOW
    )

    expect(groups.map((g) => g.label)).toEqual(["오늘 · 9/21 (월)", "어제 · 9/20 (일)", "9/18 (금)"])
    expect(groups.map((g) => g.dayKey)).toEqual(["2026-09-21", "2026-09-20", "2026-09-18"])
  })

  it("KST 자정 경계를 정확히 지킨다 — UTC 기준으로는 같은 날이어도 KST로 다른 날이면 분리된다", () => {
    // 2026-09-20 23:30 UTC = 2026-09-21 08:30 KST(오늘), 2026-09-20 14:30 UTC = 2026-09-20 23:30 KST(어제)
    const groups = groupEventsByKstDay([row("2026-09-20T23:30:00.000Z"), row("2026-09-20T14:30:00.000Z")], NOW)
    expect(groups).toHaveLength(2)
    expect(groups[0].label).toBe("오늘 · 9/21 (월)")
    expect(groups[1].label).toBe("어제 · 9/20 (일)")
  })

  it("입력 순서를 유지한다(occurred_at 재정렬을 하지 않는다)", () => {
    const groups = groupEventsByKstDay(
      [row("2026-09-18T00:00:00.000Z"), row("2026-09-21T05:00:00.000Z")],
      NOW
    )
    expect(groups.map((g) => g.dayKey)).toEqual(["2026-09-18", "2026-09-21"])
  })

  it("같은 날짜가 비연속으로 나타나도(페이지 병합) 먼저 나온 그룹에 합친다", () => {
    const groups = groupEventsByKstDay(
      [
        row("2026-09-21T05:00:00.000Z"),
        row("2026-09-20T10:00:00.000Z"),
        row("2026-09-21T01:00:00.000Z"), // 다시 오늘 — 앞선 오늘 그룹에 합쳐져야 한다
      ],
      NOW
    )
    expect(groups).toHaveLength(2)
    expect(groups[0].dayKey).toBe("2026-09-21")
    expect(groups[0].rows).toHaveLength(2)
    expect(groups[1].dayKey).toBe("2026-09-20")
  })

  it("각 그룹의 건수(rows.length)가 실제 포함된 행 수와 같다", () => {
    const groups = groupEventsByKstDay(
      [row("2026-09-21T05:00:00.000Z"), row("2026-09-21T06:00:00.000Z"), row("2026-09-20T10:00:00.000Z")],
      NOW
    )
    expect(groups[0].rows).toHaveLength(2)
    expect(groups[1].rows).toHaveLength(1)
  })

  it("occurredAt을 파싱할 수 없는 행은 '날짜 미상' 그룹으로 모은다", () => {
    const groups = groupEventsByKstDay([row("not-a-date"), row("2026-09-21T05:00:00.000Z")], NOW)
    expect(groups.map((g) => g.label)).toEqual(["날짜 미상", "오늘 · 9/21 (월)"])
    expect(groups[0].dayKey).toBe("unknown")
  })

  it("빈 배열은 빈 그룹 배열을 돌려준다", () => {
    expect(groupEventsByKstDay([], NOW)).toEqual([])
  })
})

describe("resolveActivityPeriod", () => {
  it("전체는 범위를 두지 않는다", () => {
    expect(resolveActivityPeriod("all", NOW)).toEqual({})
  })

  it("오늘은 KST 오늘 00:00~23:59:59.999만 포함한다", () => {
    const { from, to } = resolveActivityPeriod("today", NOW)
    // 2026-09-21 00:00 KST = 2026-09-20T15:00:00.000Z
    expect(from).toBe("2026-09-20T15:00:00.000Z")
    // 2026-09-21 23:59:59.999 KST = 2026-09-21T14:59:59.999Z
    expect(to).toBe("2026-09-21T14:59:59.999Z")
  })

  it("7일은 오늘 포함 최근 7일(KST 일 경계)이다", () => {
    const { from, to } = resolveActivityPeriod("7d", NOW)
    // 오늘 - 6일의 KST 00:00 = 2026-09-15 00:00 KST = 2026-09-14T15:00:00.000Z
    expect(from).toBe("2026-09-14T15:00:00.000Z")
    expect(to).toBe("2026-09-21T14:59:59.999Z")
  })

  it("30일은 오늘 포함 최근 30일(KST 일 경계)이다", () => {
    const { from, to } = resolveActivityPeriod("30d", NOW)
    // 오늘 - 29일의 KST 00:00 = 2026-08-23 00:00 KST = 2026-08-22T15:00:00.000Z
    expect(from).toBe("2026-08-22T15:00:00.000Z")
    expect(to).toBe("2026-09-21T14:59:59.999Z")
  })

  it("프리셋 목록은 오늘·7일·30일·전체 4개다", () => {
    expect(ACTIVITY_PERIOD_PRESETS.map((p) => p.key)).toEqual(["today", "7d", "30d", "all"])
  })
})
