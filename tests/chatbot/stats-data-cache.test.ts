import { afterEach, describe, expect, it, vi } from "vitest"

// getChatbotStats(app/api/admin/chatbot/stats 가 호출) — 콜드 Fluid 인스턴스마다 daily 통계 +
// feedback 통계 + chatbot_answer_events 1000행 읽기까지 3개 쿼리를 서버 캐시 없이 매번
// 다시 실행하던 것을 60초 unstable_cache 로 감쌌다(2026-09-04). 이 테스트는
// (1) 캐시 keyParts/tags/revalidate 배선을 고정하고,
// (2) URLSearchParams 가 아니라 정규화한 from/to 문자열이 캐시 인자로 넘어가는지(Supabase
//     미설정 폴백 경로를 이용해 DB 없이 확인)를 검증한다.
const unstableCacheCalls: Array<{
  keyParts: string[]
  options?: { revalidate?: number; tags?: string[] }
}> = []

vi.mock("next/cache", () => ({
  unstable_cache: (
    fn: (...args: unknown[]) => unknown,
    keyParts: string[],
    options?: { revalidate?: number; tags?: string[] }
  ) => {
    unstableCacheCalls.push({ keyParts, options })
    return fn
  },
  revalidateTag: vi.fn(),
}))

function disableSupabaseEnv() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
  vi.stubEnv("SUPABASE_SECRET_KEY", "")
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "")
}

async function loadService() {
  // 모듈 최상단에서 unstable_cache(...)를 한 번 호출해 캐시 래퍼를 구성하므로, keyParts/tags
  // 배선을 매 테스트 새로 관찰하려면 모듈을 다시 로드해야 한다(admin-crm-coverage-route 테스트와
  // 동일 패턴 — ESM 캐시라 재-import만으로는 재실행되지 않는다).
  vi.resetModules()
  unstableCacheCalls.length = 0
  return import("@/lib/chatbot/service")
}

describe("getChatbotStats cache wiring", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it("wraps the computation in a 60s unstable_cache tagged chatbot-stats", async () => {
    disableSupabaseEnv()
    await loadService()

    // 호출 "개수"가 아니라 chatbot-stats 엔트리 자체를 검사한다.
    // 예전에는 toHaveLength(1)로 고정했는데, service.ts 의 import 그래프에 다른 모듈의
    // unstable_cache 가 하나라도 들어오면(2026-09-10 알림 라우트 승격이 실제로 그랬다)
    // 배선이 멀쩡한데도 깨졌다 — 남의 캐시 추가를 이 파일의 회귀로 오진하게 만드는 계약이다.
    const chatbotStats = unstableCacheCalls.filter((call) =>
      call.keyParts.includes("chatbot-stats-v1")
    )
    expect(chatbotStats).toHaveLength(1)
    expect(chatbotStats[0].options).toEqual({ revalidate: 60, tags: ["chatbot-stats"] })
  })

  it("passes normalized from/to strings into the cached computation", async () => {
    disableSupabaseEnv()
    const { getChatbotStats } = await loadService()

    const stats = await getChatbotStats(
      new URLSearchParams({ from: "2026-08-01", to: "2026-08-31" })
    )

    expect(stats.range).toEqual({ from: "2026-08-01", to: "2026-08-31" })
    // Supabase 미설정 폴백 경로 — DB 없이도 from/to 가 그대로 계산부 인자로 전달됐는지 보여준다.
    expect(stats.warning).toContain("Supabase")
  })

  it("defaults the range and reports no upper bound when `to` is omitted", async () => {
    disableSupabaseEnv()
    const { getChatbotStats } = await loadService()

    const stats = await getChatbotStats(new URLSearchParams())

    expect(typeof stats.range.from).toBe("string")
    expect(stats.range.to).toBeNull()
  })
})
