import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

// 내부 CS 미해결 신호(폴백 답변·수정요청)를 공개 챗봇과 같은 보강 큐(question_clusters)로
// 흘려보내는 유입 라인을 검증한다. upsertQuestionCluster 는 스파이로 대체하고, PII redaction 은
// 공개 챗봇과 동일한 실제 헬퍼를 그대로 통과시켜 실제 동작을 확인한다.
const mocks = vi.hoisted(() => ({
  upsertQuestionCluster: vi.fn(),
  createSupabaseAdminClient: vi.fn(() => ({ __client: "gap-ingest-test" })),
  requireVerifiedAdminContext: vi.fn(),
  reviewInternalCsMessage: vi.fn(),
  getInternalCsConversation: vi.fn(),
  createInternalCsMessage: vi.fn(),
  buildInternalCsCopilotContext: vi.fn(),
  generateInternalCsAnswer: vi.fn(),
}))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}))

vi.mock("@/lib/chatbot/service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/chatbot/service")>(
    "@/lib/chatbot/service"
  )
  return { ...actual, upsertQuestionCluster: mocks.upsertQuestionCluster }
})

vi.mock("@/lib/admin-auth", () => ({
  CRM_STAFF_ADMIN_API_ROLES: ["SUPER_ADMIN", "ADMIN", "BRANCH"],
  requireVerifiedAdminContext: mocks.requireVerifiedAdminContext,
}))

vi.mock("@/lib/repositories/internal-cs-chat", () => ({
  INTERNAL_CS_REGRESSION_OUTCOMES: ["not_evaluated", "pass", "needs_fix", "promoted", "excluded"],
  isInternalCsChatNotReadyError: vi.fn(() => false),
  reviewInternalCsMessage: mocks.reviewInternalCsMessage,
  getInternalCsConversation: mocks.getInternalCsConversation,
  createInternalCsMessage: mocks.createInternalCsMessage,
  updateInternalCsRegressionOutcome: vi.fn(),
}))

vi.mock("@/lib/internal-cs-chat/context", () => ({
  buildInternalCsCopilotContext: mocks.buildInternalCsCopilotContext,
}))

vi.mock("@/lib/internal-cs-chat/gemini", () => ({
  generateInternalCsAnswer: mocks.generateInternalCsAnswer,
}))

import { ingestInternalCsGap } from "@/lib/internal-cs-chat/gap-ingest"
import { PATCH } from "@/app/api/admin/cs-chat/conversations/[id]/messages/[messageId]/route"
import { POST as generatePost } from "@/app/api/admin/cs-chat/conversations/[id]/generate/route"

async function importRealService() {
  return vi.importActual<typeof import("@/lib/chatbot/service")>("@/lib/chatbot/service")
}

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe("ingestInternalCsGap", () => {
  it("routes a fallback signal into upsertQuestionCluster with the internal_cs_fallback source and one reference", async () => {
    await ingestInternalCsGap({
      question: "녹화가 안 돼요",
      conversationId: "conversation-1",
      messageId: "assistant-1",
      source: "internal_cs_fallback",
    })

    expect(mocks.upsertQuestionCluster).toHaveBeenCalledTimes(1)
    expect(mocks.upsertQuestionCluster).toHaveBeenCalledWith(
      expect.anything(),
      null,
      { redacted: "녹화가 안 돼요" },
      null,
      null,
      {
        source: "internal_cs_fallback",
        internalCsRef: { conversationId: "conversation-1", messageId: "assistant-1" },
      }
    )
  })

  it("redacts phone numbers and emails before storing the canonical question", async () => {
    await ingestInternalCsGap({
      question: "전화  010-1234-5678 메일 test@classin.com 확인 바랍니다",
      conversationId: "conversation-2",
      messageId: "assistant-2",
      source: "internal_cs_review",
    })

    expect(mocks.upsertQuestionCluster).toHaveBeenCalledTimes(1)
    const call = mocks.upsertQuestionCluster.mock.calls[0]
    expect(call[2]).toEqual({ redacted: "전화 [phone] 메일 [email] 확인 바랍니다" })
    expect(call[5]).toMatchObject({ source: "internal_cs_review" })
  })

  it("skips ingestion when the question or identifiers are empty", async () => {
    await ingestInternalCsGap({
      question: "   ",
      conversationId: "conversation-3",
      messageId: "assistant-3",
      source: "internal_cs_fallback",
    })
    await ingestInternalCsGap({
      question: "정상 질문",
      conversationId: "",
      messageId: "assistant-4",
      source: "internal_cs_fallback",
    })

    expect(mocks.upsertQuestionCluster).not.toHaveBeenCalled()
  })

  it("never propagates internal failures — it logs once and resolves", async () => {
    mocks.upsertQuestionCluster.mockRejectedValueOnce(new Error("boom"))
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)

    await expect(
      ingestInternalCsGap({
        question: "실패 케이스",
        conversationId: "conversation-5",
        messageId: "assistant-5",
        source: "internal_cs_fallback",
      })
    ).resolves.toBeUndefined()

    expect(errorSpy).toHaveBeenCalledTimes(1)
  })
})

