import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// 계약 4: 추천 질문 등록 + 클러스터 published 를 한 핸들러에서 처리한다 (클라이언트 2단계 호출의
// 부분 실패 제거). 재시도 멱등성: 같은 클러스터로 이미 등록된 추천 질문이 있으면 중복 생성하지 않는다.
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
  insertResult = { data: insertedRow(), error: null },
}: {
  existingRows?: unknown[]
  insertResult?: { data: unknown; error: unknown }
} = {}) {
  const calls: { insertedRow: Record<string, unknown> | null; dedupeQueried: boolean } = {
    insertedRow: null,
    dedupeQueried: false,
  }
  const from = vi.fn(() => ({
    select: () => ({
      eq: (column: string) => {
        calls.dedupeQueried = column === "metadata->>clusterId"
        return { limit: async () => ({ data: existingRows, error: null }) }
      },
    }),
    insert: (row: Record<string, unknown>) => {
      calls.insertedRow = row
      return { select: () => ({ single: async () => insertResult }) }
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
  it("registers the question and publishes the cluster in one handler", async () => {
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
    // 재시도 멱등성을 위해 클러스터 링크를 metadata 에 남긴다.
    expect(calls.insertedRow?.metadata).toMatchObject({ clusterId })
    expect(mocks.updateQuestionCluster).toHaveBeenCalledWith(clusterId, { status: "published" })
  })

  it("reports partial success with 500 when the cluster publish fails after the insert", async () => {
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
    expect(calls.insertedRow).not.toBeNull()
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
    expect(mocks.updateQuestionCluster).toHaveBeenCalledWith(clusterId, { status: "published" })
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
    expect(mocks.updateQuestionCluster).not.toHaveBeenCalled()
  })
})
