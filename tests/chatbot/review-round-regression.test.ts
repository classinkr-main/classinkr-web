import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { __clearAnswerGateCacheForTests } from "@/lib/chatbot/answer-gate"
import {
  evaluateChatbotQuery,
  NO_SOURCE_FACT_ANSWER,
  streamChatbotQuery,
  type ChatbotStreamEvent,
  type ChatbotStreamMeta,
} from "@/lib/chatbot/service"
import { findBasicQuickAnswers } from "@/lib/chatbot/quick-answers-basics"
import { findSymptomTopic } from "@/lib/chatbot/symptom-triage"
import {
  answerGateResponse,
  evidenceSelectionResponse,
  isAnswerGateCall,
  isEvidenceSelectionCall,
  isOutlinePickCall,
  outlinePickResponse,
  readEvidenceSelectionRequest,
} from "./helpers/final-answer-llm"

// 2026-11-18 검토 라운드에서 확인된 구조 결함의 회귀 테스트.
// 개별 질문용 정해 둔 답을 더한 것이 아니라, 경로(스트림 말투·관문 뒤 정책 주제·실패 답 캐시)와 넓거나 좁은 판정 규칙을 고쳤다.

function disableSupabase() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
  vi.stubEnv("SUPABASE_SECRET_KEY", "")
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "")
}

const ask = (question: string) => evaluateChatbotQuery(question, { generateAnswer: false })
const PRICING_LEAD = "요금은 고정가표보다 '구성 기준'으로 봐요"
// 수업 끊김 증상 안내 또는 수업 문제 점검 순서.
const LIVE_CLASS_TROUBLE_ANSWER = /수업이 끊기거나 튕기면|수업 중 끊김이나 소리·마이크 문제는/

