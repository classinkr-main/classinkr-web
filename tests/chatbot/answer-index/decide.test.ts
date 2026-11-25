import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import { checkCandidate, coverageOf, scoreNegatives } from "@/lib/chatbot/answer-index/checks"
import { prepareQuery } from "@/lib/chatbot/answer-index/compile"
import { decide, disabledCardIds, minConfidence, outOfScopeTrace, thresholdFor, toAnswerIndexTrace } from "@/lib/chatbot/answer-index/decide"
import { confidenceOf, scoreCandidates } from "@/lib/chatbot/answer-index/score"
import { stableJson } from "@/scripts/answer-index/lib/common"
import { decidedByFromAnswerIndex } from "@/scripts/lib/chatbot-live-eval-checks"
import { CARDS, compileFixture, copyFixture } from "./index-fixture"

// 답 색인 사양 §3.3 ③~⑦(특징·점수·검사·확신도), §3.4, §3.5(결정 규칙), §3.7(흔적), §3.8(비상 문턱·카드 끄기), §12.1 I6.

const index = compileFixture()
const trace = (question: string, env?: Record<string, string>) =>
  toAnswerIndexTrace(decide(index, question, env ? { env } : {}), { version: "test", router: "compiled" })

const cleanups: (() => void)[] = []
afterEach(() => {
  vi.unstubAllEnvs()
  while (cleanups.length > 0) cleanups.pop()?.()
})

describe("점수(§3.4)", () => {
  it("변형·중심 벡터·이웃·표·BM25F 성분으로 후보를 매기고 같은 점수면 id 순이다", () => {
    const result = scoreCandidates(index, prepareQuery(index, "학생 채팅 금지 되나요"))
    const top = result.candidates[0]
    expect(top.id).toBe(CARDS.chat)
    expect(top.components.maxcos).toBeGreaterThan(0.5)
    expect(top.components.centroid).toBeGreaterThan(0.5)
    expect(top.components.bm25f).toBeGreaterThan(0)
    const weights = index.calibration.weights
    const expected = Object.entries(top.components).reduce((sum, [key, value]) => sum + weights[key as keyof typeof weights] * value, 0)
    expect(top.s).toBeCloseTo(expected, 10)
    for (let i = 1; i < result.candidates.length; i += 1) {
      const [a, b] = [result.candidates[i - 1], result.candidates[i]]
      expect(a.s > b.s || (a.s === b.s && a.id < b.id)).toBe(true)
    }
  })

  it("우주 이웃(코사인 0.35 이상)의 라벨 몫이 knnShare 다", () => {
    const chat = scoreCandidates(index, prepareQuery(index, "애들끼리 채팅 못 하게 하는 기능 있어요"))
    expect(chat.candidates.find((candidate) => candidate.id === CARDS.chat)?.components.knnShare).toBeCloseTo(1, 5)
    const none = scoreCandidates(index, prepareQuery(index, "회사 주식 상장했나요"))
    expect(none.knn.neighbors).toBe(1)
    expect(none.knn.none).toBeCloseTo(1, 5)
  })

  it("옛 정규식 표(votes)에 있는 카드는 vote=1 로 후보에 들어간다", () => {
    const result = scoreCandidates(index, prepareQuery(index, "회사 주식 상장했나요"), [CARDS.price, "fixed:not-in-index"])
    const price = result.candidates.find((candidate) => candidate.id === CARDS.price)
    expect(price?.components.vote).toBe(1)
    expect(price?.s).toBeCloseTo(index.calibration.weights.vote, 5)
  })
})

describe("검사(§3.3 ⑤)", () => {
  it("반례가 양성 변형보다 가까우면(negMargin > 0) 탈락하고 반례 행선을 알려 준다", () => {
    const query = prepareQuery(index, "녹화 영상을 파일로 내려받아 보관할 수 있나요")
    const scored = scoreCandidates(index, query)
    const check = checkCandidate(index, query, index.cardById.get(CARDS.replay)!, {
      negatives: scoreNegatives(index, query),
      maxVariantCos: scored.maxVariantCos,
      centroidCos: scored.centroidCos,
    })
    expect(check.rejected).toBe(true)
    expect(check.negMargin).toBeGreaterThan(0)
    expect(check.negRouteId).toBe(CARDS.download)
    expect(check.negRoute).toBe(index.cardById.get(CARDS.download))
  })

  it("덮임은 질문 내용 n-gram 가운데 IDF 상위 절반이 카드 쪽에 있는 비율이다", () => {
    const covered = coverageOf(index, prepareQuery(index, "판서 편집에서 지우는 법"), index.cardById.get(CARDS.edit)!)
    const other = coverageOf(index, prepareQuery(index, "판서 편집에서 지우는 법"), index.cardById.get(CARDS.price)!)
    expect(covered).toBeGreaterThan(0.9)
    expect(other).toBeLessThan(0.2)
  })

  it("카드가 설명하지 못하는 비일반 개념은 unexplained 로 남는다(거부가 아니라 특징)", () => {
    const decision = decide(index, "엑셀 파일로 학생 채팅 금지 하는 법")
    expect(decision.kind).toBe("answer")
    expect(decision.card).toBe(CARDS.chat)
    expect(decision.unexplained).toEqual(["C_file"])
    expect(decision.features?.unexplainedCount).toBe(1)
  })

  it("말뭉치에 없는 낱말을 센다", () => {
    expect(prepareQuery(index, "넷플릭스 같이 볼 수 있나요").unknownHighIdf).toBe(2)
    expect(prepareQuery(index, "녹화 영상 어디 있어요").unknownHighIdf).toBe(0)
  })
})

