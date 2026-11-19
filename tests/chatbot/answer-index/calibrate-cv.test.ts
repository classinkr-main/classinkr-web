import { afterEach, describe, expect, it } from "vitest"

import { DEFAULT_THRESHOLDS } from "@/lib/chatbot/answer-index/compile"
import { loadAnswerIndexData } from "@/lib/chatbot/answer-index/load"
import { ANSWER_INDEX_FEATURES, type CalibrationSetItem } from "@/lib/chatbot/answer-index/types"
import {
  examplePoints,
  finalLabel,
  fitLogistic,
  runCalibration,
  splitExamples,
  THRESHOLD_GRID,
  weightGrid,
  weightedScore,
} from "@/scripts/answer-index/lib/calibrate-core"
import { runVariantCv } from "@/scripts/answer-index/lib/cv-core"
import { calibrationBasisVersion } from "@/scripts/answer-index/lib/manifest"

import { CARDS, compileFixture, copyFixture, fixtureLoadOptions, fixtureUnits } from "./index-fixture"
import { writeDataFile } from "./helpers"

/**
 * 보정(calibrate-core.ts)과 변형 교차 검증(cv-core.ts). 완료 기준(사양 §12.1 I9): 같은 입력 → 같은 calibration.json, 혼동 표.
 * 보정 묶음은 시험용으로 여기서 쓴 문항이다(평가셋 문항이 아니다).
 */

const CALIBRATION_ITEMS: [string, string][] = [
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
  return CALIBRATION_ITEMS.map(([q, label], position) => ({ id: `cal-${String(position).padStart(3, "0")}`, q, p: "P-test", m: "test", label, label2: label }))
}

const cleanups: (() => void)[] = []
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!()
})

function fixtureCopy(withSet: boolean) {
  const copy = copyFixture()
  cleanups.push(copy.cleanup)
  if (withSet) writeDataFile(copy.dir, "eval/calibration-set.json", { version: "test", items: calibrationItems() })
  return copy.dir
}

const loadOptions = { currentUnits: fixtureUnits(), symptomTopics: new Set<string>(), guides: new Set<string>() }

describe("calibrate", () => {
  it("writes default thresholds and coefficients when there is no calibration set", () => {
    const dir = fixtureCopy(false)
    const { calibration, report } = runCalibration({ dir, load: loadOptions })
    expect(report.defaults).toBe(true)
    expect(calibration.thresholds).toEqual(DEFAULT_THRESHOLDS)
    expect(calibration.fit).toEqual({ set: "none", n: 0, check: 0, bootstrapP10: 0 })
    expect(calibration.dataVersion).toBe(calibrationBasisVersion(dir))
    expect(calibration.version).toMatch(/^cal-[0-9a-f]{12}$/)
  })

  it("gives the same calibration.json for the same data and set", () => {
    const dir = fixtureCopy(true)
    const first = runCalibration({ dir, load: loadOptions })
    const second = runCalibration({ dir, load: loadOptions })
    expect(JSON.stringify(second.calibration)).toBe(JSON.stringify(first.calibration))
    expect(first.report.defaults).toBe(false)
    expect(first.report.counts.skipped.missing).toBe(1)
    expect(first.report.counts.fit + first.report.counts.check).toBe(CALIBRATION_ITEMS.length - 1)
    expect(first.report.grid).toHaveLength(81)
    const { calibration } = first
    for (const kind of Object.keys(calibration.thresholds) as (keyof typeof calibration.thresholds)[]) {
      expect(THRESHOLD_GRID).toContain(calibration.thresholds[kind])
      expect(calibration.confidence[kind]?.w).toHaveLength(ANSWER_INDEX_FEATURES.length)
    }
    expect(calibration.fit.set).toMatch(/^calibration-set@[0-9a-f]{12}$/)
    expect(calibration.nodocRatesChecked).toEqual([0.2, 0.25, 0.3])
  })

  it("ignores the current calibration.json when fitting (same data → same result)", () => {
    const dir = fixtureCopy(true)
    const first = runCalibration({ dir, load: loadOptions })
    writeDataFile(dir, "calibration.json", first.calibration)
    const again = runCalibration({ dir, load: loadOptions })
    expect(JSON.stringify(again.calibration)).toBe(JSON.stringify(first.calibration))
  })

  it("resolves labels and splits deterministically by id hash", () => {
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
    expect(weightGrid()).toHaveLength(81)
  })

  it("fits a deterministic L2 logistic regression", () => {
    const x = [[0], [0.2], [0.4], [0.6], [0.8], [1]]
    const y = [0, 0, 0, 1, 1, 1]
    const first = fitLogistic(x, y)
    expect(fitLogistic(x, y)).toEqual(first)
    expect(first.w[0]).toBeGreaterThan(0)
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
  })
})
