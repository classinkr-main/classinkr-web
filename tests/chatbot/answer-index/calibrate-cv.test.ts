import { afterEach, describe, expect, it } from "vitest"

import { DEFAULT_THRESHOLDS, resolveCalibration } from "@/lib/chatbot/answer-index/compile"
import { analyzeQuestion, resolveDecision } from "@/lib/chatbot/answer-index/decide"
import { loadAnswerIndexData } from "@/lib/chatbot/answer-index/load"
import { ANSWER_CARD_KINDS, ANSWER_INDEX_FEATURES, type AnswerCardKind, type CalibrationSetItem, type UniverseItem } from "@/lib/chatbot/answer-index/types"
import {
  confidenceFromVector,
  digestAnalysis,
  examplePoints,
  finalLabel,
  fitConfidenceModels,
  fitLogistic,
  groupFolds,
  runCalibration,
  segmentConfs,
  selectThresholds,
  splitExamples,
  THRESHOLD_GRID,
  ThresholdEvaluator,
  thresholdFn,
  universeExamples,
  weightGrid,
  weightedScore,
  withSegmentConfs,
  type CalibrationExample,
  type ConfidenceModel,
  type ConfidenceRow,
} from "@/scripts/answer-index/lib/calibrate-core"
import { cvFoldKey, cvFoldOf, runVariantCv } from "@/scripts/answer-index/lib/cv-core"
import { calibrationBasisVersion } from "@/scripts/answer-index/lib/manifest"
import { createRng } from "@/scripts/answer-index/score"

import { CARDS, compileFixture, copyFixture, fixtureLoadOptions, fixtureUnits } from "./index-fixture"
import { writeDataFile } from "./helpers"

/**
 * 보정(calibrate-core.ts)과 변형 교차 검증(cv-core.ts). 완료 기준(사양 §12.1 I9): 같은 입력 → 같은 calibration.json, 혼동 표.
 * 진단 R1: 맞춤은 우주 관점 겹 교차 맞춤, 보정 묶음은 외부 확인만, 격자는 중첩 교차 검증, 작은 종류는 공용 모델.
 * 문항은 시험용으로 여기서 쓴 글이다(평가셋 문항이 아니다).
 */

const ITEMS: [string, string][] = [
  ["채팅 막는 기능 있어요", CARDS.chat],
  ["애들 채팅 금지시키려면", CARDS.chat],
  ["수업 채팅 차단하는 방법", CARDS.chat],
  ["채팅 못 치게 하고 싶어요", CARDS.chat],
  ["학생 채팅 끄는 법 알려주세요", CARDS.chat],
  ["떠드는 학생 강퇴하려면", CARDS.kick],
  ["학생 한 명 내보내기", CARDS.kick],
  ["수업에서 학생 쫓아내는 법", CARDS.kick],
  ["교실에서 학생 강제로 나가게 하기", CARDS.kick],
  ["코스에서 학생 지우는 법", CARDS.remove],
  ["반 명단에서 학생 빼기", CARDS.remove],
  ["구성원 삭제는 어디서 해요", CARDS.remove],
  ["그만둔 애 코스에서 빼고 싶어요", CARDS.remove],
  ["지난 수업 녹화 어디서 봐요", CARDS.replay],
  ["다시보기 보는 곳", CARDS.replay],
  ["녹화된 영상 보고 싶어요", CARDS.replay],
  ["수업 녹화 자동으로 돼요", CARDS.replay],
  ["녹화 파일 컴퓨터에 받기", CARDS.download],
  ["영상 다운로드 하는 법", CARDS.download],
  ["녹화본 내려받기 되나요", CARDS.download],
  ["한 반에 학생 몇 명까지", CARDS.count],
  ["수업 최대 몇 명 들어와요", CARDS.count],
  ["학생 인원 제한 있어요", CARDS.count],
  ["가격 어떻게 정해지나요", CARDS.price],
  ["요금은 뭐 기준이에요", CARDS.price],
  ["비용 얼마나 나와요", CARDS.price],
  ["판서한 거 지우기", CARDS.edit],
  ["칠판 글씨 옮기는 법", CARDS.edit],
  ["상담 몇 시까지 받아요", CARDS.gapHours],
  ["고객센터 시간 알려줘요", CARDS.gapHours],
  ["보안 인증 있나요", CARDS.gapCert],
  ["상담원이랑 연결해 줘요", CARDS.handoff],
  ["회사 주식 상장했어요", "none"],
  ["대표 이름이 뭐예요", "none"],
  ["사무실 주차 되나요", "none"],
  ["직원 몇 명이에요", "none"],
  ["다른 나라에도 지사 있어요", "none"],
  ["그거 뭐예요", "clarify"],
  ["이거 왜 이래요", "clarify"],
  ["판서 편집 화면이 어디예요", "missing:doc:/docs/fake/edit#0"],
]

