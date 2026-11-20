import { describe, expect, it } from "vitest"

import {
  checkGeneratedAnswer,
  CONTENT_SUGGEST_ALLOWLIST,
  extractContentSuggest,
  type GeneratedAnswerCheckOptions,
} from "@/lib/chatbot/generated-answer"
import { BASE_SYSTEM_INSTRUCTION, getFinalAnswerAllowList } from "@/lib/chatbot/llm"
import { leadMagnets } from "@/lib/lead-magnets"

/**
 * generate 모드 모델 글 대조(2026-11-20 조사 G13·G14). 예시 질문과 모델 글은 이 시험을 위해 지었다.
 * 사용성 검사만으로는 지어낸 숫자·메뉴·연락처·한자 문장·'가능' 뒤집기가 모두 통과했다.
 */

const GROUNDING = [
  "녹화 목록에서 받을 클립 행의 [다운로드]를 누르면 PC에 저장됩니다.",
  "바로 저장되지 않으면 [다운로드]를 마우스 오른쪽 버튼으로 누르고 [다른 이름으로 저장]을 고르세요.",
  "한 번에 100명까지 등록됩니다.",
  "수업이 끝나면 다시보기가 자동으로 만들어집니다.",
]

const RECORDING: GeneratedAnswerCheckOptions = {
  draft: "녹화본은 녹화 목록에서 [다운로드]를 누르면 PC에 저장됩니다.",
  groundingSentences: GROUNDING,
  question: "수업 녹화본은 어디서 받아요?",
}

const PAYMENT: GeneratedAnswerCheckOptions = {
  draft: "학원비 결제·수납 기능은 제공하지 않습니다. 결제는 쓰시던 결제 시스템과 함께 운영하시면 됩니다.",
  groundingSentences: [],
  question: "학원비도 클래스인으로 받을 수 있나요?",
}

const GOOD_SENTENCE = "녹화 목록에서 [다운로드]를 누르면 PC에 저장돼요."

describe("checkGeneratedAnswer: invented details are dropped", () => {
  const invented: Array<{ name: string; sentence: string; issue: string }> = [
    { name: "number beyond the sources", sentence: "한 수업에는 최대 500명까지 들어올 수 있어요.", issue: "unsupported_number" },
    { name: "version beyond the sources", sentence: "앱 버전 7.2.1 이상에서만 내려받기가 됩니다.", issue: "unsupported_number" },
    { name: "menu name beyond the sources", sentence: "[AI 자동출결] 메뉴를 켜면 출결도 함께 저장돼요.", issue: "unsupported_menu" },
    { name: "Chinese characters", sentence: "녹화본은 自動으로 클라우드에 저장됩니다.", issue: "foreign_script" },
    { name: "Japanese kana", sentence: "녹화본은 ダウンロード 버튼으로 받습니다.", issue: "foreign_script" },
    { name: "phone number", sentence: "막히면 02-1234-5678로 전화 주세요.", issue: "contact" },
    { name: "email address", sentence: "녹화본이 없으면 help@classin-support.co.kr 로 메일 주세요.", issue: "contact" },
    { name: "URL", sentence: "자세한 방법은 https://recording.example.org/guide 에 있어요.", issue: "contact" },
    { name: "foreign product name", sentence: "Google Drive와 자동으로 연동되어 바로 저장돼요.", issue: "unsupported_latin" },
    { name: "English sentence", sentence: "Please contact our support team for more details.", issue: "foreign_language" },
    { name: "internal source wording", sentence: "내부 정보 1에 따르면 녹화본은 따로 보관됩니다.", issue: "internal_reference" },
    { name: "asking for contact details in chat", sentence: "연락처를 남겨 주시면 담당자가 바로 연락드릴게요.", issue: "asks_contact" },
  ]

  for (const { name, sentence, issue } of invented) {
    it(`drops the sentence with ${name} and keeps the rest`, () => {
      const result = checkGeneratedAnswer(`${GOOD_SENTENCE} ${sentence}`, RECORDING)

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.answer).toBe(GOOD_SENTENCE)
      expect(result.dropped.map((item) => [item.sentence, item.issue])).toEqual([[sentence, issue]])
    })
  }

  it("falls back to the draft when the answer turns 'not provided' into 'possible'", () => {
    const result = checkGeneratedAnswer("네, 학원비 결제도 클래스인에서 바로 가능해요. 결제 메뉴에서 설정하시면 됩니다.", PAYMENT)
    expect(result).toEqual({ ok: false, reason: "constraint_flipped", dropped: [] })

    // 상담을 언급해도 뒤집은 것은 뒤집은 것이다.
    expect(checkGeneratedAnswer("학원비 결제 바로 가능! 자세한 건 상담으로 안내해 드려요.", PAYMENT)).toMatchObject({
      ok: false,
      reason: "constraint_flipped",
    })
  })

  it("falls back to the draft when no sentence is left", () => {
    const result = checkGeneratedAnswer("한 수업에는 최대 500명까지 들어올 수 있어요. 막히면 02-1234-5678로 전화 주세요.", RECORDING)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe("no_sentences_left")
    expect(result.dropped).toHaveLength(2)
  })

  it("does not accept a number only because the question said it", () => {
    const result = checkGeneratedAnswer(`${GOOD_SENTENCE} 네, 최대 300명까지 됩니다.`, {
      ...RECORDING,
      question: "녹화 수업 최대 300명까지 되죠?",
    })
    expect(result.ok && result.dropped.map((item) => item.issue)).toEqual(["unsupported_number"])
  })

  it("treats an empty answer as unusable", () => {
    expect(checkGeneratedAnswer("  ", RECORDING)).toEqual({ ok: false, reason: "empty", dropped: [] })
  })
})

