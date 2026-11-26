import { createHash } from "crypto"
import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createMemoryClaimStore, type TicketClaimStore } from "@/lib/admin-ai/server/ticket-claims"
import type { AiBlock } from "@/lib/admin-ai/types"
import type { BridgeDeps } from "@/lib/wecom/aibot-bridge"
import { computeSignature, decodeAesKey, decryptMessage, encryptMessage } from "@/lib/wecom/aibot-crypto"

import { fakeDeps } from "../admin-ai/server/fakes"

// 위컴 지능형 로봇 수신구 — 가짜 조율기·가짜 저장소. 위컴 쪽 주소로는 아무것도 보내지 않는다(sendResponseMarkdown 가짜).
const AES = "jWmYm7qr5nMoAUwZRjGtBxmz3KA1tkAj3ykkR6q2B2C"
const KEY = decodeAesKey(AES)
const TOKEN = "tok-sample"
const BOT = "bot-1"
const RESPONSE_URL = "https://qyapi.weixin.qq.com/cgi-bin/aibot/response?code=sample"

const hoisted = vi.hoisted(() => ({
  registered: [] as Array<() => Promise<unknown>>,
  store: null as TicketClaimStore | null,
  collect: null as null | ((text: string) => Promise<{ blocks: AiBlock[] }>),
  sendResponseMarkdown: vi.fn<(...args: unknown[]) => Promise<{ ok: boolean; status: number }>>(async () => ({ ok: true, status: 200 })),
  rateAllowed: true,
}))

vi.mock("next/server", async (importActual) => {
  const actual = await importActual<typeof import("next/server")>()
  return { ...actual, after: (task: () => Promise<unknown>) => void hoisted.registered.push(task) }
})

vi.mock("@/lib/server/rate-limit", () => ({
  getClientIp: () => "203.0.113.1",
  checkRateLimitDistributed: async () => ({ allowed: hoisted.rateAllowed, remaining: 1, resetAt: Date.now() + 1000 }),
}))

vi.mock("@/lib/wecom/aibot-server", () => ({
  getWecomDedupStore: () => hoisted.store,
  sendResponseMarkdown: hoisted.sendResponseMarkdown,
  buildWecomBridgeDeps: (): BridgeDeps => ({
    userMap: new Map([["wx-staff-1", "staff1@example.test"]]),
    lookupAdmin: async () => ({ ok: true, admin: { source: "supabase", role: "ADMIN", name: "스태프(샘플)", userId: "user-1", capabilities: [] } }),
    orchestratorDeps: () => fakeDeps().deps,
    collectTurn: async (input) => ({ ...(await hoisted.collect!(input.text)), orders: [] }),
    siteUrl: "https://example.test",
    now: Date.now,
  }),
}))

import { GET, INLINE_BUDGET_MS, PENDING_TEXT, POST } from "@/app/api/webhook/wecom-aibot/route"

const ORIGINAL_ENV = { ...process.env }
const URL_BASE = "https://example.test/api/webhook/wecom-aibot"

function sign(encrypt: string, timestamp = String(Math.floor(Date.now() / 1000)), nonce = "n-1") {
  return { timestamp, nonce, signature: computeSignature(TOKEN, timestamp, nonce, encrypt) }
}

function postRequest(payload: Record<string, unknown>, options: { timestamp?: string; forge?: boolean } = {}) {
  const encrypt = encryptMessage(JSON.stringify(payload), KEY, "")
  const { timestamp, nonce, signature } = sign(encrypt, options.timestamp)
  const query = new URLSearchParams({ msg_signature: options.forge ? "0".repeat(40) : signature, timestamp, nonce })
  return new NextRequest(`${URL_BASE}?${query}`, { method: "POST", body: JSON.stringify({ encrypt }), headers: { "content-type": "application/json" } })
}

function textMessage(overrides: Record<string, unknown> = {}) {
  return {
    msgid: `m-${Math.random().toString(36).slice(2)}`,
    aibotid: BOT,
    chattype: "single",
    from: { userid: "wx-staff-1" },
    response_url: RESPONSE_URL,
    msgtype: "text",
    text: { content: "@갈매봇 수업 녹화는 어떻게 해?" },
    ...overrides,
  }
}

async function replyContent(response: Response): Promise<{ msgtype: string; stream: { id: string; finish: boolean; content: string } }> {
  const envelope = (await response.json()) as { encrypt: string; msgsignature: string; timestamp: number; nonce: string }
  expect(envelope.msgsignature).toBe(computeSignature(TOKEN, String(envelope.timestamp), envelope.nonce, envelope.encrypt))
  return JSON.parse(decryptMessage(envelope.encrypt, KEY, ""))
}

