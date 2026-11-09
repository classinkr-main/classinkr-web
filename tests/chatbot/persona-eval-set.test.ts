import { readFileSync } from "node:fs"
import { join } from "node:path"

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { evaluateChatbotQuery } from "@/lib/chatbot/service"
import { detectConversationTone } from "@/lib/chatbot/tone"

/**
 * 페르소나 평가셋(10명 × 5회 × 6문항)의 결정 경로 회귀.
 * 답의 질은 사람 대신 두 심사관이 채점했다(docs/active/chatbot-cs-symptom-triage-2026-11-06.md).
 * 여기서는 그 루프에서 고친 것이 다시 깨지지 않는지만 본다.
 */

interface PersonaCase {
  id: string
  persona: string
  question: string
  intent: string
  must: string[]
  must_not: string[]
}

const evalSet = JSON.parse(readFileSync(join(process.cwd(), "data/chatbot-persona-eval-set.json"), "utf8")) as {
  personas: { id: string; gender: string }[]
  cases: PersonaCase[]
}

const answers = new Map<string, Awaited<ReturnType<typeof evaluateChatbotQuery>>>()

describe("persona eval set", () => {
  beforeAll(async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
    vi.stubEnv("SUPABASE_SECRET_KEY", "")
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "")
    vi.stubEnv("GEMINI_API_KEY", "")
    vi.spyOn(console, "warn").mockImplementation(() => {})
    for (const testCase of evalSet.cases) {
      answers.set(testCase.id, await evaluateChatbotQuery(testCase.question, { generateAnswer: false }))
    }
  }, 120_000)

  afterAll(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it("keeps unique cases (60 per round) from 10 personas balanced by gender", () => {
    const ids = evalSet.cases.map((testCase) => testCase.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.length).toBeGreaterThanOrEqual(300)
    expect(ids.length % 60).toBe(0)
    expect(evalSet.personas).toHaveLength(10)
    expect(evalSet.personas.filter((persona) => persona.gender === "여")).toHaveLength(5)
    expect(evalSet.personas.filter((persona) => persona.gender === "남")).toHaveLength(5)
  })

  it("never falls back to the generic 'tell me more' template or a raw doc suggestion", () => {
    const weak = evalSet.cases
      .filter((testCase) => ["fallback", "doc_suggestion"].includes(answers.get(testCase.id)?.answerMode ?? ""))
      .map((testCase) => `${testCase.id}: ${testCase.question}`)
    expect(weak).toEqual([])
  })

  it("does not repeat claims the judges found unsupported by the public guides", () => {
    for (const testCase of evalSet.cases) {
      const answer = answers.get(testCase.id)?.answer ?? ""
      expect(answer, testCase.id).not.toMatch(/카메라·마이크도 내장|한 번으로 셀 수|1:1 전담 전환/)
      if (!/다른\s*(?:기관|학원)/.test(testCase.question)) {
        expect(answer, testCase.id).not.toContain("이미 다른 기관 소속")
      }
    }
  })

  it("never asks users to type identifiers or payment details into the chat", () => {
    for (const testCase of evalSet.cases) {
      const answer = answers.get(testCase.id)?.answer ?? ""
      expect(answer, testCase.id).not.toMatch(
        /(?:아이디|전화번호|휴대폰\s*번호|비밀번호|시리얼|카드\s*번호|계좌)(?:와|과|를|을)?[^.\n]{0,20}(?:적어|입력해|남겨|보내)\s*주세요/
      )
    }
  })

  it("says it cannot see earlier chats instead of pretending to remember them", () => {
    const priorCases = evalSet.cases.filter((testCase) => detectConversationTone(testCase.question).priorContext)
    expect(priorCases.length).toBeGreaterThanOrEqual(8)
    for (const testCase of priorCases) {
      expect(answers.get(testCase.id)?.answer, testCase.id).toMatch(/볼 수 없/)
    }
  })

  it("leads with English when the question is mostly English", () => {
    const englishCases = evalSet.cases.filter((testCase) => detectConversationTone(testCase.question).english)
    expect(englishCases.length).toBeGreaterThan(0)
    for (const testCase of englishCases) {
      expect(answers.get(testCase.id)?.answer, testCase.id).toMatch(/^(?:In short:|I'll answer|Yes —)/)
    }
  })

  it("offers a human for angry or repeated complaints", () => {
    for (const testCase of evalSet.cases) {
      const tone = detectConversationTone(testCase.question)
      if (!tone.repeated) continue
      const result = answers.get(testCase.id)
      expect(result?.needsHandoff, testCase.id).toBe(true)
      expect(result?.answer, testCase.id).toMatch(/\[실시간 상담 연결\]/)
    }
  })

  it("answers both parts of explicitly two-part questions", () => {
    const twoPart = ["b5-P01-1", "b5-P03-1", "b5-P08-1"]
    for (const id of twoPart) {
      expect(answers.get(id)?.answer, id).toMatch(/함께 물어보신 내용|두 가지/)
    }
  })
})
