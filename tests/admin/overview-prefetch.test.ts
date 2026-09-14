/**
 * Overview 서버 프리페치(RSC)의 확장 계약 — 2026-09-10 어드민 속도 라운드(+스트리밍 전환).
 *
 * 지금까지 branch/summary·chatbot/stats 두 소스는 서버 프리페치가 없어 OverviewClient
 * 마운트 즉시 클라이언트에서 무조건 다시 페치됐다(감사 P1 — 첫 화면 동시 요청 팬아웃).
 * 이 테스트는 그 두 소스가 (1) leadOverview·osSummary와 같은 역할 게이트
 * (BRANCH_READ_ADMIN_API_ROLES)를 통과해야만 계산되고, (2) 화면이 실제로 읽는 필드만
 * 남기고 트림되며(leadActionKpis와 같은 원칙), (3) 라우트와 같은 고정 인자
 * (team=ALL·period=Y·오늘-6일)로 호출되는지를 고정한다.
 *
 * getVerifiedAdminContextForPage 이후의 역할 분기는 실제 상수(BRANCH_READ_ADMIN_API_ROLES·
 * CRM_STAFF_ADMIN_API_ROLES, lib/admin-auth.ts)로 검증한다 — VIEWER는 read는 되고 CRM
 * 스태프는 아니라서 두 그룹을 가르는 데 쓴다(crm-home-prefetch.test.ts와 같은 관례).
 *
 * 2026-09-10 2라운드(스트리밍 전환): prefetchOverviewInitialData()는 이제 값이 아니라
 * 소스마다 {promise, generatedAt}(DeferredPrefetch)을 돌려준다 — 이 파일의 모든 단언은
 * 먼저 각 `.promise`를 await한 뒤 그 settle된 값으로 검증한다. openPrefetchLane은
 * Promise.race([run(), ceilingTimer])라 vi.useFakeTimers() 아래서도 run()이 마이크로태스크로
 * 먼저 resolve되면 타이머를 기다릴 필요가 없다(tests/admin/prefetch-budget.test.ts와 같은
 * 패턴) — 그래도 레이스의 다른 쪽(ceiling)이 걸려 있는 동안 진짜 타이머가 하나 남으므로
 * afterEach에서 advance 정리 없이 vi.useRealTimers()로 넘어가도 안전하다(unref 없이도 각
 * it가 끝나면 promise 자체는 이미 settle된 뒤라 이후 남은 타이머는 no-op).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const getVerifiedAdminContextForPage = vi.fn()
const getCachedOverviewLeadSummary = vi.fn()
const getAdminVisitorStats = vi.fn()
const getLeadActionStats = vi.fn()
const getCachedOsSummary = vi.fn()
const buildBranchSummaryPayload = vi.fn()
const getChatbotStats = vi.fn()

vi.mock("@/lib/admin/page-auth", () => ({ getVerifiedAdminContextForPage }))
vi.mock("@/lib/admin/overview/lead-summary-cache", () => ({ getCachedOverviewLeadSummary }))
vi.mock("@/lib/admin-visitor-stats", () => ({ getAdminVisitorStats }))
vi.mock("@/lib/repositories/leads", () => ({ getLeadActionStats }))
vi.mock("@/lib/admin/overview/os-summary", () => ({ getCachedOsSummary }))
vi.mock("@/lib/branch/summary-payload", () => ({ buildBranchSummaryPayload }))
vi.mock("@/lib/chatbot/service", () => ({ getChatbotStats }))

const LEAD_OVERVIEW = { metrics: { newLeads: 1 } }
const VISITOR_STATS = { today: { homeVisitors: 5 } }
const LEAD_ACTIONS = { unrespondedCount: 3, unresponded24hCount: 1 }
const OS_SUMMARY = { renewal: { expiringSoonCount: 2 } }
// buildBranchSummaryPayload의 실제 반환값은 campaigns_recent·deal_mix·data_sources 등
// Overview가 전혀 읽지 않는 필드까지 포함한다 — 트림 검증을 위해 일부러 더 크게 만든다.
const BRANCH_SUMMARY_FULL = {
  team: "ALL",
  period: "Y",
  revenue: { confirmed: 100, goal: 200, pacing_pct: 50 },
  monthly_series: {
    months: ["2026-04"],
    goal_cum: [200],
    revenue_cum: [100],
    revenue_trend_cum: [150],
    confirmed_through_index: 0,
    events: [],
    deals: [],
    campaigns: [],
  },
  deal_mix: { by_category: [] },
  data_sources: { rev: { kind: "live" } },
  campaigns_recent: [{ id: "c1" }],
}
const CHATBOT_STATS_FULL = {
  range: { from: "2026-09-04", to: null },
  totals: { questionCount: 10, unresolvedCount: 2, handoffCount: 1, directAnswerCount: 7 },
  topQuestions: [{ clusterId: "x" }],
  latency: { avgMs: 120, p95Ms: 300, sampleCount: 5 },
}
const NOW = new Date("2026-09-10T00:00:00.000Z")

async function loadPrefetch() {
  const mod = await import("@/lib/admin/overview/prefetch")
  return mod.prefetchOverviewInitialData
}

// 레인 6개(생성 즉시 반환)를 전부 await하고 나서 값을 돌려준다 — vi.useFakeTimers() 아래서도
// run()이 이미 마이크로태스크로 resolve됐다면 advanceTimersByTimeAsync(0)만으로 충분히
// 플러시된다(ceiling 타이머는 15초라 손댈 필요 없다).
async function settleAll(prefetch: Awaited<ReturnType<typeof loadPrefetch>>) {
  const lanes = await prefetch()
  await vi.advanceTimersByTimeAsync(0)
  const [leadOverview, visitorStats, leadActionKpis, osSummary, branchSummary, chatbotStats] = await Promise.all([
    lanes.leadOverview.promise,
    lanes.visitorStats.promise,
    lanes.leadActionKpis.promise,
    lanes.osSummary.promise,
    lanes.branchSummary.promise,
    lanes.chatbotStats.promise,
  ])
  return { lanes, leadOverview, visitorStats, leadActionKpis, osSummary, branchSummary, chatbotStats }
}

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  vi.clearAllMocks()
  getCachedOverviewLeadSummary.mockResolvedValue(LEAD_OVERVIEW)
  getAdminVisitorStats.mockResolvedValue(VISITOR_STATS)
  getLeadActionStats.mockResolvedValue(LEAD_ACTIONS)
  getCachedOsSummary.mockResolvedValue(OS_SUMMARY)
  buildBranchSummaryPayload.mockResolvedValue(BRANCH_SUMMARY_FULL)
  getChatbotStats.mockResolvedValue(CHATBOT_STATS_FULL)
})

afterEach(() => {
  vi.useRealTimers()
})

describe("prefetchOverviewInitialData — 스트리밍 계약(레인 반환, await하지 않음)", () => {
  it("admin 검증만 await한다 — 반환된 레인 자체는 settle 여부와 무관하게 즉시 온다", async () => {
    // run()이 영원히 끝나지 않아도 prefetch() 호출 자체는 끝나야 한다(openPrefetchLane의
    // 핵심 속성 — TTFB를 소스에 종속시키지 않는다).
    getVerifiedAdminContextForPage.mockResolvedValue({ role: "SUPER_ADMIN", userId: "u1" })
    buildBranchSummaryPayload.mockImplementation(() => new Promise(() => {}))

    const prefetch = await loadPrefetch()
    const lanes = await prefetch()

    expect(lanes.branchSummary.promise).toBeInstanceOf(Promise)
    expect(typeof lanes.branchSummary.generatedAt).toBe("number")
  })

  it("컨텍스트가 없으면 여섯 소스 모두 즉시 null로 끝나는 레인이다", async () => {
    getVerifiedAdminContextForPage.mockResolvedValue(null)

    const prefetch = await loadPrefetch()
    const { leadOverview, visitorStats, leadActionKpis, osSummary, branchSummary, chatbotStats } =
      await settleAll(prefetch)

    expect(leadOverview).toBeNull()
    expect(visitorStats).toBeNull()
    expect(leadActionKpis).toBeNull()
    expect(osSummary).toBeNull()
    expect(branchSummary).toBeNull()
    expect(chatbotStats).toBeNull()
    expect(buildBranchSummaryPayload).not.toHaveBeenCalled()
    expect(getChatbotStats).not.toHaveBeenCalled()
    expect(getCachedOverviewLeadSummary).not.toHaveBeenCalled()
  })

  it("PARTNER(두 역할 목록 밖)면 여섯 소스 모두 null이다", async () => {
    getVerifiedAdminContextForPage.mockResolvedValue({ role: "PARTNER", userId: "u1" })

    const prefetch = await loadPrefetch()
    const { branchSummary, chatbotStats, leadOverview } = await settleAll(prefetch)

    expect(branchSummary).toBeNull()
    expect(chatbotStats).toBeNull()
    expect(leadOverview).toBeNull()
    expect(buildBranchSummaryPayload).not.toHaveBeenCalled()
    expect(getChatbotStats).not.toHaveBeenCalled()
  })

  it("VIEWER(read는 되지만 CRM 스태프는 아님)면 read 소스 넷은 채워지고 CRM 소스 둘은 null이다", async () => {
    getVerifiedAdminContextForPage.mockResolvedValue({ role: "VIEWER", userId: "u1" })

    const prefetch = await loadPrefetch()
    const { leadOverview, leadActionKpis, visitorStats, osSummary, branchSummary, chatbotStats } =
      await settleAll(prefetch)

    // CRM_STAFF 전용 — VIEWER는 여기 없다.
    expect(leadOverview).toBeNull()
    expect(leadActionKpis).toBeNull()
    // BRANCH_READ 전용 — VIEWER는 여기 있다.
    expect(visitorStats).toEqual(VISITOR_STATS)
    expect(osSummary).toEqual(OS_SUMMARY)
    expect(branchSummary).not.toBeNull()
    expect(chatbotStats).not.toBeNull()
  })

  it("라우트와 같은 고정 인자로 buildBranchSummaryPayload를 호출한다(team=ALL·period=Y·Drive 조회 스킵)", async () => {
    getVerifiedAdminContextForPage.mockResolvedValue({ role: "ADMIN", userId: "u1" })

    const prefetch = await loadPrefetch()
    await settleAll(prefetch)

    expect(buildBranchSummaryPayload).toHaveBeenCalledWith({
      team: "ALL",
      period: "Y",
      periodDate: NOW,
      includeBreakdown: false,
      overviewView: false,
      now: NOW,
      skipSheetFreshness: true,
    })
  })

  it("OverviewClient·AdminSidebar와 같은 7일 창(오늘-6일)으로 getChatbotStats를 호출한다", async () => {
    getVerifiedAdminContextForPage.mockResolvedValue({ role: "ADMIN", userId: "u1" })

    const prefetch = await loadPrefetch()
    await settleAll(prefetch)

    expect(getChatbotStats).toHaveBeenCalledTimes(1)
    const params = getChatbotStats.mock.calls[0][0] as URLSearchParams
    expect(params.get("from")).toBe("2026-09-04")
    expect(params.get("to")).toBeNull()
  })

  it("branchSummary는 revenue·monthly_series 세 배열만 남기고 나머지 필드는 RSC 페이로드에서 뺀다", async () => {
    getVerifiedAdminContextForPage.mockResolvedValue({ role: "ADMIN", userId: "u1" })

    const prefetch = await loadPrefetch()
    const { branchSummary } = await settleAll(prefetch)

    expect(branchSummary).toEqual({
      revenue: { confirmed: 100, goal: 200, pacing_pct: 50 },
      monthly_series: { goal_cum: [200], revenue_cum: [100], revenue_trend_cum: [150] },
    })
    expect(branchSummary).not.toHaveProperty("deal_mix")
    expect(branchSummary).not.toHaveProperty("data_sources")
    expect(branchSummary).not.toHaveProperty("campaigns_recent")
  })

  it("chatbotStats는 totals만 남기고 나머지 필드는 RSC 페이로드에서 뺀다", async () => {
    getVerifiedAdminContextForPage.mockResolvedValue({ role: "ADMIN", userId: "u1" })

    const prefetch = await loadPrefetch()
    const { chatbotStats } = await settleAll(prefetch)

    expect(chatbotStats).toEqual({
      totals: { questionCount: 10, unresolvedCount: 2, handoffCount: 1, directAnswerCount: 7 },
    })
    expect(chatbotStats).not.toHaveProperty("topQuestions")
    expect(chatbotStats).not.toHaveProperty("latency")
    expect(chatbotStats).not.toHaveProperty("range")
  })

  it("한 소스(branch)가 실패해도 chatbotStats 등 나머지는 살아남는다(소스별 독립 레인)", async () => {
    getVerifiedAdminContextForPage.mockResolvedValue({ role: "ADMIN", userId: "u1" })
    buildBranchSummaryPayload.mockRejectedValue(new Error("sheet down"))
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const prefetch = await loadPrefetch()
    const { branchSummary, chatbotStats, osSummary } = await settleAll(prefetch)

    expect(branchSummary).toBeNull()
    expect(chatbotStats).not.toBeNull()
    expect(osSummary).toEqual(OS_SUMMARY)
    errorSpy.mockRestore()
  })

  it("leadActionKpis는 unrespondedCount·unresponded24hCount 두 필드만 남긴다", async () => {
    getVerifiedAdminContextForPage.mockResolvedValue({ role: "ADMIN", userId: "u1" })
    getLeadActionStats.mockResolvedValue({
      unrespondedCount: 4,
      unresponded24hCount: 2,
      unresponded48hCount: 9,
      total: 100,
    })

    const prefetch = await loadPrefetch()
    const { leadActionKpis } = await settleAll(prefetch)

    expect(leadActionKpis).toEqual({ unrespondedCount: 4, unresponded24hCount: 2 })
  })
})
