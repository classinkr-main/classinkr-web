import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import { AdminAiConversation } from "@/components/admin/ai/AdminAiConversation"
import { OrderCard } from "@/components/admin/ai/cards/OrderCard"
import { createLiveAdminAiClient, type AdminAiClient } from "@/lib/admin-ai/client"
import { createAdminAiStore } from "@/lib/admin-ai/store"
import { encodeStreamEvent, type AdminAiStreamEvent } from "@/lib/admin-ai/stream-protocol"
import type { AdminAiTurnResult, OrderTicket } from "@/lib/admin-ai/types"

const NOW = Date.parse("2026-11-25T01:00:00Z")

const ORDER: OrderTicket = {
  id: "ticket-1",
  type: "quote.draft.create",
  risk: "R1",
  icon: "amount",
  title: "견적 초안 만들기",
  target: { label: "가온학원(샘플)", meta: "견적 초안(draft) · 버전 1" },
  fields: [{ key: "template_id", label: "템플릿", value: "camera_t1" }],
  amount: { label: "합계(VAT 포함)", currency: "KRW", value: 1_100_000 },
  confirmLabel: "견적 초안 만들기",
  doneText: "견적 초안을 만들었습니다",
  undo: "none",
  undoNote: "되돌리기는 화면에서 합니다",
  state: "draft",
  createdAt: NOW,
  expiresAt: NOW + 15 * 60 * 1000,
  server: { ticket: "signed.ticket", directHref: "/admin/quotes", directLabel: "견적 화면에서 직접 만들기" },
}

function ndjsonResponse(events: AdminAiStreamEvent[], split = 7): Response {
  const text = events.map(encodeStreamEvent).join("")
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // 줄 중간에서 끊어 보낸다 — 조각 경계에서도 같은 결과여야 한다.
      for (let i = 0; i < text.length; i += split) controller.enqueue(encoder.encode(text.slice(i, i + split)))
      controller.close()
    },
  })
  return new Response(stream, { status: 200, headers: { "content-type": "application/x-ndjson" } })
}

function askOnce(client: AdminAiClient, text = "질문"): Promise<{ steps: string[]; result: AdminAiTurnResult }> {
  return new Promise((resolve) => {
    const steps: string[] = []
    client.ask({ text, context: null }, { onStep: (label) => steps.push(label), onDone: (result) => resolve({ steps, result }) })
  })
}

afterEach(() => vi.restoreAllMocks())

describe("liveAdminAiClient — NDJSON 스트림을 기존 블록으로", () => {
  it("단계·블록·오더를 모아 한 턴으로 넘긴다", async () => {
    const fetcher = vi.fn(async () =>
      ndjsonResponse([
        { type: "step", label: "질문 나누기" },
        { type: "step", label: "근거 문서 찾기" },
        { type: "block", block: { kind: "text", text: "견적 초안을 만들 준비가 됐습니다." } },
        { type: "order", order: ORDER },
        { type: "block", block: { kind: "order", orderId: "ticket-1" } },
        { type: "done" },
      ])
    )
    const { steps, result } = await askOnce(createLiveAdminAiClient(fetcher as unknown as typeof fetch))
    expect(steps).toEqual(["질문 나누기", "근거 문서 찾기"])
    expect(result.blocks.map((b) => b.kind)).toEqual(["text", "order"])
    expect(result.order?.id).toBe("ticket-1")
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("/api/admin/ai/chat")
    expect(JSON.parse(String(init.body)).messages.at(-1)).toEqual({ role: "user", text: "질문" })
  })

  it("HTTP 오류·스트림 오류는 글 한 줄로 끝난다", async () => {
    const unauthorized = await askOnce(createLiveAdminAiClient((async () => new Response("{}", { status: 401 })) as unknown as typeof fetch))
    expect(unauthorized.result.blocks).toEqual([{ kind: "text", text: "로그인이 끝났습니다. 다시 로그인한 뒤 물어봐 주세요." }])
    const failed = await askOnce(createLiveAdminAiClient((async () => ndjsonResponse([{ type: "error", message: "답을 만들지 못했습니다." }])) as unknown as typeof fetch))
    expect(failed.result.blocks).toEqual([{ kind: "text", text: "답을 만들지 못했습니다." }])
  })

  it("실제 모드 스트림이 기존 위젯 화면(대화·카드)에 그대로 그려진다", async () => {
    const fetcher = async () =>
      ndjsonResponse([
        { type: "step", label: "근거 문서 찾기" },
        {
          type: "block",
          block: {
            kind: "answer",
            card: {
              title: "클래스인 정보",
              target: { label: "수업 녹화", meta: "근거 확정" },
              answer: "수업 녹화는 수업 설정 화면에서 켤 수 있습니다.",
              steps: ["교사 계정으로 로그인합니다.", "수업 설정을 엽니다."],
              confidence: "confirmed",
              sources: [{ title: "수업 기능 안내(샘플)", kind: "public", status: "confirmed", externalUse: true }],
              customerDraft: { text: "녹화는 설정에서 켤 수 있어요.", status: "confirmed" },
            },
          },
        },
        { type: "done" },
      ])
    const store = createAdminAiStore(createLiveAdminAiClient(fetcher as unknown as typeof fetch))
    store.ask({ text: "수업 녹화는 어떻게 켜?", context: null })
    await vi.waitFor(() => expect(store.getState().busy).toBe(false))
    const html = renderToStaticMarkup(<AdminAiConversation state={store.getState()} />)
    expect(html).toContain("수업 녹화는 수업 설정 화면에서 켤 수 있습니다.")
    expect(html).toContain("교사 계정으로 로그인합니다.")
    expect(html).toContain("고객용 문안")
  })

  it("시안/실제 전환은 한 곳(adminAiMode)에서 — 실제 스위치가 켜지면 실제 클라이언트, 아니면 시안", async () => {
    vi.resetModules()
    vi.stubEnv("NEXT_PUBLIC_ADMIN_AI_LIVE", "1")
    expect((await import("@/lib/admin-ai/client")).adminAiClient.mode).toBe("live")
    vi.resetModules()
    vi.stubEnv("NEXT_PUBLIC_ADMIN_AI_LIVE", "")
    expect((await import("@/lib/admin-ai/client")).adminAiClient.mode).toBe("demo")
    vi.unstubAllEnvs()
  })
})

