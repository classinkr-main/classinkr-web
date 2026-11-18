import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { __clearAnswerGateCacheForTests } from "@/lib/chatbot/answer-gate"
import { buildDocOutline, getPublicDocOutline, isPublicChatbotDoc } from "@/lib/chatbot/doc-outline"
import { parseOutlineSectionIds } from "@/lib/chatbot/llm"
import {
  evaluateChatbotQuery,
  NO_SOURCE_FACT_ANSWER,
  streamChatbotQuery,
  WEAK_SOURCE_DRAFT_ANSWER,
  type ChatbotStreamEvent,
} from "@/lib/chatbot/service"
import { listDocs, type DocArticle } from "@/lib/docs"
import {
  answerGateResponse,
  evidenceSelectionResponse,
  isAnswerGateCall,
  isEvidenceSelectionCall,
  isOutlinePickCall,
  outlinePickResponse,
  readEvidenceSelectionRequest,
} from "./helpers/final-answer-llm"

// 못 찾았을 때 목차에서 다시 고르는 두 번째 검색(lib/chatbot/service.ts applySecondChanceRetrieval, lib/chatbot/doc-outline.ts).
// 모델은 흉내 낸다. 첫 검색 + 근거 선별이 못 찾은 사실 질문에서만 목차를 보여 주고 절 번호를 고르게 한 뒤,
// 그 절의 문장으로 근거 선별을 다시 돌린다. 나가는 글은 문서 문장 그대로다.

function disableSupabase() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
  vi.stubEnv("SUPABASE_SECRET_KEY", "")
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "")
}

const NOT_FOUND_HEADS = [NO_SOURCE_FACT_ANSWER, WEAK_SOURCE_DRAFT_ANSWER].map((text) => text.split("\n\n")[0])

function isNotFound(answer: string) {
  return NOT_FOUND_HEADS.some((head) => answer.includes(head))
}

// 목차에서 제목·절 제목으로 번호를 찾는다(목차 번호는 문서가 늘면 바뀌므로 테스트에 숫자를 박지 않는다).
function outlineIdOf(title: string, heading: string) {
  for (const entry of getPublicDocOutline().entries.values()) {
    const entryHeading = entry.sectionIndex === null ? "요약" : entry.doc.sections[entry.sectionIndex].heading
    if (entry.doc.title === title && entryHeading === heading) return entry.id
  }
  throw new Error(`목차에 없음: ${title} / ${heading}`)
}

interface StubOptions {
  /** 목차 고르기 응답. 함수면 직접 처리한다(오류 흉내). 기본은 "없음". */
  outline?: number[] | (() => Promise<unknown>)
  /** 근거 선별이 고를 문장(문장 내용으로 고른다). 없으면 빈 배열. */
  pick?: (text: string) => boolean
  verdict?: "answers" | "off_target"
}

function stubModel({ outline = [], pick, verdict = "answers" }: StubOptions = {}) {
  const outlineRequests: { system: string; user: string }[] = []
  const selectionCalls: string[][] = []
  const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    if (isAnswerGateCall(init)) return answerGateResponse(verdict)
    if (isOutlinePickCall(init)) {
      const body = JSON.parse(String(init?.body)) as {
        systemInstruction: { parts: { text: string }[] }
        contents: { parts: { text: string }[] }[]
      }
      outlineRequests.push({ system: body.systemInstruction.parts[0].text, user: body.contents[0].parts[0].text })
      return typeof outline === "function" ? outline() : outlinePickResponse(outline)
    }
    if (isEvidenceSelectionCall(init)) {
      const request = readEvidenceSelectionRequest(init)
      selectionCalls.push(request.sentences.map((sentence) => sentence.text))
      return evidenceSelectionResponse(
        pick ? request.sentences.filter((sentence) => pick(sentence.text)).map((sentence) => sentence.id) : []
      )
    }
    return { ok: true, json: async () => ({}) }
  })
  vi.stubGlobal("fetch", fetchMock)
  return { fetchMock, outlineRequests, selectionCalls }
}

async function collectStream(message: string, sessionId?: string) {
  const events: ChatbotStreamEvent[] = []
  await streamChatbotQuery({ message, sessionId }, {}, (event) => events.push(event))
  return events
}

const KICK_OUT = { title: "코스 - 구성원 초대, 변경, 퇴장", heading: "구성원 강제 퇴장시키기" }

