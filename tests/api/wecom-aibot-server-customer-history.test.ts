// 위컴 수신구 서버 연결 — 단체방은 고객 이력 부품을 떼어 낸다(브리지 groupScopedDeps 와 이중 잠금). 1:1 은 그대로.
import { describe, expect, it, vi } from "vitest"

// 가짜 연결은 고객 조회를 끈 단체방에도 고객 이력을 싣는다 — 수신구가 스스로 떼어 내는지(두 번째 잠금)만 본다.
const hoisted = vi.hoisted(() => ({
  buildServerOrchestratorDeps: vi.fn((options: { customerContacts?: boolean }) => {
    void options
    return {
      knowledge: { evidence: async () => ({}), consultationCount: async () => 1 },
      consultations: async () => ({}),
      customerHistory: async () => ({}),
    }
  }),
}))

vi.mock("@/lib/admin-ai/server/deps", () => ({ buildServerOrchestratorDeps: hoisted.buildServerOrchestratorDeps, serverOpsDeps: {} }))
vi.mock("@/lib/wecom/aibot-accounts", () => ({ lookupAdminByEmail: async () => ({ ok: false, reason: "not_found" }) }))
vi.mock("@/lib/server/post-json", () => ({ postJson: vi.fn() }))

import { buildWecomBridgeDeps } from "@/lib/wecom/aibot-server"

describe("조율기 연결 — 고객 이력", () => {
  it("단체방은 고객 조회를 끈 연결이고 고객 이력 부품도 떼어 낸다 — 1:1 은 남긴다", () => {
    const deps = buildWecomBridgeDeps({ token: "t", key: Buffer.alloc(32), botId: "b", userMap: new Map(), allowedChatIds: new Set() })
    const admin = { source: "supabase" as const, role: "ADMIN", userId: "user-1", capabilities: [] }
    const group = deps.orchestratorDeps(admin, "group")
    const single = deps.orchestratorDeps(admin, "single")
    expect(group.customerHistory).toBeUndefined()
    expect(single.customerHistory).toBeDefined()
    expect(hoisted.buildServerOrchestratorDeps.mock.calls.map(([options]) => options.customerContacts)).toEqual([false, true])
  })
})
