import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// 품질 재시도(경고 3개 이상)는 첫 호출이 오래 걸렸다면 건너뛴다 — 라우트 maxDuration 안에 들어가기 위해.
vi.mock("server-only", () => ({}))
const callInsightModel = vi.hoisted(() => vi.fn())
const checkNumericalSanity = vi.hoisted(() => vi.fn())
vi.mock("@/lib/branch/read-dsh-kpi", () => ({ readDshPreferDb: vi.fn(async () => ({})), readKpiBlocksPreferDb: vi.fn(async () => ({ fy: {} })) }))
vi.mock("@/lib/repositories/branch-deals", () => ({ listBranchRevDeals: vi.fn(async () => []) }))
vi.mock("@/lib/repositories/public-events", () => ({ listPublicEvents: vi.fn(async () => []) }))
vi.mock("@/lib/branch/computations/campaigns", () => ({ summarizeCampaigns: vi.fn(async () => ({ recent: [] })) }))
vi.mock("@/lib/branch/insights/input-builder", () => ({ buildInsightInput: vi.fn(() => ({ fiscalPeriod: "Q" })), digestInput: vi.fn(() => "d") }))
vi.mock("@/lib/branch/insights/gemini-runner", () => ({ callInsightModel }))
vi.mock("@/lib/branch/insights/sanity-check", () => ({ checkNumericalSanity }))
vi.mock("@/lib/branch/fiscal", () => ({ fyOf: vi.fn(() => 2026) }))
vi.mock("@/lib/branch/weekly-report", () => ({ buildBranchWeeklyCompassReport: vi.fn(async () => null) }))
vi.mock("@/lib/repositories/branch-insights", () => ({
  findInsightByDigest: vi.fn(async () => null),
  getLatestInsight: vi.fn(async () => null),
  insertInsight: vi.fn(async (row: unknown) => row),
}))

import { runInsights } from "@/lib/branch/insights/runner"

const modelOut = { result: { one_liner: "x", next_actions: [] }, raw: {}, model: "m", provider: "claude" }
const warns = [1, 2, 3].map((n) => ({ n }))

beforeEach(() => {
  callInsightModel.mockReset()
  callInsightModel.mockResolvedValue(modelOut)
  checkNumericalSanity.mockReset()
  checkNumericalSanity.mockReturnValue(warns)
})
afterEach(() => vi.restoreAllMocks())

describe("runInsights 재시도 시간 예산", () => {
  it("첫 호출이 빠르면 경고 3개 이상에서 한 번 더 부른다", async () => {
    const out = await runInsights("ALL", false)
    expect(callInsightModel).toHaveBeenCalledTimes(2)
    expect(out.retried).toBe(true)
  })

  it("첫 호출이 60초를 넘겼으면 재시도하지 않는다", async () => {
    let t = 1_000_000
    vi.spyOn(Date, "now").mockImplementation(() => t)
    callInsightModel.mockImplementation(async () => { t += 90_000; return modelOut })
    const out = await runInsights("ALL", false)
    expect(callInsightModel).toHaveBeenCalledTimes(1)
    expect(out.retried).toBe(false)
  })
})
