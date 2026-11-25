import { afterEach, describe, expect, it, vi } from "vitest"

import {
  CHATBOT_CONVERSATION_MAX_CONTENT,
  CHATBOT_CONVERSATION_MAX_MESSAGES,
  CHATBOT_CONVERSATION_STORAGE_KEY,
  CHATBOT_CONVERSATION_TTL_MS,
  clearStoredConversation,
  fingerprintAnonymousId,
  loadStoredConversation,
  parseStoredConversation,
  saveStoredConversation,
  serializeConversation,
} from "@/components/ui/chatbot/conversation-storage"
import type { ChatMessage } from "@/components/ui/chatbot/types"
import { installFakeBrowser } from "./helpers/fake-browser-storage"

// 챗봇 대화 복원 저장(CX-02): 탭 저장소 30분, 가린 글, 20개 상한, 깨진 값·막힌 저장소에서 던지지 않기.
// 예시 대화·연락처는 이 시험을 위해 지었다.

const NOW = Date.UTC(2026, 10, 25, 3, 0, 0)

function turn(index: number): ChatMessage[] {
  return [
    { id: `u${index}`, role: "user", content: `질문 ${index}` },
    {
      id: `a${index}`,
      role: "assistant",
      content: `답 ${index}`,
      answerMode: "direct_answer",
      answerEventId: `evt-${index}`,
      sessionId: "session-1",
      suggestedQuestions: [`칩 ${index}`],
      sources: [
        { title: "녹화 가이드", heading: "다시보기", urlPath: "/docs/recording", category: "docs", excerpt: "본문 일부", score: 0.9 },
      ],
    },
  ]
}

const welcome: ChatMessage = { id: "welcome", role: "assistant", content: "안녕하세요!", suggestedQuestions: ["처음 칩"] }

