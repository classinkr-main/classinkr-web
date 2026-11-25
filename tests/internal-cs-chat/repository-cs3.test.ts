import { afterEach, describe, expect, it, vi } from "vitest"

// R6·R22 저장소 시험: 가짜 Supabase 클라이언트(운영 DB 를 부르지 않는다). 호출 순서와 조건만 본다.
type Call = { table: string; ops: Array<[string, ...unknown[]]> }

const state = vi.hoisted(() => ({
  calls: [] as Array<{ table: string; ops: Array<[string, ...unknown[]]> }>,
  // 테이블+첫 동작별 결과 지정: 함수가 (call) => result 를 돌려준다.
  resolver: (() => ({ data: null, error: null })) as (call: { table: string; ops: Array<[string, ...unknown[]]> }) => unknown,
  signed: 0,
}))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    storage: {
      from: () => ({
        createSignedUrls: async (paths: string[]) => {
          state.signed += 1
          return { data: paths.map((path) => ({ path, signedUrl: `https://signed.test/${path}` })), error: null }
        },
      }),
    },
    from: (table: string) => {
      const call = { table, ops: [] as Array<[string, ...unknown[]]> }
      state.calls.push(call)
      const chain: Record<string, unknown> = {}
      for (const name of [
        "select", "insert", "update", "delete", "eq", "neq", "lt", "in", "not", "order", "limit", "maybeSingle", "single",
      ]) {
        chain[name] = (...args: unknown[]) => {
          call.ops.push([name, ...args])
          return chain
        }
      }
      chain.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(state.resolver(call)).then(resolve, reject)
      return chain
    },
  }),
}))

import {
  claimInternalCsIntegrationEvent,
  createInternalCsMessage,
  getInternalCsConversation,
  InternalCsEventConversationRequiredError,
  internalCsConversationExists,
} from "@/lib/repositories/internal-cs-chat"

const has = (call: Call, op: string, ...args: unknown[]) =>
  call.ops.some((entry) => entry[0] === op && args.every((arg, index) => entry[index + 1] === arg))

afterEach(() => {
  state.calls = []
  state.signed = 0
  state.resolver = () => ({ data: null, error: null })
})

const claimInput = {
  conversationId: null,
  direction: "inbound" as const,
  transport: "webhook" as const,
  eventType: "cs.analysis.created",
  sourceSystem: "adapter",
  idempotencyKey: "k-1",
  actor: "integration:adapter",
}

describe("claimInternalCsIntegrationEvent 재선점(R6)", () => {
  const dupError = { data: null, error: { code: "23505", message: "duplicate" } }
  const row = (status: string, updatedAt: string) => ({
    id: "e1", status, updated_at: updatedAt, conversation_id: null, idempotency_key: "k-1",
  })

  function resolverFor(existing: Record<string, unknown>, reclaimResult: unknown) {
    return (call: Call) => {
      if (call.ops.some((op) => op[0] === "insert")) return dupError
      if (call.ops.some((op) => op[0] === "update")) return reclaimResult
      return { data: existing, error: null }
    }
  }

  it("failed 이벤트는 상태·갱신 시각 조건부 갱신으로 다시 선점한다", async () => {
    const existing = row("failed", "2026-11-25T00:00:00.123456+00:00")
    state.resolver = resolverFor(existing, { data: { ...existing, status: "accepted" }, error: null })
    const claim = await claimInternalCsIntegrationEvent(claimInput)
    expect(claim).toMatchObject({ created: true, reclaimed: true })
    const update = state.calls.find((call) => call.ops.some((op) => op[0] === "update"))!
    expect(has(update, "eq", "status", "failed")).toBe(true)
    expect(has(update, "eq", "updated_at", "2026-11-25T00:00:00.123456+00:00")).toBe(true)
  })

  it("오래 처리 중인 이벤트도 다시 선점하고, 방금 시작한 처리 중 이벤트는 건드리지 않는다", async () => {
    const now = new Date("2026-11-25T12:00:00Z")
    const stale = row("processing", "2026-11-25T11:50:00+00:00")
    state.resolver = resolverFor(stale, { data: stale, error: null })
    expect((await claimInternalCsIntegrationEvent(claimInput, now)).created).toBe(true)

    state.calls = []
    const fresh = row("processing", "2026-11-25T11:58:00+00:00")
    state.resolver = resolverFor(fresh, { data: fresh, error: null })
    const claim = await claimInternalCsIntegrationEvent(claimInput, now)
    expect(claim.created).toBe(false)
    expect(state.calls.some((call) => call.ops.some((op) => op[0] === "update"))).toBe(false)
  })

  it("completed 이벤트는 다시 선점하지 않는다", async () => {
    state.resolver = resolverFor(row("completed", "2020-01-01T00:00:00+00:00"), { data: null, error: null })
    const claim = await claimInternalCsIntegrationEvent(claimInput)
    expect(claim.created).toBe(false)
    expect(state.calls.some((call) => call.ops.some((op) => op[0] === "update"))).toBe(false)
  })

  it("동시 재선점에서 진 쪽(갱신 0행)은 created=false 와 최신 상태를 돌려준다", async () => {
    const existing = row("failed", "2026-11-25T00:00:00+00:00")
    state.resolver = resolverFor(existing, { data: null, error: null })
    const claim = await claimInternalCsIntegrationEvent(claimInput)
    expect(claim.created).toBe(false)
  })

  it("conversation_id NOT NULL 마이그레이션 전이면 호출자가 옛 순서로 물러나도록 전용 오류를 던진다", async () => {
    state.resolver = () => ({ data: null, error: { code: "23502", message: "null value in column conversation_id" } })
    await expect(claimInternalCsIntegrationEvent(claimInput)).rejects.toBeInstanceOf(InternalCsEventConversationRequiredError)
  })
})

