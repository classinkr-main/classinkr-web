import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { buildDemoTurn, type DemoScenarioKey } from "@/lib/admin-ai/demo-scenarios"
import {
  INITIAL_ADMIN_AI_STATE,
  reduceAdminAi,
  type AdminAiEvent,
  type AdminAiState,
} from "@/lib/admin-ai/store"

// jsdom 이 저장소에 없다 — 정적 마크업(renderToStaticMarkup)으로 "무엇이 그려지는가" 를 고정하고,
// 포커스 가두기·닫을 때 포커스 복귀 같은 동작은 lib/admin-ai/a11y 의 순수 판정 시험과
// 브라우저(Playwright) 점검으로 나눠 확인한다.

const mocks = vi.hoisted(() => ({ state: null as AdminAiState | null }))

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/crm",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
}))

vi.mock("@/components/admin/ai/use-admin-ai", () => ({
  useAdminAiState: () => mocks.state,
  useAdminAiPageContext: () => ({ path: "/admin/crm", label: "CRM › 현황" }),
}))

const CONTEXT = { path: "/admin/crm", label: "CRM › 현황" }

function build(events: AdminAiEvent[]): AdminAiState {
  return events.reduce(reduceAdminAi, INITIAL_ADMIN_AI_STATE)
}

/** 질문 → 답(오더 카드) 한 턴. */
function turn(index: number, scenario: DemoScenarioKey, now: number): AdminAiEvent[] {
  return [
    { type: "ask", userId: `u${index}`, assistantId: `a${index}`, text: `질문 ${index}` },
    {
      type: "turn-done",
      assistantId: `a${index}`,
      now,
      result: buildDemoTurn(scenario, { now, orderId: `o${index}` }),
    },
  ]
}

function buttonLabels(markup: string): string[] {
  return Array.from(markup.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)).map((match) =>
    match[1].replace(/<[^>]*>/g, "").trim()
  )
}

function liveRegionText(markup: string): string[] {
  return Array.from(markup.matchAll(/<(\w+)\b[^>]*(?:aria-live=|role="status")[^>]*>([\s\S]*?)<\/\1>/g)).map(
    (match) => match[2].replace(/<[^>]*>/g, "")
  )
}

async function renderWorkspace(state: AdminAiState, tab: "chat" | "orders") {
  mocks.state = state
  const { default: AdminAiWorkspace } = await import("@/components/admin/ai/AdminAiWorkspace")
  return renderToStaticMarkup(<AdminAiWorkspace initialTab={tab} />)
}

async function renderPanel(state: AdminAiState) {
  const { default: AdminAiPanel } = await import("@/components/admin/ai/AdminAiPanel")
  return renderToStaticMarkup(<AdminAiPanel state={state} context={CONTEXT} launcherBottom={24} />)
}

describe("오더함 — 확인·취소를 표에서 바로 하지 않는다(R5)", () => {
  it("확인 대기·수정 중 행에는 확인·취소 버튼이 없고 '카드 열기' 만 있다", async () => {
    const state = build([
      ...turn(1, "pay", 1_000), // R2 민감 — 금액이 있는 오더
      ...turn(2, "task", 1_001),
      { type: "order-action", orderId: "o2", action: { type: "edit" }, now: 1_002 },
    ])
    expect(state.orders.o1.state).toBe("draft")
    expect(state.orders.o2.state).toBe("editing")

    const markup = await renderWorkspace(state, "orders")
    const labels = buttonLabels(markup)
    expect(labels.filter((label) => label === "카드 열기")).toHaveLength(2)
    for (const forbidden of ["확인", "취소", "시안 확인", "결제 확정", "변경 확인", "수정 완료"]) {
      expect(labels, forbidden).not.toContain(forbidden)
    }
    // 금액·전/후 값은 카드를 열어야 보인다 — 표에는 없다.
    expect(markup).not.toContain("13,200,000")
  })

  it("발송 취소·되돌리기처럼 줄이는 방향의 버튼은 표에 남는다", async () => {
    const state = build([
      ...turn(1, "sms", 1_000),
      { type: "order-action", orderId: "o1", action: { type: "confirm" }, now: 1_001 },
    ])
    expect(buttonLabels(await renderWorkspace(state, "orders"))).toContain("발송 취소")
  })
})

describe("접근성 — live 영역에 카운트다운이 없다(R27)", () => {
  const state = build([
    ...turn(1, "task", 1_000),
    ...turn(2, "sms", 1_001),
    { type: "order-action", orderId: "o2", action: { type: "confirm" }, now: 1_002 },
  ])

  it("위젯 패널: 카드 시계는 있지만 live 영역은 알림 두 줄뿐이고 시간이 들어 있지 않다", async () => {
    const markup = await renderPanel(state)
    expect(markup).toContain("뒤 만료") // 카드에는 시계가 그대로 있다
    const live = liveRegionText(markup)
    expect(live.length).toBeGreaterThan(0)
    for (const text of live) expect(text).not.toMatch(/뒤 만료|\d+:\d{2}|초 뒤|\d+초/)
    // 대화 전체를 aria-live 로 두지 않는다.
    expect((markup.match(/aria-live=/g) ?? []).length).toBe(2)
  })

  it("AI 올인원 탭: 같은 규칙", async () => {
    const markup = await renderWorkspace(state, "chat")
    for (const text of liveRegionText(markup)) expect(text).not.toMatch(/뒤 만료|\d+:\d{2}|초 뒤|\d+초/)
    expect((markup.match(/aria-live=/g) ?? []).length).toBe(2)
  })

  it("탭은 roving tabindex 와 aria-controls 를 가진다", async () => {
    const markup = await renderPanel(state)
    expect(markup).toContain('role="tab"')
    expect(markup).toMatch(/id="admin-ai-widget-tab-chat"[^>]*aria-controls="admin-ai-widget-panel-chat"[^>]*tabindex="0"/)
    expect(markup).toMatch(/id="admin-ai-widget-tab-orders"[^>]*aria-controls="admin-ai-widget-panel-orders"[^>]*tabindex="-1"/)
    expect(markup).toContain('role="tabpanel"')
  })
})

