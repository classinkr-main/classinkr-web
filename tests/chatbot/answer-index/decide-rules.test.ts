import { describe, expect, it } from "vitest"

import { prepareQuery } from "@/lib/chatbot/answer-index/compile"
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import {
  analyzeQuestion,
  decide,
  resolveDecision,
  SEGMENT_CONF_MARGIN,
  segmentCoverageEnabled,
  segmentCoverageOf,
  segmentMargin,
  segmentMax,
  segmentThreshold,
  toAnswerIndexTrace,
  VOTE_RESCUE_TOP,
  voteRescueMode,
} from "@/lib/chatbot/answer-index/decide"
import { confidenceOf, KNN_K, knnCountFeature, scoreCandidates } from "@/lib/chatbot/answer-index/score"
import { ANSWER_INDEX_FEATURES } from "@/lib/chatbot/answer-index/types"
import { decidedByFromAnswerIndex } from "@/scripts/lib/chatbot-live-eval-checks"
import { CARDS, compileFixture, copyFixture } from "./index-fixture"

// 진단 R1 결정 규칙: R15(조각 답 문턱 여유), R02(확신도 특징 knnCount1), R07(정해 둔 답 승격). R3 a2: 덮임 점검·조각 수·문턱 여유 스위치·이미 해 본 동작.

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

