import { afterEach, describe, expect, it, vi } from "vitest"

const cacheMocks = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
}))

vi.mock("next/cache", () => ({
  revalidateTag: cacheMocks.revalidateTag,
}))

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
    expect(shouldUseSupabaseLeads({ VERCEL_ENV: "production" })).toBe(true)
    expect(shouldUseSupabaseLeads({ VERCEL_URL: "classin-home.vercel.app" })).toBe(true)
    expect(shouldUseSupabaseLeads({ VERCEL: "1", USE_SUPABASE_LEADS: "false" })).toBe(true)
  })
})

describe("saveLead", () => {
  const originalUseSupabaseLeads = process.env.USE_SUPABASE_LEADS

  afterEach(() => {
    if (originalUseSupabaseLeads === undefined) {
      delete process.env.USE_SUPABASE_LEADS
    } else {
      process.env.USE_SUPABASE_LEADS = originalUseSupabaseLeads
    }
    vi.restoreAllMocks()
    vi.resetModules()
    cacheMocks.revalidateTag.mockClear()
  })

  it("retries dropping only the named column — 나머지 귀속 데이터는 지킨다", async () => {
    vi.resetModules()
    process.env.USE_SUPABASE_LEADS = "true"

    const single = vi.fn()
      .mockResolvedValueOnce({
        data: null,
        error: {
          code: "PGRST204",
          message: "Could not find the 'landing_page' column of 'leads' in the schema cache",
        },
      })
      .mockResolvedValueOnce({
        data: {
          id: "lead-1",
          source: "contact_page",
          name: "Codex Test",
          org: "Codex Test Academy",
          role: null,
          size: null,
          email: null,
          phone: "010-1234-5678",
          message: "문의 테스트",
          branch: null,
          status: "new",
          notes: null,
          created_at: "2026-06-24T00:00:00.000Z",
          updated_at: "2026-06-24T00:00:00.000Z",
        },
        error: null,
      })
    const insert = vi.fn((payload: Record<string, unknown>) => {
      void payload
      return { select: () => ({ single }) }
    })
    const from = vi.fn(() => ({ insert }))

    vi.doMock("@/lib/supabase/admin", () => ({
      createSupabaseAdminClient: vi.fn(() => ({ from })),
    }))

    const { saveLead } = await import("@/lib/repositories/leads")

    const saved = await saveLead({
      source: "contact_page",
      name: "Codex Test",
      org: "Codex Test Academy",
      phone: "010-1234-5678",
      message: "문의 테스트",
      timestamp: "2026-06-24T00:00:00.000Z",
      source_detail: "도입 상담",
      landing_page: "https://classin.co.kr/contact",
      current_page: "https://classin.co.kr/contact",
      referrer: "https://classin.co.kr/",
    })

    expect(saved.id).toBe("lead-1")
    expect(cacheMocks.revalidateTag).toHaveBeenCalledWith("admin-leads-overview", { expire: 0 })
    expect(insert).toHaveBeenCalledTimes(2)
    expect(insert.mock.calls[0]?.[0]).toMatchObject({
      source_detail: "도입 상담",
      landing_page: "https://classin.co.kr/contact",
    })
    expect(insert.mock.calls[1]?.[0]).toMatchObject({
      source: "contact_page",
      name: "Codex Test",
      org: "Codex Test Academy",
      phone: "010-1234-5678",
      message: "문의 테스트",
      status: "new",
    })
    // 오류가 지목한 컬럼만 빠진다.
    expect(insert.mock.calls[1]?.[0]).not.toHaveProperty("landing_page")
    // 멀쩡한 귀속 컬럼은 살아남는다 — 예전에는 이것들까지 통째로 버렸다.
    expect(insert.mock.calls[1]?.[0]).toMatchObject({
      source_detail: "도입 상담",
      current_page: "https://classin.co.kr/contact",
      referrer: "https://classin.co.kr/",
    })
  })

  it("여러 컬럼이 없으면 2차로 선택 컬럼을 전부 덜어 저장을 살린다", async () => {
    vi.resetModules()
    process.env.USE_SUPABASE_LEADS = "true"

    // PostgREST 는 한 번에 한 컬럼만 지목한다 — 지목된 것만 덜면 다음 컬럼에서 또 걸린다.
    const single = vi
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: {
          code: "PGRST204",
          message: "Could not find the 'anonymous_id' column of 'leads' in the schema cache",
        },
      })
      .mockResolvedValueOnce({
        data: null,
        error: {
          code: "PGRST204",
          message: "Could not find the 'landing_page' column of 'leads' in the schema cache",
        },
      })
      .mockResolvedValueOnce({
        data: {
          id: "lead-2",
          source: "contact_page",
          name: "Codex Test",
          status: "new",
          created_at: "2026-08-05T00:00:00.000Z",
          updated_at: "2026-08-05T00:00:00.000Z",
        },
        error: null,
      })
    const insert = vi.fn((payload: Record<string, unknown>) => {
      void payload
      return { select: () => ({ single }) }
    })
    const from = vi.fn(() => ({ insert }))

    vi.doMock("@/lib/supabase/admin", () => ({
      createSupabaseAdminClient: vi.fn(() => ({ from })),
    }))

    const { saveLead } = await import("@/lib/repositories/leads")

    const saved = await saveLead({
      source: "contact_page",
      name: "Codex Test",
      timestamp: "2026-08-05T00:00:00.000Z",
      anonymous_id: "anon-1",
      landing_page: "https://classin.co.kr/contact",
      source_detail: "도입 상담",
    })

    expect(saved.id).toBe("lead-2")
    expect(cacheMocks.revalidateTag).toHaveBeenCalledWith("admin-leads-overview", { expire: 0 })
    expect(insert).toHaveBeenCalledTimes(3)
    // 2차 재시도는 선택 컬럼을 전부 덜어낸다 — 리드를 잃는 것보다 귀속을 잃는 게 낫다.
    expect(insert.mock.calls[2]?.[0]).not.toHaveProperty("anonymous_id")
    expect(insert.mock.calls[2]?.[0]).not.toHaveProperty("landing_page")
    expect(insert.mock.calls[2]?.[0]).not.toHaveProperty("source_detail")
    expect(insert.mock.calls[2]?.[0]).toMatchObject({ source: "contact_page", name: "Codex Test" })
  })

  it("does not retry non-schema storage failures", async () => {
    vi.resetModules()
    process.env.USE_SUPABASE_LEADS = "true"

    const single = vi.fn().mockResolvedValueOnce({
      data: null,
      error: {
        code: "42501",
        message: "permission denied for table leads",
      },
    })
    const insert = vi.fn((payload: Record<string, unknown>) => {
      void payload
      return { select: () => ({ single }) }
    })
    const from = vi.fn(() => ({ insert }))

    vi.doMock("@/lib/supabase/admin", () => ({
      createSupabaseAdminClient: vi.fn(() => ({ from })),
    }))

    const { saveLead } = await import("@/lib/repositories/leads")

    await expect(
      saveLead({
        source: "contact_page",
        name: "Codex Test",
        org: "Codex Test Academy",
        phone: "010-1234-5678",
        message: "문의 테스트",
        timestamp: "2026-06-24T00:00:00.000Z",
      })
    ).rejects.toThrow("[leads] 저장 실패: permission denied for table leads")

    expect(insert).toHaveBeenCalledTimes(1)
    expect(cacheMocks.revalidateTag).not.toHaveBeenCalled()
  })
})
