import { createHmac } from "crypto"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { fetchMetaLeadDetail } from "@/lib/meta/lead-ads-graph"

import { GOLDEN_GRAPH_FIELDS } from "./fixtures/lead-ads-golden-cases"

// 옮긴 Graph 조회를 직접 부른다. 시크릿·토큰은 가짜 값이다.
// 라우트 경계 골든이 닿지 못하는 경로(시크릿 없음 → appsecret_proof 없음)도 여기서 잠근다.

describe("lib/meta/lead-ads-graph fetchMetaLeadDetail (직접 호출)", () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.stubEnv("META_APP_SECRET", "graph-fake-secret")
    vi.stubEnv("META_PAGE_ACCESS_TOKEN", "graph-fake-token")
    vi.stubEnv("META_ACCESS_TOKEN", "")
    vi.stubEnv("META_CAPI_ACCESS_TOKEN", "")
    vi.stubEnv("META_GRAPH_API_VERSION", "")
    fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ id: "940000000000001", field_data: [] }),
      text: async () => "",
    }))
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it("URL·헤더·appsecret_proof 를 붙여 부르고 JSON 을 그대로 돌려준다", async () => {
    await expect(fetchMetaLeadDetail("940000000000001")).resolves.toEqual({
      id: "940000000000001",
      field_data: [],
    })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit]
    const proof = createHmac("sha256", "graph-fake-secret").update("graph-fake-token").digest("hex")
    expect(String(url)).toBe(
      `https://graph.facebook.com/v25.0/940000000000001?fields=${encodeURIComponent(GOLDEN_GRAPH_FIELDS)}&appsecret_proof=${proof}`
    )
    expect(init).toStrictEqual({
      headers: { Authorization: "Bearer graph-fake-token" },
      cache: "no-store",
    })
  })

  it("앱 시크릿이 없으면 appsecret_proof 를 붙이지 않는다", async () => {
    vi.stubEnv("META_APP_SECRET", "")
    await fetchMetaLeadDetail("940000000000002")
    const [url] = fetchMock.mock.calls[0] as unknown as [URL]
    expect(String(url)).toBe(
      `https://graph.facebook.com/v25.0/940000000000002?fields=${encodeURIComponent(GOLDEN_GRAPH_FIELDS)}`
    )
  })

  it("토큰이 없으면 부르지 않고 던진다", async () => {
    vi.stubEnv("META_PAGE_ACCESS_TOKEN", "")
    await expect(fetchMetaLeadDetail("940000000000003")).rejects.toThrow(
      "META_PAGE_ACCESS_TOKEN or META_ACCESS_TOKEN is required."
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("실패 응답은 상태와 본문을 담아 던진다", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({}),
      text: async () => "invalid leadgen",
    })
    await expect(fetchMetaLeadDetail("940000000000004")).rejects.toThrow(
      "Meta lead fetch failed: 400 invalid leadgen"
    )
  })
})