// upsertQuestionCluster 검증용 가짜 supabase — 읽기/insert/update 결과를 시퀀스로 주입해
// 병합 규칙과 동시성 재시도 경로를 실제 함수로 구동한다.
interface FakeResult {
  data: unknown
  error: unknown
}

function makeSupabase(
  reads: unknown[],
  {
    insertResults = [{ data: { id: "cluster-new" }, error: null }],
    updateResults = null,
  }: {
    insertResults?: FakeResult[]
    updateResults?: FakeResult[] | null
  } = {}
) {
  const calls: {
    updates: { patch: Record<string, unknown>; filters: [string, unknown][] }[]
    insertRows: Record<string, unknown>[]
    events: Record<string, unknown>[]
  } = { updates: [], insertRows: [], events: [] }

  const readQueue = [...reads]
  const insertQueue = [...insertResults]
  const updateQueue = updateResults ? [...updateResults] : null

  const supabase = {
    from(table: string) {
      if (table === "question_cluster_events") {
        return {
          insert: (row: Record<string, unknown>) => {
            calls.events.push(row)
            return Promise.resolve({ error: null })
          },
        }
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: readQueue.length ? readQueue.shift() : null,
              error: null,
            }),
          }),
        }),
        update: (patch: Record<string, unknown>) => {
          const entry = { patch, filters: [] as [string, unknown][] }
          calls.updates.push(entry)
          const builder = {
            eq(column: string, value: unknown) {
              entry.filters.push([column, value])
              return builder
            },
            select: async () =>
              updateQueue
                ? (updateQueue.shift() ?? { data: [{ id: "updated" }], error: null })
                : { data: [{ id: "updated" }], error: null },
          }
          return builder
        },
        insert: (row: Record<string, unknown>) => {
          calls.insertRows.push(row)
          const result = insertQueue.shift() ?? { data: { id: "cluster-new" }, error: null }
          return {
            select: () => ({ single: async () => result }),
          }
        },
      }
    },
  }
  return { supabase, calls }
}

const uniqueViolation = {
  data: null,
  error: {
    code: "23505",
    message: 'duplicate key value violates unique constraint "question_clusters_canonical_question_idx"',
  },
}

