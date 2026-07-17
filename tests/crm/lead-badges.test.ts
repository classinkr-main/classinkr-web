import { describe, expect, it } from "vitest"

import { leadBadges, UNANSWERED_RISK_HOURS } from "@/lib/crm/lead-badges"
import type { CrmUnifiedCustomerRow } from "@/lib/crm/unified-view-rules"

const NOW = new Date("2026-07-17T09:00:00Z").getTime()

function leadRow(partial: Partial<CrmUnifiedCustomerRow>): CrmUnifiedCustomerRow {
  return {
    key: "lead:1",
    tags: [],
    source: "lead",
    sourceLabel: "데모 신청",
    name: "테스트학원",
    contact: "010-0000-0000",
    ownerName: null,
    ownerKeys: [],
    lifecycle: "new_lead",
    statusLabel: "신규 리드",
    nextActionLabel: "첫 응답",
    priorityReason: "-",
    score: 40,
    moneyLabel: null,
    href: "#",
    updatedAt: "2026-07-16T09:00:00Z",
    expireAt: null,
    balance: null,
    origin: "site",
    crmRegistered: false,
    provisional: false,
    slaTarget: true,
    firstResponseAt: null,
    createdAt: "2026-07-16T09:00:00Z",
    ...partial,
  }
}

function hoursAgo(hours: number): string {
  return new Date(NOW - hours * 3_600_000).toISOString()
}

describe("leadBadges", () => {
  it("returns null for non-lead rows", () => {
    expect(leadBadges(leadRow({ source: "neo_account" }), NOW)).toBeNull()
    expect(leadBadges(leadRow({ source: "customer" }), NOW)).toBeNull()
  })

  it("returns null when no badge applies (non-site origin, no pending SLA)", () => {
    expect(leadBadges(leadRow({ origin: "team", slaTarget: false }), NOW)).toBeNull()
    // SLA 대상이라도 첫 응답이 기록됐으면 미응답 배지 없음.
    expect(
      leadBadges(leadRow({ origin: "ad", firstResponseAt: "2026-07-16T10:00:00Z" }), NOW)
    ).toBeNull()
  })

  it("shows 홈페이지 (neutral) for unregistered site leads and 정식 리드 (green) once NEO-registered", () => {
    const unregistered = leadBadges(
      leadRow({ crmRegistered: false, slaTarget: false }),
      NOW
    )
    expect(unregistered).toEqual([{ label: "홈페이지", tone: "neutral" }])

    const registered = leadBadges(leadRow({ crmRegistered: true, slaTarget: false }), NOW)
    expect(registered).toEqual([{ label: "정식 리드 · NEO", tone: "green" }])
  })

  it("keeps 미응답 neutral below the 24h boundary and flips to risk at 24h", () => {
    const at23h = leadBadges(leadRow({ origin: "team", createdAt: hoursAgo(23) }), NOW)
    expect(at23h).toEqual([{ label: "미응답 23h", tone: "neutral" }])

    const at24h = leadBadges(
      leadRow({ origin: "team", createdAt: hoursAgo(UNANSWERED_RISK_HOURS) }),
      NOW
    )
    expect(at24h).toEqual([{ label: "미응답 24h", tone: "risk" }])
  })

  it("clamps future createdAt (clock skew) to 미응답 0h", () => {
    const skewed = leadBadges(leadRow({ origin: "team", createdAt: hoursAgo(-2) }), NOW)
    expect(skewed).toEqual([{ label: "미응답 0h", tone: "neutral" }])
  })

  it("skips the SLA badge for malformed createdAt instead of rendering NaN", () => {
    expect(leadBadges(leadRow({ origin: "team", createdAt: "not-a-date" }), NOW)).toBeNull()
  })

  it("stacks origin and SLA badges for a site lead awaiting first response", () => {
    const badges = leadBadges(leadRow({ createdAt: hoursAgo(30) }), NOW)
    expect(badges).toEqual([
      { label: "홈페이지", tone: "neutral" },
      { label: "미응답 30h", tone: "risk" },
    ])
  })
})
