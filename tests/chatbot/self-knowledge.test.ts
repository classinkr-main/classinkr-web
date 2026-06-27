import { describe, expect, it } from "vitest"

import { CHATBOT_SELF_KNOWLEDGE_ENTRIES } from "@/lib/chatbot/self-knowledge"

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
})
