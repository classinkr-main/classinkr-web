import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { compileAnswerIndex, type CompiledAnswerIndex } from "@/lib/chatbot/answer-index/compile"
import { curatedTextHash, findCuratedEntry } from "@/lib/chatbot/answer-index/curated"
import { answerTextHash } from "@/lib/chatbot/answer-index/hash"
import { loadAnswerIndexData } from "@/lib/chatbot/answer-index/load"
import {
  absentTailLine,
  assemblePieces,
  buildAnswerIndexCore,
  type Piece,
  gapLeadLine,
  GAP_RELATED_INTRO,
  LEAD_TEXT,
  topicParticle,
  COMPOUND_CLOSING_LINE,
  COMPOUND_FOLLOW_UP_RESERVE,
  SEGMENT_ABSENT_LINE,
  SEGMENT_NOTFOUND_LINE,
  SEGMENT_RETRY_LINE,
  SEGMENT_SYMPTOM_LINE,
  shortTopic,
  type AnswerIndexCoreParts,
  type AnswerIndexHost,
  type RespondContext,
} from "@/lib/chatbot/answer-index/respond"
import type { AnswerIndexDecision, AnswerIndexUnit, AskType } from "@/lib/chatbot/answer-index/types"
import { CS_FIGMA_GUIDES, INTERNAL_ONLY_CS_FIGMA_DOC_SLUGS } from "@/lib/cs-figma-guides"
import { BASIC_QUICK_ANSWERS } from "@/lib/chatbot/quick-answers-basics"
import { FIELD_QUICK_ANSWERS } from "@/lib/chatbot/quick-answers-field"
import { buildSymptomTopicAnswer, SYMPTOM_TOPICS } from "@/lib/chatbot/symptom-triage"

import { CARDS, copyFixture, fixtureUnits } from "./index-fixture"
import { writeDataFile } from "./helpers"

/**
 * 답 조립(respond.ts) 카드 종류별 시험. 결정은 손으로 만들고(점수 계산과 떼어 본다), 기존 답 만드는 함수는 가짜 host 로 바꾼다.
 * 자료는 fixtures/basic 에 옛 답 카드(field·basics·svc)·정책·howto(증상·가이드)·관련 문장이 있는 공백 카드를 더한 임시 폴더다.
 */

const NO_SOURCE = "못 찾음 첫 문단.\n\n못 찾음 둘째 문단."
const SYMPTOM_ABSTAIN = "증상 못 찾음 문구."

function makeHost() {
  const calls: string[] = []
  const finals = new Set<object>()
  const parts = (answer: string, extra: Partial<AnswerIndexCoreParts> = {}): AnswerIndexCoreParts => ({
    response: { answer, answerMode: "direct_answer", confidence: 0.8, needsHandoff: false, sources: [], suggestedQuestions: ["추천"], unresolved: false },
    category: "general",
    intent: "docs_lookup",
    handoffIntent: "demo",
    ...extra,
  })
  const host: AnswerIndexHost = {
    noSourceAnswer: NO_SOURCE,
    symptomAbstainAnswer: SYMPTOM_ABSTAIN,
    suggestedQuestions: (category) => [`추천:${category}`],
    sourceCategory: (docCategory) => `src:${docCategory}`,
    basicsSource: (docPath, heading) => {
      calls.push(`basicsSource:${docPath}`)
      return { title: "기본 문서", heading: heading ?? "요약", urlPath: docPath, category: "guide", excerpt: "", score: 300 }
    },
    handoff: (text, kind) => {
      calls.push(`handoff:${kind}`)
      return parts("상담 연결 답", { handoffIntent: kind, response: { ...parts("상담 연결 답").response, answerMode: "handoff", needsHandoff: true } })
    },
    symptom: (triage) => {
      calls.push(`symptom:${triage.topicId}`)
      return parts(triage.answer, { handoffIntent: "support", topicId: triage.topicId, response: { ...parts(triage.answer).response, answerMode: triage.answerMode } })
    },
    guide: (guide) => {
      calls.push(`guide:${guide.slug}`)
      return parts(`가이드 답:${guide.slug}`)
    },
    selfKnowledge: (entry) => {
      calls.push(`self:${entry.key}`)
      return parts(entry.answer.join("\n\n"))
    },
    markFinal: (response) => {
      finals.add(response)
    },
  }
  return { host, calls, finals }
}

const symptomTopic = SYMPTOM_TOPICS.find((topic) => buildSymptomTopicAnswer(topic, { question: "" }) !== null)!
const guide = CS_FIGMA_GUIDES.find((candidate) => !INTERNAL_ONLY_CS_FIGMA_DOC_SLUGS.has(candidate.docSlug))!
const field = FIELD_QUICK_ANSWERS.find((entry) => entry.handoff === "support")!
const basics = BASIC_QUICK_ANSWERS.find((entry) => entry.docPath)!
const POLICY_TEXT = "무료 체험 기간은 담당자가 확인해 안내해 드려요."

const MEMBERS_UNIT = "doc:/docs/fake/members#0"
const MEMBERS_HASHES = ["4a1ed9c6b1cb54f0", "09f182bba9276931"]

