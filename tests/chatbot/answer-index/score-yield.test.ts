import { afterEach, describe, expect, it, vi } from "vitest"

import { prepareQuery, type IndexQuery } from "@/lib/chatbot/answer-index/compile"
import {
  applyRankYield,
  GAP_YIELD_DELTA,
  HUB_YIELD_RATIO,
  notCoversTarget,
  rankYieldEnabled,
  rankYieldReason,
  scoreCandidates,
  type ScoredCandidate,
} from "@/lib/chatbot/answer-index/score"
import { CARDS, compileFixture } from "./index-fixture"

// R3 c1 순위 뒤처리(허브·공백 양보, 스위치 CHATBOT_INDEX_HUB_YIELD): 1위 허브·공백 카드가 바로 다음의 더 구체적인 후보에게 양보해 맨 뒤 후보가 된다.

afterEach(() => vi.unstubAllEnvs())

/** 시험마다 새 색인(카드 role·notCovers 를 고쳐 본다). */
function freshIndex() {
  const index = compileFixture()
  const at = (id: string) => {
    const card = index.cardById.get(id)
    if (card === undefined) throw new Error(`fixture card missing: ${id}`)
    return card
  }
  const candidate = (id: string, s: number): ScoredCandidate => {
    const card = at(id)
    return {
      card,
      id,
      kind: index.cards[card].kind,
      s,
      components: { maxcos: 0, centroid: 0, knnShare: 0, vote: 0, bm25f: 0, linear: 0 },
    }
  }
  return { index, at, candidate }
}

const emptyQuery = (extra: Partial<IndexQuery> = {}) => ({ conceptIds: [], absent: [], terms: [], ...extra }) as unknown as IndexQuery

describe("스위치와 notCovers 행선", () => {
  it("CHATBOT_INDEX_HUB_YIELD: 없거나 on 이면 켬, off·0·false 면 끔", () => {
    expect(rankYieldEnabled({})).toBe(true)
    expect(rankYieldEnabled({ CHATBOT_INDEX_HUB_YIELD: "on" })).toBe(true)
    for (const raw of ["off", "OFF", "0", "false", " off "]) expect(rankYieldEnabled({ CHATBOT_INDEX_HUB_YIELD: raw })).toBe(false)
  })

  it("notCovers 줄의 화살표 뒤 카드 id 만 행선으로 본다", () => {
    expect(notCoversTarget("손가락·전용 펜 인식 → doc:/docs/hardware/board-writing-touch#1/multi-user-writing")).toBe(
      "doc:/docs/hardware/board-writing-touch#1/multi-user-writing"
    )
    expect(notCoversTarget("상담 전화 번호·운영 시간 → none")).toBeNull()
    expect(notCoversTarget("화살표 없음")).toBeNull()
    expect(notCoversTarget(3)).toBeNull()
  })
})

