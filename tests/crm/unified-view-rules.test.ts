import { describe, expect, it } from "vitest"

import {
  matchesSavedView,
  rowVisibleInView,
  type CrmUnifiedCustomerRow,
} from "@/lib/crm/unified-view-rules"

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

describe("site_leads 뷰", () => {
  it("홈페이지 유입 & 미등록만 매칭", () => {
    expect(matchesSavedView(leadRow({}), "site_leads", new Set(), NOW)).toBe(true)
    expect(matchesSavedView(leadRow({ crmRegistered: true }), "site_leads", new Set(), NOW)).toBe(false)
    expect(matchesSavedView(leadRow({ origin: "ad" }), "site_leads", new Set(), NOW)).toBe(false)
    expect(matchesSavedView(leadRow({ source: "neo_account" }), "site_leads", new Set(), NOW)).toBe(false)
  })
})

describe("unanswered 뷰", () => {
  it("SLA 대상 & 첫 응답 없음만 매칭", () => {
    expect(matchesSavedView(leadRow({}), "unanswered", new Set(), NOW)).toBe(true)
    expect(matchesSavedView(leadRow({ firstResponseAt: "2026-07-16T10:00:00Z" }), "unanswered", new Set(), NOW)).toBe(false)
    expect(matchesSavedView(leadRow({ slaTarget: false }), "unanswered", new Set(), NOW)).toBe(false)
  })
})

describe("provisional(미확인 신규) 노출 규칙", () => {
  it("site_leads/unanswered 뷰에서만 보인다", () => {
    const row = leadRow({ provisional: true })
    expect(rowVisibleInView(row, "site_leads", new Set(), NOW)).toBe(true)
    expect(rowVisibleInView(row, "unanswered", new Set(), NOW)).toBe(true)
    expect(rowVisibleInView(row, "all", new Set(), NOW)).toBe(false)
    expect(rowVisibleInView(row, "new_leads", new Set(), NOW)).toBe(false)
  })
  it("비-provisional은 기존 뷰 규칙 그대로", () => {
    expect(rowVisibleInView(leadRow({}), "all", new Set(), NOW)).toBe(true)
    expect(rowVisibleInView(leadRow({ lifecycle: "new_lead" }), "new_leads", new Set(), NOW)).toBe(true)
  })
})
