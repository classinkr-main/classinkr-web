import { describe, expect, it } from "vitest"

import { shouldUseSupabaseLeads } from "@/lib/repositories/leads"

describe("shouldUseSupabaseLeads", () => {
  it("uses Supabase when explicitly enabled", () => {
    expect(shouldUseSupabaseLeads({ USE_SUPABASE_LEADS: "true" })).toBe(true)
  })

  it("keeps JSON fallback available outside Vercel when not enabled", () => {
    expect(shouldUseSupabaseLeads({})).toBe(false)
    expect(shouldUseSupabaseLeads({ USE_SUPABASE_LEADS: "false" })).toBe(false)
  })

  it("forces Supabase on Vercel because the filesystem is read-only", () => {
    expect(shouldUseSupabaseLeads({ VERCEL: "1" })).toBe(true)
    expect(shouldUseSupabaseLeads({ VERCEL: "1", USE_SUPABASE_LEADS: "false" })).toBe(true)
  })
})
