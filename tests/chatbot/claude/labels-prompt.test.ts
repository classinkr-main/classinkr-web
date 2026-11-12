import { describe, expect, it } from "vitest"
import { maxTemperature, parseChatbotSessionLabel, scrubRationale } from "@/lib/chatbot/claude/labels"
import { buildSalesSteeringHint, CLAUDE_CHATBOT_PROMPT_LINES } from "@/lib/chatbot/claude/prompt"

describe("parseChatbotSessionLabel — 스키마 정규화", () => {
  it("코드펜스·별칭을 정규화한다(cool→cold, neutral→warm, 학원→academy, high→0.85)", () => {
    const label = parseChatbotSessionLabel('```json\n{"intent":"pricing","segment":"학원","stage":"consideration","temperature":"cool","handoff":"none","confidence":"high","rationale":"요금 질문"}\n```')
    expect(label).toEqual({
      intent: "pricing",
      segment: "academy",
      stage: "consider",
      temperature: "cold",
      handoff: "none",
      confidence: 0.85,
      rationale: "요금 질문",
    })
    expect(parseChatbotSessionLabel('{"temperature":"neutral","segment":"individual_tutor"}')).toMatchObject({ temperature: "warm", segment: "tutor", intent: "other" })
  })

  it("모르는 값은 unknown/other, JSON 이 아니면 null", () => {
    expect(parseChatbotSessionLabel('{"segment":"hospital","stage":"x","handoff":"maybe"}')).toMatchObject({ segment: "unknown", stage: "unknown", handoff: "none" })
    expect(parseChatbotSessionLabel("label: hot")).toBeNull()
  })

  it("rationale 의 연락처·이메일을 지운다", () => {
    expect(scrubRationale("010-1234-5678 / a@b.co 로 연락 요청")).toBe("[연락처] / [이메일] 로 연락 요청")
  })

  it("세션 최고 온도 유지", () => {
    expect(maxTemperature("hot", "warm")).toBe("hot")
    expect(maxTemperature("cold", "warm")).toBe("warm")
    expect(maxTemperature(null, "cold")).toBe("cold")
  })
})

describe("Claude 시스템 프롬프트 — 초안 페이지 문구", () => {
  const prompt = CLAUDE_CHATBOT_PROMPT_LINES.join("\n")
  it("대화 속 접수·동의 대행을 금지하고 상담 버튼으로 돌린다", () => {
    expect(prompt).toMatch(/\[도입 상담 남기기\]/)
    expect(prompt).toMatch(/이 대화에서는 신청을 접수하지 않는다/)
    expect(prompt).toMatch(/동의를 대신 받거나 받았다고 말하지 않는다/)
    expect(prompt).not.toMatch(/\[LEAD_SUBMIT:name=/)
  })
})

describe("buildSalesSteeringHint — 영업·데모 핸드오프 스티어링", () => {
  it("명시적 데모 요청 → 상담 버튼 안내, 연락처 묻지 않음", () => {
    const hint = buildSalesSteeringHint({ category: "consultation", intent: "sales_consulting", handoffIntent: "demo", question: "데모 받아보고 싶어요" })
    expect(hint).toMatch(/\[도입 상담 남기기\]/)
    expect(hint).toMatch(/연락처는 묻지 않는다/)
  })
  it("요금만 → 연락처 요구 금지", () => {
    expect(buildSalesSteeringHint({ category: "billing", handoffIntent: "demo", question: "1인 과외 요금 얼마예요?" })).toMatch(/연락처를 요구하지 않는다/)
  })
  it("지원 문의 → 채널톡, 영업 권유 금지", () => {
    expect(buildSalesSteeringHint({ category: "troubleshooting", handoffIntent: "support", question: "수업 중 카메라가 안 보여요" })).toMatch(/영업 상담·데모는 권하지 않는다/)
  })
  it("일반 질문 → 원할 때만", () => {
    expect(buildSalesSteeringHint({ category: "general", question: "줌이랑 뭐가 달라요?" })).toMatch(/원할 때만/)
  })
})
