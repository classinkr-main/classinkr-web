import { describe, expect, it } from "vitest"

import {
  getCrmMatchingLookupPlan,
  needsSyntheticUnmatchedRow,
  paginateAdminCrmMatchingInbox,
  type AdminCrmMatchingSnapshot,
  type CrmMatchingRow,
} from "@/lib/admin-crm-matching"

function row(index: number, overrides: Partial<CrmMatchingRow> = {}): CrmMatchingRow {
  return {
    key: `row-${index}`,
    linkId: `link-${index}`,
    sourceSystem: index % 2 === 0 ? "branch_rev_sheet" : "xiaoshouyi",
    sourceObject: "test",
    sourceRecordKey: `source-${index}`,
    sourceLabel: `Academy ${index}`,
    sourceDetail: null,
    sourceOwner: null,
    sourceStatus: null,
    amount: index,
    linkStatus: "candidate",
    targetType: "customer",
    targetId: `customer-${index}`,
    targetLabel: `Customer ${index}`,
    confidence: 0.8,
    autoConfirmed: false,
    confirmedAt: null,
    updatedAt: null,
    placeholder: false,
    validationState: "valid",
    validationMessage: null,
    accountBalance: null,
    accountExpireAt: null,
    accountSyncedAt: null,
    ...overrides,
  }
}

function snapshot(): AdminCrmMatchingSnapshot {
  const reviewRows = Array.from({ length: 120 }, (_, index) => row(index))
  const confirmedRows = Array.from({ length: 10 }, (_, index) =>
    row(120 + index, {
      sourceSystem: "lead",
      sourceLabel: index === 0 ? "Special Academy" : `Confirmed ${index}`,
      linkStatus: "confirmed",
      autoConfirmed: index % 2 === 0,
    })
  )
  return {
    generatedAt: "2026-08-27T00:00:00.000Z",
    rows: [...reviewRows, ...confirmedRows],
    summary: {
      branch_rev_sheet: { reviewCount: 60, invalidReviewCount: 0, confirmedCount: 0, autoConfirmedCount: 0, unmatchedCount: 0, unmatchedAmount: 0 },
      xiaoshouyi: { reviewCount: 60, invalidReviewCount: 0, confirmedCount: 0, autoConfirmedCount: 0, unmatchedCount: 0, unmatchedAmount: 0 },
      lead: { reviewCount: 0, invalidReviewCount: 0, confirmedCount: 10, autoConfirmedCount: 5, unmatchedCount: 0, unmatchedAmount: 0 },
    },
    totals: {
      reviewCount: 120,
      invalidReviewCount: 0,
      confirmedCount: 10,
      autoConfirmedCount: 5,
      unmatchedCount: 0,
      sheetMatchedRatio: 0.5,
    },
    warnings: [],
  }
}

describe("CRM matching server pagination", () => {
  it("plans only observed Neo owners and legacy target-label fallbacks", () => {
    const plan = getCrmMatchingLookupPlan([
      {
        source_system: "xiaoshouyi",
        target_type: "customer",
        metadata: { owner_name: "owner-1", target_label: "현재 고객" },
      },
      {
        source_system: "xiaoshouyi",
        target_type: "deal",
        metadata: { source_owner: "owner-1" },
      },
      {
        source_system: "branch_rev_sheet",
        target_type: "partner_account",
        metadata: { owner_name: "not-a-neo-owner", target_label: "현재 파트너" },
      },
    ])

    expect(plan.ownerIds).toEqual(["owner-1"])
    expect(plan.missingTargetTypes).toEqual(["deal"])
  })

  it("keeps a current source actionable when its only stored links are invalid or rejected history", () => {
    expect(
      needsSyntheticUnmatchedRow([
        row(0, { validationState: "legacy_unscoped_alias", linkStatus: "candidate" }),
      ])
    ).toBe(true)
    expect(needsSyntheticUnmatchedRow([row(0, { linkStatus: "rejected" })])).toBe(true)
    expect(needsSyntheticUnmatchedRow([row(0, { linkStatus: "candidate" })])).toBe(false)
    expect(needsSyntheticUnmatchedRow([row(0, { linkStatus: "confirmed" })])).toBe(false)
  })

  it("defaults to the first 50 review rows while preserving global KPI totals", () => {
    const page = paginateAdminCrmMatchingInbox(snapshot())

    expect(page.rows).toHaveLength(50)
    expect(page.rows.every((item) => item.linkStatus === "candidate")).toBe(true)
    expect(page.page).toEqual({ limit: 50, offset: 0, total: 120, hasMore: true, hasPrevious: false })
    expect(page.totals).toMatchObject({ reviewCount: 120, confirmedCount: 10 })
  })

  it("applies source/status filters on the server and returns a bounded page", () => {
    const page = paginateAdminCrmMatchingInbox(snapshot(), {
      source: "lead",
      status: "confirmed",
      limit: 4,
      offset: 4,
    })

    expect(page.rows).toHaveLength(4)
    expect(page.rows.every((item) => item.sourceSystem === "lead" && item.linkStatus === "confirmed")).toBe(true)
    expect(page.page).toEqual({ limit: 4, offset: 4, total: 10, hasMore: true, hasPrevious: true })
  })

  it("name deep-links bypass status like the legacy client filter and clamp stale offsets", () => {
    const page = paginateAdminCrmMatchingInbox(snapshot(), {
      status: "review",
      name: "special academy",
      offset: 500,
    })

    expect(page.rows.map((item) => item.sourceLabel)).toEqual(["Special Academy"])
    expect(page.page).toEqual({ limit: 50, offset: 0, total: 1, hasMore: false, hasPrevious: false })
  })

  it("keeps non-actionable history out of review while exposing a dedicated filter", () => {
    const input = snapshot()
    input.rows[0] = {
      ...input.rows[0],
      validationState: "legacy_unscoped_alias",
      validationMessage: "invalid",
    }
    input.rows[1] = {
      ...input.rows[1],
      linkStatus: "stale",
      validationState: "retired_confirmed_sibling",
      validationMessage: "retired",
    }

    const reviewPage = paginateAdminCrmMatchingInbox(input, { status: "review" })
    const invalidPage = paginateAdminCrmMatchingInbox(input, { status: "invalid" })

    expect(reviewPage.page.total).toBe(118)
    expect(reviewPage.rows.every((item) => item.validationState === "valid")).toBe(true)
    expect(invalidPage.page.total).toBe(2)
    expect(invalidPage.rows.map((item) => item.key)).toEqual(["row-0", "row-1"])
  })
})
