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
})
