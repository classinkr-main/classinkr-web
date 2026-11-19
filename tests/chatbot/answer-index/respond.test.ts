import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { compileAnswerIndex, type CompiledAnswerIndex } from "@/lib/chatbot/answer-index/compile"
import { curatedTextHash, findCuratedEntry } from "@/lib/chatbot/answer-index/curated"
import { answerTextHash } from "@/lib/chatbot/answer-index/hash"
import { loadAnswerIndexData } from "@/lib/chatbot/answer-index/load"
import {
  absentTailLine,
  buildAnswerIndexCore,
  gapLeadLine,
  GAP_RELATED_INTRO,
  LEAD_TEXT,
  topicParticle,
  UNANSWERED_SEGMENT_LINE,
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

const EXTRA = {
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
  const ctx: RespondContext = { index: options.index ?? index, host, router: "compiled", version: "test+c1", env: options.env ?? {} }
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
      const { core } = respond(decision("answer", id, { askType: "yesno", absentTail: "A_isms", absentHit: "A_isms", segments: [{ text: "x", kind: "abstain", card: null, conf: 0.1 }, { text: "y", kind: "answer", card: id, conf: 0.9 }] }))
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

describe("respond: two-part questions", () => {
  it("joins two answered parts without a second lead and merges sources", () => {
    const d = decision("answer", CARDS.chat, {
      askType: "yesno",
      segments: [
        { text: "채팅 막을 수 있나요", kind: "answer", card: CARDS.chat, conf: 0.9 },
        { text: "녹화 파일 내려받기 되나요", kind: "answer", card: CARDS.download, conf: 0.8 },
      ],
    })
    const { core } = respond(d)
    expect(core.response.answer).toBe(
      `${LEAD_TEXT.yes_can} 수업 중에 [채팅 금지] 버튼을 누르면 학생 채팅을 막을 수 있습니다. 경로: 교실 > [도구] > [채팅 금지]\n\n녹화 파일은 [다운로드] 버튼으로 내 컴퓨터에 저장할 수 있습니다.`
    )
    expect(core.response.sources.map((source) => source.urlPath)).toEqual(["/docs/fake/chat", "/docs/fake/recording"])
    expect(core.answerIndex.partial).toBe(false)
  })

  it("adds one not-found line for the unanswered part (full framing only) and a gap line for a gap part", () => {
    const unanswered = decision("answer", CARDS.chat, {
      segments: [
        { text: "채팅 막기", kind: "answer", card: CARDS.chat, conf: 0.9 },
        { text: "출석부 엑셀", kind: "abstain", card: null, conf: 0.1 },
      ],
    })
    const full = respond(unanswered).core
    expect(full.response.answer.endsWith(UNANSWERED_SEGMENT_LINE)).toBe(true)
    expect(full.answerIndex.partial).toBe(true)
    const verbatim = respond(unanswered, "질문", { env: { CHATBOT_COMPILED_FRAMING: "verbatim" } }).core
    expect(verbatim.response.answer).not.toContain(UNANSWERED_SEGMENT_LINE)
    expect(verbatim.answerIndex.partial).toBe(false)

    const withGap = respond(
      decision("answer", CARDS.chat, {
        segments: [
          { text: "채팅 막기", kind: "answer", card: CARDS.chat, conf: 0.9 },
          { text: "상담 시간", kind: "gap", card: CARDS.gapHours, conf: 0.7 },
        ],
      })
    ).core
    expect(withGap.response.answer.endsWith(gapLeadLine("상담 전화 운영 시간"))).toBe(true)
    expect(withGap.response.needsHandoff).toBe(true)
    expect(withGap.handoffIntent).toBe("support")
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