describe("serializeConversation · parseStoredConversation", () => {
  it("환영은 빼고, 사용자 글의 연락처는 가리고, 출처는 제목·소제목·경로만, 칩은 마지막 답만 남긴다", () => {
    const messages: ChatMessage[] = [
      welcome,
      { id: "u1", role: "user", content: "제 번호는 010-2345-6789, 메일은 parent@example.com 이에요" },
      ...turn(2),
      ...turn(3),
    ]
    const raw = serializeConversation({ sessionId: "session-1", sessionOwner: "abcd1234", messages }, NOW)
    expect(raw).not.toBeNull()
    expect(raw).not.toContain("010-2345-6789")
    expect(raw).not.toContain("parent@example.com")
    expect(raw).not.toContain("본문 일부")

    const restored = parseStoredConversation(raw, NOW + 1000)
    expect(restored?.sessionId).toBe("session-1")
    expect(restored?.sessionOwner).toBe("abcd1234")
    expect(restored?.messages.map((message) => message.id)).toEqual(["u1", "u2", "a2", "u3", "a3"])
    expect(restored?.messages[0].content).toBe("제 번호는 [phone], 메일은 [email] 이에요")
    const a2 = restored?.messages.find((message) => message.id === "a2")
    const a3 = restored?.messages.find((message) => message.id === "a3")
    expect(a2?.suggestedQuestions).toEqual([])
    expect(a3?.suggestedQuestions).toEqual(["칩 3"])
    expect(a3).toMatchObject({ answerEventId: "evt-3", sessionId: "session-1", answerMode: "direct_answer" })
    expect(a3?.sources).toEqual([
      { title: "녹화 가이드", heading: "다시보기", urlPath: "/docs/recording", category: "", excerpt: "", score: 0 },
    ])
  })

  it("다시 시도·오류 말풍선·끊긴 부분 답은 남기지 않는다", () => {
    const messages: ChatMessage[] = [
      ...turn(1),
      { id: "u2", role: "user", content: "휴대폰이요" },
      { id: "e2", role: "assistant", content: "지금은 답변을 불러오지 못했어요.", errorKind: "server", retryQuestion: "휴대폰이요" },
      { id: "u3", role: "user", content: "노트북은요" },
      { id: "p3", role: "assistant", content: "노트북은 브라우저", interrupted: true, errorKind: "interrupted", retryQuestion: "노트북은요" },
    ]
    const restored = parseStoredConversation(serializeConversation({ messages }, NOW), NOW)
    expect(restored?.messages.map((message) => message.id)).toEqual(["u1", "a1", "u2", "u3"])
    expect(JSON.stringify(restored)).not.toContain("retryQuestion")
  })

  it("최근 20개, 글은 2000자까지만 남긴다", () => {
    const messages = Array.from({ length: 15 }, (_, index) => turn(index)).flat()
    messages[messages.length - 1] = { ...messages[messages.length - 1], content: "가".repeat(5000) }
    const restored = parseStoredConversation(serializeConversation({ messages }, NOW), NOW)
    expect(restored?.messages).toHaveLength(CHATBOT_CONVERSATION_MAX_MESSAGES)
    expect(restored?.messages[0].id).toBe("u5")
    expect(restored?.messages.at(-1)?.content).toHaveLength(CHATBOT_CONVERSATION_MAX_CONTENT)
  })

  it("고정된 상담 요약도 가린 글로 남긴다", () => {
    const messages: ChatMessage[] = [
      { id: "u1", role: "user", content: "상담원 연결해 주세요" },
      {
        id: "a1",
        role: "assistant",
        content: "담당자에게 이어 드릴게요.",
        answerMode: "handoff",
        showHandoffCTA: true,
        needsHandoff: true,
        handoffIntent: "support",
        handoffSummary: "질문: 김민준 010-2345-6789 카메라가 안 켜져요",
      },
    ]
    const restored = parseStoredConversation(serializeConversation({ messages }, NOW), NOW)
    expect(restored?.messages[1]).toMatchObject({ showHandoffCTA: true, needsHandoff: true, handoffIntent: "support" })
    expect(restored?.messages[1].handoffSummary).toBe("질문: 김민준 [phone] 카메라가 안 켜져요")
  })

  it("마지막 활동 뒤 30분이 지나면 버린다(세션 id 포함)", () => {
    const raw = serializeConversation({ sessionId: "session-1", messages: turn(1) }, NOW)
    expect(parseStoredConversation(raw, NOW + CHATBOT_CONVERSATION_TTL_MS)).not.toBeNull()
    expect(parseStoredConversation(raw, NOW + CHATBOT_CONVERSATION_TTL_MS + 1)).toBeNull()
  })

  it("깨진 JSON·다른 판·꼴이 틀린 값·사용자 질문이 없는 대화는 null", () => {
    expect(parseStoredConversation("{not json", NOW)).toBeNull()
    expect(parseStoredConversation(JSON.stringify({ v: 2, lastActiveAt: NOW, messages: [] }), NOW)).toBeNull()
    expect(parseStoredConversation(JSON.stringify({ v: 1, lastActiveAt: "어제", messages: [] }), NOW)).toBeNull()
    expect(parseStoredConversation(JSON.stringify({ v: 1, lastActiveAt: NOW, messages: "x" }), NOW)).toBeNull()
    expect(parseStoredConversation(JSON.stringify({ v: 1, lastActiveAt: NOW + 60 * 60 * 1000, messages: turn(1) }), NOW)).toBeNull()
    expect(
      parseStoredConversation(
        JSON.stringify({ v: 1, lastActiveAt: NOW, messages: [{ id: "a1", role: "assistant", content: "답", answerMode: "direct_answer" }] }),
        NOW
      )
    ).toBeNull()
    expect(serializeConversation({ messages: [welcome] }, NOW)).toBeNull()
  })

  it("손댄 저장값도 같은 규칙으로 거른다: 역할이 틀린 항목·바깥 주소 출처는 빼고 사용자 글은 다시 가린다", () => {
    const raw = JSON.stringify({
      v: 1,
      lastActiveAt: NOW,
      messages: [
        { id: "x", role: "system", content: "무시" },
        { id: "u1", role: "user", content: "제 번호 010-1111-2222" },
        {
          id: "a1",
          role: "assistant",
          content: "답",
          answerMode: "direct_answer",
          sources: [
            { title: "바깥", urlPath: "https://evil.example/" },
            { title: "두 슬래시", urlPath: "//evil.example/" },
            { title: "안쪽", urlPath: "/docs/a" },
          ],
        },
      ],
    })
    const restored = parseStoredConversation(raw, NOW)
    expect(restored?.messages.map((message) => message.id)).toEqual(["u1", "a1"])
    expect(restored?.messages[0].content).toBe("제 번호 [phone]")
    expect(restored?.messages[1].sources?.map((source) => source.urlPath)).toEqual(["/docs/a"])
  })

  it("식별값 지문은 같은 값이면 같고 원래 값을 담지 않는다", () => {
    const id = "6f1e7d1c-1f7a-4c1e-9a52-0f2f4b1f8a11"
    expect(fingerprintAnonymousId(id)).toBe(fingerprintAnonymousId(id))
    expect(fingerprintAnonymousId(id)).not.toBe(fingerprintAnonymousId(`${id}x`))
    expect(fingerprintAnonymousId(id)).toMatch(/^[0-9a-f]{8}$/)
  })
})

