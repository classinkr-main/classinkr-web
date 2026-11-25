import { describe, expect, it, vi } from "vitest"

const hoisted = vi.hoisted(() => ({ postJson: vi.fn<(...args: unknown[]) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> }>>(async () => ({ ok: true, status: 200, json: async () => ({ errcode: 0 }), text: async () => "" })) }))

vi.mock("@/lib/admin-ai/server/deps", () => ({ buildServerOrchestratorDeps: () => ({}), serverOpsDeps: {} }))
vi.mock("@/lib/wecom/aibot-accounts", () => ({ lookupAdminByEmail: async () => ({ ok: false, reason: "not_found" }) }))
vi.mock("@/lib/server/post-json", () => ({ postJson: hoisted.postJson }))

import { getWecomDedupStore, isWecomResponseUrl, sendResponseMarkdown } from "@/lib/wecom/aibot-server"

// 저장소 판정은 갈매봇 확인표(ticket-claims.ts)와 같다 — 운영·미리보기·자체 호스팅에서 Upstash 가 없으면 null(수신을 열지 않는다).
describe("msgid 중복 제거 저장소", () => {
  it("Upstash 가 있으면 분산 저장소", () => {
    expect(getWecomDedupStore({ UPSTASH_REDIS_REST_URL: "https://upstash.example.test", UPSTASH_REDIS_REST_TOKEN: "t", NODE_ENV: "production" })?.kind).toBe("distributed")
  })

  it("없으면 로컬 개발·시험만 메모리, 운영·미리보기·값 없음은 null", () => {
    expect(getWecomDedupStore({ NODE_ENV: "test" })?.kind).toBe("memory")
    expect(getWecomDedupStore({ NODE_ENV: "development" })?.kind).toBe("memory")
    expect(getWecomDedupStore({ NODE_ENV: "production" })).toBeNull()
    expect(getWecomDedupStore({ NODE_ENV: "development", VERCEL_ENV: "preview" })).toBeNull()
    expect(getWecomDedupStore({})).toBeNull()
  })

  it("Upstash 쓰기는 SET NX PX 로 msgid 키 앞머리를 따로 쓴다", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ result: "OK" }), { status: 200 }))
    const store = getWecomDedupStore({ UPSTASH_REDIS_REST_URL: "https://upstash.example.test", UPSTASH_REDIS_REST_TOKEN: "t" })!
    expect(await store.claim("abc")).toBe("claimed")
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body))
    expect(body.slice(0, 2)).toEqual(["SET", "wecom-aibot:msg:abc"])
    expect(body).toContain("NX")
    fetcher.mockRestore()
  })
})

describe("response_url 보내기", () => {
  it("https 이고 weixin.qq.com 아래 주소만", () => {
    expect(isWecomResponseUrl("https://qyapi.weixin.qq.com/cgi-bin/x")).toBe(true)
    expect(isWecomResponseUrl("http://qyapi.weixin.qq.com/cgi-bin/x")).toBe(false)
    expect(isWecomResponseUrl("https://weixin.qq.com.evil.test/x")).toBe(false)
    expect(isWecomResponseUrl("not a url")).toBe(false)
  })

  it("markdown 한 번 — 다른 주소면 보내지 않는다", async () => {
    expect(await sendResponseMarkdown("https://evil.test/x", "hi")).toEqual({ ok: false, status: null })
    expect(hoisted.postJson).not.toHaveBeenCalled()
    expect((await sendResponseMarkdown("https://qyapi.weixin.qq.com/cgi-bin/x", "hi")).ok).toBe(true)
    expect(hoisted.postJson.mock.calls[0][1]).toEqual({ msgtype: "markdown", markdown: { content: "hi" } })
  })
})
