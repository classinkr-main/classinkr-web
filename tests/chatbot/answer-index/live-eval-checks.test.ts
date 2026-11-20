import { describe, expect, it, vi } from "vitest"

import {
  answerDivergence,
  buildPreviousTurn,
  checkModelFreeRun,
  classifyBlockedGeminiCall,
  countAnswerModelCalls,
  decidedByFromAnswerIndex,
  deriveModelState,
  hasModelError,
  isTransientGeminiFailure,
  parseAnswerRouter,
  parseEvalCases,
  parseSimulateMode,
  runConversationTurns,
  simulateGeminiFetch,
  summarizeRows,
  turnRowId,
} from "@/scripts/lib/chatbot-live-eval-checks"

// 측정 스크립트(scripts/chatbot-live-eval.ts)의 판정 함수. 2026-11-19: --mode off 측정에서 임베딩 402·차단만 있던 줄을
// modelError 로 세어 holdout 묶음이 조기 중단됐다. 모델을 일부러 끈 줄은 modelError 가 아니어야 한다.

describe("modelError", () => {
  const enabled = { modelStagesEnabled: true, calls: [], blockedKinds: {} }

  it("답에 쓰이는 호출이 401·402·403 을 받으면 참", () => {
    for (const status of [401, 402, 403]) {
      expect(hasModelError({ ...enabled, calls: [{ kind: "generateContent", status }] })).toBe(true)
    }
  })

  it("차단기가 답에 쓰이는 호출을 막으면 참", () => {
    expect(hasModelError({ ...enabled, blockedKinds: { generateContent: 1 } })).toBe(true)
  })

  it("관문·두 번째 검색이 차단기 때문에 넘어갔으면(model_unavailable) 참", () => {
    expect(hasModelError({ ...enabled, skipReasons: [null, "model_unavailable"] })).toBe(true)
  })

  it("모델 단계를 모두 끈 측정은 호출이 실패·차단돼도 거짓", () => {
    expect(
      hasModelError({
        modelStagesEnabled: false,
        calls: [{ kind: "generateContent", status: 402 }],
        blockedKinds: { generateContent: 2 },
        skipReasons: ["model_unavailable"],
      })
    ).toBe(false)
  })

  it("임베딩만 402·차단된 줄은 거짓(벡터 검색이 없어 답이 같다)", () => {
    expect(
      hasModelError({ ...enabled, calls: [{ kind: "embedContent", status: 402 }], blockedKinds: { embedContent: 1 } })
    ).toBe(false)
  })

  it("고정 문구가 나갔어도 실패·차단 신호가 없으면 거짓(--mode off 의 off·llm_off 이유)", () => {
    expect(hasModelError({ ...enabled, skipReasons: ["off", "llm_off"] })).toBe(false)
    expect(hasModelError({ ...enabled, calls: [{ kind: "generateContent", status: 200 }] })).toBe(false)
  })

  it("429·5xx·네트워크 오류는 결제·인증 실패가 아니다", () => {
    expect(hasModelError({ ...enabled, calls: [{ kind: "generateContent", status: 429 }, { kind: "generateContent", status: 0 }] })).toBe(false)
  })
})

describe("호출 종류", () => {
  it("차단된 호출의 스택에 embedText 가 있으면 임베딩", () => {
    const stack = [
      "Error",
      "    at listener (/repo/scripts/chatbot-live-eval.ts:230:28)",
      "    at notifyModelCircuitBlocked (/repo/lib/chatbot/llm.ts:141:30)",
      "    at fetchGeminiThroughCircuit (/repo/lib/chatbot/llm.ts:171:7)",
      "    at embedText (/repo/lib/chatbot/llm.ts:1220:23)",
    ].join("\n")
    expect(classifyBlockedGeminiCall(stack)).toBe("embedContent")
    expect(classifyBlockedGeminiCall(stack.replace("embedText", "requestGeminiContent"))).toBe("generateContent")
    expect(classifyBlockedGeminiCall(undefined)).toBe("generateContent")
  })

  it("답에 쓰이는 호출 수는 임베딩을 뺀다", () => {
    expect(countAnswerModelCalls({ embedContent: 1, generateContent: 2 }, { embedContent: 3 })).toEqual({ calls: 2, blocked: 0 })
  })

  it("일시 오류 재시도는 답에 쓰이는 호출이 모두 429·5xx·0 일 때만", () => {
    expect(isTransientGeminiFailure([{ kind: "embedContent", status: 503 }])).toBe(false)
    expect(isTransientGeminiFailure([{ kind: "generateContent", status: 503 }, { kind: "embedContent", status: 200 }])).toBe(true)
    expect(isTransientGeminiFailure([{ kind: "generateContent", status: 503 }, { kind: "generateContent", status: 200 }])).toBe(false)
  })
})

