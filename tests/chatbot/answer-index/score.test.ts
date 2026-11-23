import { describe, expect, it } from "vitest"

import {
  bootstrapInterval,
  countVerdicts,
  createRng,
  readScoredRows,
  scoreFromCounts,
  scoreVerdicts,
  summarizeRows,
  type Verdict,
} from "@/scripts/answer-index/score"

// 답 색인 사양 §2.1: 점수 = (good + nf_ok + 0.5 × partial) ÷ 전체 × 100, §2.4: 부트스트랩 90% 구간(고정 시드, 1만 번).

const repeat = (verdict: Verdict, n: number) => Array.from({ length: n }, () => verdict)

describe("점수 식", () => {
  it("good·nf_ok 는 1, partial 은 0.5, 나머지는 0", () => {
    const verdicts: Verdict[] = ["good", "nf_ok", "partial", "wrong", "nf_doc_has", "needless_clarify"]
    expect(scoreVerdicts(verdicts)).toBeCloseTo((1 + 1 + 0.5) / 6 * 100, 10)
  })

  it("기준선 holdout1 계산과 같다: (24 + 0.5 × 15) / 90", () => {
    const verdicts = [...repeat("good", 20), ...repeat("nf_ok", 4), ...repeat("partial", 15), ...repeat("wrong", 44), ...repeat("nf_doc_has", 7)]
    expect(verdicts).toHaveLength(90)
    expect(scoreVerdicts(verdicts)).toBeCloseTo(35, 10)
  })

  it("분류별 수와 빈 입력", () => {
    expect(countVerdicts(["good", "good", "wrong"])).toMatchObject({ good: 2, wrong: 1, partial: 0 })
    expect(scoreFromCounts(countVerdicts([]))).toBe(0)
  })
})

describe("부트스트랩 구간", () => {
  const verdicts = [...repeat("good", 60), ...repeat("partial", 10), ...repeat("wrong", 20), ...repeat("nf_ok", 10)]

  it("같은 입력·시드면 같은 구간", () => {
    expect(bootstrapInterval(verdicts)).toEqual(bootstrapInterval(verdicts))
    expect(bootstrapInterval(verdicts, { seed: 7 })).toEqual(bootstrapInterval(verdicts, { seed: 7 }))
  })

  it("구간이 점수를 감싸고, 시드가 다르면 값이 조금 다르다", () => {
    const score = scoreVerdicts(verdicts)
    const interval = bootstrapInterval(verdicts)
    expect(interval.low).toBeLessThan(score)
    expect(interval.high).toBeGreaterThan(score)
    expect(interval.high - interval.low).toBeGreaterThan(5)
    expect(interval.high - interval.low).toBeLessThan(20)
    expect(bootstrapInterval(verdicts, { seed: 1 })).not.toEqual(interval)
  })

  it("모두 good 이면 [100, 100], 줄이 없으면 [0, 0]", () => {
    expect(bootstrapInterval(repeat("good", 30))).toEqual({ low: 100, high: 100 })
    expect(bootstrapInterval([])).toEqual({ low: 0, high: 0 })
  })

  it("난수는 고정 시드로 재현된다", () => {
    const a = createRng(42)
    const b = createRng(42)
    const first = Array.from({ length: 5 }, () => a())
    expect(Array.from({ length: 5 }, () => b())).toEqual(first)
    expect(first.every((value) => value >= 0 && value < 1)).toBe(true)
  })
})

describe("judged 파일 읽기와 요약", () => {
  it("rows·results·배열을 읽고 알 수 없는 분류는 거절", () => {
    expect(readScoredRows({ rows: [{ id: "a", verdict: "good" }] })).toEqual([{ id: "a", verdict: "good" }])
    expect(readScoredRows({ results: [{ id: "a", verdict: "nf_ok", siteVerdict: "nf_doc_has" }] })).toEqual([
      { id: "a", verdict: "nf_ok", siteVerdict: "nf_doc_has" },
    ])
    expect(() => readScoredRows([{ id: "a", verdict: "ok" }])).toThrow(/verdict/)
    expect(() => readScoredRows([{ verdict: "good" }])).toThrow(/id/)
  })

  it("siteVerdict 가 있으면 공개 페이지 포함 점수를 함께 낸다", () => {
    const summary = summarizeRows([
      { id: "a", verdict: "nf_ok", siteVerdict: "nf_doc_has" },
      { id: "b", verdict: "good" },
    ])
    expect(summary.score).toBe(100)
    expect(summary.withSitePages).toMatchObject({ score: 50, changedRows: 1 })
    expect(summarizeRows([{ id: "a", verdict: "good" }]).withSitePages).toBeUndefined()
  })
})
