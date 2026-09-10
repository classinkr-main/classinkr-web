import { afterEach, describe, expect, it, vi } from "vitest"

// 계약 1·2: question_clusters.metadata.source / metadata.internalCs 가 보강 큐 응답(gapClusters)까지
// 통과해야 UI(소스 배지·필터·대화 딥링크)가 그릴 수 있다.
const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
}))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}))

// listDocGapBacklog 가 60초 unstable_cache 로 감싸여서(2026-09-04) 실제 next/cache 를 그대로
// 통과시키면 Next 런타임 밖(vitest)에서 "incrementalCache missing" Invariant 로 죽는다 —
// 계산은 그대로 실행하되 캐시 자체는 통과시키는 스텁으로 대체한다.
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}))

import { listDocGapBacklog } from "@/lib/chatbot/doc-gaps"

function chain(result: { data: unknown; error: unknown }) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {}
  for (const method of ["select", "is", "in", "order", "eq", "not"]) {
    query[method] = vi.fn(() => query)
  }
  query.limit = vi.fn(() => Promise.resolve(result))
  return query
}

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe("listDocGapBacklog cluster metadata pass-through", () => {
  it("exposes source and internalCs references on gap clusters", async () => {
    const gapChain = chain({
      data: [
        {
          id: "cluster-internal",
          label: "내부 CS 질문",
          canonical_question: "내부 CS 질문",
          category: "software",
          status: "candidate",
          last_seen_at: "2026-07-16T00:00:00.000Z",
          sample_questions: ["내부 CS 질문"],
          metadata: {
            source: "internal_cs_fallback",
            internalCs: [
              { conversationId: "conversation-1", messageId: "message-1" },
              { broken: true },
            ],
          },
        },
        {
          id: "cluster-legacy",
          label: "기존 챗봇 질문",
          canonical_question: "기존 챗봇 질문",
          category: null,
          status: "candidate",
          last_seen_at: "2026-07-15T00:00:00.000Z",
          sample_questions: [],
          metadata: null,
        },
      ],
      error: null,
    })
    const eventsChain = chain({ data: [], error: null })
    const mappedChain = chain({ data: [], error: null })
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi
        .fn()
        .mockReturnValueOnce(gapChain)
        .mockReturnValueOnce(eventsChain)
        .mockReturnValueOnce(mappedChain),
    })

    const backlog = await listDocGapBacklog()

    expect(backlog.warning).toBeUndefined()
    expect(backlog.gapClusters[0]).toMatchObject({
      id: "cluster-internal",
      metadata: {
        source: "internal_cs_fallback",
        internalCs: [{ conversationId: "conversation-1", messageId: "message-1" }],
      },
    })
    // 기존 데이터(metadata 없음)는 필드 자체가 생략된다 — 옵셔널 호환.
    expect(backlog.gapClusters[1].metadata).toBeUndefined()
    // select 가 metadata 컬럼을 포함해야 위 값이 채워질 수 있다.
    expect(gapChain.select).toHaveBeenCalledWith(expect.stringContaining("metadata"))
  })
})