describe("허브 양보", () => {
  it("다음 후보가 점수 몫과 덮임 차를 채우면 허브가 맨 뒤 후보가 되고 다른 순서·점수는 그대로다", () => {
    const { index, at, candidate } = freshIndex()
    index.cards[at(CARDS.chat)].card.role = "hub"
    const list = [candidate(CARDS.chat, 0.5), candidate(CARDS.kick, 0.3), candidate(CARDS.remove, 0.2)]
    const coverage = new Map([
      [at(CARDS.chat), 0.3],
      [at(CARDS.kick), 0.6],
      [at(CARDS.remove), 0.1],
    ])
    const yielded = applyRankYield(index, emptyQuery(), list, (card) => coverage.get(card) ?? 0)
    expect(yielded).toEqual([{ card: CARDS.chat, to: CARDS.kick, reason: "hub" }])
    expect(list.map((item) => item.id)).toEqual([CARDS.kick, CARDS.remove, CARDS.chat])
    expect(list[0].s).toBe(0.3)
    expect(list[1].s).toBe(0.2)
    expect(list[2].s).toBeLessThan(0.2)
  })

  it("점수 몫이 모자라거나 덮임 차가 작거나 다음 후보가 공백·허브면 양보하지 않는다", () => {
    const { index, at, candidate } = freshIndex()
    index.cards[at(CARDS.chat)].card.role = "hub"
    const hub = candidate(CARDS.chat, 0.5)
    const cover = (hubCov: number, nextCov: number) => (card: number) => (card === at(CARDS.chat) ? hubCov : nextCov)
    const low = candidate(CARDS.kick, 0.5 * HUB_YIELD_RATIO - 0.01)
    expect(rankYieldReason(index, emptyQuery(), hub, low, cover(0, 1))).toBeNull()
    const close = candidate(CARDS.kick, 0.4)
    expect(rankYieldReason(index, emptyQuery(), hub, close, cover(0.4, 0.5))).toBeNull()
    expect(rankYieldReason(index, emptyQuery(), hub, close, cover(0.4, 0.6))).toBe("hub")
    expect(rankYieldReason(index, emptyQuery(), hub, candidate(CARDS.gapHours, 0.45), cover(0, 1))).toBeNull()
    index.cards[at(CARDS.kick)].card.role = "hub"
    expect(rankYieldReason(index, emptyQuery(), hub, close, cover(0, 1))).toBeNull()
  })

  it("role 이 없는 카드는 양보하지 않는다", () => {
    const { index, candidate } = freshIndex()
    const list = [candidate(CARDS.chat, 0.5), candidate(CARDS.kick, 0.45)]
    expect(applyRankYield(index, emptyQuery(), list, () => 1)).toEqual([])
    expect(list.map((item) => item.id)).toEqual([CARDS.chat, CARDS.kick])
  })
})

describe("공백 양보", () => {
  it("notCovers 로 이어진 다음 후보가 점수 차 δ 안이면 공백 카드가 맨 뒤로 간다(덮임이 조금 낮아도 된다)", () => {
    const { index, at, candidate } = freshIndex()
    index.cards[at(CARDS.gapHours)].card.notCovers = [`채팅 금지 설정 → ${CARDS.chat}`]
    const list = [candidate(CARDS.gapHours, 0.4), candidate(CARDS.chat, 0.4 - GAP_YIELD_DELTA + 0.01), candidate(CARDS.kick, 0.1)]
    const coverage = (card: number) => (card === at(CARDS.gapHours) ? 0.5 : 0.4)
    expect(applyRankYield(index, emptyQuery(), list, coverage)).toEqual([{ card: CARDS.gapHours, to: CARDS.chat, reason: "gap" }])
    expect(list.map((item) => item.id)).toEqual([CARDS.chat, CARDS.kick, CARDS.gapHours])
  })

  it("점수 차가 δ 보다 크거나, 이어짐·같은 개념이 없거나, 질문이 그 공백의 없는 개념을 말했으면 양보하지 않는다", () => {
    const { index, at, candidate } = freshIndex()
    const gap = candidate(CARDS.gapHours, 0.4)
    const near = candidate(CARDS.chat, 0.35)
    const same = () => 0.5
    expect(rankYieldReason(index, emptyQuery(), gap, near, same)).toBeNull()
    index.cards[at(CARDS.gapHours)].card.notCovers = [`채팅 금지 설정 → ${CARDS.chat}`]
    expect(rankYieldReason(index, emptyQuery(), gap, near, same)).toBe("gap")
    expect(rankYieldReason(index, emptyQuery(), gap, candidate(CARDS.chat, 0.4 - GAP_YIELD_DELTA - 0.01), same)).toBeNull()
    index.absent.byId.set("A_hours", { id: "A_hours", label: "운영 시간", forms: ["운영 시간"], area: "support", gapCard: CARDS.gapHours, verified: {} } as never)
    const asked = emptyQuery({ absent: [{ id: "A_hours", form: "운영 시간", start: 0, end: 4 }] })
    expect(rankYieldReason(index, asked, gap, near, same)).toBeNull()
  })

  it("이어지지 않았으면 질문의 비일반 개념을 둘 다 설명하고 덮임이 공백 이상일 때만 양보한다", () => {
    const { index, at, candidate } = freshIndex()
    const gap = candidate(CARDS.gapHours, 0.4)
    const near = candidate(CARDS.chat, 0.35)
    index.cards[at(CARDS.gapHours)].conceptClosure.add("C_chat_ban")
    index.cards[at(CARDS.gapHours)].ownConcepts.push("C_chat_ban")
    const query = emptyQuery({ conceptIds: ["C_chat_ban"] })
    expect(rankYieldReason(index, query, gap, near, () => 0.5)).toBe("gap")
    expect(rankYieldReason(index, query, gap, near, (card) => (card === at(CARDS.gapHours) ? 0.6 : 0.5))).toBeNull()
    const concept = index.lexicon.concepts.get("C_chat_ban")!
    index.lexicon.concepts.set("C_chat_ban", { ...concept, generic: true })
    expect(rankYieldReason(index, query, gap, near, () => 0.5)).toBeNull()
  })
})

