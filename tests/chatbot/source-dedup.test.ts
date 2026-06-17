import { describe, expect, it } from "vitest"

import { selectDiverseSources, type ChatbotSource } from "@/lib/chatbot/service"

function source(partial: Partial<ChatbotSource> & { title: string; urlPath: string; score: number }): ChatbotSource {
  return {
    category: "billing",
    excerpt: "…",
    ...partial,
  }
}

describe("selectDiverseSources topic de-duplication", () => {
  it("keeps only the higher-scoring source when two different docs cover the same topic", () => {
    // 채널 동기화본 ↔ 기존 큐레이션본이 같은 주제를 다루는 실제 상황
    const channel = source({
      title: "유료 계정 전환",
      urlPath: "/docs/admin/channel-talk-document-74365",
      chunkId: "chan-1",
      score: 7,
    })
    const seeded = source({
      title: "유료 계정 전환",
      urlPath: "/docs/billing/billing-upgrade",
      chunkId: "seed-1",
      score: 9,
    })

    const selected = selectDiverseSources([channel, seeded])
    const upgrade = selected.filter((s) => s.title === "유료 계정 전환")

    expect(upgrade).toHaveLength(1)
    expect(upgrade[0]?.urlPath).toBe("/docs/billing/billing-upgrade") // 더 높은 점수 출처가 주제를 차지
  })

  it("treats titles that differ only by spacing/parentheses as the same topic", () => {
    const a = source({ title: "PC 설치(윈도우, 맥)", urlPath: "/docs/admin/channel-talk-document-73669", chunkId: "a", score: 6 })
    const b = source({ title: "PC 설치 (윈도우, 맥)", urlPath: "/docs/start/pc-install", chunkId: "b", score: 8 })

    const selected = selectDiverseSources([a, b])
    expect(selected).toHaveLength(1)
    expect(selected[0]?.urlPath).toBe("/docs/start/pc-install")
  })

  it("keeps distinct topics (limit permitting)", () => {
    const selected = selectDiverseSources(
      [
        source({ title: "유료 계정 전환", urlPath: "/docs/billing/billing-upgrade", chunkId: "a", score: 9 }),
        source({ title: "회원 가입", urlPath: "/docs/start/signup", chunkId: "b", score: 8 }),
        source({ title: "학생 추가", urlPath: "/docs/start/student-onboarding", chunkId: "c", score: 7 }),
      ],
      5
    )
    expect(selected).toHaveLength(3)
  })

  it("still allows multiple chunks from the same document (same topic, same path)", () => {
    // limit 5, doc당 최대 2 — 같은 문서 두 청크가 주제중복 제거에 걸리지 않아야 한다
    const selected = selectDiverseSources(
      [
        source({ title: "유료 계정 전환", urlPath: "/docs/billing/billing-upgrade", heading: "개요", chunkId: "a", score: 9 }),
        source({ title: "유료 계정 전환", urlPath: "/docs/billing/billing-upgrade", heading: "절차", chunkId: "b", score: 8 }),
      ],
      5,
      2
    )
    expect(selected).toHaveLength(2)
    expect(selected.every((s) => s.urlPath === "/docs/billing/billing-upgrade")).toBe(true)
  })
})