function calibrationItems(): CalibrationSetItem[] {
  return ITEMS.map(([q, label], position) => ({ id: `cal-${String(position).padStart(3, "0")}`, q, p: "P-test", m: "test", label, label2: label }))
}

/** 시험용 우주: 같은 글을 관점 다섯(P-0~P-4)에 돌려 나누고, 진짜 NODOC 이 아닌 none(label2 가 카드)·범위 밖 문항을 더한다. */
function universeItems(): UniverseItem[] {
  const items: UniverseItem[] = ITEMS.map(([q, label], position) => ({
    id: `u-${String(position).padStart(3, "0")}`,
    q,
    p: `P-${position % 5}`,
    m: "test",
    label,
    conf: 0.9,
    labeler: "A",
    label2: null,
  }))
  items.push({ id: "u-900", q: "회사 건물 몇 층이에요", p: "P-0", m: "test", label: "none", conf: 0.6, labeler: "A·B 엇갈림→C", label2: CARDS.count })
  items.push({ id: "u-901", q: `${"채팅 막는 기능이 있는지 궁금해서 여쭤봅니다 ".repeat(5)}`, p: "P-1", m: "test", label: CARDS.chat, conf: 0.9, labeler: "A", label2: null })
  return items
}

const cleanups: (() => void)[] = []
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!()
})

function fixtureCopy(options: { universe?: UniverseItem[] | null; set?: CalibrationSetItem[] | null } = {}) {
  const copy = copyFixture()
  cleanups.push(copy.cleanup)
  if (options.universe !== undefined) writeDataFile(copy.dir, "universe/s001.json", options.universe ?? [])
  if (options.set) writeDataFile(copy.dir, "eval/calibration-set.json", { version: "test", items: options.set })
  return copy.dir
}

const loadOptions = { currentUnits: fixtureUnits(), symptomTopics: new Set<string>(), guides: new Set<string>() }

function examplesOf(index: ReturnType<typeof compileFixture>) {
  return universeExamples(universeItems(), index).examples
}

