import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { resetRouterAnswerIndex } from "@/lib/chatbot/answer-index"
import { compiledNextTurnMode, resolveConversationTurn } from "@/lib/chatbot/conversation-context"
import {
  __clearAnswerCacheForTests,
  __frontDoorForTests,
  compiledFrontMode,
  evaluateChatbotQuery,
  legacySegmentNoticeMode,
  LEGACY_SEGMENT_RETRY_LINE,
} from "@/lib/chatbot/service"
import {
  applyCompiledToneToAnswer,
  applyToneToAnswer,
  COMPILED_EMPATHY_LINES,
  COMPILED_HANDOFF_NOW_LINE,
  compiledEmpathyMode,
  compiledRepeated,
  compiledToneOpener,
  detectConversationTone,
  detectStrongToneSignals,
  toCompiledYoFixedPhrases,
} from "@/lib/chatbot/tone"
import { judgeFirstLine, lintAnswer } from "@/scripts/answer-index/lib/style-audit-core"

/**
 * R3 a3/c2(답 꼴 규격 S7·S13·4.5, 계획 §3 a3): compiled 라우터 답에만 쓰는 말투 층·앞단 좁히기·다음 턴 규칙과
 * legacy 조각 알림 스위치. 모두 스위치로 끄고 켠다. legacy 기본 답은 바뀌지 않는다(legacy-equivalence 시험이 지킨다).
 * 시험 글은 모두 새로 쓴 것이다(실제 상담 글을 옮기지 않았다).
 */

const tone = (question: string) => detectConversationTone(question)
const signals = (question: string) => detectStrongToneSignals(question)
const opener = (question: string) => compiledToneOpener(signals(question))

// 약한 표지(걱정·불안·'ㅠㅠ'·미안해함·불편)와 강한 표지가 없는 말.
const WEAK_OR_NONE = [
  "걱정돼요 녹화가 안 남았으면 어떡하죠",
  "비밀번호 바꾸는 법 알려주세요 ㅠㅠ",
  "로그인이 안 돼요 ㅠㅠ",
  "죄송한데 출석은 어디서 봐요?",
  "화면이 작아서 불편해요. 글자 크기 키우는 법 있나요?",
  "아이가 수업을 놓쳤어요… 어떡하죠?",
  "녹화본은 어디서 봐요?",
  "수업 중에 학생 마이크를 끄는 방법",
  "수업 시작 전에 미리 장비 테스트하는 법",
  "수업 직전에 학생에게 알림 보내는 기능 있나요",
  "매번 재부팅해야 프로그램 업데이트가 적용되나요?",
  "매번 인터넷 연결 확인 창이 떠요",
  "가입할 때 자꾸 전화번호 입력 칸에서 오류가 나요",
  "계속 연락처 칸이 비어 있다고 나와요",
  "번번이 학생들이 숙제 위치를 물어봐서 해 봤는데 안내 화면 있나요",
  "다 해 봤는데 화난 건 아니고 판서 저장 위치가 궁금해요",
  "학생이 '도대체 왜 안 돼요'라고 해서 재설치 다 해 봤어요, 마이크 권한은 어디서 줘요?",
]

const STRONG: [string, string][] = [
  ["도대체 왜 녹화가 안 돼요", COMPILED_EMPATHY_LINES.angry],
  ["짜증나요 수업이 또 끊겼어요", COMPILED_EMPATHY_LINES.angry],
  ["몇 번째 문의인데 아직도 안 고쳐졌어요", COMPILED_EMPATHY_LINES.repeatedInquiry],
  ["또 문의드려요. 녹화가 또 끊겼어요", COMPILED_EMPATHY_LINES.repeatedInquiry],
  ["벌써 세 번째 연락인데 앱이 안 켜져요", COMPILED_EMPATHY_LINES.repeatedInquiry],
  ["몇 번을 다시 깔아도 앱이 안 켜져요", COMPILED_EMPATHY_LINES.repeatedFailure],
  ["시키는 대로 다 해 봤는데 그대로예요", COMPILED_EMPATHY_LINES.repeatedFailure],
  ["수업 5분 전인데 로그인이 안 돼요", COMPILED_EMPATHY_LINES.before_class],
  ["곧 수업인데 카메라가 안 켜져요", COMPILED_EMPATHY_LINES.before_class],
  ["지금 수업 중인데 학생 소리가 안 들려요", COMPILED_EMPATHY_LINES.in_class],
  ["화면 공유가 안 돼요. 급해요", COMPILED_EMPATHY_LINES.urgent],
]

