import { afterEach, beforeAll, describe, expect, it } from "vitest"

import { answerTextHash } from "@/lib/chatbot/answer-index/hash"
import type { AnswerIndexUnit, DocAnswerCard, SiteFact } from "@/lib/chatbot/answer-index/types"
import type { DocArticle } from "@/lib/docs"
import { dataDir, loadQuestionSet, loadRepoEvalSets } from "@/scripts/answer-index/lib/common"
import { buildSiteFacts } from "@/scripts/answer-index/lib/site-facts"
import { buildUnits, loadUnitSources, type UnitSources } from "@/scripts/answer-index/lib/units"
import { docCardUnitId, isCardIdShape, runVerify, type VerifyFinding } from "@/scripts/answer-index/lib/verify-core"
import { baseFiles, currentSources, makeDataDir } from "./helpers"

// 답 색인 사양 §6 V-1~V-12, §12.1 I3 완료 기준: 문서 문장 하나를 바꾸면 V-1 실패, 평가셋 질문을 변형에 넣으면 V-7 실패.

let sources: UnitSources
let units: AnswerIndexUnit[]
let siteFacts: SiteFact[]
const cleanups: (() => void)[] = []

beforeAll(async () => {
  sources = await loadUnitSources()
  units = buildUnits(sources)
  siteFacts = buildSiteFacts()
})

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.()
})

function fixture(files: Record<string, unknown>) {
  const made = makeDataDir(files)
  cleanups.push(made.cleanup)
  return made.dir
}

const errorsOf = (findings: VerifyFinding[], rule?: string) =>
  findings.filter((finding) => finding.level === "error" && (!rule || finding.rule === rule))

const MEMBER_UNIT = "doc:/docs/teacher/course-members#4"

function memberCard(overrides: Partial<DocAnswerCard> = {}): DocAnswerCard {
  const unit = units.find((candidate) => candidate.unitId === MEMBER_UNIT)!
  const ids = [3, 4, 5]
  return {
    id: `${MEMBER_UNIT}/remove-member`,
    kind: "doc",
    tier: "standard",
    area: unit.area,
    topic: "코스에서 구성원 내보내기",
    answer: { lead: "how_to", sentences: [{ unit: MEMBER_UNIT, ids, hashes: ids.map((i) => unit.sentences[i].hash) }] },
    asks: ["howto"],
    concepts: [],
    anchors: ["멤버 삭제"],
    covers: "코스 구성원 목록에서 사람을 내보내는 방법",
    notCovers: [],
    negatives: [],
    status: "active",
    ...overrides,
  }
}

/** 시험용 변형 25개(개발용 질문과 겹치지 않는 글). */
function memberVariants(extra: string[] = []) {
  const qs = Array.from({ length: 25 }, (_, index) => `가나다라 시험 변형 문장 번호 ${index + 1}번 확인용`)
  return {
    [`${MEMBER_UNIT}/remove-member`]: [...qs, ...extra].map((q) => ({ q, p: "fixture", g: "A", m: "fixture" })),
  }
}

describe("빈 자료", () => {
  it("카드 0장이면 오류 0으로 통과한다(덮기·옛 id 대응은 알림만)", async () => {
    const dir = fixture(baseFiles(units, siteFacts))
    const result = await runVerify({ dir, current: currentSources(units, siteFacts), devSets: [] })
    expect(errorsOf(result.findings)).toEqual([])
    expect(result.findings.some((finding) => finding.rule === "V-9" && finding.level === "info")).toBe(true)
  })

  it("--strict 면 덮이지 않은 단위가 오류다", async () => {
    const dir = fixture(baseFiles(units, siteFacts))
    const result = await runVerify({ dir, current: currentSources(units, siteFacts), devSets: [], strict: true })
    expect(errorsOf(result.findings, "V-9").length).toBeGreaterThan(0)
  })

  it("저장소에 넣은 자료(data/answer-index)가 지금 문서·코드와 맞는다", async () => {
    const result = await runVerify({ dir: dataDir(), devSets: loadRepoEvalSets().map((entry) => entry.set) })
    expect(errorsOf(result.findings)).toEqual([])
  }, 120_000)
})