describe("scoreCandidates 와 스위치", () => {
  const questions = ["학생 채팅 금지 되나요", "녹화 영상 다시보기", "전화 상담 몇 시까지 해요", "회사 주식 상장했나요", "보안 인증 있어요"]

  it("끄면(rankYield:false · CHATBOT_INDEX_HUB_YIELD=off) 양보 없이 같은 순위·점수다", () => {
    const index = compileFixture()
    for (const question of questions) {
      const off = scoreCandidates(index, prepareQuery(index, question), [], { rankYield: false })
      expect(off.yielded).toEqual([])
      vi.stubEnv("CHATBOT_INDEX_HUB_YIELD", "off")
      const envOff = scoreCandidates(index, prepareQuery(index, question))
      vi.unstubAllEnvs()
      expect(envOff.candidates.map((item) => [item.id, item.s])).toEqual(off.candidates.map((item) => [item.id, item.s]))
    }
  })

  it("켜도 양보할 1위가 없으면 끈 것과 같다", () => {
    const index = compileFixture()
    for (const question of questions) {
      const off = scoreCandidates(index, prepareQuery(index, question), [], { rankYield: false })
      const on = scoreCandidates(index, prepareQuery(index, question), [], { rankYield: true })
      if (on.yielded.length > 0) continue
      expect(on.candidates.map((item) => [item.id, item.s])).toEqual(off.candidates.map((item) => [item.id, item.s]))
    }
  })

  it("허브 1위라도 다음 후보가 구체 답 조건(점수 몫·덮임 차)을 못 채우면 순위·점수가 그대로다", () => {
    const index = compileFixture()
    // fixture 의 '학생 채팅 금지' 질문: 1위 채팅 금지 카드(덮임 1.0)와 다음 후보(점수 몫 0.15 남짓·덮임 0)의 차가 크다.
    const question = "학생 채팅 금지 되나요"
    const off = scoreCandidates(index, prepareQuery(index, question), [], { rankYield: false })
    expect(off.candidates[0].id).toBe(CARDS.chat)
    index.cards[off.candidates[0].card].card.role = "hub"
    const on = scoreCandidates(index, prepareQuery(index, question), [], { rankYield: true })
    expect(on.yielded).toEqual([])
    expect(on.candidates.map((item) => [item.id, item.s])).toEqual(off.candidates.map((item) => [item.id, item.s]))
  })

  it("공백 1위라도 같은 개념 다음 후보가 없으면 그대로다(fixture '전화 상담 몇 시까지')", () => {
    const index = compileFixture()
    const question = "전화 상담 몇 시까지 해요"
    const off = scoreCandidates(index, prepareQuery(index, question), [], { rankYield: false })
    expect(off.candidates[0].id).toBe(CARDS.gapHours)
    const on = scoreCandidates(index, prepareQuery(index, question), [], { rankYield: true })
    expect(on.yielded).toEqual([])
    expect(on.candidates[0].id).toBe(CARDS.gapHours)
  })
})