const EXTRA = {
  first: "doc:/docs/fake/members#0/first-sentence",
  headline: "doc:/docs/fake/members#0/headline",
  headlineApart: "doc:/docs/fake/members#0/headline-apart",
  staleHeadline: "doc:/docs/fake/members#0/stale-headline",
  field: `fixed:field-${field.id}`,
  basics: `fixed:basics-${basics.id}`,
  svc: "fixed:svc-showroom",
  policy: "policy:free-trial",
  symptom: `howto:${symptomTopic.id}`,
  guide: `howto:guide-${guide.slug}`,
  gapRelated: "gap:recording/cloud-limit",
  verbatimPolicy: "fixed:policy-governed",
}

function extraCards() {
  const base = { tier: "standard", status: "active" } as const
  return [
    { ...base, id: EXTRA.field, kind: "fixed", area: "pricing", topic: "결제 사칭 문자", answer: { curatedRef: { module: "field", id: field.id, textHash: curatedTextHash({ module: "field", id: field.id, textHash: "" })! } } },
    { ...base, id: EXTRA.basics, kind: "fixed", area: "company", topic: "해외 법인", answer: { curatedRef: { module: "basics", id: basics.id, textHash: curatedTextHash({ module: "basics", id: basics.id, textHash: "" })! } } },
    { ...base, id: EXTRA.svc, kind: "fixed", area: "company", topic: "쇼룸", answer: { curatedRef: { module: "svc", id: "showroom", textHash: "0000000000000000" } } },
    { ...base, id: EXTRA.policy, kind: "policy", area: "pricing", topic: "무료 체험", answer: { text: POLICY_TEXT, textHash: answerTextHash(POLICY_TEXT), policyRef: "HQ-03" } },
    { ...base, id: EXTRA.symptom, kind: "howto", area: "support", topic: "증상 안내", answer: { symptomTopic: symptomTopic.id } },
    { ...base, id: EXTRA.guide, kind: "howto", area: "classroom", topic: "가이드", answer: { guide: guide.slug } },
    {
      ...base,
      id: EXTRA.gapRelated,
      kind: "gap",
      area: "recording",
      topic: "클라우드 저장 한도",
      answer: { template: "gap_default", handoff: null, related: [{ unit: "doc:/docs/fake/recording#1", i: 0, hash: "d1d17cb3222c7dba" }] },
    },
    {
      ...base,
      id: EXTRA.first,
      kind: "doc",
      area: "course",
      topic: "구성원 삭제 뒤 재초대",
      answer: { sentences: [{ unit: MEMBERS_UNIT, ids: [0, 1], hashes: MEMBERS_HASHES }], first: { unit: MEMBERS_UNIT, i: 1, hash: MEMBERS_HASHES[1] } },
    },
    {
      ...base,
      id: EXTRA.headline,
      kind: "doc",
      area: "course",
      topic: "구성원 삭제 결론",
      answer: {
        lead: "how_to",
        sentences: [{ unit: MEMBERS_UNIT, ids: [0, 1], hashes: MEMBERS_HASHES }],
        headline: { text: "삭제한 학생은 나중에 다시 초대할 수 있어요.", basis: [{ unit: MEMBERS_UNIT, i: 1, hash: MEMBERS_HASHES[1] }] },
      },
    },
    {
      ...base,
      id: EXTRA.headlineApart,
      kind: "doc",
      area: "course",
      topic: "구성원 삭제와 녹화 파일",
      answer: {
        sentences: [
          { unit: MEMBERS_UNIT, ids: [0], hashes: [MEMBERS_HASHES[0]] },
          { unit: "doc:/docs/fake/recording#1", ids: [0], hashes: ["d1d17cb3222c7dba"] },
        ],
        headline: { text: "녹화 파일은 내려받아 둘 수 있어요.", basis: [{ unit: "doc:/docs/fake/recording#1", i: 0, hash: "d1d17cb3222c7dba" }] },
      },
    },
    {
      ...base,
      id: EXTRA.staleHeadline,
      kind: "doc",
      area: "course",
      topic: "구성원 삭제 결론(근거 어긋남)",
      answer: {
        sentences: [{ unit: MEMBERS_UNIT, ids: [0, 1], hashes: MEMBERS_HASHES }],
        headline: { text: "근거가 어긋난 결론이에요.", basis: [{ unit: MEMBERS_UNIT, i: 1, hash: "0000000000000000" }] },
      },
    },
    { ...base, id: EXTRA.verbatimPolicy, kind: "fixed", area: "pricing", topic: "정책 고정 답", policyGoverned: true, answer: { text: POLICY_TEXT, textHash: answerTextHash(POLICY_TEXT) } },
  ]
}

let index: CompiledAnswerIndex
let excluded: { id: string; reason: string }[]
let cleanup: () => void

beforeAll(() => {
  const copy = copyFixture()
  cleanup = copy.cleanup
  writeDataFile(copy.dir, "cards/zz-extra.json", extraCards())
  const data = loadAnswerIndexData({
    dir: copy.dir,
    currentUnits: fixtureUnits(),
    symptomTopics: new Set([symptomTopic.id]),
    guides: new Set([guide.slug]),
    curatedTextHash,
  })
  excluded = data.excluded
  index = compileAnswerIndex(data)
})

