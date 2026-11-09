import { describe, expect, it } from "vitest"

import { CHATBOT_SELF_KNOWLEDGE_ENTRIES, findChatbotSelfKnowledgeEntry } from "@/lib/chatbot/self-knowledge"

describe("chatbot self knowledge", () => {
  it("keeps public self-knowledge answers free of internal instruction labels", () => {
    const forbiddenPublicTerms = /내부\s*지침|시스템\s*프롬프트|developer|system\s*prompt/i

    for (const entry of CHATBOT_SELF_KNOWLEDGE_ENTRIES) {
      const answer = entry.answer.join("\n")
      const suggestions = entry.suggestedQuestions.join("\n")

      expect(answer, entry.key).not.toMatch(forbiddenPublicTerms)
      expect(suggestions, entry.key).not.toMatch(forbiddenPublicTerms)
    }
  })

  it("treats 'you told me to clear app data' as a product question, not a question about the bot", () => {
    expect(findChatbotSelfKnowledgeEntry("아까 너가 앱 데이터 지우라해서 지웠는데 숙제 쓰다만거 다날아감?? 임시저장 해놨었음ㅠ")).toBeNull()
  })

  it("does not answer a tutor's payment-card and receipt question with a plan recommendation", () => {
    const question =
      "개인 과외용 계정을 제 카드로 결제해 왔는데 요금도 학원이 내 주기로 했습니다. 결제 수단만 학원 법인카드로 바꿔도 되는지, 영수증이 학원 명의로 나오는지 궁금합니다."
    expect(findChatbotSelfKnowledgeEntry(question)?.key).not.toBe("tutor_pricing_recommend")
    expect(findChatbotSelfKnowledgeEntry("개인 과외 요금제 추천해 주세요")?.key).toBe("tutor_pricing_recommend")
  })

  it("sends a request to delete personal info already typed into the chat to the deletion guide", () => {
    const question =
      "지난주에 여기서 아이 다시보기 문제를 여쭤보면서 아이 이름이랑 학원 이름, 제 전화번호까지 다 적어 버렸어요. 그 대화 내용이 어디에 남아 있는 건지, 누가 볼 수 있는 건지, 지워 달라고 할 수 있는 건지 알고 싶어요."
    expect(findChatbotSelfKnowledgeEntry(question)).toBeNull()
    expect(findChatbotSelfKnowledgeEntry("여기 대화 기록은 누가 볼 수 있나요?")?.key).toBe("privacy_boundary")
  })

  it("treats an API timezone question as a technical question, not an adoption worry", () => {
    const question =
      "LMS sync 작업 중 확인 요청입니다. ClassIn API response의 수업 시작 시각 field가 timezone offset 없이 내려옵니다. 기관 timezone setting을 따르는 건지 의심하고 있습니다."
    expect(findChatbotSelfKnowledgeEntry(question)?.key).not.toBe("emotional_concern")
    expect(findChatbotSelfKnowledgeEntry("기존 LMS랑 충돌할까 걱정돼요. 도입해도 괜찮을까요?")?.key).toBe("emotional_concern")
  })

  it("does not answer a tutor's trial-student billing question with a plan recommendation", () => {
    const question =
      "개인 과외 계정을 제 카드로 매달 결제해 쓰고 있습니다. 외부 학생에게 무료 체험 수업을 해 줄 계획인데, 체험 수업에 들어온 학생도 요금을 계산하는 학생 수에 포함되는지 궁금합니다."
    expect(findChatbotSelfKnowledgeEntry(question)?.key).not.toBe("tutor_pricing_recommend")
  })
})
