import { afterEach, beforeAll, describe, expect, it } from "vitest"

import { curatedLegacyText, curatedTextHash } from "@/lib/chatbot/answer-index/curated"
import { answerTextHash } from "@/lib/chatbot/answer-index/hash"
import { loadAnswerIndexData as loadRuntimeData } from "@/lib/chatbot/answer-index/load"
import type { AnswerIndexUnit, DocAnswerCard, SiteFact } from "@/lib/chatbot/answer-index/types"
import { BASIC_QUICK_ANSWERS } from "@/lib/chatbot/quick-answers-basics"
import { FIELD_QUICK_ANSWERS } from "@/lib/chatbot/quick-answers-field"
import type { DocArticle } from "@/lib/docs"
import { dataDir, loadQuestionSet, loadRepoEvalSets } from "@/scripts/answer-index/lib/common"
import { buildSiteFacts } from "@/scripts/answer-index/lib/site-facts"
import { buildUnits, loadUnitSources, type UnitSources } from "@/scripts/answer-index/lib/units"
import { DEFAULT_ASSIST } from "@/scripts/answer-index/lib/calibrate-core"
import { calibrationBasisVersion, updateManifest } from "@/scripts/answer-index/lib/manifest"
import { docCardUnitId, isCardIdShape, runVerify, type VerifyFinding } from "@/scripts/answer-index/lib/verify-core"
import { baseFiles, currentSources, makeDataDir, writeDataFile } from "./helpers"

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
    // 파일럿 5영역만 카드가 있다. 파일럿 밖 영역의 V-9(덮이지 않은 단위)는 아직 예상된 오류다.
    const errors = errorsOf(result.findings)
    expect(errors.filter((finding) => finding.rule !== "V-9")).toEqual([])
    const pilotAreas = ["account", "classroom", "course", "pricing", "company"]
    expect(errors.filter((finding) => pilotAreas.some((area) => finding.message.includes(`(${area})`)))).toEqual([])
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

  it("카드 anchors 가 개발용 질문과 겹치면 경고한다(실패는 아님)", async () => {
    const devSet = { name: "dev-fixture", questions: ["학생 화면 공유는 어디서 끄나요?"], sha: "0".repeat(16) }
    const dir = fixture({
      ...baseFiles(units, siteFacts),
      "cards/course.json": [memberCard({ anchors: ["멤버 삭제", "학생 화면 공유는 어디서 끄나요"] })],
      "variants/course.json": memberVariants(),
    })
    const result = await runVerify({ dir, current: currentSources(units, siteFacts), devSets: [devSet] })
    expect(errorsOf(result.findings, "V-7")).toHaveLength(0)
    const warnings = result.findings.filter((finding) => finding.rule === "V-7" && finding.level === "warning")
    expect(warnings).toHaveLength(1)
    expect(warnings[0].message).toContain("anchor")
    expect(warnings[0].message).not.toContain("어디서 끄나요?")
  })

  it("낱말만 떼거나 바꾼 근사 사본 변형·반례는 경고한다", async () => {
    const devSet = { name: "dev-fixture", questions: ["클래스인 누구를 위한 서비스예요"], sha: "0".repeat(16) }
    const dir = fixture({
      ...baseFiles(units, siteFacts),
      "cards/course.json": [memberCard({ negatives: [{ q: "누구를 위한 서비스예요 클래스", route: "none" }] })],
      "variants/course.json": memberVariants(["누구를 위한 서비스예요", "우리 학원 원장님이 쓰는 서비스인가요"]),
    })
    const result = await runVerify({ dir, current: currentSources(units, siteFacts), devSets: [devSet] })
    expect(errorsOf(result.findings, "V-7")).toHaveLength(0)
    const near = result.findings.filter((finding) => finding.rule === "V-7" && finding.level === "warning" && finding.message.includes("근사 사본"))
    expect(near.map((finding) => finding.file).sort()).toEqual(["cards/course.json", "variants/course.json"])
    expect(near.every((finding) => !finding.message.includes("클래스인 누구를"))).toBe(true)
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

  it("V-3 공백 카드의 관련 문장도 캡션·메타·nav 문장이면 실패한다(답에 그대로 나간다)", async () => {
    const unit = units.find((candidate) => candidate.kind !== "guide" && candidate.sentences.some((sentence) => sentence.flags.includes("meta")))!
    const i = unit.sentences.findIndex((sentence) => sentence.flags.includes("meta"))
    const gap = {
      id: `gap:${unit.area}/related-meta-test`,
      kind: "gap",
      tier: "standard",
      area: unit.area,
      topic: "시험용 공백 주제",
      status: "active",
      answer: { template: "gap_default", handoff: null, related: [{ unit: unit.unitId, i, hash: unit.sentences[i].hash }] },
      concepts: [],
      anchors: ["시험용 공백"],
      searchLog: [
        { query: "시험 하나", units: 0, site: 0 },
        { query: "시험 둘", units: 0, site: 0 },
        { query: "시험 셋", units: 0, site: 0 },
      ],
    }
    const dir = fixture({ ...baseFiles(units, siteFacts), [`cards/${unit.area}.json`]: [gap] })
    const result = await runVerify({ dir, current: currentSources(units, siteFacts), devSets: [] })
    expect(errorsOf(result.findings, "V-3").some((finding) => finding.message.includes("관련 문장으로 쓰지 않는 문장(") && finding.message.includes("meta"))).toBe(true)
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

  it("V-13 first 가 답 문장 밖이면 실패하고, 안이면 통과한다", async () => {
    const unit = units.find((candidate) => candidate.unitId === MEMBER_UNIT)!
    const run = async (i: number) => {
      const card = memberCard({ answer: { ...memberCard().answer, first: { unit: MEMBER_UNIT, i, hash: unit.sentences[i].hash } } })
      const dir = fixture({ ...baseFiles(units, siteFacts), "cards/course.json": [card], "variants/course.json": memberVariants() })
      return runVerify({ dir, current: currentSources(units, siteFacts), devSets: [] })
    }
    expect(errorsOf((await run(4)).findings, "V-13")).toEqual([])
    expect(errorsOf((await run(0)).findings, "V-13").some((finding) => finding.message.includes("답 문장에 없음"))).toBe(true)
  })

  it("V-13 headline 은 요체 마침표·60자 이하·카드 문장의 숫자와 부정 극성을 지켜야 한다", async () => {
    const unit = units.find((candidate) => candidate.unitId === MEMBER_UNIT)!
    const basis = [{ unit: MEMBER_UNIT, i: 3, hash: unit.sentences[3].hash }]
    const run = async (text: string) => {
      const card = memberCard({ answer: { ...memberCard().answer, headline: { text, basis } } })
      const dir = fixture({ ...baseFiles(units, siteFacts), "cards/course.json": [card], "variants/course.json": memberVariants() })
      return errorsOf((await runVerify({ dir, current: currentSources(units, siteFacts), devSets: [] })).findings, "V-13").map((finding) => finding.message)
    }
    expect((await run("구성원을 내보내요")).some((message) => message.includes("요체"))).toBe(true)
    expect((await run(`${"가".repeat(61)}요.`)).some((message) => message.includes("길이"))).toBe(true)
    expect((await run("코스 구성원은 999명까지 내보낼 수 있어요.")).some((message) => message.includes('"999"'))).toBe(true)
  })

  it("V-6 명의·독·수상 형태에 모호 규칙이 없으면 실패하고, 있으면 통과한다", async () => {
    const concept = (ambiguous: unknown[]) => ({ id: "C_x", kind: "attribute", generic: false, parents: [], doc: [], visitor: [{ form: "명의", boundary: "both" }], ambiguous })
    const run = async (ambiguous: unknown[]) => {
      const dir = fixture({ ...baseFiles(units, siteFacts), "lexicon.json": [concept(ambiguous), { id: "C_y", kind: "object", generic: false, parents: [], doc: ["계약 조건"], visitor: [], ambiguous: [] }] })
      return errorsOf((await runVerify({ dir, current: currentSources(units, siteFacts), devSets: [] })).findings, "V-6")
    }
    expect((await run([])).some((finding) => finding.message.includes("모호 규칙"))).toBe(true)
    expect((await run([{ form: "명의", requiresAny: ["C_y"] }])).some((finding) => finding.message.includes("모호 규칙"))).toBe(false)
  })

  it("V-5 없는 개념 형태가 짧은 낱말 하나(수상)면 실패한다", async () => {
    const absent = (forms: string[]) => [{ id: "absent:company/x", label: "수상", forms, area: "company", gapCard: "gap:company/x", verified: { grep: forms, unitHits: 0, siteHits: 0, checkedAt: "2026-11-25", checker: "test" } }]
    const run = async (forms: string[]) => {
      const dir = fixture({ ...baseFiles(units, siteFacts), "absent.json": absent(forms) })
      return errorsOf((await runVerify({ dir, current: currentSources(units, siteFacts), devSets: [] })).findings, "V-5")
    }
    expect((await run(["수상"])).some((finding) => finding.message.includes("짧은 낱말"))).toBe(true)
    expect((await run(["수상 이력"])).some((finding) => finding.message.includes("짧은 낱말"))).toBe(false)
  })

  it("V-12 calibration.json 은 자기 자신을 뺀 자료 판과 비교한다(보정을 쓴 뒤 manifest 를 다시 써도 낡지 않음)", async () => {
    const calibration = (dataVersion: string) => ({
      version: "cal-test",
      dataVersion,
      weights: { maxcos: 0.3, centroid: 0.7, knnShare: 0.5, vote: 0.15, bm25f: 0.1, linear: 0 },
      confidence: {},
      thresholds: { doc: 0.55, howto: 0.55, fixed: 0.55, policy: 0.6, gap: 0.5, handoff: 0.6 },
      nodocRatesChecked: [0.2, 0.25, 0.3],
      fit: { set: "none", n: 0, check: 0, bootstrapP10: 0 },
      assist: DEFAULT_ASSIST,
    })
    const stale = (findings: VerifyFinding[]) =>
      findings.some((finding) => finding.rule === "V-12" && finding.level === "warning" && finding.file === "calibration.json")
    const dir = fixture({ ...baseFiles(units, siteFacts), "calibration.json": calibration("ai-old") })
    expect(stale((await runVerify({ dir, current: currentSources(units, siteFacts), devSets: [] })).findings)).toBe(true)

    const fresh = fixture({ ...baseFiles(units, siteFacts) })
    const basis = calibrationBasisVersion(fresh)
    writeDataFile(fresh, "calibration.json", calibration(basis))
    updateManifest({}, fresh)
    expect(calibrationBasisVersion(fresh)).toBe(basis)
    expect(stale((await runVerify({ dir: fresh, current: currentSources(units, siteFacts), devSets: [] })).findings)).toBe(false)
  })
})

describe("V-2 런타임이 부를 수 없는 KEEP 카드", () => {
  const keepCard = (module: string, id: string, textHash: string, overrides: Record<string, unknown> = {}) => ({
    id: `fixed:${module}-keep-test`,
    kind: "fixed",
    tier: "head",
    area: "company",
    topic: "시험용 KEEP",
    answer: { curatedRef: { module, id, textHash } },
    status: "active",
    ...overrides,
  })

  it("curatedRef.module 이 svc·template 이면 옛 답 글 해시가 같아도 오류로 거부하고 FIX text 카드를 안내한다", async () => {
    const svcText = "쇼룸 방문은 예약으로 안내해 드려요."
    const templateText = "체험 범위는 상담에서 확인해 드려요."
    const basicsText = "요금은 계정 수 기준이에요."
    const inventory = new Map([
      ["svc:showroom-confirm", { text: svcText, textHash: answerTextHash(svcText) }],
      ["template:체험·파일럿 확인", { text: templateText, textHash: answerTextHash(templateText) }],
      ["basics:basics-billing-unit", { text: basicsText, textHash: answerTextHash(basicsText) }],
    ])
    const dir = fixture({
      ...baseFiles(units, siteFacts),
      "cards/company.json": [
        keepCard("svc", "showroom-confirm", answerTextHash(svcText)),
        keepCard("template", "체험·파일럿 확인", answerTextHash(templateText)),
        keepCard("basics", "basics-billing-unit", answerTextHash(basicsText)),
      ],
    })
    const result = await runVerify({ dir, current: currentSources(units, siteFacts, { inventory }), devSets: [] })
    const v2 = errorsOf(result.findings, "V-2")
    for (const id of ["fixed:svc-keep-test", "fixed:template-keep-test"]) {
      const hit = v2.filter((finding) => finding.message.startsWith(`${id}:`))
      expect(hit, id).toHaveLength(1)
      expect(hit[0].message).toContain("FIX text 카드로 쓴다(같은 글이면 textHash 같음)")
    }
    expect(v2.some((finding) => finding.message.startsWith("fixed:basics-keep-test:"))).toBe(false)
  })

  it("V-2 의 curatedRef 오류는 런타임 load(실제 curatedTextHash)가 '옛 답'으로 끄는 카드와 정확히 같다", async () => {
    const basicsId = BASIC_QUICK_ANSWERS[0].id
    const fieldId = FIELD_QUICK_ANSWERS[0].id
    const basicsText = curatedLegacyText({ module: "basics", id: basicsId })!
    const fieldText = curatedLegacyText({ module: "field", id: fieldId })!
    const svcText = "쇼룸 방문은 예약으로 안내해 드려요."
    const templateText = "체험 범위는 상담에서 확인해 드려요."
    // verify 는 inventory(지금 코드의 옛 답 글)로, 런타임은 curated.ts 로 본다. 부를 수 있는 모듈은 두 글이 같다(curated-votes 시험).
    const inventory = new Map([
      [`basics:${basicsId}`, { text: basicsText, textHash: answerTextHash(basicsText) }],
      [`field:${fieldId}`, { text: fieldText, textHash: answerTextHash(fieldText) }],
      ["svc:showroom-confirm", { text: svcText, textHash: answerTextHash(svcText) }],
      ["template:trial-scope", { text: templateText, textHash: answerTextHash(templateText) }],
    ])
    const policyText = "정책 결정 전 글이에요."
    const policyKeep = (id: string, curatedRef: Record<string, string>) => ({
      ...keepCard("basics", "x", "x"),
      id,
      kind: "policy",
      answer: { curatedRef, text: policyText, textHash: answerTextHash(policyText), policyRef: "HQ-01" },
    })
    const doc = memberCard()
    const cards = [
      { ...keepCard("basics", basicsId, answerTextHash(basicsText)), id: "fixed:keep-basics-ok" },
      { ...keepCard("field", fieldId, answerTextHash(fieldText)), id: "fixed:keep-field-ok" },
      { ...keepCard("basics", basicsId, answerTextHash("다른 글")), id: "fixed:keep-basics-stale" },
      { ...keepCard("svc", "showroom-confirm", answerTextHash(svcText)), id: "fixed:keep-svc" },
      { ...keepCard("template", "trial-scope", answerTextHash(templateText)), id: "fixed:keep-template" },
      { ...keepCard("field", "no-such-answer", answerTextHash(fieldText)), id: "fixed:keep-missing" },
      policyKeep("policy:keep-field-stale", { module: "field", id: fieldId, textHash: answerTextHash("다른 글") }),
      policyKeep("policy:keep-svc", { module: "svc", id: "showroom-confirm", textHash: answerTextHash(svcText) }),
      policyKeep("policy:keep-field-ok", { module: "field", id: fieldId, textHash: answerTextHash(fieldText) }),
      // doc 카드에 잘못 들어간 curatedRef 는 런타임이 보지 않는다(문장 해시만 대조).
      { ...doc, answer: { ...doc.answer, curatedRef: { module: "svc", id: "showroom-confirm", textHash: answerTextHash(svcText) } } },
    ]
    const dir = fixture({ ...baseFiles(units, siteFacts), "cards/company.json": cards })

    const runtime = loadRuntimeData({ dir, currentUnits: units, curatedTextHash })
    const runtimeOff = runtime.excluded.filter((item) => item.reason.startsWith("stale: 옛 답")).map((item) => item.id).sort()
    expect(runtime.cards.map((card) => card.id).sort()).toEqual(
      ["fixed:keep-basics-ok", "fixed:keep-field-ok", "policy:keep-field-ok", `${MEMBER_UNIT}/remove-member`].sort()
    )

    const result = await runVerify({ dir, current: currentSources(units, siteFacts, { inventory }), devSets: [] })
    const verifyOff = Array.from(
      new Set(
        errorsOf(result.findings, "V-2")
          .filter((finding) => finding.message.includes("curatedRef"))
          .map((finding) => finding.message.slice(0, finding.message.indexOf(": ")))
      )
    ).sort()
    expect(verifyOff).toEqual(runtimeOff)
    expect(verifyOff).toEqual(
      ["fixed:keep-basics-stale", "fixed:keep-svc", "fixed:keep-template", "fixed:keep-missing", "policy:keep-field-stale", "policy:keep-svc"].sort()
    )
    // policy 카드에 curatedRef 를 두면 스키마 오류다(load 는 curatedRef 만 보고 policyRef 를 보지 않는다).
    const v12 = errorsOf(result.findings, "V-12").filter((finding) => finding.message.includes("policy 카드 answer 에 curatedRef"))
    expect(v12.map((finding) => finding.message.slice(0, finding.message.indexOf(": "))).sort()).toEqual(
      ["policy:keep-field-ok", "policy:keep-field-stale", "policy:keep-svc"].sort()
    )
  })
})

describe("V-3 결정 전 정책 구절(blockPhrases)", () => {
  const PHRASE = "2주 무료 체험"
  const fixedText = (id: string, text: string, overrides: Record<string, unknown> = {}) => ({
    id,
    kind: "fixed",
    tier: "head",
    area: "pricing",
    topic: "시험용 고친 글",
    answer: { text, textHash: answerTextHash(text) },
    status: "active",
    ...overrides,
  })
  const policyCard = (id: string, text: string, policyRef: string) => ({
    id,
    kind: "policy",
    tier: "head",
    area: "pricing",
    topic: "시험용 정책 글",
    answer: { text, textHash: answerTextHash(text), policyRef },
    status: "active",
  })
  const queueItem = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    topic: "무료 체험 표기",
    currentText: "",
    conflict: "",
    proposal: null,
    affectedCards: [],
    decision: null,
    decidedBy: null,
    decidedAt: null,
    ...extra,
  })
  const phraseErrors = (findings: VerifyFinding[]) => errorsOf(findings, "V-3").filter((finding) => finding.message.includes("정책 대기"))

  it("결정 전 항목의 구절이 active fixed(text)·doc 답 글에 정규화 포함되면 오류, active policy 카드는 어느 항목을 가리키든 통과", async () => {
    const unit = units.find((candidate) => candidate.unitId === MEMBER_UNIT)!
    const docPhrase = unit.sentences[3].text.slice(0, 10)
    const dir = fixture({
      ...baseFiles(units, siteFacts),
      "audit/human-queue.json": {
        items: [
          queueItem("HQ-90", { blockPhrases: [PHRASE] }),
          queueItem("HQ-91", { blockPhrases: [docPhrase] }),
          queueItem("HQ-92", { blockPhrases: ["결정이 난 구절"], decision: "그대로 쓴다", decidedBy: "사람", decidedAt: "2026-11-19" }),
          queueItem("HQ-93"),
        ],
      },
      "cards/pricing.json": [
        // 띄어쓰기·문장부호가 달라도 정규화하면 같다.
        fixedText("fixed:trial-text", "처음에는 2 주, 무료 체험으로 써 보실 수 있어요."),
        fixedText("fixed:trial-review", "2주 무료 체험이 있어요.", { status: "review" }),
        fixedText("fixed:trial-disabled", "2주 무료 체험이 있어요.", { status: "disabled" }),
        fixedText("fixed:decided", "결정이 난 구절이 들어 있어요."),
        policyCard("policy:free-trial", "2주 무료 체험은 정책 결정 뒤 안내해요.", "HQ-90"),
        // 정책 주제는 사람이 쓴 지금 운영 글로만 답한다: 다른 대기 항목(HQ-90) 구절이 든 policy 카드도 막지 않는다.
        policyCard("policy:other", "다른 정책 글에 2주 무료 체험이 섞였어요.", "HQ-93"),
      ],
      "cards/course.json": [memberCard()],
      "variants/course.json": memberVariants(),
    })
    const result = await runVerify({ dir, current: currentSources(units, siteFacts), devSets: [] })
    const errors = phraseErrors(result.findings)
    const flagged = errors.map((finding) => finding.message.split(":")[0] + ":" + finding.message.split(":")[1]).sort()
    expect(flagged).toEqual(["doc:/docs/teacher/course-members#4/remove-member", "fixed:trial-text"].sort())
    const trial = errors.find((finding) => finding.message.startsWith("fixed:trial-text:"))!
    expect(trial.message).toContain("정책 대기 HQ-90 구절: 카드를 review 로 두거나 policy 카드로 보낸다")
    expect(trial.file).toBe("cards/pricing.json")
    expect(errors.find((finding) => finding.message.startsWith("doc:"))!.message).toContain("HQ-91")
  })

  it("blockPhrases 가 없는 항목은 아무것도 막지 않고, 꼴이 틀리면 V-12 오류", async () => {
    const dir = fixture({
      ...baseFiles(units, siteFacts),
      "audit/human-queue.json": { items: [queueItem("HQ-90"), queueItem("HQ-94", { blockPhrases: "2주 무료 체험" })] },
      "cards/pricing.json": [fixedText("fixed:trial-text", "2주 무료 체험이 있어요.")],
    })
    const result = await runVerify({ dir, current: currentSources(units, siteFacts), devSets: [] })
    expect(phraseErrors(result.findings)).toEqual([])
    expect(errorsOf(result.findings, "V-12").some((finding) => finding.message.includes("HQ-94: blockPhrases 는 문자열 배열"))).toBe(true)
  })

  it("KEEP 카드는 지금 옛 답 글로, 공백 카드는 관련 문장 글로 본다(review·svc KEEP 은 이 규칙에서 빼고)", async () => {
    const keepText = "체험은 2주 무료 체험으로 시작해요."
    const unit = units.find((candidate) => candidate.unitId === MEMBER_UNIT)!
    const related = unit.sentences[3]
    const relatedPhrase = related.text.slice(0, 12)
    const keep = (id: string, module: string, extra: Record<string, unknown> = {}) => ({
      id,
      kind: "fixed",
      tier: "head",
      area: "pricing",
      topic: "시험용 KEEP",
      answer: { curatedRef: { module, id: "trial", textHash: answerTextHash(keepText) } },
      status: "active",
      ...extra,
    })
    const dir = fixture({
      ...baseFiles(units, siteFacts),
      "audit/human-queue.json": { items: [queueItem("HQ-90", { blockPhrases: [PHRASE] }), queueItem("HQ-91", { blockPhrases: [relatedPhrase] })] },
      "cards/pricing.json": [
        keep("fixed:keep-trial", "basics"),
        keep("fixed:keep-trial-review", "basics", { status: "review" }),
        keep("fixed:keep-trial-svc", "svc"),
        {
          id: "gap:pricing/trial-other",
          kind: "gap",
          tier: "standard",
          area: "pricing",
          topic: "시험용 공백",
          answer: { template: "gap_default", related: [{ unit: MEMBER_UNIT, i: 3, hash: related.hash }], handoff: null },
          status: "active",
        },
      ],
    })
    const inventory = new Map([
      ["basics:trial", { text: keepText, textHash: answerTextHash(keepText) }],
      ["svc:trial", { text: keepText, textHash: answerTextHash(keepText) }],
    ])
    const result = await runVerify({ dir, current: currentSources(units, siteFacts, { inventory }), devSets: [] })
    const flagged = phraseErrors(result.findings).map((finding) => finding.message.slice(0, finding.message.indexOf(": "))).sort()
    expect(flagged).toEqual(["fixed:keep-trial", "gap:pricing/trial-other"])
    expect(phraseErrors(result.findings).find((finding) => finding.message.startsWith("gap:"))!.message).toContain("HQ-91")
    // svc KEEP 은 V-2 가 거부한다.
    expect(errorsOf(result.findings, "V-2").some((finding) => finding.message.startsWith("fixed:keep-trial-svc:"))).toBe(true)
  })

  it("howto 카드는 증상 주제·가이드 답 글(지금 코드)로 본다", async () => {
    const topicText = "녹화가 안 보이면 2주 무료 체험 계정인지 먼저 확인해 주세요."
    const dir = fixture({
      ...baseFiles(units, siteFacts),
      "audit/human-queue.json": { items: [queueItem("HQ-90", { blockPhrases: [PHRASE] })] },
      "cards/recording.json": [
        { id: "howto:recording-missing", kind: "howto", tier: "standard", area: "recording", topic: "녹화가 안 보임", answer: { symptomTopic: "recording-missing" }, status: "active" },
      ],
    })
    const result = await runVerify({
      dir,
      current: currentSources(units, siteFacts, {
        symptomTopics: new Set(["recording-missing"]),
        inventory: new Map([["symptom:recording-missing", { text: topicText, textHash: answerTextHash(topicText) }]]),
      }),
      devSets: [],
    })
    expect(phraseErrors(result.findings).map((finding) => finding.message)).toEqual([
      expect.stringContaining("howto:recording-missing: 정책 대기 HQ-90 구절"),
    ])
  })

  it("다른 항목 구절이 든 active policy 카드는 통과하고, 같은 구절이 든 doc·fixed(FIX·KEEP)·howto·gap 은 여전히 오류", async () => {
    const unit = units.find((candidate) => candidate.unitId === MEMBER_UNIT)!
    const related = unit.sentences[3]
    const docPhrase = related.text.slice(0, 10)
    const keepText = "체험은 2주 무료 체험으로 시작해요."
    const topicText = "녹화가 안 보이면 2주 무료 체험 계정인지 먼저 확인해 주세요."
    // 요금 질문의 지금 운영 글: 무료 체험(HQ-90)·문서 구절(HQ-91)이 함께 들어도 policyRef(HQ-95)와 상관없이 그대로 쓴다.
    const policyText = `요금제는 상담으로 안내해요. ${PHRASE}도 있어요. ${related.text}`
    const dir = fixture({
      ...baseFiles(units, siteFacts),
      "audit/human-queue.json": {
        items: [
          queueItem("HQ-90", { blockPhrases: [PHRASE] }),
          queueItem("HQ-91", { blockPhrases: [docPhrase] }),
          queueItem("HQ-95", { topic: "요금제 이름", blockPhrases: ["시험용 요금제 이름"] }),
        ],
      },
      "cards/pricing.json": [
        policyCard("policy:plan-overview", policyText, "HQ-95"),
        policyCard("policy:outside-queue", policyText, "HQ-07"),
        fixedText("fixed:trial-text", `처음에는 ${PHRASE}으로 써 보실 수 있어요.`),
        {
          id: "fixed:keep-trial",
          kind: "fixed",
          tier: "head",
          area: "pricing",
          topic: "시험용 KEEP",
          answer: { curatedRef: { module: "basics", id: "trial", textHash: answerTextHash(keepText) } },
          status: "active",
        },
        {
          id: "gap:pricing/trial-other",
          kind: "gap",
          tier: "standard",
          area: "pricing",
          topic: "시험용 공백",
          answer: { template: "gap_default", related: [{ unit: MEMBER_UNIT, i: 3, hash: related.hash }], handoff: null },
          status: "active",
        },
      ],
      "cards/recording.json": [
        { id: "howto:recording-missing", kind: "howto", tier: "standard", area: "recording", topic: "녹화가 안 보임", answer: { symptomTopic: "recording-missing" }, status: "active" },
      ],
      "cards/course.json": [memberCard()],
      "variants/course.json": memberVariants(),
    })
    const result = await runVerify({
      dir,
      current: currentSources(units, siteFacts, {
        symptomTopics: new Set(["recording-missing"]),
        inventory: new Map([
          ["basics:trial", { text: keepText, textHash: answerTextHash(keepText) }],
          ["symptom:recording-missing", { text: topicText, textHash: answerTextHash(topicText) }],
        ]),
      }),
      devSets: [],
    })
    const errors = phraseErrors(result.findings)
    const flagged = errors.map((finding) => finding.message.slice(0, finding.message.indexOf(": "))).sort()
    expect(flagged).toEqual(
      [
        "doc:/docs/teacher/course-members#4/remove-member",
        "fixed:keep-trial",
        "fixed:trial-text",
        "gap:pricing/trial-other",
        "howto:recording-missing",
      ].sort()
    )
    expect(errors.some((finding) => finding.message.startsWith("policy:"))).toBe(false)
    const itemsOf = (id: string) => errors.find((finding) => finding.message.startsWith(`${id}: `))!.message
    expect(itemsOf("fixed:trial-text")).toContain("HQ-90")
    expect(itemsOf("fixed:keep-trial")).toContain("HQ-90")
    expect(itemsOf("howto:recording-missing")).toContain("HQ-90")
    expect(itemsOf("doc:/docs/teacher/course-members#4/remove-member")).toContain("HQ-91")
    expect(itemsOf("gap:pricing/trial-other")).toContain("HQ-91")
    // 대기열 항목은 사람 결정을 기다리는 그대로다: policyRef 가 대기열 밖이면 V-11 은 여전히 오류.
    expect(errorsOf(result.findings, "V-11").some((finding) => finding.message.startsWith("policy:outside-queue:"))).toBe(true)
    expect(errorsOf(result.findings, "V-11").some((finding) => finding.message.startsWith("policy:plan-overview:"))).toBe(false)
  })
})

