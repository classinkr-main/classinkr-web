import { describe, expect, it } from "vitest"

import { buildAdminAiAnnouncement, buildExpiryWarning, nextTabIndex, nextTrapIndex } from "@/lib/admin-ai/a11y"
import { buildDemoTurn } from "@/lib/admin-ai/demo-scenarios"
import { ORDER_TTL_MS } from "@/lib/admin-ai/order-state"
import {
  getAdminAiEntity,
  registerAdminAiEntity,
  subscribeAdminAiEntity,
} from "@/lib/admin-ai/page-entity"
import {
  addRecentThread,
  parseRecentThreads,
  recentThreadTitle,
  RECENT_THREADS_MAX,
} from "@/lib/admin-ai/recent-threads"
import { INITIAL_ADMIN_AI_STATE, reduceAdminAi, type AdminAiState } from "@/lib/admin-ai/store"

describe("포커스 가두기·탭 방향키 판정", () => {
  it("시트 가장자리에서만 Tab 을 돌린다", () => {
    expect(nextTrapIndex(5, 4, false)).toBe(0)
    expect(nextTrapIndex(5, 0, true)).toBe(4)
    expect(nextTrapIndex(5, 2, false)).toBeNull()
    expect(nextTrapIndex(5, 2, true)).toBeNull()
  })

  it("포커스가 시트 밖이면 안쪽 끝으로 끌어온다", () => {
    expect(nextTrapIndex(5, -1, false)).toBe(0)
    expect(nextTrapIndex(5, -1, true)).toBe(4)
  })

  it("포커스할 것이 없으면 시트 자체(-1)에 둔다", () => {
    expect(nextTrapIndex(0, -1, false)).toBe(-1)
  })

  it("탭 방향키는 처음·끝에서 돌고, 다른 키는 무시한다", () => {
    expect(nextTabIndex("ArrowRight", 1, 2)).toBe(0)
    expect(nextTabIndex("ArrowLeft", 0, 4)).toBe(3)
    expect(nextTabIndex("Home", 3, 4)).toBe(0)
    expect(nextTabIndex("End", 0, 4)).toBe(3)
    expect(nextTabIndex("a", 0, 4)).toBeNull()
    expect(nextTabIndex("ArrowRight", 0, 0)).toBeNull()
  })
})

function withOrder(scenario: "task" | "sms", now: number): AdminAiState {
  let state = reduceAdminAi(INITIAL_ADMIN_AI_STATE, {
    type: "ask", userId: "u", assistantId: "a", text: "질문",
  })
  state = reduceAdminAi(state, {
    type: "turn-done", assistantId: "a", now,
    result: buildDemoTurn(scenario, { now, orderId: "o1" }),
  })
  return state
}

describe("스크린리더 알림 — 카운트다운을 읽지 않는다", () => {
  it("새 답변 한 줄만 만들고, 시간이 흘러도 글이 바뀌지 않는다", () => {
    const base = withOrder("task", 1_000)
    const text = buildAdminAiAnnouncement(base)
    expect(text).toContain("CRM 할 일 생성 오더")
    expect(text).toContain("확인 대기")
    expect(text).not.toMatch(/뒤 만료|\d+:\d{2}|초 뒤/)
    // 시계만 흐른 상태 — 같은 글이어야 live 영역이 다시 읽지 않는다.
    expect(buildAdminAiAnnouncement({ ...base, now: base.now + 5 * 60_000 })).toBe(text)
  })

  it("답을 만드는 중에는 이전 답을 다시 읽지 않는다", () => {
    const base = withOrder("task", 1_000)
    const asking = reduceAdminAi(base, { type: "ask", userId: "u2", assistantId: "a2", text: "또" })
    expect(buildAdminAiAnnouncement(asking)).toBe(buildAdminAiAnnouncement(base))
  })

  it("만료 1분 전 경고는 그 구간에 들어온 오더만 한 번 알린다", () => {
    const base = withOrder("task", 1_000)
    const order = base.orders.o1
    expect(buildExpiryWarning({ ...base, now: order.createdAt + 60_000 })).toBe("")
    const soon = buildExpiryWarning({ ...base, now: order.expiresAt - 59_000 })
    expect(soon).toContain("1분 안에 만료")
    // 같은 구간 안에서는 초가 흘러도 글이 같다.
    expect(buildExpiryWarning({ ...base, now: order.expiresAt - 5_000 })).toBe(soon)
    expect(ORDER_TTL_MS).toBeGreaterThan(60_000)
  })
})

