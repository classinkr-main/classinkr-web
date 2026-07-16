import { describe, expect, it, vi } from "vitest"

// 계약 1 계기판 조립기 — 순수 변환(빈 DB에서 null/0 shape, 분모 0 → rate null).
const mocks = vi.hoisted(() => ({
  getInternalCsMetricsAggregate: vi.fn(),
}))

vi.mock("@/lib/repositories/internal-cs-chat", async () => {
  const actual = await vi.importActual<typeof import("@/lib/repositories/internal-cs-chat")>(
    "@/lib/repositories/internal-cs-chat"
  )
  return { ...actual, getInternalCsMetricsAggregate: mocks.getInternalCsMetricsAggregate }
})

import { buildInternalCsMetrics, getInternalCsMetrics } from "@/lib/internal-cs-chat/metrics"
import { emptyInternalCsMetricsAggregate } from "@/lib/repositories/internal-cs-chat"

const NOW = Date.parse("2026-07-16T00:00:00.000Z")

describe("buildInternalCsMetrics", () => {
  it("renders a null/0 shape from an empty aggregate (분모 0 → rate null)", () => {
    const metrics = buildInternalCsMetrics(emptyInternalCsMetricsAggregate(7), NOW)

    expect(metrics).toEqual({
      range: {
        days: 7,
        from: "2026-07-09T00:00:00.000Z",
        to: "2026-07-16T00:00:00.000Z",
      },
      volume: { questions: 0, conversations: 0 },
      fallbackRate: null,
      evidenceMix: { knowledge: 0, docs: 0, channel: 0, none: 0 },
      review: { approved: 0, changesRequested: 0, pending: 0, approvalRate: null },
      regression: { notEvaluated: 0, pass: 0, needsFix: 0, promoted: 0, excluded: 0 },
      leadTimeHours: { median: null, p90: null },
    })
  })

  it("computes rates, evidence mix, and lead-time from a populated aggregate", () => {
    const metrics = buildInternalCsMetrics(
      {
        days: 30,
        questions: 40,
        conversations: 12,
        assistantTotal: 20,
        assistantDeterministic: 5,
        evidenceKnowledge: 6,
        evidenceDocs: 7,
        evidenceChannel: 2,
        evidenceNone: 5,
        reviewApproved: 9,
        reviewChangesRequested: 3,
        reviewPending: 8,
        regressionNotEvaluated: 4,
        regressionPass: 3,
        regressionNeedsFix: 2,
        regressionPromoted: 1,
        regressionExcluded: 1,
        leadTimeMedianHours: 2.345,
        leadTimeP90Hours: 9.6789,
      },
      NOW
    )

    expect(metrics.range).toEqual({
      days: 30,
      from: "2026-06-16T00:00:00.000Z",
      to: "2026-07-16T00:00:00.000Z",
    })
    expect(metrics.volume).toEqual({ questions: 40, conversations: 12 })
    // fallbackRate = deterministic / assistantTotal = 5/20
    expect(metrics.fallbackRate).toBe(0.25)
    expect(metrics.evidenceMix).toEqual({ knowledge: 6, docs: 7, channel: 2, none: 5 })
    // approvalRate = approved / (approved + changesRequested) = 9/12
    expect(metrics.review).toEqual({
      approved: 9,
      changesRequested: 3,
      pending: 8,
      approvalRate: 0.75,
    })
    expect(metrics.regression).toEqual({
      notEvaluated: 4,
      pass: 3,
      needsFix: 2,
      promoted: 1,
      excluded: 1,
    })
    // hours rounded to 2 decimals
    expect(metrics.leadTimeHours).toEqual({ median: 2.35, p90: 9.68 })
  })

  it("keeps approvalRate null when nothing has been decided", () => {
    const metrics = buildInternalCsMetrics(
      { ...emptyInternalCsMetricsAggregate(7), assistantTotal: 3, reviewPending: 3 },
      NOW
    )
    expect(metrics.review.approvalRate).toBeNull()
    // assistantTotal>0 but no deterministic → fallbackRate 0, not null
    expect(metrics.fallbackRate).toBe(0)
  })
})

describe("getInternalCsMetrics", () => {
  it("threads the repo aggregate through the builder", async () => {
    mocks.getInternalCsMetricsAggregate.mockResolvedValue(emptyInternalCsMetricsAggregate(30))

    const metrics = await getInternalCsMetrics(30, NOW)

    expect(mocks.getInternalCsMetricsAggregate).toHaveBeenCalledWith(30)
    expect(metrics.range.days).toBe(30)
    expect(metrics.fallbackRate).toBeNull()
  })
})