// 재유입 시 참조 누적/중복 제거/10개 캡 — 이 병합 규칙은 upsertQuestionCluster 안에 있으므로
// 스파이가 아닌 실제 함수를 가짜 supabase 로 구동해 확인한다. 동시성 하드닝(레이스 시
// 재조회→재병합 재시도 1회)도 같은 방식으로 읽기/쓰기 시퀀스를 주입해 검증한다.
describe("upsertQuestionCluster internal CS reference merge", () => {
  function refs(count: number) {
    return Array.from({ length: count }, (_, index) => ({
      conversationId: `conversation-${index}`,
      messageId: `message-${index}`,
    }))
  }

  it("prepends the newest reference and caps the accumulated list at 10", async () => {
    const service = await importRealService()
    const { supabase, calls } = makeSupabase([
      {
        id: "cluster-1",
        sample_questions: ["기존 질문"],
        metadata: { source: "internal_cs_review", internalCs: refs(10) },
      },
    ])

    await service.upsertQuestionCluster(
      supabase as never,
      null,
      { redacted: "재유입 질문" },
      null,
      null,
      {
        source: "internal_cs_fallback",
        internalCsRef: { conversationId: "conversation-new", messageId: "message-new" },
      }
    )

    expect(calls.updates).toHaveLength(1)
    const metadata = calls.updates[0]?.patch.metadata as {
      source: string
      internalCs: { conversationId: string; messageId: string }[]
    }
    expect(metadata.internalCs).toHaveLength(10)
    expect(metadata.internalCs[0]).toEqual({
      conversationId: "conversation-new",
      messageId: "message-new",
    })
    // 가장 오래된 참조(message-9)는 캡으로 밀려난다.
    expect(metadata.internalCs.some((ref) => ref.messageId === "message-9")).toBe(false)
    // 기존 source 는 보존된다 (최초 유입 경로 표시 유지).
    expect(metadata.source).toBe("internal_cs_review")
    // 기존 status(ignored/published 포함)는 되돌리지 않는다 — 업데이트 패치에 status 없음.
    expect(calls.updates[0]?.patch).not.toHaveProperty("status")
    // metadata 병합(read-modify-write)은 낙관적 가드를 건다 — 읽은 스냅샷 그대로일 때만 커밋.
    const filterColumns = calls.updates[0]?.filters.map(([column]) => column)
    expect(filterColumns).toEqual(["id", "metadata"])
  })

  it("removes a duplicate messageId instead of growing the list", async () => {
    const service = await importRealService()
    const { supabase, calls } = makeSupabase([
      {
        id: "cluster-1",
        sample_questions: [],
        metadata: { internalCs: refs(3) },
      },
    ])

    await service.upsertQuestionCluster(
      supabase as never,
      null,
      { redacted: "중복 재유입" },
      null,
      null,
      {
        source: "internal_cs_review",
        internalCsRef: { conversationId: "conversation-1", messageId: "message-1" },
      }
    )

    const metadata = calls.updates[0]?.patch.metadata as {
      internalCs: { conversationId: string; messageId: string }[]
    }
    expect(metadata.internalCs).toHaveLength(3)
    expect(metadata.internalCs[0]).toEqual({ conversationId: "conversation-1", messageId: "message-1" })
    expect(metadata.internalCs.filter((ref) => ref.messageId === "message-1")).toHaveLength(1)
  })

  it("inserts a new cluster with the internal source and skips the answer-event link when there is no answer event", async () => {
    const service = await importRealService()
    const { supabase, calls } = makeSupabase([null])

    await service.upsertQuestionCluster(
      supabase as never,
      null,
      { redacted: "신규 내부 CS 질문" },
      null,
      null,
      {
        source: "internal_cs_fallback",
        internalCsRef: { conversationId: "conversation-9", messageId: "message-9" },
      }
    )

    expect(calls.insertRows).toHaveLength(1)
    expect(calls.insertRows[0]?.status).toBe("candidate")
    expect(calls.insertRows[0]?.metadata).toEqual({
      source: "internal_cs_fallback",
      internalCs: [{ conversationId: "conversation-9", messageId: "message-9" }],
    })
    expect(calls.events).toHaveLength(0)
  })

  it("keeps the public-chatbot update path single-shot without a metadata guard", async () => {
    const service = await importRealService()
    const { supabase, calls } = makeSupabase([
      { id: "cluster-1", sample_questions: [], metadata: {} },
    ])

    await service.upsertQuestionCluster(
      supabase as never,
      "answer-1",
      { redacted: "공개 챗봇 질문" },
      null,
      "faq"
    )

    // metadata 를 만지지 않는 공개 경로는 가드/재시도 없이 1회 갱신으로 끝난다 (핫패스 유지).
    expect(calls.updates).toHaveLength(1)
    expect(calls.updates[0]?.filters.map(([column]) => column)).toEqual(["id"])
    expect(calls.updates[0]?.patch).not.toHaveProperty("metadata")
    expect(calls.events).toEqual([
      expect.objectContaining({ cluster_id: "cluster-1", answer_event_id: "answer-1" }),
    ])
  })
})