describe("위젯 오더 탭(R6) — 유예 중이 맨 위", () => {
  it("탭 이름은 '오더' 이고 유예 중 오더가 확인 대기보다 먼저 나온다", async () => {
    const state = build([
      ...turn(1, "task", 1_000),
      ...turn(2, "sms", 1_001),
      { type: "order-action", orderId: "o2", action: { type: "confirm" }, now: 1_002 },
      { type: "set-view", view: "orders" },
    ])
    const markup = await renderPanel(state)
    expect(buttonLabels(markup)).toContain("오더2")
    expect(buttonLabels(markup)).not.toContain("확인 대기")
    const graceAt = markup.indexOf("문자 1건 발송")
    const draftAt = markup.indexOf("CRM 할 일 생성")
    expect(graceAt).toBeGreaterThan(-1)
    expect(draftAt).toBeGreaterThan(graceAt)
    expect(markup).toContain("오더는 새 대화에도 남습니다")
  })

  it("새 대화 뒤에도 오더 탭에 오더가 남는다", async () => {
    const state = build([
      ...turn(1, "sms", 1_000),
      { type: "order-action", orderId: "o1", action: { type: "confirm" }, now: 1_001 },
      { type: "new-conversation", now: 1_002, threadId: "th-1" },
      { type: "set-view", view: "orders" },
    ])
    const markup = await renderPanel(state)
    expect(markup).toContain("문자 1건 발송")
    expect(markup).toContain("발송 취소")
  })
})

describe("새 대화 버튼·토스트(N1·N2·N7)", () => {
  const empty = INITIAL_ADMIN_AI_STATE
  const talked = build(turn(1, "task", 1_000))

  function newButton(markup: string) {
    const match = markup.match(/<button\b[^>]*aria-label="새 대화"[^>]*>/)
    if (!match) throw new Error("새 대화 버튼이 없다")
    return match[0]
  }

  it("메시지가 없으면 꺼져 있고, 있으면 켜져 있다", async () => {
    expect(newButton(await renderPanel(empty))).toMatch(/\sdisabled=""/)
    expect(newButton(await renderPanel(talked))).not.toMatch(/\sdisabled=""/)
  })

  it("버튼에 '새 대화' 글자가 있다(좁은 폭에서는 CSS 로 숨김 — 아이콘만)", async () => {
    const markup = await renderPanel(talked)
    expect(markup).toMatch(/<span class="hidden @\[380px\]:inline">새 대화<\/span>/)
  })

  it("새 대화 직후 토스트에 되돌리기가 있고, 유예 중 오더가 있으면 발송 취소도 있다", async () => {
    const state = build([
      ...turn(1, "sms", 1_000),
      { type: "order-action", orderId: "o1", action: { type: "confirm" }, now: 1_001 },
      { type: "new-conversation", now: 1_002, threadId: "th-1" },
    ])
    const markup = await renderPanel(state)
    expect(markup).toContain("새 대화를 시작했습니다")
    expect(buttonLabels(markup)).toContain("되돌리기")
    expect(markup).toContain("발송 대기 1건은 계속 진행됩니다")
    expect(buttonLabels(markup)).toContain("발송 취소")
  })

  it("토스트가 없을 때(되돌리기 칸이 비면) 아무것도 그리지 않는다", async () => {
    expect(await renderPanel(talked)).not.toContain("새 대화를 시작했습니다")
  })
})

describe("첫 화면 — 공통 추천 칩(N8)", () => {
  it("담당자 찾기·링크 찾기·정책 묻기가 있고, 직전 대화는 제목만 보인다", async () => {
    const state = build([
      ...turn(1, "task", 1_000),
      { type: "new-conversation", now: 1_001, threadId: "th-1" },
    ])
    const markup = await renderPanel(state)
    const labels = buttonLabels(markup)
    for (const label of ["담당자 찾기", "링크 찾기", "정책 묻기"]) expect(labels).toContain(label)
    expect(markup).toContain("직전 대화")
    expect(markup).toContain("질문 1")
    expect(markup).toContain("대화 내용은 저장하지 않습니다")
  })
})

describe("시안 카드 표시(R16)", () => {
  it("오더 카드에 '시안 — 실제로 실행되지 않습니다' 띠와 '시안 확인' 버튼이 있고 '권한 확인' 은 없다", async () => {
    const state = build([...turn(1, "pay", 1_000), { type: "set-view", view: "orders" }])
    const markup = await renderPanel(state)
    expect(markup).toContain("시안 — 실제로 실행되지 않습니다")
    expect(buttonLabels(markup)).toContain("시안 확인")
    expect(markup).not.toContain("권한 확인")
    expect(markup).toContain("필요 권한 · 결제 확정")
  })
})