describe("V-1 문서가 바뀌면 막는다", () => {
  function changedUnits() {
    const docs: DocArticle[] = sources.docs.map((doc) => {
      if (doc.category !== "teacher" || doc.slug !== "course-members") return doc
      const sections = doc.sections.map((section, index) =>
        index === 4 ? { ...section, steps: (section.steps ?? []).map((step, i) => (i === 0 ? `${step} 일부러 바꾼 문장` : step)) } : section
      )
      return { ...doc, sections }
    })
    return buildUnits({ docs, guides: sources.guides })
  }

  it("문서 문장 하나를 바꾸면 units.json 이 낡았다고 실패한다", async () => {
    const dir = fixture(baseFiles(units, siteFacts))
    const result = await runVerify({ dir, current: currentSources(changedUnits(), siteFacts), devSets: [] })
    const v1 = errorsOf(result.findings, "V-1")
    expect(v1.length).toBeGreaterThan(0)
    expect(v1.some((finding) => finding.message.includes(MEMBER_UNIT))).toBe(true)
  })

  it("바뀐 문장을 가리키는 카드를 낡은 카드로 잡는다", async () => {
    const before = units.find((unit) => unit.unitId === MEMBER_UNIT)!
    const after = changedUnits().find((unit) => unit.unitId === MEMBER_UNIT)!
    const changedIndex = before.sentences.findIndex((sentence, index) => sentence.hash !== after.sentences[index]?.hash)
    expect(changedIndex).toBeGreaterThanOrEqual(0)
    const ids = [changedIndex]
    const card = memberCard({ answer: { lead: "how_to", sentences: [{ unit: MEMBER_UNIT, ids, hashes: ids.map((i) => before.sentences[i].hash) }] } })
    const dir = fixture({
      ...baseFiles(units, siteFacts),
      "cards/course.json": [card],
      "variants/course.json": memberVariants(),
    })
    const unchanged = await runVerify({ dir, current: currentSources(units, siteFacts), devSets: [] })
    // 카드가 생긴 영역은 덮기 검사(V-9)가 오류가 된다(이 시험은 카드 한 장뿐이라 뺀다).
    expect(errorsOf(unchanged.findings).filter((finding) => finding.rule !== "V-9")).toEqual([])
    expect(errorsOf(unchanged.findings, "V-9").length).toBeGreaterThan(0)
    const changed = await runVerify({ dir, current: currentSources(changedUnits(), siteFacts), devSets: [] })
    expect(errorsOf(changed.findings, "V-1").some((finding) => finding.file === "cards/course.json" && finding.message.includes(card.id))).toBe(true)
  })
})

