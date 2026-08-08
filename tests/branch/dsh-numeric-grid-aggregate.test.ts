import { describe, expect, it } from "vitest"
import { aggregateDshBreakdown, aggregateDshRates } from "@/components/admin/branch/ledger/DshNumericGrid"
import type { BranchDshBreakdownRow } from "@/components/admin/branch/types"

// breakdown에는 같은 콤보가 스코프별로 반복된다(전사 + 팀/멤버 섹션). 전사 행은 부분의
// 합이라 annual이 최대다. 회귀 방지: 합산 방식은 전사+팀+멤버를 3중 계상해 시트의
// 3배 수치를 보여줬다 — 최대 annual 행 하나만 채택해야 한다.
function row(
  kind: "goal" | "status",
  annual: number,
  months: Record<string, number> = {},
  combo: Partial<Pick<BranchDshBreakdownRow, "category" | "status_type" | "channel">> = {},
): BranchDshBreakdownRow {
  return {
    kind,
    category: combo.category ?? "Software",
    status_type: combo.status_type ?? "New",
    channel: combo.channel ?? "Direct",
    annual,
    quarters: [annual / 4, annual / 4, annual / 4, annual / 4] as [number, number, number, number],
    months,
  }
}

describe("aggregateDshBreakdown", () => {
  it("picks the max-annual row per combo instead of summing scope duplicates", () => {
    const breakdown = [
      row("goal", 535_170), // 멤버 섹션
      row("goal", 1_669_320), // 팀 섹션
      row("goal", 2_265_352, { "2026-04": 144_000 }), // 전사 섹션 (최대)
      row("goal", 61_032), // 또 다른 멤버
    ]
    const { rows, total } = aggregateDshBreakdown(breakdown, "goal")
    expect(rows).toHaveLength(1)
    expect(rows[0].annual).toBe(2_265_352)
    expect(rows[0].months["2026-04"]).toBe(144_000)
    expect(total.annual).toBe(2_265_352) // 합산이었다면 4,530,874로 부풀려짐
  })

  it("keeps distinct combos as separate rows, sorted by canonical order", () => {
    const breakdown = [
      row("goal", 4_625_179, {}, { category: "Hardware", channel: "Channel" }),
      row("goal", 2_265_352),
      row("goal", 328_980, {}, { channel: "Channel" }),
    ]
    const { rows, total } = aggregateDshBreakdown(breakdown, "goal")
    expect(rows.map((r) => `${r.category}/${r.status_type}/${r.channel}`)).toEqual([
      "Software/New/Direct",
      "Software/New/Channel",
      "Hardware/New/Channel",
    ])
    expect(total.annual).toBe(2_265_352 + 328_980 + 4_625_179)
  })

  it("gap view subtracts deduped goal from deduped status per combo", () => {
    const breakdown = [
      row("goal", 100_000, { "2026-04": 10_000 }),
      row("goal", 2_265_352, { "2026-04": 144_000 }), // 전사 goal
      row("status", 30_000, { "2026-04": 3_000 }),
      row("status", 314_930, { "2026-04": 20_000 }), // 전사 status
    ]
    const { rows } = aggregateDshBreakdown(breakdown, "gap")
    expect(rows).toHaveLength(1)
    expect(rows[0].annual).toBe(314_930 - 2_265_352)
    expect(rows[0].months["2026-04"]).toBe(20_000 - 144_000)
  })
})

// Rate 뷰(2026-07-27 DSH 디벨롭 A) — 달성률도 최대-annual 채택 규칙 위에서만 계산돼야 한다.
// 스코프 중복을 합산하면 분자·분모가 함께 3중 계상돼 비율이 그럴듯하게 보이는 함정이 있어
// (부풀린/부풀린 ≈ 원래 비율), 원값 쌍(status/goal)까지 함께 검증한다.
describe("aggregateDshRates", () => {
  it("rate = 최대-annual 채택된 status ÷ goal — 스코프 중복을 합산하지 않는다", () => {
    const breakdown = [
      row("goal", 535_170), // 멤버 섹션 (버려져야 함)
      row("goal", 2_265_352, { "2026-04": 144_000 }), // 전사 goal (최대)
      row("status", 30_000, { "2026-04": 3_000 }), // 멤버 섹션 (버려져야 함)
      row("status", 314_930, { "2026-04": 20_000 }), // 전사 status (최대)
    ]
    const { rows } = aggregateDshRates(breakdown)
    expect(rows).toHaveLength(1)
    // 원값 쌍이 전사 행 그대로여야 한다 — 합산이었다면 goal 2,800,522 / status 344,930.
    expect(rows[0].annual.goal).toBe(2_265_352)
    expect(rows[0].annual.status).toBe(314_930)
    expect(rows[0].annual.pct).toBeCloseTo((314_930 / 2_265_352) * 100, 6)
    expect(rows[0].months["2026-04"].pct).toBeCloseTo((20_000 / 144_000) * 100, 6)
  })

  it("목표 0/결측 셀은 pct null — 0%나 무한대로 왜곡하지 않는다", () => {
    const breakdown = [
      row("status", 314_930, { "2026-04": 20_000 }), // goal 행 자체가 없는 콤보
    ]
    const { rows, total } = aggregateDshRates(breakdown)
    expect(rows).toHaveLength(1)
    expect(rows[0].annual.pct).toBeNull()
    expect(rows[0].annual.status).toBe(314_930)
    expect(rows[0].months["2026-04"].pct).toBeNull()
    expect(total.annual.pct).toBeNull()
  })

  it("total은 콤보 합산 실적 ÷ 합산 목표 — 행 달성률 단순 평균이 아니다", () => {
    const breakdown = [
      row("goal", 100_000),
      row("status", 100_000), // 콤보 A: 100%
      row("goal", 900_000, {}, { category: "Hardware" }),
      row("status", 0, {}, { category: "Hardware" }), // 콤보 B: 0%
    ]
    const { rows, total } = aggregateDshRates(breakdown)
    expect(rows).toHaveLength(2)
    // 단순 평균이었다면 50% — 규모 가중 없이 작은 콤보가 과대 대표된다.
    expect(total.annual.pct).toBeCloseTo((100_000 / 1_000_000) * 100, 6)
    expect(total.annual.goal).toBe(1_000_000)
    expect(total.annual.status).toBe(100_000)
  })

  it("분기 셀도 goal/status 분기값 쌍으로 계산된다", () => {
    // row() 헬퍼는 quarters를 annual/4로 균등 분배한다 — Q1 셀 달성률이 연간과 동일해야 한다.
    const breakdown = [row("goal", 400_000), row("status", 100_000)]
    const { rows } = aggregateDshRates(breakdown)
    expect(rows[0].quarters[0].goal).toBe(100_000)
    expect(rows[0].quarters[0].status).toBe(25_000)
    expect(rows[0].quarters[0].pct).toBeCloseTo(25, 6)
  })
})
