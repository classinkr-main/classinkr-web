import { describe, expect, it } from "vitest"

import {
  checkModelFreeRun,
  classifyBlockedGeminiCall,
  countAnswerModelCalls,
  decidedByFromAnswerIndex,
  hasModelError,
  isTransientGeminiFailure,
  parseAnswerRouter,
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