describe("checkGeneratedAnswer: grounded answers pass untouched", () => {
  const normal: Array<{ name: string; answer: string; options: GeneratedAnswerCheckOptions }> = [
    {
      name: "a list built from the grounding sentences",
      answer: [
        "녹화본은 녹화 목록에서 바로 받을 수 있어요.",
        "- 클립 행의 [다운로드]를 누르면 PC에 저장됩니다.",
        "- 바로 저장되지 않으면 마우스 오른쪽 버튼으로 [다른 이름으로 저장]을 고르세요.",
      ].join("\n"),
      options: RECORDING,
    },
    {
      name: "a number taken from the grounding",
      answer: "학생 명단은 한 번에 100명까지 등록됩니다.\n\n수업이 끝나면 다시보기도 자동으로 만들어져요.",
      options: RECORDING,
    },
    {
      name: "a draft constraint kept as it is",
      answer: "학원비 결제·수납 기능은 Classin에서 제공하지 않아요. 결제는 지금 쓰시는 결제 시스템과 함께 운영하시면 됩니다.",
      options: PAYMENT,
    },
    {
      name: "Classin basics from the positioning canon and a product named in the question",
      answer: "Zoom은 화면 공유가 중심이라면, Classin은 판서와 녹화, 복습까지 한 흐름으로 이어져요. 86인치 보드는 일반 교실에서 많이 검토하는 크기예요.",
      options: { draft: "Classin은 수업 전·중·후 흐름을 한곳에서 운영하게 돕습니다.", groundingSentences: [], question: "Zoom이랑 뭐가 달라요?" },
    },
    {
      name: "a button named in the system instruction",
      answer: "체험을 원하시면 답변 아래 [도입 상담 남기기] 버튼으로 남겨 주세요. 담당자가 수업에 맞는 체험 구성을 안내해 드려요.",
      options: {
        draft: "체험·데모는 도입 상담으로 안내해 드립니다.",
        groundingSentences: [],
        question: "무료 체험해 볼 수 있어요?",
        allowList: getFinalAnswerAllowList("onboarding", "onboarding"),
      },
    },
  ]

  for (const { name, answer, options } of normal) {
    it(`keeps ${name}`, () => {
      expect(checkGeneratedAnswer(answer, options)).toEqual({ ok: true, answer, dropped: [] })
    })
  }
})

describe("extractContentSuggest", () => {
  const ROADMAP = leadMagnets.find((item) => item.slug === "classin-90-day-adoption-roadmap")!

  it("takes an allowed resource, replaces the title with the list title and removes the token", () => {
    const result = extractContentSuggest(
      "90일 안에 시범 운영부터 차례로 잡아 보시면 좋아요.\n\n[CONTENT_SUGGEST:type=resource,slug=classin-90-day-adoption-roadmap,title=모델이 지은 제목]"
    )
    expect(result).toEqual({
      text: "90일 안에 시범 운영부터 차례로 잡아 보시면 좋아요.",
      items: [{ type: "resource", slug: ROADMAP.slug, title: ROADMAP.title, url: `/resources/${ROADMAP.slug}` }],
      rejected: 0,
    })
  })

  it("accepts spaces inside the token and keeps one item per slug", () => {
    const result = extractContentSuggest(
      "답입니다. [ CONTENT_SUGGEST : type = resource , slug = classin-90-day-adoption-roadmap , title = 로드맵 ] [CONTENT_SUGGEST:type=resource,slug=classin-90-day-adoption-roadmap,title=또]"
    )
    expect(result.text).toBe("답입니다.")
    expect(result.items.map((item) => item.slug)).toEqual([ROADMAP.slug])
  })

  it("drops tokens whose slug is not on the list and a token cut off at the end", () => {
    expect(extractContentSuggest("답입니다. [CONTENT_SUGGEST:type=blog,slug=made-up-post,title=지어낸 글]")).toEqual({
      text: "답입니다.",
      items: [],
      rejected: 1,
    })
    expect(extractContentSuggest("답입니다.\n[CONTENT_SUGGEST:type=resource,slug=classin-90")).toEqual({
      text: "답입니다.",
      items: [],
      rejected: 1,
    })
  })

  it("lists exactly the resources the system instruction tells the model to suggest, with their page titles", () => {
    const tokenSection = BASE_SYSTEM_INSTRUCTION.slice(BASE_SYSTEM_INSTRUCTION.indexOf("[CONTENT_SUGGEST:"))
    const instructionSlugs = Array.from(tokenSection.matchAll(/slug=([a-z0-9-]+)/g), (match) => match[1]).filter(
      (slug) => slug !== "슬러그"
    )
    expect(new Set(CONTENT_SUGGEST_ALLOWLIST.map((item) => item.slug))).toEqual(new Set(instructionSlugs))
    for (const item of CONTENT_SUGGEST_ALLOWLIST) {
      expect(item.title).toBe(leadMagnets.find((magnet) => magnet.slug === item.slug)?.title)
    }
  })
})