describe("calibrate", () => {
  it("writes default thresholds and coefficients when there is no usable universe", () => {
    const dir = fixtureCopy({ universe: [], set: calibrationItems() })
    const { calibration, report } = runCalibration({ dir, load: loadOptions })
    expect(report.defaults).toBe(true)
    expect(calibration.thresholds).toEqual(DEFAULT_THRESHOLDS)
    expect(calibration.fit).toEqual({ set: "none", n: 0, check: 0, bootstrapP10: 0 })
    expect(calibration.dataVersion).toBe(calibrationBasisVersion(dir))
    expect(calibration.version).toMatch(/^cal-[0-9a-f]{12}$/)
  })

  it("fits on universe persona folds with the nested weight grid and gives the same calibration.json for the same data", () => {
    const dir = fixtureCopy({ universe: universeItems(), set: calibrationItems() })
    const first = runCalibration({ dir, load: loadOptions })
    const second = runCalibration({ dir, load: loadOptions })
    expect(JSON.stringify(second.calibration)).toBe(JSON.stringify(first.calibration))
    const { calibration, report } = first
    expect(report.defaults).toBe(false)
    expect(report.counts.personas).toBe(5)
    expect(report.counts.folds).toBe(5)
    expect(report.counts.skipped.missing).toBe(1)
    expect(report.counts.skipped.outOfScope).toBe(1)
    // none 5 + gap 3(진짜 NODOC), label2 가 카드인 none 1 은 빠진다.
    expect(report.counts.labels.trueNodoc).toBe(8)
    expect(report.grid).toHaveLength(108)
    expect(report.grid.some((entry) => entry.weights.knnShare === 0)).toBe(true)
    for (const kind of ANSWER_CARD_KINDS) {
      expect(THRESHOLD_GRID).toContain(calibration.thresholds[kind])
      expect(calibration.confidence[kind]?.w).toHaveLength(ANSWER_INDEX_FEATURES.length)
    }
    // 맞춤 행이 20개 미만인 종류는 공용 모델(같은 w, 절편만 다름).
    expect(report.pooledKinds).toContain("handoff")
    for (const kind of report.pooledKinds) expect(calibration.confidence[kind]?.w).toEqual(calibration.confidence.handoff?.w)
    expect([...report.fittedKinds, ...report.pooledKinds].sort()).toEqual([...ANSWER_CARD_KINDS].sort())
    expect(calibration.fit.set).toMatch(/^universe-oof@[0-9a-f]{12}$/)
    expect(calibration.fit.n).toBe(report.counts.usable)
    // 보정 묶음은 외부 확인만(문항 수만 남긴다).
    expect(calibration.fit.check).toBe(ITEMS.length - 1)
    expect(report.external?.n).toBe(ITEMS.length - 1)
    expect(report.curve.common).toHaveLength(THRESHOLD_GRID.length)
    expect(report.curve.externalCommon).toHaveLength(THRESHOLD_GRID.length)
    expect(calibration.nodocRatesChecked).toEqual([0.2, 0.25, 0.3])
  }, 120_000)

  it("ignores the current calibration.json and the calibration-set labels when fitting", () => {
    const dir = fixtureCopy({ universe: universeItems(), set: calibrationItems() })
    const first = runCalibration({ dir, load: loadOptions, grid: false })
    writeDataFile(dir, "calibration.json", first.calibration)
    const again = runCalibration({ dir, load: loadOptions, grid: false })
    expect(JSON.stringify(again.calibration)).toBe(JSON.stringify(first.calibration))
    // 보정 묶음 라벨을 모두 바꿔도 가중치·계수·문턱은 같다(외부 확인 점수만 바뀐다).
    writeDataFile(dir, "eval/calibration-set.json", { version: "test", items: calibrationItems().map((item) => ({ ...item, label: "none", label2: "none" })) })
    const relabeled = runCalibration({ dir, load: loadOptions, grid: false })
    expect(relabeled.calibration.weights).toEqual(first.calibration.weights)
    expect(relabeled.calibration.confidence).toEqual(first.calibration.confidence)
    expect(relabeled.calibration.thresholds).toEqual(first.calibration.thresholds)
    expect(relabeled.report.external?.score).not.toBe(first.report.external?.score)
  })

  it("reuses cached grid entries without changing the result", () => {
    const dir = fixtureCopy({ universe: universeItems(), set: calibrationItems() })
    const cacheDir = fixtureCopy()
    const grid = weightGrid().filter((weights) => weights.vote === 0 && weights.bm25f === 0.1 && weights.maxcos === 0.3)
    const first = runCalibration({ dir, load: loadOptions, cacheDir, grid })
    const second = runCalibration({ dir, load: loadOptions, cacheDir, grid })
    expect(first.report.grid).toHaveLength(4)
    expect(first.report.gridCached).toBe(0)
    expect(second.report.gridCached).toBe(4)
    expect(second.report.grid).toEqual(first.report.grid)
    expect(JSON.stringify(second.calibration)).toBe(JSON.stringify(first.calibration))
  })

  it("splits universe folds by persona and marks true NODOC", () => {
    const index = compileFixture()
    const { examples, skipped } = universeExamples(universeItems(), index)
    expect(skipped).toEqual({ unlabeled: 0, missing: 1, unknownCard: 0, outOfScope: 1 })
    const notTrue = examples.find((example) => example.id === "u-900")!
    expect(notTrue.nodoc).toBe(true)
    expect(notTrue.trueNodoc).toBe(false)
    expect(examples.find((example) => example.label === "none" && example.id !== "u-900")?.trueNodoc).toBe(true)
    const { folds, foldOf } = groupFolds(examples)
    expect(folds).toBe(5)
    const byGroup = new Map<string, Set<number>>()
    examples.forEach((example, i) => byGroup.set(example.group!, (byGroup.get(example.group!) ?? new Set()).add(foldOf[i])))
    for (const set of byGroup.values()) expect(set.size).toBe(1)
    expect(groupFolds(examples.filter((example) => example.group === "P-0" || example.group === "P-1")).folds).toBe(2)
  })

  it("resolves calibration-set labels and splits deterministically by id hash", () => {
    expect(finalLabel({ label: "a", label2: "a", final: undefined })).toBe("a")
    expect(finalLabel({ label: "a", label2: "b", final: undefined })).toBeNull()
    expect(finalLabel({ label: "a", label2: "b", final: "b" })).toBe("b")
    expect(finalLabel({ label: "a", label2: null })).toBe("a")
    const index = compileFixture()
    const items = calibrationItems()
    const split = splitExamples(items, index)
    const reversed = splitExamples([...items].reverse(), index)
    expect(reversed.fit.map((example) => example.id)).toEqual(split.fit.map((example) => example.id))
    expect(split.fit.length).toBe(Math.ceil(((items.length - 1) * 2) / 3))
  })

  it("scores answers against labels and reweights the no-doc share", () => {
    const index = compileFixture()
    const base = { kind: "answer" as const, card: CARDS.chat, conf: 0.9, askType: null, top: [], unexplained: [], absentHit: null, absentTail: null, segments: null }
    expect(examplePoints({ id: "a", q: "", label: CARDS.chat, nodoc: false }, base, index)).toBeCloseTo(0.925)
    expect(examplePoints({ id: "a", q: "", label: CARDS.kick, nodoc: false }, base, index)).toBe(0)
    expect(examplePoints({ id: "a", q: "", label: "none", nodoc: true }, { ...base, kind: "abstain", card: null }, index)).toBe(1)
    expect(examplePoints({ id: "a", q: "", label: "none", nodoc: true }, base, index)).toBe(0)
    expect(weightedScore([1, 0], [true, false], 0.25)).toBeCloseTo(25)
    const grid = weightGrid()
    expect(grid).toHaveLength(108)
    expect(new Set(grid.map((weights) => weights.knnShare))).toEqual(new Set([0, 0.3, 0.5, 0.7]))
  })

  it("decides by threshold mask the same way as resolveDecision", () => {
    const index = compileFixture()
    const examples = examplesOf(index)
    const items = examples.map((example) => digestAnalysis(index, example, analyzeQuestion(index, example.q, { env: {} })))
    // 분석할 때의 계수로 다시 계산한 확신도는 분석의 확신도와 같다.
    const runtimeModel = index.calibration.confidence as ConfidenceModel
    items.forEach((item) => {
      const confs = segmentConfs(item, runtimeModel)
      const replaced = withSegmentConfs(item.analysis, confs)
      expect(replaced.whole.confs).toEqual(item.analysis.whole.confs)
    })
    const model: ConfidenceModel = Object.fromEntries(ANSWER_CARD_KINDS.map((kind) => [kind, { w: new Array(ANSWER_INDEX_FEATURES.length).fill(0.3), b: -1 }])) as ConfidenceModel
    const confs = items.map((item) => segmentConfs(item, model))
    const evaluator = new ThresholdEvaluator(items, examples, confs)
    const rng = createRng(7)
    for (let trial = 0; trial < 40; trial += 1) {
      const thresholds = Object.fromEntries(ANSWER_CARD_KINDS.map((kind) => [kind, THRESHOLD_GRID[Math.floor(rng() * THRESHOLD_GRID.length)]])) as Record<AnswerCardKind, number>
      const { points } = evaluator.points(thresholds)
      items.forEach((item, i) => {
        const direct = resolveDecision(index, withSegmentConfs(item.analysis, confs[i]), thresholdFn(thresholds))
        expect(points[i]).toBe(examplePoints(examples[i], direct, index))
      })
    }
  })

  it("selects thresholds under the true-NODOC cap", () => {
    const index = compileFixture()
    const examples = examplesOf(index)
    const items = examples.map((example) => digestAnalysis(index, example, analyzeQuestion(index, example.q, { env: {} })))
    const model: ConfidenceModel = Object.fromEntries(ANSWER_CARD_KINDS.map((kind) => [kind, { w: new Array(ANSWER_INDEX_FEATURES.length).fill(0.3), b: -1 }])) as ConfidenceModel
    const evaluator = new ThresholdEvaluator(items, examples, items.map((item) => segmentConfs(item, model)))
    const free = selectThresholds(evaluator, { ...DEFAULT_THRESHOLDS }, 1)
    expect(free.lambda).toBe(0)
    expect(free.met).toBe(true)
    const capped = selectThresholds(evaluator, { ...DEFAULT_THRESHOLDS }, 0)
    if (capped.met) expect(capped.result.trueNodocAnswered).toBe(0)
    expect(capped.result.score).toBeLessThanOrEqual(free.result.score + 1e-9)
    expect(selectThresholds(evaluator, { ...DEFAULT_THRESHOLDS }, 0)).toEqual(capped)
  })

  it("uses a pooled one-hot model for kinds with fewer than 20 rows and standardizes features", () => {
    const rng = createRng(11)
    const rows: ConfidenceRow[] = []
    const make = (kind: AnswerCardKind, count: number) => {
      for (let i = 0; i < count; i += 1) {
        const x = ANSWER_INDEX_FEATURES.map(() => rng())
        rows.push({ kind, x, y: x[0] + 0.3 * rng() > 0.6 ? 1 : 0 })
      }
    }
    make("doc", 60)
    make("fixed", 8)
    const fitted = fitConfidenceModels(rows)
    expect(fitted.own).toEqual(["doc"])
    expect(fitted.pooled).toEqual(["howto", "fixed", "policy", "gap", "handoff"])
    expect(fitted.confidence.fixed.w).toEqual(fitted.confidence.howto.w)
    expect(fitted.confidence.doc.w[0]).toBeGreaterThan(0)
    expect(fitConfidenceModels(rows)).toEqual(fitted)
    // 표준화: 특징 하나를 10배 해도 예측은 같다.
    const scaled = rows.map((row) => ({ ...row, x: row.x.map((value, j) => (j === 0 ? value * 10 : value)) }))
    const refit = fitConfidenceModels(scaled)
    rows.forEach((row, i) => {
      expect(confidenceFromVector(scaled[i].x, refit.confidence[row.kind])).toBeCloseTo(confidenceFromVector(row.x, fitted.confidence[row.kind]), 4)
    })
    // 행이 없으면 기본 계수.
    const empty = fitConfidenceModels([])
    expect(empty.own).toEqual([])
    expect(empty.pooled).toEqual([])
    expect(empty.confidence.doc).toEqual(resolveCalibration(null).confidence.doc)
  })

  it("fits a deterministic L2 logistic regression", () => {
    const x = [[0], [0.2], [0.4], [0.6], [0.8], [1]]
    const y = [0, 0, 0, 1, 1, 1]
    const first = fitLogistic(x, y)
    expect(fitLogistic(x, y)).toEqual(first)
    expect(first.w[0]).toBeGreaterThan(0)
  })

  it("keeps the true-NODOC flag for calibration-set items whose other label is a card", () => {
    const index = compileFixture()
    const example: CalibrationExample | undefined = splitExamples(
      [{ id: "x", q: "회사 건물 몇 층이에요", p: "P", m: "test", label: "none", label2: CARDS.count, final: "none" }],
      index
    ).fit[0]
    expect(example?.nodoc).toBe(true)
    expect(example?.trueNodoc).toBe(false)
  })
})