describe("R3 a3 strong tone signals", () => {
  it("adds no empathy line for weak or missing signals", () => {
    expect(WEAK_OR_NONE.filter((question) => opener(question) !== null)).toEqual([])
  })

  it("picks one empathy line for each strong signal", () => {
    for (const [question, line] of STRONG) expect(opener(question), question).toBe(line)
  })

  it("keeps the legacy repeated reading only where we were asked again or the problem keeps coming back", () => {
    // 옛 판정이 반복 문의로 읽던 미끼는 compiled 에서 반복이 아니다(상담 연결 앞세우기·사과를 하지 않는다).
    for (const question of ["매번 재부팅해야 프로그램 업데이트가 적용되나요?", "매번 인터넷 연결 확인 창이 떠요"]) {
      expect(tone(question).repeated, question).toBe(true)
      expect(compiledRepeated(tone(question), signals(question)), question).toBe(false)
    }
    for (const question of ["몇 번째 문의인데 아직도 안 고쳐졌어요. 다 해 봤다고요", "같은 문제로 계속 문의하는데 해 봤다고요", "몇 번을 말해야 돼요? 상담원 바꿔 주세요"]) {
      expect(compiledRepeated(tone(question), signals(question)), question).toBe(true)
    }
  })

  it("reads the switch", () => {
    expect(compiledEmpathyMode({})).toBe("strong")
    expect(compiledEmpathyMode({ CHATBOT_COMPILED_EMPATHY: "off" })).toBe("off")
    expect(compiledFrontMode({})).toBe("narrow")
    expect(compiledFrontMode({ CHATBOT_COMPILED_FRONT: "off" })).toBe("off")
    expect(compiledNextTurnMode({})).toBe("new")
    expect(compiledNextTurnMode({ CHATBOT_COMPILED_NEXT_TURN: "off" })).toBe("off")
    expect(legacySegmentNoticeMode({})).toBe("pair")
    expect(legacySegmentNoticeMode({ CHATBOT_LEGACY_SEGMENT_NOTICE: "split" })).toBe("split")
  })
})

