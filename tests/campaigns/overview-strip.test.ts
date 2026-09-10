import { describe, expect, it } from "vitest"
import {
  resolveDeltaTone,
  summarizeScoreboardAnomalies,
} from "@/lib/marketing/overview-strip"

// Overview 마케팅 성과 축약 스트립(components/admin/overview/MarketingPerfStrip.tsx)의 순수 파생.
// 이 저장소 vitest 는 node 환경이라 DOM 렌더 테스트는 없다 — 문구·톤 판정만 여기서 고정한다.

describe("summarizeScoreboardAnomalies", () => {
  it("이상이 없으면 total 0 · 배지 없음(스트립이 줄 자체를 렌더하지 않는 조건)", () => {
    expect(summarizeScoreboardAnomalies([])).toEqual({ total: 0, badges: [] })
    expect(
      summarizeScoreboardAnomalies([{ anomalies: [] }, { anomalies: [] }])
    ).toEqual({ total: 0, badges: [] })
  })

  it("1건도 개수를 붙인다 — 축약본에는 아래에 스코어보드가 없어 이 줄이 규모를 말하는 유일한 자리", () => {
    expect(summarizeScoreboardAnomalies([{ anomalies: ["cpl_spike"] }])).toEqual({
      total: 1,
      badges: ["CPL 급등 1"],
    })
  })

  it("여러 캠페인에 걸친 같은 종류를 접어 센다", () => {
    const summary = summarizeScoreboardAnomalies([
      { anomalies: ["cpl_spike"] },
      { anomalies: ["cpl_spike", "ctr_drop"] },
      { anomalies: [] },
    ])
    expect(summary.total).toBe(3)
    expect(summary.badges).toEqual(["CPL 급등 2", "CTR 급락 1"])
  })

  it("건수 많은 종류가 앞 — 표시 한도를 넘으면 '외 N종'으로 접는다", () => {
    const summary = summarizeScoreboardAnomalies([
      { anomalies: ["leads_drop", "pacing_over", "ctr_drop"] },
      { anomalies: ["leads_drop", "pacing_over"] },
      { anomalies: ["leads_drop"] },
    ])
    expect(summary.total).toBe(6)
    expect(summary.badges).toEqual(["리드 급감 3", "페이싱 초과 2", "외 1종"])
  })

  it("동률은 감지 규칙 선언 순서로 고정한다(Map 순회 순서에 표시가 흔들리지 않게)", () => {
    // 입력 순서는 leads_drop 이 먼저지만 선언 순서상 ctr_drop 이 앞선다.
    const summary = summarizeScoreboardAnomalies([{ anomalies: ["leads_drop", "ctr_drop"] }])
    expect(summary.badges).toEqual(["CTR 급락 1", "리드 급감 1"])
  })

  it("모르는 종류는 라벨을 지어내지 않고 원문 그대로 · 알려진 종류 뒤로 밀린다", () => {
    const summary = summarizeScoreboardAnomalies([{ anomalies: ["future_kind", "cpl_spike"] }])
    expect(summary.badges).toEqual(["CPL 급등 1", "future_kind 1"])
  })

  it("maxKinds 로 표시 한도를 조절할 수 있다(0 이하는 최소 1종 보장)", () => {
    const rows = [{ anomalies: ["cpl_spike", "ctr_drop", "pacing_over"] }]
    expect(summarizeScoreboardAnomalies(rows, { maxKinds: 1 }).badges).toEqual([
      "CPL 급등 1",
      "외 2종",
    ])
    expect(summarizeScoreboardAnomalies(rows, { maxKinds: 0 }).badges).toEqual([
      "CPL 급등 1",
      "외 2종",
    ])
  })
})

describe("resolveDeltaTone", () => {
  it("비교 불가(null·NaN)는 unknown — 0 으로 뭉개지 않는다", () => {
    expect(resolveDeltaTone(null, "up-good")).toBe("unknown")
    expect(resolveDeltaTone(undefined, "down-good")).toBe("unknown")
    expect(resolveDeltaTone(Number.NaN, "up-good")).toBe("unknown")
  })

  it("변화 없음은 neutral(unknown 과 다른 사실)", () => {
    expect(resolveDeltaTone(0, "up-good")).toBe("neutral")
    expect(resolveDeltaTone(0, "down-good")).toBe("neutral")
  })

  it("광고비처럼 방향 가치판단이 없는 축은 증감과 무관하게 neutral", () => {
    expect(resolveDeltaTone(42, "none")).toBe("neutral")
    expect(resolveDeltaTone(-42, "none")).toBe("neutral")
  })

  it("리드·전환율(증가 좋음)", () => {
    expect(resolveDeltaTone(12, "up-good")).toBe("good")
    expect(resolveDeltaTone(-12, "up-good")).toBe("bad")
  })

  it("CPL(감소 좋음) — 허브 KpiStrip 과 같은 판정", () => {
    expect(resolveDeltaTone(-12, "down-good")).toBe("good")
    expect(resolveDeltaTone(12, "down-good")).toBe("bad")
  })
})
