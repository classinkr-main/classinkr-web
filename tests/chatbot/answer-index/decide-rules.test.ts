import { describe, expect, it } from "vitest"

import { prepareQuery } from "@/lib/chatbot/answer-index/compile"
import {
  analyzeQuestion,
  decide,
  resolveDecision,
  SEGMENT_CONF_MARGIN,
  segmentThreshold,
  toAnswerIndexTrace,
  VOTE_RESCUE_TOP,
  voteRescueMode,
} from "@/lib/chatbot/answer-index/decide"
import { confidenceOf, KNN_K, knnCountFeature, scoreCandidates } from "@/lib/chatbot/answer-index/score"
import { ANSWER_INDEX_FEATURES } from "@/lib/chatbot/answer-index/types"
import { decidedByFromAnswerIndex } from "@/scripts/lib/chatbot-live-eval-checks"
import { CARDS, compileFixture } from "./index-fixture"

// 진단 R1 결정 규칙: R15(조각 답 문턱 여유), R02(확신도 특징 knnCount1), R07(정해 둔 답 승격).

const index = compileFixture()
const RESCUE_OFF = { CHATBOT_COMPILED_VOTE_RESCUE: "off" }
const RESCUE_OVERRIDE = { CHATBOT_COMPILED_VOTE_RESCUE: "override" }

describe("R15 조각 답은 그 종류 θ + 0.1 이상일 때만", () => {
  const question = "녹화 되나요? 그리고 학생 강퇴도 돼요?"

  it("조각 문턱은 원문 문턱 + SEGMENT_CONF_MARGIN 이다", () => {
    expect(SEGMENT_CONF_MARGIN).toBe(0.1)
    expect(segmentThreshold(() => 0.55)("doc")).toBeCloseTo(0.65, 10)
  })

  it("조각 확신도가 θ 와 θ + 0.1 사이면 그 조각은 제 판정으로 답하지 않는다(원문 문턱은 그대로)", () => {
    const analysis = analyzeQuestion(index, question, { env: {} })
    const [replay, kick] = analysis.parts!.map((part) => part.confs[part.topReal])
    expect(analysis.parts!.map((part) => part.ranked[part.topReal].id)).toEqual([CARDS.replay, CARDS.kick])
    // θ 를 강퇴 조각은 θ 는 넘지만 θ + 0.1 은 넘지 못하고, 녹화 조각은 θ + 0.1 도 넘는 자리에 둔다.
    const theta = (replay + kick) / 2 - SEGMENT_CONF_MARGIN
    expect(kick).toBeGreaterThanOrEqual(theta)
    expect(kick).toBeLessThan(theta + SEGMENT_CONF_MARGIN)
    expect(replay).toBeGreaterThanOrEqual(theta + SEGMENT_CONF_MARGIN)
    const decision = resolveDecision(index, analysis, () => theta)
    expect(decision.segments?.[0]).toMatchObject({ kind: "answer", card: CARDS.replay, source: "segment" })
    // 강퇴 조각은 제 판정으로 답하지 않는다. 이 픽스처에서는 원문 판정도 강퇴 카드로 정하지 않아 그 조각은 못 정함(알림 줄 대상)이다(R2 검토 회귀-12: 한 결과로 고정).
    expect(decision.segments?.[1]).toMatchObject({ kind: "abstain", card: null })
    expect(decision.segments?.[1]?.source).toBeUndefined()
    expect(decision).toMatchObject({ kind: "answer", card: CARDS.replay, partial: true })
    // 여유를 넘는 문턱이면 두 조각 모두 제 판정으로 답한다.
    const loose = resolveDecision(index, analysis, () => kick - SEGMENT_CONF_MARGIN - 0.01)
    expect(loose.segments?.map((segment) => [segment.kind, segment.card, segment.source])).toEqual([
      ["answer", CARDS.replay, "segment"],
      ["answer", CARDS.kick, "segment"],
    ])
  })

  it("원문 판정은 여유 없이 θ 를 쓴다", () => {
    const analysis = analyzeQuestion(index, "학생 채팅 금지 되나요", { env: {} })
    expect(analysis.parts).toBeNull()
    const conf = analysis.whole.confs[0]
    expect(resolveDecision(index, analysis, () => conf - 0.01)).toMatchObject({ kind: "answer", card: CARDS.chat })
  })
})

