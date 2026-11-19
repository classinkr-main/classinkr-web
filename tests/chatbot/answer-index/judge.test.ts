import { describe, expect, it } from "vitest"

import {
  B_GOOD_SHARE,
  buildDisagreements,
  combineBatches,
  judgePaths,
  mergeBatch,
  sampleHash,
  selectForB,
  splitIntoBatches,
  toJudgeRow,
  validateJudgeFile,
  type JudgeBatch,
  type JudgeFile,
  type JudgeInputRow,
  type JudgeResult,
} from "@/scripts/answer-index/judge/lib"
import type { Verdict } from "@/scripts/answer-index/score"

// 답 색인 사양 §2.4 심사 절차 도구: 나누기, B 표본(결정적), A·B 이견, 합치기.

const row = (id: string): JudgeInputRow => ({ id, question: `질문 ${id}`, answer: `답 ${id}`, sources: [] })

function result(id: string, verdict: Verdict, extra: Partial<JudgeResult> = {}): JudgeResult {
  const base: JudgeResult = { id, verdict, evidence: [], searched: [], note: "" }
  if (verdict === "nf_ok") Object.assign(base, { searched: ["가", "나", "다"], evidence: [{ path: "/docs/x" }] })
  if (verdict === "wrong" || verdict === "nf_doc_has") Object.assign(base, { evidence: [{ path: "/docs/x", quote: "문장" }] })
  return { ...base, ...extra }
}

const file = (judge: "A" | "B" | "C", results: JudgeResult[]): JudgeFile => ({ judge, results })

describe("경로 규칙", () => {
  it("X.json → X.A·X.Bin·X.B·X.Cin·X.C·X.final", () => {
    expect(judgePaths("/w/dev5-r1-b01.json")).toEqual({
      input: "/w/dev5-r1-b01.json",
      a: "/w/dev5-r1-b01.A.json",
      bIn: "/w/dev5-r1-b01.Bin.json",
      b: "/w/dev5-r1-b01.B.json",
      cIn: "/w/dev5-r1-b01.Cin.json",
      c: "/w/dev5-r1-b01.C.json",
      final: "/w/dev5-r1-b01.final.json",
    })
    expect(() => judgePaths("/w/dev5-r1-b01.A.json")).toThrow(/배치 입력/)
  })
})

describe("split", () => {
  it("50줄씩 입력 순서대로 나누고 심사에 필요한 필드만 남긴다", () => {
    const rows = Array.from({ length: 120 }, (_, index) =>
      toJudgeRow({
        id: `q${index}`,
        question: "q",
        answer: index === 3 ? null : "a",
        decidedBy: "basics:x",
        router: "legacy",
        sources: [{ title: "t", path: "/docs/a", heading: "h", score: 300 }],
      })
    )
    const batches = splitIntoBatches(rows, { set: "dev5", run: "r1" })
    expect(batches.map((batch) => batch.rows.length)).toEqual([50, 50, 20])
    expect(batches[2]).toMatchObject({ set: "dev5", run: "r1", batch: 3, stage: "A" })
    expect(batches[0].rows[0]).toEqual({ id: "q0", question: "q", answer: "a", sources: [{ path: "/docs/a", heading: "h", title: "t" }] })
    expect(batches[0].rows[3].answer).toBe("(답 없음: 측정 오류)")
    expect(() => splitIntoBatches([row("a"), row("a")], { set: "s", run: "r" })).toThrow(/겹칩니다/)
  })
})

describe("결과 파일 확인", () => {
  const ids = ["a", "b", "c"]

  it("형식이 맞으면 통과", () => {
    const { errors, file: parsed } = validateJudgeFile(
      { judge: "A", results: [result("a", "good"), result("b", "nf_ok"), result("c", "wrong")] },
      { judge: "A", expectedIds: ids }
    )
    expect(errors).toEqual([])
    expect(parsed?.results).toHaveLength(3)
  })

  it("빠진 줄·남는 줄·겹친 줄·모르는 분류·근거 없는 nf_ok·인용 없는 wrong 을 막는다", () => {
    const { errors } = validateJudgeFile(
      {
        judge: "B",
        results: [
          { id: "a", verdict: "nf_ok", evidence: [{ path: "/docs/x" }], searched: ["가"] },
          { id: "a", verdict: "good" },
          { id: "b", verdict: "wrong", evidence: [{ path: "/docs/x" }] },
          { id: "z", verdict: "fine" },
        ],
      },
      { judge: "A", expectedIds: ids }
    )
    const text = errors.join("\n")
    expect(text).toMatch(/judge 가 "A"/)
    expect(text).toMatch(/a: nf_ok 는 찾아본 낱말/)
    expect(text).toMatch(/a: 두 번/)
    expect(text).toMatch(/b: wrong 는 근거 문장/)
    expect(text).toMatch(/z: 입력에 없는 id/)
    expect(text).toMatch(/z: verdict/)
    expect(text).toMatch(/c: 결과가 없습니다/)
  })

  it("siteVerdict 는 verdict 와 다를 때만 남긴다", () => {
    const { file: parsed } = validateJudgeFile(
      { judge: "A", results: [result("a", "good", { siteVerdict: "good" }), result("b", "nf_ok", { siteVerdict: "nf_doc_has" })] },
      { judge: "A", expectedIds: ["a", "b"] }
    )
    expect(parsed?.results[0].siteVerdict).toBeUndefined()
    expect(parsed?.results[1].siteVerdict).toBe("nf_doc_has")
  })
})