describe("모델 없이 보는 판정 규칙", () => {
  beforeAll(() => {
    disableSupabase()
    vi.stubEnv("GEMINI_API_KEY", "")
    vi.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterAll(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it("인원을 기준으로 값을 묻는 말은 가격 질문이다('얼마나'로 인원 자체를 물을 때만 아니다)", async () => {
    for (const question of ["학생 인원 30명이면 얼마예요", "몇 명까지 쓰면 얼마예요", "인원 50명 정도면 얼마 정도 해요?"]) {
      expect((await ask(question)).answer, question).toContain(PRICING_LEAD)
    }
    expect((await ask("수업 인원 얼마나 들어가요?")).answer).not.toContain(PRICING_LEAD)
  })

  it("위약금 금액을 묻는 말은 제품 견적 구성 답이 아니라 계약 확인으로 간다", async () => {
    const penalty = await ask("위약금 얼마예요?")
    expect(penalty.answer).not.toContain(PRICING_LEAD)
    const cancellation = await ask("해지 수수료 얼마예요?")
    expect(penalty.answerMode).toBe(cancellation.answerMode)
    expect(penalty.needsHandoff).toBe(cancellation.needsHandoff)
  })

  it("사람과 연락 수단을 함께 말하면 연락 수단 사실 질문이 아니라 사람 연결 요청이다", async () => {
    for (const question of ["담당자 전화 가능해요?", "매니저랑 통화 원하는데 주말에도 되나요?", "상담원이랑 채팅 되나요?"]) {
      const result = await ask(question)
      expect(result.answerMode, question).toBe("handoff")
      expect(result.needsHandoff, question).toBe(true)
    }
    // 연락 수단 자체에 대한 사실 질문은 그대로 사실 질문이다.
    for (const question of ["도입 상담 전화로도 받나요", "카톡으로도 상담 돼요?"]) {
      expect((await ask(question)).answer.startsWith("네, 담당자 상담으로"), question).toBe(false)
    }
  })

  it("수업에서 나가는 증상(나가는·나가서·나가고)은 수업 문제 안내로 간다", async () => {
    for (const question of [
      "수업 중에 나가는 학생이 많아요",
      "수업하다가 학생들이 나가서 다시 들어와요",
      "수업 중 앱이 나가고 꺼져요",
    ]) {
      expect((await ask(question)).answer, question).toMatch(LIVE_CLASS_TROUBLE_ANSWER)
    }
    // 조건·허락·방법을 묻는 말은 그대로 증상이 아니다.
    for (const question of ["아이가 수업 중간에 나가면 알림 오나요", "수업 나가는 방법 알려주세요"]) {
      expect((await ask(question)).answer, question).not.toMatch(LIVE_CLASS_TROUBLE_ANSWER)
    }
  })

  it("'왜·갑자기 … 안 되죠'는 확인을 구하는 말이 아니라 고장 신고다", () => {
    expect(findSymptomTopic("화면 공유 왜 안 되죠")?.id).toBe("screen-share")
    expect(findSymptomTopic("갑자기 화면 공유 안 되죠")?.id).toBe("screen-share")
    expect(findSymptomTopic("마이크가 왜 안 되죠")?.id).toBe("mic-fail")
    expect(findSymptomTopic("일반 전자칠판은 학생 화면 공유 안 되죠")).toBeNull()
  })

  it("정해 둔 기본 답이 다른 짧은 질문을 가로채지 않는다", () => {
    const matchedIds = (question: string) => findBasicQuickAnswers(question.toLowerCase()).map((entry) => entry.id)
    const cases: [string, string][] = [
      ["기존에 쓰던 노트북 바꿔도 돼요?", "basics-switch-from-zoom"],
      ["기존에 쓰던 폰 바꿔도 계속 쓸 수 있나요", "basics-switch-from-zoom"],
      ["카카오 로그인 되나요?", "basics-contact-channel"],
      ["카카오톡으로 가입 가능해요?", "basics-contact-channel"],
      ["제가 쓴 판서 파일 저장할 수 있나요", "basics-student-material-download"],
      ["녹화는 무료예요 유료예요?", "basics-free-tool-why-pay"],
      ["보증금 얼마나 내야 해요", "basics-as-intake"],
    ]
    for (const [question, id] of cases) {
      expect(matchedIds(question), question).not.toContain(id)
    }
    // 원래 받던 질문(첫 방문 질문 묶음)은 그대로 받는다.
    const kept: [string, string][] = [
      ["줌쓰던 학원인데 옮기기 어려워요?", "basics-switch-from-zoom"],
      ["카카오톡으로 문의해도 돼요?", "basics-contact-channel"],
      ["클래스인 수업 자료 학생이 직접 내려받을 수 있나요", "basics-student-material-download"],
      ["구글미트 무료인데 왜 돈 내요", "basics-free-tool-why-pay"],
      ["A/S 접수 어떻게 해요", "basics-as-intake"],
    ]
    for (const [question, id] of kept) {
      expect(matchedIds(question), question).toContain(id)
    }
  })

  it("기능이 있는지와 함께 하는 방법을 물으면 조작 순서로 답한다", async () => {
    expect((await ask("숙제 기능 있는데 학생한테 어떻게 내요?")).answer).toContain("[새로 만들기] > [숙제]")
    expect((await ask("클래스인에 숙제 제출받는 기능 있나요")).answer).not.toContain("[새로 만들기] > [숙제]")
  })

  it("앞 턴을 가리키는 짧은 후속 질문(그건·이건·저건·거기)은 못 찾았다고 단정하지 않고 되묻는다", async () => {
    for (const question of ["그건 학생도 볼 수 있어요?", "저건 뭐예요?", "이건 뭐예요?", "거기 학생도 볼 수 있어요?"]) {
      expect((await ask(question)).answer, question).not.toBe(NO_SOURCE_FACT_ANSWER)
    }
  })
})

interface StubOptions {
  verdict?: "answers" | "off_target"
  /** 근거 선별: 함수면 고를 문장, "fail"이면 HTTP 500. 기본은 아무것도 고르지 않음. */
  pick?: ((text: string) => boolean) | "fail"
  /** 그 밖의 호출(최종 답 생성 등)도 실패시킨다. */
  failOthers?: boolean
}

function stubModel({ verdict = "answers", pick, failOthers = false }: StubOptions = {}) {
  const calls: string[] = []
  const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
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
      if (pick === "fail") return { ok: false, status: 500, json: async () => ({}), text: async () => "error" }
      const request = readEvidenceSelectionRequest(init)
      return evidenceSelectionResponse(
        pick ? request.sentences.filter((sentence) => pick(sentence.text)).map((sentence) => sentence.id) : []
      )
    }
    calls.push("other")
    if (failOthers) return { ok: false, status: 500, json: async () => ({}), text: async () => "error" }
    return { ok: true, json: async () => ({}) }
  })
  vi.stubGlobal("fetch", fetchMock)
  return { calls }
}

async function collectStream(message: string) {
  const events: ChatbotStreamEvent[] = []
  await streamChatbotQuery({ message }, {}, (event) => events.push(event))
  const replaces = events.filter((event): event is { type: "replace"; answer: string } => event.type === "replace")
  const meta = events.find((event): event is { type: "meta"; meta: ChatbotStreamMeta } => event.type === "meta")?.meta
  return { answer: replaces.at(-1)?.answer ?? "", meta }
}