describe("V-7 평가 질문 겹침", () => {
  it("평가셋 질문을 그대로 변형에 넣으면 실패한다", async () => {
    const firstContact = loadQuestionSet("data/chatbot-first-contact-set.json")
    const leaked = firstContact.questions[0]
    const dir = fixture({
      ...baseFiles(units, siteFacts),
      "cards/course.json": [memberCard()],
      "variants/course.json": memberVariants([leaked]),
    })
    const result = await runVerify({ dir, current: currentSources(units, siteFacts), devSets: [firstContact] })
    const v7 = errorsOf(result.findings, "V-7")
    expect(v7).toHaveLength(1)
    expect(v7[0].file).toBe("variants/course.json")
    expect(v7[0].message).toContain("chatbot-first-contact-set.json")
  })

  it("띄어쓰기·문장부호만 다르거나 한두 글자만 바꾼 질문도 잡는다", async () => {
    const devSet = { name: "dev-fixture", questions: ["학생 화면 공유는 어디서 끄나요?"], sha: "0".repeat(16) }
    const dir = fixture({
      ...baseFiles(units, siteFacts),
      "cards/course.json": [memberCard()],
      "variants/course.json": memberVariants(["학생화면공유는 어디서 끄나요", "학생 화면 공유는 어디서 꺼요?"]),
    })
    const result = await runVerify({ dir, current: currentSources(units, siteFacts), devSets: [devSet] })
    expect(errorsOf(result.findings, "V-7")).toHaveLength(2)
  })

  it("확정용 묶음은 겹친 개수만 찍고 글은 찍지 않는다", async () => {
    const secret = "이 문장은 확정용 묶음 시험에만 쓰는 문장입니다"
    const dir = fixture({
      ...baseFiles(units, siteFacts),
      "cards/course.json": [memberCard()],
      "variants/course.json": memberVariants([secret]),
    })
    const result = await runVerify({
      dir,
      current: currentSources(units, siteFacts),
      devSets: [],
      holdoutSets: [{ name: "holdout-fixture", questions: [secret, "다른 확정용 문장 하나"], sha: "0".repeat(16) }],
    })
    const v7 = result.findings.filter((finding) => finding.rule === "V-7")
    expect(errorsOf(v7).length).toBeGreaterThan(0)
    for (const finding of v7) expect(finding.message).not.toContain(secret)
    expect(v7.some((finding) => /겹침 1건/.test(finding.message))).toBe(true)
  })
})

