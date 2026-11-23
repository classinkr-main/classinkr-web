import { afterEach, describe, expect, it, vi } from "vitest"

import { parseSelectedSentenceIds } from "@/lib/chatbot/llm"
import {
  evaluateChatbotQuery,
  MODEL_UNAVAILABLE_ANSWER,
  streamChatbotQuery,
  WEAK_SOURCE_DRAFT_ANSWER,
  type ChatbotStreamEvent,
} from "@/lib/chatbot/service"
import { flagSentence } from "@/lib/chatbot/answer-index/sentences"
import { isPublicChatbotDoc } from "@/lib/chatbot/doc-outline"
import {
  attachGroundingText,
  buildEvidenceSentences,
  getGroundingText,
  keepAnchoredConnectives,
  splitIntoSentences,
} from "@/lib/chatbot/source-grounding"
import { listDocs } from "@/lib/docs"

import {
  enableGenerateMode,
  isEvidenceSelectionCall,
  isOutlinePickCall,
  stubEvidenceSelection,
} from "./helpers/final-answer-llm"

// 2026-11-13: 모델이 쓴 답을 근거와 대조하니, 문서에 답 문장이 없을 때 근거 밖 단정이 56%였다(있을 때 16%).
// 기본 동작을 "모델은 문서에서 답 문장만 고르고, 답은 그 문장 그대로"로 바꿨다. 답 문장이 없으면 못 찾았다고 답한다.
function useStaticDocsWithGemini() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
  vi.stubEnv("SUPABASE_SECRET_KEY", "")
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "")
  vi.stubEnv("GEMINI_API_KEY", "test-gemini-key")
  vi.stubEnv("GEMINI_FAST_MODEL", "")
  vi.stubEnv("GEMINI_REASONING_MODEL", "")
  vi.stubEnv("GEMINI_MODEL", "")
  vi.stubEnv("CHATBOT_FINAL_ANSWER_LLM", "")
}

const NOT_FOUND_LEAD = "이 질문에 딱 맞는 안내는 아직 찾지 못했어요."

describe("evidence sentence helpers", () => {
  it("reads only valid sentence ids from the model output", () => {
    expect(parseSelectedSentenceIds('{"ids":[3,1,3,99,0,2.5]}', 10)).toEqual([1, 3])
    expect(parseSelectedSentenceIds('{"ids":[]}', 10)).toEqual([])
    expect(parseSelectedSentenceIds('{"ids":[1,2,3,4,5,6,7,8]}', 10)).toEqual([1, 2, 3, 4, 5, 6])
    expect(parseSelectedSentenceIds('{"ids":"1"}', 10)).toBeNull()
    expect(parseSelectedSentenceIds("1번 문장입니다", 10)).toBeNull()
    expect(parseSelectedSentenceIds(undefined, 10)).toBeNull()
  })

  it("keeps a quote with its attribution and splits before the next quote", () => {
    expect(
      splitIntoSentences(
        "후기를 모았습니다. “아주 잘 쓰고 있습니다.” (국어 전문 학원 권** 대표) “덕분에 수업 준비가 줄었습니다.” (어학원 고** 원장)"
      )
    ).toEqual([
      "후기를 모았습니다.",
      "“아주 잘 쓰고 있습니다.” (국어 전문 학원 권** 대표)",
      "“덕분에 수업 준비가 줄었습니다.” (어학원 고** 원장)",
    ])
    // 인용문 안의 문장 경계에서는 나누지 않는다.
    expect(splitIntoSentences("“결제 완료했습니다. 아주 잘 쓰고 있어요. 감사합니다.” (어학원 부산 **에듀 원장) “좋은 문물을 접했습니다.”")).toEqual([
      "“결제 완료했습니다. 아주 잘 쓰고 있어요. 감사합니다.” (어학원 부산 **에듀 원장)",
      "“좋은 문물을 접했습니다.”",
    ])
    expect(splitIntoSentences("앱을 6.0.7 이상으로 올립니다. 그다음 1. 알림을 켭니다.")).toEqual([
      "앱을 6.0.7 이상으로 올립니다.",
      "그다음 1. 알림을 켭니다.",
    ])
  })

  it("numbers sentences across sources and drops duplicates, layout references and oversized blocks", () => {
    const first = attachGroundingText(
      { title: "숙제 제출이 안 될 때", heading: "요약", excerpt: "요약..." },
      "> 숙제는 [숙제 제출]까지 눌러야 제출됩니다. 아래 표에서 버튼 위치를 확인합니다. 경로는 [과정] > [숙제]입니다."
    )
    const second = attachGroundingText(
      { title: "수업 가이드", excerpt: "요약..." },
      `숙제는 [숙제 제출]까지 눌러야 제출됩니다. ${"가".repeat(400)}. 마감이 지났다면 선생님께 묻습니다.`
    )

    expect(buildEvidenceSentences([first, second])).toEqual([
      { id: 1, sourceIndex: 0, label: "숙제 제출이 안 될 때 / 요약", text: "숙제는 [숙제 제출]까지 눌러야 제출됩니다." },
      { id: 2, sourceIndex: 0, label: "숙제 제출이 안 될 때 / 요약", text: "경로는 [과정] > [숙제]입니다." },
      { id: 3, sourceIndex: 1, label: "수업 가이드", text: "마감이 지났다면 선생님께 묻습니다." },
    ])
  })

  it("falls back to the excerpt without its dangling tail when a source has no grounding text", () => {
    expect(
      buildEvidenceSentences([{ title: "문서", excerpt: "첫 문장은 온전합니다. 둘째 문장은 중간에서 끊겨..." }]).map((sentence) => sentence.text)
    ).toEqual(["첫 문장은 온전합니다."])
  })
})