describe("R3 a3 compiled tone layer", () => {
  const card = "카메라가 안 켜지면 권한부터 확인해 주세요.\n다른 화상 프로그램이 카메라를 쓰고 있으면 꺼 주세요.\n\n1. 기기 설정에서 카메라 권한을 켜요.\n2. 교실에서 카메라를 다시 골라요."
  const apply = (question: string, answer: string, offerHandoff = false) =>
    applyCompiledToneToAnswer(answer, tone(question), signals(question), { offerHandoff })

  it("puts the empathy line right after the conclusion in the same block", () => {
    const toned = apply("수업 5분 전인데 카메라가 안 켜져요", card)
    const [first, ...rest] = toned.split("\n\n")
    expect(first.split("\n")).toEqual([
      "카메라가 안 켜지면 권한부터 확인해 주세요.",
      COMPILED_EMPATHY_LINES.before_class,
      "다른 화상 프로그램이 카메라를 쓰고 있으면 꺼 주세요.",
    ])
    expect(rest).toEqual(card.split("\n\n").slice(1))
    // 첫 줄은 여전히 결론이다(L1).
    expect(judgeFirstLine(toned.split("\n")[0], null)).toBe("conclusion")
    expect(apply("수업 5분 전인데 카메라가 안 켜져요", toned)).toBe(toned)
  })

  it("leaves the answer unchanged for weak signals (only fixed phrases turn to the yo style)", () => {
    for (const question of WEAK_OR_NONE) expect(apply(question, card), question).toBe(card)
  })

  it("keeps list-first answers rendering as a list (empathy goes in its own first block)", () => {
    const list = "1. 기기 설정에서 카메라 권한을 켜요.\n2. 교실에서 카메라를 다시 골라요."
    expect(apply("지금 수업 중인데 카메라가 안 켜져요", list)).toBe(`${COMPILED_EMPATHY_LINES.in_class}\n\n${list}`)
  })

  it("leads with the connection line, then one apology line, and keeps the steps bridge only when steps follow", () => {
    const angry = "도대체 왜 카메라가 안 돼요"
    const toned = apply(angry, `${card}\n\n그래도 안 되면 담당자 상담으로 이어 드릴게요.`, true)
    expect(toned.split("\n\n")[0]).toBe(`${COMPILED_HANDOFF_NOW_LINE}\n${COMPILED_EMPATHY_LINES.angry}`)
    expect(toned).toContain("먼저 해 보실 수 있는 조치도 함께 남겨 둘게요.")
    expect(toned).not.toContain("그래도 안 되면 담당자 상담으로 이어 드릴게요.")
    expect(apply(angry, toned, true)).toBe(toned)
    const notFound = "딱 맞는 해결 안내를 아직 찾지 못했어요.\n\n아래 상담 버튼으로 증상을 남겨 주세요."
    const handoffOnly = apply("몇 번째 문의인데 아직도 안 돼요", notFound, true)
    expect(handoffOnly).not.toContain("먼저 해 보실 수 있는 조치도")
    expect(handoffOnly.split("\n\n")[0].split("\n")).toEqual([COMPILED_HANDOFF_NOW_LINE, COMPILED_EMPATHY_LINES.repeatedInquiry])
  })

  it("does not add a second empathy line when the answer already empathizes", () => {
    const answer = "같은 답만 되풀이해 답답하셨을 텐데 죄송해요. 사람이 직접 답하는 상담도 있어요.\n\n아래 버튼을 눌러 주세요."
    expect(apply("도대체 왜 같은 답만 해요", answer)).toBe(answer)
  })

  it("writes the tone-layer and front-stage fixed phrases in the yo style (no mixed tone)", () => {
    const legacyToned = applyToneToAnswer(card, tone("도대체 왜 카메라가 안 돼요"), { offerHandoff: true })
    expect(legacyToned).toContain("정말 죄송합니다.")
    const compiled = apply("도대체 왜 카메라가 안 돼요", card, true)
    expect(compiled).not.toMatch(/니다\./)
    expect(lintAnswer(compiled).filter((finding) => finding.rule === "L9" || finding.rule === "L1")).toEqual([])
    expect(toCompiledYoFixedPhrases("담당자가 이번 상황을 확인한 뒤 직접 안내드립니다.")).toBe("담당자가 이번 상황을 확인한 뒤 직접 안내해 드려요.")
  })
})

// ─── 서비스(evaluateChatbotQuery, 모델·DB·네트워크 없음) ─────────────────────────────

const REAL_HANDOFF_REQUESTS = [
  "상담원 연결해 주세요",
  "사람이랑 얘기하고 싶어요",
  "담당자랑 통화하고 싶습니다",
  "전화 상담 가능할까요?",
  "도입 상담 신청하고 싶어요",
  "데모 신청할게요",
  "지금 바로 상담원이랑 통화할 수 있나요?",
  "원격으로 봐 주실 수 있나요?",
  "담당자 전화번호 좀 주세요",
  "짜증나서 상담원 연결해 주세요",
  "몇 번을 말해야 돼요? 상담원 바꿔 주세요",
]
const APPLY_WHERE_QUESTIONS = [
  "상담 신청은 어디서 하나요?",
  "도입 상담 신청 어디서 해요?",
  "데모 신청은 어디서 해요?",
  "도입 문의는 어디서 신청해요?",
  "도입 상담은 전화로 해요 메일로 해요?",
]

beforeAll(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "info").mockImplementation(() => {})
})

beforeEach(() => {
  __clearAnswerCacheForTests()
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
  vi.stubEnv("SUPABASE_SECRET_KEY", "")
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "")
  vi.stubEnv("GEMINI_API_KEY", "")
  vi.stubEnv("ANSWER_INDEX_DATA_DIR", undefined)
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("network disabled in r3 a3 test")
    })
  )
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

afterAll(() => {
  resetRouterAnswerIndex()
  vi.restoreAllMocks()
})