describe("그 밖의 규칙", () => {
  it("V-3 캡션·메타·nav 문장을 답으로 쓰면 실패한다", async () => {
    const unit = units.find((candidate) => candidate.kind !== "guide" && candidate.sentences.some((sentence) => sentence.flags.includes("meta")))!
    const i = unit.sentences.findIndex((sentence) => sentence.flags.includes("meta"))
    const card = memberCard({
      id: `${unit.unitId}/meta-test`,
      area: unit.area,
      answer: { sentences: [{ unit: unit.unitId, ids: [i], hashes: [unit.sentences[i].hash] }] },
    })
    const dir = fixture({
      ...baseFiles(units, siteFacts),
      "cards/course.json": [card],
      "variants/course.json": { [card.id]: memberVariants()[`${MEMBER_UNIT}/remove-member`] },
    })
    const result = await runVerify({ dir, current: currentSources(units, siteFacts), devSets: [] })
    expect(errorsOf(result.findings, "V-3").some((finding) => finding.message.includes("meta"))).toBe(true)
  })

  it("V-4 같은 변형이 두 카드에 있거나 변형이 모자라면 실패한다", async () => {
    const other = memberCard({ id: `${MEMBER_UNIT}/remove-member-mobile`, topic: "모바일에서 구성원 내보내기" })
    const variants = memberVariants()
    const dir = fixture({
      ...baseFiles(units, siteFacts),
      "cards/course.json": [memberCard(), other],
      "variants/course.json": { ...variants, [other.id]: [variants[`${MEMBER_UNIT}/remove-member`][0]] },
    })
    const result = await runVerify({ dir, current: currentSources(units, siteFacts), devSets: [] })
    const v4 = errorsOf(result.findings, "V-4")
    expect(v4.some((finding) => finding.message.includes("다른 카드"))).toBe(true)
    expect(v4.some((finding) => finding.message.includes(other.id) && finding.message.includes("< 25"))).toBe(true)
  })

  it("V-6 모호 규칙 없이 두 개념에 걸린 형태, 경계 표시 없는 짧은 형태를 잡는다", async () => {
    const dir = fixture({
      ...baseFiles(units, siteFacts),
      "lexicon.json": [
        { id: "C_kick", kind: "action", generic: false, parents: [], doc: ["강제 퇴장"], visitor: ["내보내기", "강퇴"], ambiguous: [] },
        { id: "C_export", kind: "action", generic: false, parents: [], doc: ["내보내기"], visitor: [], ambiguous: [] },
      ],
    })
    const result = await runVerify({ dir, current: currentSources(units, siteFacts), devSets: [] })
    const v6 = errorsOf(result.findings, "V-6")
    expect(v6.some((finding) => finding.message.includes("두 개념"))).toBe(true)
    expect(v6.some((finding) => finding.message.includes("강퇴"))).toBe(true)
  })

  it("V-2 FIX 카드 글이 점검 통과본과 다르거나 인용이 문장에 없으면 실패한다", async () => {
    const unit = units.find((candidate) => candidate.unitId === MEMBER_UNIT)!
    const fixText = "고친 글입니다."
    const audit = {
      answerId: "basics:basics-test",
      module: "basics",
      textHash: "0".repeat(16),
      category: "general",
      handoff: null,
      claims: [
        { n: 1, text: "주장", verdict: "supported", evidence: [{ unit: MEMBER_UNIT, i: 0, quote: unit.sentences[0].text.slice(0, 12) }] },
        { n: 2, text: "주장", verdict: "supported", evidence: [{ unit: MEMBER_UNIT, i: 0, quote: "문서에 없는 인용" }] },
      ],
      incompleteAspects: [],
      disposition: "FIX",
      fix: { text: fixText, changes: [] },
      policyTopics: [],
    }
    const card = {
      id: "fixed:basics-test",
      kind: "fixed",
      tier: "head",
      area: "company",
      topic: "시험",
      answer: { text: "점검과 다른 글입니다.", textHash: answerTextHash("점검과 다른 글입니다.") },
      auditRef: "audit/C-01.jsonl#basics:basics-test",
      status: "active",
    }
    const dir = fixture({
      ...baseFiles(units, siteFacts),
      "audit/C-01.jsonl": `${JSON.stringify(audit)}\n`,
      "cards/company.json": [card],
    })
    const result = await runVerify({ dir, current: currentSources(units, siteFacts), devSets: [] })
    const v2 = errorsOf(result.findings, "V-2")
    expect(v2.some((finding) => finding.message.includes("점검 통과본과 다름"))).toBe(true)
    expect(v2.filter((finding) => finding.message.includes("인용이 그 문장에 글자 그대로 없음"))).toHaveLength(1)
  })

  it("카드 id 꼴(§4.2)", () => {
    for (const id of [
      "doc:/docs/teacher/course-members#4/remove-member",
      "doc:/docs/start/signup#summary/what",
      "doc:guide:cs-figma-digest-859/remove-member-mobile",
      "howto:recording-missing",
      "fixed:basics-billing-unit",
      "policy:free-trial",
      "gap:support/phone-hours",
      "handoff:support",
    ]) {
      expect(isCardIdShape(id)).toBe(true)
    }
    for (const id of ["doc:/docs/teacher/course-members#4", "gap:phone-hours", "fixed:Basics", "card:x"]) expect(isCardIdShape(id)).toBe(false)
    expect(docCardUnitId("doc:/docs/teacher/course-members#4/remove-member")).toBe("doc:/docs/teacher/course-members#4")
    expect(docCardUnitId("doc:guide:cs-figma-digest-859/x")).toBe("guide:cs-figma-digest-859")
  })

  it("V-12 카드 id 형식과 종류가 맞지 않으면 실패한다", async () => {
    const dir = fixture({
      ...baseFiles(units, siteFacts),
      "cards/course.json": [memberCard({ id: "fixed:wrong-kind" })],
      "variants/course.json": { "fixed:wrong-kind": memberVariants()[`${MEMBER_UNIT}/remove-member`] },
    })
    const result = await runVerify({ dir, current: currentSources(units, siteFacts), devSets: [] })
    expect(errorsOf(result.findings, "V-12").some((finding) => finding.message.includes("fixed:wrong-kind"))).toBe(true)
  })
})
