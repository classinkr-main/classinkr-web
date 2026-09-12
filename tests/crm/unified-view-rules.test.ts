import { describe, expect, it } from "vitest"

import {
  isUnconfirmedGatedInView,
  matchesSavedView,
  rowHiddenByUnconfirmedGate,
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
    bucket: null,
    moneyLabel: null,
    moneyState: "none",
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

function neoRow(partial: Partial<CrmUnifiedCustomerRow>): CrmUnifiedCustomerRow {
  return leadRow({
    key: "neo:1",
    source: "neo_account",
    sourceLabel: "고객",
    lifecycle: "active_account",
    statusLabel: "활성 고객",
    score: 10,
    moneyState: "unsynced",
    origin: null,
    slaTarget: false,
    createdAt: null,
    ...partial,
  })
}

describe("기존 저장 뷰 회귀 (규칙 모듈 분리 전 동작 보존)", () => {
  it("all — 항상 매칭", () => {
    expect(matchesSavedView(leadRow({}), "all", new Set(), NOW)).toBe(true)
    expect(matchesSavedView(neoRow({}), "all", new Set(), NOW)).toBe(true)
  })

  it("priority — score 68 이상만", () => {
    expect(matchesSavedView(leadRow({ score: 68 }), "priority", new Set(), NOW)).toBe(true)
    expect(matchesSavedView(leadRow({ score: 67 }), "priority", new Set(), NOW)).toBe(false)
  })

  it("new_leads — lifecycle new_lead만", () => {
    expect(matchesSavedView(leadRow({ lifecycle: "new_lead" }), "new_leads", new Set(), NOW)).toBe(true)
    expect(matchesSavedView(leadRow({ lifecycle: "active_lead" }), "new_leads", new Set(), NOW)).toBe(false)
  })

  it("needs_care — neo_account + account_risk만", () => {
    expect(matchesSavedView(neoRow({ lifecycle: "account_risk" }), "needs_care", new Set(), NOW)).toBe(true)
    expect(matchesSavedView(neoRow({}), "needs_care", new Set(), NOW)).toBe(false)
    expect(matchesSavedView(leadRow({ lifecycle: "account_risk" }), "needs_care", new Set(), NOW)).toBe(false)
  })

  it("my_owner — ownerKeys 매칭 필요, 빈 Set은 false", () => {
    const row = leadRow({ ownerKeys: ["moon"] })
    expect(matchesSavedView(row, "my_owner", new Set(["moon"]), NOW)).toBe(true)
    expect(matchesSavedView(row, "my_owner", new Set(["minjae"]), NOW)).toBe(false)
    expect(matchesSavedView(row, "my_owner", new Set(), NOW)).toBe(false)
  })

  it("recent_contact — 최근 30일 내 사람이 남긴 컨택만", () => {
    expect(matchesSavedView(leadRow({ lastContactAt: "2026-07-16T09:00:00Z" }), "recent_contact", new Set(), NOW)).toBe(true)
    expect(matchesSavedView(neoRow({ lastContactAt: "2026-06-18T09:00:00Z" }), "recent_contact", new Set(), NOW)).toBe(true)
    expect(matchesSavedView(neoRow({ lastContactAt: "2026-06-16T09:00:00Z" }), "recent_contact", new Set(), NOW)).toBe(false)
    expect(matchesSavedView(neoRow({ lastContactAt: null }), "recent_contact", new Set(), NOW)).toBe(false)
  })

  it("active_deal — 진행 중인 Portal V2 딜이 있는 행만", () => {
    expect(matchesSavedView(neoRow({ source: "customer", activeDealCount: 2 }), "active_deal", new Set(), NOW)).toBe(true)
    expect(matchesSavedView(neoRow({ source: "customer", activeDealCount: 0 }), "active_deal", new Set(), NOW)).toBe(false)
    expect(matchesSavedView(neoRow({ activeDealCount: 0 }), "active_deal", new Set(), NOW)).toBe(false)
  })

  it("expiring — 만료 14일 이내(지난 것 포함), null 제외", () => {
    expect(matchesSavedView(neoRow({ expireAt: "2026-07-30T09:00:00Z" }), "expiring", new Set(), NOW)).toBe(true)
    expect(matchesSavedView(neoRow({ expireAt: "2026-07-01T09:00:00Z" }), "expiring", new Set(), NOW)).toBe(true)
    expect(matchesSavedView(neoRow({ expireAt: "2026-08-15T09:00:00Z" }), "expiring", new Set(), NOW)).toBe(false)
    expect(matchesSavedView(neoRow({ expireAt: null }), "expiring", new Set(), NOW)).toBe(false)
  })

  it("dormant — 마지막 활동 30일 초과만, null 제외", () => {
    expect(matchesSavedView(neoRow({ updatedAt: "2026-06-01T09:00:00Z" }), "dormant", new Set(), NOW)).toBe(true)
    expect(matchesSavedView(neoRow({ updatedAt: "2026-07-01T09:00:00Z" }), "dormant", new Set(), NOW)).toBe(false)
    expect(matchesSavedView(neoRow({ updatedAt: null }), "dormant", new Set(), NOW)).toBe(false)
  })

  it("hot_lead — lead + score 68 이상만", () => {
    expect(matchesSavedView(leadRow({ score: 70 }), "hot_lead", new Set(), NOW)).toBe(true)
    expect(matchesSavedView(leadRow({ score: 40 }), "hot_lead", new Set(), NOW)).toBe(false)
    expect(matchesSavedView(neoRow({ score: 70 }), "hot_lead", new Set(), NOW)).toBe(false)
  })

  it("upsell — 비위험 활성 고객 + 잔액 보유만", () => {
    expect(matchesSavedView(neoRow({ balance: 500 }), "upsell", new Set(), NOW)).toBe(true)
    expect(matchesSavedView(neoRow({ balance: 0 }), "upsell", new Set(), NOW)).toBe(false)
    expect(matchesSavedView(neoRow({ lifecycle: "account_risk", balance: 500 }), "upsell", new Set(), NOW)).toBe(false)
    expect(matchesSavedView(leadRow({ balance: 500 }), "upsell", new Set(), NOW)).toBe(false)
  })
})

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
  it("처리 큐와 실제 컨택이 있는 최근 컨택 뷰에서만 보인다", () => {
    const row = leadRow({ provisional: true })
    expect(rowVisibleInView(row, "site_leads", new Set(), NOW)).toBe(true)
    expect(rowVisibleInView(row, "unanswered", new Set(), NOW)).toBe(true)
    expect(
      rowVisibleInView(
        leadRow({ provisional: true, lastContactAt: "2026-07-16T09:00:00Z" }),
        "recent_contact",
        new Set(),
        NOW
      )
    ).toBe(true)
    expect(rowVisibleInView(row, "all", new Set(), NOW)).toBe(false)
    expect(rowVisibleInView(row, "new_leads", new Set(), NOW)).toBe(false)
  })
  it("비-provisional은 기존 뷰 규칙 그대로", () => {
    expect(rowVisibleInView(leadRow({}), "all", new Set(), NOW)).toBe(true)
    expect(rowVisibleInView(leadRow({ lifecycle: "new_lead" }), "new_leads", new Set(), NOW)).toBe(true)
  })
})

