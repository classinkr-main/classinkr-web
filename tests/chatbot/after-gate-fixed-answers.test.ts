import { readFileSync } from "node:fs"
import { join } from "node:path"

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { __clearAnswerGateCacheForTests } from "@/lib/chatbot/answer-gate"
import {
  __clearAnswerCacheForTests,
  evaluateChatbotQuery,
  GENERAL_CLARIFY_LEADS,
  MODEL_UNAVAILABLE_ANSWER,
  NO_SOURCE_FACT_ANSWER,
  POLICY_TOPIC_AFTER_GATE_ANSWER,
  streamChatbotQuery,
  SYMPTOM_AFTER_GATE_ANSWER,
  type ChatbotStreamEvent,
  type ChatbotStreamMeta,
} from "@/lib/chatbot/service"
import {
  answerGateResponse,
  evidenceSelectionResponse,
  isAnswerGateCall,
  isEvidenceSelectionCall,
  isOutlinePickCall,
  outlinePickResponse,
} from "./helpers/final-answer-llm"

// 관문이 정해 둔 답을 버리고(off_target) 문서에서도 답 문장을 못 고른 뒤에는 분류별 틀·되묻기 문구로 돌아가지 않는다
// (lib/chatbot/service.ts answerFromDocumentsAfterGate). 모델은 흉내 낸다.

function disableSupabase() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
  vi.stubEnv("SUPABASE_SECRET_KEY", "")
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "")
}

function stubModel(verdict: "answers" | "off_target" = "off_target") {
  const calls: string[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      if (isAnswerGateCall(init)) {
        calls.push("gate")
        return answerGateResponse(verdict)
      }
      if (isOutlinePickCall(init)) {
        calls.push("outline")
        return outlinePickResponse([])
      }
      if (isEvidenceSelectionCall(init)) {
        calls.push("selection")
        return evidenceSelectionResponse([])
      }
      calls.push("other")
      return { ok: true, status: 200, json: async () => ({}) }
    })
  )
  return { calls }
}

const head = (text: string) => text.split("\n\n")[0]
// 관문이 버린 뒤 문서 문장이 없을 때 나갈 수 있는 답(첫 문장). 모델 실패 문구는 선별 호출이 실패했을 때만 나간다.
const FIXED_HEADS = [
  head(NO_SOURCE_FACT_ANSWER),
  head(SYMPTOM_AFTER_GATE_ANSWER),
  head(POLICY_TOPIC_AFTER_GATE_ANSWER),
  head(MODEL_UNAVAILABLE_ANSWER),
  ...GENERAL_CLARIFY_LEADS,
]
// composeAnswer 의 분류별 되묻기·틀 문구(예전에 관문 뒤에 나가던 것).
const CATEGORY_TEMPLATE_LINES = [
  "지금 바로 확정하기 어려워요. 현재 상황을 한 문장만 더 알려주세요.",
  "계약, 결제, 장비 상태에 따라 달라질 수 있어 지금은 확정해서 말하기 어렵습니다.",
  "원인을 바로 단정하기보다 상황을 조금만 더 좁히는 게 좋겠습니다.",
  "상담이 필요한 내용으로 확인했습니다.",
  "무엇을 도와드릴까요?",
]

function loadQuestions(path: string) {
  const raw = JSON.parse(readFileSync(join(process.cwd(), path), "utf8")) as { cases: { id: string; question: string }[] }
  return raw.cases
}

// 세트에서 고르게 뽑는다(6개마다 하나).
const SAMPLE = [
  ...loadQuestions("data/chatbot-persona-eval-set.json"),
  ...loadQuestions("data/chatbot-first-contact-set.json"),
].filter((_, index) => index % 6 === 0)

