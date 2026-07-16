import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// 계약 4: 추천 질문 등록 + 클러스터 published 를 한 핸들러에서 처리한다 (클라이언트 2단계 호출의
// 부분 실패 제거). 멱등성: 같은 클러스터의 추천 질문은 cluster_id unique 인덱스가 DB 수준에서
// 보증한다 — SELECT-then-INSERT 가 아니라 ON CONFLICT DO NOTHING upsert 로 동시 발행을 흡수한다.
const mocks = vi.hoisted(() => ({
  verifyAdmin: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  updateQuestionCluster: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({
  verifyAdmin: mocks.verifyAdmin,
}))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}))

vi.mock("@/lib/chatbot/service", () => ({
  updateQuestionCluster: mocks.updateQuestionCluster,
}))

import { POST } from "@/app/api/admin/chatbot/recommended-questions/route"

const clusterId = "3f8e8b1c-2c3d-4e5f-8a9b-0c1d2e3f4a5b"

function insertedRow(metadata: Record<string, unknown> = { clusterId }) {
  return {
    id: "recommended-1",
    label: "녹화 방법",
    prompt: "수업 녹화는 어떻게 하나요?",
    placement: "starter",
    status: "draft",
    order_index: 100,
    category: null,
    mapped_article_id: null,
    metadata,
    created_at: "2026-07-16T00:00:00.000Z",
    updated_at: "2026-07-16T00:00:00.000Z",
  }
}

function makeSupabase({
  existingRows = [],
  winnerRows = [],
  insertResult = { data: insertedRow(), error: null },
  upsertResult = { data: insertedRow(), error: null },
}: {
  existingRows?: unknown[]
  winnerRows?: unknown[]
  insertResult?: { data: unknown; error: unknown }
  upsertResult?: { data: unknown; error: unknown }
} = {}) {
  const calls: {
    insertedRow: Record<string, unknown> | null
    upsertedRow: Record<string, unknown> | null
    upsertOptions: Record<string, unknown> | null
    dedupeQueried: boolean
    winnerQueried: boolean
  } = {
    insertedRow: null,
    upsertedRow: null,
    upsertOptions: null,
    dedupeQueried: false,
    winnerQueried: false,
  }
  const from = vi.fn(() => ({
    select: () => ({
      eq: (column: string) => {
        if (column === "cluster_id") {
          calls.winnerQueried = true
          return { limit: async () => ({ data: winnerRows, error: null }) }
        }
        calls.dedupeQueried = column === "metadata->>clusterId"
        return { limit: async () => ({ data: existingRows, error: null }) }
      },
    }),
    insert: (row: Record<string, unknown>) => {
      calls.insertedRow = row
      return { select: () => ({ single: async () => insertResult }) }
    },
    upsert: (row: Record<string, unknown>, options: Record<string, unknown>) => {
      calls.upsertedRow = row
      calls.upsertOptions = options
      return { select: () => ({ maybeSingle: async () => upsertResult }) }
    },
  }))
  mocks.createSupabaseAdminClient.mockReturnValue({ from })
  return { calls, from }
}

