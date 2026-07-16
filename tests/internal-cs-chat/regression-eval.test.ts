import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// 회귀 러너: 오케스트레이터는 순수 DI 로, 기본 배선(재생성/심판)은 mock 한 repo/context/gemini/fetch 로 검증한다.
// LLM 호출은 전부 mock 이며, 러너가 DB 변경 함수(update/review/create)를 절대 호출하지 않음을 단언한다.
const mocks = vi.hoisted(() => ({
  listInternalCsRegressionEvalCandidates: vi.fn(),
  getInternalCsConversation: vi.fn(),
  updateInternalCsRegressionOutcome: vi.fn(),
  reviewInternalCsMessage: vi.fn(),
  createInternalCsMessage: vi.fn(),
  buildInternalCsCopilotContext: vi.fn(),
  generateInternalCsAnswer: vi.fn(),
  normalizeTopicTags: vi.fn(() => ""),
}))

vi.mock("@/lib/repositories/internal-cs-chat", async () => {
  const actual = await vi.importActual<typeof import("@/lib/repositories/internal-cs-chat")>(
    "@/lib/repositories/internal-cs-chat"
  )
  return {
    ...actual,
    listInternalCsRegressionEvalCandidates: mocks.listInternalCsRegressionEvalCandidates,
    getInternalCsConversation: mocks.getInternalCsConversation,
    updateInternalCsRegressionOutcome: mocks.updateInternalCsRegressionOutcome,
    reviewInternalCsMessage: mocks.reviewInternalCsMessage,
    createInternalCsMessage: mocks.createInternalCsMessage,
  }
})

vi.mock("@/lib/internal-cs-chat/context", () => ({
  buildInternalCsCopilotContext: mocks.buildInternalCsCopilotContext,
}))

vi.mock("@/lib/internal-cs-chat/gemini", () => ({
  generateInternalCsAnswer: mocks.generateInternalCsAnswer,
}))

vi.mock("@/lib/chatbot/topic-crosswalk", () => ({
  normalizeTopicTags: mocks.normalizeTopicTags,
}))

import {
  createDefaultRegressionEvalDeps,
  judgeRegression,
  referenceAnswerFor,
  regenerateForCandidate,
  runInternalCsRegressionEval,
  type RegressionEvalDeps,
} from "@/lib/internal-cs-chat/regression-eval"

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    messageId: "assistant-1",
    conversationId: "conversation-1",
    content: "원본 답변",
    correctedContent: "담당자 확정 답변",
    reviewState: "changes_requested" as const,
    metadata: { userMessageId: "user-1" },
    ...overrides,
  }
}

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe("referenceAnswerFor", () => {
  it("prefers corrected_content", () => {
    expect(referenceAnswerFor(candidate())).toBe("담당자 확정 답변")
  })
  it("falls back to content only when approved", () => {
    expect(
      referenceAnswerFor(candidate({ correctedContent: null, reviewState: "approved" }))
    ).toBe("원본 답변")
  })
  it("returns null when changes_requested without a correction", () => {
    expect(
      referenceAnswerFor(candidate({ correctedContent: null, reviewState: "changes_requested" }))
    ).toBeNull()
  })
})

