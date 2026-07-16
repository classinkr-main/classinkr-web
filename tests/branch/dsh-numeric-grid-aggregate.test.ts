import { describe, expect, it } from "vitest"
import { aggregateDshBreakdown } from "@/components/admin/branch/ledger/DshNumericGrid"
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