describe("조회·쓰기 좁히기(R22)", () => {
  it("getInternalCsConversation 은 최근 메시지 한 쪽만 읽고 시간 순으로 돌려준다(더 있으면 messagesTruncated)", async () => {
    const messages = Array.from({ length: 4 }, (_, index) => ({ id: `m${4 - index}` })) // 최신순 m4..m1
    state.resolver = (call) => {
      if (call.table === "internal_cs_conversations") return { data: { id: "c1" }, error: null }
      if (call.table === "internal_cs_messages") return { data: messages, error: null }
      return { data: [], error: null }
    }
    const loaded = await getInternalCsConversation("c1", { messageLimit: 3 })
    const messageCall = state.calls.find((call) => call.table === "internal_cs_messages")!
    expect(has(messageCall, "limit", 4)).toBe(true)
    expect(loaded?.messages.map((message) => message.id)).toEqual(["m2", "m3", "m4"])
    expect(loaded?.messagesTruncated).toBe(true)
  })

  it("internalCsConversationExists 는 id 한 칸만 읽는다", async () => {
    state.resolver = () => ({ data: { id: "c1" }, error: null })
    expect(await internalCsConversationExists("c1")).toBe(true)
    expect(state.calls[0].ops[0]).toEqual(["select", "id"])
    expect(state.signed).toBe(0)
  })

  it("assistant 메시지: 보관된 대화는 되살리지 않는 조건부 한 문장으로 검토 대기로 올린다", async () => {
    state.resolver = (call) => {
      if (call.ops.some((op) => op[0] === "insert")) return { data: { id: "m1", created_at: "2026-11-25T00:00:00Z" }, error: null }
      return { data: [{ id: "c1" }], error: null }
    }
    await createInternalCsMessage({ conversationId: "c1", role: "assistant", content: "초안", actor: "a" })
    const updates = state.calls.filter((call) => call.ops.some((op) => op[0] === "update"))
    expect(updates).toHaveLength(1)
    expect(has(updates[0], "neq", "status", "archived")).toBe(true)
    const patch = updates[0].ops.find((op) => op[0] === "update")![1] as Record<string, unknown>
    expect(patch).toMatchObject({ status: "waiting_review", last_message_at: "2026-11-25T00:00:00Z" })
  })

  it("assistant 메시지: 보관된 대화(조건부 갱신 0행)는 상태는 두고 마지막 메시지 시각만 갱신한다", async () => {
    state.resolver = (call) => {
      if (call.ops.some((op) => op[0] === "insert")) return { data: { id: "m1", created_at: "2026-11-25T00:00:00Z" }, error: null }
      if (has(call, "neq", "status", "archived")) return { data: [], error: null }
      return { data: null, error: null }
    }
    await createInternalCsMessage({ conversationId: "c1", role: "assistant", content: "초안", actor: "a" })
    const updates = state.calls.filter((call) => call.ops.some((op) => op[0] === "update"))
    expect(updates).toHaveLength(2)
    const patch = updates[1].ops.find((op) => op[0] === "update")![1] as Record<string, unknown>
    expect(patch).not.toHaveProperty("status")
    expect(patch).toMatchObject({ last_message_at: "2026-11-25T00:00:00Z" })
  })

  it("user 메시지는 상태를 건드리지 않고 한 문장만 쓴다", async () => {
    state.resolver = (call) =>
      call.ops.some((op) => op[0] === "insert")
        ? { data: { id: "m1", created_at: "2026-11-25T00:00:00Z" }, error: null }
        : { data: null, error: null }
    await createInternalCsMessage({ conversationId: "c1", role: "user", content: "질문", actor: "a" })
    const updates = state.calls.filter((call) => call.ops.some((op) => op[0] === "update"))
    expect(updates).toHaveLength(1)
    expect(updates[0].ops.find((op) => op[0] === "update")![1]).not.toHaveProperty("status")
  })
})
