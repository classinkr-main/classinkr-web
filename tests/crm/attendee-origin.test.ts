import { describe, expect, it } from "vitest"

import { deriveAttendeeOrigin } from "@/lib/crm/capture/origin"

describe("deriveAttendeeOrigin", () => {
  it("명단에만 있던 신규는 new_lead (타입보다 우선)", () => {
    expect(deriveAttendeeOrigin({ matchedTargetType: null, createdNewLead: true })).toBe("new_lead")
    expect(deriveAttendeeOrigin({ matchedTargetType: "lead", createdNewLead: true })).toBe("new_lead")
  })

  it("광고 source 리드는 ad_lead", () => {
    expect(deriveAttendeeOrigin({ matchedTargetType: "lead", createdNewLead: false, leadSource: "meta_lead_ads" })).toBe("ad_lead")
    expect(deriveAttendeeOrigin({ matchedTargetType: "lead", createdNewLead: false, leadSource: "google_ads" })).toBe("ad_lead")
  })

  it("광고 클릭 식별자가 있으면 source 무관하게 ad_lead", () => {
    expect(
      deriveAttendeeOrigin({ matchedTargetType: "lead", createdNewLead: false, leadSource: "contact_page", leadHasAdClickId: true })
    ).toBe("ad_lead")
  })

  it("사이트/기타/미상 source 리드는 site_lead", () => {
    expect(deriveAttendeeOrigin({ matchedTargetType: "lead", createdNewLead: false, leadSource: "contact_page" })).toBe("site_lead")
    expect(deriveAttendeeOrigin({ matchedTargetType: "lead", createdNewLead: false, leadSource: null })).toBe("site_lead")
  })

  it("neo_account / customer 매칭은 existing_customer", () => {
    expect(deriveAttendeeOrigin({ matchedTargetType: "neo_account", createdNewLead: false })).toBe("existing_customer")
    expect(deriveAttendeeOrigin({ matchedTargetType: "customer", createdNewLead: false })).toBe("existing_customer")
  })

  it("매칭 없음은 unknown", () => {
    expect(deriveAttendeeOrigin({ matchedTargetType: null, createdNewLead: false })).toBe("unknown")
  })
})