describe("variant cross validation", () => {
  it("holds out every variant once and prints a confusion table deterministically", () => {
    const data = loadAnswerIndexData(fixtureLoadOptions())
    const total = Array.from(data.variants.values()).reduce((sum, list) => sum + list.length, 0)
    const first = runVariantCv(data)
    const second = runVariantCv(data)
    expect(first.summary.heldOut).toBe(total)
    expect(new Set(first.rows.map((row) => row.fold)).size).toBeGreaterThan(1)
    expect(second).toEqual(first)
    const { summary } = first
    expect(summary.top1Accuracy).toBeGreaterThan(0)
    expect(summary.decidedAccuracy + summary.notFoundRate + summary.wrongRate).toBeCloseTo(100, 0)
    for (const confusion of summary.confusions) expect(confusion.pair).toContain(" → ")
    expect(Object.keys(summary.byKind)).toContain("doc")
    expect(runVariantCv(data, { votes: false }).summary.heldOut).toBe(total)
  })

  it("puts variants with the same normalized text in the same fold", () => {
    expect(cvFoldKey("채팅  막는 법!!")).toBe(cvFoldKey("채팅 막는 법"))
    for (const folds of [2, 3, 5]) expect(cvFoldOf("채팅  막는 법!!", folds)).toBe(cvFoldOf("채팅 막는 법", folds))
    const data = loadAnswerIndexData(fixtureLoadOptions())
    const { rows } = runVariantCv(data)
    const foldsByKey = new Map<string, Set<number>>()
    for (const row of rows) foldsByKey.set(cvFoldKey(row.q), (foldsByKey.get(cvFoldKey(row.q)) ?? new Set()).add(row.fold))
    for (const set of foldsByKey.values()) expect(set.size).toBe(1)
  })
})
