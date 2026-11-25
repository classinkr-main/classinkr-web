import { readFileSync } from "node:fs"
import { join } from "node:path"
import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const insert = vi.fn()
const from = vi.fn(() => ({ insert }))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({ from })),
}))

import { POST } from "@/app/api/track/event/route"

// 새 대화·복원 이벤트(CX-02). 내부 적재 허용 목록(app/api/track/event)·GA4 키 목록(lib/analytics.ts)·EventNames 를 함께 고쳐야
// 조용히 버려지지 않는다. 질문 글은 싣지 않는다.

function trackRequest(body: unknown) {
  return new NextRequest("https://classin.kr/api/track/event", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://classin.kr", "x-forwarded-for": "chatbot-new-chat-test" },
    body: JSON.stringify(body),
  })
}

describe("챗봇 새 대화·복원 이벤트", () => {
  beforeEach(() => {
    from.mockClear()
    insert.mockReset()
    insert.mockResolvedValue({ error: null })
  })

  it("chatbot_new_chat 을 받고, 허용한 키(구간·여부)만 남긴다 — 질문 글은 버린다", async () => {
    const response = await POST(
      trackRequest({
        event: "chatbot_new_chat",
        page: "/docs",
        params: { event_id: "e1", source: "header", turns: "2-3", had_handoff: true, had_error: false, question: "카메라가 안 켜져요" },
      })
    )
    expect(response.status).toBe(200)
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_name: "chatbot_new_chat",
        params: { event_id: "e1", source: "header", turns: "2-3", had_handoff: true, had_error: false },
      })
    )
  })

  it("chatbot_conversation_restored 를 받는다", async () => {
    const response = await POST(trackRequest({ event: "chatbot_conversation_restored", page: "/", params: { turns: "1", path: "/x" } }))
    expect(response.status).toBe(200)
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ event_name: "chatbot_conversation_restored", params: { turns: "1" } })
    )
  })

  it("EventNames 와 GA4 키 목록에도 있고, 위젯은 질문 글 없이 보낸다", () => {
    const analytics = readFileSync(join(process.cwd(), "lib/analytics.ts"), "utf8")
    expect(analytics).toContain('| "chatbot_new_chat"')
    expect(analytics).toContain('| "chatbot_conversation_restored"')
    for (const key of ["turns", "had_handoff", "had_error"]) expect(analytics).toContain(`"${key}",`)

    const hook = readFileSync(join(process.cwd(), "components/ui/chatbot/useChatbotConversation.ts"), "utf8")
    const newChatCall = hook.slice(hook.indexOf('trackEvent("chatbot_new_chat"'), hook.indexOf("})", hook.indexOf('trackEvent("chatbot_new_chat"')))
    expect(newChatCall).toContain('source: "header"')
    expect(newChatCall).not.toMatch(/content|question|trimmed/)
  })
})
