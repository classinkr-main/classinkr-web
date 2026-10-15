import { createHmac } from "crypto"
import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  GOLDEN_CONSENT_CASES,
  GOLDEN_GRAPH_FIELDS,
  GOLDEN_PAYLOAD_CASES,
  GOLDEN_PAYLOAD_KEY_ORDER,
  type GoldenLeadDetail,
  type GoldenLeadValue,
} from "./fixtures/lead-ads-golden-cases"

// 골든 테스트 — Meta 리드애즈 웹훅이 submitLeadCapture 에 넘기는 payload 와 Graph 상세 조회
// 요청을 **라우트 경계에서** 잠근다(설계 META-RECEIVER-FINAL §4-2 H2).
//
// 빌더·Graph 조회를 route.ts 에서 lib/meta/lead-ads-payload.ts·lead-ads-graph.ts 로 옮기기
// 전에 커밋했고, 옮긴 뒤에도 이 파일은 바뀌지 않아야 한다. 라우트만 부르므로 함수가 어디에
// 있든 같은 결과를 요구한다. 시크릿·토큰은 전부 가짜 값이다.

const { submitLeadCapture } = vi.hoisted(() => ({
  submitLeadCapture: vi.fn(),
}))

vi.mock("@/lib/server/lead-capture", () => ({
  submitLeadCapture,
}))

import { POST } from "@/app/api/meta/webhook/route"

const FAKE_APP_SECRET = "golden-fake-app-secret"
const FAKE_PAGE_TOKEN = "golden-fake-page-token"

type FetchResponder = (leadgenId: string) => {
  ok: boolean
  status: number
  json?: unknown
  text?: string | Error
}

let fetchMock: ReturnType<typeof vi.fn>

function installFetch(responder: FetchResponder) {
  fetchMock = vi.fn(async (input: URL | string) => {
    const url = new URL(String(input))
    const leadgenId = url.pathname.split("/").pop() ?? ""
    const response = responder(leadgenId)
    return {
      ok: response.ok,
      status: response.status,
      json: async () => response.json,
      text: async () => {
        if (response.text instanceof Error) throw response.text
        return response.text ?? ""
      },
    }
  })
  vi.stubGlobal("fetch", fetchMock)
}

function leadgenPayload(values: GoldenLeadValue[], extraChanges: unknown[] = []) {
  return {
    object: "page",
    entry: [
      {
        id: "100000000000001",
        time: 1789000000,
        changes: [
          ...values.map((value) => ({ field: "leadgen", value })),
          ...extraChanges,
        ],
      },
    ],
  }
}

function signedRequest(body: unknown) {
  const rawBody = JSON.stringify(body)
  const signature = `sha256=${createHmac("sha256", FAKE_APP_SECRET).update(rawBody).digest("hex")}`
  return new NextRequest("https://classin.kr/api/meta/webhook", {
    method: "POST",
    body: rawBody,
    headers: { "x-hub-signature-256": signature },
  })
}

function capturedPayloads() {
  return submitLeadCapture.mock.calls.map((call) => call[0] as Record<string, unknown>)
}

function payloadForLeadgen(leadgenId: string) {
  const match = capturedPayloads().find((payload) =>
    String(payload.message).includes(`leadgen_id=${leadgenId}\n`) ||
    String(payload.message).endsWith(`leadgen_id=${leadgenId}`)
  )
  if (!match) throw new Error(`no captured payload for ${leadgenId}`)
  return match
}

