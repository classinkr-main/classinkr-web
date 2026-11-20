import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import { answerIndexHash, compileAnswerIndex, resolveCalibration, DEFAULT_CONFIDENCE, DEFAULT_THRESHOLDS } from "@/lib/chatbot/answer-index/compile"
import { decide } from "@/lib/chatbot/answer-index/decide"
import { answerTextHash } from "@/lib/chatbot/answer-index/hash"
import { ANSWER_INDEX_VERSION, buildCurrentUnits, getAnswerIndex, isPartFileName, loadAnswerIndexData } from "@/lib/chatbot/answer-index/load"
import { ANSWER_INDEX_FEATURES, type AnswerCard, type AnswerIndexUnit } from "@/lib/chatbot/answer-index/types"
import { SYMPTOM_TOPICS } from "@/lib/chatbot/symptom-triage"
import { stableJson } from "@/scripts/answer-index/lib/common"
import { mergeParts } from "@/scripts/answer-index/lib/merge-core"
import { buildUnits, loadUnitSources } from "@/scripts/answer-index/lib/units"
import { CARDS, compileFixture, copyFixture, FIXTURE_DIR, fixtureLoadOptions, fixtureUnits } from "./index-fixture"

// 답 색인 사양 §3.1 load.ts(자료 읽기·낡은 카드 끄기), §3.10(1안: 첫 요청 컴파일), §12.1 I5(같은 자료 → 같은 색인 해시).

const cleanups: (() => void)[] = []
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.()
})

function tempCopy() {
  const made = copyFixture()
  cleanups.push(made.cleanup)
  return made.dir
}