describe("R02 확신도 특징 knnCount1(1위 카드의 우주 이웃 수, 로그 눌림)", () => {
  it("특징 순서 끝에 knnCount1 이 있다", () => {
    expect(ANSWER_INDEX_FEATURES[ANSWER_INDEX_FEATURES.length - 1]).toBe("knnCount1")
  })

  it("log1p(이웃 수) / log1p(10) 로 눌러 0~1 이다", () => {
    expect(knnCountFeature(0)).toBe(0)
    expect(knnCountFeature(1)).toBeCloseTo(Math.log(2) / Math.log(11), 10)
    expect(knnCountFeature(KNN_K)).toBeCloseTo(1, 10)
    expect(knnCountFeature(3)).toBeLessThan(3 * knnCountFeature(1))
  })

  it("우주 이웃 가운데 그 카드 라벨인 이웃을 세고(라벨이 갈리면 반), 특징으로 싣는다", () => {
    const chatQuery = "애들끼리 채팅 못 하게 하는 기능 있어요"
    const scored = scoreCandidates(index, prepareQuery(index, chatQuery))
    const chat = index.cardById.get(CARDS.chat)!
    expect(scored.knn.neighbors).toBe(1)
    expect(scored.knnCountOf(chat)).toBe(1)
    expect(scored.knnCountOf(index.cardById.get(CARDS.price)!)).toBe(0)
    const decision = decide(index, chatQuery)
    expect(decision.card).toBe(CARDS.chat)
    expect(decision.features?.knnCount1).toBeCloseTo(knnCountFeature(1), 10)

    // 라벨이 둘로 갈린 우주 문항(코스 구성원 삭제·강퇴)은 두 카드에 반씩 센다.
    const split = scoreCandidates(index, prepareQuery(index, "코스 멤버 정리하고 싶어요"))
    expect(split.knnCountOf(index.cardById.get(CARDS.remove)!)).toBe(0.5)
    expect(split.knnCountOf(index.cardById.get(CARDS.kick)!)).toBe(0.5)

    // 이웃이 없으면 0.
    expect(decide(index, "학생 채팅 금지 되나요").features?.knnCount1).toBe(0)
  })

  it("확신도 계수의 마지막 자리가 knnCount1 에 곱해진다", () => {
    const features = decide(index, "애들끼리 채팅 못 하게 하는 기능 있어요").features!
    const base = confidenceOf(features, "doc", index.calibration)
    const w = [...index.calibration.confidence.doc.w]
    w[ANSWER_INDEX_FEATURES.indexOf("knnCount1")] = 2
    const boosted = confidenceOf(features, "doc", { ...index.calibration, confidence: { ...index.calibration.confidence, doc: { ...index.calibration.confidence.doc, w } } })
    expect(boosted).toBeGreaterThan(base)
  })
})