describe("Meta 리드애즈 웹훅 payload 골든 (라우트 경계)", () => {
  beforeEach(() => {
    submitLeadCapture.mockReset()
    submitLeadCapture.mockResolvedValue({
      status: 200,
      body: { ok: true, stored: true, warnings: [], leadId: "lead-golden" },
    })
    vi.stubEnv("META_APP_SECRET", FAKE_APP_SECRET)
    vi.stubEnv("META_PAGE_ACCESS_TOKEN", FAKE_PAGE_TOKEN)
    vi.stubEnv("META_ACCESS_TOKEN", "")
    vi.stubEnv("META_CAPI_ACCESS_TOKEN", "")
    vi.stubEnv("META_GRAPH_API_VERSION", "")
    // 기존 admin 수신 경로의 Graph·payload 계약만 녹화한다. 모드 전환은 별도 라우트 테스트 대상이다.
    vi.stubEnv("META_LEADGEN_FORCE_ADMIN", "1")
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  for (const goldenCase of GOLDEN_PAYLOAD_CASES) {
    it(`payload: ${goldenCase.id}`, async () => {
      installFetch(() =>
        goldenCase.detail
          ? { ok: true, status: 200, json: goldenCase.detail }
          : { ok: false, status: 500, text: "golden upstream down" }
      )

      const response = await POST(signedRequest(leadgenPayload([goldenCase.value])))

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({
        ok: true,
        received: 1,
        processed: 1,
        failed: 0,
      })
      expect(submitLeadCapture).toHaveBeenCalledTimes(1)
      expect(submitLeadCapture.mock.calls[0]).toHaveLength(1)

      const payload = capturedPayloads()[0]
      expect(payload).toStrictEqual(goldenCase.expected)
      expect(Object.keys(payload)).toEqual([...GOLDEN_PAYLOAD_KEY_ORDER])
    })
  }

  it("payload: 동의 판정 표", async () => {
    const values = GOLDEN_CONSENT_CASES.map((_, index) => ({
      leadgen_id: `91000000000000${String(index).padStart(2, "0")}`,
      page_id: "100000000000001",
      form_id: "200000000000010",
    }))
    installFetch((leadgenId) => {
      const index = values.findIndex((value) => value.leadgen_id === leadgenId)
      const consentCase = GOLDEN_CONSENT_CASES[index]
      const detail: GoldenLeadDetail = {
        id: leadgenId,
        field_data: [
          { name: "email", values: [`consent${index}@example.com`] },
          { name: consentCase.key, values: [consentCase.value] },
        ],
      }
      return { ok: true, status: 200, json: detail }
    })

    const response = await POST(signedRequest(leadgenPayload(values)))
    await expect(response.json()).resolves.toEqual({
      ok: true,
      received: GOLDEN_CONSENT_CASES.length,
      processed: GOLDEN_CONSENT_CASES.length,
      failed: 0,
    })

    const actual = values.map((value) => payloadForLeadgen(value.leadgen_id).marketingConsent)
    expect(actual).toEqual(GOLDEN_CONSENT_CASES.map((consentCase) => consentCase.expected))
  })

  it("payload: 토큰이 없으면 상세 없이(detail=undefined) 저장을 시도한다", async () => {
    vi.stubEnv("META_PAGE_ACCESS_TOKEN", "")
    installFetch(() => ({ ok: true, status: 200, json: {} }))
    const detailUndefined = GOLDEN_PAYLOAD_CASES.find((c) => c.id === "detail_undefined")!

    const response = await POST(signedRequest(leadgenPayload([detailUndefined.value])))

    expect(response.status).toBe(200)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(capturedPayloads()[0]).toStrictEqual(detailUndefined.expected)
    expect(console.error).toHaveBeenCalledWith(
      "[meta/webhook] lead detail fetch failed:",
      new Error("META_PAGE_ACCESS_TOKEN or META_ACCESS_TOKEN is required.")
    )
  })

  it("Graph: 상세 조회 요청 URL·헤더·appsecret_proof", async () => {
    const standard = GOLDEN_PAYLOAD_CASES[0]
    installFetch(() => ({ ok: true, status: 200, json: standard.detail }))

    await POST(signedRequest(leadgenPayload([standard.value])))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBeInstanceOf(URL)
    const expectedProof = createHmac("sha256", FAKE_APP_SECRET).update(FAKE_PAGE_TOKEN).digest("hex")
    expect(String(url)).toBe(
      `https://graph.facebook.com/v25.0/900000000000001?fields=${encodeURIComponent(GOLDEN_GRAPH_FIELDS)}&appsecret_proof=${expectedProof}`
    )
    expect(init).toStrictEqual({
      headers: { Authorization: `Bearer ${FAKE_PAGE_TOKEN}` },
      cache: "no-store",
    })
  })

  it("Graph: 토큰 우선순위(PAGE > ACCESS > CAPI)와 API 버전 env(trim)", async () => {
    const standard = GOLDEN_PAYLOAD_CASES[0]
    installFetch(() => ({ ok: true, status: 200, json: standard.detail }))
    vi.stubEnv("META_PAGE_ACCESS_TOKEN", "   ")
    vi.stubEnv("META_ACCESS_TOKEN", " golden-fake-access-token ")
    vi.stubEnv("META_CAPI_ACCESS_TOKEN", "golden-fake-capi-token")
    vi.stubEnv("META_GRAPH_API_VERSION", " v24.0 ")

    await POST(signedRequest(leadgenPayload([standard.value])))

    const [url, init] = fetchMock.mock.calls[0]
    const expectedProof = createHmac("sha256", FAKE_APP_SECRET)
      .update("golden-fake-access-token")
      .digest("hex")
    expect(String(url)).toBe(
      `https://graph.facebook.com/v24.0/900000000000001?fields=${encodeURIComponent(GOLDEN_GRAPH_FIELDS)}&appsecret_proof=${expectedProof}`
    )
    expect(init).toStrictEqual({
      headers: { Authorization: "Bearer golden-fake-access-token" },
      cache: "no-store",
    })

    fetchMock.mockClear()
    vi.stubEnv("META_ACCESS_TOKEN", "")
    await POST(signedRequest(leadgenPayload([standard.value])))
    expect(fetchMock.mock.calls[0][1]).toStrictEqual({
      headers: { Authorization: "Bearer golden-fake-capi-token" },
      cache: "no-store",
    })
  })

  it("Graph: 실패 응답은 상태·본문을 담아 던지고, 본문 읽기 실패는 빈 문자열이다", async () => {
    const detailUndefined = GOLDEN_PAYLOAD_CASES.find((c) => c.id === "detail_undefined")!
    installFetch(() => ({ ok: false, status: 500, text: "golden upstream down" }))
    await POST(signedRequest(leadgenPayload([detailUndefined.value])))
    expect(console.error).toHaveBeenLastCalledWith(
      "[meta/webhook] lead detail fetch failed:",
      new Error("Meta lead fetch failed: 500 golden upstream down")
    )

    installFetch(() => ({ ok: false, status: 403, text: new Error("body stream broken") }))
    await POST(signedRequest(leadgenPayload([detailUndefined.value])))
    expect(console.error).toHaveBeenLastCalledWith(
      "[meta/webhook] lead detail fetch failed:",
      new Error("Meta lead fetch failed: 403 ")
    )
    expect(capturedPayloads()).toHaveLength(2)
    for (const payload of capturedPayloads()) {
      expect(payload).toStrictEqual(detailUndefined.expected)
    }
  })

  it("extractLeadValues: leadgen 필드이면서 leadgen_id 가 있는 변경만, 순서대로 받는다", async () => {
    const standard = GOLDEN_PAYLOAD_CASES[0]
    installFetch(() => ({ ok: true, status: 200, json: standard.detail }))
    const body = {
      object: "page",
      entry: [
        {
          id: "100000000000001",
          changes: [
            { field: "feed", value: { leadgen_id: "920000000000001" } },
            { field: "leadgen", value: { page_id: "100000000000001" } },
            { field: "leadgen", value: { leadgen_id: "920000000000002" } },
            { field: "leadgen" },
          ],
        },
        { id: "100000000000002" },
        {
          id: "100000000000003",
          changes: [{ field: "leadgen", value: { leadgen_id: "920000000000003" } }],
        },
      ],
    }

    const response = await POST(signedRequest(body))

    await expect(response.json()).resolves.toEqual({
      ok: true,
      received: 2,
      processed: 2,
      failed: 0,
    })
    expect(fetchMock.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual([
      "/v25.0/920000000000002",
      "/v25.0/920000000000003",
    ])
  })

  it("응답: submitLeadCapture 가 400 이상이거나 던지면 failed 로 센다", async () => {
    installFetch((leadgenId) => ({ ok: true, status: 200, json: { id: leadgenId } }))
    submitLeadCapture
      .mockResolvedValueOnce({ status: 200, body: { ok: true, stored: true, warnings: [] } })
      .mockResolvedValueOnce({ status: 502, body: { ok: false, error: "저장 실패" } })
      .mockRejectedValueOnce(new Error("boom"))

    const response = await POST(
      signedRequest(
        leadgenPayload([
          { leadgen_id: "930000000000001" },
          { leadgen_id: "930000000000002" },
          { leadgen_id: "930000000000003" },
        ])
      )
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      received: 3,
      processed: 1,
      failed: 2,
    })
  })
})
