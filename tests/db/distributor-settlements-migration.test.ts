import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { SCHEMA_CONTRACT_MIGRATIONS, SCHEMA_PROBES } from "@/lib/db/schema-contract"

const FILE = "supabase/migrations/20261023_distributor_settlements.sql"
const sql = readFileSync(join(process.cwd(), FILE), "utf8").replace(/--[^\n]*/g, "")

describe("distributor settlements migration", () => {
  it("keeps money tables inaccessible to direct client sessions", () => {
    for (const table of ["distributor_price_templates", "distributor_settlements", "distributor_settlement_payments"]) {
      expect(sql).toMatch(new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, "i"))
    }
    expect(sql).not.toMatch(/CREATE POLICY|DISABLE ROW LEVEL SECURITY/i)
  })

  it("guards one settlement per quote and valid states at the database boundary", () => {
    expect(sql).toMatch(/quote_document_id UUID NOT NULL UNIQUE REFERENCES public\.quote_documents\(id\)/)
    expect(sql).toContain("issue_trigger IN ('on_accept', 'on_install', 'manual')")
    expect(sql).toContain("status IN ('draft', 'issued', 'partial', 'paid', 'completed', 'cancelled')")
    expect(sql).toContain("status IN ('draft', 'cancelled', 'completed') OR (share_token IS NOT NULL AND issued_at IS NOT NULL)")
    expect(sql).toContain("fulfillment_mode IN ('C', 'H')")
    expect(sql).toContain("status <> 'completed' OR (fulfillment_mode = 'H' AND installed_at IS NOT NULL)")
    expect(sql).toContain("fulfillment_mode = 'C' OR status IN ('draft', 'completed', 'cancelled')")
    expect(sql).toContain("CHECK (amount > 0)")
  })

  it("checks readiness without blocking the customer quote workflow", () => {
    expect(SCHEMA_CONTRACT_MIGRATIONS).toContain(FILE)
    const probes = SCHEMA_PROBES.filter((entry) => entry.migration === FILE)
    expect(probes.map((probe) => (probe.kind === "table" ? probe.table : null))).toEqual([
      "distributor_settlements",
      "distributor_settlement_payments",
      "distributor_price_templates",
    ])
    expect(probes.every((probe) => probe.severity === "warning")).toBe(true)
  })
})
