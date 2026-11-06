import { readFileSync } from "node:fs"
import { join } from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import {
  evaluateChatbotQuery,
  streamChatbotQuery,
  type ChatbotStreamEvent,
} from "@/lib/chatbot/service"
import {
  SYMPTOM_TOPICS,
  buildSymptomTopicAnswer,
  findSymptomTopic,
  isVagueErrorQuestion,
  resolveSymptomTriage,
} from "@/lib/chatbot/symptom-triage"
import { listDocs } from "@/lib/docs"

interface SymptomCase {
  id: string
  set: string
  question: string
  expectPathAnyOf?: string[]
  expectMode?: string[]
  expectCategory?: string
  expectAnswerIncludes?: string[]
  expectAnswerExcludes?: string[]
}

const symptomCases = JSON.parse(
  readFileSync(join(process.cwd(), "data/chatbot-cs-symptom-set.json"), "utf8")
).cases as SymptomCase[]

function disableExternalChatbotServices() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
  vi.stubEnv("SUPABASE_SECRET_KEY", "")
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "")
  vi.stubEnv("GEMINI_API_KEY", "")
}

describe("CS symptom triage eval set", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it("keeps stable unique ids", () => {
    const ids = symptomCases.map((testCase) => testCase.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(symptomCases.length).toBeGreaterThanOrEqual(150)
  })

  it.each(symptomCases.map((testCase) => [testCase.id, testCase] as const))(
    "%s",
    async (_id, testCase) => {
      disableExternalChatbotServices()
      vi.spyOn(console, "warn").mockImplementation(() => {})

      const result = await evaluateChatbotQuery(testCase.question, { generateAnswer: false })
      const topPath = result.sources[0]?.urlPath ?? ""

      if (testCase.expectPathAnyOf) {
        expect(
          testCase.expectPathAnyOf.some((path) => topPath.includes(path)),
          `top source ${topPath || "(none)"} for "${testCase.question}"`
        ).toBe(true)
      }
      if (testCase.expectMode) expect(testCase.expectMode).toContain(result.answerMode)
      if (testCase.expectCategory) expect(result.detectedCategory).toBe(testCase.expectCategory)
      for (const text of testCase.expectAnswerIncludes ?? []) expect(result.answer).toContain(text)
      for (const text of testCase.expectAnswerExcludes ?? []) expect(result.answer).not.toContain(text)
    }
  )
})

