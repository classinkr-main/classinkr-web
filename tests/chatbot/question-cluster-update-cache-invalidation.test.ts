import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { DOC_GAP_BACKLOG_CACHE_TAG } from "@/lib/chatbot/cache-tags"

// updateQuestionCluster (question_clusters 상태 변경/문서 매핑(merge)/회귀 후보 승격 — 어드민이
// 호출하는 유일한 쓰기 경로. app/api/admin/chatbot/questions/[id] 의 PATCH 와
// app/api/admin/chatbot/recommended-questions 의 발행 처리가 공유한다)는 listDocGapBacklog
// 캐시(DOC_GAP_BACKLOG_CACHE_TAG)가 읽는 테이블을 어드민이 직접 큐레이션하는 경로라, 성공 시
// 그 태그를 즉시 무효화해야 다음 조회에서 어드민이 바로 반영된 상태를 본다(2026-09-04). 같은
// 테이블을 훨씬 고빈도로 건드리는 공개 챗봇 응답 저장 경로(upsertQuestionCluster)는 의도적으로
// 무효화하지 않는다 — TTL(60초)에 맡기지 않으면 트래픽마다 캐시가 무의미해진다.
const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  revalidateTag: vi.fn(),
}))

vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: mocks.revalidateTag,
}))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}))

import { updateQuestionCluster } from "@/lib/chatbot/service"

const clusterId = "3f8e8b1c-2c3d-4e5f-8a9b-0c1d2e3f4a5b"

function updateChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}
  chain.eq = vi.fn(() => chain)
  chain.select = vi.fn(() => chain)
  chain.single = vi.fn(() => Promise.resolve(result))
  return chain
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://classin.example.supabase.co")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-publishable-key")
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")
})

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe("updateQuestionCluster cache invalidation", () => {
  it("revalidates the doc gap backlog cache tag after a successful status change", async () => {
    const updated = {
      id: clusterId,
      label: "질문",
      canonical_question: "질문",
      category: "software",
      mapped_article_id: null,
      mapped_chunk_id: null,
      status: "approved",
      first_seen_at: "2026-07-01T00:00:00.000Z",
      last_seen_at: "2026-07-01T00:00:00.000Z",
      sample_questions: ["질문"],
      metadata: null,
      created_at: "2026-07-01T00:00:00.000Z",
      updated_at: "2026-09-04T00:00:00.000Z",
    }
    const chain = updateChain({ data: updated, error: null })
    const update = vi.fn(() => chain)
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({ update })),
    })

    const result = await updateQuestionCluster(clusterId, { status: "approved" })

    expect(result.cluster).toMatchObject({ id: clusterId, status: "approved" })
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: "approved" }))
    expect(mocks.revalidateTag).toHaveBeenCalledWith(DOC_GAP_BACKLOG_CACHE_TAG, "max")
  })

  it("does not revalidate anything when the update fails", async () => {
    const chain = updateChain({ data: null, error: { message: "db down" } })
    const update = vi.fn(() => chain)
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({ update })),
    })

    await expect(updateQuestionCluster(clusterId, { status: "approved" })).rejects.toThrow(
      "db down"
    )
    expect(mocks.revalidateTag).not.toHaveBeenCalled()
  })

  it("does not revalidate the cache tag when there is nothing to patch", async () => {
    // createSupabaseAdminClient() 는 (회귀 후보 패치 분기를 위해) 빈 patch 검사보다 먼저
    // 호출되지만, 그 아래 update()/revalidateTag 에는 도달하지 못하고 여기서 던진다.
    mocks.createSupabaseAdminClient.mockReturnValue({ from: vi.fn() })

    await expect(updateQuestionCluster(clusterId, {})).rejects.toThrow("수정할 필드가 없습니다.")

    expect(mocks.revalidateTag).not.toHaveBeenCalled()
  })
})