describe("R07 정해 둔 답 승격(옛 정규식 표 카드가 상위 3 안이면 문턱 아래에서도 답)", () => {
  const trace = (question: string, votes: string[], env: Record<string, string> = {}) =>
    toAnswerIndexTrace(decide(index, question, { votes, env }), { version: "test", router: "compiled" })

  it("스위치는 기본 켬(below)이고 off·0·false 로 끄며, override 는 다른 카드로 답한 판정도 바꾼다", () => {
    expect(voteRescueMode({})).toBe("below")
    expect(voteRescueMode({ CHATBOT_COMPILED_VOTE_RESCUE: "on" })).toBe("below")
    expect(voteRescueMode({ CHATBOT_COMPILED_VOTE_RESCUE: " Override " })).toBe("override")
    for (const value of ["off", "0", "false", " OFF "]) expect(voteRescueMode({ CHATBOT_COMPILED_VOTE_RESCUE: value })).toBe("off")
  })

  it("표 카드가 상위 3 안이고 검사를 통과하면 문턱 아래여도 그 카드로 답하고, 흔적에 index:vote-rescue 를 남긴다", () => {
    const question = "학생 관리 방법"
    const off = decide(index, question, { votes: [CARDS.kick], env: RESCUE_OFF })
    expect(off).toMatchObject({ kind: "abstain", card: null, rescue: null })
    const rescued = decide(index, question, { votes: [CARDS.kick] })
    expect(rescued).toMatchObject({ kind: "answer", card: CARDS.kick, rescue: "vote", partial: false, absentTail: null, abstainReason: null })
    expect(rescued.conf).toBeLessThan(index.calibration.thresholds.doc)
    expect(rescued.top.slice(0, VOTE_RESCUE_TOP).map((candidate) => candidate.id)).toContain(CARDS.kick)
    const recorded = trace(question, [CARDS.kick])
    expect(recorded).toMatchObject({ decision: "answer", card: CARDS.kick, decidedBy: "index:vote-rescue" })
    // 측정 줄의 decidedBy 는 카드 대조용 index:<card> 그대로다.
    expect(decidedByFromAnswerIndex(recorded)).toBe(`index:${CARDS.kick}`)
    // 승격하지 않은 판정의 흔적은 null.
    expect(trace("학생 채팅 금지 되나요", []).decidedBy).toBeNull()
  })

  it("1위가 다른 카드로 답했으면 기본은 그대로 두고, override 면 상위 3 안의 표 카드로 바꾼다(혼합 P3 그대로)", () => {
    const question = "학생 채팅 금지 되나요"
    expect(decide(index, question, { votes: [CARDS.kick], env: RESCUE_OFF })).toMatchObject({ kind: "answer", card: CARDS.chat })
    expect(decide(index, question, { votes: [CARDS.kick] })).toMatchObject({ kind: "answer", card: CARDS.chat, rescue: null })
    expect(decide(index, question, { votes: [CARDS.kick], env: RESCUE_OVERRIDE })).toMatchObject({ kind: "answer", card: CARDS.kick, rescue: "vote" })
    // 1위가 표 카드면 어느 방식이든 그대로다.
    expect(decide(index, question, { votes: [CARDS.chat], env: RESCUE_OVERRIDE })).toMatchObject({ kind: "answer", card: CARDS.chat, rescue: null })
    // override 도 못 찾음은 살린다.
    expect(decide(index, "학생 관리 방법", { votes: [CARDS.kick], env: RESCUE_OVERRIDE })).toMatchObject({ kind: "answer", card: CARDS.kick, rescue: "vote" })
  })

  it("표 카드가 상위 3 밖이거나 표가 없으면 승격하지 않는다", () => {
    const question = "학생 관리 방법"
    for (const votes of [[], [CARDS.replay], ["fixed:not-in-index"]]) {
      const decision = decide(index, question, { votes })
      expect(decision.kind).toBe("abstain")
      expect(decision.rescue).toBeNull()
    }
  })

  it("공백·상담 연결 카드는 승격하지 않는다", () => {
    const decision = decide(index, "상담 문의 방법", { votes: [CARDS.handoff] })
    expect(decision.top[0].id).toBe(CARDS.handoff)
    expect(decision).toMatchObject({ kind: "abstain", rescue: null })
  })

  it("없는 개념을 표 카드가 덮지 않으면 승격하지 않는다", () => {
    const decision = decide(index, "요금 카카오페이 되나요", { votes: [CARDS.price] })
    expect(decision.top[0].id).toBe(CARDS.price)
    expect(decision).toMatchObject({ kind: "abstain", absentHit: "A_kakaopay", rescue: null })
  })

  it("공백 판정(없는 개념·공백 카드)과 되묻기는 그대로 둔다", () => {
    expect(decide(index, "ISMS 인증 있나요", { votes: [CARDS.price] })).toMatchObject({ kind: "gap", card: CARDS.gapCert, rescue: null })
    expect(decide(index, "상담 시간 언제예요", { votes: [CARDS.handoff] })).toMatchObject({ kind: "gap", card: CARDS.gapHours, rescue: null })
    expect(decide(index, "그거 안 돼요", { votes: [CARDS.price] })).toMatchObject({ kind: "clarify", rescue: null })
  })

  it("NODOC 검사: 반례 none 자리가 1위이거나 우주 이웃 대부분이 '문서에 없음'이면 승격하지 않는다", () => {
    const none = decide(index, "채팅 기록은 나중에 볼 수 있나요", { votes: [CARDS.replay] })
    expect(none.top[0].id).toBe("none")
    expect(none).toMatchObject({ kind: "abstain", rescue: null })
    const universeNone = decide(index, "회사 주식 상장했나요", { votes: [CARDS.price] })
    expect(universeNone.top[0].id).toBe(CARDS.price)
    expect(universeNone).toMatchObject({ kind: "abstain", rescue: null })
  })

  it("범위 관문 밖(CHATBOT_COMPILED_MAX_CHARS)이면 승격하지 않는다", () => {
    expect(decide(index, "학생 관리 방법", { votes: [CARDS.kick], env: { CHATBOT_COMPILED_MAX_CHARS: "4" } })).toMatchObject({ kind: "abstain", rescue: null })
  })

  it("두 조각을 이은 답은 override 에서도 그대로 둔다", () => {
    for (const env of [{}, RESCUE_OVERRIDE]) {
      const decision = decide(index, "녹화 되나요? 그리고 학생 강퇴도 돼요?", { votes: [CARDS.count], env })
      expect(decision).toMatchObject({ kind: "answer", card: CARDS.replay, rescue: null })
      expect(decision.segments?.length).toBe(2)
    }
  })

  it("같은 색인·같은 질문·같은 표면 같은 판정이다", () => {
    const first = JSON.stringify(decide(index, "학생 관리 방법", { votes: [CARDS.kick] }))
    expect(JSON.stringify(decide(compileFixture(), "학생 관리 방법", { votes: [CARDS.kick] }))).toBe(first)
  })
})