describe("결정 규칙(§3.5)", () => {
  it("확신도 ≥ 문턱이면 1위 카드로 답하고, conf 는 σ(w·x+b) 다", () => {
    const decision = decide(index, "학생 채팅 금지 되나요")
    expect(decision).toMatchObject({ kind: "answer", card: CARDS.chat, askType: "yesno", partial: false, abstainReason: null })
    expect(decision.conf).toBeCloseTo(confidenceOf(decision.features!, "doc", index.calibration), 10)
    expect(decision.conf).toBeGreaterThanOrEqual(thresholdFor(index, "doc", {}))
    expect(decide(index, "요금 얼마예요").card).toBe(CARDS.price)
    expect(decide(index, "학생 수 몇 명까지 돼요").card).toBe(CARDS.count)
  })

  it("반례로 1위가 탈락하면 반례 행선 카드가 가산점을 받아 이긴다", () => {
    expect(decide(index, "녹화 영상을 파일로 내려받아 보관할 수 있나요").card).toBe(CARDS.download)
    expect(decide(index, "녹화된 수업 어디서 봐요").card).toBe(CARDS.replay)
  })

  it("반례 행선이 none 이면 그 자리가 1위가 되어 못 찾음이다", () => {
    const decision = decide(index, "채팅 기록은 나중에 볼 수 있나요")
    expect(decision.kind).toBe("abstain")
    expect(decision.abstainReason).toBe("nodoc")
    expect(decision.top[0].id).toBe("none")
    // 반례에 가까운 질문에서 그 카드는 순위에서 빠진다.
    const near = decide(index, "채팅 기록은 나중에 저장돼서 볼 수 있나요")
    expect(near.kind).toBe("abstain")
    expect(near.top.map((candidate) => candidate.id)).toContain("none")
    expect(near.top.map((candidate) => candidate.id)).not.toContain(CARDS.chat)
  })

  it("없는 개념: 1위가 덮지 않으면 그 공백 카드로 간다(absentHit 은 개념 id, card 는 공백 카드)", () => {
    const decision = decide(index, "ISMS 인증 있나요")
    expect(decision).toMatchObject({ kind: "gap", card: CARDS.gapCert, absentHit: "A_isms", absentTail: null })
    const recorded = trace("ISMS 인증 있나요")
    expect(recorded.card).toBe(CARDS.gapCert)
    expect(decidedByFromAnswerIndex(recorded)).toBe(`index-gap:${CARDS.gapCert}`)
  })

  it("없는 개념: 나머지를 1위가 충분히 덮고 답할 만하면 답 + 없는 부분 꼬리", () => {
    const question = "ISMS 쓰는 학원도 녹화 다시보기 어디서 봐요"
    const decision = decide(index, question)
    expect(decision).toMatchObject({ kind: "answer", card: CARDS.replay, absentHit: "A_isms", absentTail: "A_isms", partial: true, segments: null })
    expect(decidedByFromAnswerIndex(trace(question))).toBe(`index-partial:${CARDS.replay}`)
  })

  it("없는 개념을 따로 묻는 조각은 그 조각 자리에 공백 카드로 답한다(R2 나누기 v2)", () => {
    const question = "녹화 다시보기 어디서 봐요 ISMS 인증도 있나요"
    const decision = decide(index, question)
    expect(decision).toMatchObject({ kind: "answer", card: CARDS.replay, absentHit: "A_isms", partial: true })
    expect(decision.segments?.map((segment) => [segment.kind, segment.card])).toEqual([
      ["answer", CARDS.replay],
      ["gap", CARDS.gapCert],
    ])
    expect(decidedByFromAnswerIndex(trace(question))).toBe(`index-partial:${CARDS.replay}`)
  })

  it("없는 개념의 공백 카드가 색인에 없으면 못 찾음(absentHit 은 남긴다)", () => {
    const decision = decide(index, "카카오페이 되나요")
    expect(decision).toMatchObject({ kind: "abstain", card: null, absentHit: "A_kakaopay", abstainReason: "nodoc" })
  })

  it("1위가 공백 카드이고 확신도 ≥ θ.gap 이면 gap, 상담 연결 카드는 답으로 낸다", () => {
    expect(decide(index, "상담 시간 언제예요")).toMatchObject({ kind: "gap", card: CARDS.gapHours, absentHit: null })
    expect(decide(index, "상담원 연결해 주세요")).toMatchObject({ kind: "answer", card: CARDS.handoff })
  })

  it("못 찾음 갈래: 내용 없음 → clarify, 증상 → abstain(symptom), 그 밖 → abstain(nodoc)", () => {
    expect(decide(index, "그거 안 돼요")).toMatchObject({ kind: "clarify", card: null, abstainReason: null })
    expect(decide(index, "에러나요")).toMatchObject({ kind: "clarify" })
    expect(decide(index, "로그인 에러나요")).toMatchObject({ kind: "abstain", abstainReason: "symptom" })
    expect(decide(index, "회사 주식 상장했나요")).toMatchObject({ kind: "abstain", abstainReason: "nodoc" })
    // 증상 판별은 넘겨받은 함수로 바꿀 수 있다.
    expect(decide(index, "회사 주식 상장했나요", { isSymptomReport: () => true }).abstainReason).toBe("symptom")
  })

  it("경계 오탐이 판정으로 번지지 않는다: '편집에서'는 '집에서' 개념을 만들지 않는다", () => {
    const decision = decide(index, "판서 편집에서 지우는 법")
    expect(decision.card).toBe(CARDS.edit)
    expect(prepareQuery(index, "판서 편집에서 지우는 법").conceptIds).toEqual(["C_edit"])
    expect(prepareQuery(index, "학생 수업 녹화 되나요").conceptIds).not.toContain("C_student_count")
  })
})