describe("R3 c2 compiled front door: application place and method go to the index", () => {
  it("never narrows a real connection request", () => {
    expect(REAL_HANDOFF_REQUESTS.filter((question) => __frontDoorForTests.inspect(question).compiledHandoffYield)).toEqual([])
  }, 60_000)

  it("hands application place/method questions to the index", () => {
    for (const question of APPLY_WHERE_QUESTIONS) {
      const result = __frontDoorForTests.inspect(question)
      expect(result.handoff, question).toBe("strong")
      expect(result.compiledHandoffYield, question).toBe(true)
    }
  }, 60_000)

  it("answers from a card with the consult button kept, and falls back to the handoff when the index has no card or a hub card", async () => {
    vi.stubEnv("CHATBOT_ANSWER_ROUTER", "compiled")
    const where = await evaluateChatbotQuery("데모 신청은 어디서 해요?", { generateAnswer: false })
    expect(where.answerIndex?.pre ?? null).toBeNull()
    expect(where.answerIndex?.decision).toBe("answer")
    expect(where.needsHandoff).toBe(true)
    expect(where.answer.startsWith("네, 담당자 상담으로")).toBe(false)
    // 색인이 카드로 답하지 못하는 말은 지금처럼 즉시 상담이다.
    const fallback = __frontDoorForTests.inspect("데모 수업 신청 어디서 해요")
    expect(fallback.compiledHandoffYield).toBe(true)
    expect(fallback.plan).toMatchObject({ kind: "pre", pre: "handoff" })
    // 색인이 허브 카드(role: hub, 도입 문의 총괄)로 답하는 말도 즉시 상담이다(R3 b 허브 표시가 들어온 뒤).
    const hub = await evaluateChatbotQuery("상담 신청은 어디서 하나요?", { generateAnswer: false })
    expect(__frontDoorForTests.inspect("상담 신청은 어디서 하나요?").compiledHandoffYield).toBe(true)
    expect(hub.answerIndex?.pre).toBe("handoff")
    expect(hub.answerMode).toBe("handoff")
  }, 120_000)

  it("keeps the immediate handoff when the switch is off, and on the legacy router", async () => {
    vi.stubEnv("CHATBOT_ANSWER_ROUTER", "compiled")
    vi.stubEnv("CHATBOT_COMPILED_FRONT", "off")
    expect(__frontDoorForTests.inspect("상담 신청은 어디서 하나요?").plan).toMatchObject({ kind: "pre", pre: "handoff" })
    vi.stubEnv("CHATBOT_COMPILED_FRONT", undefined)
    vi.stubEnv("CHATBOT_ANSWER_ROUTER", undefined)
    const legacy = await evaluateChatbotQuery("상담 신청은 어디서 하나요?", { generateAnswer: false })
    expect(legacy.answerMode).toBe("handoff")
  }, 120_000)
})

describe("R3 a3 compiled tone through the service", () => {
  it("adds the strong-signal empathy after the conclusion and none for weak signals", async () => {
    vi.stubEnv("CHATBOT_ANSWER_ROUTER", "compiled")
    const urgent = await evaluateChatbotQuery("수업 10분 전인데 카메라가 안 켜져요", { generateAnswer: false })
    expect(urgent.answer.split("\n")[1]).toBe(COMPILED_EMPATHY_LINES.before_class)
    const weak = await evaluateChatbotQuery("걱정돼요 학생이 수업에 못 들어오면 어떡하죠? 초대 링크는 어디서 보내요?", { generateAnswer: false })
    expect(weak.answer).not.toContain("걱정되셨겠어요")
    // 스위치를 끄면 R2 말투 층 그대로다.
    vi.stubEnv("CHATBOT_COMPILED_EMPATHY", "off")
    __clearAnswerCacheForTests()
    const r2 = await evaluateChatbotQuery("걱정돼요 학생이 수업에 못 들어오면 어떡하죠? 초대 링크는 어디서 보내요?", { generateAnswer: false })
    expect(r2.answer.startsWith("걱정되셨겠어요. 같이 차근차근 확인해 볼게요.")).toBe(true)
  }, 120_000)

  it("does not apologize or lead with a handoff for decoys the legacy reading took as repeated", async () => {
    vi.stubEnv("CHATBOT_ANSWER_ROUTER", "compiled")
    const decoy = await evaluateChatbotQuery("매번 재부팅해야 프로그램 업데이트가 적용되나요?", { generateAnswer: false })
    expect(decoy.answer).not.toContain("죄송")
    expect(decoy.answer).not.toContain(COMPILED_HANDOFF_NOW_LINE)
    const repeated = await evaluateChatbotQuery("세 번째 문의입니다. 재설치도 해 봤는데 소용없어요", { generateAnswer: false })
    expect(repeated.needsHandoff).toBe(true)
    expect(repeated.answer).toContain(COMPILED_EMPATHY_LINES.repeatedInquiry)
    expect(repeated.answer).not.toMatch(/죄송합니다/)
  }, 120_000)
})