function emptyDir() {
  const dir = mkdtempSync(join(tmpdir(), "answer-index-empty-"))
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"))

describe("load: 런타임 자료 읽기", () => {
  it("런타임 파일만 읽고 eval/·units.json·합치지 않은 조각은 읽지 않는다", () => {
    const data = loadAnswerIndexData(fixtureLoadOptions())
    expect(data.files.some((file) => file.startsWith("eval/") || file === "units.json")).toBe(false)
    // eval/broken.json 은 JSON 이 깨져 있지만 읽지 않으므로 문제로 잡히지 않는다.
    expect(data.problems).toEqual([])
    expect(data.skipped).toEqual(["cards/classroom.D1-99.json"])
    expect(data.cards.map((card) => card.id)).not.toContain("doc:/docs/fake/chat#0/unmerged-part")
    expect(data.dataVersion).toBe("ai-fixture")
    expect(isPartFileName("account.D1-07.json")).toBe(true)
    expect(isPartFileName("account.json")).toBe(false)
  })

  it("status 가 active 가 아닌 카드와 문장 해시가 어긋난 카드를 색인에서 뺀다", () => {
    const data = loadAnswerIndexData(fixtureLoadOptions())
    expect(data.excluded).toEqual([
      { id: "doc:/docs/fake/chat#0/review-only", file: "cards/classroom.json", reason: "status: review" },
      { id: "doc:/docs/fake/chat#0/stale", file: "cards/classroom.json", reason: "stale: 답 문장: 해시 다름(doc:/docs/fake/chat#0 #0)" },
    ])
    expect(data.cards.map((card) => card.id).sort()).toEqual(Object.values(CARDS).sort())
    // 꺼진 카드의 변형은 싣지 않는다.
    expect(Array.from(data.variants.keys()).every((id) => data.cards.some((card) => card.id === id))).toBe(true)
  })

  it("지금 문서가 바뀌면(해시 다름·문장 없음·단위 없음) 그 카드만 꺼지고 다음 순위가 경쟁한다", () => {
    const units = fixtureUnits().map((unit) =>
      unit.unitId === "doc:/docs/fake/chat#0"
        ? { ...unit, sentences: unit.sentences.map((sentence, i) => (i === 1 ? { ...sentence, text: "바뀐 문장", hash: "ffffffffffffffff" } : sentence)) }
        : unit
    )
    const data = loadAnswerIndexData(fixtureLoadOptions(FIXTURE_DIR, { currentUnits: units }))
    expect(data.excluded.find((item) => item.id === CARDS.chat)?.reason).toBe("stale: 답 문장: 해시 다름(doc:/docs/fake/chat#0 #1)")
    const index = compileAnswerIndex(data)
    expect(index.cardById.has(CARDS.chat)).toBe(false)
    expect(decide(index, "학생 채팅 금지 되나요").card).not.toBe(CARDS.chat)

    const without = fixtureUnits().filter((unit) => unit.unitId !== "doc:/docs/fake/kick#0")
    const missing = loadAnswerIndexData(fixtureLoadOptions(FIXTURE_DIR, { currentUnits: without }))
    expect(missing.excluded.find((item) => item.id === CARDS.kick)?.reason).toBe("stale: 답 문장: 단위 없음(doc:/docs/fake/kick#0)")
  })

  it("고친 글(text) 카드는 textHash 가, KEEP 카드는 넘겨받은 옛 답 글 해시가 맞아야 한다", () => {
    const dir = tempCopy()
    const pricing = readJson(join(dir, "cards/pricing.json")) as AnswerCard[]
    const keepText = "옛 답 글"
    pricing.push(
      { id: "fixed:wrong-hash", kind: "fixed", tier: "head", area: "pricing", topic: "해시 틀림", status: "active", answer: { text: "글", textHash: "0000000000000000" } },
      { id: "fixed:keep", kind: "fixed", tier: "head", area: "pricing", topic: "옛 답 그대로", status: "active", answer: { curatedRef: { module: "basics", id: "keep", textHash: answerTextHash(keepText) } } },
      { id: "policy:no-ref", kind: "policy", tier: "head", area: "pricing", topic: "정책", status: "active", answer: { text: "정책 글", textHash: answerTextHash("정책 글") } } as unknown as AnswerCard
    )
    writeFileSync(join(dir, "cards/pricing.json"), stableJson(pricing))

    const unchecked = loadAnswerIndexData(fixtureLoadOptions(dir))
    expect(unchecked.excluded.find((item) => item.id === "fixed:wrong-hash")?.reason).toBe("stale: 답 글 해시 다름")
    expect(unchecked.excluded.find((item) => item.id === "policy:no-ref")?.reason).toBe("schema: policyRef 없음")
    expect(unchecked.cards.some((card) => card.id === "fixed:keep")).toBe(true)
    expect(unchecked.report.curatedUnchecked).toBe(1)

    const changed = loadAnswerIndexData(fixtureLoadOptions(dir, { curatedTextHash: () => answerTextHash("바뀐 옛 답 글") }))
    expect(changed.excluded.find((item) => item.id === "fixed:keep")?.reason).toBe("stale: 옛 답 글 해시 다름(basics:keep)")
    const same = loadAnswerIndexData(fixtureLoadOptions(dir, { curatedTextHash: () => answerTextHash(keepText) }))
    expect(same.cards.some((card) => card.id === "fixed:keep")).toBe(true)
    const gone = loadAnswerIndexData(fixtureLoadOptions(dir, { curatedTextHash: () => null }))
    expect(gone.excluded.find((item) => item.id === "fixed:keep")?.reason).toBe("stale: 옛 답 없음(basics:keep)")
  })

  it("같은 id 는 처음 것만 쓰고, 꼴이 틀린 카드는 schema 로 뺀다", () => {
    const dir = tempCopy()
    writeFileSync(join(dir, "cards/zzz.json"), stableJson([{ id: CARDS.chat, kind: "doc" }, { id: "doc:x", kind: "unknown", area: "course", topic: "t", status: "active" }]))
    const data = loadAnswerIndexData(fixtureLoadOptions(dir))
    expect(data.excluded).toContainEqual({ id: CARDS.chat, file: "cards/zzz.json", reason: "schema: 영역(undefined)" })
    expect(data.excluded).toContainEqual({ id: "doc:x", file: "cards/zzz.json", reason: "schema: 종류(unknown)" })
  })
})

describe("load: 지금 문서(lib/docs)와 대조", () => {
  let units: Map<string, AnswerIndexUnit>
  beforeAll(() => {
    units = buildCurrentUnits()
  })

  it("런타임이 만든 단위는 추출기(units.json)와 문장·해시가 같다", async () => {
    const extracted = buildUnits(await loadUnitSources())
    expect(units.size).toBe(extracted.length)
    for (const unit of extracted) {
      const runtime = units.get(unit.unitId)
      expect(runtime?.sentences.map((sentence) => [sentence.i, sentence.hash, sentence.flags])).toEqual(
        unit.sentences.map((sentence) => [sentence.i, sentence.hash, sentence.flags])
      )
    }
  })

  it("실제 문서 문장을 가리키는 카드는 켜지고, 해시가 다르거나 없는 증상 주제를 가리키면 꺼진다", () => {
    const dir = emptyDir()
    const unit = Array.from(units.values()).find((candidate) => candidate.kind === "section" && candidate.sentences.length >= 2)!
    const card = (id: string, hash: string): AnswerCard => ({
      id,
      kind: "doc",
      tier: "standard",
      area: "course",
      topic: "실제 문서 카드",
      status: "active",
      answer: { sentences: [{ unit: unit.unitId, ids: [0], hashes: [hash] }] },
    })
    writeFileSync(join(dir, "manifest.json"), stableJson({ dataVersion: "ai-real" }))
    mkdirSync(join(dir, "cards"))
    writeFileSync(
      join(dir, "cards/course.json"),
      stableJson([
        card(`${unit.unitId}/ok`, unit.sentences[0].hash),
        card(`${unit.unitId}/stale`, "0123456789abcdef"),
        { id: "howto:real", kind: "howto", tier: "standard", area: "support", topic: "증상", status: "active", answer: { symptomTopic: SYMPTOM_TOPICS[0].id } },
        { id: "howto:gone", kind: "howto", tier: "standard", area: "support", topic: "증상", status: "active", answer: { symptomTopic: "no-such-topic" } },
      ])
    )
    const data = loadAnswerIndexData({ dir })
    expect(data.cards.map((item) => item.id)).toEqual([`${unit.unitId}/ok`, "howto:real"])
    expect(data.excluded.map((item) => [item.id, item.reason])).toEqual([
      [`${unit.unitId}/stale`, `stale: 답 문장: 해시 다름(${unit.unitId} #0)`],
      ["howto:gone", "stale: 증상 주제 없음(no-such-topic)"],
    ])
  })
})

describe("compile: 결정적 색인", () => {
  it("같은 자료면 같은 색인 해시, 변형 하나가 바뀌면 다른 해시", () => {
    const first = compileFixture()
    const second = compileFixture()
    expect(answerIndexHash(first)).toBe(answerIndexHash(second))
    expect(answerIndexHash(first)).toMatch(/^[0-9a-f]{16}$/)

    const dir = tempCopy()
    const variants = readJson(join(dir, "variants/course.json"))
    variants[CARDS.remove][0].q = "코스에서 학생 정리하는 법"
    writeFileSync(join(dir, "variants/course.json"), stableJson(variants))
    expect(answerIndexHash(compileFixture(dir))).not.toBe(answerIndexHash(first))
  })

  it("카드를 다른 파일로 나눠 담거나 파일 순서가 달라도 같은 색인이다", () => {
    const dir = tempCopy()
    const all = ["classroom", "course", "pricing", "recording", "support", "trust"].flatMap((area) => readJson(join(dir, `cards/${area}.json`)) as unknown[])
    for (const area of ["classroom", "course", "pricing", "recording", "support", "trust"]) rmSync(join(dir, `cards/${area}.json`))
    writeFileSync(join(dir, "cards/aaa.json"), stableJson([...all].reverse()))
    expect(answerIndexHash(compileFixture(dir))).toBe(answerIndexHash(compileFixture()))
  })

  it("컴파일 통계: 활성 카드·변형·우주(라벨 없음·missing 제외)·반례", () => {
    const index = compileFixture()
    expect(index.stats.cards).toBe(Object.keys(CARDS).length)
    // 우주 9개 중 라벨 없음 1·missing 1 을 뺀 7개(검토 중 카드 라벨은 '쓸 수 없음' 라벨로 남는다).
    expect(index.stats.universe).toBe(7)
    expect(index.stats.negatives).toBe(4)
    expect(index.stats.units).toBe(fixtureUnits().length)
    expect(index.calibration.fitted).toBe(true)
  })

  it("calibration.json 이 없으면 §3.4·§4.2 기본값을 쓴다", () => {
    const calibration = resolveCalibration(null)
    expect(calibration.fitted).toBe(false)
    expect(calibration.weights).toEqual({ maxcos: 0.3, centroid: 0.7, knnShare: 0.5, vote: 0.15, bm25f: 0.1, linear: 0 })
    expect(calibration.thresholds).toEqual(DEFAULT_THRESHOLDS)
    // 계수 길이가 특징 수와 다르면 기본 계수로 둔다(경고 한 줄).
    const warnings: string[] = []
    const broken = resolveCalibration({ ...readJson(join(FIXTURE_DIR, "calibration.json")), confidence: { doc: { w: [1, 2], b: 0 } } }, (line) => warnings.push(line))
    expect(DEFAULT_CONFIDENCE.w).toHaveLength(ANSWER_INDEX_FEATURES.length)
    expect(broken.confidence.doc).toEqual({ w: DEFAULT_CONFIDENCE.w, b: DEFAULT_CONFIDENCE.b })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain("feature count mismatch")
    expect(warnings[0]).toContain('"doc:2"')
  })

  it("특징을 더하기 전 calibration.json(계수 13개)은 종류마다 기본 계수로 돌아가며 경고하고, 가중치·문턱은 그대로 읽는다", () => {
    const old = readJson(join(FIXTURE_DIR, "calibration.json")) as { confidence: Record<string, { w: number[]; b: number }>; thresholds: Record<string, number> }
    for (const entry of Object.values(old.confidence)) entry.w = entry.w.slice(0, 13)
    const warnings: string[] = []
    const resolved = resolveCalibration(old as never, (line) => warnings.push(line))
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain(`"expected":${ANSWER_INDEX_FEATURES.length}`)
    for (const kind of Object.keys(old.confidence)) expect(resolved.confidence[kind as keyof typeof resolved.confidence].w).toEqual(DEFAULT_CONFIDENCE.w)
    expect(resolved.thresholds).toEqual(old.thresholds)
    // 길이가 맞으면 경고하지 않는다.
    const current = resolveCalibration(readJson(join(FIXTURE_DIR, "calibration.json")) as never, (line) => warnings.push(line))
    expect(warnings).toHaveLength(1)
    expect(current.confidence.doc.w).toHaveLength(ANSWER_INDEX_FEATURES.length)
  })

  it("카드가 0장이면 색인은 만들어지고 판정은 언제나 abstain 이다", () => {
    const dir = emptyDir()
    const index = compileAnswerIndex(loadAnswerIndexData({ dir, currentUnits: fixtureUnits(), symptomTopics: new Set(), guides: new Set() }))
    expect(index.stats.cards).toBe(0)
    for (const question of ["녹화 되나요", "그거 안 돼요", "로그인 에러나요", "녹화 되나요? 그리고 가격은요?"]) {
      const decision = decide(index, question)
      expect(decision.kind).toBe("abstain")
      expect(decision.card).toBeNull()
    }
  })

  it("프로세스 안 색인과 판 이름", () => {
    expect(ANSWER_INDEX_VERSION).toMatch(/^ai-[0-9a-z-]+\+c\d+$/)
    const index = getAnswerIndex(fixtureLoadOptions())
    expect(index.dataVersion).toBe("ai-fixture")
  })
})

describe("merge.ts 결과 꼴을 그대로 읽는다", () => {
  it("조각(cards·variants·universe·lexicon)을 합친 뒤 load·compile 이 합친 카드로 답한다", () => {
    const dir = tempCopy()
    rmSync(join(dir, "cards/classroom.D1-99.json"))
    const unit = fixtureUnits().find((candidate) => candidate.unitId === "doc:/docs/fake/edit#0")!
    const card: AnswerCard = {
      id: "doc:/docs/fake/edit#0/board-move",
      kind: "doc",
      tier: "standard",
      area: "classroom",
      topic: "판서 옮기기",
      status: "active",
      answer: { sentences: [{ unit: unit.unitId, ids: [0], hashes: [unit.sentences[0].hash] }] },
      concepts: ["C_board_move"],
      anchors: ["판서 옮기기"],
      provenance: { unit: "D1-50", writer: "fixture", at: "2026-11-19", legacyIds: [] },
    }
    const write = (rel: string, value: unknown) => writeFileSync(join(dir, rel), stableJson(value))
    write("cards/classroom.D1-50.json", [card])
    write("variants/classroom.D1-50.json", { [card.id]: ["판서 위치 바꾸는 법", "칠판 글씨 자리 옮기기", "판서를 다른 데로 끌어다 놓기"].map((q) => ({ q, p: "fixture", g: "A", m: "fixture" })) })
    write("universe/s002.D9-01.json", [{ id: "u-0100", q: "판서 글씨 다른 곳으로 옮기고 싶어요", p: "P-9", m: "fixture", label: card.id, conf: 0.9, labeler: "fixture", label2: null }])
    write("lexicon.D6-50.json", [{ id: "C_board_move", kind: "action", generic: false, parents: [], doc: ["판서 옮기기"], visitor: ["끌어다 놓기"], ambiguous: [] }])

    const before = loadAnswerIndexData(fixtureLoadOptions(dir))
    expect([...before.skipped].sort()).toEqual(["cards/classroom.D1-50.json", "lexicon.D6-50.json", "universe/s002.D9-01.json", "variants/classroom.D1-50.json"])
    expect(before.cards.some((item) => item.id === card.id)).toBe(false)

    const { reports } = mergeParts({ dir })
    expect(reports.every((report) => report.conflicts.length === 0)).toBe(true)
    const after = loadAnswerIndexData(fixtureLoadOptions(dir))
    expect(after.skipped).toEqual([])
    expect(after.cards.some((item) => item.id === card.id)).toBe(true)
    expect(after.variants.get(card.id)).toHaveLength(3)
    expect(after.universe.some((item) => item.id === "u-0100")).toBe(true)
    expect(after.lexicon.some((item) => item.id === "C_board_move")).toBe(true)
    expect(after.dataVersion).toMatch(/^ai-[0-9a-f]{12}$/)

    const index = compileAnswerIndex(after)
    expect(decide(index, "판서 위치 옮기는 방법").card).toBe(card.id)
  })
})