describe("symptom topics stay wired to the public guides", () => {
  it("resolves every topic to an existing public doc section with steps", () => {
    const docs = listDocs()

    for (const topic of SYMPTOM_TOPICS) {
      const doc = docs.find(
        (candidate) => candidate.category === topic.doc.category && candidate.slug === topic.doc.slug
      )
      expect(doc, `${topic.id}: ${topic.doc.category}/${topic.doc.slug}`).toBeDefined()
      expect(doc?.visibility ?? "public").toBe("public")

      // 문서 섹션 제목을 바꾸면 여기서 깨진다 — symptom-triage.ts 의 heading 도 함께 고친다.
      for (const stepSource of topic.steps) {
        expect(
          doc?.sections.some((section) => section.heading === stepSource.heading),
          `${topic.id}: section "${stepSource.heading}"`
        ).toBe(true)
      }
      if (topic.heading) {
        expect(doc?.sections.some((section) => section.heading === topic.heading)).toBe(true)
      }

      const answer = buildSymptomTopicAnswer(topic)
      expect(answer, topic.id).not.toBeNull()
      expect(answer?.answer).toMatch(/^1\. /m)
      expect(answer?.suggestedQuestions.length).toBeGreaterThan(0)
    }
  })

  it("never asks users to type identifiers into the public chat", () => {
    for (const topic of SYMPTOM_TOPICS) {
      const answer = buildSymptomTopicAnswer(topic)?.answer ?? ""
      const closing = answer.split("\n\n").at(-1) ?? ""

      expect(closing, topic.id).not.toMatch(/아이디|연락처|전화번호|이메일|비밀번호|시리얼/)
      expect(answer, topic.id).not.toMatch(/https?:\/\/|\/docs\//)
      expect(answer, topic.id).not.toMatch(/(?:방법|순서)은\s*(?:아래|위)\s*'/)
    }
  })

  it("routes every suggested follow-up question to a usable answer", async () => {
    disableExternalChatbotServices()
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const suggestions = new Set(SYMPTOM_TOPICS.flatMap((topic) => topic.suggestedQuestions))

    for (const question of suggestions) {
      const result = await evaluateChatbotQuery(question, { generateAnswer: false })
      expect(["direct_answer", "clarifying_question"], question).toContain(result.answerMode)
    }
    vi.unstubAllEnvs()
  })
})

describe("symptom triage boundaries", () => {
  it("does not treat how-to, capability, or pricing questions as symptoms", () => {
    const questions = [
      "현장 녹화 카메라 설정 어떻게 해요?",
      "녹화본 다운로드 방법 알려줘",
      "끊김 없는 수업 가능해요?",
      "무료 체험판 있나요?",
      "카메라 몇 대까지 연결 가능해요?",
      "업데이트하면 뭐가 좋아지나요?",
      "클래스인 요금이 어떻게 되나요?",
      "학원 등록 서류는 교육청에 뭘 내야 하나요?",
    ]

    for (const question of questions) {
      expect(resolveSymptomTriage(question), question).toBeNull()
    }
  })

  it("answers a few how-to topics that the persona loop showed users ask as symptoms", () => {
    expect(resolveSymptomTriage("학생 계정은 어떻게 초대하나요?")?.topicId).toBe("invite-howto")
    expect(resolveSymptomTriage("아이가 놓친 수업 다시보기는 어디서 봐요?")?.topicId).toBe("replay-howto")
    expect(resolveSymptomTriage("그만둔 선생님 계정 빼는 법 알려줘요")?.topicId).toBe("teacher-leave")
  })

  it("asks for the error text when the question names no subject", () => {
    for (const question of ["에러나요", "오류가 떠요", "안 돼요", "선생님 안녕하세요 오류가 자꾸 나요", "error 떠요"]) {
      expect(isVagueErrorQuestion(question), question).toBe(true)
      expect(findSymptomTopic(question), question).toBeNull()
    }
    for (const question of ["에러 없이 잘 되나요?", "문제 은행 쓰는 법 알려줘", "전자칠판 화면이 안 켜져요"]) {
      expect(isVagueErrorQuestion(question), question).toBe(false)
    }
  })

  it("does not read the 보드 in 대시보드 as an electronic board", async () => {
    disableExternalChatbotServices()

    const result = await evaluateChatbotQuery("관리자 대시보드에 인증하라는 메시지가 계속 떠요", {
      generateAnswer: false,
    })

    expect(result.sources[0]?.urlPath).toBe("/docs/admin/account-verification")
    expect(result.answer).not.toContain("S75")
  })

  it("keeps the reviewed Figma known-intent guide ahead of triage, except where triage is more specific", async () => {
    disableExternalChatbotServices()

    const lateJoiner = await evaluateChatbotQuery("학생이 1강 다시보기가 안 뜬다고 합니다", { generateAnswer: false })
    expect(lateJoiner.sources[0]?.urlPath).toBe("/docs/admin/cs-figma-digest-1054")

    const localFile = await evaluateChatbotQuery("전자칠판 로컬 녹화 파일을 찾을 수 없어요", { generateAnswer: false })
    expect(localFile.sources[0]).toMatchObject({
      urlPath: "/docs/teacher/recording-troubleshooting",
      heading: "전자칠판 로컬 녹화 파일을 찾을 수 없을 때",
    })
  })
})

describe("symptom triage stream parity", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("streams the same deterministic answer without calling Supabase or Gemini", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "anon-key")
    vi.stubEnv("SUPABASE_SECRET_KEY", "service-key")
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key")
    vi.stubEnv("GEMINI_API_KEY", "gemini-key")
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("external fetch should not run"))

    for (const question of ["기관 등록 안됨", "에러나요", "녹화가 안 돼요"]) {
      const events: ChatbotStreamEvent[] = []
      await streamChatbotQuery({ message: question }, {}, (event) => events.push(event))
      const replace = [...events].reverse().find((event) => event.type === "replace")
      const meta = events.find((event) => event.type === "meta")
      const nonStream = await evaluateChatbotQuery(question)

      expect(events.some((event) => event.type === "delta"), question).toBe(false)
      expect(replace && replace.type === "replace" ? replace.answer : "").toBe(nonStream.answer)
      expect(meta && meta.type === "meta" ? meta.meta.answerMode : "").toBe(nonStream.answerMode)
      expect(meta && meta.type === "meta" ? meta.meta.handoffIntent : "").toBe("support")
    }

    // persistExchange 의 Supabase 기록 시도만 허용하고, 검색·생성 호출은 없어야 한다.
    const calledUrls = fetchMock.mock.calls.map(([input]) => String(input))
    expect(calledUrls.filter((url) => /generativelanguage|rpc\/match|docs_ai_chunks|docs_articles/.test(url))).toEqual([])
  })
})
