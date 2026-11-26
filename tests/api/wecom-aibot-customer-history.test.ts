// 위컴 방 — 고객 이력 갈래. 단체방은 통째로 막고(찾기를 부르지 않는다), 1:1 은 역할대로(기록 글은 상담 글 권한과 같은 규칙).
// 가짜 조율기 자료(DB·모델·네트워크 없음). 기관·사람 이름은 가짜.
import { describe, expect, it, vi } from "vitest"

import type { StaffIdentity } from "@/lib/admin-ai/server/actor"
import { findCustomerHistory, type CustomerHistoryDeps } from "@/lib/admin-ai/server/customer-history"
import { collectTurn } from "@/lib/admin-ai/server/orchestrator"
import { answerWecomMessage, GROUP_SCOPE_TEXT, groupScopedDeps, type BridgeDeps, type WecomInboundMessage } from "@/lib/wecom/aibot-bridge"
import { INTERNAL_ONLY_LINE } from "@/lib/wecom/aibot-format"

import { fakeDeps } from "../admin-ai/server/fakes"

const SITE = "https://example.test"
const ADMIN: StaffIdentity = { source: "supabase", role: "ADMIN", name: "스태프(샘플)", userId: "user-1", capabilities: [] }
const GANA = { key: "neo:acc-100", name: "가나학원", href: "/admin/crm/customers/accounts?account=acc-100" }

function message(overrides: Partial<WecomInboundMessage> = {}): WecomInboundMessage {
  return { msgid: "m-1", aibotid: "bot-1", chattype: "single", fromUserId: "wx-staff-1", msgtype: "text", text: "가나학원 결제 문제 있었나?", ...overrides }
}

function historyBridge(canReadContent = true) {
  const historyDeps: CustomerHistoryDeps = {
    findCustomersInText: async (question) => (question.includes("가나학원") ? [GANA] : []),
    loadProfile: async () => ({ targets: [{ targetType: "neo_account", targetId: "acc-100" }], owner: { name: "담당자 A", from: "neo" }, uid: "100200" }),
    listEvents: async () => ({
      events: [
        {
          id: "ev-1",
          occurredAt: "2026-11-20T01:00:00.000Z",
          title: "카드 결제 실패 재처리(샘플)",
          summary: "정기 결제 카드 만료(샘플요지)",
          nextActions: [{ title: "새 카드 등록 안내", dueAt: null, done: false }],
          sourceType: "manual_note",
          sourceId: "gana-billing-2026-11.md",
          tags: ["billing"],
        },
      ],
      total: 2,
    }),
  }
  const customerHistory = vi.fn((question: string, openCustomer: Parameters<typeof findCustomerHistory>[2]["openCustomer"], now: number) =>
    findCustomerHistory(question, historyDeps, { openCustomer, actor: { canReadContent }, now })
  )
  const deps: BridgeDeps = {
    userMap: new Map([["wx-staff-1", "staff1@example.test"]]),
    lookupAdmin: async () => ({ ok: true as const, admin: ADMIN }),
    orchestratorDeps: () => ({ ...fakeDeps().deps, customerHistory }),
    collectTurn,
    siteUrl: SITE,
    now: () => Date.UTC(2026, 10, 26, 1),
  }
  return { deps, customerHistory }
}

describe("고객 이력 — 단체방은 통째로 막고, 1:1 은 역할대로", () => {
  it("단체방 — \"1:1 로\" 안내만, 기록·건수·담당 영업이 나가지 않고 찾기를 부르지 않는다", async () => {
    const { deps, customerHistory } = historyBridge()
    for (const text of ["가나학원 결제 문제 있었나?", "가나학원 고객 이력 알려 줘", "이 고객 견적 이슈 있었나? 누가 맡아?"]) {
      const reply = await answerWecomMessage(message({ chattype: "group", chatid: "room-1", text: `@갈매봇 ${text}` }), deps)
      expect(reply.outcome, text).toBe("answered")
      expect(reply.markdown, text).toContain(GROUP_SCOPE_TEXT)
      expect(reply.markdown, text).not.toMatch(/샘플요지|카드 결제 실패|담당자 A|2건|UID|gana-billing/)
    }
    expect(customerHistory).not.toHaveBeenCalled()
  })

  it("groupScopedDeps 는 고객 이력 부품을 떼고 막음 카드를 단다(이중 잠금)", () => {
    const scoped = groupScopedDeps({ ...fakeDeps().deps, customerHistory: vi.fn() })
    expect(scoped.customerHistory).toBeUndefined()
    expect(scoped.customerHistoryDenied).toMatchObject({ kind: "deny", card: { target: { label: "고객 이력", meta: "단체방" } } })
  })

  it("1:1 — 결론(건수·담당 영업)·기록 줄을 싣고 맨 앞에 내부용 줄", async () => {
    const { deps, customerHistory } = historyBridge()
    const reply = await answerWecomMessage(message(), deps)
    expect(customerHistory).toHaveBeenCalled()
    const lines = reply.markdown.split("\n")
    expect(lines[0]).toBe(INTERNAL_ONLY_LINE)
    expect(reply.markdown).toContain("가나학원 결제 관련 기록 2건을 찾았습니다")
    expect(reply.markdown).toContain("담당 영업: 담당자 A(NEO 기준)")
    expect(reply.markdown).toContain("2026-11-20 · 카드 결제 실패 재처리(샘플) — 정기 결제 카드 만료(샘플요지) · 새 카드 등록 안내 · 수기 기록 · gana-billing-2026-11.md")
    expect(reply.markdown).toMatch(/https:\/\/example\.test\/admin\/crm\/customers\/unified/)
  })

  it("1:1 — 기록 글을 볼 수 없는 역할이면 건수·담당 영업만, 제목·요지는 없다", async () => {
    const { deps } = historyBridge(false)
    const reply = await answerWecomMessage(message(), deps)
    expect(reply.markdown).toContain("결제 관련 기록 2건이 있습니다")
    expect(reply.markdown).toContain("담당자 A")
    expect(reply.markdown).not.toMatch(/샘플요지|카드 결제 실패|gana-billing/)
  })
})
