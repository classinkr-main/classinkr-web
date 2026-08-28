import { describe, expect, it } from "vitest"

import {
  buildCompassDemoIndex,
  compassDemoLabel,
  compassDemoLift,
  findCompassDemoSignal,
  type CompassDemoSource,
} from "@/lib/crm/compass-demo-signal"

// 러너 타임존과 무관하게 같은 달력일을 가리키도록 로컬 정오로 만든다.
const NOW = new Date(2026, 7, 28, 12, 0, 0)

function demo(overrides: {
  id: number
  lead_id?: number | null
  day: string
  status?: string | null
  owner?: string | null
  day_approx?: boolean | null
}) {
  return {
    id: overrides.id,
    lead_id: overrides.lead_id === undefined ? 100 : overrides.lead_id,
    day: overrides.day,
    status: overrides.status ?? "booked",
    owner: overrides.owner ?? "진소망",
    day_approx: overrides.day_approx ?? false,
  }
}

function source(overrides: Partial<CompassDemoSource> = {}): CompassDemoSource {
  return {
    demos: [],
    phoneKeysByCompassLeadId: new Map([[100, ["01012345678"]]]),
    down: false,
    ...overrides,
  }
}

describe("buildCompassDemoIndex — 단계 분류", () => {
  it("오늘·예정·최근 완료만 신호로 남기고 오래된 데모는 버린다", () => {
    const index = buildCompassDemoIndex(
      source({
        demos: [
          demo({ id: 1, day: "2026-08-28" }), // 오늘
          demo({ id: 2, day: "2026-09-02" }), // 예정
          demo({ id: 3, day: "2026-08-20" }), // 최근 완료(8일 전)
          demo({ id: 4, day: "2026-06-01" }), // 두 달 전 — 신호 없음
        ],
      }),
      NOW
    )

    // 같은 전화키에 여럿이면 가장 임박한 하나(오늘)만 남는다.
    expect(index.total).toBe(3)
    expect(index.byPhoneKey.size).toBe(1)
    expect(index.byPhoneKey.get("01012345678")?.phase).toBe("today")
  })

  it("예정 > 오늘 > 최근 순으로 임박한 것을 남긴다", () => {
    const index = buildCompassDemoIndex(
      source({ demos: [demo({ id: 3, day: "2026-08-20" }), demo({ id: 2, day: "2026-09-02" })] }),
      NOW
    )

    expect(index.byPhoneKey.get("01012345678")?.phase).toBe("upcoming")
    expect(index.byPhoneKey.get("01012345678")?.daysFromNow).toBe(5)
  })
})

describe("buildCompassDemoIndex — 붙지 않은 데모", () => {
  it("우리 전화로 붙지 않은 데모는 버리지 않고 unmatched 로 센다", () => {
    const index = buildCompassDemoIndex(
      source({
        demos: [demo({ id: 1, day: "2026-08-28", lead_id: 999 }), demo({ id: 2, day: "2026-08-29", lead_id: null })],
      }),
      NOW
    )

    expect(index.total).toBe(2)
    expect(index.byPhoneKey.size).toBe(0)
    expect(index.unmatched).toBe(2)
  })

  it("브리지가 끊기면 down 을 그대로 들고 나온다 — '데모 0건'과 구분된다", () => {
    const index = buildCompassDemoIndex(source({ demos: [], down: true }), NOW)

    expect(index.total).toBe(0)
    expect(index.down).toBe(true)
  })
})

describe("findCompassDemoSignal — 전화 동등 비교", () => {
  const index = buildCompassDemoIndex(source({ demos: [demo({ id: 1, day: "2026-08-29" })] }), NOW)

  it("표기가 달라도 정규화 키가 같으면 붙는다", () => {
    expect(findCompassDemoSignal(index, "010-1234-5678")).not.toBeNull()
    expect(findCompassDemoSignal(index, "+82 10-1234-5678")).not.toBeNull()
    expect(findCompassDemoSignal(index, "008210 1234 5678")).not.toBeNull()
  })

  it("다른 번호·빈 값에는 절대 붙지 않는다(부분일치·이름 추측 없음)", () => {
    expect(findCompassDemoSignal(index, "010-1234-5679")).toBeNull()
    expect(findCompassDemoSignal(index, "1234")).toBeNull()
    expect(findCompassDemoSignal(index, null)).toBeNull()
    expect(findCompassDemoSignal(index, "")).toBeNull()
  })
})

describe("점수·라벨", () => {
  it("당일·임박 예정이 가장 무겁고 오래된 완료가 가장 가볍다", () => {
    const index = buildCompassDemoIndex(
      source({
        demos: [demo({ id: 1, day: "2026-08-28" })],
        phoneKeysByCompassLeadId: new Map([[100, ["01011112222"]]]),
      }),
      NOW
    )
    const today = findCompassDemoSignal(index, "01011112222")

    expect(compassDemoLift(today)).toBe(46)
    expect(compassDemoLift(null)).toBe(0)
  })

  it("Compass가 날짜를 추정으로 적은 건은 라벨이 그렇다고 말한다", () => {
    const index = buildCompassDemoIndex(
      source({ demos: [demo({ id: 1, day: "2026-08-29", day_approx: true })] }),
      NOW
    )
    const signal = findCompassDemoSignal(index, "01012345678")

    expect(signal?.dayApprox).toBe(true)
    expect(compassDemoLabel(signal!)).toBe("내일 데모 · 날짜 추정")
  })

  it("확정 날짜는 추정 문구를 붙이지 않는다", () => {
    const index = buildCompassDemoIndex(source({ demos: [demo({ id: 1, day: "2026-08-28" })] }), NOW)
    expect(compassDemoLabel(findCompassDemoSignal(index, "01012345678")!)).toBe("오늘 데모")
  })
})