describe("확신도·문턱·비상 스위치(§3.8)", () => {
  it("CHATBOT_COMPILED_MIN_CONFIDENCE 는 모든 문턱의 하한이다(잘못된 값은 무시)", () => {
    expect(minConfidence({})).toBeNull()
    expect(minConfidence({ CHATBOT_COMPILED_MIN_CONFIDENCE: "abc" })).toBeNull()
    expect(minConfidence({ CHATBOT_COMPILED_MIN_CONFIDENCE: "1.5" })).toBe(1)
    expect(thresholdFor(index, "doc", { CHATBOT_COMPILED_MIN_CONFIDENCE: "0.2" })).toBe(0.55)
    expect(thresholdFor(index, "doc", { CHATBOT_COMPILED_MIN_CONFIDENCE: "0.995" })).toBe(0.995)

    const question = "채팅 막을 수 있어요?"
    const normal = decide(index, question)
    expect(normal.kind).toBe("answer")
    const floored = decide(index, question, { env: { CHATBOT_COMPILED_MIN_CONFIDENCE: "0.999" } })
    expect(floored.kind).toBe("abstain")
    expect(floored.conf).toBeCloseTo(normal.conf, 10)
    // process.env 로도 켠다.
    vi.stubEnv("CHATBOT_COMPILED_MIN_CONFIDENCE", "0.999")
    expect(decide(index, question).kind).toBe("abstain")
  })

  it("calibration 문턱을 올리면 같은 확신도라도 못 찾음이다", () => {
    const made = copyFixture()
    cleanups.push(made.cleanup)
    const path = join(made.dir, "calibration.json")
    const calibration = JSON.parse(readFileSync(path, "utf8"))
    calibration.thresholds.doc = 0.999
    writeFileSync(path, stableJson(calibration))
    const strict = compileFixture(made.dir)
    expect(decide(strict, "채팅 막을 수 있어요?").kind).toBe("abstain")
    expect(decide(strict, "요금 얼마예요").kind).toBe("answer")
  })

  it("CHATBOT_COMPILED_DISABLED_CARDS 로 끈 카드는 빠지고 다음 순위가 경쟁한다", () => {
    expect(disabledCardIds({ CHATBOT_COMPILED_DISABLED_CARDS: ` ${CARDS.chat} , ${CARDS.gapCert},,` })).toEqual(new Set([CARDS.chat, CARDS.gapCert]))
    const env = { CHATBOT_COMPILED_DISABLED_CARDS: `${CARDS.chat},${CARDS.gapCert},${CARDS.download}` }
    const chat = decide(index, "학생 채팅 금지 되나요", { env })
    expect(chat.card).not.toBe(CARDS.chat)
    expect(chat.top.map((candidate) => candidate.id)).not.toContain(CARDS.chat)
    // 없는 개념의 공백 카드를 끄면 못 찾음.
    expect(decide(index, "ISMS 인증 있나요", { env })).toMatchObject({ kind: "abstain", absentHit: "A_isms" })
    // 반례 행선 카드를 끄면 그 행선은 none 으로 본다.
    expect(decide(index, "녹화 영상을 파일로 내려받아 보관할 수 있나요", { env }).card).not.toBe(CARDS.download)
    // 우주 이웃 라벨이 끈 카드면 그 몫은 '쓸 수 없음'으로 간다.
    const knn = scoreCandidates(index, prepareQuery(index, "애들끼리 채팅 못 하게 하는 기능 있어요"), [], { disabled: new Set([CARDS.chat]) })
    expect(knn.knn.unavailable).toBeCloseTo(1, 5)
    vi.stubEnv("CHATBOT_COMPILED_DISABLED_CARDS", CARDS.chat)
    expect(decide(index, "학생 채팅 금지 되나요").card).not.toBe(CARDS.chat)
  })
})