describe("select-b", () => {
  const rows = Array.from({ length: 50 }, (_, index) => row(`dev5-q${String(index).padStart(2, "0")}`))
  const verdicts: Verdict[] = rows.map((_, index) => (index < 40 ? "good" : index < 44 ? "nf_ok" : index < 48 ? "wrong" : "partial"))
  const aFile = file(
    "A",
    rows.map((r, index) => result(r.id, verdicts[index]))
  )

  it("good 이 아닌 줄 전부 + good 의 ceil(15%)", () => {
    const selected = selectForB(rows, aFile)
    const good = selected.filter((id) => verdicts[rows.findIndex((r) => r.id === id)] === "good")
    expect(good).toHaveLength(Math.ceil(40 * B_GOOD_SHARE))
    expect(selected.length - good.length).toBe(10)
    for (const [index, r] of rows.entries()) if (verdicts[index] !== "good") expect(selected).toContain(r.id)
  })

  it("결정적이다: 줄 순서·결과 순서를 바꿔도 같은 good 표본", () => {
    const first = new Set(selectForB(rows, aFile))
    const shuffledRows = [...rows].reverse()
    const shuffledA = file("A", [...aFile.results].reverse())
    expect(new Set(selectForB(shuffledRows, shuffledA))).toEqual(first)
  })

  it("표본은 id 해시가 작은 good 줄이다", () => {
    const goodIds = rows.filter((_, index) => verdicts[index] === "good").map((r) => r.id)
    const expected = [...goodIds].sort((x, y) => (sampleHash(x) < sampleHash(y) ? -1 : 1)).slice(0, 6)
    const selected = selectForB(rows, aFile)
    expect(selected.filter((id) => goodIds.includes(id)).sort()).toEqual(expected.sort())
  })
})

describe("이견과 합치기", () => {
  const batch: JudgeBatch = { set: "dev5", run: "r1", batch: 1, stage: "A", rows: ["a", "b", "c", "d", "e"].map(row) }
  const a = file("A", [
    result("a", "good"),
    result("b", "good"),
    result("c", "nf_ok"),
    result("d", "wrong"),
    result("e", "nf_ok", { siteVerdict: "nf_doc_has" }),
  ])
  const bIds = ["b", "c", "d", "e"]
  const b = file("B", [result("b", "good"), result("c", "nf_doc_has"), result("d", "wrong"), result("e", "nf_ok")])

  it("A·B 의 분류나 siteVerdict 가 다른 줄만 C 로 간다", () => {
    const rows = buildDisagreements(batch.rows.filter((r) => bIds.includes(r.id)), a, b)
    expect(rows.map((r) => r.id)).toEqual(["c", "e"])
    expect(rows[0].judgments.map((j) => [j.judge, j.verdict])).toEqual([
      ["A", "nf_ok"],
      ["B", "nf_doc_has"],
    ])
  })

  it("B 가 안 본 줄은 A, 같으면 A·B, 다르면 C", () => {
    const c = file("C", [result("c", "nf_doc_has"), result("e", "nf_ok", { siteVerdict: "nf_doc_has" })])
    const final = mergeBatch({ batch, a, bIds, b, c })
    const byId = Object.fromEntries(final.rows.map((r) => [r.id, r]))
    expect(byId.a).toMatchObject({ verdict: "good", decidedBy: "A", disagreement: false, judges: { A: "good" } })
    expect(byId.b).toMatchObject({ verdict: "good", decidedBy: "AB", disagreement: false })
    expect(byId.c).toMatchObject({ verdict: "nf_doc_has", decidedBy: "C", disagreement: true, judges: { A: "nf_ok", B: "nf_doc_has", C: "nf_doc_has" } })
    expect(byId.d).toMatchObject({ verdict: "wrong", decidedBy: "AB" })
    expect(byId.e).toMatchObject({ verdict: "nf_ok", siteVerdict: "nf_doc_has", decidedBy: "C", disagreement: false })
  })

  it("C 결과가 빠지면 어느 줄인지 알리고 멈춘다", () => {
    expect(() => mergeBatch({ batch, a, bIds, b, c: file("C", [result("e", "nf_ok")]) })).toThrow(/c: A·B 가 달라/)
    expect(() => mergeBatch({ batch, a, bIds, b: file("B", [result("b", "good")]), c: null })).toThrow(/c: B 결과 없음/)
  })

  it("여러 배치를 한 묶음으로 합치고, id 가 겹치거나 set 이 섞이면 막는다", () => {
    const c = file("C", [result("c", "nf_doc_has"), result("e", "nf_ok")])
    const first = mergeBatch({ batch, a, bIds, b, c })
    const second = mergeBatch({
      batch: { ...batch, batch: 2, rows: [row("f")] },
      a: file("A", [result("f", "partial")]),
      bIds: ["f"],
      b: file("B", [result("f", "partial")]),
      c: null,
    })
    const judged = combineBatches([second, first])
    expect(judged).toMatchObject({ set: "dev5", run: "r1", batches: [1, 2], n: 6, disagreements: 1 })
    expect(judged.rows.map((r) => r.id)).toEqual(["a", "b", "c", "d", "e", "f"])
    expect(() => combineBatches([first, first])).toThrow(/여러 배치/)
    expect(() => combineBatches([first, { ...second, set: "holdout1" }])).toThrow(/set/)
    expect(combineBatches([first, { ...second, set: "holdout1" }], { set: "mixed" }).set).toBe("mixed")
  })
})
