import { describe, expect, it } from "vitest"

import { buildLeadConversions } from "@/lib/admin/traffic-lead-conversions"

// /admin/traffic 의 전환 지표는 client_events 를 셌다. 그런데 client_events 적재는
// 분석 쿠키 동의가 있어야만 일어난다(lib/analytics.ts trackEvent → consent.analytics).
// 그래서 submit_demo_request 가 평생 3건으로 찍히는 동안 실제 리드는 계속 쌓였다
// (2026-09-01 실측: 이벤트 3건 vs contact_page 리드 4건 + 그 외 유입). 전환 수는
// 동의와 무관한 leads 테이블에서 센다.

const NOW = new Date("2026-09-01T00:00:00.000Z")

function row(source: string, createdAt: string) {
  return { source, created_at: createdAt }
}

describe("buildLeadConversions", () => {
  it("홈페이지 그룹과 뉴스레터를 나눠 세고 전체도 낸다", () => {
    const rows = [
      row("contact_page", "2026-08-31T00:00:00.000Z"),
      row("demo_modal", "2026-08-31T00:00:00.000Z"),
      row("home_final_cta", "2026-08-30T00:00:00.000Z"),
      row("newsletter", "2026-08-30T00:00:00.000Z"),
      row("meta_lead_ads", "2026-08-30T00:00:00.000Z"),
    ]
    const result = buildLeadConversions(rows, 7, NOW)
    expect(result.homepage).toBe(3)
    expect(result.newsletter).toBe(1)
    expect(result.total).toBe(5)
    expect(result.rangeDays).toBe(7)
  })

  it("윈도우 밖 리드는 세지 않는다", () => {
    const rows = [
      row("contact_page", "2026-08-31T00:00:00.000Z"),
      row("contact_page", "2026-07-01T00:00:00.000Z"),
    ]
    expect(buildLeadConversions(rows, 7, NOW).homepage).toBe(1)
  })

  it("잘못된 created_at 은 조용히 버린다 — 집계가 NaN 으로 무너지지 않게", () => {
    const rows = [row("contact_page", "not-a-date"), row("contact_page", "2026-08-31T00:00:00.000Z")]
    const result = buildLeadConversions(rows, 7, NOW)
    expect(result.homepage).toBe(1)
    expect(result.total).toBe(1)
  })

  it("빈 입력이면 전부 0", () => {
    expect(buildLeadConversions([], 30, NOW)).toEqual({
      rangeDays: 30,
      homepage: 0,
      newsletter: 0,
      total: 0,
    })
  })
})
