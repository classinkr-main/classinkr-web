import { readFileSync } from "node:fs"
import { join } from "node:path"

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { evaluateChatbotQuery } from "@/lib/chatbot/service"

interface FreshOpenCase {
  id: string
  group: string
  question: string
}

const openSet = JSON.parse(readFileSync(join(process.cwd(), "data/chatbot-fresh-open-set.json"), "utf8")) as {
  cases: FreshOpenCase[]
}

type Answer = Awaited<ReturnType<typeof evaluateChatbotQuery>>

function disableExternalChatbotServices() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
  vi.stubEnv("SUPABASE_SECRET_KEY", "")
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "")
  vi.stubEnv("GEMINI_API_KEY", "")
}

// 일반 되묻기: 무엇을 묻는지 분명한 질문에 "상황을 한 가지 더 알려 달라"고 되묻는 답(lib/chatbot/service.ts 의 fallback 문구).
const GENERIC_CLARIFY_LEADS = [
  "어떤 상황인지 한 가지만 더 알려 주시면",
  "말씀하신 '그거'가 무엇인지",
  "현재 상황을 한 문장만 더 알려주세요",
  "원인을 바로 단정하기보다 상황을 조금만 더 좁히는 게",
  "지금은 확정해서 말하기 어렵습니다",
]

// 처음 보는 기본 질문 가운데 기본 사실 답이 아니라 문서 검색·못 찾음·다른 정해 둔 답이 맡는 질문.
// 2026-11-18 실측에서 이런 질문이 '상황을 한 문장 더 알려 달라'는 되묻기로 떨어졌다. 답 내용은 문서에 따라 바뀌므로
// 묶지 않고, 되묻기로 떨어지지 않는지만 본다. 기본 사실 답으로 가는 질문은 data/chatbot-first-contact-set.json 이 맡는다.
describe("fresh open questions", () => {
  const answers = new Map<string, Answer>()

  beforeAll(async () => {
    disableExternalChatbotServices()
    for (const testCase of openSet.cases) {
      answers.set(testCase.id, await evaluateChatbotQuery(testCase.question, { generateAnswer: false }))
    }
  }, 120_000)

  afterAll(() => {
    vi.unstubAllEnvs()
  })

  it("keeps the set well-formed", () => {
    const ids = openSet.cases.map((testCase) => testCase.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.length).toBeGreaterThanOrEqual(100)
    for (const testCase of openSet.cases) {
      expect(testCase.id, testCase.id).toMatch(/^fresh-[a-z]+-\d{2}$/)
      expect(testCase.question.trim().length, testCase.id).toBeGreaterThan(0)
    }
  })

  it("never falls back to the generic clarify question", () => {
    const clarified = openSet.cases
      .filter((testCase) => {
        const answer = answers.get(testCase.id)
        if (!answer) return true
        if (answer.answerMode === "clarifying_question") return true
        return GENERIC_CLARIFY_LEADS.some((lead) => answer.answer.includes(lead))
      })
      .map((testCase) => `${testCase.id}: ${testCase.question}`)
    expect(clarified).toEqual([])
  })

  it("always gives an answer", () => {
    for (const testCase of openSet.cases) {
      expect(answers.get(testCase.id)?.answer.trim().length ?? 0, testCase.id).toBeGreaterThan(0)
    }
  })
})
