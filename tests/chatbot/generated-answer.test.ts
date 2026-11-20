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

// 2026-11-20 검토 결과 고침. 모델 글은 이 시험을 위해 지었다.
describe("checkGeneratedAnswer: 지어낸 숫자·메뉴를 더 넓게 본다", () => {
  const SHARING: GeneratedAnswerCheckOptions = {
    draft: "토론형 수업에서도 자료 공유와 판서를 함께 쓸 수 있어요.",
    groundingSentences: ["토론형 수업에서도 자료 공유와 판서를 함께 쓸 수 있어요."],
    question: "토론 수업도 돼요?",
    allowList: getFinalAnswerAllowList("general", "docs_lookup"),
  }
  const GOOD = "토론형 수업에서도 자료 공유와 판서를 함께 쓸 수 있어요."

  it.each([
    ["한글 수 기간", "무료 체험은 한 달 동안 모든 기능을 쓸 수 있어요.", "unsupported_number"],
    ["한글 수 인원", "한 수업에 학생을 백 명까지 넣을 수 있어요.", "unsupported_number"],
    ["따옴표 메뉴", "‘토론 모드’ 메뉴를 켜면 바로 시작돼요.", "unsupported_menu"],
    ["굵게 쓴 버튼", "**토론 모드** 버튼을 누르면 됩니다.", "unsupported_menu"],
    ["두 마디 버전", "앱 5.2 버전부터 지원해요.", "unsupported_number"],
  ])("%s 문장은 버린다", (_label, sentence, issue) => {
    const result = checkGeneratedAnswer(`${GOOD} ${sentence}`, SHARING)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.answer).toBe(GOOD)
    expect(result.dropped.map((item) => item.issue)).toEqual([issue])
  })

  it("시스템 지시에만 있는 숫자는 이웃 명사가 다르면 버린다('2주'는 체험 문장의 숫자다)", () => {
    const draft = "수업이 끝나면 녹화를 다시 볼 수 있어요."
    const result = checkGeneratedAnswer("녹화 영상은 2주 동안 보관돼요.", { draft, groundingSentences: [draft], allowList: SHARING.allowList })
    expect(result).toMatchObject({ ok: false, reason: "no_sentences_left" })
  })

  it("흔한 한글 수 표현('한 번에', '두 가지')은 숫자로 보지 않는다", () => {
    const answer = "한 번에 두 가지 자료를 함께 띄워 쓸 수 있어요."
    expect(checkGeneratedAnswer(answer, RECORDING)).toEqual({ ok: true, answer, dropped: [] })
  })

  it("근거에 있는 숫자는 한글 수로 써도 통과한다('1개월' = '한 달')", () => {
    const options = { draft: "체험 계정은 1개월 동안 쓸 수 있어요.", groundingSentences: ["체험 계정은 1개월 동안 쓸 수 있어요."] }
    const answer = "체험 계정은 한 달 동안 쓸 수 있어요."
    expect(checkGeneratedAnswer(answer, options)).toEqual({ ok: true, answer, dropped: [] })
  })
})

describe("checkGeneratedAnswer: '가능' 뒤집기를 문장 단위·버린 뒤에도 본다", () => {
  const TABLET: GeneratedAnswerCheckOptions = {
    draft: "안드로이드 태블릿에서는 화면 공유를 지원하지 않아요.",
    groundingSentences: ["안드로이드 태블릿에서는 화면 공유를 지원하지 않아요."],
    question: "안드로이드 태블릿 화면 공유 돼요?",
  }

  it("'(으)ㄹ 수 없'을 같은 동사·대상의 '수 있'으로 바꾸면 뒤집은 것이다", () => {
    const options = { draft: "끝난 수업은 구성원 기록과 연결돼 있어 앱에서 지울 수 없습니다.", groundingSentences: [] }
    expect(checkGeneratedAnswer("끝난 수업도 앱에서 바로 지울 수 있어요. 목록에서 길게 누르면 됩니다.", options)).toMatchObject({
      ok: false,
      reason: "constraint_flipped",
    })
  })

  it("'-지 않'을 같은 동사·대상의 긍정으로 바꾸면 뒤집은 것이다", () => {
    const options = { draft: "지운 녹화본은 복구되지 않습니다.", groundingSentences: [] }
    expect(checkGeneratedAnswer("지운 녹화본도 관리자 화면에서 복구돼요.", options)).toMatchObject({ ok: false, reason: "constraint_flipped" })
  })

  it("제약은 지키고 다른 일을 '할 수 있다'고 한 답은 통과한다", () => {
    const options = { draft: "지운 녹화본은 복구되지 않습니다.", groundingSentences: ["녹화본 삭제 기간은 [저장 설정]에서 바꿉니다."] }
    const answer = "녹화본 삭제 기간은 [저장 설정]에서 바꿀 수 있어요. 지운 녹화본은 복구되지 않아요."
    expect(checkGeneratedAnswer(answer, options)).toEqual({ ok: true, answer, dropped: [] })
  })

  it("제약 문장이 근거 대조로 버려져 '가능'만 남으면 답 전체를 버린다", () => {
    const result = checkGeneratedAnswer(
      "안드로이드 태블릿은 2025년 기준 화면 공유를 지원하지 않아요. 앱을 새로 받으면 화면 공유도 가능해요.",
      TABLET
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(["constraint_dropped", "constraint_flipped"]).toContain(result.reason)
    expect(result.dropped.map((item) => item.issue)).toEqual(["unsupported_number"])
  })

  it("'확인이 필요 없이 … 가능해요'는 제약을 지킨 말이 아니다", () => {
    expect(checkGeneratedAnswer("확인이 필요 없이 안드로이드 태블릿에서도 화면 공유가 가능해요.", TABLET)).toMatchObject({
      ok: false,
      reason: "constraint_flipped",
    })
  })

  it("조건('저장되지 않으면')은 제약이 아니다: 그 문장이 버려져도 나머지를 쓴다", () => {
    const options: GeneratedAnswerCheckOptions = {
      draft: "바로 저장되지 않으면 [다운로드]를 마우스 오른쪽 버튼으로 누르세요.",
      groundingSentences: GROUNDING,
    }
    const result = checkGeneratedAnswer(`${GOOD_SENTENCE} 바로 저장되지 않으면 [AI 저장] 메뉴를 누르세요.`, options)
    expect(result).toMatchObject({ ok: true, answer: GOOD_SENTENCE })
  })
})