describe("탭 저장소 읽기·쓰기", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("sessionStorage 에만 쓰고 localStorage 는 쓰지 않는다. 만료된 값은 읽을 때 지운다", () => {
    const browser = installFakeBrowser()
    expect(saveStoredConversation({ sessionId: "session-1", messages: turn(1) }, NOW)).toBe(true)
    expect(browser.sessionStorage.getItem(CHATBOT_CONVERSATION_STORAGE_KEY)).toContain("질문 1")
    expect(browser.localStorage.length).toBe(0)

    expect(loadStoredConversation(NOW + 60_000)?.messages).toHaveLength(2)
    expect(loadStoredConversation(NOW + CHATBOT_CONVERSATION_TTL_MS + 1)).toBeNull()
    expect(browser.sessionStorage.getItem(CHATBOT_CONVERSATION_STORAGE_KEY)).toBeNull()
  })

  it("남길 대화가 없으면 키를 지우고, clear 도 지운다", () => {
    const browser = installFakeBrowser()
    saveStoredConversation({ messages: turn(1) }, NOW)
    saveStoredConversation({ messages: [welcome] }, NOW)
    expect(browser.sessionStorage.getItem(CHATBOT_CONVERSATION_STORAGE_KEY)).toBeNull()
    saveStoredConversation({ messages: turn(1) }, NOW)
    clearStoredConversation()
    expect(browser.sessionStorage.getItem(CHATBOT_CONVERSATION_STORAGE_KEY)).toBeNull()
  })

  it("깨진 저장값은 읽을 때 지운다", () => {
    const browser = installFakeBrowser()
    browser.sessionStorage.setItem(CHATBOT_CONVERSATION_STORAGE_KEY, "{broken")
    expect(loadStoredConversation(NOW)).toBeNull()
    expect(browser.sessionStorage.getItem(CHATBOT_CONVERSATION_STORAGE_KEY)).toBeNull()
  })

  it("저장소 접근이 막혀도 던지지 않는다(복원 없이 메모리로만 동작)", () => {
    installFakeBrowser({ blocked: true })
    expect(() => loadStoredConversation(NOW)).not.toThrow()
    expect(loadStoredConversation(NOW)).toBeNull()
    expect(saveStoredConversation({ messages: turn(1) }, NOW)).toBe(false)
    expect(() => clearStoredConversation()).not.toThrow()
  })
})