describe("R3 a3 next turn: 그리고·또·추가로 open a new question (compiled only)", () => {
  const camera = { question: "카메라가 안 켜져요" }
  const on = { leadingConnectiveNewQuestion: true, answersNewWords: () => true }

  it("picks again for a new question that opens with an additive connective", () => {
    for (const message of ["그리고 출결은요?", "또 숙제는요?", "추가로 요금은요?"]) {
      expect(resolveConversationTurn(message, camera, null, on), message).toMatchObject({ reason: "none", expanded: false })
      // 끄면(legacy·스위치 off) 지금 규칙 그대로다.
      expect(resolveConversationTurn(message, camera, null, { answersNewWords: () => true }).expanded, message).toBe(
        message !== "추가로 요금은요?"
      )
    }
  })

  it("leaves 그럼·그러면 to the existing gates (R3 rebut: elliptical follow-ups keep the topic)", () => {
    // 새 낱말을 답하면 잇고(스텁 true), 앞 답을 그대로 다시 낼 뿐이면(false) 새로 고른다. 스위치와 상관없이 지금 규칙과 같다.
    expect(resolveConversationTurn("그럼 녹화본은요?", camera, null, on).expanded).toBe(true)
    expect(resolveConversationTurn("그럼 녹화본은요?", camera, null, { ...on, answersNewWords: () => false }).expanded).toBe(false)
  })

  it("still continues pronoun references, device replies and retry reports", () => {
    expect(resolveConversationTurn("그러면 아이패드는요", camera, null, on)).toMatchObject({ reason: "follow_up", expanded: true })
    expect(resolveConversationTurn("또 안 돼요", camera, null, on)).toMatchObject({ expanded: true })
    expect(resolveConversationTurn("그럼 그거 어디서 봐요", camera, null, on)).toMatchObject({ expanded: true })
  })
})

describe("R3 a3 legacy segment notice switch (default off)", () => {
  it("keeps the R2 notice by default and numbers the missing piece in question order when switched on", async () => {
    const question = "맥북에도 깔리나요? 그리고 카메라가 안 켜져요"
    const pair = await evaluateChatbotQuery(question, { generateAnswer: false })
    expect(pair.answer).toContain("함께 물어보신 '맥북에도 깔리나요'는 이 답에 담지 못했어요.")
    vi.stubEnv("CHATBOT_LEGACY_SEGMENT_NOTICE", "split")
    const split = await evaluateChatbotQuery(question, { generateAnswer: false })
    expect(split.answer).toContain(`1. '맥북에도 깔리나요'\n${LEGACY_SEGMENT_RETRY_LINE}`)
    expect(split.answer).not.toContain("함께 물어보신")
    expect(split.suggestedQuestions[0]).toBe("맥북에도 깔리나요?")
    const second = await evaluateChatbotQuery("가격이 얼마예요? 앱도 있어요?", { generateAnswer: false })
    expect(second.answer).toContain(`2. '앱도 있어요'\n${LEGACY_SEGMENT_RETRY_LINE}`)
    vi.stubEnv("CHATBOT_COMPOUND_HEAD", "bracket")
    const bracket = await evaluateChatbotQuery("가격이 얼마예요? 앱도 있어요?", { generateAnswer: false })
    expect(bracket.answer).toContain(`【'앱도 있어요'】\n${LEGACY_SEGMENT_RETRY_LINE}`)
  }, 120_000)
})
