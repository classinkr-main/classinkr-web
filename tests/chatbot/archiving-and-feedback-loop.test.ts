import { afterEach, describe, expect, it, vi } from "vitest"

import { CHATBOT_STATS_CACHE_TAG, DOC_GAP_BACKLOG_CACHE_TAG } from "@/lib/chatbot/cache-tags"

const answerEventId = "11111111-1111-4111-8111-111111111111"
const sessionId = "22222222-2222-4222-8222-222222222222"
const clusterId = "33333333-3333-4333-8333-333333333333"

function stubSupabaseEnv() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://classin.example.supabase.co")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-publishable-key")
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")
  vi.stubEnv("CHATBOT_ANSWER_ROUTER", "legacy")
}

function mockNextCache(revalidateTagSpy = vi.fn()) {
  vi.doMock("next/cache", () => ({
    unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
    revalidateTag: revalidateTagSpy,
  }))
  return revalidateTagSpy
}

describe("chatbot archiving guarantee & negative feedback back-propagation", () => {
  afterEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.doUnmock("@/lib/supabase/admin")
    vi.doUnmock("@/lib/chatbot/channel-handoff")
    vi.doUnmock("next/cache")
    vi.doUnmock("next/server")
  })

  it("defers persistExchange into next/server after() and awaits sideEffects before resolving", async () => {
    stubSupabaseEnv()
    mockNextCache()

    const afterCallbacks: Array<() => Promise<void> | void> = []
    vi.doMock("next/server", async () => {
      const actual = await vi.importActual<typeof import("next/server")>("next/server")
      return {
        ...actual,
        after: vi.fn((cb: () => Promise<void> | void) => {
          afterCallbacks.push(cb)
        }),
      }
    })

    let resolveClusterInsert!: () => void
    const clusterInsertGate = new Promise<void>((resolve) => {
      resolveClusterInsert = resolve
    })
    let clusterSideEffectSettled = false

    const from = vi.fn((table: string) => {
      if (table === "chat_sessions") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id: sessionId, anonymous_id: "anon-1" }, error: null }),
            }),
          }),
          insert: () => ({
            select: () => ({ single: async () => ({ data: { id: sessionId }, error: null }) }),
          }),
        }
      }
      if (table === "chat_messages") {
        return {
          insert: () => ({ select: () => ({ single: async () => ({ data: { id: "msg-1" }, error: null }) }) }),
        }
      }
      if (table === "chatbot_answer_events") {
        return {
          insert: () => ({ select: () => ({ single: async () => ({ data: { id: answerEventId }, error: null }) }) }),
        }
      }
      if (table === "question_clusters") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
          insert: () => ({
            select: () => ({
              single: async () => {
                await clusterInsertGate
                clusterSideEffectSettled = true
                return { data: { id: clusterId }, error: null }
              },
            }),
          }),
        }
      }
      if (table === "question_cluster_events" || table === "docs_search_events" || table === "chatbot_answer_citations") {
        return {
          insert: async () => ({ error: null }),
        }
      }
      throw new Error(`unexpected table: ${table}`)
    })

    vi.doMock("@/lib/supabase/admin", () => ({
      createSupabaseAdminClient: vi.fn(() => ({ from })),
    }))
    vi.doMock("@/lib/chatbot/channel-handoff", () => ({
      maybeCreateChannelTalkHandoff: vi.fn().mockResolvedValue(undefined),
      maybeCreateChannelTalkFeedbackHandoff: vi.fn().mockResolvedValue(undefined),
    }))

    const { handleChatbotQuery } = await import("@/lib/chatbot/service")
    const response = await handleChatbotQuery({
      message: "상담원 연결해 주세요",
      sessionId,
      anonymousId: "anon-1",
    })

    expect(response.answer).toBeTruthy()
    expect(afterCallbacks.length).toBeGreaterThanOrEqual(1)

    // after() 콜백이 부수효과(upsertQuestionCluster)가 끝날 때까지 resolve 되지 않아야 한다.
    let outerResolved = false
    const afterPromise = Promise.resolve(afterCallbacks[0]!()).then(() => {
      outerResolved = true
    })

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(clusterSideEffectSettled).toBe(false)
    expect(outerResolved).toBe(false)

    resolveClusterInsert()
    await afterPromise
    expect(clusterSideEffectSettled).toBe(true)
    expect(outerResolved).toBe(true)
  })

  it("canonicalizes trailing punctuation variants when upserting question_clusters", async () => {
    stubSupabaseEnv()
    mockNextCache()

    const lookupQueries: unknown[] = []
    const updatedPatches: Record<string, unknown>[] = []
    const fakeSupabase = {
      from(table: string) {
        if (table === "question_cluster_events") {
          return { insert: async () => ({ error: null }) }
        }
        return {
          select: () => ({
            eq: (_col: string, val: unknown) => {
              lookupQueries.push(val)
              return {
                maybeSingle: async () => ({
                  data: {
                    id: clusterId,
                    sample_questions: ["ClassIn 가격이 얼마인가요?"],
                    metadata: { source: "chatbot_mvp_exact_match" },
                  },
                  error: null,
                }),
              }
            },
          }),
          update: (patch: Record<string, unknown>) => {
            updatedPatches.push(patch)
            const builder = {
              eq: () => builder,
              select: async () => ({ data: [{ id: clusterId }], error: null }),
            }
            return builder
          },
        }
      },
    }

    const { upsertQuestionCluster } = await import("@/lib/chatbot/service")
    await upsertQuestionCluster(
      fakeSupabase as never,
      answerEventId,
      { redacted: "ClassIn   가격이 얼마인가요??!" },
      null,
      "pricing"
    )

    expect(lookupQueries).toEqual(["ClassIn 가격이 얼마인가요"])
    expect(updatedPatches[0]?.sample_questions).toEqual([
      "ClassIn   가격이 얼마인가요??!",
      "ClassIn 가격이 얼마인가요?",
    ])
  })

  it("increments notHelpfulCount, flags regressionCandidate at threshold 2, and respects manual disable", async () => {
    stubSupabaseEnv()
    const revalidateTagSpy = mockNextCache()

    let currentClusterMetadata: Record<string, unknown> = {
      source: "chatbot_mvp_exact_match",
    }

    const from = vi.fn((table: string) => {
      if (table === "chatbot_answer_events") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: answerEventId,
                    normalized_question: "화면 공유가 안 돼요",
                    detected_category: "software",
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }
      }
      if (table === "chatbot_feedback") {
        return { insert: async () => ({ error: null }) }
      }
      if (table === "question_cluster_events") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { cluster_id: clusterId }, error: null }),
            }),
          }),
        }
      }
      if (table === "question_clusters") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: clusterId,
                  category: "software",
                  metadata: currentClusterMetadata,
                },
                error: null,
              }),
            }),
          }),
          update: (patch: { metadata: Record<string, unknown> }) => ({
            eq: async () => {
              currentClusterMetadata = patch.metadata
              return { error: null }
            },
          }),
        }
      }
      throw new Error(`unexpected table: ${table}`)
    })

    vi.doMock("@/lib/supabase/admin", () => ({
      createSupabaseAdminClient: vi.fn(() => ({ from })),
    }))
    vi.doMock("@/lib/chatbot/channel-handoff", () => ({
      maybeCreateChannelTalkFeedbackHandoff: vi.fn().mockResolvedValue(undefined),
      maybeCreateChannelTalkHandoff: vi.fn(),
    }))

    const { saveChatbotFeedback } = await import("@/lib/chatbot/service")

    // 1차 부정 피드백: notHelpfulCount=1 기록, 회귀 후보 자동 승격 전
    await saveChatbotFeedback({ answerEventId, sessionId, rating: "not_helpful" })
    expect(currentClusterMetadata.notHelpfulCount).toBe(1)
    expect(currentClusterMetadata.regressionCandidate).toBeUndefined()
    expect(revalidateTagSpy).toHaveBeenCalledWith(CHATBOT_STATS_CACHE_TAG, "max")
    expect(revalidateTagSpy).toHaveBeenCalledWith(DOC_GAP_BACKLOG_CACHE_TAG, "max")

    // 2차 부정 피드백: notHelpfulCount=2 도달 -> 회귀 후보 자동 승격
    await saveChatbotFeedback({ answerEventId, sessionId, rating: "not_helpful" })
    expect(currentClusterMetadata.notHelpfulCount).toBe(2)
    expect(currentClusterMetadata.regressionCandidate).toMatchObject({
      enabled: true,
      expectedCategory: "software",
      reason: "negative_feedback",
    })

    // 어드민이 명시적으로 비활성화(enabled: false)한 경우 다음 부정 피드백에도 다시 켜지 않는다.
    currentClusterMetadata = {
      ...currentClusterMetadata,
      regressionCandidate: { enabled: false, disabledAt: "2026-11-23T00:00:00.000Z" },
    }
    await saveChatbotFeedback({ answerEventId, sessionId, rating: "not_helpful" })
    expect(currentClusterMetadata.notHelpfulCount).toBe(3)
    expect(currentClusterMetadata.regressionCandidate).toMatchObject({ enabled: false })
  })
})
