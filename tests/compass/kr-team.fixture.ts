import type { CompassKrTeamSnapshot } from "@/lib/compass/kr-team-contract";

export function snapshot(): CompassKrTeamSnapshot {
  return {
    version: 1, month: "2026-10", generatedAt: "2026-10-14T00:00:00Z",
    roster: [{ name: "김민재", role: "CS", team: "CSM", evaluationOnly: true }],
    kpi: { basis: "live", closedAt: null, report: { month: "2026-10", empty: false, elapsed: 0.5, daysLeft: 15,
      people: [{ name: "김민재", role: "CS", rate: 1, score: 4, grade: "A", ratedWeight: 0.5, weightSum: 1,
        projected: { rate: 1.5, grade: "S" },
        items: [{ metric: "revenue", label: "매출", kind: "quant", unit: "CNY", weight: 0.5, target: 1000, actual: -100,
          source: "manual", autoValue: 100, rate: -0.1, score: 0, grade: "D", reason: "환불 반영", note: null,
          gradeSource: null, aside: "참고 2건", memo: "월말 수납 교정", manualBy: "승인자", manualAt: "10-14",
          projected: { value: -200, rate: -0.2, grade: "D" } }] }],
    } },
    revenue: { currency: "CNY", period: { goal: 1000, actual: -100, swGoal: null, swActual: -100, hwGoal: null, hwActual: 0, syncedAt: null }, people: [] },
  };
}