describe("R3 a2 덮임 점검(규격 4.4, CHATBOT_SEGMENT_COVERAGE)", () => {
  const ON = {}
  const OFF = { CHATBOT_SEGMENT_COVERAGE: "off" }
  const shape = (question: string, env: Record<string, string>) =>
    decide(index, question, { env }).segments?.map((segment) => [segment.kind, segment.card, segment.source ?? null, segment.coverage ?? null, segment.coverageCard ?? null])

  it("스위치: 기본 켬, off·0·false 면 끈다. 여유·조각 수는 받을 수 있는 값만 받는다", () => {
    expect([segmentCoverageEnabled({}), segmentCoverageEnabled({ CHATBOT_SEGMENT_COVERAGE: "on" }), segmentCoverageEnabled(OFF), segmentCoverageEnabled({ CHATBOT_SEGMENT_COVERAGE: "0" })]).toEqual([true, true, false, false])
    expect([segmentMargin({}), segmentMargin({ CHATBOT_SEGMENT_MARGIN: "0.05" }), segmentMargin({ CHATBOT_SEGMENT_MARGIN: "0.9" }), segmentMargin({ CHATBOT_SEGMENT_MARGIN: "x" })]).toEqual([0.1, 0.05, 0.1, 0.1])
    expect([segmentMax({}), segmentMax({ CHATBOT_SEGMENT_MAX: "4" }), segmentMax({ CHATBOT_SEGMENT_MAX: "5" })]).toEqual([3, 4, 3])
  })

  it("다른 조각이 답한 카드로 채운 조각(shared)도 묻는 꼴이 안 맞으면 알림 자리로 둔다", () => {
    const question = "녹화 되나요? 녹화 요금은 얼마예요?"
    expect(shape(question, OFF)).toEqual([
      ["answer", CARDS.replay, "segment", null, null],
      ["answer", CARDS.replay, "shared", null, null],
    ])
    expect(shape(question, ON)).toEqual([
      ["answer", CARDS.replay, "segment", "pass", null],
      ["abstain", null, null, "asks_mismatch", CARDS.replay],
    ])
    const decision = decide(index, question, { env: ON })
    expect(decision).toMatchObject({ kind: "answer", card: CARDS.replay, partial: true })
    // 따로 물어도 같은 카드가 나오면 '따로 물어봐 주세요'를 약속하지 않는다(못 찾음 알림).
    expect(decision.segments?.[1]?.alone).not.toBe("answer")
    expect(toAnswerIndexTrace(decision, { version: "t", router: "compiled" }).parts?.map((part) => part.coverage)).toEqual(["pass", "asks_mismatch"])
  })

  it("모든 조각 1위가 같고 원문도 그 카드로 정한 질문(한 카드 답)도 조각마다 본다", () => {
    const question = "채팅 금지 되나요? 채팅 금지 요금은 얼마예요?"
    expect(shape(question, OFF)).toEqual([
      ["answer", CARDS.chat, "segment", null, null],
      ["answer", CARDS.chat, "whole", null, null],
    ])
    expect(shape(question, ON)).toEqual([
      ["answer", CARDS.chat, "segment", "pass", null],
      ["abstain", null, null, "asks_mismatch", CARDS.chat],
    ])
  })

  it("조각마다 제 판정으로 고른 카드는 통과다(판정 그대로)", () => {
    expect(shape("녹화 다시보기 어디서 봐요? 판서 편집도 되나요?", ON)).toEqual([
      ["answer", CARDS.replay, "segment", "pass", null],
      ["answer", CARDS.edit, "segment", "pass", null],
    ])
  })

  it("원문 카드가 어느 조각도 덮지 못하면 그 카드로 모두 답하지 않고 원문 못 찾음으로 낸다", () => {
    const analysis = analyzeQuestion(index, "채팅 금지 요금은 얼마예요? 채팅 금지 비용은 얼마예요?", { env: ON })
    expect(analysis.parts?.map((part) => part.ranked[part.topReal].id)).toEqual([CARDS.chat, CARDS.chat])
    // 원문 확신도만 문턱 위로 올린다(조각은 문턱 + 여유 밑): 두 조각이 다 원문 카드로 채워지는 꼴.
    const theta = Math.max(...analysis.parts!.map((part) => part.confs[part.topReal])) - SEGMENT_CONF_MARGIN + 0.01
    const forced = { ...analysis, whole: { ...analysis.whole, confs: [theta + 0.2, ...analysis.whole.confs.slice(1)] } }
    const off = resolveDecision(index, { ...forced, coverage: false }, () => theta)
    expect(off).toMatchObject({ kind: "answer", card: CARDS.chat })
    const on = resolveDecision(index, forced, () => theta)
    expect(on.kind).toBe("abstain")
    expect(on.card).toBeNull()
    expect(on.segments?.map((segment) => [segment.kind, segment.coverage, segment.coverageCard])).toEqual([
      ["abstain", "asks_mismatch", CARDS.chat],
      ["abstain", "asks_mismatch", CARDS.chat],
    ])
  })

  describe("갈래 신호(notCovers 행선)", () => {
    const withNotCovers = () => {
      const copy = copyFixture()
      const file = join(copy.dir, "cards", "recording.json")
      const cards = JSON.parse(readFileSync(file, "utf8")) as { id: string; notCovers?: string[] }[]
      for (const card of cards) if (card.id === CARDS.replay) card.notCovers = [`녹화 파일 내려받기 → ${CARDS.download}`]
      writeFileSync(file, JSON.stringify(cards, null, 2))
      const compiled = compileFixture(copy.dir)
      copy.cleanup()
      return compiled
    }
    const branched = withNotCovers()
    const question = "녹화 되나요? 녹화 다시보기 내려받기 돼요?"

    it("조각에 행선 카드만의 낱말(내려받기)이 있고 그 카드가 조각 순위에 있으면 not_covers 다", () => {
      const part = analyzeQuestion(branched, question, { env: ON }).parts![1]
      expect(part.ranked[part.topReal].id).toBe(CARDS.replay)
      expect(segmentCoverageOf(branched, part, CARDS.replay)).toBe("not_covers")
      expect(segmentCoverageOf(branched, part, CARDS.download)).toBe("pass")
      // 행선이 없는 색인에서는 같은 조각이 통과다.
      expect(segmentCoverageOf(index, analyzeQuestion(index, question, { env: ON }).parts![1], CARDS.replay)).toBe("pass")
    })

    it("갈래 카드가 단일 질문 문턱 θ 를 넘으면 그 카드로 바로 다시 고르고, 못 넘으면 알림 자리다", () => {
      const env = { ...ON }
      expect(decide(branched, question, { env }).segments?.[1]).toMatchObject({ kind: "abstain", card: null, coverage: "not_covers", coverageCard: CARDS.replay })
      const analysis = analyzeQuestion(branched, question, { env })
      const part = analysis.parts![1]
      const at = part.ranked.findIndex((candidate) => candidate.id === CARDS.download)
      const theta = part.confs[at] - 1e-6
      // 원문·첫 조각은 답하고, 둘째 조각은 조각 문턱(θ + 여유) 밑이라 제 판정으로는 답하지 않는 자리.
      expect(part.confs[part.topReal]).toBeLessThan(theta + SEGMENT_CONF_MARGIN)
      expect(analysis.whole.confs[0]).toBeGreaterThanOrEqual(theta)
      const decision = resolveDecision(branched, analysis, () => theta)
      expect(decision.segments?.map((segment) => [segment.kind, segment.card, segment.source, segment.coverage, segment.coverageCard ?? null])).toEqual([
        ["answer", CARDS.replay, "segment", "pass", null],
        ["answer", CARDS.download, "segment", "not_covers", CARDS.replay],
      ])
      // 점검을 끄면 R2 처럼 원문 카드(녹화)로 채운다.
      expect(resolveDecision(branched, { ...analysis, coverage: false }, () => theta).segments?.[1]).toMatchObject({ kind: "answer", card: CARDS.replay, source: "whole" })
    })
  })

  it("단일 질문은 점검과 무관하다(판정 바이트 같음)", () => {
    for (const question of ["학생 채팅 금지 되나요", "녹화 파일 다운로드 되나요", "요금 얼마예요"]) {
      expect(JSON.stringify(decide(index, question, { env: ON }))).toBe(JSON.stringify(decide(index, question, { env: OFF })))
    }
  })
})

