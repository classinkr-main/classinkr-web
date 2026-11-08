import { describe, expect, it } from "vitest"

import { applyToneToAnswer, detectConversationTone, PRIOR_INQUIRY_LINE } from "@/lib/chatbot/tone"

/**
 * 말투 계층: 공감·사과 첫마디와 "지난 대화는 볼 수 없어요" 문장이 답에 한 번만 들어가는지 본다.
 */

describe("conversation tone", () => {
  it("does not read a quoted remark from someone else as the visitor's earlier inquiry", () => {
    const tone = detectConversationTone(
      "학생 한 명이 수업 30분 전에 '선생님, 그거 또 안 돼요'라고만 메시지를 남기고 답이 없습니다. 미리 점검할 게 있을까요?"
    )
    expect(tone.priorContext).toBeNull()
    expect(detectConversationTone("또 안 돼요. 어제 말한 그거요").priorContext).toBe("inquiry")
  })

  it("keeps the apology for angry visitors when the answer only regrets a limitation", () => {
    const tone = detectConversationTone("환불 신청 절차가 어떻게 됩니까! 어디에 뭘 내야 하는지 정확히 말해요!")
    const answer = applyToneToAnswer(
      "환불 가능 여부는 담당자가 확인해요. 채팅에서 바로 약속드릴 수는 없어 죄송합니다.\n\n아래 [실시간 상담 연결]을 누르세요.",
      tone,
      { offerHandoff: false }
    )
    expect(answer.startsWith("불편을 드려 정말 죄송합니다.")).toBe(true)
  })

  it("does not apologize twice when the answer already opens with an apology", () => {
    const tone = detectConversationTone("펜이 화면 오른쪽 절반에서는 아예 안 써집니다! 이게 벌써 몇 번째 고장입니까!")
    const original = "수업 중에 펜이 안 먹히면 정말 답답하시죠. 죄송합니다.\n\n1. 손가락 터치도 안 되는지 봅니다.\n\n아래 [실시간 상담 연결]로 알려 주세요."
    const answer = applyToneToAnswer(original, tone, { offerHandoff: true })
    expect(answer.match(/죄송/g)?.length).toBe(1)
  })

  it("does not add a second empathy opener to an answer that already empathizes", () => {
    const tone = detectConversationTone("아이가 칠판을 쳐서 금이 간 것 같대요. 수리비를 물어야 하나요? 어떡하죠?")
    const original = "많이 놀라셨죠. 너무 걱정 마시고 차분히 순서대로 하시면 돼요.\n\n먼저 학원에 알려 주세요."
    expect(applyToneToAnswer(original, tone, { offerHandoff: false })).toBe(original)
  })

  it("says it cannot see earlier chats only once", () => {
    const tone = detectConversationTone("지난주에 전화드렸을 때 기사님이 오신다고 했는데 아직도 안 오셨어요.")
    expect(tone.priorContext).toBe("inquiry")
    const original = "기다리셨는데 불편하셨겠어요. 이전 A/S 접수 내역은 제가 이 채팅에서 볼 수 없어요."
    const answer = applyToneToAnswer(original, tone, { offerHandoff: false })
    expect(answer).not.toContain(PRIOR_INQUIRY_LINE)
    expect(answer.match(/볼 수 없/g)?.length).toBe(1)
  })
})
