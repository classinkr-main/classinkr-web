import { describe, expect, it } from "vitest"

import {
  answeringCardOf,
  buildGoldIndex,
  computeAttractors,
  countGoldGroups,
  countGoldSets,
  goldCardsForKey,
  traceTop1,
  watchedCards,
  watchTotals,
  type AttractorRowInput,
} from "@/scripts/answer-index/lib/attractor-core"
import { classifyRow, type CardRecord } from "@/scripts/answer-index/proxy-eval"

const row = (overrides: Partial<AttractorRowInput> & Pick<AttractorRowInput, "id" | "decidedBy">): AttractorRowInput => ({ set: "dev", verdict: null, gold: null, ...overrides })
const trace = (top: string[], extra: Record<string, unknown> = {}) => ({ router: "compiled", top: top.map((id) => ({ id, s: 0.1, conf: 0.1 })), ...extra })

describe("줄의 답한 카드", () => {
  it("index·index-partial·index-gap 은 그 카드, 못 찾음·되묻기는 없음, 앞단은 front:, legacy 는 legacy:", () => {
    expect(answeringCardOf({ decidedBy: "index:doc:a" })).toBe("doc:a")
    expect(answeringCardOf({ decidedBy: "index-partial:policy:b" })).toBe("policy:b")
    expect(answeringCardOf({ decidedBy: "index-gap:gap:course/x" })).toBe("gap:course/x")
    expect(answeringCardOf({ decidedBy: "index-abstain" })).toBeNull()
    expect(answeringCardOf({ decidedBy: "index-clarify" })).toBeNull()
    expect(answeringCardOf({ decidedBy: "policy", answerIndex: { pre: "handoff" } })).toBe("front:handoff")
    expect(answeringCardOf({ decidedBy: "evidence_select", answerIndex: { scope: "out" } })).toBe("legacy:evidence_select")
    expect(traceTop1(trace(["none", "doc:a"]))).toBe("doc:a")
    expect(traceTop1(null)).toBeNull()
  })
})

describe("정답 묶음 수", () => {
  it("서로 다른 정답 후보 묶음을 세고(같은 집합은 하나), 겹치는 묶음을 합친 수도 낸다", () => {
    expect(countGoldSets([["a"], ["b"], ["a"], ["b", "c"], ["c", "b"], []])).toBe(3)
    expect(countGoldGroups([["a"], ["b"], ["c"]])).toBe(3)
    expect(countGoldGroups([["a", "b"], ["b"], ["c"]])).toBe(2)
    expect(countGoldGroups([["a"], ["b"], ["a", "b"]])).toBe(1)
    expect(countGoldGroups([[], ["a"]])).toBe(1)
  })
})