afterAll(() => {
  cleanup?.()
  vi.unstubAllEnvs()
})

function decision(kind: AnswerIndexDecision["kind"], card: string | null, extra: Partial<AnswerIndexDecision> = {}): AnswerIndexDecision {
  return { kind, card, conf: 0.9, askType: null, top: card ? [{ id: card, s: 1, conf: 0.9 }] : [], unexplained: [], absentHit: null, absentTail: null, segments: null, ...extra }
}

function respond(d: AnswerIndexDecision, question = "질문", options: { env?: Record<string, string>; index?: CompiledAnswerIndex } = {}) {
  const { host, calls, finals } = makeHost()
  // 카드 글 그대로의 시험이라 기본은 다듬기(shape)를 끈다. 다듬기·복합 답은 따로 켜서 본다.
  const ctx: RespondContext = { index: options.index ?? index, host, router: "compiled", version: "test+c1", env: { CHATBOT_COMPILED_SHAPE: "off", ...options.env } }
  const core = buildAnswerIndexCore(d, { redacted: question }, Date.now(), ctx)
  return { core, calls, finals }
}

const yesno = (askType: AskType | null) => ({ askType })

describe("respond: doc cards", () => {
  it("re-reads card sentences from the current units and joins consecutive ones into one paragraph", () => {
    const { core, finals } = respond(decision("answer", CARDS.remove, yesno("howto")))
    expect(core.response.answer).toBe(`${LEAD_TEXT.how_to} 코스 구성원 목록에서 학생을 선택한 뒤 [삭제]를 누릅니다. 삭제한 학생은 다시 초대할 수 있습니다.`)
    expect(core.response.answerMode).toBe("direct_answer")
    expect(core.response.sources).toEqual([
      expect.objectContaining({ title: "가짜 문서 members", heading: "코스 구성원 삭제", urlPath: "/docs/fake/members", category: "src:fake" }),
    ])
    expect(core.answerIndex).toMatchObject({ decision: "answer", card: CARDS.remove, partial: false, router: "compiled", scope: "in" })
    expect(finals.has(core.response)).toBe(true)
  })

  it("adds the yes_can lead only for yes/no questions with a verified lead basis", () => {
    expect(respond(decision("answer", CARDS.chat, yesno("yesno"))).core.response.answer.startsWith(LEAD_TEXT.yes_can)).toBe(true)
    expect(respond(decision("answer", CARDS.chat, yesno("howto"))).core.response.answer.startsWith("수업 중에")).toBe(true)
    expect(respond(decision("answer", CARDS.chat, yesno("where"))).core.response.answer.startsWith("수업 중에")).toBe(true)
  })

  it("drops leads and tails under CHATBOT_COMPILED_FRAMING=verbatim", () => {
    const d = decision("answer", CARDS.chat, { askType: "yesno", absentTail: "A_isms", absentHit: "A_isms" })
    const full = respond(d).core
    const verbatim = respond(d, "질문", { env: { CHATBOT_COMPILED_FRAMING: "verbatim" } }).core
    expect(full.response.answer).toContain(absentTailLine("ISMS 같은 보안 인증"))
    expect(full.answerIndex.partial).toBe(true)
    expect(full.answerIndex.absentTail).toBe("A_isms")
    expect(verbatim.response.answer).toBe("수업 중에 [채팅 금지] 버튼을 누르면 학생 채팅을 막을 수 있습니다. 경로: 교실 > [도구] > [채팅 금지]")
    expect(verbatim.answerIndex.partial).toBe(false)
    expect(verbatim.answerIndex.absentTail).toBeNull()
  })

  it("falls back to the not-found answer when a sentence no longer matches its hash", () => {
    const units = new Map<string, AnswerIndexUnit>(index.currentUnits)
    const unit = units.get("doc:/docs/fake/members#0")!
    units.set(unit.unitId, { ...unit, sentences: unit.sentences.map((sentence) => (sentence.i === 1 ? { ...sentence, hash: "ffffffffffffffff" } : sentence)) })
    const { core } = respond(decision("answer", CARDS.remove), "질문", { index: { ...index, currentUnits: units } })
    expect(core.response.answer).toBe(NO_SOURCE)
    expect(core.response.answerMode).toBe("fallback")
    expect(core.answerIndex).toMatchObject({ decision: "abstain", card: null })
    expect(core.answerIndex.unavailable).toContain("stale_sentence:doc:/docs/fake/members#0#1")
  })

  it("treats an unknown card as not found", () => {
    const { core } = respond(decision("answer", "doc:/docs/none#0/missing"))
    expect(core.response.answer).toBe(NO_SOURCE)
    expect(core.answerIndex.unavailable).toBe("missing_card:doc:/docs/none#0/missing")
  })

  it("keeps the vote-rescue mark in the trace for a rendered answer and clears it when the card cannot be rendered", () => {
    const rescued = respond(decision("answer", CARDS.remove, { rescue: "vote", conf: 0.2 })).core
    expect(rescued.answerIndex).toMatchObject({ decision: "answer", card: CARDS.remove, decidedBy: "index:vote-rescue" })
    expect(rescued.response.answerMode).toBe("direct_answer")
    const missing = respond(decision("answer", "doc:/docs/none#0/missing", { rescue: "vote" })).core
    expect(missing.answerIndex).toMatchObject({ decision: "abstain", card: null, decidedBy: null })
    expect(respond(decision("answer", CARDS.remove)).core.answerIndex.decidedBy).toBeNull()
  })
})

