import { readFileSync } from "node:fs"
import { join } from "node:path"

import { beforeEach, describe, expect, it, vi } from "vitest"

const calls = vi.hoisted(() => [] as Array<{ table: string; method: string; args: unknown[] }>)
const createClient = vi.hoisted(() => vi.fn())

vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: createClient }))

function recordingClient() {
  return {
    from(table: string) {
      const chain: Record<string, unknown> = {
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
      }
      for (const method of ["select", "neq", "in", "limit", "eq", "order", "is", "not", "gte", "or"]) {
        chain[method] = (...args: unknown[]) => {
          calls.push({ table, method, args })
          return chain
        }
      }
      chain.insert = (...args: unknown[]) => {
        calls.push({ table, method: "insert", args })
        return Promise.resolve({ data: null, error: null })
      }
      return chain
    },
  }
}

beforeEach(() => {
  calls.length = 0
  createClient.mockReset()
  createClient.mockImplementation(recordingClient)
})

describe("generateLeadLinkCandidatesForLeads", () => {
  it("does nothing for an empty id list", async () => {
    const { generateLeadLinkCandidatesForLeads } = await import("@/lib/repositories/crm-source-links")

    await expect(generateLeadLinkCandidatesForLeads([])).resolves.toEqual({
      scannedLeads: 0,
      generatedCandidates: 0,
      insertedCandidates: 0,
      skippedExisting: 0,
      autoConfirmed: 0,
    })
    expect(createClient).not.toHaveBeenCalled()
  })

  it("reads only the given open leads instead of the 2000-lead scan", async () => {
    const { generateLeadLinkCandidatesForLeads } = await import("@/lib/repositories/crm-source-links")

    const result = await generateLeadLinkCandidatesForLeads(["lead-1", "lead-2"])

    const leadCalls = calls.filter((call) => call.table === "leads")
    expect(leadCalls).toContainEqual({ table: "leads", method: "in", args: ["id", ["lead-1", "lead-2"]] })
    expect(leadCalls).toContainEqual({ table: "leads", method: "neq", args: ["status", "closed"] })
    expect(leadCalls.some((call) => call.method === "limit")).toBe(false)
    expect(result.scannedLeads).toBe(0)
  })
})

describe("20261022_crm_lead_auto_confirm.sql", () => {
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261022_crm_lead_auto_confirm.sql"), "utf8")

  it("enables auto-confirm for the lead source only, keeping thresholds untouched", () => {
    expect(sql).toMatch(/UPDATE public\.crm_source_priorities\s+SET auto_confirm_enabled = true\s+WHERE source_system = 'lead';/)
    expect(sql).not.toMatch(/auto_confirm_min_confidence\s*=/)
    expect(sql).not.toMatch(/auto_confirm_min_gap\s*=/)
  })

  it("documents how to turn it back off", () => {
    expect(sql).toContain("SET auto_confirm_enabled = false WHERE source_system = 'lead'")
  })
})