function postRequest(body: Record<string, unknown>) {
  return new NextRequest("https://classin.kr/api/admin/chatbot/recommended-questions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://classin.example.supabase.co")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-publishable-key")
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")
  mocks.verifyAdmin.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe("POST /api/admin/chatbot/recommended-questions with clusterId", () => {
  it("registers the question atomically via a cluster_id upsert and publishes the cluster", async () => {
    const { calls } = makeSupabase()
    mocks.updateQuestionCluster.mockResolvedValue({ cluster: { id: clusterId, status: "published" } })

    const response = await POST(
      postRequest({ label: "녹화 방법", prompt: "수업 녹화는 어떻게 하나요?", clusterId })
    )
    const json = await response.json()

    expect(response.status).toBe(201)
    expect(json).toMatchObject({
      id: "recommended-1",
      label: "녹화 방법",
      recommended: true,
      clusterUpdated: true,
    })
    // 동시 발행 멱등은 DB unique 인덱스에 맡긴다 — insert 가 아니라 ON CONFLICT upsert.
    expect(calls.insertedRow).toBeNull()
    expect(calls.upsertedRow?.cluster_id).toBe(clusterId)
    expect(calls.upsertedRow?.metadata).toMatchObject({ clusterId })
    expect(calls.upsertOptions).toEqual({ onConflict: "cluster_id", ignoreDuplicates: true })
    expect(mocks.updateQuestionCluster).toHaveBeenCalledWith(clusterId, { status: "published" })
  })

  it("reports partial success with 500 when the cluster publish fails after the upsert", async () => {
    const { calls } = makeSupabase()
    mocks.updateQuestionCluster.mockRejectedValue(new Error("cluster update down"))
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)

    const response = await POST(
      postRequest({ label: "녹화 방법", prompt: "수업 녹화는 어떻게 하나요?", clusterId })
    )
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json).toMatchObject({ recommended: true, clusterUpdated: false })
    expect(json.question).toMatchObject({ id: "recommended-1" })
    expect(json.error).toContain("클러스터")
    expect(calls.upsertedRow).not.toBeNull()
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })

  it("reuses an existing recommended question for the cluster instead of inserting a duplicate", async () => {
    const { calls } = makeSupabase({ existingRows: [insertedRow()] })
    mocks.updateQuestionCluster.mockResolvedValue({ cluster: { id: clusterId, status: "published" } })

    const response = await POST(
      postRequest({ label: "녹화 방법", prompt: "수업 녹화는 어떻게 하나요?", clusterId })
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toMatchObject({ id: "recommended-1", recommended: true, clusterUpdated: true })
    expect(calls.dedupeQueried).toBe(true)
    expect(calls.insertedRow).toBeNull()
    expect(calls.upsertedRow).toBeNull()
    expect(mocks.updateQuestionCluster).toHaveBeenCalledWith(clusterId, { status: "published" })
  })

  it("reuses the concurrent winner row when the upsert hits the cluster_id unique index", async () => {
    // ON CONFLICT DO NOTHING 은 충돌 시 0행을 돌려준다 — 승자 행을 재조회해 선착 우선을 유지한다.
    const { calls } = makeSupabase({
      upsertResult: { data: null, error: null },
      winnerRows: [insertedRow()],
    })
    mocks.updateQuestionCluster.mockResolvedValue({ cluster: { id: clusterId, status: "published" } })

    const response = await POST(
      postRequest({ label: "녹화 방법", prompt: "수업 녹화는 어떻게 하나요?", clusterId })
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toMatchObject({ id: "recommended-1", recommended: true, clusterUpdated: true })
    expect(calls.winnerQueried).toBe(true)
    expect(calls.insertedRow).toBeNull()
    expect(mocks.updateQuestionCluster).toHaveBeenCalledWith(clusterId, { status: "published" })
  })

  it("falls back to the legacy insert with a loud error when the cluster_id migration is missing", async () => {
    const { calls } = makeSupabase({
      upsertResult: {
        data: null,
        error: {
          code: "PGRST204",
          message:
            "Could not find the 'cluster_id' column of 'chatbot_recommended_questions' in the schema cache",
        },
      },
    })
    mocks.updateQuestionCluster.mockResolvedValue({ cluster: { id: clusterId, status: "published" } })
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)

    const response = await POST(
      postRequest({ label: "녹화 방법", prompt: "수업 녹화는 어떻게 하나요?", clusterId })
    )
    const json = await response.json()

    expect(response.status).toBe(201)
    expect(json).toMatchObject({ id: "recommended-1", recommended: true, clusterUpdated: true })
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(String(errorSpy.mock.calls[0]?.[0])).toContain("cluster_id")
    // 폴백 insert 는 마이그레이션 이전 스키마에도 안전해야 한다 — cluster_id 컬럼 미포함.
    expect(calls.insertedRow).not.toBeNull()
    expect(calls.insertedRow).not.toHaveProperty("cluster_id")
    expect(calls.insertedRow?.metadata).toMatchObject({ clusterId })
  })

  it("returns 500 when neither the upsert nor the winner lookup yields a row", async () => {
    makeSupabase({
      upsertResult: { data: null, error: null },
      winnerRows: [],
    })

    const response = await POST(
      postRequest({ label: "녹화 방법", prompt: "수업 녹화는 어떻게 하나요?", clusterId })
    )
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(typeof json.error).toBe("string")
    expect(mocks.updateQuestionCluster).not.toHaveBeenCalled()
  })

  it("rejects an invalid clusterId before inserting anything", async () => {
    const { from } = makeSupabase()

    const response = await POST(
      postRequest({ label: "녹화 방법", prompt: "수업 녹화는 어떻게 하나요?", clusterId: "not-a-uuid" })
    )

    expect(response.status).toBe(400)
    expect(from).not.toHaveBeenCalled()
    expect(mocks.updateQuestionCluster).not.toHaveBeenCalled()
  })

  it("keeps the legacy shape when clusterId is absent", async () => {
    const { calls } = makeSupabase({
      insertResult: { data: insertedRow({}), error: null },
    })

    const response = await POST(
      postRequest({ label: "녹화 방법", prompt: "수업 녹화는 어떻게 하나요?" })
    )
    const json = await response.json()

    expect(response.status).toBe(201)
    expect(json.id).toBe("recommended-1")
    expect(json).not.toHaveProperty("recommended")
    expect(json).not.toHaveProperty("clusterUpdated")
    expect(calls.dedupeQueried).toBe(false)
    expect(calls.upsertedRow).toBeNull()
    // clusterId 없는 일반 등록은 cluster_id 컬럼을 건드리지 않는다.
    expect(calls.insertedRow).not.toHaveProperty("cluster_id")
    expect(mocks.updateQuestionCluster).not.toHaveBeenCalled()
  })
})