describe("두 조각(§3.3 ②)", () => {
  it("두 조각이 서로 다른 카드로 답하면 둘을 잇는다", () => {
    const decision = decide(index, "녹화 되나요? 그리고 학생 강퇴도 돼요?")
    expect(decision.kind).toBe("answer")
    expect(decision.card).toBe(CARDS.replay)
    expect(decision.segments?.map((segment) => [segment.kind, segment.card])).toEqual([
      ["answer", CARDS.replay],
      ["answer", CARDS.kick],
    ])
    expect(decision.partial).toBe(false)
    expect(decidedByFromAnswerIndex(trace("녹화 되나요? 그리고 학생 강퇴도 돼요?"))).toBe(`index:${CARDS.replay}`)
  })

  it("한 조각만 답하면 그 답 + 나머지 조각 못 찾음(partial)", () => {
    const question = "녹화 되나요? 그리고 회사 주식 상장했나요?"
    const decision = decide(index, question)
    expect(decision.card).toBe(CARDS.replay)
    expect(decision.segments?.map((segment) => segment.kind)).toEqual(["answer", "abstain"])
    expect(decision.partial).toBe(true)
    const recorded = trace(question)
    expect(recorded).toMatchObject({ card: CARDS.replay, partial: true, segments: 2 })
    expect(decidedByFromAnswerIndex(recorded)).toBe(`index-partial:${CARDS.replay}`)
  })

  it("나눌 수 없는 질문은 원문 하나로 정한다", () => {
    expect(decide(index, "학생 채팅 금지 되나요").segments).toBeNull()
  })
})

describe("흔적(§3.7)과 결정성", () => {
  it("흔적에 고른 카드·꼬리 여부를 싣고, 측정 스크립트 decidedBy 로 읽힌다", () => {
    expect(trace("학생 채팅 금지 되나요")).toMatchObject({ scope: "in", decision: "answer", card: CARDS.chat, partial: false, absentTail: null, segments: 1 })
    expect(decidedByFromAnswerIndex(trace("학생 채팅 금지 되나요"))).toBe(`index:${CARDS.chat}`)
    expect(decidedByFromAnswerIndex(trace("회사 주식 상장했나요"))).toBe("index-abstain")
    expect(decidedByFromAnswerIndex(trace("그거 안 돼요"))).toBe("index-clarify")
    const out = outOfScopeTrace({ version: "test", router: "compiled" })
    expect(out.scope).toBe("out")
    expect(decidedByFromAnswerIndex(out)).toBeNull()
    expect(trace("학생 채팅 금지 되나요").top.length).toBeLessThanOrEqual(3)
  })

  it("같은 색인·같은 질문이면 같은 판정이고, 다시 컴파일해도 같다", () => {
    const questions = [
      "학생 채팅 금지 되나요",
      "녹화 영상을 파일로 내려받아 보관할 수 있나요",
      "ISMS 인증 있나요",
      "녹화 되나요? 그리고 학생 강퇴도 돼요?",
      "그거 안 돼요",
      "넷플릭스 같이 볼 수 있나요",
    ]
    const again = compileFixture()
    for (const question of questions) {
      const first = JSON.stringify(decide(index, question))
      expect(JSON.stringify(decide(index, question))).toBe(first)
      expect(JSON.stringify(decide(again, question))).toBe(first)
    }
  })

  it("네트워크를 부르지 않는다", () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)
    try {
      decide(index, "녹화 되나요? 그리고 학생 강퇴도 돼요?")
      compileFixture()
    } finally {
      vi.unstubAllGlobals()
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
