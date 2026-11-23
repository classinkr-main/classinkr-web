import { readFileSync } from "node:fs"
import { join } from "node:path"

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { appendFollowUp, buildFollowUp, type FollowUpInput } from "@/lib/chatbot/follow-up"
import { evaluateChatbotQuery } from "@/lib/chatbot/service"
import { detectConversationTone } from "@/lib/chatbot/tone"

/**
 * 질문 주도 — 답 끝에 붙는 확인 질문 하나.
 * 오해 막기(줄임말을 어떻게 이해했는지), 정보 부족(녹화 종류·쓰는 기기), 영업 상담 이어 가기(규모·수업 방식·도입 시기).
 */

const SALES_SIZE = "강사와 학생이 대략 몇 명인지"
const SALES_MODE = "주로 대면 수업인가요"
const SALES_TIMING = "도입은 언제쯤 생각하고 계세요?"
const RECORDING_KIND = "수업 녹화인지, 카메라로 찍는 현장 녹화인지"
const DEVICE = "쓰시는 기기가 PC인지 휴대폰·태블릿인지"
const RECORDING_TERM = "'녹음'은 수업 녹화로 이해하고 답했어요"

// 이 레이어가 붙이는 질문의 첫머리. 한 답에 둘 이상 붙으면 안 된다.
const FOLLOW_UP_MARKERS = [
  SALES_SIZE,
  SALES_MODE,
  SALES_TIMING,
  "교실이 몇 곳인지",
  "지금은 어떤 도구(Zoom",
  RECORDING_KIND,
  DEVICE,
  "로 이해하고 답했어요",
  "로 이해했어요",
]

function lastParagraph(answer: string) {
  return answer.trim().split(/\n{2,}/).at(-1) ?? ""
}

function followUpCount(answer: string) {
  return FOLLOW_UP_MARKERS.filter((marker) => answer.includes(marker)).length
}