beforeEach(() => {
  hoisted.registered.length = 0
  hoisted.store = createMemoryClaimStore()
  hoisted.rateAllowed = true
  hoisted.sendResponseMarkdown.mockClear()
  hoisted.collect = async (text) => ({ blocks: [{ kind: "text", text: `답: ${text}` }] })
  process.env.WECOM_AIBOT_TOKEN = TOKEN
  process.env.WECOM_AIBOT_ENCODING_AES_KEY = AES
  process.env.WECOM_AIBOT_ID = BOT
  process.env.WECOM_AIBOT_USER_MAP = '{"wx-staff-1":"staff1@example.test"}'
  vi.spyOn(console, "info").mockImplementation(() => undefined)
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("스위치", () => {
  it("환경변수가 하나라도 없으면 GET·POST 모두 404", async () => {
    for (const name of ["WECOM_AIBOT_TOKEN", "WECOM_AIBOT_ENCODING_AES_KEY", "WECOM_AIBOT_ID", "WECOM_AIBOT_USER_MAP"]) {
      const saved = process.env[name]
      delete process.env[name]
      expect((await POST(postRequest(textMessage()))).status, name).toBe(404)
      expect((await GET(new NextRequest(`${URL_BASE}?msg_signature=a&timestamp=1&nonce=n&echostr=e`))).status, name).toBe(404)
      process.env[name] = saved
    }
  })

  it("중복 제거 저장소가 없으면(운영에서 Upstash 없음) 열지 않는다 — 404", async () => {
    hoisted.store = null
    expect((await POST(postRequest(textMessage()))).status).toBe(404)
  })
})

describe("URL 검증 GET", () => {
  it("서명이 맞으면 echostr 을 풀어 평문만(따옴표·줄바꿈 없이) 돌려준다 — 쿼리의 + 가 공백으로 풀려도 맞춘다", async () => {
    const echostr = encryptMessage("1616140317555161061", KEY, "")
    const { timestamp, nonce, signature } = sign(echostr)
    // URL 인코딩 없이 + 를 그대로 둔 쿼리(위컴이 어떻게 보내든 맞춘다)
    const res = await GET(new NextRequest(`${URL_BASE}?msg_signature=${signature}&timestamp=${timestamp}&nonce=${nonce}&echostr=${echostr}`))
    expect(res.status).toBe(200)
    expect(await res.text()).toBe("1616140317555161061")
    expect(res.headers.get("content-type")).toContain("text/plain")
  })

  it("서명 위조·시각 창 밖은 401", async () => {
    const echostr = encryptMessage("x", KEY, "")
    const ok = sign(echostr)
    const forged = new URLSearchParams({ msg_signature: "f".repeat(40), timestamp: ok.timestamp, nonce: ok.nonce, echostr })
    expect((await GET(new NextRequest(`${URL_BASE}?${forged}`))).status).toBe(401)
    const old = sign(echostr, String(Math.floor(Date.now() / 1000) - 3600))
    const stale = new URLSearchParams({ msg_signature: old.signature, timestamp: old.timestamp, nonce: old.nonce, echostr })
    expect((await GET(new NextRequest(`${URL_BASE}?${stale}`))).status).toBe(401)
  })
})

describe("수신 POST", () => {
  it("정상 글 — 암호화된 스트림 답(finish true)으로 바로 답하고, 응답 뒤 작업은 없다", async () => {
    const res = await POST(postRequest(textMessage()))
    expect(res.status).toBe(200)
    const reply = await replyContent(res)
    expect(reply.msgtype).toBe("stream")
    expect(reply.stream.finish).toBe(true)
    expect(reply.stream.content).toBe("답: 수업 녹화는 어떻게 해?")
    expect(hoisted.registered).toHaveLength(0)
    expect(hoisted.sendResponseMarkdown).not.toHaveBeenCalled()
  })

  it("서명 위조는 401, 시각 창(±5분) 밖은 401 — 조율기를 부르지 않는다", async () => {
    const collect = vi.fn(hoisted.collect!)
    hoisted.collect = collect
    expect((await POST(postRequest(textMessage(), { forge: true }))).status).toBe(401)
    expect((await POST(postRequest(textMessage(), { timestamp: String(Math.floor(Date.now() / 1000) - 301) }))).status).toBe(401)
    expect(collect).not.toHaveBeenCalled()
  })

  it("같은 msgid 재전송은 한 번만 처리한다(두 번째는 빈 200)", async () => {
    const collect = vi.fn(hoisted.collect!)
    hoisted.collect = collect
    const payload = textMessage({ msgid: "same-msg" })
    expect((await POST(postRequest(payload))).status).toBe(200)
    const second = await POST(postRequest(payload))
    expect(second.status).toBe(200)
    expect(await second.text()).toBe("")
    expect(collect).toHaveBeenCalledTimes(1)
  })

  it("저장소 오류면 처리하지 않고 503(닫힘)", async () => {
    hoisted.store = { kind: "distributed", claim: async () => Promise.reject(new Error("down")) }
    expect((await POST(postRequest(textMessage()))).status).toBe(503)
  })

  it("연결표에 없는 사람 — 자료 없이 안내 한 줄", async () => {
    const collect = vi.fn(hoisted.collect!)
    hoisted.collect = collect
    const reply = await replyContent(await POST(postRequest(textMessage({ from: { userid: "wx-unknown" } }))))
    expect(reply.stream.content).toBe("연결되지 않은 계정입니다 — 어드민에서 써 주세요.")
    expect(collect).not.toHaveBeenCalled()
  })

  it("다른 로봇 id·스트림 새로고침은 빈 200, 크기 상한 넘으면 413, 잘못된 본문은 400", async () => {
    expect(await (await POST(postRequest(textMessage({ aibotid: "other-bot" })))).text()).toBe("")
    expect(await (await POST(postRequest({ ...textMessage(), msgtype: "stream", stream: { id: "s-1" } }))).text()).toBe("")
    const big = new NextRequest(`${URL_BASE}?msg_signature=a&timestamp=1&nonce=n`, { method: "POST", body: "x".repeat(600 * 1024) })
    expect((await POST(big)).status).toBe(413)
    const { timestamp, nonce } = sign("x")
    const bad = new NextRequest(`${URL_BASE}?msg_signature=a&timestamp=${timestamp}&nonce=${nonce}`, { method: "POST", body: "not json" })
    expect((await POST(bad)).status).toBe(400)
  })

  it("요청 제한을 넘으면 처리하지 않는다(429)", async () => {
    hoisted.rateAllowed = false
    expect((await POST(postRequest(textMessage()))).status).toBe(429)
  })

  it("허용 단체방 목록이 있으면 그 밖의 단체방 글은 답하지 않는다", async () => {
    process.env.WECOM_AIBOT_ALLOWED_CHATIDS = "room-allowed"
    const outside = await POST(postRequest(textMessage({ chattype: "group", chatid: "room-other" })))
    expect(await outside.text()).toBe("")
    const inside = await replyContent(await POST(postRequest(textMessage({ chattype: "group", chatid: "room-allowed" }))))
    expect(inside.stream.content).toContain("답:")
  })

  it("긴 답 — \"확인 중\" 스트림으로 먼저 답하고, after 는 응답을 돌려주기 전에 등록되며 응답 뒤에 response_url 로 한 번 보낸다", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    let finish: () => void = () => undefined
    hoisted.collect = (text) => new Promise((resolve) => (finish = () => resolve({ blocks: [{ kind: "text", text: `늦은 답: ${text}` }] })))
    const pending = POST(postRequest(textMessage()))
    await vi.advanceTimersByTimeAsync(INLINE_BUDGET_MS + 10)
    const res = await pending
    // 응답을 돌려준 시점에 이미 등록돼 있어야 한다.
    expect(hoisted.registered).toHaveLength(1)
    expect(hoisted.sendResponseMarkdown).not.toHaveBeenCalled()
    expect((await replyContent(res)).stream.content).toBe(PENDING_TEXT)

    finish()
    await hoisted.registered[0]()
    expect(hoisted.sendResponseMarkdown).toHaveBeenCalledTimes(1)
    expect(hoisted.sendResponseMarkdown.mock.calls[0]).toEqual([RESPONSE_URL, "늦은 답: 수업 녹화는 어떻게 해?"])
  })

  it("로그에는 글 내용·userid 원문을 싣지 않는다", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined)
    await POST(postRequest(textMessage()))
    const lines = info.mock.calls.map((call) => String(call[0])).join("\n")
    expect(lines).toContain("[wecom-aibot] answered")
    expect(lines).not.toContain("wx-staff-1")
    expect(lines).not.toContain("녹화")
    // 소금 없는 sha256 이면 userid 목록으로 되짚을 수 있다 — 로그 키는 비밀 열쇠를 섞은 HMAC 이다.
    expect(lines).not.toContain(createHash("sha256").update("wx-staff-1").digest("hex").slice(0, 12))
    expect(lines).toMatch(/user=[0-9a-f]{12}/)
  })
})
