import { describe, expect, it } from "vitest"

import { shouldUseSupabaseLeadMagnets } from "@/lib/repositories/lead-magnets"

// 자료 퍼널 저장소 이관(2026-08-18) — leads-mode.test.ts와 같은 계약:
// Vercel(read-only 파일시스템)에서는 JSON 폴백을 절대 선택하지 않는다.
describe("shouldUseSupabaseLeadMagnets", () => {
  it("uses Supabase when explicitly enabled", () => {
    expect(shouldUseSupabaseLeadMagnets({ USE_SUPABASE_LEAD_MAGNETS: "true" })).toBe(true)
  })

  it("keeps JSON fallback available outside Vercel when not enabled", () => {
    expect(shouldUseSupabaseLeadMagnets({})).toBe(false)
    expect(shouldUseSupabaseLeadMagnets({ USE_SUPABASE_LEAD_MAGNETS: "false" })).toBe(false)
  })

  it("forces Supabase on Vercel because the filesystem is read-only", () => {
    expect(shouldUseSupabaseLeadMagnets({ VERCEL: "1" })).toBe(true)
    expect(shouldUseSupabaseLeadMagnets({ VERCEL_ENV: "production" })).toBe(true)
    expect(shouldUseSupabaseLeadMagnets({ VERCEL_URL: "classin-home.vercel.app" })).toBe(true)
    expect(
      shouldUseSupabaseLeadMagnets({ VERCEL: "1", USE_SUPABASE_LEAD_MAGNETS: "false" })
    ).toBe(true)
  })
})