describe("화면이 알리는 '지금 열린 대상'", () => {
  it("등록·거둠·나중 것 우선·구독 알림", () => {
    let calls = 0
    const stop = subscribeAdminAiEntity(() => {
      calls += 1
    })
    expect(getAdminAiEntity()).toBeNull()
    const drawer = registerAdminAiEntity({ type: "customer", id: "c1", label: "한빛수학학원" })
    expect(getAdminAiEntity()?.id).toBe("c1")
    const quote = registerAdminAiEntity({ type: "quote", id: "q9", label: "Q-0142" })
    expect(getAdminAiEntity()?.id).toBe("q9")
    quote()
    expect(getAdminAiEntity()?.id).toBe("c1")
    drawer()
    expect(getAdminAiEntity()).toBeNull()
    expect(calls).toBe(4)
    stop()
  })
})

describe("직전 대화 — 제목·시각만", () => {
  it("제목은 대화 종류 이름이고 사용자가 친 글(전화번호·이름)을 담지 않는다(F2)", () => {
    const typed = "010-1234-5678 도담영어 원장 김철수님께 문자 보내 줘"
    const messages = [
      { id: "u", role: "user" as const, text: typed, blocks: [] },
      { id: "a", role: "assistant" as const, blocks: [{ kind: "order" as const, orderId: "o1" }] },
    ]
    const title = recentThreadTitle(messages, { o1: { type: "message.sms.send" } })
    expect(title).not.toBeNull()
    for (const piece of ["010", "1234", "도담", "김철수", typed.slice(0, 6)]) {
      expect(title, piece).not.toContain(piece)
    }
    expect(Array.from(title ?? "").length).toBeLessThanOrEqual(24)
    expect(recentThreadTitle([])).toBeNull()
  })

  it("오더가 여러 건이면 '외 N건', 묻기 답이면 카드 종류, 답이 없으면 질문 건수다", () => {
    const user = { id: "u", role: "user" as const, text: "아무 말 010-9999-0000", blocks: [] }
    const orderBlocks = [
      { kind: "order" as const, orderId: "o1" },
      { kind: "order" as const, orderId: "o2" },
    ]
    const two = [user, { id: "a", role: "assistant" as const, blocks: orderBlocks }]
    expect(recentThreadTitle(two, { o1: { type: "crm.task.create" }, o2: { type: "crm.task.create" } })).toBe(
      "할 일 생성 외 1건"
    )
    const ask = [user, { id: "a", role: "assistant" as const, blocks: [{ kind: "contact" as const, card: {} as never }] }]
    expect(recentThreadTitle(ask)).toBe("담당자 질문")
    expect(recentThreadTitle([user])).toBe("질문 1건")
  })

  it("최대 5개, 최근 것이 앞이고 같은 id 는 하나만 남는다", () => {
    let list: ReturnType<typeof addRecentThread> = []
    for (let index = 0; index < 7; index += 1) {
      list = addRecentThread(list, { id: `t${index}`, title: `질문 ${index}`, at: index })
    }
    expect(list).toHaveLength(RECENT_THREADS_MAX)
    expect(list[0].id).toBe("t6")
    expect(addRecentThread(list, { id: "t6", title: "다시", at: 99 })).toHaveLength(RECENT_THREADS_MAX)
  })

  it("모양이 어긋난 저장값은 버리고, 저장 항목에 대화 원문 칸이 없다", () => {
    expect(parseRecentThreads("not json")).toEqual([])
    expect(parseRecentThreads('{"a":1}')).toEqual([])
    const parsed = parseRecentThreads(
      JSON.stringify([{ id: "a", title: "제목", at: 1, text: "원문", messages: [1] }, { id: 3 }])
    )
    expect(parsed).toEqual([{ id: "a", title: "제목", at: 1 }])
  })
})