describe("관문이 버린 뒤 문서 문장이 없으면 고정 문구만 낸다(성질 시험)", () => {
  beforeAll(() => {
    disableSupabase()
    vi.stubEnv("GEMINI_API_KEY", "test-key")
    vi.stubEnv("CHATBOT_ANSWER_GATE", "")
    vi.stubEnv("CHATBOT_FINAL_ANSWER_LLM", "")
    vi.stubEnv("CHATBOT_SECOND_CHANCE", "")
    vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.spyOn(console, "info").mockImplementation(() => {})
    stubModel("off_target")
  })

  afterAll(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it(`기준 묶음 표본 ${SAMPLE.length}문항: 관문을 탄 질문의 답은 정해진 고정 문구 가운데 하나다`, async () => {
    let rejected = 0
    const offenders: string[] = []
    for (const item of SAMPLE) {
      __clearAnswerCacheForTests()
      __clearAnswerGateCacheForTests()
      const result = await evaluateChatbotQuery(item.question)
      if (result.answerGate.gate !== "rejected") continue
      rejected += 1
      const fixed = FIXED_HEADS.some((line) => result.answer.includes(line))
      const template = CATEGORY_TEMPLATE_LINES.some((line) => result.answer.includes(line))
      if (!fixed || template || result.sources.length > 0 || !result.unresolved) {
        offenders.push(`${item.id}: ${result.answer.slice(0, 80)}`)
      }
    }
    // 표본의 대부분이 정해 둔 답이라 관문을 탄다(시험이 비어 있지 않은지 본다).
    expect(rejected).toBeGreaterThan(SAMPLE.length / 2)
    expect(offenders).toEqual([])
  }, 120_000)
})

async function collectStream(message: string) {
  const events: ChatbotStreamEvent[] = []
  await streamChatbotQuery({ message }, {}, (event) => events.push(event))
  const replaces = events.filter((event): event is { type: "replace"; answer: string } => event.type === "replace")
  const meta = events.find((event): event is { type: "meta"; meta: ChatbotStreamMeta } => event.type === "meta")?.meta
  return { answer: replaces.at(-1)?.answer ?? "", meta }
}

describe("관문 뒤 고정 문구 고르기", () => {
  beforeEach(() => {
    disableSupabase()
    vi.stubEnv("GEMINI_API_KEY", "test-key")
    vi.stubEnv("CHATBOT_ANSWER_GATE", "")
    vi.stubEnv("CHATBOT_FINAL_ANSWER_LLM", "")
    vi.stubEnv("CHATBOT_SECOND_CHANCE", "")
    __clearAnswerGateCacheForTests()
    __clearAnswerCacheForTests()
    vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.spyOn(console, "info").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("증상·고장 신고는 분류별 되묻기 대신 증상용 고정 문구와 상담 버튼(기술지원)을 낸다", async () => {
    for (const question of [
      "죄송한데요, 학생을 엑셀로 등록하려고 양식에 맞춰서 업로드했는데 '형식 오류'라고 뜨면서 등록이 안 됩니다. 제가 뭔가 잘못한 것 같은데 혹시 어떤 부분을 확인하면 될까요?",
      "PC 앱 v5.x에서 수업 입장 시 오류 코드 -1003이 뜹니다. 재설치해도 동일합니다. 이 코드 의미가 뭔가요?",
    ]) {
      stubModel("off_target")
      const result = await evaluateChatbotQuery(question)
      expect(result.answerGate.gate, question).toBe("rejected")
      expect(result.answer, question).toContain(head(SYMPTOM_AFTER_GATE_ANSWER))
      expect(result.answerMode, question).toBe("handoff")
      expect(result.needsHandoff, question).toBe(true)
      expect(result.handoffIntent, question).toBe("support")
      expect(result.unresolved, question).toBe(true)
      expect(result.sources, question).toHaveLength(0)
      for (const line of CATEGORY_TEMPLATE_LINES) expect(result.answer, question).not.toContain(line)
      // 못 찾았다고 밝힌 답에 '순서대로 알려 드릴게요' 같은 안내형 첫마디를 붙이지 않는다.
      expect(result.answer, question).not.toContain("순서대로 알려 드릴게요")
    }
  })

  it("버린 답이 증상 안내였으면 증상 표현이 없어도 증상용 고정 문구를 낸다", async () => {
    const question = "칠판 티비 밝기를 좀 줄이고 싶어요. 눈이 부셔서요. 리모컨에 버튼이 많은데 뭘 눌러야 하는지 모르겠어요."
    stubModel("off_target")
    const result = await evaluateChatbotQuery(question)
    expect(result.answerGate.gate).toBe("rejected")
    expect(result.answerGate.gateOriginal ?? "").toMatch(/^(?:symptom|guide):/)
    expect(result.answer).toContain(head(SYMPTOM_AFTER_GATE_ANSWER))
  })

  it("스트림 경로도 같은 고정 문구와 연결 표시를 낸다", async () => {
    const question = "PC 앱 v5.x에서 수업 입장 시 오류 코드 -1003이 뜹니다. 재설치해도 동일합니다. 이 코드 의미가 뭔가요?"
    stubModel("off_target")
    const stream = await collectStream(question)
    __clearAnswerCacheForTests()
    stubModel("off_target")
    const normal = await evaluateChatbotQuery(question)
    expect(stream.answer).toBe(normal.answer)
    expect(stream.meta?.needsHandoff).toBe(true)
    expect(stream.meta?.handoffIntent).toBe("support")
  })

  it("잡담에 공감으로 받아 주는 답(small_talk)은 관문을 거치지 않는다", async () => {
    const question = "수업 듣기싫다ㅋㅋ"
    const baseline = await evaluateChatbotQuery(question, { generateAnswer: false })
    const { calls } = stubModel("off_target")
    const result = await evaluateChatbotQuery(question)
    expect(calls).not.toContain("gate")
    expect(result.answerGate.gate).toBe("none")
    expect(result.answer).toBe(baseline.answer)
    expect(result.answer).toContain("그런 날도 있죠")
  })

  it("'~하기 싫은데 …할 수 있나요?' 꼴의 기능 질문은 잡담 공감 답이라도 관문을 거친다(일반·스트림)", async () => {
    for (const question of [
      "앱 설치하기 싫은데 웹으로 들어갈 수 있나요?",
      "매번 판서 다시 하기 싫은데 저장해서 다음 수업에 쓸 수 있나요?",
      "녹화하기 싫은데 자동 녹화 끄는 법 있나요",
    ]) {
      __clearAnswerCacheForTests()
      __clearAnswerGateCacheForTests()
      const stubbed = stubModel("off_target")
      const stream = await collectStream(question)
      expect(stubbed.calls, question).toContain("gate")
      expect(stream.answer, question).not.toContain("그런 날도 있죠")

      __clearAnswerCacheForTests()
      __clearAnswerGateCacheForTests()
      const { calls } = stubModel("off_target")
      const result = await evaluateChatbotQuery(question)
      expect(calls, question).toContain("gate")
      expect(result.answerGate.gate, question).toBe("rejected")
      expect(result.answerGate.gateOriginal, question).toBe("self:small_talk")
      expect(result.answer, question).not.toContain("그런 날도 있죠")
      expect(stream.answer, question).toBe(result.answer)
    }
  })

  it("사실을 전하는 자기소개 답(identity·privacy_boundary)은 계속 관문 대상이다", async () => {
    for (const question of ["너 누구야?", "챗봇 대화 내용 저장돼요?"]) {
      const { calls } = stubModel("answers")
      const result = await evaluateChatbotQuery(question)
      expect(result.answerGate.gateOriginal ?? "", question).toMatch(/^self:/)
      expect(calls, question).toContain("gate")
    }
  })
})