describe("runInternalCsRegressionEval (orchestrator, injected deps)", () => {
  function deps(overrides: Partial<RegressionEvalDeps> = {}): RegressionEvalDeps {
    return {
      loadCandidates: vi.fn(async () => [candidate()]),
      regenerate: vi.fn(async () => ({ question: "질문", answer: "재생성", origin: "model" as const })),
      judge: vi.fn(async () => ({ outcome: "pass" as const, rationale: "일치", model: "judge-x" })),
      ...overrides,
    }
  }

  it("clamps limit into [1, 10] with a default of 5", async () => {
    const load = vi.fn(async (_input: { messageIds?: string[]; limit: number }) => [])
    await runInternalCsRegressionEval({ limit: 50 }, deps({ loadCandidates: load }))
    await runInternalCsRegressionEval({}, deps({ loadCandidates: load }))
    await runInternalCsRegressionEval({ limit: 0 }, deps({ loadCandidates: load }))
    await runInternalCsRegressionEval({ limit: 3 }, deps({ loadCandidates: load }))

    expect(load.mock.calls.map((call) => call[0].limit)).toEqual([10, 5, 5, 3])
  })

  it("builds a contract item and uses corrected_content as the judge reference", async () => {
    const judge = vi.fn(async () => ({ outcome: "needs_fix" as const, rationale: "사실 불일치", model: "judge-x" }))
    const result = await runInternalCsRegressionEval({}, deps({ judge }))

    expect(judge).toHaveBeenCalledWith({
      question: "질문",
      reference: "담당자 확정 답변",
      regenerated: "재생성",
    })
    expect(result.items).toEqual([
      {
        messageId: "assistant-1",
        conversationId: "conversation-1",
        suggestedOutcome: "needs_fix",
        rationale: "사실 불일치",
        regeneratedExcerpt: "재생성",
        judgeModel: "judge-x",
      },
    ])
    expect(result.skipped).toEqual([])
  })

  it("skips candidates without a usable reference before spending a regeneration", async () => {
    const regenerate = vi.fn(async () => ({ question: "q", answer: "a", origin: "model" as const }))
    const result = await runInternalCsRegressionEval(
      {},
      deps({
        loadCandidates: vi.fn(async () => [
          candidate({ correctedContent: null, reviewState: "changes_requested" }),
        ]),
        regenerate,
      })
    )

    expect(regenerate).not.toHaveBeenCalled()
    expect(result.items).toEqual([])
    expect(result.skipped).toEqual([
      { messageId: "assistant-1", reason: expect.stringContaining("기준 정답") },
    ])
  })

  it("skips deterministic fallbacks and empty regenerations without judging", async () => {
    const judge = vi.fn(async () => ({ outcome: "pass" as const, rationale: "-", model: "j" }))
    const result = await runInternalCsRegressionEval(
      {},
      deps({
        loadCandidates: vi.fn(async () => [
          candidate({ messageId: "det" }),
          candidate({ messageId: "empty" }),
        ]),
        regenerate: vi.fn(async (c) =>
          c.messageId === "det"
            ? { question: "q", answer: "폴백", origin: "deterministic" as const }
            : { question: "q", answer: "   ", origin: "model" as const }
        ),
        judge,
      })
    )

    expect(judge).not.toHaveBeenCalled()
    expect(result.items).toEqual([])
    expect(result.skipped.map((entry) => entry.messageId)).toEqual(["det", "empty"])
  })

  it("isolates per-item failures so one crash does not kill the batch", async () => {
    const result = await runInternalCsRegressionEval(
      {},
      deps({
        loadCandidates: vi.fn(async () => [candidate({ messageId: "boom" }), candidate({ messageId: "ok" })]),
        regenerate: vi.fn(async (c) => {
          if (c.messageId === "boom") throw new Error("재생성 폭발")
          return { question: "q", answer: "정상", origin: "model" as const }
        }),
      })
    )

    expect(result.skipped).toEqual([{ messageId: "boom", reason: "재생성 폭발" }])
    expect(result.items.map((item) => item.messageId)).toEqual(["ok"])
  })

  it("records a skip reason when the judge cannot be reached", async () => {
    const result = await runInternalCsRegressionEval({}, deps({ judge: vi.fn(async () => null) }))
    expect(result.items).toEqual([])
    expect(result.skipped).toEqual([
      { messageId: "assistant-1", reason: expect.stringContaining("심판") },
    ])
  })
})

describe("regenerateForCandidate (default wiring)", () => {
  beforeEach(() => {
    mocks.getInternalCsConversation.mockResolvedValue({
      conversation: { tags: ["area:software"], priority: "urgent" },
      messages: [
        { id: "user-1", role: "user", content: "설치가 안 됩니다", review_state: "not_required" },
        { id: "assistant-1", role: "assistant", content: "원본", review_state: "changes_requested" },
      ],
    })
    mocks.buildInternalCsCopilotContext.mockResolvedValue({
      internalContext: "내부 컨텍스트",
      sourceRefs: [{ id: "docs/x", kind: "public_doc" }],
      deterministicFallback: "폴백 초안",
      publicEvidence: { answer: null, sources: [] },
      curatedEvidence: { entries: [], recommendedTags: ["intent:howto"], reviewRequired: true, reviewReasons: [] },
    })
    mocks.generateInternalCsAnswer.mockResolvedValue({ answer: "새 초안", origin: "model", model: "gemini-x" })
  })

  it("resolves the original question via metadata.userMessageId and reuses the copilot context with internal docs", async () => {
    const result = await regenerateForCandidate(candidate())

    expect(mocks.buildInternalCsCopilotContext).toHaveBeenCalledWith("설치가 안 됩니다", {
      queueTags: ["area:software"],
      includeInternalDocs: true,
    })
    const generateArgs = mocks.generateInternalCsAnswer.mock.calls[0][0]
    expect(generateArgs.question).toBe("설치가 안 됩니다")
    // urgent 우선순위 → riskLevel high, curatedEvidence.reviewRequired → requiresEvidenceReview true
    expect(generateArgs.riskLevel).toBe("high")
    expect(generateArgs.requiresEvidenceReview).toBe(true)
    expect(generateArgs.sourceRefs).toEqual([{ id: "docs/x", kind: "public_doc" }])
    expect(generateArgs.deterministicFallback).toBe("폴백 초안")
    expect(result).toEqual({ question: "설치가 안 됩니다", answer: "새 초안", origin: "model" })
  })

  it("throws a specific reason when the conversation is gone", async () => {
    mocks.getInternalCsConversation.mockResolvedValue(null)
    await expect(regenerateForCandidate(candidate())).rejects.toThrow("대화를 찾을 수 없습니다")
  })
})

