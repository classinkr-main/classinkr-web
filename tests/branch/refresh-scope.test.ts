import { describe, expect, it } from "vitest"
import { previousBranchState, type BranchJsonState } from "@/components/admin/branch/client-api"

describe("refresh scope", () => {
  const state: BranchJsonState<{ amount: number }> = {
    key: "1:/api/admin/branch/pipeline?team=BD", data: { amount: 100 }, error: null,
    loading: false, stale: false, staleSince: null,
  }
  it("keeps a clearly marked prior result for a refresh of the same query", () => {
    expect(previousBranchState(state, "2:/api/admin/branch/pipeline?team=BD", "/api/admin/branch/pipeline?team=BD"))
      .toMatchObject({ data: { amount: 100 }, loading: true, previous: true })
  })
  it("does not show another team's values under new filter labels", () => {
    expect(previousBranchState(state, "2:/api/admin/branch/pipeline?team=ALL", "/api/admin/branch/pipeline?team=ALL")).toBeNull()
  })
})
