import { afterEach, describe, expect, it, vi } from "vitest"

describe("GET /api/chatbot/recommended-questions", () => {
  afterEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.doUnmock("@/lib/supabase/admin")
  })

  it("ignores malformed DB prompt rows while keeping valid starter questions", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://classin.example.supabase.co")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-publishable-key")
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

    const validStarter = "도입 상담 전에 확인할 질문을 알려주세요"
    const overlongStarter = "너무 긴 추천 질문입니다.".repeat(20)
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      order: vi.fn(() => query),
      limit: vi.fn().mockResolvedValue({
        data: [
          { prompt: validStarter },
          { prompt: overlongStarter },
          { prompt: 12345 },
          { prompt: "   " },
          { prompt: null },
        ],
        error: null,
      }),
    }

    vi.doMock("@/lib/supabase/admin", () => ({
      createSupabaseAdminClient: vi.fn(() => ({
        from: vi.fn(() => query),
      })),
    }))

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { GET } = await import("@/app/api/chatbot/recommended-questions/route")

    const response = await GET()
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.warning).toBeUndefined()
    expect(json.questions).toContain(validStarter)
    expect(json.questions).toHaveLength(4)
    expect(json.questions).not.toContain("12345")
    expect(json.questions).not.toContain(overlongStarter)
    expect(warnSpy).not.toHaveBeenCalled()
  })
})
