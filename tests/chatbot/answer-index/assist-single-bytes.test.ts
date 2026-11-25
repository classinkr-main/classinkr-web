import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { __setRouterAnswerIndexForTests, resetRouterAnswerIndex } from "@/lib/chatbot/answer-index"
import { ANSWER_CARD_PICK_INSTRUCTION } from "@/lib/chatbot/answer-index/assist"
import { buildClaudeCardPickRequest } from "@/lib/chatbot/claude/card-pick"
import { __resetModelCircuitForTests } from "@/lib/chatbot/llm"
import { __clearAnswerCacheForTests, evaluateChatbotQuery } from "@/lib/chatbot/service"

import { compileFixture, FIXTURE_DIR } from "./index-fixture"

/**
 * 단일 질문 고르기 요청의 바이트 고정(R2 B3). 복합 질문 고르기({"picks": […]})와 지시문 새 판(CHATBOT_ASSIST_PICK_PROMPT=v2)을 더해도
 * 기본(옛 판) 단일 질문의 지시문·입력·Gemini 요청 본문·Claude 요청 본문은 B3 전과 글자까지 같아야 한다(대역 추정·하이쿠 고름 재현 보존).
 * fixtures/assist-single-request-v1.json 은 B3 전 코드로 만들었다. 다시 만들기(단일 요청을 일부러 바꾼 커밋에서만):
 *   ANSWER_INDEX_WRITE_ASSIST_SINGLE_BYTES=1 npx vitest run tests/chatbot/answer-index/assist-single-bytes.test.ts
 */

const FILE = join(FIXTURE_DIR, "..", "assist-single-request-v1.json")
const WRITE = process.env.ANSWER_INDEX_WRITE_ASSIST_SINGLE_BYTES === "1"
const QUESTIONS = ["녹화 영상 다시보기 어디서 봐요", "수업 중 학생 채팅 막을 수 있나요?", "학생 강퇴는 어떻게 해요"]
const CLAUDE_MODELS = ["claude-haiku-5-5", "claude-sonnet-5-5"]

interface BytesFile {
  _comment: string
  instruction: string
  requests: { question: string; url: string; body: string; claude: Record<string, string> }[]
}

const bodies: { url: string; body: string }[] = []
const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  bodies.push({ url, body: String(init?.body ?? "") })
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"pick": 1}' }] }, finishReason: "STOP" }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
})

function stubEnv() {
  vi.stubEnv("GEMINI_API_KEY", "test-model-key")
  vi.stubEnv("CHATBOT_GEMINI_PROVIDER", "developer")
  vi.stubEnv("GEMINI_FAST_MODEL", "")
  vi.stubEnv("GEMINI_REASONING_MODEL", "")
  vi.stubEnv("GEMINI_MODEL", "")
  vi.stubEnv("ANSWER_INDEX_DATA_DIR", undefined)
  vi.stubEnv("CHATBOT_ANSWER_ROUTER", "compiled")
  vi.stubEnv("CHATBOT_ANSWER_ASSIST", "always")
  vi.stubEnv("CHATBOT_ASSIST_TIMEOUT_MS", undefined)
  vi.stubEnv("CHATBOT_ASSIST_PICK_PROVIDER", undefined)
  vi.stubEnv("CHATBOT_ASSIST_PICK_MODEL", undefined)
  vi.stubEnv("CHATBOT_ASSIST_PICK_PROMPT", undefined)
  vi.stubEnv("CHATBOT_ASSIST_CANDIDATES", undefined)
}

async function capture(): Promise<BytesFile["requests"]> {
  const out: BytesFile["requests"] = []
  for (const question of QUESTIONS) {
    bodies.length = 0
    __clearAnswerCacheForTests()
    await evaluateChatbotQuery(question)
    expect(bodies, question).toHaveLength(1)
    const parsed = JSON.parse(bodies[0].body) as { systemInstruction: { parts: { text: string }[] }; contents: { parts: { text: string }[] }[] }
    const instruction = parsed.systemInstruction.parts[0].text
    const input = parsed.contents[0].parts[0].text
    const claude: Record<string, string> = {}
    for (const model of CLAUDE_MODELS) claude[model] = JSON.stringify(buildClaudeCardPickRequest({ instruction, input, model }))
    out.push({ question, url: bodies[0].url, body: bodies[0].body, claude })
  }
  return out
}

beforeAll(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "info").mockImplementation(() => {})
})

beforeEach(() => {
  __clearAnswerCacheForTests()
  __resetModelCircuitForTests()
  vi.stubGlobal("fetch", fetchMock)
  __setRouterAnswerIndexForTests(compileFixture())
  stubEnv()
})

afterEach(() => {
  __setRouterAnswerIndexForTests(null)
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

afterAll(() => {
  resetRouterAnswerIndex()
  vi.restoreAllMocks()
})

describe("single-question pick request bytes (old prompt version, default)", () => {
  it.runIf(WRITE)("writes the byte snapshot", async () => {
    const file: BytesFile = {
      _comment:
        "단일 질문 고르기 요청 바이트 고정(R2 B3 전 코드로 만듦). 지시문, 픽스처 색인 질문마다 Gemini 요청 URL·본문(보낸 글 그대로), Claude 요청 본문(buildClaudeCardPickRequest JSON). 다시 만드는 법은 assist-single-bytes.test.ts 머리말.",
      instruction: ANSWER_CARD_PICK_INSTRUCTION,
      requests: await capture(),
    }
    writeFileSync(FILE, `${JSON.stringify(file, null, 2)}\n`)
  })

  it.skipIf(WRITE)("keeps the instruction, the Gemini body and the Claude body byte for byte", async () => {
    const expected = JSON.parse(readFileSync(FILE, "utf8")) as BytesFile
    expect(ANSWER_CARD_PICK_INSTRUCTION).toBe(expected.instruction)
    const actual = await capture()
    expect(actual.map((item) => item.question)).toEqual(expected.requests.map((item) => item.question))
    for (const [at, item] of actual.entries()) {
      expect(item.url, item.question).toBe(expected.requests[at].url)
      expect(item.body, item.question).toBe(expected.requests[at].body)
      for (const model of CLAUDE_MODELS) expect(item.claude[model], `${item.question} ${model}`).toBe(expected.requests[at].claude[model])
    }
  })
})
