import { describe, expect, it } from "vitest"
import { detectAnomalies, ANOMALY_THRESHOLDS } from "@/lib/marketing/anomaly"

const base = {
  id: "c1",
  name: "테스트",
  cpl7d: null as number | null,
  cpl30d: null as number | null,
  leads7d: 0,
  leadsPrev7d: 0,
  ctr7d: null as number | null,
  ctr30d: null as number | null,
  executionPct: null as number | null,
  elapsedPct: null as number | null,
}

describe("detectAnomalies", () => {
  it("CPL 급등 — 7일 CPL 이 30일 CPL×1.5 초과 + 표본 충족", () => {
    const flags = detectAnomalies({
      campaigns: [{ ...base, cpl7d: 40, cpl30d: 20, leads7d: ANOMALY_THRESHOLDS.cplMinLeads7d }],
    })
    expect(flags).toHaveLength(1)
    expect(flags[0]).toMatchObject({ kind: "cpl_spike", campaignId: "c1" })
  })
  it("표본 미달이면 CPL 급등 미발화", () => {
    const flags = detectAnomalies({
      campaigns: [{ ...base, cpl7d: 40, cpl30d: 20, leads7d: ANOMALY_THRESHOLDS.cplMinLeads7d - 1 }],
    })
    expect(flags).toHaveLength(0)
  })
  it("페이싱 초과 — 집행률이 경과율+10%p 초과", () => {
    const flags = detectAnomalies({ campaigns: [{ ...base, executionPct: 62, elapsedPct: 45 }] })
    expect(flags[0]).toMatchObject({ kind: "pacing_over" })
  })
  it("경계값(정확히 +10%p)은 미발화", () => {
    const flags = detectAnomalies({ campaigns: [{ ...base, executionPct: 55, elapsedPct: 45 }] })
    expect(flags).toHaveLength(0)
  })
  it("리드 급감 — 직전 7일 대비 0.6배 미만", () => {
    const flags = detectAnomalies({ campaigns: [{ ...base, leads7d: 5, leadsPrev7d: 10 }] })
    expect(flags[0]).toMatchObject({ kind: "leads_drop" })
  })
  it("CTR 급락 — 30일 대비 0.6배 미만", () => {
    const flags = detectAnomalies({ campaigns: [{ ...base, ctr7d: 1, ctr30d: 2 }] })
    expect(flags[0]).toMatchObject({ kind: "ctr_drop" })
  })
})