describe("라우터", () => {
  it("legacy·shadow·compiled 만 받는다", () => {
    expect(parseAnswerRouter("compiled")).toBe("compiled")
    expect(parseAnswerRouter(" Shadow ")).toBe("shadow")
    expect(parseAnswerRouter("index")).toBeNull()
    expect(parseAnswerRouter(undefined)).toBeNull()
  })
})

describe("모델 없는 측정의 Gemini 호출 확인", () => {
  const clean = { geminiCalls: 0, geminiBlocked: 0, geminiKinds: {} }
  const embedded = { geminiCalls: 1, geminiBlocked: 0, geminiKinds: { embedContent: 1 } }
  const blocked = { geminiCalls: 0, geminiBlocked: 1, geminiKinds: {}, geminiBlockedKinds: { generateContent: 1 } }

  it("호출이 없으면 통과", () => {
    expect(checkModelFreeRun({ modelFree: true, router: "compiled", rows: [clean, clean] }).status).toBe("ok")
  })

  it("compiled 측정에 호출(차단 포함)이 있으면 무효", () => {
    const check = checkModelFreeRun({ modelFree: true, router: "compiled", rows: [clean, embedded, blocked] })
    expect(check).toEqual({ status: "invalid", rows: 2, kinds: { embedContent: 1, generateContent: 1 } })
  })

  it("legacy·shadow 측정은 경고와 줄 수만", () => {
    expect(checkModelFreeRun({ modelFree: true, router: "legacy", rows: [embedded] })).toMatchObject({ status: "warn", rows: 1 })
    expect(checkModelFreeRun({ modelFree: true, router: "shadow", rows: [embedded] })).toMatchObject({ status: "warn", rows: 1 })
  })

  it("모델을 켠 측정은 확인하지 않는다", () => {
    expect(checkModelFreeRun({ modelFree: false, router: "compiled", rows: [embedded] }).status).toBe("ok")
  })
})

describe("답 색인 흔적 → decidedBy", () => {
  const base = { version: "v1", router: "compiled", scope: "in", top: [{ id: "doc:/docs/a#1/x", s: 0.9, conf: 0.8 }], conf: 0.8 }

  it("결정별 값", () => {
    expect(decidedByFromAnswerIndex({ ...base, decision: "answer" })).toBe("index:doc:/docs/a#1/x")
    expect(decidedByFromAnswerIndex({ ...base, decision: "answer", partial: true })).toBe("index-partial:doc:/docs/a#1/x")
    expect(decidedByFromAnswerIndex({ ...base, decision: "gap", absentHit: "gap:trust/isms" })).toBe("index-gap:gap:trust/isms")
    expect(decidedByFromAnswerIndex({ ...base, decision: "gap", top: [{ id: "gap:support/phone-hours" }] })).toBe(
      "index-gap:gap:support/phone-hours"
    )
    expect(decidedByFromAnswerIndex({ ...base, decision: "abstain" })).toBe("index-abstain")
    expect(decidedByFromAnswerIndex({ ...base, decision: "clarify" })).toBe("index-clarify")
  })

  it("card·cardId 가 있으면 top 보다 먼저 쓴다", () => {
    expect(decidedByFromAnswerIndex({ ...base, decision: "answer", cardId: "fixed:basics-billing-unit" })).toBe(
      "index:fixed:basics-billing-unit"
    )
    expect(decidedByFromAnswerIndex({ ...base, decision: "gap", card: "gap:trust/security-certification", absentHit: "A_isms" })).toBe(
      "index-gap:gap:trust/security-certification"
    )
  })

  it("absentHit 가 없는 개념 id(A_*)면 공백 카드 id 로 쓰지 않는다", () => {
    expect(decidedByFromAnswerIndex({ ...base, decision: "gap", absentHit: "A_isms", top: [{ id: "gap:trust/isms" }] })).toBe(
      "index-gap:gap:trust/isms"
    )
  })

  it("꼬리 표시가 없으면 없는 개념 적중·일부 조각 답을 꼬리 붙은 답으로 본다", () => {
    expect(decidedByFromAnswerIndex({ ...base, decision: "answer", absentHit: "gap:trust/isms" })).toBe(
      "index-partial:doc:/docs/a#1/x"
    )
    expect(
      decidedByFromAnswerIndex({ ...base, decision: "answer", segments: [{ decision: "answer" }, { decision: "abstain" }] })
    ).toBe("index-partial:doc:/docs/a#1/x")
    expect(
      decidedByFromAnswerIndex({ ...base, decision: "answer", segments: [{ kind: "answer", card: "c1" }, { kind: "abstain", card: null }] })
    ).toBe("index-partial:doc:/docs/a#1/x")
    expect(decidedByFromAnswerIndex({ ...base, decision: "answer", absentTail: "A_isms" })).toBe("index-partial:doc:/docs/a#1/x")
    expect(decidedByFromAnswerIndex({ ...base, decision: "answer", segments: 2 })).toBe("index:doc:/docs/a#1/x")
    expect(decidedByFromAnswerIndex({ ...base, decision: "answer", absentHit: "gap:trust/isms", partial: false })).toBe(
      "index:doc:/docs/a#1/x"
    )
  })

  it("색인이 답을 정하지 않은 줄은 null(기존 decidedBy)", () => {
    expect(decidedByFromAnswerIndex(undefined)).toBeNull()
    expect(decidedByFromAnswerIndex({ ...base, decision: "answer", scope: "out" })).toBeNull()
    expect(decidedByFromAnswerIndex({ ...base, decision: "answer", router: "shadow" })).toBeNull()
    expect(decidedByFromAnswerIndex({ ...base, decision: "unknown" })).toBeNull()
  })
})