describe("V-14·V-15 카드 꼴·변형 한 줄 물음(R3)", () => {
  const goodText = [
    "카메라 랜선과 전원 장치부터 확인해 주세요.",
    "",
    "1. 전원 장치가 켜져 있는지 봐요.",
    "2. 랜선이 출력 단자에 꽂혀 있는지 봐요.",
    "3. 다시 꽂았다면 1~2분 뒤 [검색]을 다시 눌러요.",
    "",
    '그래도 안 되면 "상담원 연결"이라고 남겨 주세요. 교실 위치와 카메라 모델을 알려 주시면 원격으로 점검해 드려요.',
  ].join("\n")
  const badText = [
    "이 카드는 첫 줄이 너무 길어서 결론 한 줄 규칙을 지키지 못하는 글이고 [기관 관리] 메뉴 이름도 옛 이름입니다.",
    "※ 설정은 직접 바꾸지 마세요.",
    "",
    "1. 하나를 눌러요.",
    "2. 둘을 눌러요.",
    "3. 셋을 눌러요.",
    "4. 넷을 눌러요.",
    "5. 다섯을 눌러요.",
  ].join("\n")
  const fixedCard = (id: string, text: string, extra: Record<string, unknown> = {}) => ({
    id,
    kind: "fixed",
    tier: "standard",
    area: "classroom",
    topic: "시험 카드",
    answer: { text, textHash: answerTextHash(text) },
    status: "active",
    ...extra,
  })
  const variants = (id: string, qs: string[]) => ({ [id]: qs.map((q) => ({ q, p: "fixture", g: "A", m: "fixture" })) })

  it("축약 카드 조각(team<4자리>)은 꼴·첫 줄·말투·옛 메뉴 이름·접두를 오류로, 기존 카드는 카드마다 경고 한 줄로 본다", async () => {
    const dir = fixture({
      ...baseFiles(units, siteFacts),
      "cards/classroom.team1126.json": [fixedCard("fixed:r3-shape-good", goodText), fixedCard("fixed:r3-shape-bad", badText)],
      "cards/classroom.json": [fixedCard("fixed:r3-shape-old", badText)],
    })
    const result = await runVerify({ dir, current: currentSources(units, siteFacts), devSets: [] })
    const v14 = result.findings.filter((finding) => finding.rule === "V-14")
    expect(v14.filter((finding) => finding.message.startsWith("fixed:r3-shape-good"))).toEqual([])
    const strictErrors = errorsOf(v14).filter((finding) => finding.message.startsWith("fixed:r3-shape-bad"))
    for (const code of ["first_line_60", "steps_4", "첫 줄이 결론이 아님", "니다체·요체 섞임", "옛 메뉴 이름", "※"]) {
      expect(strictErrors.some((finding) => finding.message.includes(code))).toBe(true)
    }
    const old = v14.filter((finding) => finding.message.startsWith("fixed:r3-shape-old"))
    expect(old).toHaveLength(1)
    expect(old[0].level).toBe("warning")
    expect(old[0].file).toBe("cards/classroom.json")
    expect(v14.some((finding) => finding.level === "info" && finding.message.includes("첫 줄 결론"))).toBe(true)
  })

  it("합친 뒤에도 provenance.unit 이 team<4자리>면 축약 카드 조각으로 본다", async () => {
    const provenance = { unit: "team1126", writer: "fixture", at: "2026-11-26", legacyIds: [] }
    const dir = fixture({ ...baseFiles(units, siteFacts), "cards/classroom.json": [fixedCard("fixed:r3-shape-merged", badText, { provenance })] })
    const result = await runVerify({ dir, current: currentSources(units, siteFacts), devSets: [] })
    expect(errorsOf(result.findings, "V-14").some((finding) => finding.message.startsWith("fixed:r3-shape-merged"))).toBe(true)
  })

  it("toneLocked 카드는 말투 섞임을 보지 않고, 꼴이 틀린 toneLocked·role 은 V-12 오류다", async () => {
    const mixed = "네, 막을 수 있어요.\n관련 약관에 따라 처리됩니다."
    const dir = fixture({
      ...baseFiles(units, siteFacts),
      "cards/classroom.team1126.json": [fixedCard("fixed:r3-tone-locked", mixed, { toneLocked: true }), fixedCard("fixed:r3-bad-flags", goodText, { toneLocked: "yes", role: "main" })],
    })
    const result = await runVerify({ dir, current: currentSources(units, siteFacts), devSets: [] })
    expect(result.findings.filter((finding) => finding.rule === "V-14" && finding.message.startsWith("fixed:r3-tone-locked") && finding.message.includes("섞임"))).toEqual([])
    const v12 = errorsOf(result.findings, "V-12").map((finding) => finding.message)
    expect(v12.some((message) => message.includes("fixed:r3-bad-flags: toneLocked"))).toBe(true)
    expect(v12.some((message) => message.includes("fixed:r3-bad-flags: role"))).toBe(true)
  })

  it("V-15 변형이 두 조각으로 나뉘면 축약 카드는 오류, 기존 카드는 카드마다 경고 한 줄, compoundOk 면 통과", async () => {
    const compound = "녹화는 어디서 봐요? 그리고 삭제는 어떻게 해요?"
    const dir = fixture({
      ...baseFiles(units, siteFacts),
      "cards/classroom.team1126.json": [fixedCard("fixed:r3-variant-new", goodText)],
      "cards/classroom.json": [fixedCard("fixed:r3-variant-old", goodText)],
      "variants/classroom.json": {
        ...variants("fixed:r3-variant-new", [compound, "카메라가 안 잡혀요"]),
        ...variants("fixed:r3-variant-old", [compound, "녹화는 어디서 봐요? 그리고 다운로드는 어떻게 해요?"]),
      },
      "variants/classroom.team1126.json": { "fixed:r3-variant-flag": [{ q: compound, p: "fixture", g: "A", m: "fixture", compoundOk: true }] },
    })
    const result = await runVerify({ dir, current: currentSources(units, siteFacts), devSets: [] })
    const v15 = result.findings.filter((finding) => finding.rule === "V-15")
    expect(errorsOf(v15).filter((finding) => finding.message.startsWith("fixed:r3-variant-new"))).toHaveLength(1)
    const old = v15.filter((finding) => finding.message.startsWith("fixed:r3-variant-old"))
    expect(old).toHaveLength(1)
    expect(old[0]).toMatchObject({ level: "warning" })
    expect(old[0].message).toContain("변형 2줄")
    expect(v15.some((finding) => finding.message.startsWith("fixed:r3-variant-flag"))).toBe(false)
  })
})