describe("서버 오더 확인 — 화면 상태", () => {
  it("확인을 누르면 서명 표를 확인 경로로 보내고, 서버 답으로만 완료된다", async () => {
    let release: (value: { ok: true; text: string }) => void = () => undefined
    const confirmOrder = vi.fn(() => new Promise<{ ok: true; text: string }>((resolve) => (release = resolve)))
    const client: AdminAiClient = {
      mode: "live",
      ask: (_input, handlers) => {
        handlers.onDone({ blocks: [{ kind: "order", orderId: ORDER.id }], order: ORDER })
        return () => undefined
      },
      confirmOrder,
    }
    const store = createAdminAiStore(client)
    store.ask({ text: "견적 초안 만들어 줘", context: null })
    store.actOnOrder(ORDER.id, { type: "confirm" })
    store.actOnOrder(ORDER.id, { type: "confirm" })
    expect(confirmOrder).toHaveBeenCalledTimes(1)
    expect(confirmOrder).toHaveBeenCalledWith("signed.ticket")
    expect(store.getState().orders[ORDER.id].submitting).toBe(true)
    expect(store.getState().orders[ORDER.id].state).toBe("draft")
    release({ ok: true, text: "견적 초안 Q-0001을 만들었습니다." })
    await vi.waitFor(() => expect(store.getState().orders[ORDER.id].state).toBe("done"))
    expect(store.getState().orders[ORDER.id].doneText).toBe("견적 초안 Q-0001을 만들었습니다.")
  })

  it("서버가 거절하면 실패 사유를 보이고 다시 작성 대신 화면 링크를 준다", async () => {
    const client: AdminAiClient = {
      mode: "live",
      ask: (_input, handlers) => {
        handlers.onDone({ blocks: [{ kind: "order", orderId: ORDER.id }], order: ORDER })
        return () => undefined
      },
      confirmOrder: async () => ({ ok: false, text: "확인 시간(15분)이 지났습니다. 다시 요청해 주세요." }),
    }
    const store = createAdminAiStore(client)
    store.ask({ text: "견적 초안 만들어 줘", context: null })
    store.actOnOrder(ORDER.id, { type: "confirm" })
    await vi.waitFor(() => expect(store.getState().orders[ORDER.id].state).toBe("failed"))
    const order = store.getState().orders[ORDER.id]
    const html = renderToStaticMarkup(<OrderCard order={order} now={NOW} onAction={() => undefined} preview={false} />)
    expect(html).toContain("확인 시간(15분)이 지났습니다")
    expect(html).toContain("견적 화면에서 직접 만들기")
    expect(html).not.toContain("다시 작성")
  })

  it("서명 표가 없는 서버 오더는 확인 버튼 대신 '화면에서 직접' 링크다", () => {
    const order = { ...ORDER, server: { directHref: "/admin/quotes", directLabel: "견적 화면에서 직접 만들기" } }
    const html = renderToStaticMarkup(<OrderCard order={order} now={NOW} onAction={() => undefined} preview={false} />)
    expect(html).toContain("견적 화면에서 직접 만들기")
    expect(html).not.toContain(">견적 초안 만들기</button>")
    expect(html).toContain("1,100,000")
  })
})