describe("R3 a2 조각 문턱 여유(CHATBOT_SEGMENT_MARGIN)·조각 수(CHATBOT_SEGMENT_MAX)", () => {
  it("여유는 분석할 때의 환경변수로 정하고 조각 판정에만 쓴다", () => {
    const question = "녹화 되나요? 그리고 학생 강퇴도 돼요?"
    const narrow = analyzeQuestion(index, question, { env: { CHATBOT_SEGMENT_MARGIN: "0.05" } })
    const wide = analyzeQuestion(index, question, { env: {} })
    expect([narrow.segmentMargin, wide.segmentMargin]).toEqual([0.05, SEGMENT_CONF_MARGIN])
    const kick = wide.parts![1].confs[wide.parts![1].topReal]
    const theta = kick - 0.075
    expect(resolveDecision(index, wide, () => theta).segments?.[1]?.kind).toBe("abstain")
    expect(resolveDecision(index, narrow, () => theta).segments?.[1]).toMatchObject({ kind: "answer", card: CARDS.kick, source: "segment" })
  })

  it("조각 수 4 면 네 조각까지 답하고 넘는 조각만 overflow 다", () => {
    const question = "1. 녹화 되나요\n2. 학생 강퇴 돼요\n3. 채팅 금지 되나요\n4. 판서 편집 되나요\n5. 요금 얼마예요"
    const four = decide(index, question, { env: { CHATBOT_SEGMENT_MAX: "4" } })
    expect(four.segments?.map((segment) => segment.source === "overflow")).toEqual([false, false, false, false, true])
    const three = decide(index, question, { env: {} })
    expect(three.segments?.filter((segment) => segment.source === "overflow")).toHaveLength(2)
  })
})

describe("R3 a2 이미 해 본 동작(규격 S14)", () => {
  it("질문에서 뽑아 판정의 tried 로 넘기고 판정은 바꾸지 않는다", () => {
    const question = "앱을 지웠다가 다시 깔았는데도 녹화가 안 돼요"
    const decision = decide(index, question, { env: {} })
    expect(decision.tried).toEqual(["재설치"])
    const plain = decide(index, question, { env: {}, tried: [] })
    expect(plain.tried).toBeUndefined()
    expect(JSON.stringify({ ...decision, tried: undefined })).toBe(JSON.stringify(plain))
    expect(decide(index, question, { env: {}, tried: ["업데이트"] }).tried).toEqual(["업데이트"])
    expect(decide(index, "녹화 되나요", { env: {} }).tried).toBeUndefined()
    // 흔적에는 싣지 않는다.
    expect(toAnswerIndexTrace(decision, { version: "t", router: "compiled" })).not.toHaveProperty("tried")
  })
})
