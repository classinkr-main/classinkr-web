import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { getRouterAnswerIndex, resetRouterAnswerIndex } from "@/lib/chatbot/answer-index"
import { decide } from "@/lib/chatbot/answer-index/decide"
import { collectLegacyVotes } from "@/lib/chatbot/answer-index/legacy-votes"
import { splitQuestion } from "@/lib/chatbot/answer-index/normalize"
import {
  dropRepeatedLines,
  fixYesNoLead,
  numberedPieceBlocks,
  PIECE_MORE_STEPS_LINE,
  trimPieceBlocks,
} from "@/lib/chatbot/answer-index/respond"
import { toYoTone } from "@/lib/chatbot/answer-index/yo-tone"
import { resolveConversationTurn } from "@/lib/chatbot/conversation-context"
import { __clearAnswerCacheForTests, evaluateChatbotQuery } from "@/lib/chatbot/service"
import {
  applyCompiledToneToAnswer,
  COMPILED_HANDOFF_NOW_LINE,
  detectConversationTone,
  detectStrongToneSignals,
  toCompiledYoFixedPhrases,
} from "@/lib/chatbot/tone"
import { lintAnswer } from "@/scripts/answer-index/lib/style-audit-core"

/**
 * R3 반박 검토 결함 재현 시험(고치기 전에 실패하던 꼴). 시험 글은 모두 새로 쓴 것이다(실제 상담 글을 옮기지 않았다).
 */

describe("R3 rebut: 그럼·그러면 elliptical follow-ups keep the previous topic on the compiled router", () => {
  const on = { leadingConnectiveNewQuestion: true, standsAlone: () => false }
  const cases: [string, string][] = [
    ["카메라가 안 켜져요", "그럼 마이크는요?"],
    ["수업 녹화 기능 있나요?", "그러면 비용은요?"],
    ["강사는 어떻게 초대해요?", "그럼 학생도요?"],
    ["로그인이 안 돼요", "그럼 비밀번호 찾기는요?"],
  ]
  for (const [previous, message] of cases) {
    it(`${previous} → ${message} expands like the pre-R3 rule`, () => {
      const before = resolveConversationTurn(message, { question: previous, answerMode: "direct_answer" }, null, { standsAlone: () => false })
      const after = resolveConversationTurn(message, { question: previous, answerMode: "direct_answer" }, null, on)
      expect(before.expanded).toBe(true)
      expect(after).toMatchObject({ reason: before.reason, expanded: true, routingText: before.routingText })
    })
  }

  it("still opens a new question for additive connectives without an elliptical 도", () => {
    const camera = { question: "카메라가 안 켜져요" }
    for (const message of ["그리고 출결은요?", "또 숙제는요?", "추가로 요금은요?"]) {
      expect(resolveConversationTurn(message, camera, null, on), message).toMatchObject({ reason: "none", expanded: false })
    }
    // "그리고 학생도요?"는 앞 질문의 서술어를 그대로 잇는 말이다.
    expect(resolveConversationTurn("그리고 학생도요?", { question: "강사는 어떻게 초대해요?" }, null, on).expanded).toBe(true)
  })
})

// 인용·[ ] 밖 니다체 문장 끝(style-audit sentenceTone 과 같은 뜻, 콜론 앞 끝 포함).
const NIDA_END_RE = /(?:니다|니까)(?=[.!?:：]|\s*$)/m
const stripQuoted = (text: string) => text.replace(/'[^'\n]*'|"[^"\n]*"|\[[^\]\n]*\]|「[^」\n]*」/g, " ")
const nidaLines = (answer: string) => answer.split("\n").filter((line) => NIDA_END_RE.test(stripQuoted(line)))