describe("respond: first sentence and headline (R2 B4)", () => {
  it("moves the conclusion sentence (first) to the front without changing the sentence set", () => {
    const answer = respond(decision("answer", EXTRA.first)).core.response.answer
    expect(answer).toBe("삭제한 학생은 다시 초대할 수 있습니다.\n\n코스 구성원 목록에서 학생을 선택한 뒤 [삭제]를 누릅니다.")
  })

  it("draws no headline by default (CHATBOT_COMPILED_HEADLINE off, 결정 10 시험 단계)", () => {
    expect(respond(decision("answer", EXTRA.headlineApart)).core.response.answer).toBe(
      "코스 구성원 목록에서 학생을 선택한 뒤 [삭제]를 누릅니다.\n\n녹화 파일은 [다운로드] 버튼으로 내 컴퓨터에 저장할 수 있습니다."
    )
  })

  it("with the switch on, puts the headline in front only when its basis is not already in the first paragraph", () => {
    const env = { CHATBOT_COMPILED_HEADLINE: "on" }
    expect(respond(decision("answer", EXTRA.headlineApart), "질문", { env }).core.response.answer).toBe(
      "녹화 파일은 내려받아 둘 수 있어요.\n\n코스 구성원 목록에서 학생을 선택한 뒤 [삭제]를 누릅니다.\n\n녹화 파일은 [다운로드] 버튼으로 내 컴퓨터에 저장할 수 있습니다."
    )
    // 근거 문장이 첫 문단에 있으면 같은 말을 두 번 하게 되어 그리지 않는다(리드는 지금처럼).
    expect(respond(decision("answer", EXTRA.headline, yesno("howto")), "질문", { env }).core.response.answer).toBe(
      "이렇게 하면 돼요. 코스 구성원 목록에서 학생을 선택한 뒤 [삭제]를 누릅니다. 삭제한 학생은 다시 초대할 수 있습니다."
    )
    expect(respond(decision("answer", EXTRA.staleHeadline), "질문", { env }).core.response.answer).toBe(
      "코스 구성원 목록에서 학생을 선택한 뒤 [삭제]를 누릅니다. 삭제한 학생은 다시 초대할 수 있습니다."
    )
  })

  it("ignores first and headline under verbatim framing", () => {
    const env = { CHATBOT_COMPILED_FRAMING: "verbatim" }
    expect(respond(decision("answer", EXTRA.first), "질문", { env }).core.response.answer.startsWith("코스 구성원 목록에서")).toBe(true)
    expect(respond(decision("answer", EXTRA.headline), "질문", { env }).core.response.answer.startsWith("코스 구성원 목록에서")).toBe(true)
  })
})

describe("respond: fixed and policy cards", () => {
  it("keeps the old field answer as-is (text, handoff button, englishSummary, sales follow-up switch)", () => {
    const { core } = respond(decision("answer", EXTRA.field))
    expect(core.response.answer).toBe(field.answer.join("\n\n"))
    expect(core.response.answerMode).toBe("direct_answer")
    expect(core.response.needsHandoff).toBe(true)
    expect(core.handoffIntent).toBe("support")
    expect(core.category).toBe(field.category)
    expect(core.englishSummary).toBe(field.en)
    expect(core.suppressSalesFollowUp).toBe(!field.salesFollowUp)
    expect(core.response.suggestedQuestions).toEqual(field.suggestedQuestions)
  })

  it("attaches the basics source document through the host", () => {
    const { core, calls } = respond(decision("answer", EXTRA.basics))
    expect(core.response.answer).toBe(basics.answer.join("\n\n"))
    expect(calls).toContain(`basicsSource:${basics.docPath}`)
    expect(core.response.sources.map((source) => source.urlPath)).toEqual([basics.docPath])
  })

  it("drops KEEP cards whose old answer cannot be called by id at runtime (svc)", () => {
    expect(excluded).toContainEqual(expect.objectContaining({ id: EXTRA.svc, reason: "stale: 옛 답 없음(svc:showroom)" }))
    expect(index.cardById.has(EXTRA.svc)).toBe(false)
  })

  it("uses FIX text cards verbatim", () => {
    const { core } = respond(decision("answer", CARDS.price))
    expect(core.response.answer).toBe("요금은 학생 수와 사용 기간에 따라 달라요. 정확한 견적은 상담으로 안내해 드려요.")
    expect(core.response.sources).toEqual([])
    expect(core.response.suggestedQuestions).toEqual(["추천:general"])
  })

  it("never adds leads or tails to policy-governed cards", () => {
    for (const id of [EXTRA.policy, EXTRA.verbatimPolicy]) {
      const { core } = respond(decision("answer", id, { askType: "yesno", absentTail: "A_isms", absentHit: "A_isms" }))
      expect(core.response.answer).toBe(POLICY_TEXT)
      expect(core.answerIndex.partial).toBe(false)
    }
  })
})