describe("question-led follow-ups", () => {
  beforeAll(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
    vi.stubEnv("SUPABASE_SECRET_KEY", "")
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "")
    vi.stubEnv("GEMINI_API_KEY", "")
    vi.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterAll(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  const ask = (question: string) => evaluateChatbotQuery(question, { generateAnswer: false })

  it("continues a sales conversation by asking for the academy size it does not know yet", async () => {
    const result = await ask("학원에 클래스인 도입하려고 하는데 상담 받고 싶어요")
    expect(lastParagraph(result.answer)).toContain(SALES_SIZE)
  })

  it("skips a sales slot the visitor already gave and asks the next one", async () => {
    const result = await ask("강사 30명 학생 400명 학원인데 요금이 궁금해요")
    expect(result.answer).not.toContain(SALES_SIZE)
    expect(lastParagraph(result.answer)).toContain(SALES_MODE)
  })

  it("asks which recording failed when the symptom is ambiguous", async () => {
    const result = await ask("녹화가 안 돼요")
    expect(lastParagraph(result.answer)).toContain(RECORDING_KIND)
  })

  it("does not ask again what the visitor already said", async () => {
    const result = await ask("현장 녹화가 안 돼요")
    expect(result.answer).not.toContain(RECORDING_KIND)
  })

  it("asks for the device when the steps differ by device and none was named", async () => {
    const result = await ask("선생님 목소리가 안 들려요")
    expect(lastParagraph(result.answer)).toContain(DEVICE)
  })

  it("states how it read an ambiguous word so a misreading can be corrected", async () => {
    const result = await ask("수업 녹음한 게 안 보여요")
    expect(lastParagraph(result.answer)).toContain(RECORDING_TERM)
  })

  it("does not add a second question when the answer already asks one", async () => {
    const result = await ask("Zoom이랑 뭐가 달라요?")
    expect(result.answer).not.toContain(SALES_SIZE)
    expect(followUpCount(result.answer)).toBeLessThanOrEqual(1)
  })

  it("does not quiz angry visitors or English speakers", async () => {
    const angry = await ask("아 진짜 짜증나 또 안되네 녹화 왜 안돼")
    expect(angry.answer).not.toContain(RECORDING_KIND)
    const english = await ask("recording not working")
    expect(english.answer).not.toContain(RECORDING_KIND)
    expect(english.answer).not.toContain(DEVICE)
  })

  it("adds at most one follow-up question and never asks for identifiers across the persona eval set", async () => {
    const evalSet = JSON.parse(readFileSync(join(process.cwd(), "data/chatbot-persona-eval-set.json"), "utf8")) as {
      cases: { id: string; question: string }[]
    }
    for (const testCase of evalSet.cases) {
      const result = await ask(testCase.question)
      expect(followUpCount(result.answer), testCase.id).toBeLessThanOrEqual(1)
      const tone = detectConversationTone(testCase.question)
      if (tone.angry || tone.repeated || tone.english) {
        expect(followUpCount(result.answer), testCase.id).toBe(0)
      }
    }
  }, 120_000)
})

describe("buildFollowUp", () => {
  const base: FollowUpInput = {
    question: "도입 상담 받고 싶어요",
    answer: "도입 상담은 아래 [도입 상담 남기기]로 남겨 주세요.",
    category: "onboarding",
    intent: "sales_consulting",
    handoffIntent: "demo",
    answerMode: "handoff",
    tone: detectConversationTone("도입 상담 받고 싶어요"),
  }

  it("never asks for identifiers or payment details", () => {
    const questions = [
      base,
      { ...base, category: "hardware", question: "전자칠판 구매 상담" },
      { ...base, question: "Zoom 대신 쓰려고요" },
      { ...base, question: "다음 달 개강인데 도입하려고요" },
      { ...base, topicFollowUp: undefined, category: "troubleshooting", handoffIntent: "support", answer: "1. PC는 설정에서 확인해요.\n2. 휴대폰은 앱에서 확인해요.", question: "카메라가 안 돼요" },
    ]
    for (const input of questions) {
      const followUp = buildFollowUp(input) ?? ""
      expect(followUp).not.toMatch(/아이디|전화번호|휴대폰\s*번호|이메일|비밀번호|시리얼|카드\s*번호|계좌/)
    }
  })

  it("stays quiet for support questions inside a sales-looking category", () => {
    expect(buildFollowUp({ ...base, category: "billing", question: "결제가 두 번 됐어요" })).toBeNull()
    expect(buildFollowUp({ ...base, category: "billing", question: "환불 받고 싶어요" })).toBeNull()
  })

  it("stays quiet for clarifying answers and self-knowledge answers", () => {
    expect(buildFollowUp({ ...base, answerMode: "clarifying_question" })).toBeNull()
    expect(buildFollowUp({ ...base, intent: "self_knowledge" })).toBeNull()
  })

  it("does not ask sales questions after a screen-guide how-to answer", () => {
    // "코스 가입 허용"의 '가입'을 도입 상담으로 읽어 학원 규모를 묻던 것.
    const answer = "아래 순서대로 따라 하시면 됩니다.\n\n1. 화면 좌측 상단의 코스 이름을 클릭해 주세요"
    expect(
      buildFollowUp({
        ...base,
        intent: "onboarding",
        answerMode: "direct_answer",
        question: "코스 가입 허용 QR 초대 링크는 어디서 활성화해요?",
        answer,
      })
    ).toBeNull()
  })

  it("asks about classrooms first for board purchases", () => {
    expect(buildFollowUp({ ...base, category: "hardware", question: "전자칠판 구매하고 싶어요" })).toContain("교실이 몇 곳인지")
  })

  it("does not count a handoff checklist as a question already asked", () => {
    const answer = "그래도 안 되면 담당자 상담으로 이어 드릴게요. 상담할 때 이 정보를 함께 알려 주시면 더 빨리 확인합니다: 쓰는 기기, 앱 버전."
    expect(
      buildFollowUp({
        ...base,
        category: "troubleshooting",
        handoffIntent: "support",
        intent: "troubleshooting",
        answerMode: "direct_answer",
        answer,
        question: "카메라가 안 켜져요",
        topicFollowUp: "다른 화상 프로그램에서는 켜지나요?",
      })
    ).toBe("다른 화상 프로그램에서는 켜지나요?")
  })

  it("keeps a single question when the answer passes through the layer twice (streaming path)", () => {
    const inputs: FollowUpInput[] = [
      { ...base, question: "강사 3명인데 도입 상담 받고 싶어요" },
      { ...base, question: "다음 달에 도입하려고요" },
      { ...base, question: "Zoom 대신 쓸까 고민 중이에요" },
      { ...base, category: "hardware", question: "전자칠판 구매하고 싶어요" },
      { ...base, question: "수업 녹음한 게 안 보여요", category: "troubleshooting", handoffIntent: "support" },
      {
        ...base,
        category: "troubleshooting",
        handoffIntent: "support",
        intent: "troubleshooting",
        answerMode: "direct_answer",
        question: "화면 공유가 안 돼요",
        answer: "1. PC는 설정에서 확인해요.\n2. 휴대폰은 앱에서 확인해요.",
      },
    ]
    for (const input of inputs) {
      const first = buildFollowUp(input)
      expect(first, input.question).not.toBeNull()
      const answered = appendFollowUp(input.answer, first)
      expect(buildFollowUp({ ...input, answer: answered }), input.question).toBeNull()
    }
  })

  it("does not ask for the device when one line already covers every device", () => {
    const input: FollowUpInput = {
      ...base,
      category: "troubleshooting",
      handoffIntent: "support",
      intent: "troubleshooting",
      answerMode: "direct_answer",
      question: "로그인은 되는데 수업이 안 보여요",
      answer: "1. 프로필(PC는 왼쪽 아래, 휴대폰 앱은 왼쪽 위)을 눌러 아이디를 봅니다.",
    }
    expect(buildFollowUp(input)).toBeNull()
  })

  it("states a reading and still asks the one missing detail", () => {
    const followUp = buildFollowUp({
      ...base,
      category: "hardware",
      handoffIntent: "support",
      intent: "troubleshooting",
      answerMode: "direct_answer",
      question: "핸드폰 띄우는 게 안 돼요",
      answer: "미러링은 같은 와이파이에서 열어요.",
      topicFollowUp: "버튼이 안 보이는 곳이 칠판인지 휴대폰인지 알려 주세요.",
    })
    expect(followUp).toContain("무선 미러링으로 이해하고")
    expect(followUp).toContain("칠판인지 휴대폰인지")
  })

  it("appends once even when called twice", () => {
    const once = appendFollowUp("답입니다.", "질문 하나?")
    expect(appendFollowUp(once, "질문 하나?")).toBe(once)
    expect(appendFollowUp("답입니다.", null)).toBe("답입니다.")
  })
})