describe("judgeRegression", () => {
  const originalKey = process.env.GEMINI_API_KEY

  afterEach(() => {
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY
    else process.env.GEMINI_API_KEY = originalKey
    vi.unstubAllGlobals()
  })

  it("returns null without an API key (no fetch)", async () => {
    delete process.env.GEMINI_API_KEY
    const fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)

    const verdict = await judgeRegression({ question: "q", reference: "r", regenerated: "g" })

    expect(verdict).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("parses a pass/needs_fix verdict and embeds both answers in the prompt", async () => {
    process.env.GEMINI_API_KEY = "test-key"
    const fetchSpy = vi.fn(async (_url: string, _init: { body: string; headers: Record<string, string> }) => ({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify({ outcome: "needs_fix", rationale: "가격 단정" }) }] } }],
      }),
    }))
    vi.stubGlobal("fetch", fetchSpy)

    const verdict = await judgeRegression({ question: "환불되나요", reference: "확인 필요", regenerated: "환불됩니다" })

    expect(verdict?.outcome).toBe("needs_fix")
    expect(verdict?.rationale).toBe("가격 단정")
    const sentBody = JSON.parse(fetchSpy.mock.calls[0][1].body)
    const promptText = sentBody.contents[0].parts[0].text
    expect(promptText).toContain("확인 필요")
    expect(promptText).toContain("환불됩니다")
    // 키는 URL 이 아니라 헤더로 전달한다.
    expect(fetchSpy.mock.calls[0][0]).not.toContain("test-key")
    expect(fetchSpy.mock.calls[0][1].headers["x-goog-api-key"]).toBe("test-key")
  })

  it("returns null on a non-ok response or unparseable body", async () => {
    process.env.GEMINI_API_KEY = "test-key"
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) })))
    expect(await judgeRegression({ question: "q", reference: "r", regenerated: "g" })).toBeNull()

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{ text: "not json" }] } }] }),
      }))
    )
    expect(await judgeRegression({ question: "q", reference: "r", regenerated: "g" })).toBeNull()
  })
})

describe("DB immutability (default deps wiring)", () => {
  it("evaluates a candidate end-to-end without calling any mutation repository function", async () => {
    process.env.GEMINI_API_KEY = "test-key"
    mocks.listInternalCsRegressionEvalCandidates.mockResolvedValue([candidate()])
    mocks.getInternalCsConversation.mockResolvedValue({
      conversation: { tags: [], priority: "normal" },
      messages: [
        { id: "user-1", role: "user", content: "질문 본문", review_state: "not_required" },
        { id: "assistant-1", role: "assistant", content: "원본", review_state: "changes_requested" },
      ],
    })
    mocks.buildInternalCsCopilotContext.mockResolvedValue({
      internalContext: "ctx",
      sourceRefs: [],
      deterministicFallback: "fb",
      publicEvidence: { answer: null, sources: [] },
      curatedEvidence: { entries: [], recommendedTags: [], reviewRequired: false, reviewReasons: [] },
    })
    mocks.generateInternalCsAnswer.mockResolvedValue({ answer: "재생성 답변", origin: "model", model: "g" })
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: JSON.stringify({ outcome: "pass", rationale: "일치" }) }] } }],
        }),
      }))
    )

    const result = await runInternalCsRegressionEval({}, createDefaultRegressionEvalDeps())

    expect(result.items).toHaveLength(1)
    expect(result.items[0].suggestedOutcome).toBe("pass")
    expect(mocks.listInternalCsRegressionEvalCandidates).toHaveBeenCalledWith({
      messageIds: undefined,
      limit: 5,
    })
    // 핵심 불변식: 러너는 어떤 판정/검토/메시지 쓰기도 하지 않는다.
    expect(mocks.updateInternalCsRegressionOutcome).not.toHaveBeenCalled()
    expect(mocks.reviewInternalCsMessage).not.toHaveBeenCalled()
    expect(mocks.createInternalCsMessage).not.toHaveBeenCalled()

    vi.unstubAllGlobals()
    delete process.env.GEMINI_API_KEY
  })
})
