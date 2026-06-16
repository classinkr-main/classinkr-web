"use client"

import { useEffect } from "react"

import { openChannelTalk } from "@/lib/channel-talk"

const TEST_MESSAGE =
  "[갈매봇 테스트] 영수증/세금계산서 발행 가능한가요? 담당자 상담 받고 싶어요."
const TEST_MEMBER_ID = "classin:web:galmaebot-widget-test"
const TEST_SESSION_ID = "widget-test"

export default function ChannelTalkTestPage() {
  useEffect(() => {
    const opened = openChannelTalk({
      memberId: TEST_MEMBER_ID,
      profile: {
        name: "갈매봇 테스트",
        chatbotHandoff: true,
        chatbotSessionId: TEST_SESSION_ID,
        chatbotCategory: "billing",
        chatbotIntent: "billing_support",
        chatbotHandoffIntent: "support",
        lastQuestion: TEST_MESSAGE,
        lastPage: window.location.href,
      },
    })

    if (!opened) return

    const timer = window.setTimeout(() => {
      window.ChannelIO?.("openChat", undefined, TEST_MESSAGE)
    }, 2500)

    return () => window.clearTimeout(timer)
  }, [])

  return (
    <main className="min-h-screen bg-white p-8 text-[#111110]">
      <h1 className="text-2xl font-bold">Channel Talk Test</h1>
      <p className="mt-4">name: 갈매봇 테스트</p>
      <p className="mt-2">memberId: {TEST_MEMBER_ID}</p>
      <p className="mt-2">message: {TEST_MESSAGE}</p>
      <button
        type="button"
        className="mt-6 rounded-[8px] bg-[#009060] px-4 py-2 text-sm font-bold text-white"
        onClick={() => window.ChannelIO?.("openChat", undefined, TEST_MESSAGE)}
      >
        Open Chat
      </button>
    </main>
  )
}