describe("R3 rebut: compiled answers do not mix the 니다 and 요 styles", () => {
  it("turns a colon-ended 니다 lead-in into the yo style and keeps the listed items", () => {
    const closing = "그래도 안 되면 담당자 상담으로 이어 드릴게요. 상담할 때 이 정보를 함께 알려 주시면 더 빨리 확인합니다: 쓰는 기기와 운영체제, 클래스인 앱 버전."
    const converted = toYoTone(closing)
    expect(converted.reverted).toBe(false)
    expect(converted.text).toBe("그래도 안 되면 담당자 상담으로 이어 드릴게요. 상담할 때 이 정보를 함께 알려 주시면 더 빨리 확인할 수 있어요: 쓰는 기기와 운영체제, 클래스인 앱 버전.")
    expect(toYoTone("준비물은 다음과 같습니다: 노트북, 이어폰.").text).toBe("준비물은 다음과 같아요: 노트북, 이어폰.")
  })

  it("writes the service fixed phrases (symptom closing, refund handoff) in the yo style", () => {
    const refund = "아래 [실시간 상담 연결]을 누르시면 상담원에게 바로 환불 요청을 접수할 수 있어요. 결제한 학원명과 결제 시기를 함께 말씀해 주시면 더 빨리 확인합니다."
    expect(nidaLines(toCompiledYoFixedPhrases(refund))).toEqual([])
    const closing = "상담할 때 이 정보를 함께 알려 주시면 더 빨리 확인합니다: 수업 이름."
    expect(nidaLines(toCompiledYoFixedPhrases(closing))).toEqual([])
  })

  it("L9 counts a colon-ended 니다 sentence next to 요 sentences as mixed", () => {
    const answer = "그래도 안 되면 담당자 상담으로 이어 드릴게요.\n상담할 때 이 정보를 함께 알려 주시면 더 빨리 확인합니다: 쓰는 기기, 앱 버전."
    expect(lintAnswer(answer).some((finding) => finding.rule === "L9")).toBe(true)
  })

  it("does not repeat the consult notice under the connect-now line", () => {
    const question = "몇 번째 문의인데 아직도 앱이 안 켜져요"
    const tone = detectConversationTone(question)
    const notFound = "딱 맞는 해결 안내를 아직 찾지 못했어요. 추측해서 안내하지는 않을게요.\n\n아래 상담 버튼으로 증상을 남겨 주시면 기술지원 담당자가 확인해 드려요."
    const toned = applyCompiledToneToAnswer(notFound, tone, detectStrongToneSignals(question, tone), { offerHandoff: true })
    expect(toned.startsWith(COMPILED_HANDOFF_NOW_LINE)).toBe(true)
    expect(toned).not.toContain("아래 상담 버튼으로 증상을 남겨 주시면")
    expect(toned).toContain("딱 맞는 해결 안내를 아직 찾지 못했어요.")
  })
})

describe("R3 rebut: compiled router answers through the service", () => {
  beforeAll(() => {
    vi.stubEnv("CHATBOT_ANSWER_ROUTER", "compiled")
    resetRouterAnswerIndex()
  })
  beforeEach(() => __clearAnswerCacheForTests())
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.stubEnv("CHATBOT_ANSWER_ROUTER", "compiled")
  })
  afterAll(() => {
    vi.unstubAllEnvs()
    resetRouterAnswerIndex()
  })

  it("renders the symptom clarify menu and the howto closing in the yo style", async () => {
    const clarify = await evaluateChatbotQuery("계속 안 돼요 또 튕겨요", { generateAnswer: false })
    expect(clarify.answerMode).toBe("clarifying_question")
    expect(nidaLines(clarify.answer)).toEqual([])
    const howto = await evaluateChatbotQuery("수업 중에 소리가 안 들려요", { generateAnswer: false })
    expect(nidaLines(howto.answer)).toEqual([])
    expect(howto.answer).not.toContain("확인합니다")
  }, 120_000)

  it("answers a piece from another piece's body instead of saying it was not found, without a device follow-up", async () => {
    const pair = await evaluateChatbotQuery("학원에서 계정 받았는데 로그인이 안 돼요. 비밀번호는 어떻게 바꿔요?", { generateAnswer: false })
    const second = pair.answer.split(/\n\n(?=2\. )/)[1] ?? ""
    expect(second).not.toContain("찾지 못했어요")
    expect(second).toContain("[비밀번호 변경]")
    expect(pair.answer).not.toContain("쓰시는 기기가 PC인지")
    // 조각 가운데에 상담 안내 두 줄이 남지 않는다.
    expect(pair.answer.split(/\n\n(?=2\. )/)[0]).not.toContain("상담할 때 이 정보를")
  }, 120_000)

  it("names unanswered pieces with distinct noun phrases instead of quotes or ordinals", async () => {
    const heads = (answer: string) => answer.split("\n").filter((line) => /^\d\. /.test(line)).map((line) => line.replace(/^\d\. /, ""))
    const code = heads((await evaluateChatbotQuery("비밀번호 바꾸려는데 인증코드가 어디로 와요? 안 오면 어떻게 해요?", { generateAnswer: false })).answer)
    expect(code.length).toBe(2)
    expect(new Set(code).size).toBe(2)
    const install = heads((await evaluateChatbotQuery("이거 깔려면 어케해요 돈도 내야되요?", { generateAnswer: false })).answer)
    expect(install).toEqual(["설치 방법", "비용"])
    const people = heads((await evaluateChatbotQuery("학생이 20명인데 한 수업에 다 들어올 수 있나요? 가격은 얼마쯤이에요?", { generateAnswer: false })).answer)
    expect(people.some((head) => head.includes("번째 질문"))).toBe(false)
  }, 120_000)

  it("unifies the tone of a long question that the compiled router hands to the legacy flow", async () => {
    const long =
      "어제부터 아이가 수업에 들어가면 화면이 자꾸 멈추고 소리가 끊겨서 걱정돼요. 공유기도 껐다 켜 봤고 앱도 다시 깔아 봤는데 그대로예요. 오늘 저녁에도 수업이 있는데 집에 있는 노트북으로 바꿔서 들어가도 되는지 궁금하고 뭘 더 해 봐야 할까요?"
    const pair = await evaluateChatbotQuery(long, { generateAnswer: false })
    expect(nidaLines(pair.answer)).toEqual([])
    // 걱정은 약한 신호라 공감 첫마디를 붙이지 않는다(사용자 기본값).
    expect(pair.answer).not.toContain("걱정되셨겠어요")
    // 스위치를 끄면 지금 legacy 흐름 그대로다.
    vi.stubEnv("CHATBOT_COMPILED_OUT_SCOPE_TONE", "off")
    __clearAnswerCacheForTests()
    const off = await evaluateChatbotQuery(long, { generateAnswer: false })
    expect(off.answer).toContain("걱정되셨겠어요")
  }, 120_000)
})

