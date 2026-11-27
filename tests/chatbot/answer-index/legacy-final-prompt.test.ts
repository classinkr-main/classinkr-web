import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import { buildFinalAnswerPrompt, legacyMultiPromptEnabled, multiQuestionRequirement } from "@/lib/chatbot/llm"

import { legacyEquivalenceCases } from "./legacy-equivalence-lib"

/**
 * legacy 생성 지시문 바이트 고정(R2 검토 회귀-1). 기본 경로(legacy)의 생성 모드(CHATBOT_FINAL_ANSWER_LLM=generate)와 Claude 답 제공자가
 * 쓰는 buildFinalAnswerPrompt 는, 스위치 CHATBOT_LEGACY_MULTI_PROMPT 를 켜지 않으면 R2 이전(58e340270)과 글자까지 같아야 한다.
 * legacy 동등 시험(legacy-equivalence.test.ts)은 generateAnswer=false 답만 해시하므로 지시문 변화는 이 시험이 지킨다.
 *
 * 기준 파일(fixtures/legacy-final-prompt.json)은 58e340270 을 git archive 로 뽑은 트리에서 아래 hashOf 와 같은 계산으로 만들었다.
 * 지시문을 일부러 바꾼 커밋에서만 다시 만들고, 바뀐 이유를 커밋 메시지에 적는다.
 */

const FIXTURE = join(__dirname, "fixtures", "legacy-final-prompt.json")
const SOURCES = [{ title: "문서", heading: "절", urlPath: "/docs/x", category: "support", excerpt: "근거 글", score: 1 }]

function hashOf(question: string) {
  const prompts = (
    [
      ["direct_answer", SOURCES],
      ["fallback", []],
    ] as const
  ).map(([answerMode, sources]) =>
    buildFinalAnswerPrompt({ question, category: "support", intent: undefined, answerMode, draftAnswer: "초안", sources: [...sources] })
  )
  return createHash("sha256").update(prompts.join("\u0000")).digest("hex").slice(0, 16)
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("legacy final-answer prompt is byte-identical to R2 before (switch off)", () => {
  it("matches the 58e340270 hashes for every evaluation question when CHATBOT_LEGACY_MULTI_PROMPT is unset", () => {
    vi.stubEnv("CHATBOT_LEGACY_MULTI_PROMPT", undefined)
    const expected = (JSON.parse(readFileSync(FIXTURE, "utf8")) as { hashes: Record<string, string> }).hashes
    const cases = legacyEquivalenceCases()
    expect(cases.length).toBe(Object.keys(expected).length)
    const changed = cases.filter((item) => hashOf(item.question) !== expected[item.key]).map((item) => item.key)
    expect(changed).toEqual([])
  })

  it("adds no compound line by default, even for clearly separate questions", () => {
    vi.stubEnv("CHATBOT_LEGACY_MULTI_PROMPT", undefined)
    expect(legacyMultiPromptEnabled()).toBe(false)
    expect(multiQuestionRequirement("녹화는 어떻게 켜요? 출석은 어디서 봐요?")).toBeNull()
    const prompt = buildFinalAnswerPrompt({ question: "녹화는 어떻게 켜요? 출석은 어디서 봐요?", category: "support", answerMode: "direct_answer", draftAnswer: "초안", sources: [] })
    expect(prompt).not.toContain("질문 여러 개 주의")
  })
})

describe("legacy compound line behind CHATBOT_LEGACY_MULTI_PROMPT=on (conservative count)", () => {
  it("counts only question sentences and list items, never comma / '이랑' / '-하고' joins", () => {
    vi.stubEnv("CHATBOT_LEGACY_MULTI_PROMPT", "on")
    expect(multiQuestionRequirement("녹화는 어떻게 켜요? 출석은 어디서 봐요?")).toContain("물음이 2개")
    expect(multiQuestionRequirement("1. 화면 공유 방법\n2. 판서 저장 방법")).toContain("물음이 2개")
    // 긴 쉼표 단일 질문·비교·대상·동사 '-하고'·고르는 질문은 한 질문이다.
    for (const single of [
      "강사 한 명이, 오후 시간에, 반 두 개를 번갈아 가르칠 수 있나요?",
      "개인 레슨이랑 단체 수업 요금 차이 있어요?",
      "해외에 사는 학부모랑 상담 가능해요?",
      "가입하고 첫 결제까지 며칠 걸려요",
      "연간 계약인가요 월 계약인가요?",
    ]) {
      expect(multiQuestionRequirement(single), single).toBeNull()
    }
  })
})
