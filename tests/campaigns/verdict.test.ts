import { describe, expect, it } from "vitest"
import { describeVerdictStatus, resolveVerdictStatus } from "@/lib/marketing/verdict"

const measuredFunnel = { adLeads: 40, contacted: 30 }

describe("resolveVerdictStatus", () => {
  it("이상 신호 0 → 정상", () => {
    expect(resolveVerdictStatus({ anomalies: [], funnel: measuredFunnel, measured: true })).toBe("ok")
  })
  it("이상 신호 1건 이상(warn) → 주의", () => {
    expect(
      resolveVerdictStatus({
        anomalies: [{ kind: "ctr_drop", severity: "warn" }],
        funnel: measuredFunnel,
        measured: true,
      })
    ).toBe("caution")
  })
  it("CPL 급등 또는 high 심각도 → 경고", () => {
    expect(
      resolveVerdictStatus({ anomalies: [{ kind: "cpl_spike", severity: "warn" }], funnel: measuredFunnel, measured: true })
    ).toBe("warning")
    expect(
      resolveVerdictStatus({ anomalies: [{ kind: "leads_drop", severity: "high" }], funnel: measuredFunnel, measured: true })
    ).toBe("warning")
  })
  it("광고 리드가 있는데 컨택 0 → 경고(후속 손길 없음)", () => {
    expect(resolveVerdictStatus({ anomalies: [], funnel: { adLeads: 12, contacted: 0 }, measured: true })).toBe(
      "warning"
    )
  })
  it("광고 리드 0 이면 컨택 0 은 경고가 아니다(컨택할 대상이 없다)", () => {
    expect(resolveVerdictStatus({ anomalies: [], funnel: { adLeads: 0, contacted: 0 }, measured: true })).toBe("ok")
  })
  it("미측정은 정상으로 포장하지 않는다", () => {
    expect(resolveVerdictStatus({ anomalies: [], funnel: { adLeads: 0, contacted: 0 }, measured: false })).toBe(
      "unmeasured"
    )
  })
})

describe("describeVerdictStatus", () => {
  it("왜 그 색인지 숫자로 말한다", () => {
    expect(describeVerdictStatus("ok", 0, false)).toBe("정상 · 이상 신호 없음")
    expect(describeVerdictStatus("caution", 2, false)).toBe("주의 · 이상 신호 2건")
    expect(describeVerdictStatus("warning", 1, true)).toBe("경고 · 이상 신호 1건 · 광고 리드 전원 미컨택")
    expect(describeVerdictStatus("unmeasured", 0, false)).toBe("미측정 · 소스 연결 확인")
  })
})