// 2026-11-20 조사 G15: legacy 근거 문장 거르기가 답 색인보다 약해, 앞 문장 없이는 뜻이 통하지 않는 문장
// ('그래도 안 되면…')과 뒤 내용 소개('아래를 차례로 봅니다'), 그림 설명·다른 문서로 보내는 말이 혼자 답으로 나갈 수 있었다.
// 답 색인 문장 표시(flagSentence)를 그대로 읽어 caption·meta·nav 는 빼고, connective 는 표시해 앞 문장과 함께일 때만 남긴다.
describe("evidence sentence filtering with the answer-index sentence flags", () => {
  const source = (text: string) => attachGroundingText({ title: "녹화가 안 될 때", heading: "먼저 확인할 것", excerpt: "" }, text)

  it("drops caption, meta, nav and section-guide sentences and marks connectives", () => {
    const sentences = buildEvidenceSentences([
      source(
        [
          "녹화가 시작되지 않으면 수업 설정에서 [수업 녹화]가 켜져 있는지 봅니다.",
          "빨간 박스로 표시한 곳이 녹화 버튼입니다.",
          "이 가이드는 녹화 문제를 정리한 지도입니다.",
          "자세한 방법은 녹화 설정 문서를 참고하세요.",
          "문의를 받은 관리자는 아래를 차례로 봅니다.",
          "그래도 안 되면 앱을 다시 설치합니다.",
        ].join(" ")
      ),
    ])

    expect(sentences.map((sentence) => [sentence.text, sentence.connective ?? false])).toEqual([
      ["녹화가 시작되지 않으면 수업 설정에서 [수업 녹화]가 켜져 있는지 봅니다.", false],
      ["그래도 안 되면 앱을 다시 설치합니다.", true],
    ])
  })

  it("keeps a connective sentence only when the sentence right before it in the same source is picked too", () => {
    const sentences = buildEvidenceSentences([
      source("녹화 버튼이 회색이면 관리자에게 녹화 권한을 요청합니다. 그래도 안 되면 앱을 다시 설치합니다. 이때 녹화본은 지워지지 않습니다."),
      attachGroundingText({ title: "앱 재설치", excerpt: "" }, "재설치 전에 앱을 완전히 종료합니다. 그다음 스토어에서 새로 받습니다."),
    ])
    const byText = (prefix: string) => sentences.find((sentence) => sentence.text.startsWith(prefix))!
    const [permission, retry, meanwhile, quit, store] = ["녹화 버튼", "그래도", "이때", "재설치 전에", "그다음"].map(byText)

    expect([retry.connective, meanwhile.connective, store.connective]).toEqual([true, true, true])
    // 앞 문장 없이 connective 만 골렸다: 뺀다(남는 문장이 없을 수 있다).
    expect(keepAnchoredConnectives([retry])).toEqual([])
    expect(keepAnchoredConnectives([retry, meanwhile])).toEqual([])
    // 앞 문장과 함께 골렸다: 남긴다(연달아 이어지는 connective 도).
    expect(keepAnchoredConnectives([permission, retry, meanwhile])).toEqual([permission, retry, meanwhile])
    // 다른 출처의 앞 번호 문장은 앞 문장이 아니다.
    expect(keepAnchoredConnectives([meanwhile, quit, store])).toEqual([quit, store])
    expect(keepAnchoredConnectives([quit, store])).toEqual([quit, store])
  })

  it("filters the flagged sentences of the public static docs (counts recorded)", () => {
    let candidates = 0
    let filtered = 0
    let connective = 0
    for (const doc of listDocs().filter(isPublicChatbotDoc)) {
      const texts = [[doc.description, doc.chatbotSummary].join(" "), ...doc.sections.map((section) => [section.body, ...(section.steps ?? [])].join(" "))]
      for (const text of texts) {
        const grounded = attachGroundingText({ title: doc.title, excerpt: "" }, text)
        const kept = buildEvidenceSentences([grounded])
        const keptTexts = new Set(kept.map((sentence) => sentence.text))
        connective += kept.filter((sentence) => sentence.connective).length
        for (const sentence of splitIntoSentences(getGroundingText(grounded) ?? "")) {
          if (sentence.length < 6 || sentence.length > 360) continue
          candidates += 1
          const flags = flagSentence(sentence, { docLink: /\[[^\]]+]\(\/docs\//.test(sentence), table: false })
          const dropped = flags.includes("caption") || flags.includes("meta") || flags.includes("nav")
          if (dropped) {
            filtered += 1
            expect(keptTexts.has(sentence), `${doc.slug}: ${sentence}`).toBe(false)
          }
        }
      }
    }
    // 2026-11-20 공개 문서(77개): 후보 약 4,100문장 가운데 caption·meta·nav 로 빠지는 문장 수십 개, connective 표시 수십 개.
    expect(candidates).toBeGreaterThan(3000)
    expect(filtered).toBeGreaterThan(20)
    expect(filtered).toBeLessThan(candidates * 0.05)
    expect(connective).toBeGreaterThan(20)
  })
})

describe("chatbot evidence selection (default select mode)", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it("answers with the document sentences the model picked, word for word, and does not rewrite", async () => {
    useStaticDocsWithGemini()
    const { requests, otherCalls } = stubEvidenceSelection((text) => text.startsWith("직접 만들 때는 객관식"))

    const result = await evaluateChatbotQuery("OMR 카드는 어떤 문제 유형을 추가할 수 있나요?")
    const picked = requests[0].sentences.filter((sentence) => sentence.text.startsWith("직접 만들 때는 객관식"))

    expect(picked).toHaveLength(1)
    expect(result.answer).toContain(picked[0].text)
    expect(result.answerMode).toBe("direct_answer")
    expect(result.unresolved).toBe(false)
    expect(result.needsHandoff).toBe(false)
    // 답에 쓴 문서만 출처로 남는다.
    expect(result.sources).toHaveLength(1)
    // 문장을 고르는 호출 한 번뿐이고, 답을 다시 쓰는 호출은 없다.
    expect(requests).toHaveLength(1)
    expect(otherCalls.filter((call) => call.url.includes(":generateContent"))).toHaveLength(0)
  })

  it("offers the model more than the two card sources so answers in sibling sections can be found", async () => {
    useStaticDocsWithGemini()
    const { requests } = stubEvidenceSelection(() => false)

    await evaluateChatbotQuery("하이브리드 수업 토글은 언제 켜야 하나요?")

    expect(new Set(requests[0].labels).size).toBeGreaterThanOrEqual(3)
    expect(requests[0].sentences.length).toBeLessThanOrEqual(48)
    expect(requests[0].prompt.startsWith("고객 질문: 하이브리드 수업 토글은 언제 켜야 하나요?")).toBe(true)
  })

  it("says it could not find an answer instead of pasting an unrelated chunk or guessing", async () => {
    useStaticDocsWithGemini()
    stubEvidenceSelection(() => false)

    const question = "수업 중에 학생 휴대폰 잠글 수 있어요?"
    const draft = await evaluateChatbotQuery(question, { generateAnswer: false })
    const result = await evaluateChatbotQuery(question)

    // 결정형 초안은 접속 끊김 안내 조각이었다(질문과 무관).
    expect(draft.answerMode).toBe("direct_answer")
    expect(result.answer).toBe(WEAK_SOURCE_DRAFT_ANSWER)
    expect(result.answer).not.toBe(draft.answer)
    expect(result.answerMode).toBe("doc_suggestion")
    expect(result.unresolved).toBe(true)
    expect(result.needsHandoff).toBe(false)
    expect(result.sources).toHaveLength(0)
  })

  it("does not tack a sales question or a how-to opener onto a not-found answer", async () => {
    useStaticDocsWithGemini()
    stubEvidenceSelection(() => false)

    const sales = await evaluateChatbotQuery("수학학원 사례 있나요")
    expect(sales.answer).toBe(WEAK_SOURCE_DRAFT_ANSWER)

    const apologetic = await evaluateChatbotQuery(
      "죄송합니다, 통계 메뉴에서 학생별 출석률을 볼 수 있다고 들었는데 어디서 확인하는지 알려 주실 수 있을까요?"
    )
    expect(apologetic.answer).toContain(NOT_FOUND_LEAD)
    expect(apologetic.answer).not.toContain("순서대로 알려 드릴게요")
  })

  // 예전에는 선별 호출이 실패하면 검색 조각 초안을 그대로 냈다. 2026-11-18 모델 결제 실패(402) 때 이 초안이 엉뚱한 답으로
  // 대량으로 나가, 모델이 켜져 있는데 선별이 실패하면 조각 대신 고정 문구와 상담 버튼을 낸다(tests/chatbot/model-unavailable.test.ts).
  it("does not ship the unverified excerpt draft when the selection call fails", async () => {
    useStaticDocsWithGemini()
    const question = "OMR 카드 문제 유형은 뭐가 있어요"
    const draft = await evaluateChatbotQuery(question, { generateAnswer: false })

    vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, text: async () => "", json: async () => ({}) }))
    )
    const result = await evaluateChatbotQuery(question)

    expect(draft.sources.length).toBeGreaterThan(0)
    expect(result.answer).toBe(MODEL_UNAVAILABLE_ANSWER)
    expect(result.answer).not.toContain(draft.answer.split("\n\n")[0])
    expect(result.answerMode).toBe("handoff")
    expect(result.needsHandoff).toBe(true)
    expect(result.sources).toHaveLength(0)
  })

  it("leaves curated answers alone and never calls the model for them", async () => {
    // 정해 둔 답 확인 관문(판정 호출)은 tests/chatbot/answer-gate.test.ts 가 따로 본다. 여기서는 재작성·선별 호출이 없는지만 본다.
    vi.stubEnv("CHATBOT_ANSWER_GATE", "off")
    useStaticDocsWithGemini()
    const { fetchMock } = stubEvidenceSelection(() => true)

    const result = await evaluateChatbotQuery("전자칠판 스펙 알려줘")

    expect(result.answer).toContain("S75")
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes(":generateContent"))).toHaveLength(0)
  })

  it("does not answer a request for a person with an unrelated chunk", async () => {
    useStaticDocsWithGemini()
    stubEvidenceSelection(() => false)

    const question = "데모를 한번 보고 싶어요"
    const draft = await evaluateChatbotQuery(question, { generateAnswer: false })
    const result = await evaluateChatbotQuery(question)

    expect(draft.answerMode).toBe("handoff")
    expect(result.answerMode).toBe("handoff")
    expect(result.needsHandoff).toBe(true)
    expect(result.answer).toContain("상담이 필요한 내용으로 확인했습니다.")
    expect(result.answer).not.toBe(draft.answer)
    expect(result.sources).toHaveLength(0)
  })

  it("streams the same selected answer as a single replace, with no model-written deltas", async () => {
    useStaticDocsWithGemini()
    stubEvidenceSelection((text) => text.startsWith("직접 만들 때는 객관식"))

    const events: ChatbotStreamEvent[] = []
    await streamChatbotQuery({ message: "OMR 카드에 넣을 수 있는 문제 유형 알려주세요" }, {}, (event) => events.push(event))
    const replace = events.find((event) => event.type === "replace")
    const meta = events.find((event) => event.type === "meta")

    expect(events.some((event) => event.type === "delta")).toBe(false)
    expect(replace?.type === "replace" ? replace.answer : "").toContain("직접 만들 때는 객관식, 다중 선택, 참/거짓")
    expect(meta?.type === "meta" ? meta.meta.answerMode : "").toBe("direct_answer")
    expect(meta?.type === "meta" ? meta.meta.unresolved : true).toBe(false)
  })

  it("streams a not-found answer when no sentence answers the question", async () => {
    useStaticDocsWithGemini()
    stubEvidenceSelection(() => false)

    const events: ChatbotStreamEvent[] = []
    await streamChatbotQuery({ message: "수업 중에 학생 태블릿 화면을 잠글 수 있나요?" }, {}, (event) => events.push(event))
    const replace = events.find((event) => event.type === "replace")
    const meta = events.find((event) => event.type === "meta")

    expect(replace?.type === "replace" ? replace.answer : "").toContain(NOT_FOUND_LEAD)
    expect(meta?.type === "meta" ? meta.meta.unresolved : false).toBe(true)
    expect(meta?.type === "meta" ? meta.meta.sources : [{}]).toHaveLength(0)
  })
})

