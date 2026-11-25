import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import { streamChatbotQuery, type ChatbotStreamEvent } from "@/lib/chatbot/service"

// 위젯은 meta 없이 닫힌 스트림을 '중간에 끊긴 답'으로 본다(CX-08, useChatbotConversation).
// 그 판단이 맞으려면 서버는 정상 답·폴백·시간 초과 어디서든 늘 meta 로 끝내야 하고(입력 오류만 error), meta 뒤에는 글을 보내지 않는다.

function disableExternalChatbotServices() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
  vi.stubEnv("SUPABASE_SECRET_KEY", "")
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "")
  vi.stubEnv("GEMINI_API_KEY", "")
}

function expectEndsWithMeta(events: Array<{ type: string }>) {
  expect(events.length).toBeGreaterThan(0)
  expect(events.at(-1)?.type).toBe("meta")
  expect(events.filter((event) => event.type === "meta")).toHaveLength(1)
}

describe("스트림은 늘 meta 로 끝난다 (서비스)", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it.each(["녹화본은 어디서 다시 보나요?", "가격이 궁금해요", "상담원 연결해 주세요", "ㅇㅇ"])("%s", async (message) => {
    disableExternalChatbotServices()
    const events: ChatbotStreamEvent[] = []
    await streamChatbotQuery({ message }, {}, (event) => events.push(event))
    expectEndsWithMeta(events)
  })
})

describe("스트림은 늘 meta 로 끝난다 (라우트)", () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.resetModules()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.doUnmock("@/lib/chatbot/service")
  })

  function request(ip: string) {
    return new NextRequest("https://classin.kr/api/chatbot/query/stream", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ message: "녹화본은 어디서 다시 보나요?" }),
    })
  }

  async function readEvents(response: Response) {
    const text = await response.text()
    return text
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { type: string })
  }

  it("서비스가 meta 없이 끝나도(예상 밖) 라우트가 meta 를 덧대지 않으므로, 서비스 계약을 위 시험이 지킨다", async () => {
    // 이 시험은 위젯 판단의 전제를 문서로 남긴다: 라우트는 서비스가 보낸 이벤트를 그대로 흘린다.
    vi.doMock("@/lib/chatbot/service", () => ({
      ChatbotInputError: class extends Error {},
      validateChatbotQueryInput: vi.fn(),
      streamChatbotQuery: vi.fn(async (_body: unknown, _meta: unknown, emit: (event: ChatbotStreamEvent) => void) => {
        emit({ type: "delta", text: "ClassIn 요금은 " })
        emit({ type: "delta", text: "플랜에 따라" })
      }),
    }))
    const { POST } = await import("@/app/api/chatbot/query/stream/route")
    const events = await readEvents(await POST(request("meta-contract-passthrough")))
    expect(events.map((event) => event.type)).toEqual(["delta", "delta"])
  })

  it("서비스가 실패하면 결정형 답과 meta 로 끝낸다", async () => {
    vi.doMock("@/lib/chatbot/service", () => ({
      ChatbotInputError: class extends Error {},
      validateChatbotQueryInput: vi.fn(),
      streamChatbotQuery: vi.fn().mockRejectedValue(new Error("boom")),
    }))
    const { POST } = await import("@/app/api/chatbot/query/stream/route")
    expectEndsWithMeta(await readEvents(await POST(request("meta-contract-failure"))))
  })
})
