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

vi.mock("@/lib/internal-cs-chat/gemini", async () => {
  const actual = await vi.importActual<typeof import("@/lib/internal-cs-chat/gemini")>("@/lib/internal-cs-chat/gemini")
  return { ...actual, generateInternalCsAnswer: mocks.generateInternalCsAnswer }
})

vi.mock("@/lib/chatbot/topic-crosswalk", () => ({
  normalizeTopicTags: mocks.normalizeTopicTags,
}))

import {
  createDefaultRegressionEvalDeps,
  judgeRegression,
  referenceAnswerFor,
  regenerateForCandidate,
  resolveJudgeModel,
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
  it("uses a materially edited correction for changes_requested", () => {
    expect(referenceAnswerFor(candidate())).toBe("담당자 확정 답변")
  })
  // 기대값을 뒤집은 시험: 수정본 없이 승인된 행(원문 그대로 승인)은 이전에는 원문이 기준 답이었지만,
  // 사람이 쓴 정답이 아니므로(IC-19) 이제 기준에서 뺀다.
  it("does not use an approved answer without a correction as the reference", () => {
    expect(
      referenceAnswerFor(candidate({ correctedContent: null, reviewState: "approved" }))
    ).toBeNull()
  })
  it("uses an approved answer only when the correction differs from the original", () => {
    expect(referenceAnswerFor(candidate({ reviewState: "approved" }))).toBe("담당자 확정 답변")
    expect(
      referenceAnswerFor(candidate({ reviewState: "approved", correctedContent: " 원본   답변 " }))
    ).toBeNull()
  })
  it("excludes quick_approved rows even when the correction differs", () => {
    expect(
      referenceAnswerFor(candidate({ reviewState: "approved", feedbackLabels: ["quick_approved"] }))
    ).toBeNull()
  })
  it("returns null when changes_requested without a correction", () => {
    expect(
      referenceAnswerFor(candidate({ correctedContent: null, reviewState: "changes_requested" }))
    ).toBeNull()
  })
  it("returns null when changes_requested stores the unchanged model draft", () => {
    expect(
      referenceAnswerFor(candidate({ correctedContent: "  원본   답변  " }))
    ).toBeNull()
  })
  it("never treats a rejected answer as a gold reference", () => {
    expect(referenceAnswerFor(candidate({ reviewState: "rejected" }))).toBeNull()
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
    const load = vi.fn<(input: { messageIds?: string[]; limit: number }) => Promise<never[]>>(async () => [])
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
      comparedBlock: "full_answer",
      policyWarnings: [],
    })
    expect(result.items).toEqual([
      {
        messageId: "assistant-1",
        conversationId: "conversation-1",
        suggestedOutcome: "needs_fix",
        rationale: "사실 불일치",
        regeneratedExcerpt: "재생성",
        judgeModel: "judge-x",
        comparedBlock: "full_answer",
        policyWarnings: [],
      },
    ])
    expect(result.skipped).toEqual([])
  })

  it("compares only the customer draft block of the regenerated answer", async () => {
    const judge = vi.fn(async () => ({ outcome: "pass" as const, rationale: "일치", model: "judge-x" }))
    const answer = "## 바로 답변\n내부 분석 문장\n## 고객 전달 초안(검토 전)\n확인 후 안내드리겠습니다.\n## 확인 필요\n본사"
    const result = await runInternalCsRegressionEval(
      {},
      deps({ regenerate: vi.fn(async () => ({ question: "질문", answer, origin: "model" as const })), judge })
    )

    expect(judge).toHaveBeenCalledWith(
      expect.objectContaining({ regenerated: "확인 후 안내드리겠습니다.", comparedBlock: "customer_draft" })
    )
    expect(result.items[0]).toMatchObject({ comparedBlock: "customer_draft", regeneratedExcerpt: "확인 후 안내드리겠습니다." })
  })

  it("proposes needs_fix from the pre-check, without calling the judge, when the regenerated text leaks something the reference does not", async () => {
    const judge = vi.fn(async () => ({ outcome: "pass" as const, rationale: "-", model: "j" }))
    const result = await runInternalCsRegressionEval(
      {},
      deps({
        regenerate: vi.fn(async () => ({
          question: "질문",
          answer: "문자 원가는 건당 80원이고 테스트기관Z 사례와 같습니다.",
          origin: "model" as const,
          otherCustomerNames: ["테스트기관Z"],
          allowedNames: [],
        })),
        judge,
      })
    )

    expect(judge).not.toHaveBeenCalled()
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({ suggestedOutcome: "needs_fix", judgeModel: "answer-checks" })
    expect(result.items[0].policyWarnings).toEqual(expect.arrayContaining(["cost_price", "other_customer"]))
  })

  it("does not count a leak-class finding that the reference answer already contains", async () => {
    const judge = vi.fn(async () => ({ outcome: "pass" as const, rationale: "일치", model: "j" }))
    const result = await runInternalCsRegressionEval(
      {},
      deps({
        loadCandidates: vi.fn(async () => [candidate({ correctedContent: "원가 문서 기준으로 안내합니다." })]),
        regenerate: vi.fn(async () => ({ question: "질문", answer: "원가 문서 기준으로 안내합니다 (재생성).", origin: "model" as const })),
        judge,
      })
    )
    expect(judge).toHaveBeenCalledTimes(1)
    expect(result.items[0].policyWarnings).toEqual([])
  })

  it("records the judge's own skip reason (for example a model that is not allowed)", async () => {
    const result = await runInternalCsRegressionEval(
      {},
      deps({ judge: vi.fn(async () => ({ skipped: true as const, reason: "허용되지 않은 심판 모델" })) })
    )
    expect(result.items).toEqual([])
    expect(result.skipped).toEqual([{ messageId: "assistant-1", reason: "허용되지 않은 심판 모델" }])
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
    expect(result).toEqual({ question: "설치가 안 됩니다", answer: "새 초안", origin: "model", otherCustomerNames: [], allowedNames: [] })
  })

  it("adds approved image evidence to the regeneration and keeps only the current institution as allowed", async () => {
    mocks.getInternalCsConversation.mockResolvedValue({
      conversation: { tags: [], priority: "normal", customer_context: { 기관명: "테스트기관A" } },
      messages: [
        { id: "user-1", role: "user", content: "설치가 안 됩니다", review_state: "not_required" },
        { id: "assistant-1", role: "assistant", content: "원본", review_state: "changes_requested" },
      ],
      assets: [
        { id: "asset-1", original_file_name: "a.png", review_state: "approved", analysis_summary: "설치 오류 화면", analysis_payload: {}, corrected_analysis: null },
      ],
    })
    mocks.buildInternalCsCopilotContext.mockResolvedValue({
      internalContext: "[과거 상담 사례]\n   맥락: 기관 테스트기관Z / 유사도 0.80",
      sourceRefs: [],
      deterministicFallback: "폴백",
      publicEvidence: { answer: null, sources: [] },
      curatedEvidence: { entries: [], recommendedTags: [], reviewRequired: false, reviewReasons: [] },
    })

    const result = await regenerateForCandidate(candidate())

    const args = mocks.generateInternalCsAnswer.mock.calls[0][0]
    expect(args.internalContext).toContain("설치 오류 화면")
    expect(args.sourceRefs).toEqual([expect.objectContaining({ id: "internal-cs-asset:asset-1" })])
    expect(result.imageEvidence).toContain("설치 오류 화면")
    expect(result.allowedNames).toEqual(["테스트기관A"])
    expect(result.otherCustomerNames).toEqual(["테스트기관Z"])
  })

  it("takes other-customer names from the structured context list when the context text has no '기관' line", async () => {
    mocks.getInternalCsConversation.mockResolvedValue({
      conversation: { tags: [], priority: "normal", customer_context: null },
      messages: [
        { id: "user-1", role: "user", content: "설치가 안 됩니다", review_state: "not_required" },
        { id: "assistant-1", role: "assistant", content: "원본", review_state: "changes_requested" },
      ],
      assets: [],
    })
    mocks.buildInternalCsCopilotContext.mockResolvedValue({
      internalContext: "[과거 상담 사례]\n1. 설치 문의\n   맥락: 유사도 0.80",
      otherCustomerNames: ["테스트기관Z"],
      sourceRefs: [],
      deterministicFallback: "폴백",
      publicEvidence: { answer: null, sources: [] },
      curatedEvidence: { entries: [], recommendedTags: [], reviewRequired: false, reviewReasons: [] },
    })

    const result = await regenerateForCandidate(candidate())

    expect(result.otherCustomerNames).toEqual(["테스트기관Z"])
  })

  it("uses the history rules: quick-approved answers and rows before a reset boundary are not history", async () => {
    mocks.getInternalCsConversation.mockResolvedValue({
      conversation: { tags: [], priority: "normal" },
      messages: [
        { id: "old", role: "user", content: "경계 앞 질문", review_state: "not_required" },
        { id: "b", role: "system", content: "비움", review_state: "not_required", metadata: { kind: "copilot_context_reset" } },
        { id: "q0", role: "user", content: "경계 뒤 질문", review_state: "not_required" },
        { id: "qa", role: "assistant", content: "AI", review_state: "approved", corrected_content: "다른 승인 글", feedback_labels: ["quick_approved"] },
        { id: "user-1", role: "user", content: "설치가 안 됩니다", review_state: "not_required" },
        { id: "assistant-1", role: "assistant", content: "원본", review_state: "changes_requested" },
      ],
    })
    await regenerateForCandidate(candidate())
    expect(mocks.generateInternalCsAnswer.mock.calls[0][0].history).toEqual([
      { role: "user", text: "경계 뒤 질문" },
      { role: "user", text: "설치가 안 됩니다" },
    ])
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

  it("returns null without an API key (no fetch, no warn — 설정 상태는 조용히)", async () => {
    delete process.env.GEMINI_API_KEY
    const fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined)

    const verdict = await judgeRegression({ question: "q", reference: "r", regenerated: "g" })

    expect(verdict).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it("parses a pass/needs_fix verdict and embeds both answers in the prompt", async () => {
    process.env.GEMINI_API_KEY = "test-key"
    type FetchArgs = [url: string, init: { body: string; headers: Record<string, string>; signal?: AbortSignal }]
    const fetchSpy = vi.fn<(...args: FetchArgs) => Promise<{ ok: boolean; json: () => Promise<unknown> }>>(async () => ({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify({ outcome: "needs_fix", rationale: "가격 단정" }) }] } }],
      }),
    }))
    vi.stubGlobal("fetch", fetchSpy)

    const verdict = await judgeRegression({ question: "환불되나요", reference: "확인 필요", regenerated: "환불됩니다" })

    expect(verdict).toMatchObject({ outcome: "needs_fix", rationale: "가격 단정" })
    const sentBody = JSON.parse(fetchSpy.mock.calls[0][1].body)
    const promptText = sentBody.contents[0].parts[0].text
    expect(promptText).toContain("확인 필요")
    expect(promptText).toContain("환불됩니다")
    // 키는 URL 이 아니라 헤더로 전달한다.
    expect(fetchSpy.mock.calls[0][0]).not.toContain("test-key")
    expect(fetchSpy.mock.calls[0][1].headers["x-goog-api-key"]).toBe("test-key")
    // 심판 호출에는 8초 타임아웃 AbortSignal 이 걸린다 — abort 시 catch 경로로 skipped 처리.
    expect(fetchSpy.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
    // 지시에 유출·정책 항목이 있다.
    expect(sentBody.systemInstruction.parts[0].text).toContain("원가·공급가")
    expect(sentBody.systemInstruction.parts[0].text).toContain("다른 고객의 기관 이름")
  })

  it("puts the compared block kind, pre-check warnings and approved image evidence into the judge prompt", async () => {
    process.env.GEMINI_API_KEY = "test-key"
    const fetchSpy = vi.fn(async (...args: [string, { body: string }]) => ({
      ok: args.length > 0,
      json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ outcome: "pass", rationale: "ok" }) }] } }] }),
    }))
    vi.stubGlobal("fetch", fetchSpy)

    await judgeRegression({
      question: "q",
      reference: "r",
      regenerated: "g",
      comparedBlock: "customer_draft",
      policyWarnings: ["amount"],
      imageEvidence: "[Attached image 1: a.png]\nAnalysis summary: 설치 오류",
    })

    const prompt = JSON.parse(fetchSpy.mock.calls[0][1].body).contents[0].parts[0].text as string
    expect(prompt).toContain("재생성 글(고객 초안 블록")
    expect(prompt).toContain("사전 검사 경고(재생성 글에서 코드가 찾은 항목, 기준 답에 있던 것은 제외): amount")
    expect(prompt).toContain("첨부 이미지 근거(승인된 분석)")
    expect(prompt).toContain("설치 오류")
  })

  it("skips judging when INTERNAL_CS_JUDGE_MODEL is not an allowed model, without any request", async () => {
    process.env.GEMINI_API_KEY = "test-key"
    vi.stubEnv("INTERNAL_CS_JUDGE_MODEL", "gemini-9-unknown")
    const fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)

    const verdict = await judgeRegression({ question: "q", reference: "r", regenerated: "g" })

    expect(verdict).toEqual({ skipped: true, reason: expect.stringContaining("허용된 모델 목록에 없어") })
    expect(fetchSpy).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
  })

  it("uses an allowed INTERNAL_CS_JUDGE_MODEL and falls back to 3.5 Flash otherwise", () => {
    vi.stubEnv("INTERNAL_CS_JUDGE_MODEL", "gemini-3.1-flash-lite")
    expect(resolveJudgeModel()).toEqual({ model: "gemini-3.1-flash-lite" })
    vi.stubEnv("INTERNAL_CS_JUDGE_MODEL", "")
    vi.stubEnv("GEMINI_FAST_MODEL", "gemini-unlisted")
    expect(resolveJudgeModel()).toEqual({ model: "gemini-3.5-flash" })
    vi.unstubAllEnvs()
  })

  it("redacts PII from the question and both answers before calling the external judge", async () => {
    process.env.GEMINI_API_KEY = "test-key"
    const fetchSpy = vi.fn<(url: string, init: { body: string }) => Promise<unknown>>(async () => ({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify({ outcome: "pass", rationale: "정합" }) }] } }],
      }),
    }))
    vi.stubGlobal("fetch", fetchSpy)

    await judgeRegression({
      question: "010-1234-5678 고객 환불 문의",
      reference: "customer@example.com 으로 안내 완료",
      regenerated: "카드 4111 1111 1111 1111 확인 필요",
    })

    const promptText = JSON.parse(fetchSpy.mock.calls[0][1].body).contents[0].parts[0].text as string
    expect(promptText).toContain("[phone]")
    expect(promptText).toContain("[email]")
    expect(promptText).toContain("[payment_number]")
    expect(promptText).not.toContain("010-1234-5678")
    expect(promptText).not.toContain("customer@example.com")
    expect(promptText).not.toContain("4111 1111 1111 1111")
  })

  it("returns null on a non-ok response or unparseable body, warning with the failure detail", async () => {
    process.env.GEMINI_API_KEY = "test-key"
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined)

    // 실패 로그는 model-transport 가 요청당 한 번 console.error 로 남긴다(종류·상태·지연, 키·질문 없음).
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })))
    expect(await judgeRegression({ question: "q", reference: "r", regenerated: "g" })).toBeNull()
    expect(errorSpy).toHaveBeenLastCalledWith(expect.stringContaining("scope=judge"))
    expect(errorSpy).toHaveBeenLastCalledWith(expect.stringContaining("server/503"))

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{ text: "not json" }] } }] }),
      }))
    )
    expect(await judgeRegression({ question: "q", reference: "r", regenerated: "g" })).toBeNull()
    // JSON.parse throw → catch 경로: 에러 메시지를 포함해 경고한다.
    expect(warnSpy).toHaveBeenLastCalledWith(expect.stringContaining("심판 응답 해석 실패"))

    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down") }))
    expect(await judgeRegression({ question: "q", reference: "r", regenerated: "g" })).toBeNull()
    expect(errorSpy).toHaveBeenLastCalledWith(expect.stringContaining("server/"))
    expect(errorSpy.mock.calls.flat().map(String).join(" ")).not.toContain("test-key")

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: JSON.stringify({ outcome: "maybe", rationale: "?" }) }] } }],
        }),
      }))
    )
    expect(await judgeRegression({ question: "q", reference: "r", regenerated: "g" })).toBeNull()
    expect(warnSpy).toHaveBeenLastCalledWith(expect.stringContaining("파싱 불가"))
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