describe("respond: howto, handoff, gap, abstain, clarify", () => {
  it("builds howto answers with the existing symptom and guide builders", () => {
    const symptom = respond(decision("answer", EXTRA.symptom))
    expect(symptom.calls).toContain(`symptom:${symptomTopic.id}`)
    expect(symptom.core.topicId).toBe(symptomTopic.id)
    const guideAnswer = respond(decision("answer", EXTRA.guide))
    expect(guideAnswer.calls).toContain(`guide:${guide.slug}`)
    expect(guideAnswer.core.response.answer).toBe(`가이드 답:${guide.slug}`)
  })

  it("uses the existing handoff response for handoff cards", () => {
    const { core, calls } = respond(decision("answer", CARDS.handoff))
    expect(calls).toEqual(["handoff:support"])
    expect(core.response.answerMode).toBe("handoff")
    expect(core.response.needsHandoff).toBe(true)
  })

  it("renders gap cards with the fixed template, the card's handoff button and verified related sentences", () => {
    const hours = respond(decision("gap", CARDS.gapHours)).core
    expect(hours.response.answer).toBe([gapLeadLine("상담 전화 운영 시간"), "못 찾음 둘째 문단."].join("\n\n"))
    expect(hours.response).toMatchObject({ answerMode: "fallback", needsHandoff: true, unresolved: true })
    expect(hours.handoffIntent).toBe("support")
    expect(hours.answerIndex).toMatchObject({ decision: "gap", card: CARDS.gapHours })

    const related = respond(decision("gap", EXTRA.gapRelated)).core
    expect(related.response.answer).toBe(
      [gapLeadLine("클라우드 저장 한도"), `${GAP_RELATED_INTRO}\n녹화 파일은 [다운로드] 버튼으로 내 컴퓨터에 저장할 수 있습니다.`, "못 찾음 둘째 문단."].join("\n\n")
    )
    expect(related.response.needsHandoff).toBe(false)
    expect(related.response.sources.map((source) => source.urlPath)).toEqual(["/docs/fake/recording"])
  })

  it("answers abstain decisions with the fixed not-found texts", () => {
    const nodoc = respond(decision("abstain", null, { abstainReason: "nodoc" })).core
    expect(nodoc.response).toMatchObject({ answer: NO_SOURCE, answerMode: "fallback", needsHandoff: false, unresolved: true, sources: [] })
    const symptom = respond(decision("abstain", null, { abstainReason: "symptom" })).core
    expect(symptom.response).toMatchObject({ answer: SYMPTOM_ABSTAIN, answerMode: "fallback", needsHandoff: true })
    expect(symptom.handoffIntent).toBe("support")
  })

  it("answers clarify decisions with the existing vague-error clarifying answer", () => {
    const { core, calls } = respond(decision("clarify", null), "에러나요")
    expect(calls).toEqual(["symptom:vague-error"])
    expect(core.response.answerMode).toBe("clarifying_question")
    expect(core.answerIndex.decision).toBe("clarify")
  })
})