describe("대화 입력·첫 시도·반복·가짜 Gemini(U4)", () => {
  it("한 줄 질문과 대화 형식을 함께 읽고 잘못된 입력은 오류", () => {
    const cases = parseEvalCases({
      cases: [
        { id: "a", question: "질문 하나", group: "g" },
        { id: "b", turns: ["첫 턴", { question: "둘째 턴" }], pagePath: "/docs/x/y" },
        { question: "id 없음" },
      ],
    })
    expect(cases.map((item) => [item.id, item.conversation, item.turns.length])).toEqual([
      ["a", false, 1],
      ["b", true, 2],
      ["q003", false, 1],
    ])
    expect(cases[1].pagePath).toBe("/docs/x/y")
    expect(turnRowId(cases[0], 0)).toBe("a")
    expect(turnRowId(cases[1], 1)).toBe("b#t2")
    expect(() => parseEvalCases([{ id: "a", question: "x" }, { id: "a", question: "y" }])).toThrow(/중복/)
    expect(() => parseEvalCases([{ id: "a", turns: [] }])).toThrow(/turns/)
    expect(() => parseEvalCases([{ id: "a", turns: [""] }])).toThrow(/question/)
    expect(() => parseEvalCases("x")).toThrow()
  })

  it("previousTurn 은 질문을 200자로 자르고 askedSlot·answerMode 를 싣는다", () => {
    const turn = buildPreviousTurn("가".repeat(300), "답입니다", "draft", () => "device")
    expect(turn.question).toHaveLength(200)
    expect(turn).toMatchObject({ askedSlot: "device", answerMode: "draft" })
    expect(buildPreviousTurn("q", "답", null, () => null)).toEqual({ question: "q" })
  })

  it("가짜 evaluate 로 턴 순서와 previousTurn 전달을 본다", async () => {
    const seen: Array<{ question: string; previousTurn?: unknown; pagePath?: string }> = []
    const rows = await runConversationTurns({
      item: { turns: [{ question: "하나" }, { question: "둘" }, { question: "셋" }], pagePath: "/docs/a/b" },
      askedSlotOf: (answer) => (answer.includes("기기") ? "device" : null),
      runTurn: async (request, index) => {
        seen.push(request)
        return { answer: index === 1 ? null : `답${index} 기기`, answerMode: "draft", index }
      },
    })
    expect(rows.map((row) => row.index)).toEqual([0, 1, 2])
    expect(seen[0]).toEqual({ question: "하나", pagePath: "/docs/a/b" })
    expect(seen[1]).toEqual({
      question: "둘",
      previousTurn: { question: "하나", askedSlot: "device", answerMode: "draft" },
      pagePath: "/docs/a/b",
    })
    // 앞 턴이 답을 못 냈으면 previousTurn 을 넘기지 않는다.
    expect(seen[2].previousTurn).toBeUndefined()
  })

  it("한 줄 질문에는 previousTurn·pagePath 가 없다", async () => {
    const seen: unknown[] = []
    await runConversationTurns({
      item: { turns: [{ question: "q" }] },
      runTurn: async (request) => {
        seen.push(request)
        return { answer: "a", answerMode: null }
      },
    })
    expect(seen).toEqual([{ question: "q" }])
  })

  it("모델 상태: 보고값 우선, 없으면 호출 기록에서 가린다(임베딩 제외)", () => {
    expect(deriveModelState({ reported: "timeout", calls: [], blockedKinds: {} })).toBe("timeout")
    expect(deriveModelState({ reported: "weird", calls: [], blockedKinds: {} })).toBe("ok")
    expect(deriveModelState({ calls: [], blockedKinds: { generateContent: 1 } })).toBe("circuit_open")
    expect(deriveModelState({ calls: [{ kind: "generateContent", status: 0 }], blockedKinds: {} })).toBe("timeout")
    expect(deriveModelState({ calls: [{ kind: "generateContent", status: 429 }], blockedKinds: {} })).toBe("error")
    expect(deriveModelState({ calls: [{ kind: "embedContent", status: 402 }], blockedKinds: { embedContent: 2 } })).toBe("ok")
  })

  it("가짜 Gemini 는 실제 fetch 를 부르지 않고 402·429 응답, hang 은 중단 신호로 끝난다", async () => {
    const real = vi.fn()
    const original = globalThis.fetch
    globalThis.fetch = real as unknown as typeof fetch
    try {
      const url = "https://generativelanguage.googleapis.com/v1beta/models/x:generateContent"
      expect((await simulateGeminiFetch("402")(url)).status).toBe(402)
      expect((await simulateGeminiFetch("429")(url)).status).toBe(429)
      const controller = new AbortController()
      const pending = simulateGeminiFetch("hang")(url, { signal: controller.signal })
      controller.abort()
      await expect(pending).rejects.toMatchObject({ name: "AbortError" })
      await expect(simulateGeminiFetch("hang", { hangMs: 5 })(url)).rejects.toThrow()
      expect(real).not.toHaveBeenCalled()
    } finally {
      globalThis.fetch = original
    }
    expect(parseSimulateMode(" 402 ")).toBe("402")
    expect(parseSimulateMode("500")).toBeNull()
  })

  it("--repeat 답 갈림 비율은 반복이 둘 이상인 질문만 센다", () => {
    expect(
      answerDivergence([
        { key: "a", answer: "x" },
        { key: "a", answer: "x" },
        { key: "b", answer: "x" },
        { key: "b", answer: "y" },
        { key: "c", answer: "x" },
        { key: "d", answer: null },
        { key: "d", answer: "x" },
      ])
    ).toEqual({ groups: 3, diverged: 2, ratio: 0.667 })
    expect(answerDivergence([])).toEqual({ groups: 0, diverged: 0, ratio: 0 })
  })

  it("요약 비율: gate skipped·modelState·contextExpanded·첫 시도 기준", () => {
    const ratios = summarizeRows([
      { gate: "skipped", modelState: "ok", contextExpanded: true, firstAttempt: { decidedBy: "index:a", modelState: "ok" } },
      { gate: "kept", modelState: "ok", contextExpanded: false, firstAttempt: { decidedBy: "model_unavailable", modelState: "error" } },
      { gate: "none", modelState: "error", contextExpanded: null, firstAttempt: { decidedBy: "not_found", modelState: "timeout" } },
      { gate: null, modelState: "ok", contextExpanded: null, firstAttempt: null },
    ])
    expect(ratios.gateSkipped).toEqual({ count: 1, ratio: 0.25 })
    expect(ratios.modelState).toEqual({ ok: 3, error: 1 })
    expect(ratios.contextExpanded).toEqual({ count: 1, of: 2, ratio: 0.5 })
    expect(ratios.firstAttempt.decidedBy).toEqual({ "index": 1, model_unavailable: 1, not_found: 1 })
    expect(ratios.firstAttempt.modelNotOk).toEqual({ count: 2, ratio: 0.667 })
  })
})