describe("목차에서 다시 고르는 두 번째 검색", () => {
  beforeEach(() => {
    disableSupabase()
    vi.stubEnv("GEMINI_API_KEY", "test-key")
    vi.stubEnv("CHATBOT_ANSWER_GATE", "")
    vi.stubEnv("CHATBOT_FINAL_ANSWER_LLM", "")
    vi.stubEnv("CHATBOT_SECOND_CHANCE", "")
    __clearAnswerGateCacheForTests()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it("못 찾은 사실 질문이면 목차에서 고른 절의 문서 문장으로 답한다", async () => {
    const question = "말썽 부리는 학생을 교실에서 빼 버릴 수 있나요?"
    const id = outlineIdOf(KICK_OUT.title, KICK_OUT.heading)
    const { outlineRequests, selectionCalls } = stubModel({ outline: [id], pick: (text) => /멤버 삭제/.test(text) })

    const result = await evaluateChatbotQuery(question)

    expect(outlineRequests).toHaveLength(1)
    // 질문은 자료로만 넘기고(태그 안), 목차는 시스템 지시에 고정으로 둔다.
    expect(outlineRequests[0].user).toBe(`<질문>${question}</질문>`)
    expect(outlineRequests[0].system).toContain(`${id} ${KICK_OUT.heading}`)
    expect(result.secondChance.secondChance).toBe("hit")
    expect(result.answerMode).toBe("direct_answer")
    expect(result.unresolved).toBe(false)
    expect(isNotFound(result.answer)).toBe(false)
    // 나간 글은 두 번째 선별에 넘긴 문서 문장 그대로다.
    const secondSelection = selectionCalls.at(-1) ?? []
    const firstParagraph = result.answer.split("\n\n")[0]
    expect(secondSelection.some((sentence) => /멤버 삭제/.test(sentence) && firstParagraph.includes(sentence))).toBe(true)
    expect(result.sources.map((source) => source.heading)).toContain(KICK_OUT.heading)
  })

  it("목차에서 고른 절이 없으면 못 찾음 답을 그대로 둔다(선별을 다시 부르지 않는다)", async () => {
    const question = "수업 중에 학생 폰을 잠가 둘 수 있나요?"
    const { outlineRequests, selectionCalls } = stubModel({ outline: [] })

    const result = await evaluateChatbotQuery(question)

    expect(outlineRequests).toHaveLength(1)
    expect(selectionCalls.length).toBeLessThanOrEqual(1)
    expect(isNotFound(result.answer)).toBe(true)
    expect(result.sources).toHaveLength(0)
    expect(result.secondChance).toMatchObject({ secondChance: "miss", reason: "no_section" })
  })

  it("고른 절에 답 문장이 없으면(선별이 못 고르면) 못 찾음 답을 그대로 둔다", async () => {
    const question = "강의실 냉난방 온도를 앱에서 조절할 수 있나요?"
    const id = outlineIdOf(KICK_OUT.title, KICK_OUT.heading)
    const { outlineRequests } = stubModel({ outline: [id] })

    const result = await evaluateChatbotQuery(question)

    expect(outlineRequests).toHaveLength(1)
    expect(isNotFound(result.answer)).toBe(true)
    expect(result.secondChance).toMatchObject({ secondChance: "miss", reason: "no_sentence" })
  })

  it("고른 문장으로 만든 답이 질문의 답이 아니라고 판정되면 못 찾음 답을 그대로 둔다", async () => {
    const question = "학생이 수업 중에 몰래 딴짓하면 화면을 꺼 버릴 수 있나요?"
    const id = outlineIdOf(KICK_OUT.title, KICK_OUT.heading)
    const { fetchMock, outlineRequests } = stubModel({
      outline: [id],
      pick: (text) => /멤버 삭제/.test(text),
      verdict: "off_target",
    })

    const result = await evaluateChatbotQuery(question)

    expect(outlineRequests).toHaveLength(1)
    const gateCalls = fetchMock.mock.calls.filter(([, init]) => isAnswerGateCall(init))
    expect(gateCalls.length).toBeGreaterThanOrEqual(1)
    expect(isNotFound(result.answer)).toBe(true)
    expect(result.secondChance).toMatchObject({ secondChance: "miss", reason: "off_target" })
  })

  it("목차 고르기 호출이 실패하면 못 찾음 답을 그대로 두고 그 답은 캐시하지 않는다", async () => {
    const question = "수업 화면에 학생 생일 축하 폭죽을 터뜨릴 수 있나요?"
    const { outlineRequests } = stubModel({ outline: async () => ({ ok: false, status: 500, text: async () => "" }) })

    const first = await evaluateChatbotQuery(question)
    const second = await evaluateChatbotQuery(question)

    expect(isNotFound(first.answer)).toBe(true)
    expect(first.secondChance).toMatchObject({ secondChance: "miss", reason: "error" })
    // 실패한 답은 캐시에 남지 않아 다음 요청에서 다시 시도한다.
    expect(second.secondChance.secondChance).toBe("miss")
    expect(outlineRequests.length).toBeGreaterThanOrEqual(2)
  })

  it("CHATBOT_SECOND_CHANCE=off, CHATBOT_FINAL_ANSWER_LLM=off, 키 없음이면 목차 호출을 하지 않는다", async () => {
    const id = outlineIdOf(KICK_OUT.title, KICK_OUT.heading)

    vi.stubEnv("CHATBOT_SECOND_CHANCE", "off")
    let stub = stubModel({ outline: [id] })
    let result = await evaluateChatbotQuery("수업 중 학생끼리 쪽지 주고받는 걸 막을 수 있나요?")
    expect(stub.outlineRequests).toHaveLength(0)
    expect(result.secondChance).toMatchObject({ secondChance: "none", reason: "off" })
    expect(isNotFound(result.answer)).toBe(true)

    vi.stubEnv("CHATBOT_SECOND_CHANCE", "")
    vi.stubEnv("CHATBOT_FINAL_ANSWER_LLM", "off")
    stub = stubModel({ outline: [id] })
    result = await evaluateChatbotQuery("수업 중 학생끼리 쪽지 보내는 걸 막을 수 있나요?")
    expect(stub.outlineRequests).toHaveLength(0)

    vi.stubEnv("CHATBOT_FINAL_ANSWER_LLM", "")
    vi.stubEnv("GEMINI_API_KEY", "")
    stub = stubModel({ outline: [id] })
    result = await evaluateChatbotQuery("수업 중 학생끼리 쪽지 돌리는 걸 막을 수 있나요?")
    expect(stub.outlineRequests).toHaveLength(0)
  })

  it("잡담·주제 밖, 한 낱말 입력, 정해 둔 답이 나가는 질문에는 돌리지 않는다", async () => {
    const id = outlineIdOf(KICK_OUT.title, KICK_OUT.heading)
    const { outlineRequests } = stubModel({ outline: [id], pick: () => true, verdict: "answers" })

    const offTopic = await evaluateChatbotQuery("오늘 날씨 어때요?")
    const oneWord = await evaluateChatbotQuery("손들기")
    const prepared = await evaluateChatbotQuery("전자칠판 꼭 사야하나요?")

    expect(outlineRequests).toHaveLength(0)
    expect(offTopic.secondChance.secondChance).toBe("none")
    expect(oneWord.secondChance.secondChance).toBe("none")
    expect(prepared.secondChance.secondChance).toBe("none")
    expect(prepared.answerGate.gate).toBe("kept")
  })

  it("사람이 공개 범위를 정한 주제(무료 체험·인원·회사 국적·칠판 크기)는 관문이 답을 버려도 목차에서 새 문장을 붙이지 않는다", async () => {
    const id = outlineIdOf(KICK_OUT.title, KICK_OUT.heading)
    const { outlineRequests } = stubModel({ outline: [id], pick: () => true, verdict: "off_target" })

    for (const question of [
      "클래스인 무료체험 기간 며칠이에요",
      "최대 몇 명까지 수업 들어와요?",
      "클래스인 중국 회사예요?",
      "클래스인은 어느나라 제품인가요?",
      "OPS 원가와 전자칠판원가는?",
      "전자칠판 제일 큰 거 몇 인치예요?",
    ]) {
      const result = await evaluateChatbotQuery(question)
      expect(result.secondChance.secondChance).toBe("none")
    }
    expect(outlineRequests).toHaveLength(0)
  })

  it("모델 없이 초안만 만드는 평가(generateAnswer=false)에서는 돌지 않는다", async () => {
    const id = outlineIdOf(KICK_OUT.title, KICK_OUT.heading)
    const { outlineRequests } = stubModel({ outline: [id], pick: () => true })

    const result = await evaluateChatbotQuery("문제 학생을 교실 밖으로 내쫓을 수 있나요?", { generateAnswer: false })

    expect(outlineRequests).toHaveLength(0)
    expect(result.secondChance.secondChance).toBe("none")
  })

  it("관문이 정해 둔 답을 버리고 문서에서도 못 찾았으면 두 번째 검색을 한 번 돌린다", async () => {
    const question = "전자칠판 꼭 사야하나요?"
    const { outlineRequests } = stubModel({ verdict: "off_target", outline: [] })

    const result = await evaluateChatbotQuery(question)

    expect(result.answerGate.gate).toBe("rejected")
    expect(outlineRequests).toHaveLength(1)
    expect(result.secondChance).toMatchObject({ secondChance: "miss", reason: "no_section" })
  })

  it("스트림 경로도 같은 두 번째 검색을 거쳐 일반 경로와 같은 답을 낸다", async () => {
    const question = "수업 중에 말 안 듣는 학생을 퇴장 처리할 수 있나요?"
    const id = outlineIdOf(KICK_OUT.title, KICK_OUT.heading)
    const { outlineRequests } = stubModel({ outline: [id], pick: (text) => /멤버 삭제/.test(text) })

    // 세션을 붙여 답 캐시를 거치지 않게 한다(정적 문서 경로라 이력은 비어 있다).
    const events = await collectStream(question, "00000000-0000-4000-8000-000000000001")
    const nonStream = await evaluateChatbotQuery(question)

    const replaces = events.filter((event) => event.type === "replace")
    expect(replaces).toHaveLength(1)
    expect(events.some((event) => event.type === "delta")).toBe(false)
    const streamed = replaces[0].type === "replace" ? replaces[0].answer : ""
    expect(nonStream.secondChance.secondChance).toBe("hit")
    expect(streamed).toBe(nonStream.answer)
    expect(isNotFound(streamed)).toBe(false)
    expect(outlineRequests).toHaveLength(2)
    const meta = events.find((event) => event.type === "meta")
    expect(meta && meta.type === "meta" ? meta.meta.unresolved : true).toBe(false)
  })

  it("스트림 경로에서 목차가 '없음'이면 일반 경로와 같은 못 찾음 답을 낸다", async () => {
    const question = "교실 공기청정기를 앱으로 켤 수 있나요?"
    stubModel({ outline: [] })

    const events = await collectStream(question, "00000000-0000-4000-8000-000000000002")
    const nonStream = await evaluateChatbotQuery(question)

    const replace = events.find((event) => event.type === "replace")
    const streamed = replace && replace.type === "replace" ? replace.answer : ""
    expect(isNotFound(streamed)).toBe(true)
    expect(streamed).toBe(nonStream.answer)
  })
})

describe("공개 도움말 목차", () => {
  it("공개 범위 밖 문서(내부·색인 제외)는 목차에 넣지 않는다", () => {
    const outline = getPublicDocOutline()
    const hidden = listDocs().filter((doc) => !isPublicChatbotDoc(doc))
    expect(hidden.length).toBeGreaterThan(0)
    for (const entry of outline.entries.values()) {
      expect(isPublicChatbotDoc(entry.doc)).toBe(true)
    }
    const publicTitles = new Set(listDocs().filter(isPublicChatbotDoc).map((doc) => doc.title))
    for (const doc of hidden) {
      if (publicTitles.has(doc.title)) continue
      expect(outline.text).not.toContain(`# ${doc.title}\n`)
    }
  })

  it("visibility=internal 문서는 목차를 만들 때 빠진다", () => {
    const base = listDocs().find(isPublicChatbotDoc) as DocArticle
    const internal: DocArticle = {
      ...base,
      slug: "internal-only",
      title: "내부 전용 운영 메모",
      visibility: "internal",
      sections: [{ heading: "내부 원가표", body: "내부 자료" }],
    }
    const outline = buildDocOutline([base, internal])
    expect(outline.text).not.toContain("내부 전용 운영 메모")
    expect(outline.text).not.toContain("내부 원가표")
    expect(outline.entries.size).toBe(base.sections.length + 1)
  })

  it("목차는 문서 제목 아래 번호 붙은 절 제목(요약 포함)이고 한 번만 만든다", () => {
    const outline = getPublicDocOutline()
    expect(getPublicDocOutline()).toBe(outline)
    expect(outline.text).toMatch(/^# .+\n1 요약\n2 /)
    // 호출 한 번에 넣을 수 있는 크기(2026-11-18 약 2.2만 자, 1.3만 토큰)를 크게 넘지 않게 지킨다.
    expect(outline.text.length).toBeLessThan(30_000)
  })

  it("모델이 고른 번호는 목차 범위 안의 것만 최대 3개 받는다", () => {
    expect(parseOutlineSectionIds('{"sectionIds":[5,2,5,900,0,7,8]}', 100)).toEqual([5, 2, 7])
    expect(parseOutlineSectionIds('{"sectionIds":[]}', 100)).toEqual([])
    expect(parseOutlineSectionIds('{"ids":[1]}', 100)).toBeNull()
    expect(parseOutlineSectionIds("1,2", 100)).toBeNull()
  })
})
