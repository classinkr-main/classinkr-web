import { describe, it, expect } from "vitest"
import { deriveMemberTeams, listMembersByTeamFromDeals } from "@/lib/branch/computations/member-teams"
import type { BranchRevDeal } from "@/lib/repositories/branch-deals"

const mk = (over: Partial<BranchRevDeal>): BranchRevDeal => ({
  id: "x", sheet_row: 1, customer_name: "c", branch_contact: null, team: "BD",
  manager: "Han", deal_type: "Direct", status: "New", first_payment: null,
  product_version: null, region: null, importance: null, note: null,
  contract_target: 0, monthly_payments: {}, monthly_red: {}, raw: {}, synced_at: "",
  ...over,
})

describe("member-teams", () => {
  it("derives most common team per manager", () => {
    const out = deriveMemberTeams([
      mk({ manager: "Han", team: "BD" }),
      mk({ manager: "Han", team: "BD" }),
      mk({ manager: "Han", team: "MKT" }),
      mk({ manager: "Mira", team: "MKT" }),
    ])
    expect(out.Han).toBe("BD")
    expect(out.Mira).toBe("MKT")
  })
  it("listMembersByTeamFromDeals filters by team", () => {
    const deals = [mk({ manager: "Han", team: "BD" }), mk({ manager: "Mira", team: "MKT" })]
    expect(listMembersByTeamFromDeals(deals, "BD")).toEqual(["Han"])
    expect(listMembersByTeamFromDeals(deals, "ALL").sort()).toEqual(["Han", "Mira"])
  })
})