describe("R3 rebut: compound render helpers", () => {
  it("drops a yes/no word whose polarity does not match the question", () => {
    const vpn = "네, 해외에서도 VPN 없이 로그인과 수업 입장이 대부분 돼요.\n다만 보안 내부망에서는 제한될 수 있어요."
    expect(fixYesNoLead(vpn, "중국에서 VPN 필요한가요?").split("\n")[0]).toBe("해외에서도 VPN 없이 로그인과 수업 입장이 대부분 돼요.")
    const board = "아니요, 전자칠판은 필수가 아니에요."
    expect(fixYesNoLead(board, "전자칠판 없이 노트북만으로도 되나요?")).toBe("전자칠판은 필수가 아니에요.")
    // 물음과 같은 방향이면 그대로 둔다.
    expect(fixYesNoLead("네, 수업 녹화를 켤 수 있어요.", "수업 녹화 되나요?")).toBe("네, 수업 녹화를 켤 수 있어요.")
    expect(fixYesNoLead("네, VPN 없이도 돼요.", "VPN 없이 되나요?")).toBe("네, VPN 없이도 돼요.")
  })

  it("drops a later plain line that repeats an earlier step", () => {
    const text = "1. 볼륨을 확인해요.\n2. 블루투스 이어폰을 쓰고 있다면 연결을 끊었다가 다시 연결해요.\n\n블루투스 이어폰을 쓰고 있다면 연결을 끊었다가 다시 연결해 보세요."
    expect(dropRepeatedLines(text)).toBe("1. 볼륨을 확인해요.\n2. 블루투스 이어폰을 쓰고 있다면 연결을 끊었다가 다시 연결해요.")
  })

  it("puts the more-steps line at the end of the piece", () => {
    const { lead, rest } = numberedPieceBlocks([["결론이에요."], ["1. 하나", "2. 둘", "3. 셋", "4. 넷"], ["덧붙이는 말이에요."]])
    expect(lead).toEqual(["결론이에요.", "- 하나", "- 둘", "- 셋"])
    expect(rest).toEqual([["덧붙이는 말이에요."], [PIECE_MORE_STEPS_LINE]])
  })

  it("keeps only paragraphs about the piece question and drops widget checklist blocks", () => {
    const blocks = [["해외에서도 VPN 없이 들어가요."], ["앱은 스토어에서 받아요."], ["VPN 을 쓰면 오히려 느릴 수 있어요."], ["함께 확인할 것", "1단계: 자료를 열어 두었어요."]]
    expect(trimPieceBlocks(blocks, ["vpn"])).toEqual([["해외에서도 VPN 없이 들어가요."], ["VPN 을 쓰면 오히려 느릴 수 있어요."]])
  })
})

describe("R3 rebut: compound question decisions", () => {
  it("puts a whole-question card on the piece it fits best, not on a later piece by rank", () => {
    const index = getRouterAnswerIndex()
    const question = "맥에 설치하려는데 M칩이면 어떤 파일 받아야 해요? 설치했는데 안 열리면요?"
    const decision = decide(index, question, { votes: collectLegacyVotes(question, null, index.legacyAlias) })
    const chip = "doc:/docs/start/pc-install-troubleshooting#4/mac-chip-installer"
    expect(decision.segments?.[0]?.card).toBe(chip)
    expect(decision.segments?.[1]?.card).not.toBe(chip)
  }, 60_000)

  it("does not fold a second question into the first piece's card when the card has none of its words", () => {
    const index = getRouterAnswerIndex()
    const question = "한 번에 몇 GB까지 올릴 수 있나요? 계정 전체로는 총 몇 GB까지 올릴 수 있나요?"
    const decision = decide(index, question, { votes: collectLegacyVotes(question, null, index.legacyAlias) })
    expect(decision.segments?.length).toBe(2)
    expect(decision.segments?.[0]?.card).toBe("fixed:basics-file-upload-size")
    expect(decision.segments?.[1]?.card).toBeNull()
  }, 60_000)

  it("splits two head-noun inquiries joined by 과·와", () => {
    expect(splitQuestion("비밀번호 바꾸는 방법과 탈퇴하는 방법 알려 주세요").segments.length).toBe(2)
    expect(splitQuestion("반을 여러 개 만들 때 학습 플랜 복제 가능 여부와 연락처로 초대하는 방법").segments.length).toBe(2)
    // 한 물음의 두 속성·비교는 나누지 않는다.
    expect(splitQuestion("수업 시간과 장소가 어떻게 되나요?").segments.length).toBe(1)
    expect(splitQuestion("가격과 기능 차이가 뭐예요?").segments.length).toBe(1)
  })
})