describe("확인 게이트 우회(includeUnconfirmed) — 플레이북 04 §3 \"숨긴 리드는 건수 표시 + 명시 포함\"", () => {
  const row = leadRow({ provisional: true })

  it("includeUnconfirmed=true면 게이트 뷰(all·new_leads)에서도 뷰 규칙만으로 보인다", () => {
    expect(rowVisibleInView(row, "all", new Set(), NOW, true)).toBe(true)
    expect(rowVisibleInView(row, "new_leads", new Set(), NOW, true)).toBe(true)
    // 뷰 규칙 자체는 여전히 적용 — 점수 미달 미확인 리드는 우선 처리 뷰에 안 들어온다.
    expect(rowVisibleInView(row, "priority", new Set(), NOW, true)).toBe(false)
  })

  it("기본값(false)은 기존 게이트 동작 그대로", () => {
    expect(rowVisibleInView(row, "all", new Set(), NOW)).toBe(false)
    expect(rowVisibleInView(row, "all", new Set(), NOW, false)).toBe(false)
  })

  it("isUnconfirmedGatedInView — 미확인 + 게이트 뷰일 때만", () => {
    expect(isUnconfirmedGatedInView(row, "all")).toBe(true)
    expect(isUnconfirmedGatedInView(row, "site_leads")).toBe(false)
    expect(isUnconfirmedGatedInView(leadRow({}), "all")).toBe(false)
  })

  it("rowHiddenByUnconfirmedGate — 뷰 규칙은 통과하지만 게이트에만 걸린 행(= 토글 시 추가될 행)", () => {
    expect(rowHiddenByUnconfirmedGate(row, "all", new Set(), NOW)).toBe(true)
    expect(rowHiddenByUnconfirmedGate(row, "new_leads", new Set(), NOW)).toBe(true)
    // 게이트 면제 뷰에서는 숨긴 게 아니다.
    expect(rowHiddenByUnconfirmedGate(row, "unanswered", new Set(), NOW)).toBe(false)
    // 뷰 규칙 자체에서 탈락한 행은 게이트가 숨긴 게 아니다(토글해도 안 나오므로 건수에 넣지 않는다).
    expect(rowHiddenByUnconfirmedGate(row, "priority", new Set(), NOW)).toBe(false)
    expect(rowHiddenByUnconfirmedGate(leadRow({}), "all", new Set(), NOW)).toBe(false)
  })
})