describe("respond: two-part questions (R2 B4)", () => {
  const ON = { CHATBOT_COMPILED_SHAPE: "on" }
  const twoAnswered = decision("answer", CARDS.chat, {
    askType: "yesno",
    segments: [
      { text: "채팅 막을 수 있나요", kind: "answer", card: CARDS.chat, conf: 0.9 },
      { text: "녹화 파일 내려받기 되나요", kind: "answer", card: CARDS.download, conf: 0.8 },
    ],
  })

  it("heads each answered part with a 【주제】 line in question order and merges sources", () => {
    const { core } = respond(twoAnswered, "질문", { env: ON })
    const [first, second] = core.response.answer.split("\n\n")
    expect(first.startsWith(`【${shortTopic(core.answerIndex.parts![0].card ? "수업 중 학생 채팅 막기" : "")}】\n`)).toBe(true)
    expect(core.response.answer).toContain("네, 할 수 있어요. 수업 중에 [채팅 금지] 버튼을 누르면 학생 채팅을 막을 수 있습니다.")
    expect(core.response.answer.indexOf("[채팅 금지]")).toBeLessThan(core.response.answer.indexOf("[다운로드]"))
    expect(second.startsWith("【")).toBe(true)
    expect(core.response.sources.map((source) => source.urlPath)).toEqual(["/docs/fake/chat", "/docs/fake/recording"])
    expect(core.answerIndex.partial).toBe(false)
    expect(core.answerIndex.parts?.map((part) => part.notice)).toEqual([false, false])
    // 복합 답에는 주제·영업 되묻기를 붙이지 않는다(끝 줄이 겹쳐 길어진다, 품질-4·품질-13).
    expect(core.suppressSalesFollowUp).toBe(true)
    expect(core.topicFollowUp).toBeUndefined()
  })

  it("uses 'ask it separately' only when that part alone gets an answer, labels it by its concept and offers it as a chip", () => {
    const question = "출석부를 엑셀로 받을 수 있나요? 채팅 막기는요?"
    const retry = decision("answer", CARDS.chat, {
      segments: [
        { text: "출석부를 엑셀로 받을 수 있나요?", kind: "abstain", card: null, conf: 0.2, topCard: CARDS.count, topConf: 0.2, alone: "answer", label: "출석부" },
        { text: "채팅 막기는요?", kind: "answer", card: CARDS.chat, conf: 0.9 },
      ],
    })
    const { core } = respond(retry, question, { env: ON })
    const answer = core.response.answer
    expect(answer).not.toContain("함께 물어보신 다른 내용은")
    // 질문 순서: 못 답한 첫 조각 알림이 먼저, 답한 조각이 다음. 머리 줄은 순번이 아니라 개념 이름.
    expect(answer.startsWith(`【출석부】\n${SEGMENT_RETRY_LINE}`)).toBe(true)
    expect(answer.indexOf(SEGMENT_RETRY_LINE)).toBeLessThan(answer.indexOf("[채팅 금지]"))
    expect(answer).not.toContain("번째 질문】")
    // 따로 물으면 답이 나오는 알림뿐이면 상담 끝맺음·상담 버튼을 붙이지 않는다(결정 2).
    expect(answer).not.toContain(COMPOUND_CLOSING_LINE)
    expect(core.response.needsHandoff).toBe(false)
    expect(core.answerIndex.partial).toBe(true)
    expect(core.answerIndex.parts).toEqual([
      expect.objectContaining({ notice: true, noticeKind: "retry", alone: "answer" }),
      expect.objectContaining({ notice: false }),
    ])
    expect(core.response.suggestedQuestions[0]).toBe("출석부를 엑셀로 받을 수 있나요?")
  })

  it("says 'not found right away' (with the handoff button) when the part alone gets no answer, and 'not in the public guide' only for a known absent concept", () => {
    const notFound = decision("answer", CARDS.chat, {
      segments: [
        { text: "채팅 막기", kind: "answer", card: CARDS.chat, conf: 0.9 },
        { text: "출석부 엑셀로 되나요", kind: "abstain", card: null, conf: 0.05, topCard: CARDS.count, topConf: 0.03, alone: "abstain" },
      ],
    })
    const missing = respond(notFound, "질문", { env: ON }).core
    expect(missing.response.answer).toContain(SEGMENT_NOTFOUND_LINE)
    expect(missing.response.answer).not.toContain(SEGMENT_ABSENT_LINE)
    expect(missing.response.answer).not.toContain(SEGMENT_RETRY_LINE)
    expect(missing.response.answer.endsWith(COMPOUND_CLOSING_LINE)).toBe(true)
    expect(missing.response.needsHandoff).toBe(true)
    expect(missing.handoffIntent).toBe("support")
    expect(missing.answerIndex.parts?.[1]).toMatchObject({ notice: true, noticeKind: "notfound" })
    // 칩은 그 조각만 물어 답이 나오는 경우만.
    expect(missing.response.suggestedQuestions).not.toContain("출석부 엑셀로 되나요")

    const absent = decision("answer", CARDS.chat, {
      segments: [
        { text: "채팅 막기", kind: "answer", card: CARDS.chat, conf: 0.9 },
        { text: "보안 인증 있나요", kind: "abstain", card: null, conf: 0.05, topCard: CARDS.count, topConf: 0.03, absentHit: "A_isms", alone: "abstain" },
      ],
    })
    const { core } = respond(absent, "질문", { env: ON })
    expect(core.response.answer).toContain(`【ISMS 같은 보안 인증】\n${SEGMENT_ABSENT_LINE}`)
    expect(core.response.needsHandoff).toBe(true)
    expect(core.answerIndex.parts?.[1]).toMatchObject({ notice: true, noticeKind: "absent" })
  })

  it("renders a gap part as an absent notice with its verified related sentences", () => {
    const withGap = respond(
      decision("answer", CARDS.chat, {
        segments: [
          { text: "채팅 막기", kind: "answer", card: CARDS.chat, conf: 0.9 },
          { text: "클라우드 용량", kind: "gap", card: EXTRA.gapRelated, conf: 0.7 },
        ],
      }),
      "질문",
      { env: ON }
    ).core
    expect(withGap.response.answer).toContain(`【클라우드 저장 한도】\n${SEGMENT_ABSENT_LINE}`)
    expect(withGap.response.answer).toContain(`${GAP_RELATED_INTRO}\n녹화 파일은 [다운로드] 버튼으로`)
    expect(withGap.answerIndex.parts?.[1]).toMatchObject({ notice: true, noticeKind: "absent" })
  })

  it("answers one not-found block when no part could be decided, with chips for parts that answer alone (품질-3)", () => {
    const none = decision("abstain", null, {
      abstainReason: "nodoc",
      segments: [
        { text: "출석부를 엑셀로 받을 수 있나요?", kind: "abstain", card: null, conf: 0.2, topCard: CARDS.count, topConf: 0.2, alone: "answer" },
        { text: "보안 인증 있나요", kind: "abstain", card: null, conf: 0.05, topCard: CARDS.count, topConf: 0.03, alone: "abstain" },
      ],
    })
    const { core } = respond(none, "출석부를 엑셀로 받을 수 있나요? 보안 인증 있나요", { env: ON })
    expect(core.response.answer).toBe(NO_SOURCE)
    expect(core.response).toMatchObject({ answerMode: "fallback", unresolved: true })
    expect(core.response.suggestedQuestions[0]).toBe("출석부를 엑셀로 받을 수 있나요?")
    expect(core.answerIndex.decision).toBe("abstain")
    // 모든 조각이 증상이면 증상 못 찾음 한 덩이, 조각이 하나뿐이면 고정 문구.
    const symptomOnly = none.segments!.map((segment) => ({ ...segment, symptom: true }))
    expect(respond(decision("abstain", null, { abstainReason: "symptom", segments: symptomOnly }), "질문", { env: ON }).core.response.answer).toBe(SYMPTOM_ABSTAIN)
    expect(respond(decision("abstain", null, { abstainReason: "nodoc" }), "질문", { env: ON }).core.response.answer).toBe(NO_SOURCE)
  })

  it("does not let a symptom not-found swallow a non-symptom part (품질-10)", () => {
    const mixed = decision("abstain", null, {
      abstainReason: "symptom",
      segments: [
        { text: "맥북에 설치가 안 돼요", kind: "abstain", card: null, conf: 0.3, symptom: true, alone: "abstain", label: "설치" },
        { text: "무료로 써 볼 수 있어요?", kind: "abstain", card: null, conf: 0.2, alone: "answer", label: "무료 체험" },
      ],
    })
    const { core } = respond(mixed, "맥북에 설치가 안 돼요. 무료로 써 볼 수 있어요?", { env: ON })
    expect(core.response.answer).toContain(`【설치】\n${SEGMENT_SYMPTOM_LINE}`)
    expect(core.response.answer).toContain(`【무료 체험】\n${SEGMENT_RETRY_LINE}`)
    expect(core.response.needsHandoff).toBe(true)
    expect(core.answerIndex.parts?.map((part) => part.noticeKind)).toEqual(["symptom", "retry"])
  })

  it("keeps the notice for policy-governed cards too and adds no absent tail after them", () => {
    for (const id of [EXTRA.policy, EXTRA.verbatimPolicy]) {
      const { core } = respond(
        decision("answer", id, {
          askType: "yesno",
          absentTail: "A_isms",
          absentHit: "A_isms",
          segments: [
            { text: "x", kind: "abstain", card: null, conf: 0.1, topCard: CARDS.count, topConf: 0.2, alone: "answer" },
            { text: "y", kind: "answer", card: id, conf: 0.9 },
          ],
        }),
        "질문",
        { env: ON }
      )
      expect(core.response.answer).toContain(POLICY_TEXT.split("\n")[0])
      expect(core.response.answer).toContain(SEGMENT_RETRY_LINE)
      expect(core.response.answer).not.toContain(absentTailLine("보안 인증"))
    }
  })

  it("answers one card once when every part points at it, and leaves the single-card path alone", () => {
    const same = decision("answer", CARDS.chat, {
      segments: [
        { text: "채팅 막기", kind: "answer", card: CARDS.chat, conf: 0.9 },
        { text: "채팅 못 하게", kind: "answer", card: CARDS.chat, conf: 0.8 },
      ],
    })
    const { core } = respond(same, "질문", { env: ON })
    expect(core.response.answer).not.toContain("【")
    expect(core.answerIndex.partial).toBe(false)
  })

  it("holds the length cap minus the follow-up reserve (700/900 for two/three parts) without dropping a part silently", () => {
    const { core } = respond(
      decision("answer", EXTRA.symptom, {
        segments: [
          { text: "a", kind: "answer", card: EXTRA.symptom, conf: 0.9 },
          { text: "b", kind: "answer", card: EXTRA.guide, conf: 0.9 },
          { text: "c", kind: "answer", card: CARDS.chat, conf: 0.9 },
        ],
      }),
      "질문",
      { env: ON }
    )
    expect(core.response.answer.length).toBeLessThanOrEqual(900 - COMPOUND_FOLLOW_UP_RESERVE)
    expect(core.answerIndex.compound).toMatchObject({ cap: 900, budget: 900 - COMPOUND_FOLLOW_UP_RESERVE, chars: core.response.answer.length })
    expect(core.answerIndex.parts?.length).toBe(3)
    expect(core.response.answer.match(/【/g)?.length).toBe(3)
    // 증상 안내 조각의 끝맺음 틀 줄은 답 끝 한 줄로 모으고, 조각 본문 줄은 순서 그대로 둔다(품질-4).
    expect(core.response.answer.match(/담당자 상담으로 이어 드릴게요/g)?.length ?? 0).toBeLessThanOrEqual(1)
  })

  it("compacts the longest part first, skips leading preview lines, and turns policy text into a retry notice instead of cutting it (회귀-4)", () => {
    const sentence = (n: number) => `${n}번째 설명 문장이 꽤 길게 이어지면서 같은 말을 여러 번 되풀이하는 모양으로 쓰였어요.`
    const body = (n: number) => [[sentence(n), sentence(n + 1), sentence(n + 2)], [sentence(n + 3), sentence(n + 4)], ["1. 첫 단계를 누릅니다.", "2. 둘째 단계를 누릅니다."]]
    const card = { id: "x", kind: "doc" } as never
    const make = (label: string, n: number): Piece => ({ kind: "answer", label, blocks: body(n), closing: null, card, parts: {} as never })
    const two = assemblePieces([make("가", 1), make("나", 10)], [], null, 700)
    expect(two.text.length).toBeLessThanOrEqual(700)
    expect(two.text).toContain("【가】")
    expect(two.text).toContain("【나】")
    // 짧은 조각은 줄이지 않는다(가장 긴 조각부터 하나씩).
    const short: Piece = { kind: "answer", label: "짧음", blocks: [["짧은 답이에요."]], closing: null, card, parts: {} as never }
    const mixed = assemblePieces([short, make("나", 10), make("다", 20)], [], null, 600)
    expect(mixed.modes[0]).toBe("full")
    expect(mixed.text).toContain("【짧음】\n짧은 답이에요.")
    // 결론만 남길 때 맨 앞 공감·예고 줄은 건너뛴다.
    const preview: Piece = {
      kind: "answer",
      label: "예고",
      blocks: [["확인된 것만 말씀드릴게요.", "만료일은 [기관 정보]에서 봅니다.", ...Array.from({ length: 8 }, (_v, at) => sentence(at))]],
      closing: null,
      card,
      parts: {} as never,
    }
    const compacted = assemblePieces([preview, short], [], null, 120)
    expect(compacted.text).toContain("【예고】\n만료일은 [기관 정보]에서 봅니다.")
    expect(compacted.text).not.toContain("말씀드릴게요")
    // 정책 글은 줄이지 않는다: 다른 조각을 다 줄여도 넘으면 통째로 '따로 물어봐 주세요'.
    const policyCard = { id: "policy:x", kind: "policy" } as never
    const policy: Piece = { kind: "answer", label: "정책", blocks: [["죄송해하지 않으셔도 돼요.", ...Array.from({ length: 8 }, (_v, at) => sentence(at))]], closing: null, card: policyCard, parts: {} as never }
    const kept = assemblePieces([policy, make("나", 10)], [], null, 500)
    expect(kept.text).toContain("【정책】\n죄송해하지 않으셔도 돼요.")
    expect(kept.modes[0]).toBe("full")
    const held = assemblePieces([policy, make("나", 10)], [], null, 400)
    expect(held.text.length).toBeLessThanOrEqual(400)
    expect(held.text).toContain(`【정책】\n${SEGMENT_RETRY_LINE}`)
    expect(held.text).not.toContain("죄송해하지 않으셔도 돼요.")
    // 아주 긴 조각 둘은 하나가 '따로 물어봐 주세요'로 바뀐다(소리 없이 버리지 않는다).
    const huge = (label: string): Piece => ({ kind: "answer", label, blocks: [[Array.from({ length: 12 }, (_v, at) => sentence(at)).join(" ")]], closing: null, card, parts: {} as never })
    const dropped = assemblePieces([huge("가"), huge("나")], [], null, 700)
    expect(dropped.text.length).toBeLessThanOrEqual(700)
    expect(dropped.text).toContain(SEGMENT_RETRY_LINE)
    expect(dropped.modes.filter((mode) => mode === "dropped")).toHaveLength(1)
  })

  it("without the shape switch or under verbatim framing falls back to plain joining", () => {
    const verbatim = respond(twoAnswered, "질문", { env: { CHATBOT_COMPILED_FRAMING: "verbatim" } }).core
    expect(verbatim.response.answer).not.toContain("【")
    expect(verbatim.response.answer).toContain("[채팅 금지]")
    expect(verbatim.response.answer).toContain("[다운로드]")
  })

  it("shortens long card topics at a group or word boundary without a cut-off ellipsis (품질-12)", () => {
    expect(shortTopic("클래스인 API 제공 여부와 API로 호출할 수 있는 기능")).toBe("클래스인 API 제공 여부")
    expect(shortTopic("전환 팝업에 넣을 학원 정보(사업자등록증과 일치, 비즈니스 범위 해당 없음)")).toBe("전환 팝업에 넣을 학원 정보")
    expect(shortTopic("녹화 다시 보기")).toBe("녹화 다시 보기")
    const cut = shortTopic("수업 자료를 강사 개인 드라이브가 아닌 공유 드라이브 과목별 폴더에 두기")
    expect(cut).not.toMatch(/…$/)
    expect(cut.length).toBeLessThanOrEqual(22)
    expect(cut).not.toMatch(/(?:을|를|가|에|의)$/)
  })
})

describe("respond: helpers", () => {
  it("picks 은/는 by the final syllable", () => {
    expect(topicParticle("보안 인증")).toBe("은")
    expect(topicParticle("카카오페이")).toBe("는")
    expect(topicParticle("ISMS")).toBe("은(는)")
  })

  it("finds curated entries only for modules callable by id", () => {
    expect(findCuratedEntry({ module: "field", id: field.id })?.module).toBe("field")
    expect(findCuratedEntry({ module: "svc", id: "anything" })).toBeNull()
    expect(findCuratedEntry({ module: "template", id: "anything" })).toBeNull()
  })
})
