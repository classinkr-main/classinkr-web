import { describe, expect, it } from "vitest"

import { matchCaptureRows, normalizePhoneKey } from "@/lib/crm/capture/matching"
import type { ParsedRow } from "@/lib/crm/capture/parsers"
import type { CrmUnifiedCustomerRow } from "@/lib/repositories/crm-unified-customers"

function customer(overrides: Partial<CrmUnifiedCustomerRow>): CrmUnifiedCustomerRow {
  return {
    key: "lead:1",
    source: "lead",
    sourceLabel: "리드",
    name: "테스트학원",
    contact: "010-1111-2222",
    ownerName: null,
    ownerKeys: [],
    lifecycle: "lead",
    statusLabel: "신규 리드",
    nextActionLabel: "",
    priorityReason: "",
    score: 0,
    moneyLabel: null,
    href: "",
    updatedAt: null,
    ...overrides,
  } as CrmUnifiedCustomerRow
}

function row(overrides: Partial<ParsedRow>): ParsedRow {
  return { rawText: "", organizationName: null, contactName: null, phone: null, email: null, regionLabel: null, memo: null, ...overrides }
}

describe("normalizePhoneKey", () => {
  it("reduces to digits and rejects short numbers", () => {
    expect(normalizePhoneKey("010-1234-5678")).toBe("01012345678")
    expect(normalizePhoneKey("051.000.0000")).toBe("0510000000")
    expect(normalizePhoneKey("123")).toBeNull()
  })
})

describe("matchCaptureRows", () => {
  const customers = [
    customer({ key: "lead:1", source: "lead", name: "대치스파르타", contact: "010-1111-2222" }),
    customer({ key: "neo:9", source: "neo_account", name: "해운대A학원", contact: "owner@a.com" }),
    customer({ key: "lead:2", source: "lead", name: "대치스파르타", contact: "010-3333-4444" }),
  ]

  it("auto-confirms a single exact phone match (customer vs lead status by source)", () => {
    const [m] = matchCaptureRows([row({ phone: "010-1111-2222", organizationName: "대치" })], customers)
    expect(m.matchStatus).toBe("confirmed_lead")
    expect(m.matchedTargetId).toBe("1")
    expect(m.matchedTargetType).toBe("lead")

    const [n] = matchCaptureRows([row({ email: "owner@a.com" })], customers)
    expect(n.matchStatus).toBe("confirmed_customer")
    expect(n.matchedTargetType).toBe("neo_account")
    expect(n.matchedTargetId).toBe("9")
  })

  it("does NOT auto-confirm on org-only match (needs review / multiple)", () => {
    const [m] = matchCaptureRows([row({ organizationName: "대치스파르타" })], customers)
    expect(m.matchStatus).toBe("multiple_candidates")
    expect(m.matchCandidates.length).toBe(2)
    expect(m.matchedTargetId).toBeNull()
  })

  it("marks an unmatched row with identity as a new lead candidate", () => {
    const [m] = matchCaptureRows([row({ organizationName: "새로운학원", phone: "010-7777-7777" })], customers)
    expect(m.matchStatus).toBe("new_lead_candidate")
  })

  it("marks a row with no extractable identity as needs_review", () => {
    const [m] = matchCaptureRows([row({ memo: "내용만 있음" })], customers)
    expect(m.matchStatus).toBe("needs_review")
  })

  it("flags in-batch duplicates by phone", () => {
    const result = matchCaptureRows(
      [row({ phone: "010-5555-5555" }), row({ phone: "010-5555-5555" })],
      customers
    )
    expect(result[0].matchStatus).not.toBe("duplicate_in_batch")
    expect(result[1].matchStatus).toBe("duplicate_in_batch")
  })

  it("maps portal customer source rows to the customer target type", () => {
    const withPortalCustomer = [
      ...customers,
      customer({ key: "customer:c1", source: "customer", name: "전환된학원", contact: "010-9999-8888" }),
    ]
    const [m] = matchCaptureRows([row({ phone: "010-9999-8888" })], withPortalCustomer)
    expect(m.matchStatus).toBe("confirmed_customer")
    expect(m.matchedTargetType).toBe("customer")
    expect(m.matchedTargetId).toBe("c1")
  })
})
