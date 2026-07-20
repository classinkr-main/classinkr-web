import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  evaluateChatbotQuery: vi.fn(),
  listChatbotRegressionEvalCases: vi.fn(),
}))

vi.mock("@/lib/chatbot/service", () => ({
  evaluateChatbotQuery: mocks.evaluateChatbotQuery,
  listChatbotRegressionEvalCases: mocks.listChatbotRegressionEvalCases,
}))

import { runGoldenEval } from "@/lib/chatbot/eval"

function evaluatedResult(sources: Array<{ title: string; excerpt: string; urlPath: string }> = []) {
  return {
    answer: "Classin은 수업 운영 흐름을 연결합니다.",
    answerMode: "direct_answer",
    confidence: 0.9,
    needsHandoff: false,
    handoffIntent: "demo",
    sources,
    suggestedQuestions: [],
    unresolved: false,
    detectedCategory: "onboarding",
    detectedIntent: "onboarding",
  }
}

describe("chatbot golden eval safety gate", () => {
  beforeEach(() => {
    mocks.listChatbotRegressionEvalCases.mockResolvedValue([])
    mocks.evaluateChatbotQuery.mockResolvedValue(evaluatedResult())
    vi.stubEnv("GEMINI_API_KEY", "")
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it("marks an applicable case with no source as a failure and fails the gate", async () => {
    const report = await runGoldenEval({ judge: false, limit: 1 })

    expect(report.failures).toEqual([
      expect.objectContaining({
        id: "identity-academy-os",
        flags: expect.arrayContaining(["source:missing"]),
      }),
    ])
    expect(report.deterministic.sourceApplicable).toBe(1)
    expect(report.deterministic.withSources).toBe(0)
    expect(report.gate.passed).toBe(false)
    expect(report.gate.reasons).toContain("source_rate_below_threshold")
  })

  it("finishes the report with an explicit timeout failure when a case hangs", async () => {
    vi.useFakeTimers()
    vi.stubEnv("CHATBOT_EVAL_TIMEOUT_MS", "1000")
    mocks.evaluateChatbotQuery.mockImplementation(() => new Promise(() => {}))

    const reportPromise = runGoldenEval({ judge: false, limit: 1 })
    await vi.advanceTimersByTimeAsync(1_001)
    const report = await reportPromise

    expect(report.timedOutCases).toBe(1)
    expect(report.failures[0]?.flags).toContain("evaluation_timeout")
    expect(report.gate.passed).toBe(false)
    expect(report.gate.reasons).toContain("evaluation_timeout")
  })

  it("bounds a hanging judge call and exposes insufficient judge coverage", async () => {
    vi.useFakeTimers()
    vi.stubEnv("GEMINI_API_KEY", "test-key")
    vi.stubEnv("CHATBOT_EVAL_JUDGE_TIMEOUT_MS", "500")
    vi.stubEnv("CHATBOT_EVAL_TIMEOUT_MS", "5000")
    mocks.evaluateChatbotQuery.mockResolvedValue(
      evaluatedResult([
        {
          title: "수업 시스템 OS",
          excerpt: "Classin은 수업 운영 흐름을 연결합니다.",
          urlPath: "/docs/start/academy-system-os-positioning",
        },
      ])
    )
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})))

    const reportPromise = runGoldenEval({ judge: true, limit: 1 })
    await vi.advanceTimersByTimeAsync(501)
    const report = await reportPromise

    expect(report.judge).toMatchObject({
      enabled: true,
      applicable: 1,
      judged: 0,
      coverageRate: 0,
    })
    expect(report.gate.passed).toBe(false)
    expect(report.gate.reasons).toContain("judge_coverage_below_threshold")
  })
})
