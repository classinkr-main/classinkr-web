// 저장 세그먼트 매일 잡의 순수 가드(교차 리뷰 2라운드 회귀) — I/O 없는 lib/crm/saved-segments.ts 규칙만 고정한다.
//  - [17] 급변 가드 기준값(previousSegmentTotal)은 품질 저하(degraded) 일별 점을 건너뛴 직전 정상 점이다.
//  - [17] 후속: lookback 안 점이 전부 품질 저하(NEO·Compass 가 7일 넘게 멈췄다 돌아온 첫날)면 "점 없음"과 달리
//    degradedOnly 로 하루 보류(skipped_spike)한다 — 오늘 정상 점이 다음 날의 기준.
//  - [35] 디스패처가 넘기는 세그먼트 잡 시간 예산은 요청 시작 기준 40초에서 앞선 잡 시간을 뺀 값이다.
import { describe, expect, it } from "vitest"

import {
  CRM_SEGMENT_DAILY_REQUEST_BUDGET_MS,
  decideAutoTag,
  previousSegmentTotal,
  segmentDailyTimeBudgetMs,
  segmentSpikeBaseline,
  type SegmentTrendSourcePoint,
} from "@/lib/crm/saved-segments"

const TODAY = "2026-09-25"
const HASH = "h1"

function point(date: string, total: number, flags: SegmentTrendSourcePoint["flags"] = [], specHash = HASH): SegmentTrendSourcePoint {
  return { date, total, specHash, flags }
}

describe("previousSegmentTotal — 품질 저하 점은 기준값이 아니다([17])", () => {
  it("전날 Compass 끊김으로 부푼 점(950)을 건너뛰고 그 전 정상 점(300)을 쓴다", () => {
    expect(previousSegmentTotal([point("2026-09-23", 300), point("2026-09-24", 950, ["compass_down"])], HASH, TODAY)).toBe(300)
  })

  it("원천 미완성·Compass 일부·NEO 오래됨도 건너뛴다 — truncated(키 목록만 잘림)는 건수가 정확해 그대로 쓴다", () => {
    const points = [
      point("2026-09-20", 100),
      point("2026-09-21", 5, ["source_incomplete"]),
      point("2026-09-22", 7, ["compass_partial"]),
      point("2026-09-23", 9, ["neo_stale"]),
    ]
    expect(previousSegmentTotal(points, HASH, TODAY)).toBe(100)
    expect(previousSegmentTotal([...points, point("2026-09-24", 1_200, ["truncated"])], HASH, TODAY)).toBe(1_200)
  })

  it("lookback(7일) 안에 정상 점이 없으면 null(가드 입력 없음) — 조건이 다른 점·오늘 점·창 밖 점도 쓰지 않는다", () => {
    expect(previousSegmentTotal([point("2026-09-24", 950, ["compass_down"])], HASH, TODAY)).toBeNull()
    expect(previousSegmentTotal([point("2026-09-24", 300, [], "old")], HASH, TODAY)).toBeNull()
    expect(previousSegmentTotal([point(TODAY, 300)], HASH, TODAY)).toBeNull()
    expect(previousSegmentTotal([point("2026-09-17", 300)], HASH, TODAY)).toBeNull()
    expect(previousSegmentTotal([point("2026-09-18", 300)], HASH, TODAY)).toBe(300)
  })

  it("결정 흐름 — 정상화된 날(310)이 부푼 전날(950) 때문에 skipped_spike 로 막히지 않는다", () => {
    const previousTotal = previousSegmentTotal([point("2026-09-23", 300), point("2026-09-24", 950, ["compass_down"])], HASH, TODAY)
    const base = { enabled: true, readable: true, usesNeoSignals: false, flags: [], truncated: false, overBudget: false } as const
    expect(decideAutoTag({ ...base, total: 310, previousTotal })).toBe("apply")
    // 반대 방향 — 무너진 전날(5)을 건너뛰어 진짜 급증(950)에는 가드가 켜져 있다.
    const collapsed = previousSegmentTotal([point("2026-09-23", 300), point("2026-09-24", 5, ["source_incomplete"])], HASH, TODAY)
    expect(decideAutoTag({ ...base, total: 950, previousTotal: collapsed })).toBe("skipped_spike")
  })
})