describe("chatbot evidence selection (generate mode)", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it("lets the model rewrite only from the picked sentences", async () => {
    useStaticDocsWithGemini()
    enableGenerateMode()

    const generationPrompts: string[] = []
    stubEvidenceSelection(
      (text) => text.startsWith("직접 만들 때는 객관식"),
      async (url, init) => {
        if (String(url).includes(":generateContent")) {
          const body = JSON.parse(String(init?.body)) as { contents: { parts: { text: string }[] }[] }
          generationPrompts.push(body.contents.at(-1)?.parts[0]?.text ?? "")
          return {
            ok: true,
            json: async () => ({
              candidates: [{ content: { parts: [{ text: "Classin OMR 카드에는 객관식, 다중 선택, 참/거짓, 빈칸 채우기, 서술형 문항을 넣을 수 있어요." }] } }],
            }),
          }
        }
        return { ok: true, json: async () => ({}) }
      }
    )

    const result = await evaluateChatbotQuery("OMR 카드에 어떤 문항을 넣을 수 있는지 궁금합니다")
    const prompt = generationPrompts[0] ?? ""
    const context = prompt.split("안전 초안(")[0]

    expect(generationPrompts).toHaveLength(1)
    expect(result.answer).toContain("넣을 수 있어요")
    expect(prompt).toContain("현재 응답 모드: direct_answer")
    expect(prompt).toContain("근거 범위")
    // 모델에게 넘긴 근거는 고른 문장뿐이다.
    expect(context).toContain("직접 만들 때는 객관식, 다중 선택, 참/거짓")
    expect(context.match(/\[내부 정보 \d\]/g)).toHaveLength(1)
    expect(context.split("\n").filter((line) => line.startsWith("직접 만들 때는")).join("").length).toBeLessThan(200)
  })

  it("does not ask the model to write when no sentence answers the question", async () => {
    useStaticDocsWithGemini()
    enableGenerateMode()
    const { fetchMock, requests } = stubEvidenceSelection(() => false)

    const result = await evaluateChatbotQuery("수업 중에 학생 폰을 잠가 둘 수 있나요?")
    // 못 찾은 뒤의 두 번째 검색(목차에서 절 번호 고르기)도 글을 쓰지 않는 호출이다.
    const generationCalls = fetchMock.mock.calls.filter(
      ([url, init]) =>
        String(url).includes(":generateContent") && !isEvidenceSelectionCall(init) && !isOutlinePickCall(init)
    )

    expect(requests).toHaveLength(1)
    expect(result.answer).toBe(WEAK_SOURCE_DRAFT_ANSWER)
    expect(generationCalls).toHaveLength(0)
  })
})