describe("카드별 쏠림 지표", () => {
  const rows: AttractorRowInput[] = [
    row({ id: "1", decidedBy: "index:doc:hub", verdict: "wrong", gold: ["doc:x"], answerIndex: trace(["doc:hub"]) }),
    row({ id: "2", decidedBy: "index:doc:hub", verdict: "wrong", gold: ["doc:y"], answerIndex: trace(["doc:hub"]) }),
    row({ id: "3", decidedBy: "index:doc:hub", verdict: "partial", gold: ["doc:y", "doc:z2"], answerIndex: trace(["doc:hub"]) }),
    row({ id: "4", decidedBy: "index:doc:hub", verdict: "good", answerIndex: trace(["doc:hub"]) }),
    row({ id: "5", decidedBy: "index-gap:gap:course/roster", verdict: "nf_doc_has", answerIndex: trace(["gap:course/roster"]) }),
    row({ id: "6", decidedBy: "index-abstain", verdict: "nf_doc_has", answerIndex: trace(["doc:blocked"]) }),
    row({ id: "7", decidedBy: "policy", verdict: "wrong", answerIndex: { pre: "handoff" } }),
    row({ id: "8", set: "real", decidedBy: "index:doc:hub", answerIndex: trace(["doc:hub"]) }),
  ]

  it("이긴 수·판정·1위 막힘·gap 막음·앞단 오답·정답 묶음 수·점수·후보를 센다", () => {
    const { cards, summary } = computeAttractors(rows, { kindOf: (card) => card.split(":")[0] })
    const hub = cards.find((entry) => entry.card === "doc:hub")!
    expect(hub).toMatchObject({ wins: 5, good: 1, wrong: 2, partial: 1, top1: 5, goldGroups: 3, goldClusters: 2, candidate: true, score: 2.5, bySet: { dev: 4, real: 1 } })
    const gap = cards.find((entry) => entry.card === "gap:course/roster")!
    expect(gap).toMatchObject({ kind: "gap", wins: 1, nfDocHas: 1, score: 0.5 })
    const blocked = cards.find((entry) => entry.card === "doc:blocked")!
    expect(blocked).toMatchObject({ wins: 0, top1: 1, top1Blocked: 1, top1BlockedBad: 1, score: 0.5 })
    const front = cards.find((entry) => entry.card === "front:handoff")!
    expect(front).toMatchObject({ kind: "front", wins: 1, wrong: 1, frontWrong: 1 })
    expect(cards[0].card).toBe("doc:hub")
    expect(summary).toMatchObject({ rows: 8, answered: 7, answeringCards: 2, gapBlocks: 1, frontWrong: 1, goldGroups3: 1, wrongPartial: 4 })
    expect(summary.sets).toEqual({ dev: { rows: 7, verdictRows: 7, goldRows: 3 }, real: { rows: 1, verdictRows: 0, goldRows: 0 } })
  })

  it("같은 입력이면 같은 결과(결정적)이고, 지켜볼 카드는 없으면 0 으로 채운다", () => {
    const a = computeAttractors(rows)
    const b = computeAttractors([...rows].reverse())
    expect(b.cards).toEqual(a.cards)
    const watched = watchedCards(a.cards, ["doc:hub", "policy:none-here"])
    expect(watched[1]).toMatchObject({ card: "policy:none-here", wins: 0, kind: "policy" })
    expect(watchTotals(watched)).toMatchObject({ cards: 2, wins: 5, wrongPartial: 3, candidates: 1 })
  })

  it("새 묶음 카드 가운데 쏠림 후보를 따로 센다", () => {
    const { summary } = computeAttractors(rows, { newCard: (card) => card === "doc:hub" })
    expect(summary.newCandidates).toBe(1)
  })
})

describe("정답 후보 카드(키 → 카드 묶음)", () => {
  const cards = new Map<string, CardRecord>([
    ["doc:a", { id: "doc:a", kind: "doc", answer: { sentences: [{ unit: "doc:/docs/x/y#1", ids: [0, 1] }] } }],
    ["doc:b", { id: "doc:b", kind: "doc", answer: { sentences: [{ unit: "doc:/docs/x/y#1", ids: [4] }] } }],
    ["fixed:c", { id: "fixed:c", kind: "fixed", answer: { curatedRef: { module: "basics", id: "c" } } }],
  ])
  const index = buildGoldIndex(cards)

  it("proxy-eval 판정이 good 을 줄 카드만 고른다(문장 범위·reject 포함)", () => {
    const key = { id: "k", accept: ["unit:doc:/docs/x/y#1", "basics:c"], unitSentences: { "unit:doc:/docs/x/y#1": [0] } }
    const gold = goldCardsForKey(index, key)
    expect(gold).toEqual(["doc:a", "fixed:c"])
    for (const card of cards.values()) {
      const verdict = classifyRow({ id: "k", router: "compiled", answer: "x", decidedBy: `index:${card.id}` }, key, { cards }).verdict
      expect(verdict === "good", card.id).toBe(gold.includes(card.id))
    }
    expect(goldCardsForKey(index, { ...key, reject: ["basics:c"] })).toEqual(["doc:a"])
    expect(goldCardsForKey(index, { id: "nodoc", nodoc: true })).toEqual([])
  })
})