describe("segmentSpikeBaseline — 복구 첫날은 기준 없이 붙이지 않는다([17] 후속)", () => {
  const base = { enabled: true, readable: true, truncated: false, overBudget: false } as const
  // NEO 동기화가 08-28 부터 멈춰 lookback 7일(09-18~09-24) 점이 전부 neo_stale 로 약 300 에 얼어 있다.
  const staleWeek = Array.from({ length: 7 }, (_, index) => point(`2026-09-${String(18 + index).padStart(2, "0")}`, 300, ["neo_stale"]))

  it("lookback 안 점이 전부 품질 저하면 degradedOnly — 정상 건수는 없다(previousSegmentTotal 은 여전히 null)", () => {
    expect(segmentSpikeBaseline(staleWeek, HASH, TODAY)).toEqual({ previousTotal: null, degradedOnly: true })
    expect(previousSegmentTotal(staleWeek, HASH, TODAY)).toBeNull()
    // Compass 끊김·원천 미완성만 있던 창도 같다.
    expect(segmentSpikeBaseline([point("2026-09-24", 950, ["compass_down"]), point("2026-09-23", 5, ["source_incomplete"])], HASH, TODAY)).toEqual({
      previousTotal: null,
      degradedOnly: true,
    })
  })

  it("점이 아예 없거나(새 조건·첫 실행) 다른 조건·창 밖·오늘 점뿐이면 degradedOnly 가 아니다 — 가드 입력 없음", () => {
    expect(segmentSpikeBaseline([], HASH, TODAY)).toEqual({ previousTotal: null, degradedOnly: false })
    expect(segmentSpikeBaseline([point("2026-09-24", 300, ["neo_stale"], "old")], HASH, TODAY)).toEqual({ previousTotal: null, degradedOnly: false })
    expect(segmentSpikeBaseline([point("2026-09-17", 300, ["neo_stale"])], HASH, TODAY)).toEqual({ previousTotal: null, degradedOnly: false })
    expect(segmentSpikeBaseline([point(TODAY, 300, ["neo_stale"])], HASH, TODAY)).toEqual({ previousTotal: null, degradedOnly: false })
  })

  it("정상 점이 하나라도 있으면 그 점이 기준이다 — degradedOnly 아님(truncated 는 정상 점)", () => {
    expect(segmentSpikeBaseline([...staleWeek.slice(1), point("2026-09-18", 280)], HASH, TODAY)).toEqual({ previousTotal: 280, degradedOnly: false })
    expect(segmentSpikeBaseline([point("2026-09-24", 1_200, ["truncated"])], HASH, TODAY)).toEqual({ previousTotal: 1_200, degradedOnly: false })
  })

  it("결정 흐름 — NEO 복구 첫날 900(부정확할 수 있는 첫 동기화)은 하루 보류, 다음 날은 오늘 정상 점(900)과 비교해 적용", () => {
    const day1 = segmentSpikeBaseline(staleWeek, HASH, TODAY)
    expect(
      decideAutoTag({ ...base, usesNeoSignals: true, flags: [], total: 900, previousTotal: day1.previousTotal, previousDegradedOnly: day1.degradedOnly })
    ).toBe("skipped_spike")
    // 건수가 비슷해도(310) 기준이 없으니 하루 보류 — 원천이 돌아온 첫날 값만으로 붙이고 떼지 않는다.
    expect(
      decideAutoTag({ ...base, usesNeoSignals: true, flags: [], total: 310, previousTotal: day1.previousTotal, previousDegradedOnly: day1.degradedOnly })
    ).toBe("skipped_spike")

    const tomorrow = "2026-09-26"
    const day2 = segmentSpikeBaseline([...staleWeek, point(TODAY, 900)], HASH, tomorrow)
    expect(day2).toEqual({ previousTotal: 900, degradedOnly: false })
    expect(
      decideAutoTag({ ...base, usesNeoSignals: true, flags: [], total: 905, previousTotal: day2.previousTotal, previousDegradedOnly: day2.degradedOnly })
    ).toBe("apply")
  })

  it("보류는 가드 순서를 지킨다 — 오늘도 품질 저하·상한 초과면 그 상태가 먼저, 꺼짐이면 off", () => {
    const hold = { previousTotal: null, previousDegradedOnly: true } as const
    expect(decideAutoTag({ ...base, ...hold, usesNeoSignals: true, flags: ["neo_stale"], total: 300 })).toBe("skipped_neo_stale")
    expect(decideAutoTag({ ...base, ...hold, usesNeoSignals: false, flags: ["compass_down"], total: 300 })).toBe("skipped_degraded")
    expect(decideAutoTag({ ...base, ...hold, usesNeoSignals: false, flags: [], total: 1_001 })).toBe("skipped_too_many")
    expect(decideAutoTag({ ...base, ...hold, enabled: false, usesNeoSignals: false, flags: [], total: 300 })).toBe("off")
    // 표시 필드가 없으면(예전 호출) 예전 결정 그대로.
    expect(decideAutoTag({ ...base, usesNeoSignals: false, flags: [], total: 300, previousTotal: null })).toBe("apply")
  })
})

describe("segmentDailyTimeBudgetMs — 요청 시작 기준 남은 시간([35])", () => {
  it("요청 기준 40초에서 앞선 잡이 쓴 시간을 뺀다(maxDuration 60초 중 20초는 뒤쪽 쓰기 몫)", () => {
    expect(CRM_SEGMENT_DAILY_REQUEST_BUDGET_MS).toBe(40_000)
    expect(segmentDailyTimeBudgetMs(0)).toBe(40_000)
    expect(segmentDailyTimeBudgetMs(12_000)).toBe(28_000)
    expect(segmentDailyTimeBudgetMs(45_000)).toBe(0)
  })

  it("음수·비정상 입력은 0 으로 본다", () => {
    expect(segmentDailyTimeBudgetMs(-5)).toBe(40_000)
    expect(segmentDailyTimeBudgetMs(Number.NaN)).toBe(40_000)
    expect(segmentDailyTimeBudgetMs(Number.POSITIVE_INFINITY)).toBe(40_000)
  })
})