// 동시성 하드닝 (Codex 리뷰 P1-2): 신규 insert 가 canonical_question unique 에 지면 승자 행에
// 재병합하고, metadata 병합의 read-modify-write 가 끼어들기로 무효화되면 재조회 후 1회 재시도한다.
describe("upsertQuestionCluster concurrency hardening", () => {
  const ourRef = { conversationId: "conversation-b", messageId: "message-b" }

  it("re-reads and merges into the winner when a concurrent insert wins the canonical_question race", async () => {
    const service = await importRealService()
    const winner = {
      id: "cluster-winner",
      sample_questions: ["동시 질문"],
      metadata: {
        source: "chatbot_mvp_exact_match",
        internalCs: [{ conversationId: "conversation-a", messageId: "message-a" }],
      },
    }
    const { supabase, calls } = makeSupabase([null, winner], {
      insertResults: [uniqueViolation],
    })
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined)

    await service.upsertQuestionCluster(
      supabase as never,
      "answer-1",
      { redacted: "동시 질문" },
      null,
      null,
      { source: "internal_cs_fallback", internalCsRef: ourRef }
    )

    // insert 는 한 번 지고, 승자 행으로 병합 업데이트가 이어진다 — 신호가 유실되지 않는다.
    expect(calls.insertRows).toHaveLength(1)
    expect(calls.updates).toHaveLength(1)
    const metadata = calls.updates[0]?.patch.metadata as {
      source: string
      internalCs: { messageId: string }[]
    }
    expect(metadata.internalCs.map((ref) => ref.messageId)).toEqual(["message-b", "message-a"])
    expect(metadata.source).toBe("chatbot_mvp_exact_match")
    // answer event 링크도 승자 클러스터로 이어진다.
    expect(calls.events).toEqual([
      expect.objectContaining({ cluster_id: "cluster-winner", answer_event_id: "answer-1" }),
    ])
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it("re-merges against the freshest row when a concurrent metadata write invalidates the guarded update", async () => {
    const service = await importRealService()
    const v1 = {
      id: "cluster-1",
      sample_questions: [],
      metadata: {
        source: "internal_cs_review",
        internalCs: [{ conversationId: "conversation-old", messageId: "message-old" }],
      },
    }
    const v2 = {
      id: "cluster-1",
      sample_questions: [],
      metadata: {
        source: "internal_cs_review",
        internalCs: [{ conversationId: "conversation-race", messageId: "message-race" }],
      },
    }
    const { supabase, calls } = makeSupabase([v1, v2], {
      updateResults: [
        { data: [], error: null },
        { data: [{ id: "cluster-1" }], error: null },
      ],
    })
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined)

    await service.upsertQuestionCluster(
      supabase as never,
      null,
      { redacted: "경합 질문" },
      null,
      null,
      {
        source: "internal_cs_fallback",
        internalCsRef: { conversationId: "conversation-new", messageId: "message-new" },
      }
    )

    expect(calls.updates).toHaveLength(2)
    // 1차 시도의 가드는 병합 이전에 읽은 원본 metadata 스냅샷이어야 한다 (병합 결과가 아니라).
    const guard = calls.updates[0]?.filters.find(([column]) => column === "metadata")
    expect(guard).toBeDefined()
    expect(JSON.parse(String(guard?.[1]))).toEqual({
      source: "internal_cs_review",
      internalCs: [{ conversationId: "conversation-old", messageId: "message-old" }],
    })
    // 2차(최종) 시도는 재조회한 v2 를 기준으로 재병합하고 가드 없이 커밋한다.
    expect(calls.updates[1]?.filters.map(([column]) => column)).toEqual(["id"])
    const merged = calls.updates[1]?.patch.metadata as {
      internalCs: { messageId: string }[]
    }
    expect(merged.internalCs.map((ref) => ref.messageId)).toEqual(["message-new", "message-race"])
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it("stops after one retry and logs a warning when the insert race persists", async () => {
    const service = await importRealService()
    const { supabase, calls } = makeSupabase([null, null], {
      insertResults: [uniqueViolation, uniqueViolation],
    })
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined)

    await expect(
      service.upsertQuestionCluster(
        supabase as never,
        "answer-1",
        { redacted: "끝나지 않는 경합" },
        null,
        null,
        { source: "internal_cs_fallback", internalCsRef: ourRef }
      )
    ).resolves.toBeUndefined()

    // 재시도는 1회로 끝난다 — 무한 루프 없이 관측 가능한 경고를 남긴다.
    expect(calls.insertRows).toHaveLength(2)
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(calls.events).toHaveLength(0)
  })
})

// 검토 PATCH 훅 — changes_requested 전이 시 선행 user 질문을 자동 유입, excludeFromGapQueue 시 건너뜀.
describe("message review PATCH gap ingestion hook", () => {
  const conversationId = "conversation-review"
  const assistantMessageId = "assistant-msg-1"

  function reviewedMessage(reviewState: string) {
    return {
      id: assistantMessageId,
      conversation_id: conversationId,
      role: "assistant",
      review_state: reviewState,
      metadata: { userMessageId: "user-msg-1" },
    }
  }

  function conversationWithQuestion() {
    return {
      conversation: { id: conversationId, tags: [] },
      messages: [
        {
          id: "user-msg-1",
          role: "user",
          content: "학원 결제 연동 되나요",
          created_at: "2026-07-16T00:00:00.000Z",
        },
        {
          id: assistantMessageId,
          role: "assistant",
          content: "검토 전 초안",
          created_at: "2026-07-16T00:00:01.000Z",
        },
      ],
      assets: [],
      integrationEvents: [],
    }
  }

  function patchRequest(body: Record<string, unknown>) {
    return new NextRequest(
      `https://classin.kr/api/admin/cs-chat/conversations/${conversationId}/messages/${assistantMessageId}`,
      { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
    )
  }

  function routeContext() {
    return { params: Promise.resolve({ id: conversationId, messageId: assistantMessageId }) }
  }

  async function runPatch(body: Record<string, unknown>, options: { lookupFails?: boolean } = {}) {
    mocks.requireVerifiedAdminContext.mockResolvedValue({
      role: "ADMIN",
      name: "CS 담당자",
      userId: "cs-1",
    })
    if (options.lookupFails) {
      mocks.getInternalCsConversation.mockRejectedValue(new Error("lookup failed"))
    } else {
      mocks.getInternalCsConversation.mockResolvedValue(conversationWithQuestion())
    }
    return PATCH(patchRequest(body), routeContext())
  }

  it("ingests the preceding user question as an internal_cs_review gap on changes_requested", async () => {
    mocks.reviewInternalCsMessage.mockResolvedValue(reviewedMessage("changes_requested"))

    const response = await runPatch({ decision: "changes_requested", reviewNote: "표현 수정" })
    expect(response.status).toBe(200)

    expect(mocks.upsertQuestionCluster).toHaveBeenCalledTimes(1)
    const call = mocks.upsertQuestionCluster.mock.calls[0]
    expect(call[2]).toEqual({ redacted: "학원 결제 연동 되나요" })
    expect(call[5]).toEqual({
      source: "internal_cs_review",
      internalCsRef: { conversationId, messageId: assistantMessageId },
    })
  })

  it("skips ingestion when excludeFromGapQueue is true", async () => {
    mocks.reviewInternalCsMessage.mockResolvedValue(reviewedMessage("changes_requested"))

    const response = await runPatch({ decision: "changes_requested", excludeFromGapQueue: true })
    expect(response.status).toBe(200)

    expect(mocks.upsertQuestionCluster).not.toHaveBeenCalled()
    expect(mocks.getInternalCsConversation).not.toHaveBeenCalled()
  })

  it("does not ingest when the decision is not changes_requested", async () => {
    mocks.reviewInternalCsMessage.mockResolvedValue(reviewedMessage("approved"))

    const response = await runPatch({ decision: "approved" })
    expect(response.status).toBe(200)

    expect(mocks.upsertQuestionCluster).not.toHaveBeenCalled()
  })

  it("keeps the review response successful when the conversation lookup for ingestion fails", async () => {
    mocks.reviewInternalCsMessage.mockResolvedValue(reviewedMessage("changes_requested"))
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)

    const response = await runPatch({ decision: "changes_requested" }, { lookupFails: true })

    expect(response.status).toBe(200)
    expect(mocks.upsertQuestionCluster).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })

  it("rejects a non-boolean excludeFromGapQueue", async () => {
    const response = await runPatch({ decision: "changes_requested", excludeFromGapQueue: "yes" })

    expect(response.status).toBe(400)
    expect(mocks.reviewInternalCsMessage).not.toHaveBeenCalled()
  })
})

// 생성 라우트 훅 — 모델이 전부 실패해 deterministic 폴백이 저장되면 그 질문은 지식 공백 신호다.
describe("generate route fallback gap ingestion hook", () => {
  const guardrails = [
    "cs_owner_review_required",
    "internal_only_until_approved",
    "unverified_claims_must_be_labeled",
  ]

  function generation(origin: "model" | "deterministic") {
    return {
      answer: origin === "deterministic" ? "AI 초안을 생성하지 못했습니다." : "모델 답변",
      mode: "fast",
      model: origin === "deterministic" ? null : "gemini-3.5-flash",
      origin,
      fallbackUsed: origin === "deterministic",
      attemptedModels: ["gemini-3.5-flash"],
      citations: [],
      reviewState: "pending",
      guardrails,
    }
  }

  function generateRequest(question: string) {
    return new NextRequest(
      "https://classin.kr/api/admin/cs-chat/conversations/conversation-1/generate",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question }),
      }
    )
  }

  function setDefaults(origin: "model" | "deterministic") {
    mocks.requireVerifiedAdminContext.mockResolvedValue({
      role: "ADMIN",
      name: "CS 담당자",
      userId: "cs-1",
    })
    mocks.getInternalCsConversation.mockResolvedValue({
      conversation: {
        id: "conversation-1",
        title: "폴백 대화",
        status: "active",
        priority: "normal",
        tags: [],
      },
      messages: [],
      assets: [],
      integrationEvents: [],
    })
    mocks.buildInternalCsCopilotContext.mockResolvedValue({
      internalContext: "내부 근거",
      sourceRefs: [],
      deterministicFallback: "확인된 자료만으로 답변해 주세요.",
      publicEvidence: { answer: null, sources: [] },
      curatedEvidence: null,
    })
    mocks.generateInternalCsAnswer.mockResolvedValue(generation(origin))
    mocks.createInternalCsMessage
      .mockReset()
      .mockResolvedValueOnce({ id: "user-message-1", role: "user" })
      .mockResolvedValueOnce({ id: "assistant-message-1", role: "assistant" })
  }

  it("ingests the question as internal_cs_fallback when the saved answer is the deterministic fallback", async () => {
    setDefaults("deterministic")

    const response = await generatePost(generateRequest("전자칠판 견적 기준을 알려줘"), {
      params: Promise.resolve({ id: "conversation-1" }),
    })

    expect(response.status).toBe(201)
    expect(mocks.upsertQuestionCluster).toHaveBeenCalledTimes(1)
    expect(mocks.upsertQuestionCluster).toHaveBeenCalledWith(
      expect.anything(),
      null,
      { redacted: "전자칠판 견적 기준을 알려줘" },
      null,
      null,
      {
        source: "internal_cs_fallback",
        internalCsRef: { conversationId: "conversation-1", messageId: "assistant-message-1" },
      }
    )
  })

  it("does not ingest when a model answered", async () => {
    setDefaults("model")

    const response = await generatePost(generateRequest("전자칠판 견적 기준을 알려줘"), {
      params: Promise.resolve({ id: "conversation-1" }),
    })

    expect(response.status).toBe(201)
    expect(mocks.upsertQuestionCluster).not.toHaveBeenCalled()
  })
})
