import { describe, expect, it } from "vitest"

import { computeCustomerHealth, healthBand } from "@/lib/crm/customer-health"

describe("healthBand", () => {
  it("임계 75 이상 안전 · 55 이상 주의 · 그 미만 위험", () => {
    expect(healthBand(100)).toBe("safe")
    expect(healthBand(75)).toBe("safe")
    expect(healthBand(74)).toBe("watch")
    expect(healthBand(55)).toBe("watch")
    expect(healthBand(54)).toBe("risk")
    expect(healthBand(0)).toBe("risk")
  })
})

describe("computeCustomerHealth", () => {
  it("신호가 없으면 만점·안전", () => {
    const h = computeCustomerHealth({})
    expect(h.score).toBe(100)
    expect(h.band).toBe("safe")
    expect(h.label).toBe("안전")
  })

  it("리스크 등급별 감점(critical -45 / high -30 / medium -12 / low 0)", () => {
    expect(computeCustomerHealth({ riskSeverity: "critical" }).score).toBe(55)
    expect(computeCustomerHealth({ riskSeverity: "high" }).score).toBe(70)
    expect(computeCustomerHealth({ riskSeverity: "medium" }).score).toBe(88)
    expect(computeCustomerHealth({ riskSeverity: "low" }).score).toBe(100)
  })

  it("서비스 위험 등급별 감점(urgent -35 / soon -20 / watch -8)", () => {
    expect(computeCustomerHealth({ serviceLevel: "urgent" }).score).toBe(65)
    expect(computeCustomerHealth({ serviceLevel: "soon" }).score).toBe(80)
    expect(computeCustomerHealth({ serviceLevel: "watch" }).score).toBe(92)
    expect(computeCustomerHealth({ serviceLevel: "normal" }).score).toBe(100)
  })

  it("미수 보유 -12", () => {
    expect(computeCustomerHealth({ hasOutstanding: true }).score).toBe(88)
    expect(computeCustomerHealth({ hasOutstanding: false }).score).toBe(100)
  })

  it("만료 임박: 7일 이하 -25, 30일 이하 -12, 그 외 0", () => {
    expect(computeCustomerHealth({ daysToExpire: 5 }).score).toBe(75)
    expect(computeCustomerHealth({ daysToExpire: 7 }).score).toBe(75)
    expect(computeCustomerHealth({ daysToExpire: 20 }).score).toBe(88)
    expect(computeCustomerHealth({ daysToExpire: 40 }).score).toBe(100)
    expect(computeCustomerHealth({ daysToExpire: null }).score).toBe(100)
  })

  it("최근 미접촉: 21일 이상 -15, 14일 이상 -8, 그 외 0", () => {
    expect(computeCustomerHealth({ lastContactDays: 25 }).score).toBe(85)
    expect(computeCustomerHealth({ lastContactDays: 16 }).score).toBe(92)
    expect(computeCustomerHealth({ lastContactDays: 10 }).score).toBe(100)
    expect(computeCustomerHealth({ lastContactDays: null }).score).toBe(100)
  })

  it("신호 합성 + 0 하한 클램프 → 위험", () => {
    const h = computeCustomerHealth({
      riskSeverity: "critical",
      serviceLevel: "urgent",
      hasOutstanding: true,
      daysToExpire: 3,
      lastContactDays: 30,
    })
    // 100 - 45 - 35 - 12 - 25 - 15 = -32 → 0
    expect(h.score).toBe(0)
    expect(h.band).toBe("risk")
  })

  it("경계: critical + 미수 → 43 위험", () => {
    const h = computeCustomerHealth({ riskSeverity: "critical", hasOutstanding: true })
    expect(h.score).toBe(43)
    expect(h.band).toBe("risk")
  })
})
