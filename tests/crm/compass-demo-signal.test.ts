import { describe, expect, it } from "vitest"

import {
  buildCompassDemoIndex,
  compassDemoLabel,
  compassDemoLift,
  findCompassDemoSignal,
  type CompassDemoSource,
} from "@/lib/crm/compass-demo-signal"

// 「오늘」은 KST 다(lead_demos.day 가 KST 날짜) — 러너 타임존과 무관하게 KST 2026-08-28 정오.
const NOW = new Date("2026-08-28T03:00:00.000Z")

function demo(overrides: {
  id: number
  lead_id?: number | null
  day: string
  kind?: string | null
  status?: string | null
  owner?: string | null
  day_approx?: boolean | null
}) {
  return {
    id: overrides.id,
    lead_id: overrides.lead_id === undefined ? 100 : overrides.lead_id,
    day: overrides.day,
    kind: overrides.kind === undefined ? "demo" : overrides.kind,
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

describe("buildCompassDemoIndex — 취소·노쇼·설명회·시간대 (2026-10-12)", () => {
  it("취소·노쇼 행과 설명회·미팅은 신호가 아니다 — Compass 는 취소해도 행을 지우지 않는다", () => {
    const index = buildCompassDemoIndex(
      source({
        demos: [
          demo({ id: 1, day: "2026-08-28", status: "canceled" }),
          demo({ id: 2, day: "2026-08-29", status: "no_show" }),
          demo({ id: 3, day: "2026-08-29", kind: "seminar" }),
          demo({ id: 4, day: "2026-08-30", kind: "meeting" }),
          demo({ id: 5, day: "2026-09-05" }), // 유일한 진짜 데모
        ],
      }),
      NOW
    )
    expect(index.total).toBe(1)
    expect(index.byPhoneKey.get("01012345678")?.demoId).toBe(5)
  })

  it("kind·status 가 비어 있는 행은 신호가 아니다 — Compass 원본은 둘 다 not null 이라 정상 행이 아니다(소스 수집과 같은 판정)", () => {
    const index = buildCompassDemoIndex(
      source({
        demos: [
          demo({ id: 1, day: "2026-08-28", kind: null }),
          { ...demo({ id: 2, day: "2026-08-28" }), status: null }, // 헬퍼는 null 을 booked 로 채우므로 직접 비운다
          demo({ id: 3, day: "2026-08-29" }),
        ],
      }),
      NOW
    )
    expect(index.total).toBe(1)
    expect(index.byPhoneKey.get("01012345678")?.demoId).toBe(3)
  })

  it("「오늘」은 KST — UTC 로는 어제 저녁(KST 00:30)이어도 KST 날짜의 데모가 오늘이다", () => {
    const kstMidnightPlus = new Date("2026-08-27T15:30:00.000Z") // KST 2026-08-28 00:30
    const index = buildCompassDemoIndex(source({ demos: [demo({ id: 1, day: "2026-08-28" })] }), kstMidnightPlus)
    const signal = index.byPhoneKey.get("01012345678")
    expect(signal?.phase).toBe("today")
    expect(signal?.daysFromNow).toBe(0)
  })

  it("같은 단계(최근 완료)가 둘이면 오늘에 가까운 쪽을 남긴다 — day 오름차순이라 그냥 두면 더 오래된 쪽이 남았다", () => {
    const index = buildCompassDemoIndex(
      source({ demos: [demo({ id: 1, day: "2026-08-16", status: "done" }), demo({ id: 2, day: "2026-08-25", status: "done" })] }),
      NOW
    )
    expect(index.byPhoneKey.get("01012345678")?.demoId).toBe(2)
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
