import { beforeEach, describe, expect, it, vi } from "vitest"

const generateLeadLinkCandidatesForLeads = vi.hoisted(() => vi.fn())
const queryLog = vi.hoisted(() => [] as Array<{ method: string; args: unknown[] }>)
const queryResult = vi.hoisted(() => ({ value: { data: [] as unknown[] | null, error: null as unknown } }))

vi.mock("@/lib/repositories/crm-source-links", () => ({ generateLeadLinkCandidatesForLeads }))
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => {
    const chain: Record<string, unknown> = {
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(queryResult.value).then(resolve),
    }
    for (const method of ["from", "select", "neq", "or", "order", "limit"]) {
      chain[method] = (...args: unknown[]) => {
        queryLog.push({ method, args })
        return chain
      }
    }
    return chain
  },
}))

import {
  LEAD_CUSTOMER_AUTOLINK_MAX_LEADS,
  runRecentLeadCustomerAutoLink,
} from "@/lib/server/lead-customer-autolink"

beforeEach(() => {
  generateLeadLinkCandidatesForLeads.mockReset()
  queryLog.length = 0
  queryResult.value = { data: [{ id: "lead-1" }, { id: "lead-2" }], error: null }
  generateLeadLinkCandidatesForLeads.mockResolvedValue({
    scannedLeads: 2,
    generatedCandidates: 3,
    insertedCandidates: 2,
    skippedExisting: 1,
    autoConfirmed: 1,
  })
})

describe("runRecentLeadCustomerAutoLink", () => {
  it("matches only open leads created or re-inflowed in the last 3 hours", async () => {
    const report = await runRecentLeadCustomerAutoLink(new Date("2026-10-22T06:00:00.000Z"))

    expect(report).toEqual({ status: "ok", recentLeads: 2, generatedCandidates: 3, insertedCandidates: 2, autoConfirmed: 1 })
    expect(generateLeadLinkCandidatesForLeads).toHaveBeenCalledWith(["lead-1", "lead-2"])
    expect(queryLog).toContainEqual({ method: "from", args: ["leads"] })
    expect(queryLog).toContainEqual({ method: "neq", args: ["status", "closed"] })
    expect(queryLog).toContainEqual({
      method: "or",
      args: ["created_at.gte.2026-10-22T03:00:00.000Z,last_inflow_at.gte.2026-10-22T03:00:00.000Z"],
    })
    expect(queryLog).toContainEqual({ method: "limit", args: [LEAD_CUSTOMER_AUTOLINK_MAX_LEADS] })
  })

  it("returns a failed report without the raw error when the lead query fails", async () => {
    queryResult.value = { data: null, error: { message: "permission denied for table leads", code: "42501" } }
    vi.spyOn(console, "error").mockImplementation(() => undefined)

    const report = await runRecentLeadCustomerAutoLink()

    expect(report).toEqual({
      status: "failed",
      recentLeads: 0,
      generatedCandidates: 0,
      insertedCandidates: 0,
      autoConfirmed: 0,
      error: "Lead customer auto-link failed.",
    })
    expect(generateLeadLinkCandidatesForLeads).not.toHaveBeenCalled()
  })

  it("returns a failed report when matching throws", async () => {
    generateLeadLinkCandidatesForLeads.mockRejectedValue(new Error("boom"))
    vi.spyOn(console, "error").mockImplementation(() => undefined)

    await expect(runRecentLeadCustomerAutoLink()).resolves.toMatchObject({ status: "failed" })
  })
})