describe("모델을 흉내 낸 경로", () => {
  beforeEach(() => {
    disableSupabase()
    vi.stubEnv("GEMINI_API_KEY", "test-key")
    vi.stubEnv("CHATBOT_ANSWER_GATE", "")
    vi.stubEnv("CHATBOT_FINAL_ANSWER_LLM", "")
    vi.stubEnv("CHATBOT_SECOND_CHANCE", "")
    __clearAnswerGateCacheForTests()
    vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.spyOn(console, "info").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("근거 선별이 실패해 못 찾음으로 보류한 답도 스트림이 일반 경로처럼 화난·불안한 말투 층과 상담 연결을 입힌다", async () => {
    // 스트림을 먼저 돌린다(일반 경로가 먼저 돌아 캐시를 남기면 스트림이 그 캐시 답을 쓰게 되어 차이가 가려진다).
    for (const question of ["업데이트 자동으로 되나요!!", "급해요 ㅠㅠ 웹캠 해상도 얼마나 돼야 하나요"]) {
      stubModel({ pick: "fail", failOthers: true })
      const stream = await collectStream(question)
      const normal = await evaluateChatbotQuery(question)
      expect(stream.answer, question).toBe(normal.answer)
      expect(stream.meta?.needsHandoff, question).toBe(normal.needsHandoff)
    }
    stubModel({ pick: "fail", failOthers: true })
    const angry = await collectStream("웹캠 화질 어느 정도면 돼요!!")
    expect(angry.meta?.needsHandoff).toBe(true)
    expect(angry.answer).toContain("불편을 드려 정말 죄송합니다")
  })

  it("공개 범위를 사람이 정한 주제는 관문이 정해 둔 답을 버려도 문서 문장을 붙이지 않고 담당자 확인으로 잇는다", async () => {
    stubModel({ verdict: "off_target", pick: () => true })
    for (const question of ["무료 체험 있나요?", "무료 체험 기간이 얼마나 돼요?", "OPS 원가 얼마예요?", "클래스인 어느 나라 회사예요?"]) {
      const result = await evaluateChatbotQuery(question)
      expect(result.answerGate.gate, question).toBe("rejected")
      expect(result.answer, question).not.toContain("2주")
      expect(result.sources, question).toHaveLength(0)
      expect(result.needsHandoff, question).toBe(true)
      expect(result.answerMode, question).toBe("handoff")
    }
  })

  it("사람을 찾는 의문형 말은 관문을 거치지 않고 상담 연결을 지킨다", async () => {
    const { calls } = stubModel({ verdict: "off_target" })
    for (const question of ["상담원 있나요?", "사람이 답하는 거예요?", "통화 가능해요?"]) {
      const result = await evaluateChatbotQuery(question)
      expect(result.answerMode, question).toBe("handoff")
      expect(result.needsHandoff, question).toBe(true)
    }
    expect(calls).not.toContain("gate")
  })

  it("관문 뒤 문서 경로에서 근거 선별이 실패한 답은 캐시하지 않아, 다음 요청에서 다시 고른다", async () => {
    const question = "세금계산서 발행 어떻게 받아요"
    stubModel({ verdict: "off_target", pick: "fail" })
    await evaluateChatbotQuery(question)

    const healthy = stubModel({ verdict: "off_target", pick: () => true })
    const second = await evaluateChatbotQuery(question)
    expect(healthy.calls).toContain("selection")
    expect(second.answerMode).toBe("direct_answer")
  })

  it("스트림 경로에서 근거 선별이 실패해 보류한 못 찾음 답은 캐시하지 않는다", async () => {
    const question = "업데이트 자동으로 되나요"
    stubModel({ pick: "fail", failOthers: true })
    await collectStream(question)

    const healthy = stubModel({ pick: "fail", failOthers: true })
    await collectStream(question)
    expect(healthy.calls).toContain("selection")
  })

  it("일반 경로에서 관문이 버린 정해 둔 답 질문이 반복되면 문서 경로 답을 캐시에서 낸다", async () => {
    const question = "전자칠판 꼭 사야하나요?"
    stubModel({ verdict: "off_target", pick: () => true })
    const first = await evaluateChatbotQuery(question)
    expect(first.answerGate.gate).toBe("rejected")

    const again = stubModel({ verdict: "off_target", pick: () => true })
    const second = await evaluateChatbotQuery(question)
    expect(again.calls).not.toContain("selection")
    expect(second.answer).toBe(first.answer)
  })
})
